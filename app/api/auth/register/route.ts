/**
 * /api/auth/register · POST
 * ------------------------------------------------------------------
 * 邮箱 + 密码 + 用户名 → 创建账号 → 自动登录。
 *
 * 用户名（handle）是这个账号在平台上的地址：
 *   个人主页  /u/<handle>
 *   agent 收礼 /r/<token> 会跳回这里
 */

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  SESSION_COOKIE,
  checkHandle,
  createSession,
  normalizeHandle,
  serializeSessionCookie,
} from "@/lib/auth/session";
import { checkPasswordStrength, hashPassword } from "@/lib/auth/password";
import { pickAvatarColor } from "@/lib/auth/profile";
import { db } from "@/lib/db";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedPOST(request: Request) {
  let body: {
    email?: unknown;
    password?: unknown;
    handle?: unknown;
    displayName?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "INVALID_JSON", message: "请求体不是合法 JSON。" },
      { status: 400 },
    );
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { success: false, error: "INVALID_EMAIL", message: "请填一个有效的邮箱地址。" },
      { status: 400 },
    );
  }

  const password = String(body.password ?? "");
  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    return NextResponse.json(
      { success: false, error: "WEAK_PASSWORD", message: strength.message },
      { status: 400 },
    );
  }

  const handleResult = checkHandle(body.handle ?? email.split("@")[0]);
  if (!handleResult.ok) {
    return NextResponse.json(
      { success: false, error: "INVALID_HANDLE", message: handleResult.message },
      { status: 400 },
    );
  }
  const handle = handleResult.handle;

  const existingEmail = await db.findUserByEmail(email);
  if (existingEmail) {
    return NextResponse.json(
      { success: false, error: "EMAIL_TAKEN", message: "这个邮箱已经注册过了。" },
      { status: 409 },
    );
  }
  const existingHandle = await db.findUserByHandle(handle);
  if (existingHandle) {
    return NextResponse.json(
      { success: false, error: "HANDLE_TAKEN", message: "这个用户名被占用了。" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const user = await db.createUser({
    id: randomUUID(),
    handle: normalizeHandle(handle),
    email,
    displayName:
      String(body.displayName ?? "").trim().slice(0, 40) || handle,
    bio: "",
    avatarColor: pickAvatarColor(),
    agentNote: "",
    passwordHash,
    /* 邮箱密码注册的账号默认没绑 GitHub（用户可以之后用同一个 GitHub 登进来自动对上号） */
    githubId: null,
    githubLogin: null,
    githubAvatarUrl: null,
    createdAt: new Date().toISOString(),
  });

  const session = await createSession(user.id);

  const res = NextResponse.json({
    success: true,
    user: {
      id: user.id,
      handle: user.handle,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      avatarColor: user.avatarColor,
      agentNote: user.agentNote,
      createdAt: user.createdAt,
    },
    profileUrl: `/u/${user.handle}`,
  });
  res.headers.append("Set-Cookie", serializeSessionCookie(session.id, session.expiresAt));
  return res;
}

export const POST = withStorageGuard(__guardedPOST);
