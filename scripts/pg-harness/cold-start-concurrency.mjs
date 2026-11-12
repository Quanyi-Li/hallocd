/**
 * 冷启动并发测试 —— 模拟 Vercel 全新部署。
 * ==================================================================
 * 场景：数据库是空的（schema 未建），多个路由 bundle 同时收到首个请求。
 * 每一个 bundle 都会各自跑一遍 schema 自初始化 —— 若无重试保护，
 * Postgres 的并发建表竞态会让其中某个请求 500。
 *
 * 期望：所有请求都非 500；7 张表建好；数据写入成功。
 */

const BASE = process.argv[2] || "http://localhost:3001";
const results = [];

/**
 * 记录一次请求的结果。
 * expect 声明「这次请求本来就该是这个状态码」——
 * 冷启动测试要打的是「不存在的用户」「不存在的 token」「没带 key 的 agent 接口」，
 * 它们返回 4xx 是**正确行为**，不能算异常。
 */
function record(name, status, extra, expect) {
  results.push({ name, status, extra, expect: expect ?? [200, 201] });
}

async function register(i) {
  const handle = `cold${i}${Date.now().toString(36).slice(-4)}`;
  const email = `${handle}@cold.test`;
  const r = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      handle,
      email,
      password: "Probe-Pass-2026",
    }),
  });
  const body = await r.json().catch(() => ({}));
  record(`register ${handle}`, r.status, body?.user?.id);
  return { handle, email };
}

async function login(email) {
  // 注意：登录用的是 email，不是 handle
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "Probe-Pass-2026" }),
  });
  record(`login ${email}`, r.status);
}

async function upload(i) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
      type: "image/png",
    }),
    `cold-${i}.png`,
  );
  const r = await fetch(`${BASE}/api/uploads`, { method: "POST", body: form });
  const body = await r.json().catch(() => ({}));
  record(`upload #${i}`, r.status, body?.upload?.id);
}

async function profile(handle) {
  const r = await fetch(`${BASE}/u/${handle}`);
  record(`profile /u/${handle}`, r.status, undefined, [404]);
}

async function gift(token) {
  const r = await fetch(`${BASE}/r/${token}`);
  record(`gift /r/${token}`, r.status, undefined, [404]);
}

async function templates() {
  const r = await fetch(`${BASE}/api/templates`);
  record("templates", r.status);
}

async function agentCatalog() {
  // agent 接口要鉴权 —— 这里故意不带 key，401 才是预期行为
  const r = await fetch(`${BASE}/api/agent/v1/catalog`);
  record("agent catalog", r.status, undefined, [401]);
}

console.log("=".repeat(64));
console.log(`冷启动并发测试 → ${BASE}`);
console.log("=".repeat(64));
console.log();

// 先注册一个用户（用于后续 login / profile），但**不等**它跑完 schema，
// 而是一起并发打出去 —— 这才是真实的冷启动竞态窗口。
const tasks = [];
for (let i = 0; i < 6; i++) tasks.push(register(i));
for (let i = 0; i < 4; i++) tasks.push(upload(i));
for (let i = 0; i < 4; i++) tasks.push(profile(`nobody-${i}`));
for (let i = 0; i < 4; i++) tasks.push(gift(`badtoken-${i}`));
for (let i = 0; i < 3; i++) tasks.push(templates());
for (let i = 0; i < 3; i++) tasks.push(agentCatalog());

const created = await Promise.all(tasks);
console.log("并发请求数:", results.length);
console.log();

// 拿到注册出来的账号，再补一轮 login（此时 schema 已就绪）
const accounts = created.filter((c) => c?.email).map((c) => c.email);
await Promise.all(accounts.slice(0, 3).map(login));

console.log("--- 各请求状态 ---");
for (const r of results.sort((a, b) => a.name.localeCompare(b.name))) {
  const mark =
    r.status >= 500
      ? "FAIL"
      : r.expect.includes(r.status)
        ? "ok"
        : "  (状态不符预期)";
  console.log(`  ${String(r.status).padEnd(4)} ${mark.padEnd(16)} ${r.name}`);
}

const serverErrors = results.filter((r) => r.status >= 500);
const unexpected = results.filter((r) => !r.expect.includes(r.status));

console.log();
console.log("=".repeat(64));
if (serverErrors.length) {
  console.log(`✗ 有 ${serverErrors.length} 个 5xx —— 冷启动竞态没被兜住`);
  for (const e of serverErrors) console.log(`    ${e.status} ${e.name}`);
  process.exit(1);
}
console.log(`✓ 无 5xx（共 ${results.length} 个并发请求）`);
console.log(
  "  404 = proxy 守卫（不存在的用户 / token）；401 = agent 接口未带 key（预期）",
);
console.log(
  unexpected.length === 0
    ? "  其余全部成功，且所有状态码都在预期范围内"
    : `  ✗ ${unexpected.length} 个请求的状态码不在预期范围内`,
);
console.log("=".repeat(64));
process.exit(unexpected.length === 0 ? 0 : 1);
