#!/usr/bin/env node
/**
 * halloCD · Agent 平台 端到端联调脚本
 * ==================================================================
 * 用法：
 *   node scripts/agent-platform-test.mjs
 *   node scripts/agent-platform-test.mjs http://localhost:3000
 *
 * 这个脚本扮演「一个 coding agent」：
 *   读目录 → 建单拿报价 → 校验参数 → 付款 → 查单 → 验幂等
 * 全程只通过公开的 /api/agent/v1/* 端点，不碰任何内部模块。
 *
 * 前置：
 *   1. 项目根目录存在 .env.local，含 PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET
 *      以及 HALLO_AGENT_API_KEY（没有会在第 2 步明确报错）
 *   2. 生产服务器已启动：npm run build && npm start
 *
 * 校验项（12 条）：
 *   health 免鉴权可达
 *   无 key 时 catalog 被拒
 *   目录含 6 个场景且价格有效
 *   目录含完整设计词汇表
 *   建单成功并返回正确报价
 *   非法 design 被拒且指明字段
 *   手写模式被明确拒绝
 *   支付 COMPLETED
 *   运单号形如 TRACK-YYYYMMDD
 *   执行流 4 步齐全
 *   查单返回已支付状态
 *   重复支付幂等（不重复扣款）
 */

import fs from "node:fs";
import path from "node:path";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const API = `${BASE}/api/agent/v1`;

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

const KEY = process.env.HALLO_AGENT_API_KEY || "";
const AUTH = KEY ? { Authorization: `Bearer ${KEY}` } : {};

const checks = [];
function check(name, pass, extra = "") {
  checks.push({ name, pass, extra });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${extra ? `  → ${extra}` : ""}`);
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      ...AUTH,
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    /* 保留空对象，下面统一判失败 */
  }
  return { status: res.status, data, raw: text };
}

console.log(`\n▸ 目标：${API}`);
console.log(`▸ 凭据：${KEY ? "已加载 HALLO_AGENT_API_KEY" : "未找到 HALLO_AGENT_API_KEY"}\n`);

if (!KEY) {
  console.error(
    "✗ 缺少 HALLO_AGENT_API_KEY。\n" +
      "  在 .env.local 里加一行：HALLO_AGENT_API_KEY=hcd_任意一串\n" +
      "  然后重启服务再跑。\n",
  );
  process.exit(2);
}

/* ============ 1. health（免鉴权） ============ */
console.log("▸ 1. 探活");
const health = await call("GET", `${API}/health`);
check("health 免鉴权可达", health.status === 200, `HTTP ${health.status}`);
check(
  "health 声明 orders.pay 能力",
  Array.isArray(health.data.capabilities) && health.data.capabilities.includes("orders.pay"),
  (health.data.capabilities || []).join(", "),
);

/* ============ 2. 鉴权 ============ */
console.log("\n▸ 2. 鉴权");
const noAuth = await fetch(`${API}/catalog`, { method: "GET" });
await noAuth.text();
check("无 key 时 catalog 被拒", noAuth.status === 401, `HTTP ${noAuth.status}`);

const badAuth = await fetch(`${API}/catalog`, {
  method: "GET",
  headers: { Authorization: "Bearer hcd_definitely_not_a_real_key" },
});
await badAuth.text();
check("错 key 时 catalog 被拒", badAuth.status === 401, `HTTP ${badAuth.status}`);

/* ============ 3. 目录 ============ */
console.log("\n▸ 3. 读目录");
const cat = await call("GET", `${API}/catalog`);
check("catalog 返回 200", cat.status === 200, `HTTP ${cat.status}`);
const scenes = cat.data.catalog?.scenes || [];
check("目录含 6 个场景", scenes.length === 6, `实际 ${scenes.length}`);
check(
  "场景价格均为正数 USD",
  scenes.length > 0 && scenes.every((s) => s.unitPrice > 0 && s.currency === "USD"),
  scenes.map((s) => `${s.id}:${s.unitPrice}`).join(", "),
);
check(
  "所有场景单价统一为 49.9 USD（G1 拍板：不允许再分叉）",
  scenes.length > 0 && scenes.every((s) => Number(s.unitPrice) === 49.9),
  scenes.map((s) => `${s.id}:${s.unitPrice}`).join(", "),
);
const opts = cat.data.catalog?.designOptions || {};
check(
  "设计词汇表齐全",
  Boolean(opts.discColors && opts.spineFonts && opts.spineThemes && opts.spineTextColors && opts.obiTemplates && opts.paperSkins),
  `disc ${opts.discColors?.length ?? 0} / fonts ${opts.spineFonts?.length ?? 0} / skins ${opts.paperSkins?.length ?? 0}`,
);
check(
  "目录自描述了 endpoints",
  Boolean(cat.data.catalog?.endpoints?.payOrder?.path),
  cat.data.catalog?.endpoints?.payOrder?.path || "缺失",
);

/* ============ 4. 建单（报价） ============ */
console.log("\n▸ 4. 建单拿报价（不扣款）");
const ORDER = {
  productId: "birthday",
  quantity: 1,
  deliveryDate: "2026-12-20",
  receiver: { name: "妈妈" },
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
    text: "妈妈，生日快乐。\n\n这一年你好像又瘦了，饭还是没好好吃吧。",
    fontSize: 14,
    color: "#333333",
    signature: "—— 你的孩子",
  },
};
const created = await call("POST", `${API}/orders`, ORDER);
check("建单返回 201", created.status === 201, `HTTP ${created.status}`);
check("建单返回 orderId", typeof created.data.orderId === "string", created.data.orderId);
const q = created.data.quote || {};
check(
  "报价 = 49.90 + 6.00 = 55.90",
  q.unitPrice === "49.90" && q.shipping === "6.00" && q.total === "55.90",
  `${q.unitPrice} + ${q.shipping} = ${q.total}`,
);
check(
  "design 已补齐默认值",
  created.data.design?.paperSkin === "p02" && created.data.design?.discColor === "#E9DFD2",
  JSON.stringify(created.data.design),
);

/* ============ 5. 参数校验 ============ */
console.log("\n▸ 5. 参数校验");
const badDesign = await call("POST", `${API}/orders`, {
  ...ORDER,
  design: { ...ORDER.design, spineFont: "comic-sans" },
});
check("非法 spineFont 被拒", badDesign.status === 400, `HTTP ${badDesign.status}`);
check(
  "错误指明字段",
  badDesign.data.field === "design.spineFont",
  badDesign.data.field || "无 field",
);

const badScene = await call("POST", `${API}/orders`, { ...ORDER, productId: "halloween" });
check("不存在的场景被拒", badScene.status === 400, `HTTP ${badScene.status}`);

const handwrite = await call("POST", `${API}/orders`, {
  ...ORDER,
  letter: { ...ORDER.letter, inputMode: "handwrite" },
});
check(
  "手写模式但没给笔迹图 → 被拒",
  handwrite.status === 400 && handwrite.data.error === "HANDWRITE_UNSUPPORTED",
  handwrite.data.error || `HTTP ${handwrite.status}`,
);

/* ---------- 5b. 上传素材：设计图 + 手写笔迹 ---------- */
console.log("\n▸ 5b. 上传素材引用");

// 先上传一张图（真实 multipart）
const png = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex",
);
const form = new FormData();
form.append("file", new Blob([png], { type: "image/png" }), "disc-art.png");
const upRes = await fetch(`${BASE}/api/uploads`, { method: "POST", body: form });
const upData = await upRes.json().catch(() => ({}));
check("素材上传成功", upRes.status === 201 && typeof upData.id === "string", `HTTP ${upRes.status}`);
check("返回 url 指向自家上传端点", upData.url === `/api/uploads/${upData.id}`, upData.url);

const withAsset = await call("POST", `${API}/orders`, {
  ...ORDER,
  design: { ...ORDER.design, discArtUrl: upData.id },
});
check("带上传素材的建单被接受", withAsset.status === 201, `HTTP ${withAsset.status}`);
check(
  "素材引用被归一成 /api/uploads/<id>",
  withAsset.data.design?.discArtUrl === `/api/uploads/${upData.id}`,
  withAsset.data.design?.discArtUrl,
);

// 有上传端点之后，手写笔迹也能传了（以前明确拒绝）
const handwriteWithImage = await call("POST", `${API}/orders`, {
  ...ORDER,
  letter: {
    ...ORDER.letter,
    inputMode: "handwrite",
    handwritingUrl: upData.id,
  },
});
check(
  "手写 + 笔迹图 → 被接受（能力解锁）",
  handwriteWithImage.status === 201,
  `HTTP ${handwriteWithImage.status} ${JSON.stringify(handwriteWithImage.data?.error || "")}`,
);
check(
  "手写笔迹引用已落库",
  handwriteWithImage.data.letter?.handwritingUrl === `/api/uploads/${upData.id}`,
  handwriteWithImage.data.letter?.handwritingUrl,
);

// 任意 URL 必须被拒 —— design 最终会渲染成 <img src>
const evilAsset = await call("POST", `${API}/orders`, {
  ...ORDER,
  design: { ...ORDER.design, discArtUrl: "https://evil.example/tracker.gif" },
});
check(
  "外部 URL 素材引用被拒",
  evilAsset.status === 400 && evilAsset.data.field === "design.discArtUrl",
  `${evilAsset.status} ${evilAsset.data.field || evilAsset.data.error}`,
);

const jsAsset = await call("POST", `${API}/orders`, {
  ...ORDER,
  design: { ...ORDER.design, discArtUrl: "javascript:alert(1)" },
});
check("javascript: 素材引用被拒", jsAsset.status === 400, `HTTP ${jsAsset.status}`);

/* ============ 6. 支付 ============ */
console.log("\n▸ 6. 支付（真实沙盒订单）");
const paid = await call("POST", `${API}/orders/${created.data.orderId}/pay`);
check("支付返回 200", paid.status === 200, `HTTP ${paid.status}`);
check(
  "payment.status === COMPLETED",
  paid.data.payment?.status === "COMPLETED",
  paid.data.payment?.status || JSON.stringify(paid.data.error || {}),
);
check(
  "paypalOrderId 存在",
  typeof paid.data.payment?.paypalOrderId === "string" && paid.data.payment.paypalOrderId.length > 0,
  paid.data.payment?.paypalOrderId,
);
check(
  "运单号形如 TRACK-YYYYMMDD",
  /^TRACK-\d{8}$/.test(paid.data.shipment?.trackingNumber || ""),
  paid.data.shipment?.trackingNumber,
);
check(
  "运单号 === TRACK-20261220",
  paid.data.shipment?.trackingNumber === "TRACK-20261220",
  paid.data.shipment?.trackingNumber,
);
check(
  "执行流 4 步齐全",
  Array.isArray(paid.data.steps) && paid.data.steps.length === 4 && paid.data.steps.every((s) => s.status === "done"),
  Array.isArray(paid.data.steps) ? paid.data.steps.map((s) => `${s.key}:${s.status}`).join(", ") : "缺失",
);

/* ============ 7. 查单 + 幂等 ============ */
console.log("\n▸ 7. 查单与幂等");
const got = await call("GET", `${API}/orders/${created.data.orderId}`);
check("查单返回 200", got.status === 200, `HTTP ${got.status}`);
check("查单状态为 paid", got.data.order?.status === "paid", got.data.order?.status);

const again = await call("POST", `${API}/orders/${created.data.orderId}/pay`);
check(
  "重复支付幂等（alreadyPaid=true）",
  again.status === 200 && again.data.alreadyPaid === true,
  `HTTP ${again.status} alreadyPaid=${again.data.alreadyPaid}`,
);
check(
  "重复支付未换 PayPal 订单号",
  again.data.payment?.paypalOrderId === paid.data.payment?.paypalOrderId,
  `${again.data.payment?.paypalOrderId} vs ${paid.data.payment?.paypalOrderId}`,
);

const listed = await call("GET", `${API}/orders?limit=5`);
check(
  "订单列表含本单",
  Array.isArray(listed.data.orders) && listed.data.orders.some((o) => o.orderId === created.data.orderId),
  `共 ${listed.data.orders?.length ?? 0} 条`,
);

/* ============ 8. 英文摘要（Agent 面向英文用户时直接复述给用户） ============ */
console.log("\n▸ 8. 英文摘要");
/*
 * 口径：查「我们自己写的中文文案短语有没有泄漏」，
 * 不是「字符串里有没有任何中文字符」——
 * 收件人姓名「妈妈」是用户数据，本来就该原样出现，不该被翻译。
 */
const ZH_PHRASES = [
  "订单 ",
  "场景：",
  "收件人：",
  "数量：",
  "合计：",
  "预计送达：",
  "运单号：",
  "盘面素材：",
  "回礼链接：",
  "确认金额后调用此端点",
  "把 quote.total 告知用户",
];
const leaks = (text) =>
  typeof text === "string" ? ZH_PHRASES.filter((p) => text.includes(p)) : ["(缺失)"];

check(
  "建单返回 summaryEn",
  typeof created.data.summaryEn === "string" && created.data.summaryEn.length > 0,
  created.data.summaryEn || "缺失",
);
check(
  "summaryEn 无中文文案泄漏",
  leaks(created.data.summaryEn).length === 0,
  leaks(created.data.summaryEn).join(", ") || "clean",
);
check(
  "summaryEn 含英文摘要小节",
  ["Order ", "Receiver:", "Quantity:", "Total:", "Estimated delivery:"].every((k) =>
    created.data.summaryEn.includes(k),
  ),
  created.data.summaryEn || "缺失",
);
check(
  "建单返回 nextEn",
  typeof created.data.nextEn === "string" && !leaks(created.data.nextEn).length,
  created.data.nextEn || "缺失",
);
check(
  "支付返回 summaryEn",
  typeof paid.data.summaryEn === "string" && !leaks(paid.data.summaryEn).length,
  leaks(paid.data.summaryEn).join(", ") || "clean",
);
check(
  "支付返回 messageEn",
  typeof paid.data.messageEn === "string" && paid.data.messageEn.length > 0,
  paid.data.messageEn || "缺失",
);
check(
  "messageEn 零中文",
  typeof paid.data.messageEn === "string" && !/[\u4e00-\u9fff]/.test(paid.data.messageEn),
  paid.data.messageEn || "缺失",
);
check(
  "幂等分支的 messageEn 也存在",
  typeof again.data.messageEn === "string" && !/[\u4e00-\u9fff]/.test(again.data.messageEn),
  again.data.messageEn || "缺失",
);
check(
  "执行流每步都有 detailEn",
  Array.isArray(paid.data.steps) &&
    paid.data.steps.every((s) => typeof s.detailEn === "string" && s.detailEn.length > 0),
  Array.isArray(paid.data.steps)
    ? paid.data.steps.map((s) => `${s.key}:${s.detailEn ? "ok" : "缺失"}`).join(", ")
    : "steps 缺失",
);
check(
  "detailEn 无中文文案泄漏",
  Array.isArray(paid.data.steps) &&
    paid.data.steps.every((s) => leaks(s.detailEn).length === 0),
  Array.isArray(paid.data.steps)
    ? paid.data.steps.map((s) => leaks(s.detailEn).join("/")).filter(Boolean).join(", ") || "clean"
    : "steps 缺失",
);
check(
  "查单返回 summaryEn",
  typeof got.data.summaryEn === "string" && !leaks(got.data.summaryEn).length,
  leaks(got.data.summaryEn).join(", ") || "clean",
);

/* ---- 汇总 ---- */
const failed = checks.filter((c) => !c.pass);
console.log(
  `\n${failed.length === 0 ? "全部通过 ✅" : `有 ${failed.length} 项失败 ❌`}（${checks.length - failed.length}/${checks.length}）`,
);
console.log(`\n▸ 订单摘要：\n${(paid.data.summary || "").split("\n").map((l) => `   ${l}`).join("\n")}\n`);
console.log(`▸ 订单摘要（英文）：\n${(paid.data.summaryEn || "").split("\n").map((l) => `   ${l}`).join("\n")}\n`);
process.exit(failed.length === 0 ? 0 : 1);
