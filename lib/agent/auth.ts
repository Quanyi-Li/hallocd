/**
 * halloCD Agent API · 鉴权
 * ==================================================================
 * 平台要被「任何人自己的 coding agent」接入，身份是第一道门槛。
 *
 * v1 策略（接口形状是终态的，换 OAuth 只需改本文件）：
 *   · 站点主 key 从环境变量 HALLO_AGENT_API_KEY 读（部署方自己配）
 *   · 用户自己的 key 存在数据库 agent_keys 表，**带 user_id**
 *     —— 这就是「agent 绑定在用户名下」的落点：agent 用这把 key 下的单，
 *        订单会归到那个用户名下，出现在 TA 的个人主页上
 *   · 传输统一 Authorization: Bearer <key>
 *
 * 刻意不做的事：
 *   · 不把 key 混进 package.json / 前端 bundle / 技能包
 *   · 不接受 query string 传 key（会进日志、进 referer）
 */

import { randomBytes } from "node:crypto";

import { db, type DbAgentKey } from "@/lib/db";

export type AgentIdentity = {
  key: string;
  label: string;
  origin: "env" | "db";
  /** 绑定的用户 —— 有值说明这把 key 是某个用户名下的 agent */
  userId: string | null;
  handle: string | null;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/*  读取                                                                */
/* ------------------------------------------------------------------ */

function envIdentity(): AgentIdentity | null {
  const key = (process.env.HALLO_AGENT_API_KEY || "").trim();
  if (!key) return null;
  return {
    key,
    label: (process.env.HALLO_AGENT_API_KEY_LABEL || "site").trim(),
    origin: "env",
    userId: null,
    handle: null,
    createdAt: "",
  };
}

/** 全部有效 key（站点主 key + 数据库里的用户 key） */
export async function listAgentKeys(): Promise<AgentIdentity[]> {
  const out: AgentIdentity[] = [];
  const env = envIdentity();
  if (env) out.push(env);

  const rows = await db.listAgentKeys();
  for (const row of rows) {
    if (row.revoked) continue;
    out.push({
      key: row.key,
      label: row.label,
      origin: "db",
      userId: row.userId,
      handle: await resolveHandle(row.userId),
      createdAt: row.createdAt,
    });
  }
  return out;
}

async function resolveHandle(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const user = await db.findUserById(userId);
  return user?.handle ?? null;
}

export type AuthResult =
  | { ok: true; identity: AgentIdentity }
  | { ok: false; status: number; error: string; message: string };

/**
 * 校验 Authorization 头。
 * 恒定时间比较，避免逐字节比较带来的时序泄漏。
 */
export async function verifyAgentKey(
  authorization: string | null,
): Promise<AuthResult> {
  const raw = (authorization || "").trim();
  if (!raw) {
    return {
      ok: false,
      status: 401,
      error: "MISSING_AUTHORIZATION",
      message:
        "缺少 Authorization 头。请使用 Authorization: Bearer <API_KEY>，" +
        "API_KEY 由 halloCD 平台方发放，或在个人主页绑定你的 agent。",
    };
  }

  const match = /^Bearer\s+(.+)$/i.exec(raw);
  if (!match) {
    return {
      ok: false,
      status: 401,
      error: "INVALID_AUTHORIZATION",
      message: "Authorization 头格式应为：Authorization: Bearer <API_KEY>",
    };
  }

  const presented = match[1].trim();
  if (!presented) {
    return {
      ok: false,
      status: 401,
      error: "INVALID_AUTHORIZATION",
      message: "API key 为空。",
    };
  }

  const keys = await listAgentKeys();
  if (keys.length === 0) {
    return {
      ok: false,
      status: 503,
      error: "AGENT_API_NOT_CONFIGURED",
      message:
        "服务端尚未配置任何 Agent API key。请在 .env.local 设置 HALLO_AGENT_API_KEY，" +
        "或让用户登录后在个人主页签发一枚。",
    };
  }

  for (const identity of keys) {
    if (timingSafeEqual(presented, identity.key)) {
      return { ok: true, identity };
    }
  }

  return {
    ok: false,
    status: 401,
    error: "INVALID_API_KEY",
    message: "API key 无效或已被吊销。",
  };
}

/** 定长比较：先比长度再比每个字节，避免早期返回带来的时序差异 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/*  签发 / 吊销                                                         */
/* ------------------------------------------------------------------ */

function randomKey(): string {
  return "hcd_" + randomBytes(16).toString("hex");
}

/**
 * 签发一枚新 key。
 * 传 userId 就把这把 key 绑定到那个用户名下 —— agent 用它下的单会出现在 TA 主页。
 */
export async function issueAgentKey(
  label: string,
  userId: string | null = null,
): Promise<DbAgentKey> {
  const record: DbAgentKey = {
    key: randomKey(),
    label: (label || "agent").trim().slice(0, 60) || "agent",
    userId,
    createdAt: new Date().toISOString(),
    revoked: false,
  };
  await db.insertAgentKey(record);
  return record;
}

export async function revokeAgentKey(key: string): Promise<boolean> {
  return db.revokeAgentKey(key);
}

/* ------------------------------------------------------------------ */
/*  管理员                                                              */
/* ------------------------------------------------------------------ */

export async function verifyAdminKey(
  authorization: string | null,
): Promise<AuthResult> {
  const admin = (process.env.HALLO_AGENT_ADMIN_KEY || "").trim();
  if (!admin) {
    return {
      ok: false,
      status: 503,
      error: "ADMIN_KEY_NOT_CONFIGURED",
      message:
        "服务端未设置 HALLO_AGENT_ADMIN_KEY，无法自助签发 API key。" +
        "请直接由部署方在 .env.local 配置 HALLO_AGENT_API_KEY。",
    };
  }
  const raw = (authorization || "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  if (!match || !timingSafeEqual(match[1].trim(), admin)) {
    return {
      ok: false,
      status: 401,
      error: "INVALID_ADMIN_KEY",
      message: "管理员密钥无效。",
    };
  }
  return {
    ok: true,
    identity: {
      key: admin,
      label: "admin",
      origin: "env",
      userId: null,
      handle: null,
      createdAt: "",
    },
  };
}
