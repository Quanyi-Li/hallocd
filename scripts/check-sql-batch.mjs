#!/usr/bin/env node
/**
 * halloCD · 多语句拆句器自检
 * ==================================================================
 * 为什么要这个测试：
 *   v2.8 部署到真 Neon 后才发现 —— 把整段 DDL 一次发过去会报
 *   42601「cannot insert multiple commands into a prepared statement」，
 *   于是线上所有碰数据库的路由 500。
 *   本地 pg-harness 走简单协议放行了多语句，所以「本地全绿、线上全炸」。
 *
 *   这个脚本守住两件事：
 *     ① 拆句器本身不切错（字符串 / 注释 / 美元引号里的分号不能切）
 *     ② SCHEMA_SQL 拆出来的条数与内容是对的
 *
 * 用法：node scripts/check-sql-batch.mjs
 */

import fs from "node:fs";
import path from "node:path";

import { splitSqlStatements } from "../lib/db/sql-batch.mjs";

const checks = [];
function check(name, pass, extra = "") {
  checks.push({ name, pass });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${extra ? `  → ${extra}` : ""}`);
}
function section(title) {
  console.log(`\n▸ ${title}`);
}

/* ---------- 1. 拆句器的边界情况 ---------- */
section("拆句器边界情况");

check(
  "普通多语句拆成两条",
  splitSqlStatements("SELECT 1; SELECT 2;").length === 2,
  JSON.stringify(splitSqlStatements("SELECT 1; SELECT 2;")),
);

check(
  "分号在单引号字符串里不切",
  splitSqlStatements("INSERT INTO t VALUES ('a;b'); SELECT 1;").length === 2,
  JSON.stringify(splitSqlStatements("INSERT INTO t VALUES ('a;b'); SELECT 1;")),
);

check(
  "转义的单引号（''）不切",
  splitSqlStatements("SELECT 'it''s; fine'; SELECT 2;").length === 2,
);

check(
  "分号在双引号标识符里不切",
  splitSqlStatements('CREATE TABLE "we;ird" (id TEXT); SELECT 1;').length === 2,
);

check(
  "行注释里的分号不切",
  splitSqlStatements("-- a; b\nSELECT 1; SELECT 2;").length === 2,
);

check(
  "块注释里的分号不切",
  splitSqlStatements("/* a; b */ SELECT 1; SELECT 2;").length === 2,
);

check(
  "美元引号里的分号不切",
  splitSqlStatements("CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; SELECT 2;").length === 2,
);

check(
  "注释被丢掉，只留可执行语句",
  splitSqlStatements("/* c1 */ SELECT 1; -- c2\n SELECT 2;").every((s) => !s.includes("/*") && !s.includes("--")),
  JSON.stringify(splitSqlStatements("/* c1 */ SELECT 1; -- c2\n SELECT 2;")),
);

check(
  "末句没有分号也能收进来",
  splitSqlStatements("SELECT 1;\nSELECT 2").length === 2,
);

/* ---------- 2. SCHEMA_SQL 本身 ---------- */
section("SCHEMA_SQL 拆句结果");

const schemaFile = path.join(process.cwd(), "lib", "db", "schema.ts");
const source = fs.readFileSync(schemaFile, "utf8");
const match = /export const SCHEMA_SQL = `([\s\S]*?)`;/.exec(source);
if (!match) {
  console.error("✗ 无法从 lib/db/schema.ts 解析 SCHEMA_SQL。");
  process.exit(2);
}
const ddl = match[1];
const statements = splitSqlStatements(ddl);

check("能解析出 SCHEMA_SQL", Boolean(ddl), `${ddl.length} 字节`);

/**
 * 顺序不变量：建表 → 补列 → 建索引。
 *
 * 为什么按「语句类型」判，而不是写死「6 张表 / 5 条补列 / 7 个索引」：
 *   写死数量等于给「加一张表就得改测试」设了个套 —— 加表的人很容易
 *   忘了改，然后测试挂在一个与本意无关的地方。
 *   真正要守的不变量只有**顺序**：任何一条 CREATE INDEX 都必须排在
 *   所有 ALTER TABLE 之后（v2.8 踩过：users_github_idx 排在了
 *   ALTER github_id 前面，老库上整张 users 表少三列）。
 */
const kinds = statements.map((s) => {
  const t = s.trim().toUpperCase();
  if (t.startsWith("CREATE TABLE")) return "table";
  /* CREATE UNIQUE INDEX 也是索引 —— unique 只是约束形式，顺序要求一样 */
  if (t.startsWith("CREATE UNIQUE INDEX")) return "index";
  if (t.startsWith("CREATE INDEX")) return "index";
  if (t.startsWith("ALTER TABLE")) return "alter";
  return "other";
});

const order = ["table", "alter", "index"];
const seen = new Set();
let orderOk = true;
const counts = {};
for (const k of kinds) {
  counts[k] = (counts[k] || 0) + 1;
  if (k === "other") continue;
  const rank = order.indexOf(k);
  for (const prev of seen) {
    /* 建表之前不该有补列；补列之前不该有索引 */
    if (order.indexOf(prev) > rank) orderOk = false;
  }
  seen.add(k);
}
check(
  "顺序是「建表 → 补列 → 建索引」（建索引的列必须已经存在）",
  orderOk && !counts.other,
  `建表×${counts.table || 0} → 补列×${counts.alter || 0} → 索引×${counts.index || 0}`,
);

const hasGithubCols = statements.some((s) =>
  /ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id/.test(s),
);
check("users 的 GitHub 三列在补列批次里", hasGithubCols);

const githubIdx = statements.findIndex((s) => /users_github_idx/.test(s));
const githubCol = statements.findIndex((s) =>
  /ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id/.test(s),
);
check(
  "users_github_idx 排在 github_id 补列之后（v2.8 踩过的坑）",
  githubIdx > githubCol && githubIdx >= 0 && githubCol >= 0,
  `github_id@${githubCol} → users_github_idx@${githubIdx}`,
);

const noSemicolonInside = statements.every((s) => !s.includes(";"));
check("拆出来的每条都不含分号（保证是单命令）", noSemicolonInside);

/* ---------- 汇总 ---------- */
const failed = checks.filter((c) => !c.pass);
console.log(
  `\n${failed.length ? "✗" : "✓"} ${checks.length - failed.length}/${checks.length} 通过` +
    (failed.length ? ` —— 失败：${failed.map((c) => c.name).join("；")}` : ""),
);
process.exit(failed.length ? 1 : 0);
