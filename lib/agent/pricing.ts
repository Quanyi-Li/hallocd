/**
 * halloCD · 定价单一真源
 * ==================================================================
 * 之前定价散在两处且互相矛盾：
 *   · lib/products.ts 的 `price: 49.9`（无币种，画廊 UI 从不渲染）
 *   · lib/agent/shipmentPlan.ts 的 SCENE_TABLE（32–49 USD）—— 实际扣款用的
 *
 * 现在统一到本文件：**Agent API 报价与 PayPal 扣款都以这里为准**。
 *
 * 【v2.6 产品拍板】六个场景的 CD 单价统一为 **49.90 USD**，
 * 与 lib/products.ts 的 `price: 49.9` 对齐 —— 代价是场景之间不再有差异化定价，
 * 换来的是「任何入口看到的单价 = 实际扣的价」，不存在两套数字。
 * 运费另计：每单固定 SHIPPING_FLAT = 6 USD。
 *
 * 币种说明：USD。沙盒 PayPal 只支持 USD（见 lib/agent/paypal.ts）。
 */

/** 场景 → 主题 / 单价 / 展示名 */
export type ScenePricing = {
  /** 英文展示名 */
  label: string;
  /** 中文展示名 */
  labelZh: string;
  /** 中文主题描述 */
  theme: string;
  /** 英文主题描述（英文界面下展示用） */
  themeEn: string;
  unitPrice: number;
};

export const CURRENCY = "USD";
export const SHIPPING_FLAT = 6;

/**
 * 统一单价（USD）。
 *
 * 之所以是一个常量而不是每个场景各写一遍：
 * 定价一旦分叉，就会出现「画廊显示 49.9、Agent 报价 35、PayPal 扣 39」这种
 * 对不上的局面 —— 用户在结账页看到的价格和实际扣款不一致，是最伤信任的一类 bug。
 * 要做差异化定价时，改这一个常量 + 补断言即可。
 */
export const UNIT_PRICE = 49.9;

export const SCENE_PRICING: Record<string, ScenePricing> = {
  christmas: {
    label: "Christmas",
    labelZh: "圣诞节",
    theme: "圣诞限定 · 暖金唱片",
    themeEn: "Christmas Edition · Warm Gold Record",
    unitPrice: UNIT_PRICE,
  },
  birthday: {
    label: "Birthday",
    labelZh: "生日",
    theme: "生日 · 定制蛋糕盘面",
    themeEn: "Birthday · Custom Cake Disc Face",
    unitPrice: UNIT_PRICE,
  },
  anniversary: {
    label: "Anniversary",
    labelZh: "恋爱纪念日",
    theme: "纪念日 · 复古丝带腰封",
    themeEn: "Anniversary · Vintage Ribbon Obi",
    unitPrice: UNIT_PRICE,
  },
  wedding: {
    label: "Wedding",
    labelZh: "婚礼",
    theme: "婚礼 · 香槟金对戒盘面",
    themeEn: "Wedding · Champagne-Gold Ring Disc Face",
    unitPrice: UNIT_PRICE,
  },
  graduation: {
    label: "Graduation",
    labelZh: "毕业",
    theme: "毕业 · 学院深蓝腰封",
    themeEn: "Graduation · Academic Navy Obi",
    unitPrice: UNIT_PRICE,
  },
  everyday: {
    label: "Everyday",
    labelZh: "日常",
    theme: "日常 · 极简素面",
    themeEn: "Everyday · Minimal Plain Face",
    unitPrice: UNIT_PRICE,
  },
};

export const DEFAULT_SCENE = "christmas";

export function isKnownScene(scene: string): boolean {
  return Object.prototype.hasOwnProperty.call(SCENE_PRICING, scene);
}

export function getScenePricing(scene: string): ScenePricing {
  return SCENE_PRICING[scene] ?? SCENE_PRICING[DEFAULT_SCENE];
}

export function money(value: number): string {
  return value.toFixed(2);
}

export type Quote = {
  unitPrice: string;
  shipping: string;
  total: string;
  currency: string;
  quantity: number;
};

/** 报价：单价 × 数量 + 固定运费 */
export function priceQuote(scene: string, quantity: number): Quote {
  const unit = getScenePricing(scene).unitPrice;
  const shipping = SHIPPING_FLAT;
  const total = unit * quantity + shipping;
  return {
    unitPrice: money(unit),
    shipping: money(shipping),
    total: money(total),
    currency: CURRENCY,
    quantity,
  };
}
