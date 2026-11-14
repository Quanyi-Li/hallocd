#!/usr/bin/env node
/**
 * 拉取真素材
 * ===================================================================
 * 素材不随仓库分发（它们不可再分发），但线上演示站是公开的 ——
 * 所以任何人 clone 下来都能把真素材拉回去，站点才是完整的。
 *
 * 用法：
 *   npm run assets:fetch                     # 拉到 public/
 *   npm run assets:fetch -- --force          # 覆盖已存在的
 *   node scripts/fetch-assets.mjs --out <目录>          # 拉到别处
 *   node scripts/fetch-assets.mjs --source <基址>       # 换一个源站
 *
 * 只下载 scripts/asset-manifest.json 里列出的那 45 个文件 ——
 * 清单里有它们的精确像素尺寸，拉回来的图与规格严丝合缝，布局不会变形。
 *
 * 拉不到（网络不通 / 源站挂了）时改用占位图：
 *   npm run assets:placeholder
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

const srcIdx = process.argv.indexOf("--source");
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const SOURCE = (srcIdx > -1 ? process.argv[srcIdx + 1] : manifest.source || "").replace(/\/+$/, "");

if (!SOURCE) {
  console.error("没有指定源站。用 --source <基址>，或在 asset-manifest.json 里填 source。");
  process.exit(1);
}

/* ---------- 扩展名 -> 期望的 content-type ---------- */
const EXPECT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function expectedType(rel) {
  return EXPECT[path.extname(rel).toLowerCase()] ?? null;
}

/* ---------- 拉一个文件 ---------- */
async function fetchOne(rel) {
  const url = `${SOURCE}/${rel}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
  const want = expectedType(rel);
  if (want && ct && ct !== want) throw new Error(`content-type 是 ${ct}，期望 ${want}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("空响应");
  return buf;
}

/* ---------- 并发池 ---------- */
async function pool(items, limit, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ---------- 主流程 ---------- */
const targets = [
  ...manifest.assets.map((a) => a.path),
  ...(manifest.svgs ?? []).map((s) => s.path),
];

console.log(`源站  : ${SOURCE}`);
console.log(`输出  : ${PUBLIC}${FORCE ? "   (--force：覆盖已存在的)" : ""}`);
console.log(`清单  : ${targets.length} 个文件\n`);

let done = 0;
let skipped = 0;
const failed = [];
let bytes = 0;

await pool(targets, 6, async (rel) => {
  const out = path.join(PUBLIC, rel);
  if (fs.existsSync(out) && !FORCE) {
    skipped++;
    return;
  }
  try {
    const buf = await fetchOne(rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    bytes += buf.length;
    done++;
    process.stdout.write(`  ✓ ${rel}\n`);
  } catch (err) {
    failed.push({ rel, err: err.message });
    process.stdout.write(`  ✗ ${rel}  ${err.message}\n`);
  }
});

console.log("");
console.log(`拉取 ${done} 个 · 跳过 ${skipped} 个 · 失败 ${failed.length} 个 · 共 ${(bytes / 1024).toFixed(0)} KB`);

if (failed.length) {
  console.log("\n失败清单：");
  for (const f of failed) console.log(`  ${f.rel}  ${f.err}`);
  console.log("\n拉不到就用占位图顶上：npm run assets:placeholder");
  process.exit(1);
}

console.log("素材齐了 —— 可以 npm run build / npm run dev 了。");
