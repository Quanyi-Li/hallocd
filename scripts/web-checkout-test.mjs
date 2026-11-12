#!/usr/bin/env node
/**
 * halloCD · 网页端下单付款 端到端联调脚本（v2.13 · 强制先登录）
 * ==================================================================
 * 用法：
 *   node scripts/web-checkout-test.mjs
 *   node scripts/web-checkout-test.mjs http://localhost:3010
 *
 * 这个脚本扮演「一个在浏览器里下单的用户」：
 *   访客被拦下 → 注册 → 建单拿报价 → 看金额 → 发起付款
 *   → 拿到 PayPal 收银台链接 → 查单 → 验幂等
 * 全程只通过公开的 /api/orders* 与 /api/auth* 端点，不碰任何内部模块。
 *
 * 【v2.11 的语义变化】
 * v2.10：POST /pay 直接扣款（服务端代付），付款后立刻有运单号。
 * v2.11：POST /pay 只**建一张 PayPal 审批单**并返回 approveUrl ——
 *        钱由用户在 PayPal 上自己付；在用户点下 PayPal 上那个
 *        「确认付款」之前，订单状态必须一直是 quoted。
 *
 * 【v2.13 的语义变化】
 * v2.10–v2.12：访客可以直接建单付款。
 * v2.13：网页端结账**强制先登录** —— 建单 / 查单 / 付款三条链都要求会话，
 *        没有会话一律 401 LOGIN_REQUIRED。
 *        理由：订单要有主人 —— 运单号、回礼链接、以后再寄一张给你，
 *        都得挂在某个账号下面。
 *
 *        PayPal 回跳**不要求登录**：走到那一步说明钱已经授权了，
 *        这时把人拦在门外等于让用户白付一次。
 *
 * 这个脚本验的就是这条新语义：
 *   · 访客建单 / 查单 / 付款都被 401 挡下，且错误码是 LOGIN_REQUIRED
 *   · 登录之后一切照旧：报价 → 收银台链接 → 幂等 → 回跳认单
 *   · PayPal 回跳在没有会话时依然能认出这一单（不要求登录）
 *   · 别人的单子付不了（403），不是靠「你手上没凭据」这种半吊子理由
 *
 * 与 agent-platform-test.mjs 的区别：
 *   那条路用 **API key** 鉴权、**代付**；这条路用 **会话 cookie**、
 *   **用户直付**。两条路共用同一套校验 / 定价 / 落库 / 寄送逻辑，
 *   所以行为必须一致 —— 「网页端少算一笔运费」这种分叉最伤信任。
 *
 * 前置：
 *   1. 项目根目录存在 .env.local，含 PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET
 *   2. 服务器已启动：npm run build && npm start
 */

import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");

/* ---- 读取 .env.local（不引 dotenv，手搓够用） ---- */
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

const checks = [];
function check(name, pass, extra = "") {
  checks.push({ name, pass, extra });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${extra ? `  → ${extra}` : ""}`);
}

/** 一次请求；带 cookieJar 时记 cookie */
function makeClient() {
  const jar = new Map();
  return {
    jar,
    /** cookie 快照（用来断言「凭据进了 cookie」） */
    cookieSnapshot: () => Object.fromEntries(jar.entries()),
    async call(method, url, body, opts = {}) {
      const headers = {
        ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      };
      if (jar.size) {
        headers.Cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
      }
      const res = await fetch(url, {
        method,
        headers,
        redirect: opts.manualRedirect ? "manual" : "follow",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      for (const raw of res.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(";");
        const idx = pair.indexOf("=");
        if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
      const text = await res.text();
      let data = {};
      try {
        data = JSON.parse(text);
      } catch {
        /* 保留空对象，下面统一判失败 */
      }
      return {
        status: res.status,
        data,
        raw: text,
        location: res.headers.get("location"),
        setCookie: res.headers.getSetCookie?.() ?? [],
      };
    },
  };
}

/** 三个客户端：访客 / 下单的人 / 另一个人 */
const guest = makeClient();
const user = makeClient();
const other = makeClient();

const BASE_ORDER = {
  productId: "birthday",
  quantity: 1,
  deliveryDate: "2026-12-20",
  receiver: { name: "妈妈" },
  design: {
    discColor: "#E9DFD2",
    spineText: "给妈妈",
    spineFont: "serif",
    spineTheme: "glass",
    spineTextColor: "#1C2329",
    showObi: true,
    obiText: "生日快乐",
    obiFont: "serif",
    obiTheme: "light",
    obiTextColor: "#1C2329",
    paperSkin: "p01",
  },
  letter: {
    text: "妈妈，生日快乐。",
    fontSize: 14,
    color: "#1C2329",
    signature: "—— 你的孩子",
    inputMode: "type",
  },
};

console.log(`\n▸ 目标：${BASE}/api/orders`);
console.log(`▸ 凭据：${process.env.PAYPAL_CLIENT_ID ? "已加载 PayPal 凭据" : "未找到 PayPal 凭据"}\n`);

if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
  console.error(
    "✗ 缺少 PayPal 凭据。\n" +
      "  在 .env.local 里补上 PAYPAL_CLIENT_ID 与 PAYPAL_CLIENT_SECRET 再跑。\n",
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/*  1. 访客：网页端结账强制先登录                                       */
/* ------------------------------------------------------------------ */
console.log("▸ 1. 访客被拒（v2.13：网页端结账强制先登录）");

const guestCreate = await guest.call("POST", `${BASE}/api/orders`, BASE_ORDER);
check("访客建单被拒（401）", guestCreate.status === 401, `HTTP ${guestCreate.status}`);
check(
  "错误码是 LOGIN_REQUIRED",
  guestCreate.data?.error === "LOGIN_REQUIRED",
  String(guestCreate.data?.error),
);
check(
  "错误话术说清了「这单要挂在你的名下」",
  typeof guestCreate.data?.message === "string" && guestCreate.data.message.includes("账号"),
  String(guestCreate.data?.message),
);
check(
  "访客建单没有拿到任何订单信息",
  !guestCreate.data?.orderId && !guestCreate.data?.payToken,
  JSON.stringify(guestCreate.data ?? {}).slice(0, 120),
);

/* ------------------------------------------------------------------ */
/*  2. 注册并登录                                                     */
/* ------------------------------------------------------------------ */
console.log("\n▸ 2. 注册");
const stamp = Date.now().toString(36).slice(-8);
const handle = "web" + stamp;
const reg = await user.call("POST", `${BASE}/api/auth/register`, {
  email: `web${stamp}@example.com`,
  password: "web12345678",
  handle,
});
check("注册成功", reg.status === 200 || reg.status === 201, `HTTP ${reg.status}`);

const me = await user.call("GET", `${BASE}/api/auth/me`);
const meUser = me.data?.user ?? null;
check("会话生效", meUser?.handle === handle, JSON.stringify(me.data).slice(0, 80));

/* ------------------------------------------------------------------ */
/*  3. 建单（已登录）                                                 */
/* ------------------------------------------------------------------ */
console.log("\n▸ 3. 建单");
const created = await user.call("POST", `${BASE}/api/orders`, BASE_ORDER);
check("建单成功（201）", created.status === 201, `HTTP ${created.status} ${created.raw.slice(0, 120)}`);

const order = created.data ?? {};
const quote = order.quote ?? {};

check(
  "报价总额 = 55.90 USD（单价 49.90 + 运费 6.00）",
  Number(quote.total) === 55.9 &&
    Number(quote.unitPrice) === 49.9 &&
    Number(quote.shipping) === 6 &&
    quote.currency === "USD",
  JSON.stringify(quote),
);
check("建单不扣款（状态仍是 quoted）", order.status === "quoted", String(order.status));
check("有回礼链接", typeof order.giftUrl === "string" && order.giftUrl.startsWith("/r/"), String(order.giftUrl));
check("发了一次性付款凭据", typeof order.payToken === "string" && order.payToken.length > 10, String(order.payToken));
check(
  "订单摘要里没有把付款凭据写进 design/letter",
  !JSON.stringify(order.design ?? {}).includes("webPayToken") &&
    !JSON.stringify(order.letter ?? {}).includes("webPayToken"),
  "",
);
check(
  "订单挂在用户名下",
  order.owner?.userId === meUser?.id && order.owner?.senderHandle === handle,
  JSON.stringify(order.owner),
);

/* 凭据同时进了 cookie —— 跳去 PayPal 再跳回来时，页面手里是空的，
   只能靠浏览器自己带着这枚 cookie 认回这一单。 */
const payCookie = user.cookieSnapshot().hallocd_web_pay;
check(
  "付款凭据写进了 httpOnly cookie",
  typeof payCookie === "string" && payCookie.length > 10,
  payCookie ? "hallocd_web_pay 已设置" : "未设置",
);

/* ------------------------------------------------------------------ */
/*  4. 参数校验                                                       */
/* ------------------------------------------------------------------ */
console.log("\n▸ 4. 参数校验");
const noProduct = await user.call("POST", `${BASE}/api/orders`, { ...BASE_ORDER, productId: "" });
check("缺 productId 被拒（400）", noProduct.status === 400, `HTTP ${noProduct.status}`);

const badDesign = await user.call("POST", `${BASE}/api/orders`, {
  ...BASE_ORDER,
  design: { ...BASE_ORDER.design, discArtUrl: "https://example.com/a.png" },
});
check("外部图片引用被拒（400）", badDesign.status === 400, `HTTP ${badDesign.status}`);

/* ------------------------------------------------------------------ */
/*  5. 访客查单 / 付款同样被拒                                         */
/* ------------------------------------------------------------------ */
console.log("\n▸ 5. 访客查单与付款");
const guestGet = await guest.call("GET", `${BASE}/api/orders/${order.orderId}`);
check("访客查单被拒（401）", guestGet.status === 401, `HTTP ${guestGet.status}`);
check(
  "访客查单错误码是 LOGIN_REQUIRED",
  guestGet.data?.error === "LOGIN_REQUIRED",
  String(guestGet.data?.error),
);

const guestPay = await guest.call("POST", `${BASE}/api/orders/${order.orderId}/pay`, {
  payToken: order.payToken,
});
check("访客付款被拒（401）", guestPay.status === 401, `HTTP ${guestPay.status}`);
check(
  "访客付款错误码是 LOGIN_REQUIRED",
  guestPay.data?.error === "LOGIN_REQUIRED",
  String(guestPay.data?.error),
);

/* ------------------------------------------------------------------ */
/*  6. 付款 = 跳去 PayPal（用户自己付）                                */
/* ------------------------------------------------------------------ */
console.log("\n▸ 6. 付款");
/* v2.13：登录用户付款**光凭会话**就行 —— 一次性凭据不再是门槛。
   凭据没有白扔：它是给「升级之前建的访客单」留的后门 ——
   那种单 owner 为空，只能凭那枚凭据认领。 */
const noTokenPay = await user.call("POST", `${BASE}/api/orders/${order.orderId}/pay`, {});
check(
  "登录用户付款不需要凭据（光凭会话就行）",
  noTokenPay.status === 200 && typeof noTokenPay.data?.approveUrl === "string",
  `HTTP ${noTokenPay.status}`,
);

const wrongToken = await user.call("POST", `${BASE}/api/orders/${order.orderId}/pay`, {
  payToken: "wpt_totally_wrong",
});
check(
  "owner 手里的错凭据不影响付款（会话才是门槛）",
  wrongToken.status === 200,
  `HTTP ${wrongToken.status}`,
);
check(
  "三次付款指向同一张 PayPal 单（不重复建单）",
  wrongToken.data?.approveUrl === noTokenPay.data?.approveUrl,
  String(wrongToken.data?.approveUrl),
);

const payRes = await user.call("POST", `${BASE}/api/orders/${order.orderId}/pay`, {
  payToken: order.payToken,
});
check("付款请求受理（200）", payRes.status === 200, `HTTP ${payRes.status} ${payRes.raw.slice(0, 160)}`);
check(
  "返回的是 PayPal 收银台链接（不是扣款结果）",
  payRes.data?.mode === "redirect" && typeof payRes.data?.approveUrl === "string",
  `mode=${payRes.data?.mode} approveUrl=${String(payRes.data?.approveUrl).slice(0, 80)}`,
);
check(
  "收银台链接指向 PayPal",
  /paypal\.com\/(checkoutnow|checkout)/i.test(String(payRes.data?.approveUrl ?? "")),
  String(payRes.data?.approveUrl),
);

/* ------------------------------------------------------------------ */
/*  7. 没批准之前：不扣款、不发货                                        */
/* ------------------------------------------------------------------ */
console.log("\n▸ 7. 批准之前订单仍然是 quoted");
const beforePay = await user.call(
  "GET",
  `${BASE}/api/orders/${order.orderId}?payToken=${encodeURIComponent(order.payToken)}`,
);
check("查单成功", beforePay.status === 200, `HTTP ${beforePay.status}`);
check("状态还是 quoted（没批准就不算付）", beforePay.data?.order?.status === "quoted", String(beforePay.data?.order?.status));
check(
  "还没有运单号（没发货）",
  !beforePay.data?.shipment?.trackingNumber,
  String(beforePay.data?.shipment?.trackingNumber),
);
check(
  "收银台链接就是这一单那张 PayPal 单",
  String(payRes.data?.approveUrl ?? "").includes(String(beforePay.data?.payment?.paypalOrderId ?? "")),
  `paypalOrderId=${beforePay.data?.payment?.paypalOrderId}`,
);

/* 反复点「确认付款」不该多建 PayPal 单 */
const payAgain = await user.call("POST", `${BASE}/api/orders/${order.orderId}/pay`, {
  payToken: order.payToken,
});
check(
  "反复付款复用同一张 PayPal 单（不重复建单）",
  payAgain.status === 200 && payAgain.data?.approveUrl === payRes.data?.approveUrl,
  `HTTP ${payAgain.status}`,
);

/* ------------------------------------------------------------------ */
/*  8. 回跳路由：不要求登录（钱已经授权了）                              */
/* ------------------------------------------------------------------ */
console.log("\n▸ 8. 回跳路由（不要求登录）");
const noToken = await guest.call(
  "GET",
  `${BASE}/api/orders/${order.orderId}/pay/return`,
  null,
  { manualRedirect: true },
);
check("回跳没有 token → 302 跳回制作页", noToken.status === 302, `HTTP ${noToken.status}`);
check(
  "回跳没有 token → 带上错误码",
  String(noToken.location ?? "").includes("payError=MISSING_TOKEN"),
  String(noToken.location),
);

const forged = await guest.call(
  "GET",
  `${BASE}/api/orders/${order.orderId}/pay/return?token=1NOSTUB1234567890`,
  null,
  { manualRedirect: true },
);
check("回跳 token 对不上 → 302（不扣款）", forged.status === 302, `HTTP ${forged.status}`);
check(
  "回跳 token 对不上 → 报 MISMATCH",
  String(forged.location ?? "").includes("PAYPAL_ORDER_MISMATCH"),
  String(forged.location),
);

const stillQuoted = await user.call(
  "GET",
  `${BASE}/api/orders/${order.orderId}?payToken=${encodeURIComponent(order.payToken)}`,
);
check(
  "伪造回跳没有让订单变成已付",
  stillQuoted.data?.order?.status === "quoted",
  String(stillQuoted.data?.order?.status),
);

/* ------------------------------------------------------------------ */
/*  9. 查单                                                           */
/* ------------------------------------------------------------------ */
console.log("\n▸ 9. 查单");
check(
  "摘要里不含付款凭据",
  !beforePay.raw.includes("webPayToken") && !beforePay.raw.includes(String(order.payToken)),
  "",
);

/* 不带 query token —— 会话本身就够认下自己的单 */
const sessionOnly = await user.call("GET", `${BASE}/api/orders/${order.orderId}`);
check("只靠会话也能查单（不带 query token）", sessionOnly.status === 200, `HTTP ${sessionOnly.status}`);

/* 只靠 cookie 也能查单 —— 登录态 + cookie 都在（跳去 PayPal 再跳回来的场景） */
const cookieOnly = await makeClient();
cookieOnly.jar.set("hallocd_web_pay", String(payCookie ?? ""));
const cookieOnlyRes = await cookieOnly.call("GET", `${BASE}/api/orders/${order.orderId}`);
check("没登录时只靠 cookie 查不了单（401）", cookieOnlyRes.status === 401, `HTTP ${cookieOnlyRes.status}`);

/* ------------------------------------------------------------------ */
/*  10. 我的订单 & 别人的单                                             */
/* ------------------------------------------------------------------ */
console.log("\n▸ 10. 我的订单与越权");
const myOrders = await user.call("GET", `${BASE}/api/my/orders`);
const mine = Array.isArray(myOrders.data?.orders)
  ? myOrders.data.orders
  : Array.isArray(myOrders.data?.sent)
    ? myOrders.data.sent
    : [];
check(
  "订单出现在「我的订单」里",
  mine.some((o) => o.orderId === order.orderId || o.id === order.orderId),
  JSON.stringify(mine).slice(0, 200),
);

/* 另一个人登录了：他既没有凭据，也不是这单的 owner */
const otherStamp = Date.now().toString(36).slice(-8) + "x";
const otherReg = await other.call("POST", `${BASE}/api/auth/register`, {
  email: `other${otherStamp}@example.com`,
  password: "web12345678",
  handle: "oth" + otherStamp,
});
check("第二个人注册成功", otherReg.status === 200 || otherReg.status === 201, `HTTP ${otherReg.status}`);

const otherPay = await other.call("POST", `${BASE}/api/orders/${order.orderId}/pay`, {
  payToken: order.payToken,
});
check("别人的账号付不了这一单（403）", otherPay.status === 403, `HTTP ${otherPay.status}`);

const otherGet = await other.call("GET", `${BASE}/api/orders/${order.orderId}`);
check("别人的账号查不了这一单（403）", otherGet.status === 403, `HTTP ${otherGet.status}`);

/* ------------------------------------------------------------------ */
const failed = checks.filter((c) => !c.pass);
console.log(`\n==================================================================`);
console.log(`合计：${checks.length} 项 · 通过 ${checks.length - failed.length} · 失败 ${failed.length}`);
console.log(`==================================================================`);
if (failed.length) {
  for (const f of failed) console.log(`  FAIL  ${f.name}  ${f.extra}`);
  process.exit(1);
}
console.log("全部通过 ✅\n");
