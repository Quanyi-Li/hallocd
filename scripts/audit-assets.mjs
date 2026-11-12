/**
 * 素材引用审计 —— 把源码里所有 /images/... /papers/... /notes/... 引用
 * 与 public/ 下的实际文件对一遍，并区分两种「缺失」：
 *
 *   · 真实 404 —— 文件确实被渲染消费了，但 public/ 下没有 → 会打出坏图 / 触发 onError
 *   · 死引用   —— 数据里声明了路径，但全项目没有任何地方消费它 → 不影响运行
 *
 * 区分办法：找到引用所在文件里的标识符（常量名或对象字段名），
 * 再看这个标识符在项目里有没有出现在「取值位置」（不是 `ident:` 这种定义位置）。
 *
 * 用法: node scripts/audit-assets.mjs
 * 退出码: 0 = 无真实 404；1 = 有真实 404
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".vercel", "out", "coverage", "data", "pgdata",
]);

/** 形如 "/images/xxx.png" 的路径字面量 */
const REF_RE =
  /["'`](\/(?:images|papers|notes)\/[^"'`)\s]+\.(?:png|jpg|jpeg|svg|webp|gif|avif))["'`]/g;
/**
 * 引用前面的标识符：常量赋值 或 对象字段。
 * 只要求「标识符 + 冒号/等号 + 引号 + 斜杠」—— 路径本体由窗口包含与否决定，
 * 窗口若不含路径开头就会误匹配到上一条引用，所以窗口必须多带一个字符。
 */
const IDENT_BEFORE_RE =
  /([A-Za-z_$][A-Za-z0-9_$]*)\s*[:=]\s*["'`]\//g;

/**
 * 去掉注释 —— 注释里提到某个路径，不代表代码会去请求它。
 * 只去块注释和「整行都是注释」的行注释，避免误伤 https:// 这类 URL。
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/[^\n]*$/gm, "");
}

/* ---------- 递归收集源码文件 ---------- */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"].includes(extname(name))) out.push(full);
  }
  return out;
}

const files = walk(ROOT).filter((f) => !f.endsWith("audit-assets.mjs"));
const sources = new Map(); // absPath -> text（已去注释）
for (const f of files) sources.set(f, stripComments(readFileSync(f, "utf8")));

/* ---------- 收集引用 + 声明它的标识符 ---------- */
const refs = new Map(); // ref -> { declFiles:Set, idents:Set }
for (const [file, src] of sources) {
  for (const m of src.matchAll(REF_RE)) {
    const ref = m[1];
    if (!refs.has(ref)) refs.set(ref, { declFiles: new Set(), idents: new Set() });
    const entry = refs.get(ref);
    entry.declFiles.add(file);

    // 找出这条引用前面紧邻的标识符（同一行/同一表达式里）
    // 窗口必须含当前这条引号**和它后面的斜杠**，否则会匹配到上一条引用
    const idx = m.index;
    const before = src.slice(Math.max(0, idx - 160), idx + 2);
    const identMatch = [...before.matchAll(IDENT_BEFORE_RE)].pop();
    if (identMatch) entry.idents.add(identMatch[1]);
  }
}

/**
 * 标识符是否在项目里被「取值」使用。
 * 只出现在 `ident:` 这种定义位置 → 是死引用。
 */
function isConsumed(ident) {
  if (!ident) return true; // 认不出来就按活的算，避免误报
  const defPos = new RegExp(`\\b${ident}\\s*:`, "g");
  const usePos = new RegExp(`\\b${ident}\\b`, "g");
  for (const [, src] of sources) {
    const uses = [...src.matchAll(usePos)];
    if (uses.length === 0) continue;
    for (const u of uses) {
      const tail = src.slice(u.index, u.index + ident.length + 1);
      // 定义位置：`ident:` —— 不算消费
      if (new RegExp(`^${ident}\\s*:`).test(tail)) continue;
      // 声明位置：`const ident =` / `ident =` —— 不算消费
      if (new RegExp(`^(const|let|var)\\s+${ident}\\b`).test(tail)) continue;
      if (new RegExp(`^${ident}\\s*=[^=]`).test(tail)) continue;
      return true;
    }
  }
  void defPos;
  return false;
}

/* ---------- 对账 ---------- */
const live404 = [];
const deadRefs = [];
let ok = 0;

for (const [ref, entry] of [...refs.entries()].sort()) {
  const target = join(PUBLIC, ref.replace(/^\//, ""));
  if (existsSync(target)) {
    ok++;
    continue;
  }
  const idents = [...entry.idents];
  const consumed = idents.length === 0 || idents.some(isConsumed);
  const item = {
    ref,
    files: [...entry.declFiles].map((f) => relative(ROOT, f).replace(/\\/g, "/")),
    idents,
  };
  if (consumed) live404.push(item);
  else deadRefs.push(item);
}

console.log("=".repeat(66));
console.log("halloCD · 素材引用审计");
console.log("=".repeat(66));
console.log();
console.log(`源码中的素材引用   : ${refs.size} 个`);
console.log(`public/ 下能解析   : ${ok} 个`);
console.log(`真实 404（会坏图）  : ${live404.length} 个`);
console.log(`死引用（声明未消费）: ${deadRefs.length} 个`);
console.log();

if (deadRefs.length) {
  console.log("--- 死引用（数据里声明了，但没有任何地方消费它）---");
  for (const d of deadRefs) {
    console.log(`  ○ ${d.ref}   [${d.idents.join(", ") || "?"}]`);
    for (const f of d.files) console.log(`      ← ${f}`);
  }
  console.log();
}

if (live404.length === 0) {
  console.log("✓ 没有真实 404 —— 所有被渲染消费的素材都在 public/ 下");
  console.log("=".repeat(66));
  process.exit(0);
}

console.log("--- 真实 404（会被渲染出来）---");
for (const m of live404) {
  console.log(`  ✗ ${m.ref}   [${m.idents.join(", ") || "?"}]`);
  for (const f of m.files) console.log(`      ← ${f}`);
}
console.log("=".repeat(66));
process.exit(1);
