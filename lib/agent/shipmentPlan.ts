/**
 * halloCD · 寄送计划内核（确定性）
 * ==================================================================
 * 把「用户自己的 agent 已经想好的结构化参数」算成一份可执行的寄送计划。
 *
 * ------------------------------------------------------------------
 * 为什么这个文件里没有任何「智能」：
 *
 *   理解意图（用户说「给妈妈寄张生日 CD」→ 场景 / 文案 / 配色）
 *   发生在**用户自己的 coding agent** 那边。平台只负责把已经成形的参数
 *   算成价格、运单号和一份人类可读的摘要。
 *
 *   所以这里既没有 LLM 调用，也没有关键词抽取 ——
 *   它是纯函数，同样的输入永远得到同样的输出。这才是能被审计、能被复算的东西。
 *
 *   （本文件的前身叫 agentPlan.ts，里面有个 planAutoPay()，
 *    早期被当成「平台侧 AI 解析」。v2.9 删掉平台自带 AI 时一并正名。）
 * ------------------------------------------------------------------
 */

import {
  CURRENCY,
  DEFAULT_SCENE,
  SCENE_PRICING,
  SHIPPING_FLAT,
  money,
  type ScenePricing,
} from "@/lib/agent/pricing";

const SCENE_TABLE: Record<string, ScenePricing> = SCENE_PRICING;

/** 建计划所需的入参 —— 全部来自 agent 已经解析好的结构化字段 */
export type ShipmentPlanInput = {
  receivers?: unknown;
  scene?: unknown;
  deliveryDate?: unknown;
  customText?: unknown;
  /** 数量 —— 不传时按收件人数量推导 */
  quantity?: unknown;
};

/** 执行流的四个步骤 —— 平台这一侧真正做的事 */
export type AgentStepKey = "quote" | "customize" | "pay" | "ship";

export type AgentStep = {
  key: AgentStepKey;
  /** 中文步骤名（前端直接展示，或由前端做 i18n） */
  title: string;
  status: "pending" | "running" | "done" | "failed";
  /** 中文详情 */
  detail: string;
  /**
   * 英文详情 —— 服务端一并产出，前端按当前语言取。
   *
   * 为什么不放在前端做模板：中文文案由服务端生成（它才知道收件人 / 价格 / 运单），
   * 若前端再写一份英文模板，就又多了一处「同一句话的两个副本」——
   * 和 G13 的设计词汇表是同一类风险。单一真源 + 客户端只做选择，才不会漂移。
   */
  detailEn: string;
};

export type ShipmentPlan = {
  receivers: string[];
  scene: string;
  sceneLabel: string;
  deliveryDate: string;
  customText: string;
  quantity: number;
  /** 单价 / 运费 / 合计（字符串，保留两位小数） */
  unitPrice: string;
  shipping: string;
  total: string;
  currency: string;
  /** 该场景的定制主题 */
  theme: string;
  /** 主题的英文版 */
  themeEn: string;
  summary: string;
  /** 计划摘要的英文版（英文界面展示用） */
  summaryEn: string;
  shipment: {
    trackingNumber: string;
    eta: string;
    carrier: string;
  };
};

export const AGENT_STEP_TITLES: Record<AgentStepKey, string> = {
  quote: "报价确认",
  customize: "定制参数",
  pay: "PayPal 支付完成",
  ship: "安排寄送",
};

export const AGENT_STEP_KEYS: AgentStepKey[] = ["quote", "customize", "pay", "ship"];

/** 收件人归一化：数组 / 逗号分隔字符串 / 单个字符串都接受 */
export function normalizeReceivers(input: unknown): string[] {
  let raw: string[] = [];
  if (Array.isArray(input)) {
    raw = input.map((v) => String(v ?? ""));
  } else if (typeof input === "string") {
    raw = input.split(/[,，、;；\n]/);
  } else if (input != null) {
    raw = [String(input)];
  }
  const cleaned = raw
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 40)
    .slice(0, 20);
  return cleaned.length > 0 ? cleaned : ["收件人"];
}

/** 日期归一化：只接受 YYYY-MM-DD，非法则回落到 7 天后 */
export function normalizeDeliveryDate(input: unknown): string {
  const today = new Date();
  const fallback = new Date(today.getTime() + 7 * 24 * 3600 * 1000);
  const fallbackStr = fallback.toISOString().slice(0, 10);

  if (typeof input === "string") {
    const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, y, mo, d] = m;
      const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
      if (!Number.isNaN(date.getTime())) return `${y}-${mo}-${d}`;
    }
  }
  return fallbackStr;
}

/** 运单号：TRACK-YYYYMMDD（取送达日期） */
export function buildTrackingNumber(deliveryDate: string): string {
  const digits = deliveryDate.replace(/\D/g, "");
  return `TRACK-${digits || "00000000"}`;
}

/** 数量归一化：正整数，1–99；非法返回 null（交给调用方回落） */
export function normalizeQuantity(input: unknown): number | null {
  const n = typeof input === "number" ? input : Number(String(input ?? "").trim());
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 1 || i > 99) return null;
  return i;
}

/**
 * 算出一份寄送计划 —— 纯函数，没有任何判断逻辑。
 *
 * 场景不认识就落到最中性的 everyday（而不是硬套到生日 / 婚礼上）；
 * 日期不认识就落到 7 天后。这两个回落是「宁可平庸也不出错」的取舍。
 */
export function buildShipmentPlan(input: ShipmentPlanInput): ShipmentPlan {
  const receivers = normalizeReceivers(input.receivers);
  const sceneKeyRaw = String(input.scene ?? "").trim().toLowerCase();
  const scene = SCENE_TABLE[sceneKeyRaw] ? sceneKeyRaw : DEFAULT_SCENE;
  const sceneMeta = SCENE_TABLE[scene];

  const deliveryDate = normalizeDeliveryDate(input.deliveryDate);
  const customText =
    typeof input.customText === "string" ? input.customText.trim().slice(0, 2000) : "";

  const quantity = normalizeQuantity(input.quantity) ?? receivers.length;
  const unitPrice = sceneMeta.unitPrice;
  const shipping = SHIPPING_FLAT;
  const total = unitPrice * quantity + shipping;

  const theme = sceneMeta.theme;
  const themeEn = sceneMeta.themeEn;
  const summary =
    `为 ${receivers.join("、")} 各定制 1 张「${sceneMeta.label}」主题 halloCD（${theme}），` +
    `单价 ${money(unitPrice)} ${CURRENCY}，共 ${quantity} 张，运费 ${money(shipping)} ${CURRENCY}，` +
    `合计 ${money(total)} ${CURRENCY}，预计 ${deliveryDate} 送达。`;
  /* 英文版与中文版一一对应（同一个事实、同一组数字），只是语言不同 */
  const summaryEn =
    `1 "${sceneMeta.label}" halloCD each for ${receivers.join(", ")} (${themeEn}); ` +
    `unit price ${money(unitPrice)} ${CURRENCY}, ${quantity} disc(s) in total, ` +
    `shipping ${money(shipping)} ${CURRENCY}, total ${money(total)} ${CURRENCY}, ` +
    `arriving around ${deliveryDate}.`;

  return {
    receivers,
    scene,
    sceneLabel: sceneMeta.label,
    deliveryDate,
    customText,
    quantity,
    unitPrice: money(unitPrice),
    shipping: money(shipping),
    total: money(total),
    currency: CURRENCY,
    theme,
    themeEn,
    summary,
    summaryEn,
    shipment: {
      trackingNumber: buildTrackingNumber(deliveryDate),
      eta: deliveryDate,
      carrier: "halloCD Express",
    },
  };
}

/**
 * 生成执行流（前端逐条展示）。
 *
 * 第一步是「报价确认」而不是「解析需求」——
 * 解析是用户自己 agent 的活，平台不该把它算成自己的一步。
 */
export function buildAgentSteps(
  plan: ShipmentPlan,
  status: "done" | "failed",
  detail?: { paypalOrderId?: string; paymentStatus?: string },
): AgentStep[] {
  const payDetail = detail?.paypalOrderId
    ? `${detail.paymentStatus ?? "COMPLETED"} · ${detail.paypalOrderId}`
    : "支付未完成";
  /* 支付与寄送的 detail 本身是数据（订单号 / 运单号），两种语言完全一致 */
  const payDetailEn = detail?.paypalOrderId
    ? `${detail.paymentStatus ?? "COMPLETED"} · ${detail.paypalOrderId}`
    : "Payment not completed";
  const shipDetailEn =
    status === "done"
      ? `${plan.shipment.trackingNumber} · ETA ${plan.shipment.eta}`
      : "Payment incomplete — shipment task not created";

  return [
    {
      key: "quote",
      title: AGENT_STEP_TITLES.quote,
      status: status === "done" ? "done" : "failed",
      detail: plan.summary,
      detailEn: plan.summaryEn,
    },
    {
      key: "customize",
      title: AGENT_STEP_TITLES.customize,
      status: status === "done" ? "done" : "failed",
      detail: `${plan.theme} × ${plan.quantity} · ${plan.customText ? "含定制信纸文案" : "默认信纸文案"}`,
      detailEn: `${plan.themeEn} × ${plan.quantity} · ${plan.customText ? "with your custom letter" : "default letter"}`,
    },
    {
      key: "pay",
      title: AGENT_STEP_TITLES.pay,
      status: status === "done" ? "done" : "failed",
      detail: payDetail,
      detailEn: payDetailEn,
    },
    {
      key: "ship",
      title: AGENT_STEP_TITLES.ship,
      status: status === "done" ? "done" : "failed",
      detail:
        status === "done"
          ? `${plan.shipment.trackingNumber} · ETA ${plan.shipment.eta}`
          : "支付未完成，寄送任务未创建",
      detailEn: shipDetailEn,
    },
  ];
}
