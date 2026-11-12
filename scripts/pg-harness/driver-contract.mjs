/**
 * 用项目里真实的 @neondatabase/serverless 驱动，打到本地 shim 上。
 * 目的：在把整套业务流搬上 Postgres 之前，先证明
 *   「驱动 ↔ shim」的 HTTP 契约成立，且我们的 SQL 真能跑。
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// 从项目目录解析真实的驱动（脚本在 scripts/pg-harness/ 下）
const here = fileURLToPath(new URL(".", import.meta.url));
const proj = join(here, "..", "..");
const { neon } = await import(
  pathToFileURL(join(proj, "node_modules/@neondatabase/serverless/index.mjs")).href
);

const url = "postgresql://postgres:pw@localhost:443/hallocd";
const sql = neon(url);

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  OK   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${extra ? "  -> " + extra : ""}`);
  }
}

console.log("=".repeat(64));
console.log("驱动 ↔ shim 契约验证（真实 neon 驱动 + 真实 Postgres 内核）");
console.log("=".repeat(64));
console.log();

// 1. 简单查询：单条语句
console.log("[1] 单条查询");
{
  const rows = await sql.query("SELECT 1 AS one, 'hi' AS greeting");
  check("返回一行", rows.length === 1, `len=${rows.length}`);
  check("one === '1'", String(rows[0]?.one) === "1", JSON.stringify(rows[0]));
  check("greeting === 'hi'", rows[0]?.greeting === "hi", JSON.stringify(rows[0]));
}

// 2. 参数化查询
console.log("[2] 参数化查询");
{
  const rows = await sql.query("SELECT $1::text AS a, $2::int AS b, $3::bool AS c", [
    "hello",
    42,
    true,
  ]);
  const r = rows[0];
  check("text 参数 → string", r?.a === "hello", JSON.stringify(r));
  // 关键：服务端回原始文本，客户端按 dataTypeID 解析成真正的类型
  check("int 参数 → number 42", r?.b === 42, JSON.stringify(r));
  check("bool 参数 → boolean true", r?.c === true, JSON.stringify(r));
}

// 3. 多条语句（schema 自初始化走的就是这条）
console.log("[3] 多条语句（简单查询协议）");
{
  // 幂等：先清掉上一轮残留
  await sql.query("DROP TABLE IF EXISTS t_probe;");
  await sql.query(
    `CREATE TABLE IF NOT EXISTS t_probe (id TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, flag BOOLEAN NOT NULL DEFAULT FALSE, j TEXT NOT NULL DEFAULT '{}');` +
      `CREATE INDEX IF NOT EXISTS t_probe_idx ON t_probe(n);`,
  );
  const rows = await sql.query("SELECT count(*)::text AS c FROM t_probe");
  check("建表成功且可查", rows.length === 1, JSON.stringify(rows));
}

// 4. RETURNING
console.log("[4] INSERT ... RETURNING");
{
  const rows = await sql.query(
    `INSERT INTO t_probe (id, n, flag, j) VALUES ($1,$2,$3,$4) RETURNING id, n, flag`,
    ["probe-1", 7, true, JSON.stringify({ a: 1 })],
  );
  check("返回 1 行", rows.length === 1, JSON.stringify(rows));
  check("id 正确", rows[0]?.id === "probe-1", JSON.stringify(rows));
  check("n 为 number 7", rows[0]?.n === 7, JSON.stringify(rows));
  check("flag 为 boolean true", rows[0]?.flag === true, JSON.stringify(rows));
}

// 5. NULL 往返
console.log("[5] NULL 往返");
{
  await sql.query("INSERT INTO t_probe (id, n, flag, j) VALUES ($1,$2,$3,$4)", [
    "probe-2",
    0,
    false,
    "{}",
  ]);
  const rows = await sql.query(
    "UPDATE t_probe SET n=$2 WHERE id=$1 RETURNING id, n, flag",
    ["probe-2", 99],
  );
  check("UPDATE RETURNING 正常", rows.length === 1 && String(rows[0].n) === "99", JSON.stringify(rows));
  const nullRows = await sql.query(
    "SELECT NULL::text AS n FROM t_probe WHERE id=$1",
    ["probe-2"],
  );
  check("NULL 返回 null", nullRows[0]?.n === null, JSON.stringify(nullRows));
  // 关键安全项：FALSE 必须被解析成 boolean false，而不是字符串 "f"
  // （若拿到 "f"，Boolean("f") === true，吊销掉的 key 会被当成有效）
  const falseRows = await sql.query("SELECT flag FROM t_probe WHERE id=$1", [
    "probe-2",
  ]);
  check(
    "FALSE → boolean false（不是字符串 'f'）",
    falseRows[0]?.flag === false,
    JSON.stringify(falseRows),
  );
}

// 6. LIMIT $1（我们 listUsers / listOrders 用的就是它）
console.log("[6] LIMIT $1");
{
  const rows = await sql.query("SELECT id FROM t_probe ORDER BY id LIMIT $1", [1]);
  check("LIMIT 参数生效", rows.length === 1, JSON.stringify(rows));
}

// 7. UPDATE ... RETURNING 影响行数语义（revokeAgentKey 依赖）
console.log("[7] UPDATE 影响行数");
{
  const rows = await sql.query(
    "UPDATE t_probe SET flag=TRUE WHERE id=$1 RETURNING id",
    ["nope-not-exist"],
  );
  check("无匹配 → 0 行", rows.length === 0, JSON.stringify(rows));
}

// 8. SQL 错误 → 驱动抛 NeonDbError
console.log("[8] 错误处理");
{
  let err = null;
  try {
    await sql.query("SELECT * FROM table_that_does_not_exist");
  } catch (e) {
    err = e;
  }
  check("坏 SQL 抛出异常", err !== null, "no error thrown");
  check("异常带 message", !!err?.message, String(err?.message).slice(0, 120));
}

console.log();
console.log("=".repeat(64));
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log("=".repeat(64));
process.exit(fail === 0 ? 0 : 1);
