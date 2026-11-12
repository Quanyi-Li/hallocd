/**
 * halloCD · Postgres 存储实现
 * ==================================================================
 * 生产实现。用 @neondatabase/serverless 的 HTTP 驱动（纯 fetch）：
 *   · 无原生二进制依赖，Vercel 上零配置
 *   · 兼容 Neon / Vercel Postgres / Supabase / 任何 Postgres
 *
 * 读一个环境变量：DATABASE_URL
 * 没有它就会回落到 lib/db/file.ts（本地开发 / 离线演示）。
 */

import { neon } from "@neondatabase/serverless";

import { SCHEMA_SQL } from "@/lib/db/schema";
import { splitSqlStatements } from "@/lib/db/sql-batch.mjs";
import type {
  DataStore,
  DbAgentActivity,
  DbAgentKey,
  DbOrder,
  DbSession,
  DbTemplate,
  DbUser,
  DbUserWithSecret,
} from "@/lib/db/types";

type Row = Record<string, unknown>;

function toUser(row: Row): DbUserWithSecret {
  return {
    id: String(row.id),
    handle: String(row.handle),
    email: String(row.email),
    displayName: String(row.display_name ?? ""),
    bio: String(row.bio ?? ""),
    avatarColor: String(row.avatar_color ?? "#E65100"),
    agentNote: String(row.agent_note ?? ""),
    passwordHash: String(row.password_hash ?? ""),
    githubId: row.github_id == null ? null : String(row.github_id),
    githubLogin: row.github_login == null ? null : String(row.github_login),
    githubAvatarUrl:
      row.github_avatar_url == null ? null : String(row.github_avatar_url),
    createdAt: String(row.created_at ?? ""),
  };
}

function publicUser(u: DbUserWithSecret): DbUser {
  const { passwordHash: _ignored, ...rest } = u;
  return {
    ...rest,
    /* 旧行没有 GitHub 列 —— 统一补 null，调用方不用到处写 ?? "" */
    githubId: rest.githubId ?? null,
    githubLogin: rest.githubLogin ?? null,
    githubAvatarUrl: rest.githubAvatarUrl ?? null,
  };
}

function toKey(row: Row): DbAgentKey {
  return {
    key: String(row.key),
    label: String(row.label ?? ""),
    userId: row.user_id == null ? null : String(row.user_id),
    createdAt: String(row.created_at ?? ""),
    revoked: parseBool(row.revoked),
  };
}

function toActivity(row: Row): DbAgentActivity {
  return {
    id: String(row.id),
    userId: row.user_id == null ? null : String(row.user_id),
    keyLabel: String(row.key_label ?? ""),
    action: String(row.action ?? ""),
    method: String(row.method ?? ""),
    path: String(row.path ?? ""),
    orderId: row.order_id == null ? null : String(row.order_id),
    statusCode: Number(row.status_code ?? 0),
    ok: parseBool(row.ok),
    detail: String(row.detail ?? ""),
    durationMs: Number(row.duration_ms ?? 0),
    createdAt: String(row.created_at ?? ""),
  };
}

function toSession(row: Row): DbSession {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    createdAt: String(row.created_at ?? ""),
    expiresAt: String(row.expires_at ?? ""),
  };
}

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 布尔列的安全解析。
 *
 * 为什么要这么写：驱动默认按 dataTypeID 解析 boolean 列，会得到真正的
 * true/false。但如果服务端把该列报成未知 OID，驱动会退化成「原样返回字符串」，
 * 于是 row.revoked 可能是字符串 "f" —— 而 Boolean("f") === true，
 * **被吊销的 key 会被当成有效 key**。那是鉴权绕过，不能靠运气。
 */
function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return ["t", "true", "1", "y", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return false;
}

function toOrder(row: Row): DbOrder {
  return {
    id: String(row.id),
    userId: row.user_id == null ? null : String(row.user_id),
    senderHandle: row.sender_handle == null ? null : String(row.sender_handle),
    receiverHandle:
      row.receiver_handle == null ? null : String(row.receiver_handle),
    receiverName: String(row.receiver_name ?? ""),
    giftToken: String(row.gift_token ?? ""),
    status: String(row.status ?? "quoted") as DbOrder["status"],
    productId: String(row.product_id ?? ""),
    quantity: Number(row.quantity ?? 1),
    deliveryDate: String(row.delivery_date ?? ""),
    quote: parseJson(row.quote_json),
    plan: parseJson(row.plan_json),
    design: parseJson(row.design_json),
    letter: parseJson(row.letter_json),
    payment: row.payment_json ? parseJson(row.payment_json) : null,
    shipment: row.shipment_json ? parseJson(row.shipment_json) : null,
    error: row.error_json ? parseJson(row.error_json) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function toTemplate(row: Row): DbTemplate {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    kind: String(row.kind ?? ""),
    description: String(row.description ?? ""),
    assets: (parseJson(row.assets_json) as unknown as DbTemplate["assets"]) ?? [],
    createdAt: String(row.created_at ?? ""),
  };
}

/**
 * 探一次库 —— 给部署就绪自检用。
 *
 * 为什么要有：
 *   `DATABASE_URL` 配了 ≠ 连得上。最常见的翻车是
 *   「URL 指向了 Supabase（只有 TCP:5432，这个驱动走 HTTP /sql）」、
 *   「IP 被防火墙拦了」、「证书链不对」。
 *   这些在 health 端点上都应该**看得见**，而不是等到用户注册时才发现。
 *
 * 注意：驱动的 endpoint 派生规则是 `https://<host>/sql`（**丢弃端口**），
 * 且 **IPv4 字面量会被改写**（127.0.0.1 → api.0.0.1）——
 * 本地测试必须用 `localhost` 而不是 `127.0.0.1`。
 */
export async function probePostgres(url: string): Promise<{
  ok: boolean;
  error?: string;
  ms: number;
}> {
  const started = Date.now();
  try {
    const sql = neon(url);
    const rows = await sql`SELECT 1 AS ok`;
    const ok = Number(rows?.[0]?.ok) === 1;
    return {
      ok,
      error: ok ? undefined : `SELECT 1 返回异常：${JSON.stringify(rows)}`,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
    };
  }
}

export function createPostgresStore(url: string): DataStore {
  const sql = neon(url);
  let initPromise: Promise<void> | null = null;

  /**
   * schema 自初始化。
   *
   * 注意三个坑：
   *
   * 1. Next.js 会把 lib/db/* 内联进每个 route bundle —— 每个 bundle 各有一份
   *    模块实例，所以模块级的 initPromise **不跨路由共享**。schema 会被执行多次。
   *    好在全是 CREATE ... IF NOT EXISTS，幂等。
   *
   * 2. Postgres 的 CREATE TABLE IF NOT EXISTS **不是原子的**：两个会话同时建
   *    同一张表时，后者可能报
   *      duplicate key value violates unique constraint "pg_type_typname_nsp_index"
   *    冷部署时多个路由同时收到首个请求 = 真实竞态 = 500。
   *    所以这里对「已存在」类错误做退避重试：重试时对方已建好，IF NOT EXISTS 就过了。
   *
   * 3. **不能把整段 DDL 一次发出去。**（v2.8 部署到真 Neon 后才暴露）
   *    Neon 的 HTTP 驱动走预编译协议，一个 Parse 消息只能带一条命令，
   *    整段 DDL 一次发必然报：
   *      ERROR 42601: cannot insert multiple commands into a prepared statement
   *    本地 pg-harness 走简单协议，放行了多语句，所以本地全绿、线上建表全炸。
   *
   *    所以：先按语句拆开，再用驱动的 sql.transaction([...]) **一次 HTTP 请求**
   *    把整批发出去 —— 驱动会组装成 Neon 的 queries 数组（简单协议），多语句合法。
   *    18 条 DDL = 1 次往返，不是 18 次。
   */
  const ensureInit = async () => {
    if (!initPromise) {
      initPromise = (async () => {
        const statements = splitSqlStatements(SCHEMA_SQL);
        let lastError: unknown;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            await sql.transaction(
              statements.map((statement) => sql.query(statement)),
            );
            return;
          } catch (error) {
            lastError = error;
            const message = String(
              (error as { message?: string })?.message ?? error ?? "",
            );
            const isAlreadyExists =
              /already exists/i.test(message) ||
              /duplicate key value violates unique constraint/i.test(message);
            if (!isAlreadyExists) throw error;
            await new Promise((resolve) =>
              setTimeout(resolve, 120 * (attempt + 1)),
            );
          }
        }
        throw lastError;
      })();
    }
    return initPromise;
  };

  return {
    kind: "postgres",

    async init() {
      await ensureInit();
    },

    /* ---- 用户 ---- */
    async createUser(user) {
      await ensureInit();
      await sql.query(
        `INSERT INTO users (id, handle, email, display_name, bio, avatar_color, agent_note, password_hash, created_at, github_id, github_login, github_avatar_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          user.id,
          user.handle,
          user.email,
          user.displayName,
          user.bio,
          user.avatarColor,
          user.agentNote,
          user.passwordHash,
          user.createdAt,
          user.githubId ?? null,
          user.githubLogin ?? null,
          user.githubAvatarUrl ?? null,
        ],
      );
      return publicUser(user);
    },

    async findUserById(id) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM users WHERE id = $1 LIMIT 1`,
        [id],
      )) as Row[];
      return rows.length ? toUser(rows[0]) : null;
    },

    async findUserByHandle(handle) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM users WHERE lower(handle) = lower($1) LIMIT 1`,
        [handle],
      )) as Row[];
      return rows.length ? toUser(rows[0]) : null;
    },

    async findUserByEmail(email) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`,
        [email],
      )) as Row[];
      return rows.length ? toUser(rows[0]) : null;
    },

    async findUserByGithubId(githubId) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM users WHERE github_id = $1 LIMIT 1`,
        [githubId],
      )) as Row[];
      return rows.length ? toUser(rows[0]) : null;
    },

    async updateUser(id, patch) {
      await ensureInit();
      const current = (await sql.query(
        `SELECT * FROM users WHERE id = $1 LIMIT 1`,
        [id],
      )) as Row[];
      if (!current.length) return null;
      const u = toUser(current[0]);
      const next = { ...u, ...patch };
      await sql.query(
        `UPDATE users SET handle=$2, display_name=$3, bio=$4, avatar_color=$5, agent_note=$6,
           github_id=$7, github_login=$8, github_avatar_url=$9 WHERE id=$1`,
        [
          id,
          next.handle,
          next.displayName,
          next.bio,
          next.avatarColor,
          next.agentNote,
          next.githubId ?? null,
          next.githubLogin ?? null,
          next.githubAvatarUrl ?? null,
        ],
      );
      return publicUser(next);
    },

    async listUsers(limit = 100) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM users ORDER BY created_at DESC LIMIT $1`,
        [limit],
      )) as Row[];
      return rows.map((r) => publicUser(toUser(r)));
    },

    /* ---- 会话 ---- */
    async createSession(session) {
      await ensureInit();
      await sql.query(
        `INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4)`,
        [session.id, session.userId, session.createdAt, session.expiresAt],
      );
    },

    async findSession(id) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM sessions WHERE id = $1 LIMIT 1`,
        [id],
      )) as Row[];
      return rows.length ? toSession(rows[0]) : null;
    },

    async deleteSession(id) {
      await ensureInit();
      await sql.query(`DELETE FROM sessions WHERE id = $1`, [id]);
    },

    async deleteExpiredSessions() {
      await ensureInit();
      await sql.query(`DELETE FROM sessions WHERE expires_at < $1`, [
        new Date().toISOString(),
      ]);
    },

    /* ---- Agent key ---- */
    async listAgentKeys() {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM agent_keys ORDER BY created_at DESC`,
      )) as Row[];
      return rows.map(toKey);
    },

    async insertAgentKey(key) {
      await ensureInit();
      await sql.query(
        `INSERT INTO agent_keys (key, label, user_id, created_at, revoked) VALUES ($1,$2,$3,$4,$5)`,
        [key.key, key.label, key.userId, key.createdAt, key.revoked],
      );
    },

    async revokeAgentKey(key) {
      await ensureInit();
      const rows = (await sql.query(
        `UPDATE agent_keys SET revoked = TRUE WHERE key = $1 RETURNING key`,
        [key],
      )) as Row[];
      return rows.length > 0;
    },

    /* ---- Agent 活动 ---- */
    async insertAgentActivity(row) {
      await ensureInit();
      await sql.query(
        `INSERT INTO agent_activity
         (id, user_id, key_label, action, method, path, order_id, status_code, ok, detail, duration_ms, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          row.id,
          row.userId,
          row.keyLabel,
          row.action,
          row.method,
          row.path,
          row.orderId,
          row.statusCode,
          row.ok,
          row.detail,
          row.durationMs,
          row.createdAt,
        ],
      );
    },

    async listAgentActivityByUser(userId, limit = 100) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM agent_activity WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [userId, limit],
      )) as Row[];
      return rows.map(toActivity);
    },

    /* ---- 订单 ---- */
    async insertOrder(o) {
      await ensureInit();
      await sql.query(
        `INSERT INTO orders
         (id, user_id, sender_handle, receiver_handle, receiver_name, gift_token, status,
          product_id, quantity, delivery_date, quote_json, plan_json, design_json, letter_json,
          payment_json, shipment_json, error_json, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          o.id,
          o.userId,
          o.senderHandle,
          o.receiverHandle,
          o.receiverName,
          o.giftToken,
          o.status,
          o.productId,
          o.quantity,
          o.deliveryDate,
          JSON.stringify(o.quote),
          JSON.stringify(o.plan),
          JSON.stringify(o.design),
          JSON.stringify(o.letter),
          o.payment ? JSON.stringify(o.payment) : null,
          o.shipment ? JSON.stringify(o.shipment) : null,
          o.error ? JSON.stringify(o.error) : null,
          o.createdAt,
          o.updatedAt,
        ],
      );
    },

    async updateOrder(id, patch) {
      await ensureInit();
      const current = (await sql.query(
        `SELECT * FROM orders WHERE id = $1 LIMIT 1`,
        [id],
      )) as Row[];
      if (!current.length) return null;
      const next = { ...toOrder(current[0]), ...patch };
      await sql.query(
        `UPDATE orders SET status=$2, payment_json=$3, shipment_json=$4, error_json=$5,
           receiver_handle=$6, receiver_name=$7, updated_at=$8 WHERE id=$1`,
        [
          id,
          next.status,
          next.payment ? JSON.stringify(next.payment) : null,
          next.shipment ? JSON.stringify(next.shipment) : null,
          next.error ? JSON.stringify(next.error) : null,
          next.receiverHandle,
          next.receiverName,
          next.updatedAt,
        ],
      );
      return next;
    },

    async findOrderById(id) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM orders WHERE id = $1 LIMIT 1`,
        [id],
      )) as Row[];
      return rows.length ? toOrder(rows[0]) : null;
    },

    async findOrderByGiftToken(token) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM orders WHERE gift_token = $1 LIMIT 1`,
        [token],
      )) as Row[];
      return rows.length ? toOrder(rows[0]) : null;
    },

    async listOrdersByUser(userId, limit = 50) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [userId, limit],
      )) as Row[];
      return rows.map(toOrder);
    },

    async listOrdersByReceiverHandle(handle, limit = 50) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM orders WHERE LOWER(TRIM(receiver_handle)) = LOWER(TRIM($1)) ORDER BY created_at DESC LIMIT $2`,
        [handle, limit],
      )) as Row[];
      return rows.map(toOrder);
    },

    async listOrders(limit = 50) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM orders ORDER BY created_at DESC LIMIT $1`,
        [limit],
      )) as Row[];
      return rows.map(toOrder);
    },

    /* ---- 模板 ---- */
    async listTemplates() {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM templates ORDER BY kind, created_at`,
      )) as Row[];
      return rows.map(toTemplate);
    },

    async findTemplate(id) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM templates WHERE id = $1 LIMIT 1`,
        [id],
      )) as Row[];
      return rows.length ? toTemplate(rows[0]) : null;
    },

    /* ---- 上传素材 ---- */
    async insertUpload(upload) {
      await ensureInit();
      await sql.query(
        `INSERT INTO uploads (id, name, mime, data, size, user_id, created_at, blob_path, blob_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          upload.id,
          upload.name,
          upload.mime,
          upload.data,
          upload.size,
          upload.userId,
          upload.createdAt,
          upload.blobPath || null,
          upload.blobUrl || null,
        ],
      );
    },

    async findUpload(id) {
      await ensureInit();
      const rows = (await sql.query(
        `SELECT * FROM uploads WHERE id = $1 LIMIT 1`,
        [id],
      )) as Row[];
      if (!rows.length) return null;
      const r = rows[0];
      return {
        id: String(r.id),
        name: String(r.name ?? ""),
        mime: String(r.mime ?? "application/octet-stream"),
        data: String(r.data ?? ""),
        size: Number(r.size ?? 0),
        userId: r.user_id == null ? null : String(r.user_id),
        createdAt: String(r.created_at ?? ""),
        blobPath: String(r.blob_path ?? ""),
        blobUrl: String(r.blob_url ?? ""),
      };
    },
  };
}
