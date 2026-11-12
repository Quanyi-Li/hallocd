/**
 * A/B 证明：Postgres 并发建表竞态错误
 *   · 无重试（直接调用驱动）→ 致命，抛异常
 *   · 有重试（应用内 ensureInit）→ 自愈，请求成功
 *
 * 故障由 shim 注入（FAULT_INJECT=N），模拟 Postgres 真实行为：
 *   duplicate key value violates unique constraint "pg_type_typname_nsp_index"
 *
 * 跑法（见 README）：
 *   1. 用 FAULT_INJECT=1 启动 shim
 *   2. 重启应用（让 route bundle 变「新鲜」，才会重新跑 schema）
 *   3. node scripts/pg-harness/ab-proof.mjs http://localhost:3001
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const proj = join(HERE, "..", "..");
const { neon } = await import(
  pathToFileURL(join(proj, "node_modules/@neondatabase/serverless/index.mjs")).href
);

const src = readFileSync(join(proj, "lib/db/schema.ts"), "utf8");
const schema = src.match(/export const SCHEMA_SQL\s*=\s*`([\s\S]*?)`;/)[1];
const sql = neon("postgresql://postgres:pw@localhost:443/hallocd");

const BASE = process.argv[2] || "http://localhost:3001";

console.log("=".repeat(64));
console.log("A/B：无重试 vs 有重试");
console.log("=".repeat(64));
console.log();
console.log("[A] 直接调用驱动执行 schema（= 修复前的行为，无退避重试）");
try {
  await sql.query(schema);
  console.log("  没有抛错 —— 故障注入本轮没触发（检查 FAULT_INJECT 设置）");
  process.exitCode = 2;
} catch (e) {
  console.log(`  抛出异常：${String(e.message).slice(0, 110)}`);
  console.log("  → 结论：不带重试时，这就是一次 500。");
}
console.log();
console.log("[B] 应用内 ensureInit（带退避重试）");
const r = await fetch(`${BASE}/api/auth/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    handle: "abprobe" + Date.now().toString(36).slice(-4),
    email: `ab${Date.now()}@probe.test`,
    password: "Probe-Pass-2026",
  }),
});
const body = await r.text();
console.log(`  应用响应 HTTP ${r.status}`);
console.log(`  → ${r.status === 200 ? "自愈成功" : "失败"}`);
if (r.status !== 200) {
  console.log("  body: " + body.slice(0, 200));
  process.exitCode = 1;
}
