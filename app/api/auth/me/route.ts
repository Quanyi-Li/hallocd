/**
 * /api/auth/me · GET + PATCH
 * ------------------------------------------------------------------
 * 当前登录用户的资料：
 *   GET    —— 读自己（未登录返回 401）
 *   PATCH  —— 改自己的昵称 / 简介 / agent 介绍 / 头像色
 */

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedGET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "NOT_AUTHENTICATED", message: "未登录。" },
      { status: 401 },
    );
  }
  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      handle: user.handle,
      email: user.email,
      displayName: user.displayName,
      bio: user.bio,
      avatarColor: user.avatarColor,
      agentNote: user.agentNote,
      githubLogin: user.githubLogin ?? null,
      githubAvatarUrl: user.githubAvatarUrl ?? null,
      createdAt: user.createdAt,
    },
    profileUrl: `/u/${user.handle}`,
  });
}

/** 编辑自己的资料 */
async function __guardedPATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "NOT_AUTHENTICATED", message: "未登录。" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "INVALID_JSON", message: "请求体不是合法 JSON。" },
      { status: 400 },
    );
  }

  const patch: {
    displayName?: string;
    bio?: string;
    agentNote?: string;
    avatarColor?: string;
  } = {};

  if (body.displayName != null) {
    patch.displayName =
      String(body.displayName).trim().slice(0, 40) || user.displayName;
  }
  if (body.bio != null) {
    patch.bio = String(body.bio).slice(0, 500);
  }
  if (body.agentNote != null) {
    patch.agentNote = String(body.agentNote).slice(0, 300);
  }
  if (body.avatarColor != null) {
    const c = String(body.avatarColor).trim();
    if (/^#[0-9a-fA-F]{6}$/.test(c)) patch.avatarColor = c.toUpperCase();
  }

  const updated = await db.updateUser(user.id, patch);
  if (!updated) {
    return NextResponse.json(
      { success: false, error: "UPDATE_FAILED", message: "保存失败。" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    user: {
      id: updated.id,
      handle: updated.handle,
      email: updated.email,
      displayName: updated.displayName,
      bio: updated.bio,
      avatarColor: updated.avatarColor,
      agentNote: updated.agentNote,
      createdAt: updated.createdAt,
    },
  });
}

export const GET = withStorageGuard(__guardedGET);
export const PATCH = withStorageGuard(__guardedPATCH);
