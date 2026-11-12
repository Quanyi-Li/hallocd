/**
 * halloCD · 多语句 SQL 拆句器
 * ==================================================================
 * 为什么需要它 —— 这是 v2.8 部署到真 Neon 后才暴露出来的坑：
 *
 *   Neon（以及所有走 HTTP 的 Postgres 驱动）把 SQL 当**预编译语句**发，
 *   而 Postgres 的扩展协议一个 Parse 消息只能带**一条**命令。
 *   于是整段 DDL 一次发过去必然报：
 *
 *     ERROR 42601: cannot insert multiple commands into a prepared statement
 *
 *   本地为什么看不见？因为本地的 pg-harness 走的是简单协议，多语句照单全收。
 *   于是「本地全绿、线上建表全炸」—— 所有碰数据库的路由 500。
 *
 *   修法有两条路：
 *     ① 拆成单句，逐条发 —— 18 条 DDL = 18 次往返，太慢；
 *     ② 拆成单句，再用驱动�� sql.transaction([...]) **一次请求**发出去 ——
 *        驱动会把它组装成 Neon 的 queries 数组，走简单协议，多语句合法。
 *
 *   本文件只负责「怎么切」，不负责「怎么发」。切分必须认得：
 *     · 单引号字符串 '...'，内部 '' 是转义（分号不能切）
 *     · 双引号标识符 "..."（分号不能切）
 *     · 行注释 -- ...（到行尾）
 *     · 块注释 /* ... *\/（分号不能切）
 *     · 美元引号 $$ ... $$（函数体常见，分号不能切）
 *
 *   注释会被丢掉 —— 执行时不需要，而「一段只有注释」的切片会被当成空语句过滤掉。
 */

/**
 * 把一段多语句 SQL 拆成单条语句数组。
 *
 * @param {string} sql
 * @returns {string[]}
 */
export function splitSqlStatements(sql) {
  const out = [];
  let buf = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = i + 1 < n ? sql[i + 1] : "";

    /* ---- 行注释：-- 到行尾 ---- */
    if (ch === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }

    /* ---- 块注释：/* ... *\/ ---- */
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    /* ---- 美元引号：$$ ... $$ ---- */
    if (ch === "$" && next === "$") {
      buf += "$$";
      i += 2;
      while (i < n) {
        if (sql[i] === "$" && sql[i + 1] === "$") {
          buf += "$$";
          i += 2;
          break;
        }
        buf += sql[i];
        i++;
      }
      continue;
    }

    /* ---- 单引号字符串：'' 是转义 ---- */
    if (ch === "'") {
      buf += ch;
      i++;
      while (i < n) {
        buf += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            buf += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    /* ---- 双引号标识符："" 是转义 ---- */
    if (ch === '"') {
      buf += ch;
      i++;
      while (i < n) {
        buf += sql[i];
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            buf += sql[i + 1];
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    /* ---- 语句分隔符 ---- */
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}
