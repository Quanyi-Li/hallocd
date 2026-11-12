/**
 * Neon-HTTP 兼容 shim —— 用 PGlite（真实 Postgres 的 WASM 构建）垫底。
 * ==================================================================
 * 目的：让「未经修改的生产代码」能跑通 Postgres 路径。
 *
 * @neondatabase/serverless 的 HTTP 驱动做的事：
 *   POST https://<host>/sql
 *   headers: Neon-Connection-String / Neon-Raw-Text-Output:true / Neon-Array-Mode:true
 *   body:    { query, params }
 *   resp:    { fields: [{name, dataTypeID}], rows: [[v, ...]] }   ← 数组行
 *
 * 关键点：
 *   1. 客户端固定发 Neon-Array-Mode:true，所以响应必须是「数组行」，
 *      否则客户端的 Object.fromEntries 处理会炸。
 *   2. 客户端固定发 Neon-Raw-Text-Output:true，所以值必须是「原始文本」，
 *      类型解析由客户端按 dataTypeID 做（bool 要给 t/f，不是 true/false）。
 *   3. 请求有两种形态，本 shim 两种都支持（与真 Neon 对齐）：
 *        { query, params }              单条 —— 走扩展协议（预编译）
 *        { queries: [{query, params}] } 批次 —— 走简单协议 + **一个事务**
 *      批次是驱动的 sql.transaction([...]) 发的形状，生产代码用它发整段 DDL。
 *      （只实现单条形态的那版 shim，会把「真 Neon 不允许整段多语句」这个洞盖住
 *        —— 详见 docs/backend-README.md §12.7）
 */
import { createServer } from "node:https";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

// 相对脚本目录解析资源，cwd 在哪都不影响
const HERE = fileURLToPath(new URL(".", import.meta.url));
const PORT = 443;
const LOG = join(HERE, "sql-log.txt");

const key = readFileSync(join(HERE, "server.key"), "utf8");
const cert = readFileSync(join(HERE, "server.crt"), "utf8");

const db = await PGlite.create(join(HERE, "pgdata"));

/* ---------- 值编码：转成 Postgres 原始文本 ---------- */
function rawText(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "t" : "f";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return "\\x" + Buffer.from(value).toString("hex");
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/* ---------- 参数解码：JSON 文本 → 原生 JS 值 ---------- */
/*
 * 为什么需要这一步（这是本 shim 最容易骗过人的地方）：
 *
 *   驱动（@neondatabase/serverless）把**所有**参数都序列化成「原始文本」再发过来：
 *     42 → "42"    true → "true"    null → null
 *
 *   真实 Neon 收到这些文本后，交给 Postgres 去推断参数类型并解析 —— 这一步在**服务端**。
 *   但 PGlite 是 WASM 客户端：它先 Describe 拿到服务端推断出的参数类型，
 *   再按类型挑 JS 序列化器。而 bool 的序列化器只接受**原生 boolean**：
 *
 *     boolean: { serialize: e => { if (typeof e !== "boolean")
 *                                    throw new Error("Invalid input for boolean type");
 *                                    return e ? "t" : "f"; } }
 *
 *   所以直接把驱动发来的 "true" 丢给 PGlite 会炸 —— 这是 **PGlite 客户端行为**，
 *   不是 Neon 行为，更不是生产代码的问题。
 *
 *   修法：先问 Postgres「这几个参数分别是什么类型」（describeQuery），
 *        再把文本还原成对应类型的原生值 —— 等价于把 Postgres 服务端那次解析搬到本地做。
 *        结果与真实 Neon 完全一致（bool 的规范文本就是 t/f）。
 */
const BOOL_TRUE = new Set(["t", "true", "1", "y", "yes", "on"]);
const BOOL_FALSE = new Set(["f", "false", "0", "n", "no", "off"]);
const OID_BOOL = 16;

function decodeParam(p) {
  if (p === null || p === undefined) return null;
  if (typeof p === "boolean") return p;
  if (typeof p === "string") {
    // 驱动把 bytea 编码成 \xHEX
    if (/^\\x[0-9a-fA-F]*$/.test(p)) {
      return Buffer.from(p.slice(2), "hex");
    }
    return p;
  }
  if (typeof p === "number") return p;
  return p;
}

/** 把文本还原成原生 boolean；非法文本抛 Postgres 同款报错信息 */
function coerceBool(raw) {
  if (typeof raw === "boolean") return raw;
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : null;
  if (s !== null && BOOL_TRUE.has(s)) return true;
  if (s !== null && BOOL_FALSE.has(s)) return false;
  throw new Error(`invalid input syntax for type boolean: "${String(raw)}"`);
}

/**
 * 问 Postgres 这条语句的参数类型（服务端推断，与真实 Neon 同源）
 * 返回 dataTypeID 数组；失败时抛原始错误（那通常就是语句本身的真实问题）
 */
async function describeParamOids(sqlText) {
  const desc = await db.describeQuery(sqlText);
  return (desc?.queryParams ?? []).map((p) => p.dataTypeID);
}

function toArrayRows(result) {
  const fields = result?.fields ?? [];
  const rows = result?.rows ?? [];
  return {
    fields: fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rows: rows.map((r) => {
      if (Array.isArray(r)) return r.map(rawText);
      // PGlite 返回对象行 —— 按 fields 顺序摊成数组
      return fields.map((f) => rawText(r[f.name]));
    }),
  };
}

/**
 * 补上真 Neon 会带的 command / rowCount / rowAsArray。
 * 批次响应用它（见下方 batch 分支）—— 驱动的解析器认这几个字段。
 */
function withCommand(result, sqlText) {
  const out = toArrayRows(result);
  const head = String(sqlText || "").trim().split(/\s+/)[0] || "";
  const command = head.toUpperCase();
  return {
    ...out,
    command,
    rowCount: command === "SELECT" ? out.rows.length : null,
    rowAsArray: false,
  };
}

const server = createServer({ key, cert }, async (req, res) => {
  const url = new URL(req.url, `https://${req.headers.host}`);

  if (url.pathname === "/__health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, engine: "pglite (real postgres, wasm)" }));
    return;
  }

  if (url.pathname === "/__sql-log") {
    try {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end(readFileSync(LOG, "utf8"));
    } catch {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("");
    }
    return;
  }

  if (url.pathname !== "/sql") {
    res.writeHead(404);
    res.end("not found");
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: `bad json: ${e.message}` }));
    return;
  }

  /**
   * 真 Neon 的 HTTP 端点有两种请求形态：
   *   ① { query, params }              —— 单条（预编译协议）
   *   ② { queries: [{query, params}] } —— 批次（简单协议，**一个事务**，失败整批回滚）
   *
   * ② 是驱动的 sql.transaction([...]) 发的形状 —— 生产代码用它发整段 DDL。
   *
   * 这个 shim 当年只实现了 ①，而且注释里写着「params 为空 → 简单查询协议，
   * 允许多条语句（schema 自初始化要用）」—— 那正是**真 Neon 不允许**的写法。
   * 于是「本地能建表、线上建不了表」这个洞被工具自己盖住了（详见 backend-README §12.7）。
   * 现在把 ② 补上，语义对齐真 Neon：批次走事务、原子、返回最后一条的结果。
   */
  const batch = Array.isArray(parsed.queries) && parsed.queries.length
    ? parsed.queries.map((q) => ({
        query: String(q?.query ?? ""),
        params: Array.isArray(q?.params) ? q.params : [],
      }))
    : null;
  const query = batch ? "" : (parsed.query ?? "");
  const params = batch ? [] : (Array.isArray(parsed.params) ? parsed.params : []);
  const statements = batch
    ? batch
    : [{ query, params }];

  // ---- 故障注入：模拟 Postgres 并发建表竞态 ----
  // CREATE TABLE IF NOT EXISTS 在 Postgres 里不是原子的，
  // 两个会话同时建同一张表时后者会报 duplicate key ... pg_type_typname_nsp_index。
  // FAULT_INJECT=N → 前 N 次建表请求返回该错误（每次重启重置计数）。
  const faultBudget = Number(process.env.FAULT_INJECT || "0");
  if (
    faultBudget > 0 &&
    (globalThis.__faultCount || 0) < faultBudget &&
    statements.some((st) => st.query.includes("CREATE TABLE IF NOT EXISTS users"))
  ) {
    globalThis.__faultCount = (globalThis.__faultCount || 0) + 1;
    console.log(
      `[fault-injection] 第 ${globalThis.__faultCount} 次建表故意返回 pg_type_typname_nsp_index 冲突`,
    );
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        message:
          'duplicate key value violates unique constraint "pg_type_typname_nsp_index"',
        severity: "ERROR",
        code: "23505",
      }),
    );
    return;
  }

  // 记录真实执行的 SQL —— 用来证明生产代码确实走了 Postgres 路径
  try {
    for (const st of statements) {
      appendFileSync(
        LOG,
        `-- params=${st.params.length ? JSON.stringify(st.params) : "(none)"}\n${st.query}\n\n`,
        "utf8",
      );
    }
  } catch {
    /* 日志失败不影响主流程 */
  }

  try {
    let result;
    if (batch) {
      /**
       * 批次：简单协议 + 一个事务（失败整批回滚）。
       *
       * 响应形状必须和真 Neon 一致 —— 真 Neon 对批次返回
       *   { results: [ {fields, rows, command, rowCount, rowAsArray}, ... ] }
       * 每个元素对应一条语句。只回最后一条的话，驱动会报
       * 「unexpected result format」（这是实测踩出来的）。
       */
      const results = [];
      await db.transaction(async (tx) => {
        for (const st of statements) {
          if (!st.query.trim()) continue;
          let r;
          if (st.params.length === 0) {
            const execResults = await tx.exec(st.query);
            r = execResults.length
              ? execResults[execResults.length - 1]
              : { fields: [], rows: [] };
          } else {
            const oids = await describeParamOids(st.query);
            const bound = st.params.map((p, i) => {
              const v = decodeParam(p);
              return oids[i] === OID_BOOL ? coerceBool(v) : v;
            });
            r = await tx.query(st.query, bound);
          }
          results.push(withCommand(r, st.query));
        }
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ results }));
      return;
    } else if (params.length === 0) {
      // 简单查询协议：允许多条语句
      const results = await db.exec(query);
      result = results.length ? results[results.length - 1] : { fields: [], rows: [] };
    } else {
      // 扩展协议：单条语句 + 参数
      // 先问 Postgres 参数类型，再把驱动的原始文本还原成对应类型的原生值
      const oids = await describeParamOids(query);
      const bound = params.map((p, i) => {
        const v = decodeParam(p);
        return oids[i] === OID_BOOL ? coerceBool(v) : v;
      });
      result = await db.query(query, bound);
    }
    const out = toArrayRows(result);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(out));
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        message: e?.message ?? String(e),
        detail: e?.detail,
        hint: e?.hint,
        position: e?.position,
        severity: e?.severity,
      }),
    );
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`neon-http shim listening on https://127.0.0.1:${PORT}/sql`);
});

// 首次启动清一次日志
writeFileSync(LOG, `=== shim started ${new Date().toISOString()} ===\n`, "utf8");

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    await db.close().catch(() => {});
    server.close();
    process.exit(0);
  });
}
