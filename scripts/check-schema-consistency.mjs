#!/usr/bin/env node
/**
 * halloCD · schema 一致性静态检查
 * ==================================================================
 * lib/db/schema.ts（DDL 单一真源）与 lib/db/postgres.ts（SQL 实现）
 * 是两个手写文件 —— 列名对不上 = 部署到 Vercel 后第一次写库就崩。
 *
 * 这个脚本把两边的列名解析出来做交叉比对：
 *   · schema.ts  → CREATE TABLE 的列
 *   · postgres.ts → INSERT INTO (...) / UPDATE ... SET col= / WHERE col=
 *
 * 用法：node scripts/check-schema-consistency.mjs
 * 退出码 0 = 一致；1 = 发现不一致。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const schemaSrc = readFileSync(join(root, "lib/db/schema.ts"), "utf8");
const pgSrc = readFileSync(join(root, "lib/db/postgres.ts"), "utf8");

/* ---------- 1. 解析 schema.ts 的列 ---------- */

const ddlMatch = schemaSrc.match(/export const SCHEMA_SQL\s*=\s*`([\s\S]*?)`;/);
if (!ddlMatch) {
  console.error("FAIL: 无法从 schema.ts 解析 SCHEMA_SQL");
  process.exit(1);
}
const ddl = ddlMatch[1];

/** @type {Map<string, Set<string>>} table -> columns */
const schemaTables = new Map();

const createRe = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\);/g;
let m;
while ((m = createRe.exec(ddl)) !== null) {
  const table = m[1];
  const body = m[2];
  const cols = new Set();
  let depth = 0;
  let current = "";
  const parts = [];
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  for (const raw of parts) {
    const line = raw.trim();
    if (!line) continue;
    const upper = line.toUpperCase();
    if (
      upper.startsWith("PRIMARY KEY") ||
      upper.startsWith("UNIQUE") ||
      upper.startsWith("FOREIGN KEY") ||
      upper.startsWith("CHECK") ||
      upper.startsWith("CONSTRAINT")
    ) {
      continue;
    }
    const col = line.split(/\s+/)[0];
    if (/^\w+$/.test(col)) cols.add(col.toLowerCase());
  }
  schemaTables.set(table, cols);
}

/* ---------- 2. 解析 postgres.ts 引用的列 ---------- */

/** @type {Map<string, Set<string>>} table -> referenced columns */
const used = new Map();

function note(table, col) {
  const t = table.toLowerCase();
  const c = col.toLowerCase();
  if (!used.has(t)) used.set(t, new Set());
  used.get(t).add(c);
}

// INSERT INTO tbl (a, b, c) VALUES (...)
const insertRe = /INSERT INTO\s+(\w+)\s*\(([^)]*)\)/gi;
while ((m = insertRe.exec(pgSrc)) !== null) {
  const table = m[1];
  for (const raw of m[2].split(",")) {
    const c = raw.trim();
    if (c) note(table, c);
  }
}

// UPDATE tbl SET col=..., col2=... WHERE ...
const updateRe = /UPDATE\s+(\w+)\s+SET\s+([\s\S]*?)\s+WHERE/gi;
while ((m = updateRe.exec(pgSrc)) !== null) {
  const table = m[1];
  const assigns = m[2];
  const assignRe = /(\w+)\s*=\s*\$?\d+/g;
  let a;
  while ((a = assignRe.exec(assigns)) !== null) note(table, a[1]);
}

// WHERE col = / col IN / ORDER BY col / col LIKE ...
function collectWhereCols(table, whereText) {
  const whereRe = /\b(\w+)\s*(?:=|\sIN\b|\sLIKE\b|\sIS\b|>|<)/g;
  let w;
  while ((w = whereRe.exec(whereText)) !== null) {
    const c = w[1].toLowerCase();
    // 排除 SQL 关键字与函数名
    if (
      [
        "select", "from", "where", "and", "or", "not", "null", "true", "false",
        "limit", "order", "by", "desc", "asc", "as", "on", "delete", "update",
        "insert", "into", "values", "set", "like", "in", "is", "between",
        "count", "sum", "max", "min", "coalesce", "lower", "upper",
      ].includes(c)
    ) {
      continue;
    }
    note(table, c);
  }
}

const whereRe = /WHERE\s+([\s\S]*?)(?=\n\s*`|\n\s*\)|;)/gi;
while ((m = whereRe.exec(pgSrc)) !== null) {
  // 反查这句话属于哪个表：取其前面最近的表名
  const before = pgSrc.slice(0, m.index);
  const tablesBefore = [...before.matchAll(/\b(?:INTO|FROM|UPDATE|JOIN)\s+(\w+)/gi)];
  const table = tablesBefore.length
    ? tablesBefore[tablesBefore.length - 1][1]
    : "";
  if (!table) continue;
  collectWhereCols(table, m[1]);
}

// ORDER BY col
const orderRe = /ORDER BY\s+([\w,\s]+?)(?:\s+ASC|\s+DESC|\s+LIMIT|\s*`|\n)/gi;
while ((m = orderRe.exec(pgSrc)) !== null) {
  const before = pgSrc.slice(0, m.index);
  const tablesBefore = [...before.matchAll(/\b(?:INTO|FROM|UPDATE)\s+(\w+)/gi)];
  const table = tablesBefore.length
    ? tablesBefore[tablesBefore.length - 1][1]
    : "";
  if (!table) continue;
  for (const raw of m[1].split(",")) {
    const c = raw.trim().split(/\s+/)[0];
    if (c && /^\w+$/.test(c)) note(table, c);
  }
}

/* ---------- 3. 比对 ---------- */

const problems = [];

for (const [table, cols] of used) {
  const known = schemaTables.get(table);
  if (!known) {
    problems.push(`表 ${table} 在 postgres.ts 里被使用，但 schema.ts 里没有定义`);
    continue;
  }
  for (const col of cols) {
    if (!known.has(col)) {
      problems.push(`表 ${table} 缺少列 ${col}`);
    }
  }
}

// schema.ts 定义了但 postgres.ts 从不读的表（提示，不算错）
const unusedTables = [...schemaTables.keys()].filter((t) => !used.has(t));

/* ---------- 4. preflight 的表清单必须和 schema 一致 ----------
 *
 * scripts/preflight.mjs 里有一份手写的 TABLES 数组（部署前自检要查哪些表）。
 * v2.9 加了 agent_activity 时那份清单没跟着改 —— 于是新表真的没建出来，
 * preflight 也照样报「齐全」。两份清单漂移 = 部署自检形同虚设。
 *
 * 这里把「两份清单一致」变成可跑的断言，而不是靠人记得同步。
 */
const preflightSrc = readFileSync(join(root, "scripts/preflight.mjs"), "utf8");
const pfBlock = preflightSrc.match(/const TABLES\s*=\s*\[([\s\S]*?)\]/);
let preflightTables = [];
if (pfBlock) {
  preflightTables = [...pfBlock[1].matchAll(/["'](\w+)["']/g)].map((x) => x[1]);
} else {
  problems.push("scripts/preflight.mjs 里找不到 TABLES 数组");
}
if (preflightTables.length) {
  const schemaNames = [...schemaTables.keys()];
  const missingInPf = schemaNames.filter((t) => !preflightTables.includes(t));
  const extraInPf = preflightTables.filter((t) => !schemaNames.includes(t));
  if (missingInPf.length) {
    problems.push(
      `scripts/preflight.mjs 的 TABLES 少了：${missingInPf.join(", ")}（schema.ts 里有，但部署自检不会查）`,
    );
  }
  if (extraInPf.length) {
    problems.push(
      `scripts/preflight.mjs 的 TABLES 多了：${extraInPf.join(", ")}（schema.ts 里没有这张表）`,
    );
  }
  if (!missingInPf.length && !extraInPf.length) {
    console.log(
      `✓ preflight 的 TABLES 与 schema.ts 一致（${schemaNames.length} 张表）`,
    );
  }
}

/* ---------- 5. 报告 ---------- */

console.log("=".repeat(66));
console.log("halloCD · schema 一致性检查");
console.log("=".repeat(66));
console.log();
console.log(`schema.ts 表：${[...schemaTables.keys()].join(", ")}`);
console.log();
for (const [table, cols] of schemaTables) {
  console.log(`  ${table.padEnd(12)} ${cols.size} 列`);
}
console.log();

if (problems.length) {
  console.log(`✗ 发现 ${problems.length} 处不一致：`);
  for (const p of problems) console.log(`    - ${p}`);
  console.log();
  console.log("=".repeat(66));
  process.exit(1);
}

console.log("✓ 所有 INSERT / UPDATE / WHERE 引用的列在 schema.ts 中都有定义");
if (unusedTables.length) {
  console.log(`  (提示：以下表在 postgres.ts 中未直接引用：${unusedTables.join(", ")})`);
}
console.log("=".repeat(66));
