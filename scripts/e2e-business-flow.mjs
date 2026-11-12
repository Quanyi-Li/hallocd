#!/usr/bin/env node
/**
 * halloCD · 业务全流程端到端测试
 * ==================================================================
 * 用法：
 *   node scripts/e2e-business-flow.mjs
 *   node scripts/e2e-business-flow.mjs http://localhost:3000
 *
 * 覆盖的就是「送礼全流程」：
 *   注册 → 绑定 agent → 读目录 → 下模版 → 传成品 → 下单 → 付款
 *   → 收件人收到 → 回礼跳转 → 个人主页 → 登出
 *
 * 注意：会真的向 PayPal 沙盒发一笔订单（沙盒测试卡，不扣真钱）。
 */

import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const API = `${BASE}/api`;

function loadEnvLocal() {
  try {
    for (const raw of fs
      .readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
      .split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    /* 没有 .env.local 也能跑 */
  }
}
loadEnvLocal();

const SITE_KEY = process.env.HALLO_AGENT_API_KEY || "";
const ADMIN_KEY = process.env.HALLO_AGENT_ADMIN_KEY || "";

const checks = [];
function check(name, pass, extra = "") {
  checks.push({ name, pass, extra });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${extra ? `  → ${extra}` : ""}`);
}

let cookieJar = "";

/** 带 cookie 的 fetch */
async function call(method, url, body, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookieJar) headers.Cookie = cookieJar;
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url.startsWith("http") ? url : `${BASE}${url}`, {
    method,
    headers,
    ...(body instanceof FormData
      ? { body }
      : body
        ? { body: JSON.stringify(body) }
        : {}),
    redirect: "manual",
  });

  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const pair = c.split(";")[0];
    if (pair.startsWith("hallocd_session=")) {
      if (pair.endsWith("=")) cookieJar = "";
      else cookieJar = pair;
    }
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, headers: res.headers };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, data: buf, headers: res.headers };
}

/** 用独立的 cookie 跑一段逻辑，返回结果与当时的 cookie */
async function asUser(fn) {
  const saved = cookieJar;
  cookieJar = "";
  try {
    return await fn();
  } finally {
    cookieJar = saved;
  }
}

/* ================= 1. 健康检查 ================= */
console.log("\n▸ 1. 平台健康检查");
const health = await call("GET", "/api/agent/v1/health");
check("health 返回 200", health.status === 200, `HTTP ${health.status}`);
check(
  "存储后端已识别",
  ["file", "postgres"].includes(health.data.storage?.kind),
  health.data.storage?.kind,
);
check(
  "PayPal 凭据已配置",
  health.data.paypal?.configured === true,
  health.data.paypal?.environment,
);

/* ================= 2. 注册 ================= */
console.log("\n▸ 2. 账号");
const stamp = Date.now().toString(36);
const sender = { handle: `sender_${stamp}`.slice(0, 20), email: `s_${stamp}@test.dev`, password: "hallocd-test-2026" };
const receiver = { handle: `recv_${stamp}`.slice(0, 20), email: `r_${stamp}@test.dev`, password: "hallocd-test-2026" };

const reg1 = await call("POST", "/api/auth/register", sender);
check("注册送礼人成功", reg1.status === 200 || reg1.status === 201, `HTTP ${reg1.status} ${reg1.data.error || ""}`);
check("注册返回 profileUrl", reg1.data.profileUrl === `/u/${sender.handle}`, reg1.data.profileUrl);
const senderCookie = cookieJar;

/* 收件人用**独立的会话**注册，别覆盖送礼人的登录态 */
await asUser(async () => {
  const r = await call("POST", "/api/auth/register", receiver);
  check("注册收件人成功", r.status === 200 || r.status === 201, `HTTP ${r.status} ${r.data.error || ""}`);
});
cookieJar = senderCookie;

const me = await call("GET", "/api/auth/me");
check("登录态有效（送礼人）", me.status === 200 && me.data.user?.handle === sender.handle, me.data.user?.handle);

const dup = await call("POST", "/api/auth/register", sender);
check("重复注册被拒", dup.status === 409, `HTTP ${dup.status} ${dup.data.error || ""}`);

const weak = await call("POST", "/api/auth/register", { ...sender, email: `w_${stamp}@test.dev`, password: "123" });
check("弱密码被拒", weak.status === 400, `HTTP ${weak.status} ${weak.data.error || ""}`);

const badLogin = await call("POST", "/api/auth/login", { email: sender.email, password: "错的密码" });
check("错误密码登录被拒", badLogin.status === 401, `HTTP ${badLogin.status} ${badLogin.data.error || ""}`);

const relogin = await call("POST", "/api/auth/login", { email: sender.email, password: sender.password });
check("正确密码可登录", relogin.status === 200, `HTTP ${relogin.status} ${relogin.data.error || ""}`);
cookieJar = senderCookie;

/* ================= 3. 绑定 agent ================= */
console.log("\n▸ 3. Agent 绑定到用户名");
const issued = await call("POST", "/api/agent/v1/keys", { label: "我的 agent" });
check("登录用户可自助签发 key", issued.status === 201, `HTTP ${issued.status} ${issued.data.error || ""}`);
const userKey = issued.data.key;
check("key 绑定到当前用户", issued.data.boundTo?.handle === sender.handle, issued.data.boundTo?.handle);
check("key 前缀正确", String(userKey || "").startsWith("hcd_"), String(userKey || "").slice(0, 12));

const listKeys = await call("GET", "/api/agent/v1/keys");
check("能列出自己的 key", listKeys.status === 200 && listKeys.data.count >= 1, `count=${listKeys.data.count}`);

/* ================= 4. 目录 ================= */
console.log("\n▸ 4. 读目录");
const cat = await call("GET", "/api/agent/v1/catalog", null, {
  headers: { Authorization: `Bearer ${userKey}` },
});
check("用用户 key 读目录成功", cat.status === 200, `HTTP ${cat.status}`);
check(
  "目录声明了 templates 端点",
  Boolean(cat.data.catalog?.endpoints?.downloadTemplate?.path),
  cat.data.catalog?.endpoints?.downloadTemplate?.path || "缺失",
);

/* ================= 5. 模版下载 ================= */
console.log("\n▸ 5. DIY 模版");
const tpl = await call("GET", "/api/templates");
check("模版清单可读", tpl.status === 200 && tpl.data.count >= 8, `count=${tpl.data.count}`);

const zip = await call("GET", "/api/templates/disc-arc/download");
check("模版 zip 可下载", zip.status === 200, `HTTP ${zip.status}`);
check("Content-Type 是 zip", (zip.headers.get("content-type") || "").includes("zip"), zip.headers.get("content-type"));
const zipBuf = Buffer.isBuffer(zip.data) ? zip.data : Buffer.from(zip.data);
check("zip 有 PK 魔数", zipBuf.subarray(0, 2).toString("latin1") === "PK", zipBuf.subarray(0, 4).toString("hex"));
check("zip 非空", zipBuf.length > 500, `${zipBuf.length} bytes`);

/* ================= 6. 上传成品 ================= */
console.log("\n▸ 6. 上传 agent 产出的成品");
const form = new FormData();
form.append(
  "file",
  new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'], {
    type: "image/svg+xml",
  }),
  "agent-output.svg",
);
const up = await call("POST", "/api/uploads", form);
check("上传成功", up.status === 201, `HTTP ${up.status} ${up.data.error || ""}`);
const uploadedUrl = up.data.url;
const upGet = await call("GET", uploadedUrl);
/**
 * 「素材可取回」有两种形态，取决于存储后端（见 docs/backend-README.md §10.7）：
 *   · 数据库后端 → 直接返回字节，200
 *   · 对象存储后端 → 302 跳 CDN（文件不经过函数）
 * call() 用的是 redirect: "manual"，所以 302 不会被自动跟掉 ——
 * 这里显式把两种都认成「取回成功」，并且要求 302 必须带 Location。
 */
const upLocation = upGet.headers.get("location");
const upRetrieved =
  upGet.status === 200 || (upGet.status === 302 && Boolean(upLocation));
check(
  "上传的素材可取回",
  upRetrieved,
  `HTTP ${upGet.status}${upGet.status === 302 ? " → " + String(upLocation || "").slice(0, 60) : ""}`,
);

const badUp = await call("POST", "/api/uploads", (() => {
  const f = new FormData();
  f.append("file", new Blob(["x"], { type: "application/x-msdownload" }), "bad.exe");
  return f;
})());
check("不支持的类型被拒", badUp.status === 415, `HTTP ${badUp.status} ${badUp.data.error || ""}`);

/* ================= 7. 下单 ================= */
console.log("\n▸ 7. 用用户的 agent 下单");
const order = await call(
  "POST",
  "/api/agent/v1/orders",
  {
    productId: "birthday",
    quantity: 1,
    deliveryDate: "2026-12-20",
    receiver: { name: receiver.handle },
    design: {
      discColor: "#E9DFD2",
      spineText: "给妈妈",
      spineFont: "song",
      spineTheme: "light",
      spineTextColor: "#1C2329",
      showObi: true,
      obiText: "生日快乐",
      obiFont: "song",
      obiTheme: "light",
      obiTextColor: "#8B5852",
      paperSkin: "p02",
      discArtUrl: uploadedUrl,
    },
    letter: {
      text: "妈妈，生日快乐。\n\n这一年你好像又瘦了。",
      fontSize: 14,
      color: "#333333",
      signature: "—— 你的孩子",
    },
  },
  { headers: { Authorization: `Bearer ${userKey}` } },
);
check("下单返回 201", order.status === 201, `HTTP ${order.status} ${order.data.error || ""}`);
const orderId = order.data.orderId;
check("返回 orderId", typeof orderId === "string" && orderId.startsWith("ord_"), orderId);
check("报价正确", order.data.quote?.total === "55.90", `${order.data.quote?.unitPrice} + ${order.data.quote?.shipping} = ${order.data.quote?.total}`);
check("订单归属到下单用户", order.data.owner?.userId === reg1.data.user?.id, order.data.owner?.userId);
check("收件人解析到站内用户", order.data.owner?.receiverHandle === receiver.handle, order.data.owner?.receiverHandle);
check("返回回礼链接", typeof order.data.giftUrl === "string" && order.data.giftUrl.startsWith("/r/"), order.data.giftUrl);
const giftToken = order.data.giftUrl?.split("/r/")[1];

/* ================= 8. 付款 ================= */
console.log("\n▸ 8. 付款（真实沙盒订单）");
const paid = await call("POST", `/api/agent/v1/orders/${orderId}/pay`, null, {
  headers: { Authorization: `Bearer ${userKey}` },
});
check("付款返回 200", paid.status === 200, `HTTP ${paid.status} ${paid.data.error || ""}`);
check("PayPal 状态 COMPLETED", paid.data.payment?.status === "COMPLETED", paid.data.payment?.status);
check("运单号形如 TRACK-YYYYMMDD", /^TRACK-\d{8}$/.test(paid.data.shipment?.trackingNumber || ""), paid.data.shipment?.trackingNumber);
check("执行流 4 步齐全", Array.isArray(paid.data.steps) && paid.data.steps.length === 4, `${paid.data.steps?.length} 步`);

const again = await call("POST", `/api/agent/v1/orders/${orderId}/pay`, null, {
  headers: { Authorization: `Bearer ${userKey}` },
});
check("重复付款幂等", again.status === 200 && again.data.alreadyPaid === true, `HTTP ${again.status}`);

/* ================= 9. 收件人收到 ================= */
console.log("\n▸ 9. 收件人收到 + 回礼跳转");
const gift = await call("GET", `/r/${giftToken}`);
check("回礼落地页可访问", gift.status === 200, `HTTP ${gift.status}`);
const giftHtml = Buffer.isBuffer(gift.data) ? gift.data.toString("utf8") : JSON.stringify(gift.data);
check("落地页含「回一张 CD」", giftHtml.includes("回一张 CD"), "");
check("落地页含信纸正文", giftHtml.includes("妈妈，生日快乐"), "");
check("落地页含回礼跳转入口", giftHtml.includes(`/make?reply=${giftToken}`), "");

/* ================= 10. 个人主页 ================= */
console.log("\n▸ 10. 个人主页");
const profile = await call("GET", `/u/${sender.handle}`);
check("送礼人主页可访问", profile.status === 200, `HTTP ${profile.status}`);
const pHtml = Buffer.isBuffer(profile.data) ? profile.data.toString("utf8") : JSON.stringify(profile.data);
check("主页含用户名", pHtml.includes(sender.handle), "");
check("主页含订单运单号", pHtml.includes(paid.data.shipment?.trackingNumber || "TRACK-"), "");

const recvProfile = await call("GET", `/u/${receiver.handle}`);
const rHtml = Buffer.isBuffer(recvProfile.data) ? recvProfile.data.toString("utf8") : JSON.stringify(recvProfile.data);
check("收件人主页含收到的 CD", rHtml.includes("生日快乐"), "");
check("收件人主页含「回一张 CD」按钮", rHtml.includes("回一张 CD"), "");

const missing = await call("GET", "/u/definitely_not_a_user_xyz");
check("不存在的用户返回 404", missing.status === 404, `HTTP ${missing.status}`);

/* ================= 10.5 My Room 的真实订单 ================= */
console.log("\n▸ 10.5 My Room 读真实订单");
/*
 * My Room 以前永远摆着 11 张「我制作的」+ 5 张「我收到的」假 CD ——
 * 登录与否都一样。现在登录用户看到的是自己的真实订单（没有就是没有），
 * 访客才看到演示房间。
 */
const anonOrders = await asUser(async () => {
  const r = await call("GET", "/api/my/orders");
  check("未登录访问我的订单被拒", r.status === 401, `HTTP ${r.status}`);
  return r;
});

const mySent = await call("GET", "/api/my/orders");
check("送礼人可读我的订单", mySent.status === 200, `HTTP ${mySent.status}`);
check(
  "「我送出的」含本单",
  Array.isArray(mySent.data.sent) && mySent.data.sent.some((o) => o.orderId === orderId),
  `sent ${mySent.data.sent?.length ?? 0} 条`,
);
check(
  "「我收到的」对送礼人为空",
  Array.isArray(mySent.data.received) && mySent.data.received.length === 0,
  `received ${mySent.data.received?.length ?? 0} 条`,
);
check(
  "订单卡带信纸正文与落款",
  mySent.data.sent?.some((o) => o.orderId === orderId && o.letter.includes("妈妈，生日快乐")),
  mySent.data.sent?.find((o) => o.orderId === orderId)?.letter?.slice(0, 20) || "",
);

await asUser(async () => {
  const login = await call("POST", "/api/auth/login", {
    email: receiver.email,
    password: receiver.password,
  });
  check("收件人登录成功", login.status === 200, `HTTP ${login.status}`);
  const mine = await call("GET", "/api/my/orders");
  check("收件人可读我的订单", mine.status === 200, `HTTP ${mine.status}`);
  check(
    "「我收到的」含本单",
    Array.isArray(mine.data.received) && mine.data.received.some((o) => o.orderId === orderId),
    `received ${mine.data.received?.length ?? 0} 条`,
  );
  check(
    "收件人的「我送出的」为空",
    Array.isArray(mine.data.sent) && mine.data.sent.length === 0,
    `sent ${mine.data.sent?.length ?? 0} 条`,
  );
});

/* ================= 11. 登出 ================= */
console.log("\n▸ 11. 登出");
const out = await call("POST", "/api/auth/logout");
check("登出返回 200", out.status === 200, `HTTP ${out.status}`);const me2 = await call("GET", "/api/auth/me");
check("登出后未登录", me2.status === 401, `HTTP ${me2.status}`);

/* ================= 12. 管理密钥 ================= */
console.log("\n▸ 12. 管理员签发");
if (ADMIN_KEY) {
  const adminIssued = await call("POST", "/api/agent/v1/keys", { label: "admin 发的", handle: receiver.handle }, {
    headers: { Authorization: `Bearer ${ADMIN_KEY}` },
  });
  check("管理员可为指定用户签发", adminIssued.status === 201, `HTTP ${adminIssued.status}`);
  check("绑定到目标用户名", adminIssued.data.boundTo?.handle === receiver.handle, adminIssued.data.boundTo?.handle);
} else {
  console.log("  SKIP  未配置 HALLO_AGENT_ADMIN_KEY");
}

const noAuth = await call("GET", "/api/templates");
check("模版接口公开可读", noAuth.status === 200, `HTTP ${noAuth.status}`);

/* ================= 汇总 ================= */
const failed = checks.filter((c) => !c.pass);
console.log(
  `\n${failed.length === 0 ? "全部通过 ✅" : `有 ${failed.length} 项失败 ❌`}（${checks.length - failed.length}/${checks.length}）\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
