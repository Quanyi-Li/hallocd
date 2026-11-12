#!/usr/bin/env node
/**
 * halloCD · 演示数据种子
 * ==================================================================
 * 用法：
 *   node scripts/seed-demo.mjs
 *   node scripts/seed-demo.mjs http://localhost:3000
 *
 * 造一个能讲清全流程的现场：
 *   · kok（送礼人）绑了自己的 agent，用 agent 下了一单并付款
 *   · mom（收件人）在自己的主页上收到了这张 CD，可以点「回一张 CD」
 *   · 留下回礼链接 /r/<token>，可以直接打开看
 *
 * 注意：会真的向 PayPal 沙盒发一笔订单（测试卡，不扣真钱）。
 * 幂等：重复跑会复用同名账号，不会重复下单。
 */

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

let cookie = "";

async function call(method, url, body, headers = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (body && !(body instanceof FormData)) h["Content-Type"] = "application/json";
  const res = await fetch(url.startsWith("http") ? url : `${BASE}${url}`, {
    method,
    headers: h,
    ...(body instanceof FormData
      ? { body }
      : body
        ? { body: JSON.stringify(body) }
        : {}),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const pair = c.split(";")[0];
    if (pair.startsWith("hallocd_session=")) {
      cookie = pair.endsWith("=") ? "" : pair;
    }
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }
  return { status: res.status, data: await res.text() };
}

const SENDER = { handle: "kok", email: "kok@hallocd.dev", password: "hallocd-demo-2026" };
const RECEIVER = { handle: "mom", email: "mom@hallocd.dev", password: "hallocd-demo-2026" };

async function ensureUser(u) {
  const saved = cookie;
  cookie = "";
  const reg = await call("POST", "/api/auth/register", u);
  if (reg.status === 409) {
    const login = await call("POST", "/api/auth/login", {
      email: u.email,
      password: u.password,
    });
    if (login.status !== 200) {
      console.error(`✗ ${u.handle} 登录失败：`, login.data?.message || login.status);
      process.exit(1);
    }
  } else if (reg.status !== 200 && reg.status !== 201) {
    console.error(`✗ ${u.handle} 注册失败：`, reg.data?.message || reg.status);
    process.exit(1);
  }
  const mine = cookie;
  cookie = saved;
  return mine;
}

console.log("\n▸ 造演示数据\n");

const senderCookie = await ensureUser(SENDER);
console.log(`  ✓ 送礼人 @${SENDER.handle}`);
const receiverCookie = await ensureUser(RECEIVER);
console.log(`  ✓ 收件人 @${RECEIVER.handle}`);

/* 给送礼人绑定一把 agent key */
cookie = senderCookie;
const keyRes = await call("POST", "/api/agent/v1/keys", { label: "kok 的 agent" });
const key = keyRes.data?.key;
if (!key) {
  /* 不能退回用列表里的掩码 —— 掩码只有前 12 个字符，当 key 用必然 401。
     完整 key 只在签发那一次出现；拿不到就老实报错，别拿废数据凑。 */
  console.error(
    "  ✗ 签发 agent key 失败：",
    keyRes.data?.message || `HTTP ${keyRes.status}`,
  );
  console.error("    （需要登录态：先跑一次注册/登录拿到 session cookie）");
  process.exit(1);
}
console.log("  ✓ 已绑定 agent key");

/* 用这把 key 下单并付款 */
const orderRes = await call(
  "POST",
  "/api/agent/v1/orders",
  {
    productId: "birthday",
    quantity: 1,
    deliveryDate: "2026-12-20",
    receiver: { name: RECEIVER.handle },
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
    },
    letter: {
      text:
        "妈妈，生日快乐。\n\n这一年你好像又瘦了，饭还是没好好吃吧。\n我攒了点事想说，等我回去当面讲给你听。",
      fontSize: 14,
      color: "#333333",
      signature: "—— 你的孩子",
    },
  },
  { Authorization: `Bearer ${key}` },
);

if (orderRes.status !== 201) {
  console.error("✗ 下单失败：", orderRes.data?.message || orderRes.status);
  process.exit(1);
}
const orderId = orderRes.data.orderId;
console.log(`  ✓ 订单 ${orderId}`);

const payRes = await call(
  "POST",
  `/api/agent/v1/orders/${orderId}/pay`,
  null,
  { Authorization: `Bearer ${key}` },
);

if (payRes.status !== 200) {
  console.error("✗ 付款失败：", payRes.data?.message || payRes.status);
  process.exit(1);
}

console.log(`  ✓ 已付款 ${payRes.data.payment?.status} · ${payRes.data.payment?.paypalOrderId}`);
console.log(`  ✓ 运单号 ${payRes.data.shipment?.trackingNumber}`);
console.log(`  ✓ 回礼链接 ${BASE}${payRes.data.giftUrl || orderRes.data.giftUrl}`);

console.log("\n▸ 现在可以打开：");
console.log(`   个人主页   ${BASE}/u/${SENDER.handle}`);
console.log(`   收件箱     ${BASE}/u/${RECEIVER.handle}`);
console.log(`   回礼落地页 ${BASE}${payRes.data.giftUrl || orderRes.data.giftUrl}`);
console.log(`   模版库     ${BASE}/templates\n`);
