#!/usr/bin/env node
/**
 * halloCD · Agent 接入台 端到端联调脚本
 * ==================================================================
 * 用法：
 *   node scripts/agent-connect-test.mjs
 *   node scripts/agent-connect-test.mjs http://localhost:3000
 *
 * 这个脚本走的是**用户真实的接入路径**，不是管理员捷径：
 *   注册 → 自助签发 key → 用这把 key 调平台接口 → 回来看活动流水 → 吊销
 *
 * 前置：生产服务器已启动（npm run build && npm start）
 *
 * 校验项：
 *   · /agents 页面可达
 *   · 技能包 zip 可下载且是合法 zip
 *   · 导航里有「Agent」入口
 *   · 平台侧的「AI 自动代付」端点确实没了（404）
 *   · 活动端点未登录被拒
 *   · 登录用户能自助签发 key，且 key 绑在自己名下
 *   · agent 用自己的 key 调接口 → 活动被记下来
 *   · 活动流水里出现 catalog.read / order.create
 *   · 汇总数字对得上（调用数、建单数）
 *   · agent 自己也能查活动（Bearer key）
 *   · 活动流水里**不出现 key 本身**
 *   · 吊销 key 之后旧 key 立刻失效
 */

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const API = `${BASE}/api/agent/v1`;

const checks = [];
function check(name, pass, extra = "") {
  checks.push({ name, pass, extra });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${extra ? `  → ${extra}` : ""}`);
}
function section(title) {
  console.log(`\n▸ ${title}`);
}

/* ---------- 极简 cookie jar ---------- */
function makeJar() {
  const jar = new Map();
  return {
    header() {
      return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    absorb(res) {
      const list =
        typeof res.headers.getSetCookie === "function"
          ? res.headers.getSetCookie()
          : [];
      for (const line of list) {
        const [pair] = line.split(";");
        const eq = (pair || "").indexOf("=");
        if (eq < 0) continue;
        const k = pair.slice(0, eq).trim();
        const v = pair.slice(eq + 1).trim();
        if (!v) jar.delete(k);
        else jar.set(k, v);
      }
    },
  };
}

async function req(method, url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.jar) {
    const cookie = options.jar.header();
    if (cookie) headers.Cookie = cookie;
  }
  if (options.body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (options.jar) options.jar.absorb(res);
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* 保留空对象，下面统一判失败 */
  }
  return { status: res.status, data, raw: text, headers: res.headers };
}

const stamp = String(Date.now()).slice(-8);

console.log(`\n▸ 目标：${BASE}`);
console.log(`▸ 说明：走用户真实接入路径（注册 → 自助签 key → 用 → 查 → 吊销）\n`);

/* ================================================================ */
section("站点页面与静态资源");
/* ================================================================ */

const agentsPage = await req("GET", `${BASE}/agents`);
check(
  "/agents 页面可达",
  agentsPage.status === 200,
  `status=${agentsPage.status}`,
);
check(
  "页面里出现「Agent 接入台」标题与核心主张",
  agentsPage.raw.includes("Agent 接入台") &&
    agentsPage.raw.includes("YOUR OWN AGENT") &&
    agentsPage.raw.includes("不在平台上跑 AI"),
  "标题 / 眉标 / 主张都在",
);
check(
  "导航里有 /agents 入口",
  agentsPage.raw.includes('href="/agents"'),
  "",
);

const zipRes = await fetch(`${BASE}/halloCD-agent-skill.zip`);
const zipBuf = Buffer.from(await zipRes.arrayBuffer());
check(
  "技能包 zip 可下载",
  zipRes.status === 200 && zipBuf.length > 1000,
  `status=${zipRes.status} size=${zipBuf.length}`,
);
check(
  "zip 是合法 zip（PK 头）",
  zipBuf[0] === 0x50 && zipBuf[1] === 0x4b,
  zipBuf.slice(0, 2).toString("hex"),
);
check(
  "zip 里的条目名用正斜杠（macOS / Linux 能解开）",
  zipBuf.includes(Buffer.from("halloCD/SKILL.md", "utf8")),
  "",
);

/* 平台 AI 端点必须已经不存在 */
const dead = await req("POST", `${BASE}/api/agent/auto-reply-pay`, {
  body: { receivers: ["妈妈"], scene: "birthday" },
});
check(
  "平台侧「AI 自动代付」端点已删除",
  dead.status === 404,
  `status=${dead.status}`,
);

/* ================================================================ */
section("鉴权边界");
/* ================================================================ */

const anon = await req("GET", `${API}/activity`);
check(
  "未登录查活动被拒",
  anon.status === 401,
  `status=${anon.status}`,
);

/* ================================================================ */
section("用户自助绑定 agent");
/* ================================================================ */

const jar = makeJar();
const handle = `conn${stamp}`;
const reg = await req("POST", `${BASE}/api/auth/register`, {
  jar,
  body: {
    email: `conn-${stamp}@hallocd.test`,
    password: "connect-test-123456",
    handle,
    displayName: "连接测试",
  },
});
check(
  "注册成功并拿到会话",
  reg.status === 200 && reg.data?.success === true,
  `status=${reg.status} ${reg.data?.message || ""}`,
);

const issueRes = await req("POST", `${API}/keys`, {
  jar,
  body: { label: "我的 agent" },
});
const agentKey = issueRes.data?.key;
check(
  "登录用户能自助签发 key",
  issueRes.status === 201 && Boolean(agentKey),
  `status=${issueRes.status}`,
);
check(
  "key 绑在自己用户名下",
  issueRes.data?.boundTo?.handle === handle,
  `boundTo=${JSON.stringify(issueRes.data?.boundTo)}`,
);
check(
  "key 是 hcd_ 前缀",
  typeof agentKey === "string" && agentKey.startsWith("hcd_"),
  String(agentKey).slice(0, 8),
);

const emptyActivity = await req("GET", `${API}/activity`, { jar });
check(
  "刚绑定时活动流水是空的",
  emptyActivity.status === 200 && emptyActivity.data?.activity?.length === 0,
  `count=${emptyActivity.data?.activity?.length}`,
);
check(
  "汇总字段齐全",
  emptyActivity.data?.summary &&
    typeof emptyActivity.data.summary.totalCalls === "number" &&
    typeof emptyActivity.data.summary.spentAmount === "string",
  JSON.stringify(emptyActivity.data?.summary),
);

/* ================================================================ */
section("agent 用自己的 key 调接口");
/* ================================================================ */

const auth = { Authorization: `Bearer ${agentKey}` };

const catalog = await req("GET", `${API}/catalog`, { headers: auth });
check(
  "带 key 能读目录",
  catalog.status === 200 && catalog.data?.success === true,
  `status=${catalog.status}`,
);

const orderRes = await req("POST", `${API}/orders`, {
  headers: auth,
  body: {
    productId: "birthday",
    quantity: 1,
    deliveryDate: "2026-12-24",
    receiver: { name: "妈妈" },
    design: { discColor: "#8B5852", spineText: "MOM" },
    letter: { text: "生日快乐。", inputMode: "type" },
  },
});
const orderId = orderRes.data?.orderId;
check(
  "带 key 能建单拿到报价（不扣款）",
  orderRes.status === 201 && Boolean(orderId),
  `status=${orderRes.status} orderId=${orderId || ""}`,
);
check(
  "订单归属到 key 的主人名下",
  orderRes.data?.owner?.userId === reg.data?.user?.id,
  `owner=${JSON.stringify(orderRes.data?.owner)}`,
);

const badCall = await req("GET", `${API}/orders/not-a-real-order`, {
  headers: auth,
});
check(
  "查一个不存在的订单 → 404（失败调用也会被记）",
  badCall.status === 404,
  `status=${badCall.status}`,
);

/* ================================================================ */
section("活动流水");
/* ================================================================ */

const activity = await req("GET", `${API}/activity`, { jar });
const rows = activity.data?.activity ?? [];
check(
  "活动流水记录到了调用",
  activity.status === 200 && rows.length >= 3,
  `count=${rows.length}`,
);

const actions = new Set(rows.map((r) => r.action));
check(
  "流水里有 catalog.read",
  actions.has("catalog.read"),
  [...actions].join(", "),
);
check(
  "流水里有 order.create",
  actions.has("order.create"),
  [...actions].join(", "),
);

const created = rows.find((r) => r.action === "order.create");
check(
  "建单那条记下了订单号",
  Boolean(created?.orderId) && created.orderId === orderId,
  `orderId=${created?.orderId || "无"}`,
);
check(
  "失败的那次调用也被记下来且标记为失败",
  rows.some((r) => r.ok === false),
  `失败数=${rows.filter((r) => !r.ok).length}`,
);
check(
  "流水里带上了 key 的标签",
  rows.every((r) => typeof r.keyLabel === "string" && r.keyLabel.length > 0),
  rows[0]?.keyLabel || "",
);
check(
  "流水里**不出现 key 本身**",
  !activity.raw.includes(agentKey),
  "未泄露",
);

const summary = activity.data?.summary ?? {};
check(
  "汇总的调用数对得上",
  summary.totalCalls === rows.length,
  `summary=${summary.totalCalls} rows=${rows.length}`,
);
check(
  "汇总的建单数是 1",
  summary.ordersCreated === 1,
  `ordersCreated=${summary.ordersCreated}`,
);
check(
  "汇总的已付金额是 0（还没付款）",
  summary.spentAmount === "0.00",
  `spent=${summary.spentAmount}`,
);
check(
  "汇总带最近活跃时间",
  Boolean(summary.lastActiveAt),
  summary.lastActiveAt || "",
);

/* agent 自己也能查（用 Bearer key，而不是 session） */
const selfView = await req("GET", `${API}/activity`, { headers: auth });
check(
  "agent 用自己的 key 也能查活动",
  selfView.status === 200 && selfView.data?.activity?.length === rows.length,
  `status=${selfView.status} count=${selfView.data?.activity?.length}`,
);

/* ================================================================ */
section("吊销 key");
/* ================================================================ */

const keyList = await req("GET", `${API}/keys`, { jar });
const masked = keyList.data?.keys?.[0]?.masked;
check(
  "列表只给掩码（不给完整 key）",
  Boolean(masked) && masked.includes("…") && !keyList.raw.includes(agentKey),
  `masked=${masked || "无"}`,
);

const revokeRes = await req("DELETE", `${API}/keys`, {
  jar,
  body: { key: String(masked || "").replace("…", "") },
});
check(
  "用掩销能吊销自己的 key（网页按钮的真实路径）",
  revokeRes.status === 200 && revokeRes.data?.success === true,
  `status=${revokeRes.status} ${revokeRes.data?.message || ""}`,
);

const afterRevoke = await req("GET", `${API}/catalog`, { headers: auth });
check(
  "吊销后旧 key 立刻失效",
  afterRevoke.status === 401,
  `status=${afterRevoke.status}`,
);

/* ================================================================ */
const failed = checks.filter((c) => !c.pass);
console.log(`\n${"=".repeat(66)}`);
console.log(`合计 ${checks.length} 项 · 通过 ${checks.length - failed.length} · 失败 ${failed.length}`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL  ${f.name}  → ${f.extra}`);
}
console.log("=".repeat(66));
process.exit(failed.length ? 1 : 0);
