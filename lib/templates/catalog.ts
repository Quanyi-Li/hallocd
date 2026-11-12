/**
 * halloCD · DIY 模版库
 * ==================================================================
 * 平台的模版**不要求用户在自己机器上装任何东西** ——
 * 下载下来的是一个 zip，里面有：
 *   template.svg   空白模版（带命名图层，agent 直接改）
 *   example.svg    填好的示例（让人一眼看懂每个位置放什么）
 *   spec.json      机器可读规格（画布尺寸 / 图层 / 可用色 / 可用字体）
 *   README.md      给 coding agent 的说明书
 *
 * 用户的工作流：
 *   1. 下载 zip
 *   2. 把 spec.json 喂给自己的 coding agent
 *   3. agent 生成一张符合规格的图
 *   4. 上传回来（见「上传」章节）
 *
 * SVG 是纯文本，agent 用脚本改最自然 —— 所以图层都用语义化 id。
 */

import { PAPER_SKINS } from "@/components/paperSkins";

export type TemplateLayer = {
  id: string;
  label: string;
  type: "text" | "image" | "shape";
  required?: boolean;
  maxLength?: number;
  hint?: string;
};

export type TemplateDef = {
  id: string;
  name: string;
  nameEn: string;
  kind: "disc" | "cover" | "obi" | "paper" | "inner";
  description: string;
  descriptionEn: string;
  canvas: { width: number; height: number };
  layers: TemplateLayer[];
  palette: string[];
  fonts: string[];
  /** 产出 SVG */
  build: (filled: boolean) => string;
};

const BASE_PALETTE = [
  "#1C2329",
  "#F8F4EC",
  "#E65100",
  "#8B5852",
  "#2E3A31",
  "#1B3A6B",
  "#AF8E5C",
  "#9AA3A8",
];

const FONTS = ["serif", "sans", "mono", "song"];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------ */
/*  SVG 生成器                                                           */
/* ------------------------------------------------------------------ */

function discSvg(filled: boolean): string {
  const label = filled ? "MERRY &amp; BRIGHT" : "YOUR WORDS";
  const sub = filled ? "2026 · halloCD" : "subtitle";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <defs>
    <radialGradient id="sheen" cx="34%" cy="28%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity=".08"/>
      <stop offset="100%" stop-color="#000000" stop-opacity=".18"/>
    </radialGradient>
    <linearGradient id="laser" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".55"/>
      <stop offset="35%" stop-color="#9AA3A8" stop-opacity=".18"/>
      <stop offset="60%" stop-color="#ffffff" stop-opacity=".42"/>
      <stop offset="100%" stop-color="#E65100" stop-opacity=".16"/>
    </linearGradient>
  </defs>

  <!-- 背景（镭射盘面） -->
  <g id="background">
    <circle cx="500" cy="500" r="490" fill="#E0E0E0"/>
    <circle cx="500" cy="500" r="490" fill="url(#sheen)"/>
  </g>

  <!-- 细密刻纹环 -->
  <g id="grooves" opacity=".5">
    ${Array.from({ length: 26 }, (_, i) => {
      const r = 130 + i * 14;
      return `<circle cx="500" cy="500" r="${r}" fill="none" stroke="#1C2329" stroke-opacity=".08" stroke-width="1"/>`;
    }).join("\n    ")}
  </g>

  <!-- 镭射带 -->
  <g id="laser">
    <circle cx="500" cy="500" r="470" fill="none" stroke="url(#laser)" stroke-width="26"/>
    <circle cx="500" cy="500" r="300" fill="none" stroke="url(#laser)" stroke-width="10"/>
  </g>

  <!-- 中心文字区 -->
  <g id="text">
    <text id="headline" x="500" y="472" text-anchor="middle"
      font-family="Georgia, 'Songti SC', serif" font-size="76" fill="#1C2329" letter-spacing="6">${label}</text>
    <text id="subtitle" x="500" y="540" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#1C2329" opacity=".55" letter-spacing="8">${sub}</text>
  </g>

  <!-- 中孔 -->
  <g id="hole">
    <circle cx="500" cy="500" r="46" fill="#F8F4EC"/>
    <circle cx="500" cy="500" r="46" fill="none" stroke="#1C2329" stroke-opacity=".22" stroke-width="3"/>
  </g>
</svg>`;
}

function discMinimalSvg(filled: boolean): string {
  const label = filled ? "ORDINARY DAYS" : "YOUR WORDS";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <defs>
    <radialGradient id="sheen2" cx="36%" cy="30%" r="68%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".5"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g id="background">
    <circle cx="500" cy="500" r="490" fill="#F0EDE4"/>
    <circle cx="500" cy="500" r="490" fill="url(#sheen2)"/>
  </g>
  <g id="rings" opacity=".7">
    <circle cx="500" cy="500" r="392" fill="none" stroke="#1C2329" stroke-opacity=".14" stroke-width="2"/>
    <circle cx="500" cy="500" r="360" fill="none" stroke="#1C2329" stroke-opacity=".08" stroke-width="1"/>
  </g>
  <g id="text">
    <text id="headline" x="500" y="490" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="58" fill="#1C2329" letter-spacing="14">${label}</text>
    <line id="rule" x1="380" y1="530" x2="620" y2="530" stroke="#E65100" stroke-width="3"/>
    <text id="subtitle" x="500" y="586" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#1C2329" opacity=".5" letter-spacing="6">${filled ? "a note to someone" : "subtitle"}</text>
  </g>
  <g id="hole">
    <circle cx="500" cy="500" r="46" fill="#F8F4EC"/>
  </g>
</svg>`;
}

function discPhotoSvg(filled: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">
  <defs>
    <radialGradient id="sheen3" cx="34%" cy="28%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".45"/>
      <stop offset="100%" stop-color="#000000" stop-opacity=".15"/>
    </radialGradient>
    <clipPath id="photoClip"><circle cx="500" cy="430" r="250"/></clipPath>
  </defs>
  <g id="background">
    <circle cx="500" cy="500" r="490" fill="#2E3A31"/>
    <circle cx="500" cy="500" r="490" fill="url(#sheen3)"/>
  </g>
  <!-- 照片位（agent 把图片放进这个 group） -->
  <g id="photo" clip-path="url(#photoClip)">
    <rect x="250" y="180" width="500" height="500" fill="#8B5852" opacity=".35"/>
    <text id="photoHint" x="500" y="438" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="28" fill="#F8F4EC" opacity=".8">${filled ? "" : "place your image here (500×500)"}</text>
  </g>
  <g id="text">
    <text id="headline" x="500" y="760" text-anchor="middle"
      font-family="Georgia, 'Songti SC', serif" font-size="64" fill="#F8F4EC" letter-spacing="4">${filled ? "FIRST LIGHT" : "YOUR WORDS"}</text>
    <text id="subtitle" x="500" y="812" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#F8F4EC" opacity=".6" letter-spacing="8">${filled ? "2026 · halloCD" : "subtitle"}</text>
  </g>
  <g id="hole">
    <circle cx="500" cy="500" r="46" fill="#F8F4EC"/>
    <circle cx="500" cy="500" r="46" fill="none" stroke="#1C2329" stroke-opacity=".2" stroke-width="3"/>
  </g>
</svg>`;
}

function coverGridSvg(filled: boolean): string {
  const title = filled ? "MAKE A WISH" : "YOUR TITLE";
  const sub = filled ? "for someone you love" : "one line subtitle";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="771" viewBox="0 0 900 771">
  <g id="background">
    <rect width="900" height="771" fill="#EFE3D3"/>
  </g>
  <g id="grid" opacity=".22">
    ${Array.from({ length: 5 }, (_, i) => `<line x1="${120 + i * 165}" y1="0" x2="${120 + i * 165}" y2="771" stroke="#1C2329" stroke-width="1"/>`).join("\n    ")}
    ${Array.from({ length: 4 }, (_, i) => `<line x1="0" y1="${140 + i * 150}" x2="900" y2="${140 + i * 150}" stroke="#1C2329" stroke-width="1"/>`).join("\n    ")}
  </g>
  <g id="accent">
    <rect x="120" y="140" width="120" height="120" fill="#E65100"/>
  </g>
  <g id="text">
    <text id="headline" x="120" y="420" font-family="Georgia, 'Songti SC', serif"
      font-size="88" fill="#1C2329" letter-spacing="2">${esc(title)}</text>
    <text id="subtitle" x="124" y="486" font-family="Helvetica, Arial, sans-serif"
      font-size="34" fill="#1C2329" opacity=".55" letter-spacing="2">${esc(sub)}</text>
    <text id="footer" x="124" y="640" font-family="'JetBrains Mono', monospace"
      font-size="22" fill="#1C2329" opacity=".4" letter-spacing="6">${filled ? "HALLO CD · 2026" : "HALLO CD"}</text>
  </g>
</svg>`;
}

function coverEditorialSvg(filled: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="771" viewBox="0 0 900 771">
  <g id="background">
    <rect width="900" height="771" fill="#1C2329"/>
    <rect x="0" y="0" width="900" height="8" fill="#E65100"/>
  </g>
  <g id="photo">
    <rect x="96" y="96" width="330" height="330" fill="#F8F4EC" opacity=".08"/>
    <text x="261" y="270" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
      font-size="24" fill="#F8F4EC" opacity=".45">${filled ? "" : "image 330×330"}</text>
  </g>
  <g id="text">
    <text x="470" y="200" font-family="'JetBrains Mono', monospace" font-size="20"
      fill="#E65100" letter-spacing="6">${filled ? "VOL. 01 · WEDDING" : "EYEBROW"}</text>
    <text id="headline" x="470" y="330" font-family="Georgia, 'Songti SC', serif"
      font-size="82" fill="#F8F4EC">${filled ? "THE VOW" : "TITLE"}</text>
    <line x1="470" y1="372" x2="804" y2="372" stroke="#F8F4EC" stroke-opacity=".25" stroke-width="2"/>
    <text id="subtitle" x="470" y="430" font-family="Helvetica, Arial, sans-serif"
      font-size="28" fill="#F8F4EC" opacity=".6">${filled ? "the words you said out loud" : "subtitle"}</text>
    <text id="footer" x="470" y="640" font-family="'JetBrains Mono', monospace"
      font-size="20" fill="#F8F4EC" opacity=".4" letter-spacing="4">HALLO CD</text>
  </g>
</svg>`;
}

function obiVerticalSvg(filled: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="900" viewBox="0 0 220 900">
  <g id="background">
    <rect width="220" height="900" fill="#1C2329"/>
  </g>
  <g id="text">
    <text id="vertical" x="110" y="450" text-anchor="middle"
      font-family="'Songti SC', Georgia, serif" font-size="44" fill="#F8F4EC"
      letter-spacing="14" style="writing-mode:vertical-rl">${filled ? "To My Dearest" : "BELLY BAND TEXT"}</text>
  </g>
  <g id="mark">
    <circle cx="110" cy="800" r="22" fill="none" stroke="#E65100" stroke-width="3"/>
  </g>
</svg>`;
}

function obiRibbonSvg(filled: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="200" viewBox="0 0 900 200">
  <g id="background">
    <rect width="900" height="200" fill="#8B5852"/>
  </g>
  <g id="text">
    <text id="headline" x="450" y="90" text-anchor="middle"
      font-family="Georgia, serif" font-size="52" fill="#F8F4EC" letter-spacing="10">${filled ? "GOLDEN, AGAIN" : "YOUR WORDS"}</text>
    <text id="subtitle" x="450" y="140" text-anchor="middle"
      font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#F8F4EC" opacity=".6" letter-spacing="10">${filled ? "HALLO CD" : "SUBTITLE"}</text>
  </g>
</svg>`;
}

function paperSvg(filled: boolean): string {
  const text = filled
    ? "Happy birthday, Mom.\n\nYou look thinner again this year —\nare you eating properly?"
    : "Write your words here.\n\nA second line works too.";
  const lines = text.split("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400" viewBox="0 0 1000 1400">
  <g id="background">
    <rect width="1000" height="1400" fill="#FDFBF5"/>
  </g>
  <g id="ruled">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="90" y1="${300 + i * 78}" x2="910" y2="${300 + i * 78}" stroke="#1C2329" stroke-opacity=".07" stroke-width="1"/>`).join("\n    ")}
  </g>
  <g id="text">
    ${lines
      .map(
        (line, i) =>
          `<text id="line${i + 1}" x="90" y="${300 + i * 78 - 22}" font-family="'Songti SC', Georgia, serif" font-size="40" fill="#333333">${esc(line)}</text>`,
      )
      .join("\n    ")}
    <text id="signature" x="90" y="1250" font-family="'Songti SC', Georgia, serif" font-size="32" fill="#333333" opacity=".6">${filled ? "— Your kid" : "— Signature"}</text>
  </g>
</svg>`;
}

function innerSvg(filled: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="771" viewBox="0 0 1000 771">
  <g id="background">
    <rect width="1000" height="771" fill="#1B3A6B"/>
  </g>
  <g id="rays" opacity=".16">
    ${Array.from({ length: 12 }, (_, i) => {
      const a = (i * Math.PI) / 6;
      return `<line x1="500" y1="620" x2="${500 + Math.cos(a) * 900}" y2="${620 + Math.sin(a) * 900}" stroke="#F8F4EC" stroke-width="26"/>`;
    }).join("\n    ")}
  </g>
  <g id="text">
    <text id="headline" x="500" y="560" text-anchor="middle" font-family="Georgia, 'Songti SC', serif"
      font-size="76" fill="#F8F4EC" letter-spacing="6">${filled ? "FIRST LIGHT" : "YOUR WORDS"}</text>
    <text id="subtitle" x="500" y="620" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
      font-size="26" fill="#F8F4EC" opacity=".6" letter-spacing="10">${filled ? "2026 · halloCD" : "subtitle"}</text>
  </g>
</svg>`;
}

/* ------------------------------------------------------------------ */
/*  模版定义                                                             */
/* ------------------------------------------------------------------ */

export const TEMPLATES: TemplateDef[] = [
  {
    id: "disc-arc",
    name: "碟面 · 弧光",
    nameEn: "Disc · Arc",
    kind: "disc",
    description:
      "圆盘镭射弧 + 细密刻纹 + 中心文字。最通用的盘面模板，适合任何场景。",
    descriptionEn: "Laser arc across the disc, fine grooves and centred text. The most universal disc template - it fits any occasion.",
    canvas: { width: 1000, height: 1000 },
    layers: [
      { id: "headline", label: "主标题", type: "text", required: true, maxLength: 24 },
      { id: "subtitle", label: "副标题", type: "text", maxLength: 40 },
      { id: "background", label: "底色", type: "shape", hint: "circle r=490" },
      { id: "grooves", label: "刻纹环", type: "shape" },
      { id: "laser", label: "镭射带", type: "shape" },
    ],
    palette: BASE_PALETTE,
    fonts: FONTS,
    build: discSvg,
  },
  {
    id: "disc-minimal",
    name: "碟面 · 极简",
    nameEn: "Disc · Minimal",
    kind: "disc",
    description: "两道细环 + 一根赤橘分隔线。给「日常」「素一点」的场合。",
    descriptionEn: "Two thin rings and one burnt-orange rule. For everyday moments that should stay plain.",
    canvas: { width: 1000, height: 1000 },
    layers: [
      { id: "headline", label: "主标题", type: "text", required: true, maxLength: 20 },
      { id: "subtitle", label: "副标题", type: "text", maxLength: 40 },
      { id: "rule", label: "分隔线", type: "shape" },
    ],
    palette: BASE_PALETTE,
    fonts: FONTS,
    build: discMinimalSvg,
  },
  {
    id: "disc-photo",
    name: "碟面 · 照片",
    nameEn: "Disc · Photo",
    kind: "disc",
    description: "上方 250 半径的圆形照片位 + 下方文字区。适合带回忆图的一张。",
    descriptionEn: "A 250-radius round photo slot on top, with the text block underneath. For a disc that carries a memory.",
    canvas: { width: 1000, height: 1000 },
    layers: [
      { id: "photo", label: "照片（圆形裁切 500×500）", type: "image", required: true },
      { id: "headline", label: "主标题", type: "text", required: true, maxLength: 20 },
      { id: "subtitle", label: "副标题", type: "text", maxLength: 40 },
    ],
    palette: BASE_PALETTE,
    fonts: FONTS,
    build: discPhotoSvg,
  },
  {
    id: "cover-grid",
    name: "外壳封面 · 网格",
    nameEn: "Cover · Grid",
    kind: "cover",
    description: "杂志网格排版 + 一块赤橘色块。适合生日、圣诞这类热闹场景。",
    descriptionEn: "Magazine grid layout with one burnt-orange block. Made for loud occasions - birthdays, Christmas.",
    canvas: { width: 900, height: 771 },
    layers: [
      { id: "headline", label: "主标题", type: "text", required: true, maxLength: 18 },
      { id: "subtitle", label: "副标题", type: "text", maxLength: 32 },
      { id: "footer", label: "页脚", type: "text", maxLength: 24 },
      { id: "accent", label: "色块", type: "shape" },
    ],
    palette: BASE_PALETTE,
    fonts: FONTS,
    build: coverGridSvg,
  },
  {
    id: "cover-editorial",
    name: "外壳封面 · 编辑部",
    nameEn: "Cover · Editorial",
    kind: "cover",
    description: "深墨底 + 左侧方形图位 + 右侧细排文字。适合婚礼、纪念日。",
    descriptionEn: "Deep ink ground, a square image slot on the left and finely set type on the right. For weddings and anniversaries.",
    canvas: { width: 900, height: 771 },
    layers: [
      { id: "headline", label: "主标题", type: "text", required: true, maxLength: 16 },
      { id: "subtitle", label: "副标题", type: "text", maxLength: 32 },
      { id: "eyebrow", label: "眉标", type: "text", maxLength: 24 },
      { id: "photo", label: "图片位 330×330", type: "image" },
    ],
    palette: BASE_PALETTE,
    fonts: FONTS,
    build: coverEditorialSvg,
  },
  {
    id: "obi-vertical",
    name: "腰封 · 竖排",
    nameEn: "Obi · Vertical",
    kind: "obi",
    description: "220×900 竖条，正面左侧那条纸带。文字竖排，控制在 10 字以内。",
    descriptionEn: "A 220x900 vertical strip - the paper band on the left of the front. Set vertically, keep it under 10 characters.",
    canvas: { width: 220, height: 900 },
    layers: [
      { id: "vertical", label: "竖排文字", type: "text", required: true, maxLength: 10 },
      { id: "mark", label: "底部标记", type: "shape" },
    ],
    palette: BASE_PALETTE,
    fonts: FONTS,
    build: obiVerticalSvg,
  },
  {
    id: "obi-ribbon",
    name: "腰封 · 横带",
    nameEn: "Obi · Ribbon",
    kind: "obi",
    description: "900×200 横带，适合英文或短句。",
    descriptionEn: "A 900x200 horizontal band, good for short lines or English phrases.",
    canvas: { width: 900, height: 200 },
    layers: [
      { id: "headline", label: "主标题", type: "text", required: true, maxLength: 24 },
      { id: "subtitle", label: "副标题", type: "text", maxLength: 24 },
    ],
    palette: BASE_PALETTE,
    fonts: FONTS,
    build: obiRibbonSvg,
  },
  {
    id: "paper-minimal",
    name: "信纸 · 留白",
    nameEn: "Paper · Minimal",
    kind: "paper",
    description: "1000×1400 米白信纸，带横格线。平台另有 11 款现成信纸皮肤。",
    descriptionEn: "1000x1400 off-white letter paper with ruled lines. The platform also ships 11 ready-made paper skins.",
    canvas: { width: 1000, height: 1400 },
    layers: [
      { id: "line1", label: "正文第 1 行", type: "text", required: true, maxLength: 26 },
      { id: "line2", label: "正文第 2 行", type: "text", maxLength: 26 },
      { id: "line3", label: "正文第 3 行", type: "text", maxLength: 26 },
      { id: "line4", label: "正文第 4 行", type: "text", maxLength: 26 },
      { id: "signature", label: "落款", type: "text", maxLength: 20 },
    ],
    palette: BASE_PALETTE,
    fonts: FONTS,
    build: paperSvg,
  },
  {
    id: "inner-tray",
    name: "内页底板 · 光束",
    nameEn: "Inner · Rays",
    kind: "inner",
    description: "1000×771 托盘底板（光盘之下那张），放射光束 + 文字。",
    descriptionEn: "The 1000x771 tray board (the one under the disc) - radiating light beams plus text.",
    canvas: { width: 1000, height: 771 },
    layers: [
      { id: "headline", label: "主标题", type: "text", required: true, maxLength: 20 },
      { id: "subtitle", label: "副标题", type: "text", maxLength: 32 },
      { id: "rays", label: "光束", type: "shape" },
    ],
    palette: BASE_PALETTE,
    fonts: FONTS,
    build: innerSvg,
  },
];

export function listTemplates(): TemplateDef[] {
  return TEMPLATES;
}

export function getTemplate(id: string): TemplateDef | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

/** 平台自带的信纸皮肤也算「模版」 —— 一并暴露给 agent */
export function paperSkinOptions() {
  return PAPER_SKINS.map((s) => ({
    id: s.id,
    name: s.name,
    src: s.src,
    ratio: s.ratio,
  }));
}
