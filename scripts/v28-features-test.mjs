#!/usr/bin/env node
/**
 * halloCD · v2.8 功能端到端联调（GitHub OAuth / DIY 草稿 / 发货通知）
 * ==================================================================
 * 用法：
 *   node scripts/v28-features-test.mjs
 *   node scripts/v28-features-test.mjs http://localhost:3000
 *
 * 前置：
 *   1. .env.local 里配好（本地测试指向两个 mock）：
 *        GITHUB_CLIENT_ID=mock_client_id
 *        GITHUB_CLIENT_SECRET=mock_client_secret
 *        GITHUB_OAUTH_BASE=http://127.0.0.1:3977
 *        GITHUB_API_BASE=http://127.0.0.1:3977
 *        MAIL_API_KEY=mock_mail_key
 *        MAIL_API_BASE=http://127.0.0.1:3978
 *        HALLO_AGENT_API_KEY=...
 *        PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET（发货通知要走真实沙盒支付）
 *   2. 生产服务器已启动：npm run build && npm start
 *
 * 脚本自己起两个 mock（GitHub OAuth + 邮件），跑完自己关掉。
 *
 * 校验项（G18）：
 *   providers 端点报出 GitHub 已启用
 *   发起登录 → 302 到授权页 → 回调 → 建号 → 拿到会话
 *   会话可用（/api/auth/me）
 *   同一个 GitHub 账号再登一次 → 还是同一个账号（不重复建号）
 *   邮箱相同 → 挂到已有账号上（不产生第二个号）
 *   用户名被占 → 自动加后缀
 *   state 被篡改 → 拒绝（CSRF 防护）
 *   缺 code → 拒绝
 *   OAuth 建的账号不能用密码登录
 *
 * 校验项（G17）：
 *   付款 → 自动发出发货通知
 *   邮件内容里有运单号与回礼链接
 *   重复推同一个状态 → 不重复发信（幂等）
 *   推进到 delivered → 再发一封
 *   收件人是站内用户 → 收件人也收到
 *   收件人是站外的人 → 只发下单人
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const GITHUB_MOCK_PORT = Number(process.env.MOCK_GITHUB_PORT || 3977);
const MAIL_MOCK_PORT = Number(process.env.MOCK_MAIL_PORT || 3978);
const GITHUB_MOCK = `http://127.0.0.1:${GITHUB_MOCK_PORT}`;
const MAIL_MOCK = `http://127.0.0.1:${MAIL_MOCK_PORT}`;

/* ---------- 读 .env.local ---------- */
function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  try {
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* 没有 .env.local 也没关系，继续跑 */
  }
}
loadEnvLocal();

const AGENT_KEY = process.env.HALLO_AGENT_API_KEY || "";
const AGENT_AUTH = AGENT_KEY ? { Authorization: `Bearer ${AGENT_KEY}` } : {};

/* ---------- 断言 ---------- */
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
    get(name) {
      return jar.get(name) ?? null;
    },
    clear() {
      jar.clear();
    },
  };
}

/* ---------- 发请求 ---------- */
async function req(method, url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.jar) {
    const cookie = options.jar.header();
    if (cookie) headers.Cookie = cookie;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: options.body,
    redirect: "manual",
  });
  if (options.jar) options.jar.absorb(res);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: res.status, headers: res.headers, text, data };
}

/* ---------- 起 mock ---------- */
function startMock(script, port, label) {
  const child = spawn(process.execPath, [script, `--port=${port}`], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => {
    const s = String(d);
    if (!s.includes("ExperimentalWarning")) process.stderr.write(`[${label}] ${s}`);
  });
  return child;
}

async function waitFor(url, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/* ---------- GitHub OAuth 辅助 ---------- */
async function setGithubProfile(profile) {
  const res = await fetch(`${GITHUB_MOCK}/__mock/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  return res.ok;
}

/**
 * 跑完整条 OAuth 链路，返回每一跳的结果。
 * 手写 redirect: manual —— 这样每一跳都能检查，不能让 fetch 自动吞掉。
 *
 * 注意：state cookie 在回调成功后会被服务端清掉（一次性），
 * 所以要判断「有没有下发 state cookie」必须在**第一跳之后**立刻看。
 */
async function runOAuth(jar, { tamperState = false, omitCode = false } = {}) {
  const start = await req("GET", `${BASE}/api/auth/github`, { jar });
  const stateCookieAfterStart = jar.get("hallocd_oauth_state");
  if (start.status !== 302) {
    return { stage: "start", start, stateCookieAfterStart };
  }
  const authorizeUrl = start.headers.get("location");
  if (!authorizeUrl) return { stage: "authorize-url", start, stateCookieAfterStart };

  const auth = await req("GET", authorizeUrl, { jar });
  if (auth.status !== 302) {
    return { stage: "authorize", auth, start, stateCookieAfterStart };
  }

  let callbackUrl = auth.headers.get("location");
  if (!callbackUrl) return { stage: "callback-url", auth, start, stateCookieAfterStart };

  const cb = new URL(callbackUrl);
  if (tamperState) {
    cb.searchParams.set("state", "tampered-state-value");
  }
  if (omitCode) {
    cb.searchParams.delete("code");
  }

  const cbRes = await req("GET", cb.toString(), { jar });
  return {
    stage: "callback",
    start,
    auth,
    res: cbRes,
    location: cbRes.headers.get("location"),
    stateCookieAfterStart,
  };
}

/* ---------- 注册辅助 ---------- */
async function register(handle, email, password = "hallocd-test-123") {
  const jar = makeJar();
  const res = await req("POST", `${BASE}/api/auth/register`, {
    jar,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle, email, password }),
  });
  return { jar, res };
}

async function mailMessages() {
  const res = await fetch(`${MAIL_MOCK}/__mock/messages`);
  const data = await res.json();
  return data.messages || [];
}

async function resetMail() {
  await fetch(`${MAIL_MOCK}/__mock/reset`, { method: "POST" });
}

/* ================================================================== */

const mocks = [];
let exitCode = 0;

async function main() {
  console.log(`\n▸ 目标站点：${BASE}`);

  /* ---------- 起 mock ---------- */
  mocks.push(
    startMock("scripts/mock-github-oauth.mjs", GITHUB_MOCK_PORT, "github"),
  );
  mocks.push(startMock("scripts/mock-mail-server.mjs", MAIL_MOCK_PORT, "mail"));

  const githubUp = await waitFor(`${GITHUB_MOCK}/__mock/health`);
  const mailUp = await waitFor(`${MAIL_MOCK}/__mock/health`);
  check("mock GitHub OAuth 启动", githubUp);
  check("mock 邮件服务器启动", mailUp);
  if (!githubUp || !mailUp) {
    exitCode = 1;
    return;
  }

  /* ================================================================ */
  section("G18 · GitHub OAuth");
  /* ================================================================ */

  /* GitHub 数字 id 必须**每轮都不一样** ——
     id 是绑定身份的唯一锚点，复用旧 id 会命中上一轮留下的账号，
     测试就变成在测「旧数据」而不是「本次行为」了。 */
  const runId = `gh${Date.now().toString(36)}`;
  const GH_ID_A = `${runId}-a`;
  const GH_ID_B = `${runId}-b`;
  const GH_ID_C = `${runId}-c`;

  const providers = await req("GET", `${BASE}/api/auth/providers`);
  check(
    "/api/auth/providers 报出 GitHub 已启用",
    providers.status === 200 && providers.data?.providers?.github?.enabled === true,
    `status=${providers.status} github=${JSON.stringify(providers.data?.providers?.github)}`,
  );

  /* ---- 首次登录：建号 ---- */
  await setGithubProfile({
    id: GH_ID_A,
    login: "octo-kok",
    name: "Kok",
    email: "octo-kok@github.test",
  });

  const jarA = makeJar();
  const flow1 = await runOAuth(jarA);
  check(
    "发起登录返回 302 到授权页",
    flow1.stage === "callback" && flow1.start.status === 302,
    `stage=${flow1.stage} status=${flow1.start.status}`,
  );
  check(
    "state cookie 已下发",
    Boolean(flow1.stateCookieAfterStart),
    flow1.stateCookieAfterStart ? "有" : "没有",
  );
  check(
    "回调成功后跳到个人主页",
    flow1.stage === "callback" &&
      /\/u\/[^/?#]+/.test(flow1.location || ""),
    flow1.location || "",
  );
  check(
    "会话 cookie 已下发",
    Boolean(jarA.get("hallocd_session")),
  );

  const me1 = await req("GET", `${BASE}/api/auth/me`, { jar: jarA });
  check(
    "会话可用（/api/auth/me 返回 200）",
    me1.status === 200 && me1.data?.success === true,
    `status=${me1.status}`,
  );
  check(
    "账号绑上了 GitHub",
    me1.data?.user?.githubLogin === "octo-kok",
    `githubLogin=${me1.data?.user?.githubLogin}`,
  );
  const userId1 = me1.data?.user?.id;
  const handle1 = me1.data?.user?.handle;

  /* ---- 再登一次：同一个账号 ---- */
  const jarB = makeJar();
  const flow2 = await runOAuth(jarB);
  const me2 = await req("GET", `${BASE}/api/auth/me`, { jar: jarB });
  check(
    "同一个 GitHub 账号再登 → 还是同一个账号（不重复建号）",
    me2.status === 200 && me2.data?.user?.id === userId1,
    `id=${me2.data?.user?.id} vs ${userId1}`,
  );

  /* ---- 邮箱相同 → 挂到已有账号 ---- */
  /* stamp 里带一段随机数 —— 用户名/邮箱都必须是**每轮全新**的，
     否则上一轮留下的账号会被「邮箱相同」「用户名相同」这两条规则先命中，
     测到的就不是本轮想测的那条规则了。 */
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const linkHandle = `linker${stamp.slice(-9)}`;
  const linkEmail = `linker-${stamp}@github.test`;
  const reg = await register(linkHandle, linkEmail);
  check(
    "先注册一个同邮箱的账号",
    reg.res.status === 200 && reg.res.data?.success === true,
    `status=${reg.res.status} ${reg.res.data?.message || ""}`,
  );
  const linkedUserId = reg.res.data?.user?.id;

  await setGithubProfile({
    id: GH_ID_B,
    login: "octo-linker",
    name: "Kok Linker",
    email: linkEmail,
  });
  const jarC = makeJar();
  await runOAuth(jarC);
  const me3 = await req("GET", `${BASE}/api/auth/me`, { jar: jarC });
  check(
    "邮箱相同 → 挂到已有账号（不产生第二个号）",
    me3.status === 200 && me3.data?.user?.id === linkedUserId,
    `id=${me3.data?.user?.id} vs ${linkedUserId}`,
  );

  /* ---- 用户名被占 → 加后缀 ---- */
  /* 邮箱必须是**没被占用过**的 —— 这一轮要测的是「用户名撞车」那条规则，
     如果邮箱也撞了，账号会先被邮箱规则接走，测的就不是同一件事了。 */
  await setGithubProfile({
    id: GH_ID_C,
    login: linkHandle,
    name: "Kok Two",
    email: `kok-two-${stamp}@github.test`,
  });
  const jarD = makeJar();
  await runOAuth(jarD);
  const me4 = await req("GET", `${BASE}/api/auth/me`, { jar: jarD });
  check(
    "GitHub 登录名被占 → 自动加后缀建新号",
    me4.status === 200 &&
      me4.data?.user?.id !== linkedUserId &&
      me4.data?.user?.handle !== linkHandle &&
      me4.data?.user?.handle.startsWith(linkHandle),
    `handle=${me4.data?.user?.handle}`,
  );

  /* ---- CSRF：state 被篡改 ---- */
  const jarE = makeJar();
  const tampered = await runOAuth(jarE, { tamperState: true });
  check(
    "state 被篡改 → 拒绝登录",
    tampered.stage === "callback" &&
      tampered.res.status === 302 &&
      (tampered.location || "").includes("github_error=INVALID_STATE"),
    tampered.location || "",
  );
  const meTampered = await req("GET", `${BASE}/api/auth/me`, { jar: jarE });
  check(
    "state 被篡改 → 没有拿到会话",
    meTampered.status === 401,
    `status=${meTampered.status}`,
  );

  /* ---- 缺 code ---- */
  const jarF = makeJar();
  const noCode = await runOAuth(jarF, { omitCode: true });
  check(
    "缺 code → 拒绝登录",
    noCode.stage === "callback" &&
      noCode.res.status === 302 &&
      (noCode.location || "").includes("github_error=MISSING_CODE"),
    noCode.location || "",
  );

  /* ---- OAuth 账号不能用密码登录 ---- */
  const loginTry = await req("POST", `${BASE}/api/auth/login`, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "octo-kok@github.test", password: "whatever-123" }),
  });
  check(
    "OAuth 建的账号不能用密码登录",
    loginTry.status !== 200 || loginTry.data?.success !== true,
    `status=${loginTry.status}`,
  );

  /* ================================================================ */
  section("G17 · 发货通知");
  /* ================================================================ */

  await resetMail();

  /* 下单人（有邮箱） */
  const senderHandle = `sender${stamp.slice(-5)}`;
  const sender = await register(senderHandle, `sender-${stamp}@hallocd.test`);
  check(
    "下单人注册成功",
    sender.res.status === 200 && sender.res.data?.success === true,
    `status=${sender.res.status} ${sender.res.data?.message || ""}`,
  );

  /* 收件人（站内用户，有邮箱） */
  const receiverHandle = `recv${stamp.slice(-5)}`;
  const receiver = await register(receiverHandle, `recv-${stamp}@hallocd.test`);
  check(
    "收件人注册成功",
    receiver.res.status === 200 && receiver.res.data?.success === true,
    `status=${receiver.res.status} ${receiver.res.data?.message || ""}`,
  );

  /* 给下单人签一把自己的 agent key —— 这才是真实的接入路径：
     用户的 agent 用自己的 key 调平台接口，订单自然归到 TA 名下。
     【v2.9】平台侧那个「AI 自动代付」端点已删除，这里走的是
     「建单拿报价 → 用户确认 → 付款」的真实链路。 */
  const keyRes = await req("POST", `${BASE}/api/agent/v1/keys`, {
    jar: sender.jar,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: "v28 测试 agent" }),
  });
  check(
    "登录用户能自助签发 agent key",
    keyRes.status === 201 && Boolean(keyRes.data?.key),
    `status=${keyRes.status}`,
  );
  const senderAuth = keyRes.data?.key
    ? { Authorization: `Bearer ${keyRes.data.key}` }
    : {};

  /* 下单（走真实沙盒支付 —— 这一步同时验证了支付后的自动通知） */
  const quoteRes = await req("POST", `${BASE}/api/agent/v1/orders`, {
    headers: { ...senderAuth, "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: "christmas",
      quantity: 1,
      deliveryDate: "2026-12-24",
      receiver: { name: `@${receiverHandle}` },
      design: {
        discColor: "#8B5852",
        spineText: "MOM",
        spineFont: "song",
        spineTheme: "dark",
      },
      letter: { text: "给你刻了一张 CD。", inputMode: "type" },
    }),
  });
  check(
    "agent 用自己的 key 建单拿到报价",
    quoteRes.status === 201 && quoteRes.data?.success === true,
    `status=${quoteRes.status} ${quoteRes.data?.message || ""}`,
  );
  check(
    "订单归属到 key 的主人（用户）名下",
    quoteRes.data?.owner?.userId === sender.res.data?.user?.id,
    `owner=${JSON.stringify(quoteRes.data?.owner)}`,
  );
  check(
    "收件人写成 @handle 也认得出是站内用户",
    quoteRes.data?.owner?.receiverHandle === receiverHandle,
    `receiverHandle=${quoteRes.data?.owner?.receiverHandle}`,
  );

  const orderId = quoteRes.data?.orderId;
  const payRes = orderId
    ? await req("POST", `${BASE}/api/agent/v1/orders/${orderId}/pay`, {
        headers: senderAuth,
      })
    : { status: 0, data: null };
  check(
    "沙盒支付成功",
    payRes.status === 200 && payRes.data?.success === true,
    `status=${payRes.status} ${payRes.data?.message || ""}`,
  );

  const trackingNumber = payRes.data?.shipment?.trackingNumber;
  check(
    "订单落库并拿到订单号",
    Boolean(orderId),
    orderId || "",
  );
  check(
    "响应里报告了发货通知已发出",
    payRes.data?.notification?.sent === true,
    `notification=${JSON.stringify(payRes.data?.notification)}`,
  );

  /* 邮件确实到了 mock 服务器 */
  let mails = await mailMessages();
  check(
    "付款后自动发出发货通知",
    mails.length >= 2,
    `收到 ${mails.length} 封（下单人 + 站内收件人各一封）`,
  );

  const senderMail = mails.find((m) =>
    m.to.includes(sender.res.data?.user?.email),
  );
  const receiverMail = mails.find((m) =>
    m.to.includes(receiver.res.data?.user?.email),
  );
  check("下单人收到了发货通知", Boolean(senderMail));
  check("站内收件人也收到了发货通知", Boolean(receiverMail));

  if (senderMail) {
    check(
      "邮件主题含「已发货」",
      senderMail.subject.includes("已发货"),
      senderMail.subject,
    );
    check(
      "邮件正文含运单号",
      Boolean(trackingNumber) && senderMail.text.includes(trackingNumber),
      `tracking=${trackingNumber}`,
    );
    check(
      "邮件正文含回礼链接",
      senderMail.text.includes("/r/"),
      "",
    );
  }

  /* 幂等：重复推同一个状态 → 不重复发信 */
  if (orderId) {
    const before = (await mailMessages()).length;
    const again = await req("POST", `${BASE}/api/agent/v1/orders/${orderId}/shipment`, {
      headers: { ...AGENT_AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shipped" }),
    });
    const afterSame = (await mailMessages()).length;
    check(
      "重复推同一个状态 → 不重复发信（幂等）",
      again.status === 200 && afterSame === before,
      `before=${before} after=${afterSame} status=${again.status}`,
    );
    check(
      "重复推送的响应里 notification.sent=false",
      again.data?.notification?.sent === false,
      JSON.stringify(again.data?.notification),
    );

    /* 推进到 delivered → 再发一封 */
    const delivered = await req(
      "POST",
      `${BASE}/api/agent/v1/orders/${orderId}/shipment`,
      {
        headers: { ...AGENT_AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "delivered" }),
      },
    );
    mails = await mailMessages();
    check(
      "推进到 delivered → 再发一封",
      delivered.status === 200 && mails.length === before + 2,
      `before=${before} after=${mails.length}`,
    );
    const deliveredMail = mails[mails.length - 1];
    check(
      "送达通知主题含「已送达」",
      Boolean(deliveredMail) && deliveredMail.subject.includes("已送达"),
      deliveredMail?.subject || "",
    );

    /* 非法状态被拒 */
    const bad = await req("POST", `${BASE}/api/agent/v1/orders/${orderId}/shipment`, {
      headers: { ...AGENT_AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "teleported" }),
    });
    check(
      "非法物流状态被拒",
      bad.status === 400 && bad.data?.error === "INVALID_STATUS",
      `status=${bad.status} error=${bad.data?.error}`,
    );
  }

  /* 收件人是站外的人 → 只发下单人 */
  await resetMail();
  const outsideQuote = await req("POST", `${BASE}/api/agent/v1/orders`, {
    headers: { ...senderAuth, "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: "birthday",
      quantity: 1,
      deliveryDate: "2026-12-24",
      receiver: { name: "妈妈" },
      design: { discColor: "#E65100" },
      letter: { text: "生日快乐。", inputMode: "type" },
    }),
  });
  const outsidePay = outsideQuote.data?.orderId
    ? await req("POST", `${BASE}/api/agent/v1/orders/${outsideQuote.data.orderId}/pay`, {
        headers: senderAuth,
      })
    : { status: 0, data: null };
  check(
    "站外收件人的单也能下单并支付",
    outsidePay.status === 200 && outsidePay.data?.success === true,
    `status=${outsidePay.status} ${outsidePay.data?.message || ""}`,
  );
  mails = await mailMessages();
  check(
    "收件人是站外的人 → 只通知下单人",
    mails.length === 1 &&
      mails[0].to.includes(sender.res.data?.user?.email),
    `收到 ${mails.length} 封`,
  );

  /* 订单状态推进后订单里能查到物流状态 */
  if (orderId) {
    const orderRes = await req("GET", `${BASE}/api/agent/v1/orders/${orderId}`, {
      headers: AGENT_AUTH,
    });
    const shipment = orderRes.data?.order?.shipment || {};
    check(
      "订单里记着物流状态与通知结果",
      shipment.status === "delivered" && Boolean(shipment.notification),
      `status=${shipment.status} notified=${Boolean(shipment.notification)}`,
    );
  }

  /* ================================================================ */
  section("汇总");
  /* ================================================================ */
  const failed = checks.filter((c) => !c.pass);
  console.log(
    `\n  ${checks.length - failed.length}/${checks.length} 通过` +
      (failed.length ? ` —— ${failed.length} 条失败` : " —— 全绿"),
  );
  for (const f of failed) console.log(`    FAIL  ${f.name}  ${f.extra}`);

  exitCode = failed.length ? 1 : 0;
}

main()
  .catch((err) => {
    console.error("\n测试脚本异常：", err);
    exitCode = 1;
  })
  .finally(() => {
    for (const child of mocks) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
    process.exit(exitCode);
  });
