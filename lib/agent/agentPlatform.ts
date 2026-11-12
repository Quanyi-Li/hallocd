/**
 * halloCD Agent API · 编排层
 * ==================================================================
 * 把「外部 agent 已经想好的结构化参数」变成「订单」和「寄送任务」。
 *
 * 分工（这是整个 v1 设计最关键的一点）：
 *   · 理解意图、选场景、写文案、定配色  →  发生在用户自己的 coding agent 那边
 *   · 校验参数、算价格、扣款、生成运单    →  发生在平台这边（确定性、可审计）
 *
 * 平台**不做**自然语言理解。所以本文件里没有任何 LLM 调用，
 * 也没有"把用户一句话翻译成订单"的逻辑 —— 那是 agent 的活。
 */

import { PAPER_SKINS } from "@/components/paperSkins";
import {
  buildAgentSteps,
  buildShipmentPlan,
  normalizeDeliveryDate,
  normalizeQuantity,
  normalizeReceivers,
  type ShipmentPlan,
} from "@/lib/agent/shipmentPlan";
import {
  DISC_COLOR_PRESETS,
  OBI_TEMPLATES,
  SPINE_FONTS,
  SPINE_TEMPLATES,
  SPINE_TEXT_COLORS,
  SPINE_THEMES,
  getScene,
  isKnownSceneId,
} from "@/lib/agent/catalog";
import {
  captureApprovedOrder,
  createCapturedOrder,
  hasCredentials,
  readPayPalConfig,
  PayPalError,
} from "@/lib/agent/paypal";
import {
  createOrder,
  getOrder,
  updateOrder,
  buildGiftToken,
  type AgentOrder,
} from "@/lib/agent/orderStore";
import { db } from "@/lib/db";
import { notifyShipment } from "@/lib/notify/shipment";
import { getScenePricing, priceQuote, type Quote } from "@/lib/agent/pricing";
import type { AgentIdentity } from "@/lib/agent/auth";

/** 校验后的定制参数（落库时会转成 JSON 文本） */
export type AgentDesign = {
  discColor?: string;
  caseTint?: string;
  spineText?: string;
  spineFont?: string;
  spineTheme?: string;
  spineTextColor?: string;
  showObi?: boolean;
  obiText?: string;
  obiFont?: string;
  obiTheme?: string;
  obiTextColor?: string;
  paperSkin?: string;
  /* ---- 上传素材的引用（详见 normalizeAssetRef） ---- */
  /** 盘面图 */
  discArtUrl?: string;
  /** 外壳正面封面图 */
  caseCoverUrl?: string;
  /** 外壳背面封面图 */
  backCoverUrl?: string;
  /** 盒盖内侧插页 */
  innerLeftUrl?: string;
  /** 托盘底板 */
  innerRightUrl?: string;
  /** 脊背图（优先于脊背文字） */
  spineImageUrl?: string;
  /** 腰封图 */
  obiImageUrl?: string;
  /** 录音（CD 盘面上的那段声音） */
  audioUrl?: string;
  /** 随信照片 / 视频的封面色图 */
  mediaUrl?: string;
  /** 随信视频的原文件（不转码，存的是用户上传的那个 mp4/webm）。
   *  封面色图在 mediaUrl，原文件在这里 —— 两者缺一不可。 */
  mediaVideoUrl?: string;
};

/** design 里可以引用上传素材的字段 */
export const ASSET_FIELDS = [
  "discArtUrl",
  "caseCoverUrl",
  "backCoverUrl",
  "innerLeftUrl",
  "innerRightUrl",
  "spineImageUrl",
  "obiImageUrl",
  "audioUrl",
  "mediaUrl",
  "mediaVideoUrl",
] as const;

export type AgentLetter = {
  text: string;
  fontSize: number;
  color: string;
  signature: string;
  inputMode: "type" | "handwrite";
  /** 手写笔迹图（inputMode=handwrite 时才有意义）—— 上传素材引用 */
  handwritingUrl?: string;
};

/* ------------------------------------------------------------------ */
/*  校验                                                                */
/* ------------------------------------------------------------------ */

export type ValidationError = {
  status: number;
  error: string;
  message: string;
  field?: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v.trim());
}

function oneOf<T extends { id: string }>(list: readonly T[], id: unknown): boolean {
  return (
    typeof id === "string" && list.some((item) => item.id === id.trim())
  );
}

/**
 * 字色归一化：既接受预设 id（ink / paper / orange / silver），
 * 也接受裸 hex（#RRGGBB）。
 *
 * 为什么要收两种：agent 看到「用豆沙色」时会自然地想写 #8B5852，
 * 只认 id 会让这种直觉反复撞墙。两边都收，agent 才能一次写对。
 */
function normalizeColorToken(
  value: unknown,
  presets: readonly { id: string; value: string }[],
  field: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const raw = String(value).trim();
  const preset = presets.find((p) => p.id === raw.toLowerCase());
  if (preset) return { ok: true, value: preset.id };
  if (isHex(raw)) return { ok: true, value: raw.toUpperCase() };
  return {
    ok: false,
    message:
      `${field} 必须是 ${presets.map((p) => p.id).join(" | ")} 之一，` +
      `或 #RRGGBB 形式的 hex 颜色。`,
  };
}

/**
 * 校验一个「上传素材引用」。
 *
 * 只认两种写法：裸 id，或者 /api/uploads/<id>。统一归一成后者。
 *
 * 为什么这么严：design 最终会被渲染成 <img src=...>。
 * 如果这里放开任意 URL，调用方就能塞进 javascript:、data: 或者
 * 外部站点（变成偷看用户 IP 的追踪像素）。白名单只认自家上传端点，
 * 既堵住注入，也保证引用的东西真的存在。
 */
const UPLOAD_ID = /^[A-Za-z0-9_-]{6,64}$/;

function normalizeAssetRef(value: unknown): {
  ok: true;
  value: string | null;
  message?: string;
} {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };

  const prefixed = raw.startsWith("/api/uploads/") ? raw : null;
  const id = prefixed ? prefixed.slice("/api/uploads/".length) : raw;

  if (!UPLOAD_ID.test(id)) {
    return {
      ok: true,
      value: null,
      message:
        `素材引用 "${raw}" 不合法 —— 必须是上传接口返回的 id 或 /api/uploads/<id>。` +
        "先 POST /api/uploads 拿到 id，再填到这个字段。",
    };
  }
  return { ok: true, value: `/api/uploads/${id}` };
}

/**
 * 校验 design 对象。
 * 逐字段给明确报错 —— agent 拿到报错能自己纠正，不用来回问人。
 */
export function normalizeDesign(input: unknown): {
  ok: boolean;
  design: AgentDesign;
  error?: ValidationError;
} {
  const design: AgentDesign = {};
  if (input == null) return { ok: true, design };

  if (typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      design,
      error: {
        status: 400,
        error: "INVALID_DESIGN",
        message: "design 必须是一个对象。",
        field: "design",
      },
    };
  }

  const d = input as Record<string, unknown>;

  if (d.discColor !== undefined && d.discColor !== null) {
    if (!isHex(d.discColor)) {
      return {
        ok: false,
        design,
        error: {
          status: 400,
          error: "INVALID_DESIGN",
          message:
            "design.discColor 必须是 #RRGGBB 形式的 hex 颜色。" +
            `可选预设：${DISC_COLOR_PRESETS.map((c) => `${c.id}=${c.value}`).join(", ")}`,
          field: "design.discColor",
        },
      };
    }
    design.discColor = d.discColor.trim().toUpperCase();
  }

  if (d.caseTint !== undefined && d.caseTint !== null && d.caseTint !== "") {
    if (!isHex(d.caseTint)) {
      return {
        ok: false,
        design,
        error: {
          status: 400,
          error: "INVALID_DESIGN",
          message: "design.caseTint 必须是 #RRGGBB；留空表示透明亚克力。",
          field: "design.caseTint",
        },
      };
    }
    design.caseTint = d.caseTint.trim().toUpperCase();
  }

  if (d.spineText !== undefined && d.spineText !== null) {
    const text = String(d.spineText).slice(0, 60);
    design.spineText = text;
  }

  if (d.spineFont !== undefined && d.spineFont !== null) {
    if (!oneOf(SPINE_FONTS, d.spineFont)) {
      return {
        ok: false,
        design,
        error: {
          status: 400,
          error: "INVALID_DESIGN",
          message: `design.spineFont 必须是 ${SPINE_FONTS.map((f) => f.id).join(" | ")} 之一。`,
          field: "design.spineFont",
        },
      };
    }
    design.spineFont = String(d.spineFont).trim();
  }

  if (d.spineTheme !== undefined && d.spineTheme !== null) {
    if (!oneOf(SPINE_THEMES, d.spineTheme)) {
      return {
        ok: false,
        design,
        error: {
          status: 400,
          error: "INVALID_DESIGN",
          message: `design.spineTheme 必须是 ${SPINE_THEMES.map((t) => t.id).join(" | ")} 之一。`,
          field: "design.spineTheme",
        },
      };
    }
    design.spineTheme = String(d.spineTheme).trim();
  }

  if (d.spineTextColor !== undefined && d.spineTextColor !== null) {
    const color = normalizeColorToken(
      d.spineTextColor,
      SPINE_TEXT_COLORS,
      "design.spineTextColor",
    );
    if (!color.ok) {
      return {
        ok: false,
        design,
        error: {
          status: 400,
          error: "INVALID_DESIGN",
          message: color.message,
          field: "design.spineTextColor",
        },
      };
    }
    design.spineTextColor = color.value;
  }

  if (d.showObi !== undefined && d.showObi !== null) {
    design.showObi = Boolean(d.showObi);
  }

  if (d.obiText !== undefined && d.obiText !== null) {
    design.obiText = String(d.obiText).slice(0, 60);
  }

  if (d.obiFont !== undefined && d.obiFont !== null) {
    if (!oneOf(SPINE_FONTS, d.obiFont)) {
      return {
        ok: false,
        design,
        error: {
          status: 400,
          error: "INVALID_DESIGN",
          message: `design.obiFont 必须是 ${SPINE_FONTS.map((f) => f.id).join(" | ")} 之一。`,
          field: "design.obiFont",
        },
      };
    }
    design.obiFont = String(d.obiFont).trim();
  }

  if (d.obiTheme !== undefined && d.obiTheme !== null) {
    if (!oneOf(SPINE_THEMES, d.obiTheme)) {
      return {
        ok: false,
        design,
        error: {
          status: 400,
          error: "INVALID_DESIGN",
          message: `design.obiTheme 必须是 ${SPINE_THEMES.map((t) => t.id).join(" | ")} 之一。`,
          field: "design.obiTheme",
        },
      };
    }
    design.obiTheme = String(d.obiTheme).trim();
  }

  if (d.obiTextColor !== undefined && d.obiTextColor !== null) {
    const color = normalizeColorToken(
      d.obiTextColor,
      SPINE_TEXT_COLORS,
      "design.obiTextColor",
    );
    if (!color.ok) {
      return {
        ok: false,
        design,
        error: {
          status: 400,
          error: "INVALID_DESIGN",
          message: color.message,
          field: "design.obiTextColor",
        },
      };
    }
    design.obiTextColor = color.value;
  }

  if (d.paperSkin !== undefined && d.paperSkin !== null && d.paperSkin !== "") {
    if (!oneOf(PAPER_SKINS, d.paperSkin)) {
      return {
        ok: false,
        design,
        error: {
          status: 400,
          error: "INVALID_DESIGN",
          message: `design.paperSkin 必须是 ${PAPER_SKINS.map((s) => s.id).join(" | ")} 之一。`,
          field: "design.paperSkin",
        },
      };
    }
    design.paperSkin = String(d.paperSkin).trim();
  }

  /* ---- 上传素材引用 ---- */
  for (const field of ASSET_FIELDS) {
    const raw = (d as Record<string, unknown>)[field];
    if (raw === undefined || raw === null || raw === "") continue;
    const ref = normalizeAssetRef(raw);
    if (ref.message) {
      return {
        ok: false,
        design,
        error: {
          status: 400,
          error: "INVALID_DESIGN",
          message: `design.${field} ${ref.message}`,
          field: `design.${field}`,
        },
      };
    }
    if (ref.value) (design as Record<string, unknown>)[field] = ref.value;
  }

  return { ok: true, design };
}

export function normalizeLetter(input: unknown): {
  ok: boolean;
  letter: AgentLetter;
  error?: ValidationError;
} {
  const letter: AgentLetter = {
    text: "",
    fontSize: 14,
    color: "#333333",
    signature: "",
    inputMode: "type",
  };

  if (input == null) return { ok: true, letter };
  if (typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      letter,
      error: {
        status: 400,
        error: "INVALID_LETTER",
        message: "letter 必须是一个对象。",
        field: "letter",
      },
    };
  }

  const l = input as Record<string, unknown>;

  if (l.text !== undefined && l.text !== null) {
    letter.text = String(l.text).slice(0, 2000);
  }
  if (l.fontSize !== undefined && l.fontSize !== null) {
    const n = Number(l.fontSize);
    if (!Number.isFinite(n) || n < 10 || n > 28) {
      return {
        ok: false,
        letter,
        error: {
          status: 400,
          error: "INVALID_LETTER",
          message: "letter.fontSize 必须是 10–28 之间的数字（px）。",
          field: "letter.fontSize",
        },
      };
    }
    letter.fontSize = Math.round(n);
  }
  if (l.color !== undefined && l.color !== null && l.color !== "") {
    if (!isHex(l.color)) {
      return {
        ok: false,
        letter,
        error: {
          status: 400,
          error: "INVALID_LETTER",
          message: "letter.color 必须是 #RRGGBB 形式的 hex 颜色。",
          field: "letter.color",
        },
      };
    }
    letter.color = l.color.trim().toUpperCase();
  }
  if (l.signature !== undefined && l.signature !== null) {
    letter.signature = String(l.signature).slice(0, 60);
  }
  if (l.inputMode !== undefined && l.inputMode !== null) {
    const mode = String(l.inputMode).trim();
    if (mode !== "type" && mode !== "handwrite") {
      return {
        ok: false,
        letter,
        error: {
          status: 400,
          error: "INVALID_LETTER",
          message: 'letter.inputMode 只能是 "type" 或 "handwrite"。',
          field: "letter.inputMode",
        },
      };
    }

    /* 手写笔迹本身是图片 —— 有上传端点之后它就能传了：
       先 POST /api/uploads 拿到 id，填进 letter.handwritingUrl。
       没有笔迹图却声明手写，仍然拒绝（否则订单记的是一张"手写信"却没有字）。 */
    const handwriting = normalizeAssetRef(l.handwritingUrl);
    if (handwriting.message) {
      return {
        ok: false,
        letter,
        error: {
          status: 400,
          error: "INVALID_LETTER",
          message: `letter.handwritingUrl ${handwriting.message}`,
          field: "letter.handwritingUrl",
        },
      };
    }

    if (mode === "handwrite") {
      if (!handwriting.value) {
        return {
          ok: false,
          letter,
          error: {
            status: 400,
            error: "HANDWRITE_UNSUPPORTED",
            message:
              "手写模式必须同时提供 letter.handwritingUrl —— 手写笔迹是图片，" +
              "先用 POST /api/uploads 上传拿到 id 再填进来。" +
              '如果拿不到图片，请改用 "type"，把内容直接写成 letter.text。',
            field: "letter.handwritingUrl",
          },
        };
      }
      letter.inputMode = "handwrite";
      letter.handwritingUrl = handwriting.value;
    } else {
      letter.inputMode = "type";
      if (handwriting.value) letter.handwritingUrl = handwriting.value;
    }
  } else if (l.handwritingUrl !== undefined && l.handwritingUrl !== null) {
    const handwriting = normalizeAssetRef(l.handwritingUrl);
    if (handwriting.message) {
      return {
        ok: false,
        letter,
        error: {
          status: 400,
          error: "INVALID_LETTER",
          message: `letter.handwritingUrl ${handwriting.message}`,
          field: "letter.handwritingUrl",
        },
      };
    }
    if (handwriting.value) letter.handwritingUrl = handwriting.value;
  }

  return { ok: true, letter };
}

/* ------------------------------------------------------------------ */
/*  建单（报价，不扣款）                                                  */
/* ------------------------------------------------------------------ */

export type CreateOrderInput = {
  productId?: unknown;
  quantity?: unknown;
  deliveryDate?: unknown;
  receiver?: unknown;
  design?: unknown;
  letter?: unknown;
};

export async function quoteOrder(
  input: CreateOrderInput,
  identity: AgentIdentity,
): Promise<
  { ok: true; order: AgentOrder } | { ok: false; error: ValidationError }
> {
  const productId = String(input.productId ?? "").trim().toLowerCase();
  if (!productId) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "MISSING_PRODUCT_ID",
        message:
          "缺少 productId。先调用 GET /api/agent/v1/catalog 拿到可选的场景 id。",
        field: "productId",
      },
    };
  }
  if (!isKnownSceneId(productId)) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "UNKNOWN_PRODUCT",
        message: `productId "${productId}" 不存在。可选：${getSceneListing()}`,
        field: "productId",
      },
    };
  }

  const scene = getScene(productId)!;

  const designResult = normalizeDesign(input.design);
  if (!designResult.ok) {
    return { ok: false, error: designResult.error! };
  }

  const letterResult = normalizeLetter(input.letter);
  if (!letterResult.ok) {
    return { ok: false, error: letterResult.error! };
  }

  // 收件人：允许只给一个字符串或一个对象
  const rawReceiver = input.receiver;
  let receiverName = "";
  let receiverNote: string | undefined;
  if (typeof rawReceiver === "string") {
    receiverName = rawReceiver.trim();
  } else if (rawReceiver && typeof rawReceiver === "object") {
    const r = rawReceiver as Record<string, unknown>;
    receiverName = String(r.name ?? "").trim();
    if (r.note != null) receiverNote = String(r.note).slice(0, 200);
  }
  const receivers = normalizeReceivers(receiverName || "收件人");

  /**
   * 收件人如果是一个**站内用户名**，就把订单挂到 TA 名下 ——
   * 这样「收到」和「回礼」才有落点。
   *
   * 为什么要剥掉前导的 @：用户（和 agent）很自然会写成 `@mama`。
   * handle 的合法字符集里没有 @，不剥的话永远匹配不上站内账号 ——
   * 收件人明明注册了，CD 却只落在「一个叫 @mama 的站外收件人」名下。
   */
  let receiverHandle: string | null = null;
  const maybeHandle = receivers[0]?.trim().replace(/^@/, "").toLowerCase();
  if (maybeHandle && /^[a-z0-9_-]{3,24}$/.test(maybeHandle)) {
    const found = await db.findUserByHandle(maybeHandle);
    if (found) receiverHandle = found.handle;
  }

  const quantity =
    normalizeQuantity(input.quantity) ?? receivers.length ?? 1;

  const deliveryDate = normalizeDeliveryDate(input.deliveryDate);

  // 算价 + 生成运单 + 写摘要 —— 纯函数，跟网页端 / 平台 AI 无关
  const plan: ShipmentPlan = buildShipmentPlan({
    receivers,
    scene: productId,
    deliveryDate,
    customText: letterResult.letter.text,
    quantity,
  });

  const quote: Quote = priceQuote(productId, quantity);

  // design 里没给的颜色 / 模板，回落到场景默认
  const design: AgentDesign = {
    discColor: designResult.design.discColor ?? scene.baseColor,
    showObi: designResult.design.showObi ?? true,
    obiText: designResult.design.obiText ?? scene.obi.text,
    obiFont: designResult.design.obiFont ?? "serif",
    obiTheme: designResult.design.obiTheme ?? "light",
    obiTextColor: designResult.design.obiTextColor ?? "#1C2329",
    spineText: designResult.design.spineText ?? "halloCD",
    spineFont: designResult.design.spineFont ?? "serif",
    spineTheme: designResult.design.spineTheme ?? "glass",
    spineTextColor: designResult.design.spineTextColor ?? "#1C2329",
    paperSkin: designResult.design.paperSkin ?? scene.paperTemplate,
    ...(designResult.design.caseTint
      ? { caseTint: designResult.design.caseTint }
      : {}),
    /* 上传素材的引用 —— 逐字段重建 design 时最容易漏掉的就是这一组 */
    ...(designResult.design.discArtUrl
      ? { discArtUrl: designResult.design.discArtUrl }
      : {}),
    ...(designResult.design.caseCoverUrl
      ? { caseCoverUrl: designResult.design.caseCoverUrl }
      : {}),
    ...(designResult.design.backCoverUrl
      ? { backCoverUrl: designResult.design.backCoverUrl }
      : {}),
    ...(designResult.design.innerLeftUrl
      ? { innerLeftUrl: designResult.design.innerLeftUrl }
      : {}),
    ...(designResult.design.innerRightUrl
      ? { innerRightUrl: designResult.design.innerRightUrl }
      : {}),
    ...(designResult.design.spineImageUrl
      ? { spineImageUrl: designResult.design.spineImageUrl }
      : {}),
    ...(designResult.design.obiImageUrl
      ? { obiImageUrl: designResult.design.obiImageUrl }
      : {}),
    ...(designResult.design.audioUrl
      ? { audioUrl: designResult.design.audioUrl }
      : {}),
    ...(designResult.design.mediaUrl
      ? { mediaUrl: designResult.design.mediaUrl }
      : {}),
    ...(designResult.design.mediaVideoUrl
      ? { mediaVideoUrl: designResult.design.mediaVideoUrl }
      : {}),
  };

  /* 命中站内用户时，收件人显示名去掉前导的 @ ——
     那是 mention 记号，不是名字的一部分（不然邮件里会写「收件人 @mama」）。 */
  const finalReceiverName = receiverHandle
    ? receivers[0].trim().replace(/^@/, "")
    : receivers[0];

  const order = await createOrder({
    userId: identity.userId,
    senderHandle: identity.handle,
    receiverHandle,
    receiverName: finalReceiverName,
    giftToken: buildGiftToken(),
    productId,
    quantity,
    deliveryDate,
    design: design as unknown as Record<string, unknown>,
    letter: letterResult.letter as unknown as Record<string, unknown>,
    quote: quote as unknown as Record<string, unknown>,
    plan: plan as unknown as Record<string, unknown>,
  });

  return { ok: true, order };
}

function getSceneListing(): string {
  return ["christmas", "birthday", "anniversary", "wedding", "graduation", "everyday"].join(
    " | ",
  );
}

/* ------------------------------------------------------------------ */
/*  支付（扣款 + 生成寄送任务）                                            */
/* ------------------------------------------------------------------ */

/**
 * 付款时那次「发货通知」的结果。
 *
 * 为什么要在响应里回报：agent 要把结果复述给用户
 * （「已付款，发货通知已发出」/「已付款，但没配发信服务，收不到邮件」）。
 * 平台知道真相，就该由平台说 —— 让 agent 自己猜是最容易出错的地方。
 */
export type PaymentNotification = {
  /** 本次是否真的发了信 */
  sent: boolean;
  /** 没发的原因（null = 发了） */
  skipped: string | null;
};

export type PayResult =
  | {
      ok: true;
      order: AgentOrder;
      steps: ReturnType<typeof buildAgentSteps>;
      alreadyPaid: boolean;
      notification: PaymentNotification;
    }
  | { ok: false; error: ValidationError; order?: AgentOrder };

/**
 * 付款成功后的落库 —— **两条付款路径共用这一步**。
 *
 *   代付（agent 路径）：payOrder → createCapturedOrder → 这里
 *   直付（网页端路径）：用户批准 → captureApprovedOrder → 这里
 *
 * 拆出来不是为了好看，而是因为「扣完钱之后要做的事」必须一模一样：
 * 生成运单 → 订单置为 paid → 发发货通知。
 * 两边各写一份，迟早会长出「网页端寄了、agent 没寄」的差异。
 *
 * 顺带记下一件事：payment_json 是**整列替换**，
 * 网页端的一次性付款凭据就存在这一列里 —— 这里必须把它带过去，
 * 否则用户付完款之后，反而认不出自己刚付的那一单。
 */
export type SettleInput = {
  paypalOrderId: string;
  captureId: string | null;
  status: string;
  amount: string | null;
  currency: string | null;
};

export type SettleResult =
  | { ok: true; order: AgentOrder; notification: PaymentNotification }
  | { ok: false; error: ValidationError; order?: AgentOrder };

export async function settlePaidOrder(
  order: AgentOrder,
  payment: SettleInput,
): Promise<SettleResult> {
  const plan = order.plan as unknown as ShipmentPlan;
  const quote = order.quote as unknown as Quote;

  // TODO(MCP): 这里换成真实物流 MCP 调用
  const shipment = {
    trackingNumber: plan.shipment?.trackingNumber ?? "",
    eta: plan.shipment?.eta ?? order.deliveryDate,
    carrier: plan.shipment?.carrier ?? "halloCD Express",
    /* v2.8 / G17：物流状态机。运单号一生成 = 已发货（进入寄送流程），
       之后可以由 POST /api/agent/v1/orders/<id>/shipment 推进到 delivered。 */
    status: "shipped" as const,
    shippedAt: new Date().toISOString(),
  };

  const previous = (order.payment as Record<string, unknown> | null) ?? {};
  const paymentJson: Record<string, unknown> = {
    ...previous,
    paypalOrderId: payment.paypalOrderId,
    captureId: payment.captureId ?? undefined,
    status: payment.status,
    amount: payment.amount ?? String(quote.total),
    currency: payment.currency ?? String(quote.currency),
    paidAt: new Date().toISOString(),
  };

  const updated = (await updateOrder(order.id, {
    status: "paid",
    payment: paymentJson,
    shipment,
    error: null,
  }))!;

  /* v2.8 / G17：发货通知 —— 通知失败绝不影响订单成功 */
  const notice = await notifyShipment(updated, "shipped");

  /* 把「通知到底发出去没有」也落库 ——
     网页端付完款是跳回页面再查库才知道结果的，
     没有这一笔，页面只能靠猜。 */
  const withNotice =
    (await updateOrder(order.id, {
      payment: {
        ...paymentJson,
        notify: { sent: notice.sent, skipped: notice.skipped ?? null },
      },
    })) ?? updated;

  return {
    ok: true,
    order: withNotice,
    notification: { sent: notice.sent, skipped: notice.skipped ?? null },
  };
}

/**
 * 代付：agent 代替用户付款（无感扣款）。
 *
 * 走 PayPal 的 payment_source 通道 —— vault 或沙盒测试卡，
 * 服务端直接建单即完成，用户全程不参与。
 * 网页端**不走这条路**（用户要在 PayPal 上自己确认），
 * 那条路是 payOrderApproved。
 */
export async function payOrder(
  orderId: string,
): Promise<PayResult> {
  const order = await getOrder(orderId);
  if (!order) {
    return {
      ok: false,
      error: {
        status: 404,
        error: "ORDER_NOT_FOUND",
        message: `订单 ${orderId} 不存在。`,
      },
    };
  }

  const plan = order.plan as unknown as ShipmentPlan;
  const quote = order.quote as unknown as Quote;

  // 幂等：已支付过就直接回同一份结果，agent 重试不会重复扣款
  if (order.status === "paid" && order.payment) {
    return {
      ok: true,
      order,
      steps: buildAgentSteps(plan, "done", {
        paypalOrderId: String(order.payment.paypalOrderId ?? ""),
        paymentStatus: String(order.payment.status ?? ""),
      }),
      alreadyPaid: true,
      /* 已经付过了 —— 这次调用不会再发一遍通知 */
      notification: { sent: false, skipped: "already_paid" },
    };
  }

  const config = readPayPalConfig();
  if (!hasCredentials(config)) {
    return {
      ok: false,
      order,
      error: {
        status: 503,
        error: "MISSING_CREDENTIALS",
        message:
          "服务端缺少 PayPal 凭据：请在 .env.local 配置 PAYPAL_CLIENT_ID 与 PAYPAL_CLIENT_SECRET",
      },
    };
  }

  let payment;
  try {
    payment = await createCapturedOrder({
      amount: String(quote.total),
      currency: String(quote.currency),
      description: `halloCD ${plan.sceneLabel} x${order.quantity} -> ${plan.receivers.join(", ")}`,
      referenceId: `AGENT-${order.deliveryDate}-${order.quantity}`,
      customId: "halloCD-agent-platform",
      config,
    });
  } catch (error) {
    const isPayPalError = error instanceof PayPalError;
    const status =
      isPayPalError && error.status >= 400 && error.status < 600
        ? error.status
        : 502;

    await updateOrder(order.id, {
      status: "failed",
      error: {
        code: isPayPalError ? error.issue : "PAYPAL_REQUEST_FAILED",
        message: error instanceof Error ? error.message : "PayPal 请求失败",
      },
    });

    return {
      ok: false,
      error: {
        status,
        error: isPayPalError ? error.issue : "PAYPAL_REQUEST_FAILED",
        message: error instanceof Error ? error.message : "PayPal 请求失败",
      },
      order: (await getOrder(order.id)) ?? order,
    };
  }

  if (payment.status !== "COMPLETED") {
    await updateOrder(order.id, {
      status: "failed",
      error: {
        code: "PAYMENT_NOT_COMPLETED",
        message: `PayPal 订单未完成支付（当前状态：${payment.status}）`,
      },
    });
    return {
      ok: false,
      error: {
        status: 402,
        error: "PAYMENT_NOT_COMPLETED",
        message: `PayPal 订单未完成支付（当前状态：${payment.status}）`,
      },
      order: (await getOrder(order.id)) ?? order,
    };
  }

  const settled = await settlePaidOrder(order, {
    paypalOrderId: payment.orderId,
    captureId: payment.captureId,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
  });
  if (!settled.ok) {
    return { ok: false, error: settled.error, order: settled.order };
  }

  return {
    ok: true,
    order: settled.order,
    steps: buildAgentSteps(plan, "done", {
      paypalOrderId: payment.orderId,
      paymentStatus: payment.status,
    }),
    alreadyPaid: false,
    notification: settled.notification,
  };
}

/**
 * 直付：用户已经在 PayPal 收银台上点过「确认付款」之后的那一步。
 *
 * 与 payOrder 的区别只有一处：**钱已经由用户自己付掉了**，
 * 这里做的是把这张已批准的 PayPal 单 capture 下来，然后走同一套落库。
 *
 * 安全前提：paypalOrderId 必须是**我们自己为这一单建的那张** PayPal 单
 * （建单时已经记在订单的 payment_json 里）。
 * 不校验的话，任何人拿自己的一张 PayPal 单过来，我们就会替他 capture。
 */
export async function payOrderApproved(
  orderId: string,
  paypalOrderId: string,
): Promise<PayResult> {
  const order = await getOrder(orderId);
  if (!order) {
    return {
      ok: false,
      error: {
        status: 404,
        error: "ORDER_NOT_FOUND",
        message: `订单 ${orderId} 不存在。`,
      },
    };
  }

  const plan = order.plan as unknown as ShipmentPlan;

  // 幂等：用户重复点「确认付款」或刷新回跳页，都不会二次扣款
  if (order.status === "paid" && order.payment) {
    return {
      ok: true,
      order,
      steps: buildAgentSteps(plan, "done", {
        paypalOrderId: String(order.payment.paypalOrderId ?? ""),
        paymentStatus: String(order.payment.status ?? ""),
      }),
      alreadyPaid: true,
      notification: { sent: false, skipped: "already_paid" },
    };
  }

  const stored = String(
    (order.payment as Record<string, unknown> | null)?.paypalOrderId ?? "",
  );
  if (!stored || stored !== paypalOrderId) {
    return {
      ok: false,
      order,
      error: {
        status: 400,
        error: "PAYPAL_ORDER_MISMATCH",
        message: "这笔付款对应的不是本订单的 PayPal 单。",
      },
    };
  }

  const config = readPayPalConfig();
  if (!hasCredentials(config)) {
    return {
      ok: false,
      order,
      error: {
        status: 503,
        error: "MISSING_CREDENTIALS",
        message:
          "服务端缺少 PayPal 凭据：请在 .env.local 配置 PAYPAL_CLIENT_ID 与 PAYPAL_CLIENT_SECRET",
      },
    };
  }

  let captured;
  try {
    captured = await captureApprovedOrder({ orderId: paypalOrderId, config });
  } catch (error) {
    const isPayPalError = error instanceof PayPalError;
    const status =
      isPayPalError && error.status >= 400 && error.status < 600
        ? error.status
        : 502;
    return {
      ok: false,
      error: {
        status,
        error: isPayPalError ? error.issue : "PAYPAL_CAPTURE_FAILED",
        message: error instanceof Error ? error.message : "PayPal 扣款失败",
      },
      order,
    };
  }

  if (captured.status !== "COMPLETED") {
    await updateOrder(order.id, {
      status: "failed",
      error: {
        code: "PAYMENT_NOT_COMPLETED",
        message: `PayPal 订单未完成支付（当前状态：${captured.status}）`,
      },
    });
    return {
      ok: false,
      error: {
        status: 402,
        error: "PAYMENT_NOT_COMPLETED",
        message: `PayPal 订单未完成支付（当前状态：${captured.status}）`,
      },
      order: (await getOrder(order.id)) ?? order,
    };
  }

  const settled = await settlePaidOrder(order, {
    paypalOrderId,
    captureId: captured.captureId,
    status: captured.status,
    amount: captured.amount,
    currency: captured.currency,
  });
  if (!settled.ok) {
    return { ok: false, error: settled.error, order: settled.order };
  }

  return {
    ok: true,
    order: settled.order,
    steps: buildAgentSteps(plan, "done", {
      paypalOrderId,
      paymentStatus: captured.status,
    }),
    alreadyPaid: false,
    notification: settled.notification,
  };
}

/** 给 agent 看的人类可读摘要 —— 便于它直接复述给用户 */
export function describeOrder(order: AgentOrder): string {
  const plan = order.plan as unknown as ShipmentPlan;
  const quote = order.quote as unknown as Quote;
  const shipment = order.shipment as
    | { trackingNumber?: string; eta?: string; carrier?: string }
    | null;

  const lines = [
    `订单 ${order.id}（${order.status}）`,
    `场景：${plan.sceneLabel} · ${plan.theme}`,
    `收件人：${order.receiverName}`,
    `数量：${order.quantity} 张`,
    `合计：${quote.total} ${quote.currency}（单价 ${quote.unitPrice} + 运费 ${quote.shipping}）`,
    `预计送达：${order.deliveryDate}`,
  ];
  if (shipment?.trackingNumber) {
    lines.push(
      `运单号：${shipment.trackingNumber}（${shipment.carrier ?? "halloCD Express"}）`,
    );
  }
  const design = (order.design ?? {}) as AgentDesign;
  const assets = [
    design.audioUrl ? "含录音" : null,
    design.discArtUrl ? "自制盘面图" : null,
    design.caseCoverUrl ? "自制外壳封面" : null,
    design.obiImageUrl ? "自制腰封图" : null,
  ].filter(Boolean);
  if (assets.length) {
    lines.push(`盘面素材：${assets.join(" · ")}`);
  }
  if (order.giftToken) {
    lines.push(`回礼链接：/r/${order.giftToken}`);
  }
  return lines.join("\n");
}

/**
 * 英文版订单摘要 —— 与 describeOrder 逐行对应（同样的事实、同样的数字，只是语言不同）。
 *
 * 为什么 Agent API 也要有英文版：agent 拿到 summary 是**直接复述给用户**的。
 * 用户用英文、agent 用英文，就必须有一份能直接说出口的英文摘要 ——
 * 让 agent 自己去翻译，等于把一份「中文摘要」硬塞给英文用户。
 *
 * 老订单（升级前落库的）plan 里没有 themeEn / sceneLabelEn，
 * 这里用场景定价表回填，保证任何历史订单都能出英文摘要。
 */
export function describeOrderEn(order: AgentOrder): string {
  const plan = order.plan as unknown as ShipmentPlan;
  const quote = order.quote as unknown as Quote;
  const shipment = order.shipment as
    | { trackingNumber?: string; eta?: string; carrier?: string }
    | null;

  const scenePricing = getScenePricing(plan.scene);
  const sceneLabel = plan.sceneLabel || scenePricing.label;
  const theme = plan.themeEn || scenePricing.themeEn;

  const lines = [
    `Order ${order.id} (${order.status})`,
    `Scene: ${sceneLabel} · ${theme}`,
    `Receiver: ${order.receiverName}`,
    `Quantity: ${order.quantity} disc(s)`,
    `Total: ${quote.total} ${quote.currency} (unit ${quote.unitPrice} + shipping ${quote.shipping})`,
    `Estimated delivery: ${order.deliveryDate}`,
  ];
  if (shipment?.trackingNumber) {
    lines.push(
      `Tracking number: ${shipment.trackingNumber} (${shipment.carrier ?? "halloCD Express"})`,
    );
  }
  const design = (order.design ?? {}) as AgentDesign;
  const assets = [
    design.audioUrl ? "includes recording" : null,
    design.discArtUrl ? "custom disc face" : null,
    design.caseCoverUrl ? "custom case cover" : null,
    design.obiImageUrl ? "custom obi strip" : null,
  ].filter(Boolean);
  if (assets.length) {
    lines.push(`Disc assets: ${assets.join(" · ")}`);
  }
  if (order.giftToken) {
    lines.push(`Gift-back link: /r/${order.giftToken}`);
  }
  return lines.join("\n");
}

export { SPINE_TEMPLATES, OBI_TEMPLATES };
