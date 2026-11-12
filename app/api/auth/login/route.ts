/**
 * /api/auth/login · POST
 * ------------------------------------------------------------------
 * 邮箱 + 密码 → session cookie。
 *
 * 失败时**不区分**「邮箱不存在」和「密码不对」—— 避免被用来枚举账号。
 */

import { NextResponse } from "next/server";

import {
  createSession,
  serializeSessionCookie,
} from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedPOST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "INVALID_JSON", message: "请求体不是合法 JSON。" },
      { status: 400 },
    );
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const invalid = NextResponse.json(
    {
      success: false,
      error: "INVALID_CREDENTIALS",
      message: "邮箱或密码不对。",
    },
    { status: 401 },
  );

  if (!email || !password) return invalid;

  const user = await db.findUserByEmail(email);
  if (!user) {
    // 即便用户不存在也走一次校验，抹平时间差
    await verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    return invalid;
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return invalid;

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
