#!/usr/bin/env node
/**
 * 从源站同步素材
 * ===================================================================
 * 素材**已经随仓库分发**了 —— public/ 里就是真图，克隆下来就是完整站点。
 * 所以这个脚本的定位变了：从「补救」变成「同步与更新」。
 *
 * 默认行为是「已存在的文件跳过」，所以构建机上跑它会直接秒退，一个网络请求都不发。
 * 真要更新素材：加 --force 重新拉，或者删掉 public/ 里的文件再拉。
 *
 * 用法：
 *   npm run assets:fetch                     # 拉到 public/（已存在的跳过）
 *   npm run assets:fetch -- --force          # 覆盖已存在的
 *   node scripts/fetch-assets.mjs --out <目录>          # 拉到别处
 *   node scripts/fetch-assets.mjs --source <基址>       # 换一个源站
 *   node scripts/fetch-assets.mjs --source a,b           # 多个源站，前一个挂了用后一个
 *   node scripts/fetch-assets.mjs --timeout 8            # 单个请求超时（秒）
 *
 * 只下载 scripts/asset-manifest.json 里列出的那 45 个文件 ——
 * 清单里有它们的精确像素尺寸，拉回来的图与规格严丝合缝，布局不会变形。
 *
 * 为什么要有超时和多个源站：
 *   国内网络访问 vercel.app 时好时坏，构建机上一个卡住的请求能把整次构建拖到超时。
 *   所以每个请求都带超时；一个源站拉不到就换下一个。
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

const timeoutIdx = process.argv.indexOf("--timeout");
const TIMEOUT_MS =
  timeoutIdx > -1 ? Math.max(1, Number(process.argv[timeoutIdx + 1])) * 1000 : 20000;

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));

/* ---------- 源站：一个或多个，按顺序试 ---------- */
const srcIdx = process.argv.indexOf("--source");
const rawSources =
  srcIdx > -1 ? process.argv[srcIdx + 1] : manifest.source || "";
const SOURCES = String(rawSources)
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

if (SOURCES.length === 0) {
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

/* ---------- 从一个源站拉一个文件 ---------- */
async function fetchOne(source, rel) {
  const url = `${source}/${rel}`;
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = (res.headers.get("content-type") || "").split(";")[0].trim();
  const want = expectedType(rel);
  if (want && ct && ct !== want) throw new Error(`content-type 是 ${ct}，期望 ${want}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error("空响应");
  return buf;
}

/**
 * 依次尝试各源站，第一个成功的就是它。
 * 全挂了就抛出最后一个错误 —— 错误信息里带上「试过哪些源站」，方便排查是网络问题还是源站问题。
 */
async function fetchAny(rel) {
  let lastErr;
  for (const source of SOURCES) {
    try {
      return { buf: await fetchOne(source, rel), source };
    } catch (err) {
      lastErr = err;
    }
  }
  const tried = SOURCES.join(" / ");
  throw new Error(`${lastErr?.message || "未知错误"}（试过：${tried}）`);
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

console.log(`源站  : ${SOURCES.join(", ")}`);
console.log(`输出  : ${PUBLIC}${FORCE ? "   (--force：覆盖已存在的)" : ""}`);
console.log(`清单  : ${targets.length} 个文件 · 单请求超时 ${TIMEOUT_MS / 1000}s\n`);

let done = 0;
let skipped = 0;
let bytes = 0;
const failed = [];

await pool(targets, 6, async (rel) => {
  const out = path.join(PUBLIC, rel);
  if (fs.existsSync(out) && !FORCE) {
    skipped++;
    return;
  }
  try {
    const { buf } = await fetchAny(rel);
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
  console.log("（构建命令里写成 `npm run assets:fetch || npm run assets:placeholder && npm run build` 就会自动回落）");
  process.exit(1);
}

console.log("素材齐了 —— 可以 npm run build / npm run dev 了。");
