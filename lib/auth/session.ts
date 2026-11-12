/**
 * halloCD · 会话与当前用户
 * ==================================================================
 * Session = 随机 token 存库 + httpOnly cookie。
 * 不引入 auth 框架：整个后端只有「注册 / 登录 / 当前用户 / 登出」四件事，
 * 手写比接框架更可控，也少一堆依赖。
 *
 * Cookie 策略：
 *   · httpOnly —— JS 读不到，XSS 偷不走
 *   · sameSite=lax —— 防 CSRF（跨站 POST 不带 cookie）
 *   · secure —— 生产环境强制 HTTPS
 *   · path=/ —— 全站可用
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { db, type DbUser } from "@/lib/db";

export const SESSION_COOKIE = "hallocd_session";
export const SESSION_TTL_DAYS = 30;

/** 保留字 —— 不能被注册成 handle */
export const RESERVED_HANDLES = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "blog",
  "cdn",
  "dashboard",
  "docs",
  "help",
  "hallo",
  "hallocd",
  "login",
  "logout",
  "make",
  "new",
  "r",
  "room",
  "settings",
  "signin",
  "signup",
  "static",
  "support",
  "templates",
  "u",
  "www",
]);

export function normalizeHandle(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export function checkHandle(raw: unknown): { ok: boolean; handle: string; message?: string } {
  const handle = normalizeHandle(raw);
  if (!handle) {
    return { ok: false, handle, message: "用户名不能为空。" };
  }
  if (handle.length < 3) {
    return { ok: false, handle, message: "用户名至少 3 个字符。" };
  }
  if (RESERVED_HANDLES.has(handle)) {
    return { ok: false, handle, message: "这个用户名被保留了，换一个。" };
  }
  return { ok: true, handle };
}

/* ------------------------------------------------------------------ */
/*  会话                                                                */
/* ------------------------------------------------------------------ */

export type CreatedSession = { id: string; expiresAt: string };

export async function createSession(userId: string): Promise<CreatedSession> {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000,
  ).toISOString();

  await db.createSession({
    id,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt,
  });

  return { id, expiresAt };
}

export async function destroySession(id: string): Promise<void> {
  await db.deleteSession(id);
}

export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** 取当前登录用户；未登录或过期返回 null */
export async function getCurrentUser(): Promise<DbUser | null> {
  const id = await readSessionId();
  if (!id) return null;

  const session = await db.findSession(id);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await db.deleteSession(id);
    return null;
  }

  const user = await db.findUserById(session.userId);
  if (!user) return null;

  const { passwordHash: _ignored, ...pub } = user;
  return pub;
}

/* ------------------------------------------------------------------ */
/*  Cookie 序列化                                                       */
/* ------------------------------------------------------------------ */

export function serializeSessionCookie(id: string, expiresAt: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return [
    `${SESSION_COOKIE}=${id}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
    `${secure}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function serializeClearedCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    `${secure}`,
  ]
    .filter(Boolean)
    .join("; ");
}
