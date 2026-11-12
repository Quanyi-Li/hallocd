/**
 * halloCD · 文件存储实现（本地回退）
 * ==================================================================
 * 没有 DATABASE_URL 时自动接管，让项目在没有任何外部依赖的情况下也能跑通
 * 完整业务流（注册 → 下单 → 支付 → 主页 → 回礼）。
 *
 * 明确的能力边界：
 *   · 落盘是同步的、单进程的 —— 只适合本地开发与离线演示
 *   · 上生产必须换成 lib/db/postgres.ts（只改 lib/db/index.ts 一行选择逻辑）
 *   · data/ 已 gitignore、不入包
 */

import fs from "node:fs";
import path from "node:path";

import type {
  DataStore,
  DbAgentActivity,
  DbAgentKey,
  DbOrder,
  DbSession,
  DbTemplate,
  DbUpload,
  DbUser,
  DbUserWithSecret,
} from "@/lib/db/types";

function dbDir(): string {
  const base =
    process.env.HALLO_AGENT_DATA_DIR || path.join(process.cwd(), "data");
  return path.join(base, "db");
}

/**
 * 探测本地数据目录是否可写。
 *
 * 用途：部署就绪自检。
 * Vercel 这类平台的容器文件系统是只读的（只有 /tmp 可写），
 * 没配 DATABASE_URL 时文件后端根本落不了盘 ——
 * 与其等到用户注册时才发现注册失败，不如在存储层就直接说清楚。
 */
export async function probeWritable(): Promise<{
  ok: boolean;
  dir: string;
  error?: string;
}> {
  const dir = dbDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".write-probe");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return { ok: true, dir };
  } catch (err) {
    return {
      ok: false,
      dir,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function filePath(name: string): string {
  return path.join(dbDir(), `${name}.json`);
}

/**
 * 错误信息里要带上「怎么办」，不能只抛一个 errno。
 *
 * 背景：Vercel 这类平台的容器文件系统是**只读**的（只有 /tmp 可写），
 * 而本文件默认往 `process.cwd()/data` 写。
 * 如果这里把 EROFS 吞掉当成「空集合」，线上会表现为
 * 「订单查不到 / 注册成功但登不进去」—— 静默错比报错难查得多。
 */
function explain(err: unknown, action: string, target: string): Error {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code ?? "")
      : "";
  const detail = err instanceof Error ? err.message : String(err);
  const hint =
    code === "EROFS" || code === "EACCES" || code === "ENOSPC"
      ? "当前文件系统不可写 —— 若部署在 Vercel 等只读文件系统上，必须配置 DATABASE_URL" +
        "（Neon 兼容的 HTTP /sql 端点：Neon / Vercel Postgres 可用；Supabase / RDS 不可用）。"
      : code === "EJSONPARSE"
        ? "本地数据文件已损坏 —— 删掉该文件可重新初始化，或直接切到 Postgres 后端。"
        : "本地开发请确认 data/ 目录可写。";
  return new Error(`${action}失败（${target}）：${detail}。${hint}`, { cause: err });
}

function isNotFound(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "code" in err &&
    String((err as { code?: unknown }).code) === "ENOENT"
  );
}

function readCollection<T>(name: string): T[] {
  const target = filePath(name);
  let raw: string;
  try {
    raw = fs.readFileSync(target, "utf8");
  } catch (err) {
    /* 集合还不存在 = 第一次跑，这是正常路径 */
    if (isNotFound(err)) return [];
    throw explain(err, "读取本地数据", target);
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (err) {
    throw explain(err, "解析本地数据", target);
  }
}

function writeCollection<T>(name: string, rows: T[]): void {
  const target = filePath(name);
  try {
    fs.mkdirSync(dbDir(), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(rows, null, 2), "utf8");
  } catch (err) {
    throw explain(err, "写入本地数据", target);
  }
}

function publicUser(u: DbUserWithSecret): DbUser {
  const { passwordHash: _ignored, ...rest } = u;
  return {
    ...rest,
    /* 旧记录没有 GitHub 字段 —— 统一补成 null，
       这样调用方不用到处写 ?? "" */
    githubId: rest.githubId ?? null,
    githubLogin: rest.githubLogin ?? null,
    githubAvatarUrl: rest.githubAvatarUrl ?? null,
  };
}

export function createFileStore(): DataStore {
  return {
    kind: "file",

    async init() {
      fs.mkdirSync(dbDir(), { recursive: true });
    },

    /* ---- 用户 ---- */
    async createUser(user) {
      const rows = readCollection<DbUserWithSecret>("users");
      rows.push(user);
      writeCollection("users", rows);
      return publicUser(user);
    },

    async findUserById(id) {
      return (
        readCollection<DbUserWithSecret>("users").find((u) => u.id === id) ??
        null
      );
    },

    async findUserByHandle(handle) {
      const target = handle.trim().toLowerCase();
      return (
        readCollection<DbUserWithSecret>("users").find(
          (u) => u.handle.toLowerCase() === target,
        ) ?? null
      );
    },

    async findUserByEmail(email) {
      const target = email.trim().toLowerCase();
      return (
        readCollection<DbUserWithSecret>("users").find(
          (u) => u.email.toLowerCase() === target,
        ) ?? null
      );
    },

    async findUserByGithubId(githubId) {
      const target = githubId.trim();
      if (!target) return null;
      return (
        readCollection<DbUserWithSecret>("users").find(
          (u) => (u.githubId ?? "").trim() === target,
        ) ?? null
      );
    },

    async updateUser(id, patch) {
      const rows = readCollection<DbUserWithSecret>("users");
      const idx = rows.findIndex((u) => u.id === id);
      if (idx < 0) return null;
      rows[idx] = { ...rows[idx], ...patch };
      writeCollection("users", rows);
      return publicUser(rows[idx]);
    },

    async listUsers(limit = 100) {
      return readCollection<DbUserWithSecret>("users")
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit)
        .map(publicUser);
    },

    /* ---- 会话 ---- */
    async createSession(session) {
      const rows = readCollection<DbSession>("sessions");
      rows.push(session);
      writeCollection("sessions", rows);
    },

    async findSession(id) {
      return (
        readCollection<DbSession>("sessions").find((s) => s.id === id) ?? null
      );
    },

    async deleteSession(id) {
      writeCollection(
        "sessions",
        readCollection<DbSession>("sessions").filter((s) => s.id !== id),
      );
    },

    async deleteExpiredSessions() {
      const now = new Date().toISOString();
      writeCollection(
        "sessions",
        readCollection<DbSession>("sessions").filter(
          (s) => s.expiresAt > now,
        ),
      );
    },

    /* ---- Agent key ---- */
    async listAgentKeys() {
      return readCollection<DbAgentKey>("agent-keys");
    },

    async insertAgentKey(key) {
      const rows = readCollection<DbAgentKey>("agent-keys");
      rows.push(key);
      writeCollection("agent-keys", rows);
    },

    async revokeAgentKey(key) {
      const rows = readCollection<DbAgentKey>("agent-keys");
      const hit = rows.find((r) => r.key === key);
      if (!hit) return false;
      hit.revoked = true;
      writeCollection("agent-keys", rows);
      return true;
    },

    /* ---- Agent 活动 ---- */
    async insertAgentActivity(row) {
      const rows = readCollection<DbAgentActivity>("agent-activity");
      rows.push(row);
      /* 只留最近 500 条 —— 活动流水的价值在「最近」，而不是无限存档。
         文件后端没有 DELETE，所以在这里就地截断。 */
      const trimmed = rows.slice(-500);
      writeCollection("agent-activity", trimmed);
    },

    async listAgentActivityByUser(userId, limit = 100) {
      const rows = readCollection<DbAgentActivity>("agent-activity");
      return rows
        .filter((r) => r.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit);
    },

    /* ---- 订单 ---- */
    async insertOrder(order) {
      const rows = readCollection<DbOrder>("orders");
      rows.push(order);
      writeCollection("orders", rows);
    },

    async updateOrder(id, patch) {
      const rows = readCollection<DbOrder>("orders");
      const idx = rows.findIndex((o) => o.id === id);
      if (idx < 0) return null;
      rows[idx] = { ...rows[idx], ...patch };
      writeCollection("orders", rows);
      return rows[idx];
    },

    async findOrderById(id) {
      return (
        readCollection<DbOrder>("orders").find((o) => o.id === id) ?? null
      );
    },

    async findOrderByGiftToken(token) {
      return (
        readCollection<DbOrder>("orders").find((o) => o.giftToken === token) ??
        null
      );
    },

    async listOrdersByUser(userId, limit = 50) {
      return readCollection<DbOrder>("orders")
        .filter((o) => o.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit);
    },

    async listOrdersByReceiverHandle(handle, limit = 50) {
      const target = handle.trim().toLowerCase();
      return readCollection<DbOrder>("orders")
        .filter(
          (o) =>
            typeof o.receiverHandle === "string" &&
            o.receiverHandle.trim().toLowerCase() === target,
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit);
    },

    async listOrders(limit = 50) {
      return readCollection<DbOrder>("orders")
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit);
    },

    /* ---- 模板 ---- */
    async listTemplates() {
      return readCollection<DbTemplate>("templates");
    },

    async findTemplate(id) {
      return (
        readCollection<DbTemplate>("templates").find((t) => t.id === id) ?? null
      );
    },

    /* ---- 上传素材 ---- */
    async insertUpload(upload) {
      const rows = readCollection<DbUpload>("uploads");
      /* 旧记录没有 blobPath / blobUrl —— 统一补成空串，
         这样调用方不用到处写 ?? "" */
      rows.push({
        ...upload,
        blobPath: upload.blobPath ?? "",
        blobUrl: upload.blobUrl ?? "",
      });
      writeCollection("uploads", rows);
    },

    async findUpload(id) {
      const found =
        readCollection<DbUpload>("uploads").find((u) => u.id === id) ?? null;
      if (!found) return null;
      return {
        ...found,
        blobPath: found.blobPath ?? "",
        blobUrl: found.blobUrl ?? "",
      };
    },
  };
}
