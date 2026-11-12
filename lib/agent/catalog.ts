/**
 * halloCD Agent API · 产品目录（Catalog）
 * ==================================================================
 * 这是**外部 coding agent 的"读世界"入口**。
 *
 * 为什么要有一份显式的目录：
 *   平台要被"任何人自己的 coding agent"驱动，前提是 agent 能在不打开网页、
 *   不猜字段的前提下知道「能做什么、可定制什么、多少钱」。
 *   所以这里的每个字段都带 id / label / 取值域 —— 是给模型读的，不是给人看的。
 *
 * 设计词汇表（spineFonts / obiTemplates / paperSkins …）与
 * components/CustomizationPanel.tsx 保持一致。CustomizationPanel 是
 * "use client" 组件，服务端 import 不到它的导出，所以这里独立维护一份，
 * 改那边记得同步这边（见 docs/agent-platform-README.md 的「同步清单」）。
 */

import { PAPER_SKINS } from "@/components/paperSkins";
import { PRODUCTS } from "@/lib/products";
import {
  CURRENCY,
  SCENE_PRICING,
  SHIPPING_FLAT,
  isKnownScene,
} from "@/lib/agent/pricing";

export const CATALOG_VERSION = "v1";

/* ------------------------------------------------------------------ */
/*  设计词汇表（与 CustomizationPanel 对齐）                              */
/* ------------------------------------------------------------------ */

export const SPINE_FONTS = [
  { id: "serif", label: "衬线", labelEn: "Serif" },
  { id: "sans", label: "无衬线", labelEn: "Sans" },
  { id: "mono", label: "等宽", labelEn: "Mono" },
  { id: "song", label: "宋体", labelEn: "Songti" },
] as const;

export const SPINE_THEMES = [
  { id: "glass", label: "透明磨砂", labelEn: "Frosted glass", bg: "transparent" },
  { id: "dark", label: "黑底", labelEn: "Dark", bg: "#1C2329" },
  { id: "light", label: "白底", labelEn: "Light", bg: "#FAF6EE" },
] as const;

export const SPINE_TEXT_COLORS = [
  { id: "ink", label: "墨黑", labelEn: "Ink", value: "#1C2329" },
  { id: "paper", label: "米白", labelEn: "Paper", value: "#F8F4EC" },
  { id: "orange", label: "赤橘", labelEn: "Orange", value: "#E65100" },
  { id: "silver", label: "银灰", labelEn: "Silver", value: "#9AA3A8" },
] as const;

export const SPINE_TEMPLATES = [
  {
    id: "love",
    label: "To My Love",
    text: "To My Love",
    font: "serif",
    theme: "glass",
    color: "#1C2329",
  },
  {
    id: "birthday",
    label: "Happy Birthday",
    text: "Happy Birthday",
    font: "sans",
    theme: "glass",
    color: "#E65100",
  },
  {
    id: "date",
    label: "2026.11.07",
    text: "2026.11.07",
    font: "mono",
    theme: "glass",
    color: "#1C2329",
  },
  {
    id: "letter",
    label: "致最爱的你",
    text: "致最爱的你",
    font: "song",
    theme: "light",
    color: "#9AA3A8",
  },
] as const;

export const OBI_TEMPLATES = [
  {
    id: "obiLove",
    label: "To My Love",
    text: "To My Love",
    font: "serif",
    theme: "light",
    color: "#1C2329",
  },
  {
    id: "obiBirthday",
    label: "Happy Birthday",
    text: "Happy Birthday",
    font: "sans",
    theme: "dark",
    color: "#F8F4EC",
  },
  {
    id: "obiDate",
    label: "2026.11.07",
    text: "2026.11.07",
    font: "mono",
    theme: "glass",
    color: "#1C2329",
  },
  {
    id: "obiLetter",
    label: "致最爱的你",
    text: "致最爱的你",
    font: "song",
    theme: "light",
    color: "#E65100",
  },
] as const;

/** 常用碟面底色建议（自由填 hex 也行，这里只是给 agent 起步用的调色板） */
export const DISC_COLOR_PRESETS = [
  { id: "ink", label: "墨黑", value: "#1C2329" },
  { id: "cream", label: "米白", value: "#F8F4EC" },
  { id: "orange", label: "赤橘", value: "#E65100" },
  { id: "gold", label: "暖金", value: "#AF8E5C" },
  { id: "rose", label: "豆沙", value: "#8B5852" },
  { id: "pine", label: "松墨绿", value: "#2E3A31" },
  { id: "navy", label: "学院蓝", value: "#1B3A6B" },
  { id: "silver", label: "银灰", value: "#9AA3A8" },
] as const;

/* ------------------------------------------------------------------ */
/*  场景                                                                */
/* ------------------------------------------------------------------ */

export type CatalogScene = {
  id: string;
  label: string;
  labelZh: string;
  theme: string;
  unitPrice: number;
  currency: string;
  description: string;
  /** 纯 SVG 封面变体（无实拍图时使用） */
  art: string | null;
  /** 默认碟面底色 */
  baseColor: string;
  /** 默认腰封 */
  obi: { text: string; bg: string };
  /** 随碟附赠的便签 */
  note: {
    text: string;
    textZh: string;
    cta: string;
    ctaZh: string;
  };
  /** 该场景默认使用的信纸模板 id */
  paperTemplate: string;
  /** 可下载的成品物料 */
  assets: { cover: string; back: string; disc: string };
  /** 英文主题描述 */
  themeEn: string;
};

function buildScene(productId: string): CatalogScene | null {
  const product = PRODUCTS.find((p) => p.id === productId);
  const pricing = SCENE_PRICING[productId];
  if (!product || !pricing) return null;

  return {
    id: product.id,
    label: pricing.label,
    labelZh: pricing.labelZh,
    theme: pricing.theme,
    themeEn: pricing.themeEn,
    unitPrice: pricing.unitPrice,
    currency: CURRENCY,
    description: product.description,
    art: product.art ?? null,
    baseColor: product.base,
    obi: { text: product.obi.text, bg: product.obi.bg },
    note: {
      text: product.noteText,
      textZh: product.noteTextZh,
      cta: product.noteCtaEn,
      ctaZh: product.noteCtaZh,
    },
    paperTemplate: product.noteTemplate,
    assets: {
      cover: product.coverImage,
      back: product.backCoverImage,
      disc: product.discImage,
    },
  };
}

export function listScenes(): CatalogScene[] {
  return Object.keys(SCENE_PRICING)
    .map((id) => buildScene(id))
    .filter((s): s is CatalogScene => s !== null);
}

export function getScene(id: string): CatalogScene | null {
  return buildScene(String(id ?? "").trim().toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  完整目录                                                            */
/* ------------------------------------------------------------------ */

export function buildCatalog() {
  return {
    service: "halloCD",
    version: CATALOG_VERSION,
    currency: CURRENCY,
    shippingFlat: SHIPPING_FLAT,
    /** 一句话说清这个平台能干什么 */
    summary:
      "halloCD 是一张带 NFC 芯片的实体定制 CD（光盘 + 亚克力外壳 + 定制信纸）。" +
      "你可以为任意收件人定制一张，付款后平台生成寄送任务并返回运单号。",
    /** agent 的完整能力清单 —— 技能包就是照着这个写的 */
    capabilities: [
      "catalog.read",
      "orders.create",
      "orders.read",
      "orders.pay",
      "templates.read",
      "templates.download",
      "uploads.create",
    ],
    scenes: listScenes(),
    designOptions: {
      discColors: DISC_COLOR_PRESETS,
      spineFonts: SPINE_FONTS,
      spineThemes: SPINE_THEMES,
      spineTextColors: SPINE_TEXT_COLORS,
      spineTemplates: SPINE_TEMPLATES,
      obiTemplates: OBI_TEMPLATES,
      paperSkins: PAPER_SKINS.map((s) => ({
        id: s.id,
        name: s.name,
        src: s.src,
        ratio: s.ratio,
      })),
    },
    /** 下单时 design 对象每个字段的取值域 —— 照抄即可 */
    designSchema: {
      discColor: {
        type: "string",
        required: false,
        description: "碟面底色 hex，如 #2E3A31。不传则用场景默认色。",
      },
      caseTint: {
        type: "string",
        required: false,
        description: "亚克力外壳着色 hex。留空表示透明亚克力。",
      },
      spineText: {
        type: "string",
        required: false,
        maxLength: 60,
        description: "侧边脊背文字（放在架子上唯一露出的部分）。",
      },
      spineFont: {
        type: "string",
        required: false,
        enum: SPINE_FONTS.map((f) => f.id),
      },
      spineTheme: {
        type: "string",
        required: false,
        enum: SPINE_THEMES.map((t) => t.id),
      },
      spineTextColor: {
        type: "string",
        required: false,
        enum: SPINE_TEXT_COLORS.map((c) => c.id),
        description:
          "脊背字色。可用预设 id（ink/paper/orange/silver），也可直接给 #RRGGBB。",
      },
      showObi: {
        type: "boolean",
        required: false,
        description: "是否贴腰封纸带。",
      },
      obiText: {
        type: "string",
        required: false,
        maxLength: 60,
        description: "腰封文字，竖排显示。",
      },
      obiFont: {
        type: "string",
        required: false,
        enum: SPINE_FONTS.map((f) => f.id),
      },
      obiTheme: {
        type: "string",
        required: false,
        enum: SPINE_THEMES.map((t) => t.id),
      },
      obiTextColor: {
        type: "string",
        required: false,
        enum: SPINE_TEXT_COLORS.map((c) => c.id),
        description:
          "腰封字色。可用预设 id（ink/paper/orange/silver），也可直接给 #RRGGBB。",
      },
      paperSkin: {
        type: "string",
        required: false,
        enum: PAPER_SKINS.map((s) => s.id),
        description: "信纸皮肤 id。不传则用场景默认模板。",
      },

      /* ---- 上传素材 ---- */
      discArtUrl: {
        type: "string",
        required: false,
        description:
          "盘面图。先 POST /api/uploads 拿到 id，再填 id 或 /api/uploads/<id>。",
      },
      caseCoverUrl: {
        type: "string",
        required: false,
        description: "外壳正面封面图。同样先上传再填 id。",
      },
      backCoverUrl: {
        type: "string",
        required: false,
        description: "外壳背面封面图。同样先上传再填 id。",
      },
      innerLeftUrl: {
        type: "string",
        required: false,
        description: "盒盖内侧插页图。同样先上传再填 id。",
      },
      innerRightUrl: {
        type: "string",
        required: false,
        description: "托盘底板图。同样先上传再填 id。",
      },
      spineImageUrl: {
        type: "string",
        required: false,
        description: "脊背图（优先于 spineText）。同样先上传再填 id。",
      },
      obiImageUrl: {
        type: "string",
        required: false,
        description: "腰封图。同样先上传再填 id。",
      },
      audioUrl: {
        type: "string",
        required: false,
        description:
          "盘面上的那段录音（audio/*）。先 POST /api/uploads 拿到 id 再填。",
      },
      mediaUrl: {
        type: "string",
        required: false,
        description: "随信照片。同样先上传再填 id。",
      },
      mediaVideoUrl: {
        type: "string",
        required: false,
        description:
          "随信视频的原文件（video/*）。先上传再填 id —— 不转码，存的就是用户上传的原始文件；" +
          "封面色图另填 mediaUrl。",
      },
      letterText: {
        type: "string",
        required: false,
        maxLength: 2000,
        description: "信纸正文。",
      },
      letterFontSize: {
        type: "number",
        required: false,
        min: 10,
        max: 28,
        description: "信纸正文字号（px）。",
      },
      letterColor: {
        type: "string",
        required: false,
        description: "信纸正文墨色 hex。",
      },
      signatureText: {
        type: "string",
        required: false,
        maxLength: 60,
        description: "落款，如「—— 想你的我」。",
      },
      inputMode: {
        type: "string",
        required: false,
        enum: ["type", "handwrite"],
        description:
          "信纸书写方式。type=打字；handwrite 需要附手写笔迹图，Agent API 暂只支持 type。",
      },
    },
    /** 自描述端点表 —— agent 读完就知道下一步该调哪个 */
    endpoints: {
      catalog: { method: "GET", path: "/api/agent/v1/catalog", auth: true },
      createOrder: {
        method: "POST",
        path: "/api/agent/v1/orders",
        auth: true,
        description: "创建订单并返回报价（不扣款）。",
      },
      getOrder: {
        method: "GET",
        path: "/api/agent/v1/orders/{orderId}",
        auth: true,
      },
      payOrder: {
        method: "POST",
        path: "/api/agent/v1/orders/{orderId}/pay",
        auth: true,
        description: "按报价扣款并生成寄送任务（返回运单号与 ETA）。",
      },
      health: { method: "GET", path: "/api/agent/v1/health", auth: false },
      templates: {
        method: "GET",
        path: "/api/templates",
        auth: false,
        description: "DIY 模版清单（含 spec 摘要）。",
      },
      downloadTemplate: {
        method: "GET",
        path: "/api/templates/{templateId}/download",
        auth: false,
        description:
          "下载模版包（zip）：template.svg + example.svg + spec.json + README.md。",
      },
      upload: {
        method: "POST",
        path: "/api/uploads",
        auth: false,
        description:
          "上传 agent 生成的成品（multipart/form-data，字段名 file，≤8MB，图片或音频）。",
      },
    },
    /** 推荐调用顺序 */
    workflow: [
      "1. GET /api/agent/v1/catalog —— 读场景、价格、设计词汇表",
      "2. GET /api/templates —— 读可下载的 DIY 模版（需要贴图时）",
      "3. GET /api/templates/{id}/download —— 拿到 zip，把 spec.json 喂给你的 agent 产出成品",
      "4. POST /api/uploads —— 上传成品，拿到 url",
      "5. POST /api/agent/v1/orders —— 传 productId + design + letter + deliveryDate，拿 orderId 与报价",
      "6. 把报价告知用户，得到确认",
      "7. POST /api/agent/v1/orders/{orderId}/pay —— 扣款，拿到 trackingNumber 与 eta",
      "8. 用运单号和 ETA 回报用户",
    ],
    authNote:
      "所有 /api/agent/v1/* 端点（health 除外）需要 Authorization: Bearer <API_KEY>。",
  };
}

export function isKnownSceneId(id: string): boolean {
  return isKnownScene(String(id ?? "").trim().toLowerCase());
}
