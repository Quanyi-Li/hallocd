#!/usr/bin/env node
/**
 * halloCD · 建表脚本
 * ==================================================================
 * 用法：
 *   node scripts/db-init.mjs
 *   DATABASE_URL=postgresql://... node scripts/db-init.mjs
 *
 * 做什么：
 *   在目标 Postgres 上执行 lib/db/schema.ts 里的 DDL
 *   （全部 CREATE TABLE IF NOT EXISTS —— 幂等，重复跑无害）
 *
 * 什么时候需要手动跑：
 *   · 正常情况下**不需要** —— 平台第一次访问数据库时会自动建表
 *   · 但如果你的账号对 DDL 没权限，或者想在部署前先验证连接，就手动跑一次
 */

import fs from "node:fs";
import path from "node:path";

const url = (process.env.DATABASE_URL || "").trim();
if (!url) {
  console.error(
    "✗ 缺少 DATABASE_URL。\n" +
      "  示例：\n" +
      "    $env:DATABASE_URL='postgresql://user:pass@host/db?sslmode=require'\n" +
      "    node scripts/db-init.mjs\n",
  );
  process.exit(2);
}

/* 从 schema.ts 里抠出 SCHEMA_SQL —— 单一真源，不复制 DDL */
const schemaFile = path.join(process.cwd(), "lib", "db", "schema.ts");
const source = fs.readFileSync(schemaFile, "utf8");
const match = /export const SCHEMA_SQL = `([\s\S]*?)`;/.exec(source);
if (!match) {
  console.error("✗ 无法从 lib/db/schema.ts 解析 SCHEMA_SQL。");
  process.exit(2);
}
const ddl = match[1];

/* 拆句器与应用侧共用同一份（lib/db/sql-batch.mjs）—— 不复制实现 */
const { splitSqlStatements } = await import("../lib/db/sql-batch.mjs");

const { neon } = await import("@neondatabase/serverless");
const sql = neon(url);

console.log("▸ 目标数据库：", url.replace(/\/\/([^:]+):[^@]+@/, "//$1:***@"));
console.log("▸ 正在建表…\n");

/**
 * 为什么不是 `sql.query(ddl)` 一把梭：
 *   Neon 的 HTTP 驱动走预编译协议，一个 Parse 消息只能带一条命令，
 *   整段 DDL 一次发会报 42601「cannot insert multiple commands into a prepared statement」。
 *   所以拆成单句，再用 sql.transaction 一次请求发一整批（queries 数组 = 简单协议）。
 */
const statements = splitSqlStatements(ddl);

try {
  await sql.transaction(statements.map((statement) => sql.query(statement)));
  console.log(`✓ 建表完成（${statements.length} 条语句，一次请求发出）。\n`);
  console.log("  表：users / sessions / agent_keys / orders / templates / uploads");
} catch (err) {
  console.error("✗ 建表失败：", err?.message || err);
  process.exit(1);
}
