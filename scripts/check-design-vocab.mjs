/**
 * 设计词汇表一致性检查 —— 关掉 G13 的「静默不一致」风险。
 * ==================================================================
 * 背景：
 *   `lib/agent/catalog.ts`（服务端校验 + agent 可见目录，**规范**）
 *   `components/CustomizationPanel.tsx`（UI 渲染，**副本**）
 *   这两份是手写的副本，改一边忘了另一边就会**静默不一致**：
 *     · UI 有、agent 用不了 —— agent 照目录发 id，服务端 400
 *     · agent 用得了、UI 渲染不出来 —— 页面悄悄退回默认值
 *
 * 为什么不能直接合并成一个 lib 文件：
 *   CustomizationPanel.tsx 是 "use client" 组件，服务端 import 不到它的导出；
 *   而把它改成从 lib 引入，就要改这个受保护文件。
 *   —— 所以用「断言」代替「合并」：两份必须一致，但都不动。
 *
 * 本脚本做三件事：
 *   1. 两份的 id 集合必须完全一致
 *   2. 语义字段（label / bg / value / text / font / theme / color）必须逐条一致
 *   3. 交叉不变量：模板里引用的 font / theme / color 必须真实存在
 *
 * 用法: node scripts/check-design-vocab.mjs
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CANON = "lib/agent/catalog.ts"; // 规范（服务端 + agent 目录）
const COPY = "components/CustomizationPanel.tsx"; // 副本（UI）

/** 每个词汇表要逐条比对的语义字段 */
const VOCAB = {
  SPINE_FONTS: ["id", "label"],
  SPINE_THEMES: ["id", "label", "bg"],
  SPINE_TEXT_COLORS: ["id", "label", "value"],
  SPINE_TEMPLATES: ["id", "label", "text", "font", "theme", "color"],
  OBI_TEMPLATES: ["id", "label", "text", "font", "theme", "color"],
};

/**
 * 各自独有的字段：只允许出现在指定一侧，出现反了就是有人改错了地方。
 * 注意：模板类（SPINE_TEMPLATES / OBI_TEMPLATES）的 label 本身就是英文文案，
 * 所以两侧都没有 labelEn —— 字体 / 主题 / 颜色才有中英双份。
 */
const SIDE_ONLY = {
  SPINE_FONTS: { [CANON]: ["labelEn"], [COPY]: ["css", "canvas"] },
  SPINE_THEMES: { [CANON]: ["labelEn"], [COPY]: ["swatch"] },
  SPINE_TEXT_COLORS: { [CANON]: ["labelEn"], [COPY]: [] },
  SPINE_TEMPLATES: { [CANON]: [], [COPY]: [] },
  OBI_TEMPLATES: { [CANON]: [], [COPY]: [] },
};

/* ---------- 取数组字面量 ---------- */
function extractArray(src, name) {
  const start = src.indexOf(`export const ${name} = [`);
  if (start < 0) return null;
  const open = src.indexOf("[", start);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return null;
}

/* ---------- 把数组体拆成对象，再拆成键值对 ---------- */
function parseEntries(body) {
  const entries = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < body.length && body[i] !== q) {
        if (body[i] === "\\") i++;
        i++;
      }
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        entries.push(body.slice(start + 1, i));
        start = -1;
      }
    }
  }
  return entries.map(parseFields);
}

function parseFields(text) {
  const out = {};
  const re =
    /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,\n}]+)/g;
  for (const m of text.matchAll(re)) {
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

/* ---------- 跑起来 ---------- */
const canonSrc = readFileSync(join(ROOT, CANON), "utf8");
const copySrc = readFileSync(join(ROOT, COPY), "utf8");

let pass = 0;
const problems = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  OK   ${name}`);
  } else {
    problems.push(`${name}${detail ? "  -> " + detail : ""}`);
    console.log(`  FAIL ${name}${detail ? "  -> " + detail : ""}`);
  }
}

console.log("=".repeat(64));
console.log("halloCD · 设计词汇表一致性检查");
console.log("=".repeat(64));
console.log();
console.log(`规范（服务端 + agent 目录）: ${CANON}`);
console.log(`副本（UI 渲染）          : ${COPY}`);
console.log();

const parsed = {};

for (const [name, fields] of Object.entries(VOCAB)) {
  console.log(`[${name}]`);

  const canonBody = extractArray(canonSrc, name);
  const copyBody = extractArray(copySrc, name);
  if (!canonBody) {
    check(`${name} 在规范里存在`, false, `${CANON} 里找不到 export const ${name}`);
    continue;
  }
  if (!copyBody) {
    check(`${name} 在副本里存在`, false, `${COPY} 里找不到 export const ${name}`);
    continue;
  }

  const canonEntries = parseEntries(canonBody);
  const copyEntries = parseEntries(copyBody);
  parsed[name] = { canon: canonEntries, copy: copyEntries };

  check(
    `${name} 条目数一致`,
    canonEntries.length === copyEntries.length,
    `规范 ${canonEntries.length} / 副本 ${copyEntries.length}`,
  );

  const canonIds = canonEntries.map((e) => e.id);
  const copyIds = copyEntries.map((e) => e.id);
  const missingInCopy = canonIds.filter((id) => !copyIds.includes(id));
  const extraInCopy = copyIds.filter((id) => !canonIds.includes(id));
  check(
    `${name} id 集合一致`,
    missingInCopy.length === 0 && extraInCopy.length === 0,
    [
      missingInCopy.length ? `副本缺 ${missingInCopy.join(", ")}` : "",
      extraInCopy.length ? `副本多 ${extraInCopy.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("；"),
  );
  check(
    `${name} id 顺序一致`,
    JSON.stringify(canonIds) === JSON.stringify(copyIds),
    `规范 [${canonIds.join(",")}] / 副本 [${copyIds.join(",")}]`,
  );

  // 逐条比对语义字段
  const byId = new Map(copyEntries.map((e) => [e.id, e]));
  const diffs = [];
  for (const c of canonEntries) {
    const k = byId.get(c.id);
    if (!k) continue;
    for (const f of fields) {
      if (f === "id") continue;
      if (c[f] !== k[f]) {
        diffs.push(`${c.id}.${f}: 规范 "${c[f]}" ≠ 副本 "${k[f]}"`);
      }
    }
  }
  check(`${name} 语义字段逐条一致`, diffs.length === 0, diffs.join("；"));

  // 各自独有的字段不能串位
  const canonKeys = new Set(canonEntries.flatMap((e) => Object.keys(e)));
  const copyKeys = new Set(copyEntries.flatMap((e) => Object.keys(e)));
  const sideIssues = [];
  for (const [side, keys] of Object.entries(SIDE_ONLY[name])) {
    const actual = side === CANON ? canonKeys : copyKeys;
    for (const k of keys) {
      if (!actual.has(k)) sideIssues.push(`${side} 缺 ${k}`);
    }
  }
  check(`${name} 各自独有字段未串位`, sideIssues.length === 0, sideIssues.join("；"));
  console.log();
}

/* ---------- 交叉不变量 ---------- */
console.log("[交叉不变量]");

const fontIds = new Set((parsed.SPINE_FONTS?.canon ?? []).map((e) => e.id));
const themeIds = new Set((parsed.SPINE_THEMES?.canon ?? []).map((e) => e.id));
const colorValues = new Set(
  (parsed.SPINE_TEXT_COLORS?.canon ?? []).map((e) => (e.value ?? "").toUpperCase()),
);

for (const tplName of ["SPINE_TEMPLATES", "OBI_TEMPLATES"]) {
  const entries = parsed[tplName]?.canon ?? [];
  const badFont = entries.filter((e) => !fontIds.has(e.font)).map((e) => `${e.id}.font=${e.font}`);
  const badTheme = entries.filter((e) => !themeIds.has(e.theme)).map((e) => `${e.id}.theme=${e.theme}`);
  const badColor = entries
    .filter((e) => !colorValues.has((e.color ?? "").toUpperCase()))
    .map((e) => `${e.id}.color=${e.color}`);

  check(`${tplName} 的 font 都在 SPINE_FONTS 里`, badFont.length === 0, badFont.join("；"));
  check(`${tplName} 的 theme 都在 SPINE_THEMES 里`, badTheme.length === 0, badTheme.join("；"));
  check(
    `${tplName} 的 color 都在 SPINE_TEXT_COLORS 里`,
    badColor.length === 0,
    badColor.join("；"),
  );
}

/* ---------- 汇总 ---------- */
console.log();
console.log("=".repeat(64));
if (problems.length === 0) {
  console.log(`✓ 两份设计词汇表完全一致（${pass} 项断言通过）`);
  console.log("  规范与副本可以各改各的，但改完必须跑这个脚本。");
  console.log("=".repeat(64));
  process.exit(0);
}
console.log(`✗ ${problems.length} 项不一致：`);
for (const p of problems) console.log(`    ${p}`);
console.log("=".repeat(64));
process.exit(1);
