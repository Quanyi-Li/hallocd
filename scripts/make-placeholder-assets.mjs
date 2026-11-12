#!/usr/bin/env node
/**
 * 占位素材生成器
 * ===================================================================
 * 素材（public/）不随仓库分发 —— 这份代码要能 clone 下来就跑得起来。
 *
 * 用法：
 *   npm run assets:placeholder            # 已存在的文件不覆盖
 *   node scripts/make-placeholder-assets.mjs --force   # 强制重建
 *   node scripts/make-placeholder-assets.mjs --out <目录>  # 输出到别处
 *
 * 做什么：
 *   按 scripts/asset-manifest.json 的**像素尺寸与色调**生成占位图，
 *   写到与原素材**完全相同的路径**。布局因此不会变形。
 *
 * 只画几何图形，不画文字 —— 文字依赖系统字体，跨平台渲染不一致。
 *
 * 依赖：sharp（Next.js 的 optional dependency，npm install 时会自动装；
 *       装不上时本脚本会给出提示并退出）。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MANIFEST = path.join(HERE, "asset-manifest.json");
const FORCE = process.argv.includes("--force");

const outIdx = process.argv.indexOf("--out");
const PUBLIC = outIdx > -1 ? path.resolve(process.argv[outIdx + 1]) : path.join(ROOT, "public");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("需要 sharp —— 它是 Next.js 的 optional dependency，npm install 时一般会自动装。");
  console.error("装不上时请自行准备 public/ 下的素材，或在别的机器上生成了再拷过来。");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

/* ------------------------------------------------------------------ */
/*  画法：每种 kind 一个 SVG 生成器。全部只用几何图形。                 */
/* ------------------------------------------------------------------ */
const DRAW = {
  /* 碟面 —— 会被圆形裁切，所以画同心圆 */
  disc({ w, h, bg, fg }) {
    const c = Math.min(w, h) / 2;
    const cx = w / 2;
    const cy = h / 2;
    const ring = (r, sw, op) =>
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${fg}" stroke-width="${sw}" opacity="${op}"/>`;
    return `
      <rect width="${w}" height="${h}" fill="${bg}"/>
      ${ring(c * 0.78, c * 0.012, 0.85)}
      ${ring(c * 0.66, c * 0.006, 0.5)}
      ${ring(c * 0.30, c * 0.008, 0.7)}
      <circle cx="${cx}" cy="${cy}" r="${c * 0.085}" fill="${fg}" opacity="0.85"/>
      <circle cx="${cx}" cy="${cy}" r="${c * 0.045}" fill="${bg}"/>`;
  },

  /* 封面 —— 顶部标题条 + 中部文字线 + 底部装饰弧 */
  cover({ w, h, bg, fg }) {
    const line = (y, ww, op) =>
      `<rect x="${w * 0.14}" y="${h * y}" width="${w * ww}" height="${h * 0.012}" rx="${h * 0.006}" fill="${fg}" opacity="${op}"/>`;
    return `
      <rect width="${w}" height="${h}" fill="${bg}"/>
      <rect x="${w * 0.14}" y="${h * 0.13}" width="${w * 0.72}" height="${h * 0.055}" rx="${h * 0.008}" fill="${fg}" opacity="0.9"/>
      ${line(0.24, 0.48, 0.45)}
      ${line(0.42, 0.62, 0.3)}
      ${line(0.47, 0.54, 0.3)}
      ${line(0.52, 0.58, 0.3)}
      <ellipse cx="${w / 2}" cy="${h * 0.74}" rx="${w * 0.19}" ry="${w * 0.19}" fill="none" stroke="${fg}" stroke-width="${w * 0.008}" opacity="0.55"/>
      <ellipse cx="${w / 2}" cy="${h * 0.74}" rx="${w * 0.13}" ry="${w * 0.13}" fill="none" stroke="${fg}" stroke-width="${w * 0.006}" opacity="0.4"/>`;
  },

  /* 信纸 —— 书写区几行线 + 右上角一块胶带 */
  paper({ w, h, bg, fg }) {
    const rows = [];
    for (let i = 0; i < 7; i++) {
      const y = 0.2 + i * 0.075;
      const ww = 0.46 + (i % 3) * 0.07;
      rows.push(
        `<rect x="${w * 0.2}" y="${h * y}" width="${w * ww}" height="${h * 0.011}" rx="${h * 0.005}" fill="${fg}" opacity="0.34"/>`
      );
    }
    return `
      <rect width="${w}" height="${h}" fill="${bg}"/>
      <rect x="${w * 0.17}" y="${h * 0.1}" width="${w * 0.66}" height="${h * 0.78}" fill="none" stroke="${fg}" stroke-width="${w * 0.004}" opacity="0.3"/>
      ${rows.join("\n      ")}
      <rect x="${w * 0.66}" y="${h * 0.035}" width="${w * 0.26}" height="${h * 0.055}" fill="${fg}" opacity="0.38"/>`;
  },

  /* 便签 —— 浅底 + 折角 + 几行线 */
  note({ w, h, bg, fg }) {
    const rows = [];
    for (let i = 0; i < 5; i++) {
      rows.push(
        `<rect x="${w * 0.16}" y="${h * (0.24 + i * 0.1)}" width="${w * (0.5 - (i % 2) * 0.12)}" height="${h * 0.018}" rx="${h * 0.009}" fill="${fg}" opacity="0.4"/>`
      );
    }
    return `
      <rect width="${w}" height="${h}" fill="${bg}"/>
      <path d="M0 0 L${w * 0.22} 0 L0 ${h * 0.22} Z" fill="${fg}" opacity="0.22"/>
      ${rows.join("\n      ")}`;
  },

  /* 生活照 —— 柔和渐变 + 两个剪影圆 */
  photo({ w, h, bg, fg }) {
    return `
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="${fg}" stop-opacity="0.45"/>
      </linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
      <circle cx="${w * 0.38}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.13}" fill="${fg}" opacity="0.3"/>
      <circle cx="${w * 0.63}" cy="${h * 0.58}" r="${Math.min(w, h) * 0.17}" fill="${fg}" opacity="0.22"/>
      <rect x="0" y="${h * 0.72}" width="${w}" height="${h * 0.28}" fill="${fg}" opacity="0.18"/>`;
  },

  /* 房间背景 */
  room({ w, h, bg, fg }) {
    return `
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bg}"/><stop offset="100%" stop-color="${fg}" stop-opacity="0.3"/>
      </linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
      <rect x="${w * 0.08}" y="${h * 0.55}" width="${w * 0.84}" height="${h * 0.3}" rx="${w * 0.03}" fill="${fg}" opacity="0.22"/>
      <rect x="${w * 0.12}" y="${h * 0.34}" width="${w * 0.26}" height="${h * 0.22}" rx="${w * 0.015}" fill="${fg}" opacity="0.16"/>
      <rect x="${w * 0.55}" y="${h * 0.28}" width="${w * 0.3}" height="${h * 0.28}" rx="${w * 0.015}" fill="${fg}" opacity="0.16"/>`;
  },

  /* 透明盒贴图 —— 必须透明背景 + 只有盒边，否则会盖住嵌在里面的封面 */
  case({ w, h, fg }) {
    return `
      <rect x="${w * 0.02}" y="${h * 0.02}" width="${w * 0.96}" height="${h * 0.96}" rx="${w * 0.012}" fill="none" stroke="${fg}" stroke-width="${w * 0.014}"/>
      <rect x="${w * 0.072}" y="${h * 0.029}" width="${w * 0.911}" height="${h * 0.946}" rx="${w * 0.008}" fill="none" stroke="${fg}" stroke-width="${w * 0.006}" opacity="0.75"/>
      <rect x="${w * 0.072}" y="${h * 0.029}" width="${w * 0.831}" height="${h * 0.946}" fill="none" stroke="${fg}" stroke-width="${w * 0.005}" stroke-dasharray="${w * 0.02} ${w * 0.014}" opacity="0.45"/>`;
  },
};

function svgFor(a) {
  const draw = DRAW[a.kind];
  if (!draw) throw new Error(`未知的 kind: ${a.kind} (${a.path})`);
  const inner = draw(a);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${a.w}" height="${a.h}" viewBox="0 0 ${a.w} ${a.h}">${inner}\n</svg>`;
}

/* ------------------------------------------------------------------ */
function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
}

let made = 0;
let skipped = 0;

async function writeAsset(a) {
  const out = path.join(PUBLIC, a.path);
  if (fs.existsSync(out) && !FORCE) {
    skipped++;
    return;
  }
  ensureDir(out);
  const buf = Buffer.from(svgFor(a));
  if (a.path.endsWith(".png")) {
    await sharp(buf).png({ compressionLevel: 9 }).toFile(out);
  } else {
    await sharp(buf).jpeg({ quality: 86, mozjpeg: false }).toFile(out);
  }
  made++;
}

async function writeSvg(s) {
  const out = path.join(PUBLIC, s.path);
  if (fs.existsSync(out) && !FORCE) {
    skipped++;
    return;
  }
  ensureDir(out);
  const body = `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 24 24" fill="none" stroke="#1C2329" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12h8M12 8v8"/></svg>`;
  fs.writeFileSync(out, body, "utf8");
  made++;
}

/* ------------------------------------------------------------------ */
console.log(`输出目录: ${PUBLIC}${FORCE ? "  (--force：会覆盖已存在的文件)" : ""}`);
for (const a of manifest.assets) await writeAsset(a);
for (const s of manifest.svgs ?? []) await writeSvg(s);

fs.writeFileSync(
  path.join(PUBLIC, ".placeholder-assets.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: "这些是占位图，不是正式素材。换成真素材后可以删掉本文件。",
      count: made,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(`生成 ${made} 个，跳过 ${skipped} 个（已存在）`);
console.log("提示：这些是**占位图**。把真素材按同样的路径放进去即可替换。");
