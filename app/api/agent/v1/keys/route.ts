/**
 * /api/agent/v1/keys
 * ------------------------------------------------------------------
 * POST —— 签发一枚 Agent API key
 * DELETE —— 吊销一枚 key
 *
 * 两种签发身份：
 *   1. **登录用户**（带 session cookie）—— 签发的 key 自动绑定到 TA 名下，
 *      这就是「agent 绑定在用户名下」：agent 用这把 key 下的单会出现在 TA 的主页。
 *   2. **管理员**（HALLO_AGENT_ADMIN_KEY）—— 可以给任意用户名签发。
 *
 * 普通 agent key 无权签发新 key —— 否则一把 key 泄漏等于平台沦陷。
 */

import { connection, NextResponse } from "next/server";

import { apiError } from "@/lib/agent/apiGuard";
import {
  issueAgentKey,
  listAgentKeys,
  revokeAgentKey,
  verifyAdminKey,
} from "@/lib/agent/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedPOST(request: Request) {
  await connection();

  let body: { label?: unknown; handle?: unknown } = {};
  try {
    body = (await request.json()) as { label?: unknown; handle?: unknown };
  } catch {
    body = {};
  }

  const label = typeof body.label === "string" ? body.label : "agent";

  /* 路径 1：登录用户自助签发 —— key 绑定到自己名下 */
  const currentUser = await getCurrentUser();
  if (currentUser) {
    const record = await issueAgentKey(
      label || `${currentUser.handle} 的 agent`,
      currentUser.id,
    );
    return NextResponse.json(
      {
        success: true,
        key: record.key,
        label: record.label,
        boundTo: {
          handle: currentUser.handle,
          profileUrl: `/u/${currentUser.handle}`,
        },
        createdAt: record.createdAt,
        usage: {
          header: `Authorization: Bearer ${record.key}`,
          baseUrl: new URL(request.url).origin,
        },
        note:
          "请立刻保存 —— 这枚 key 只在本次响应里出现一次。" +
          "之后所有 /api/agent/v1/* 请求都要带上它。" +
          "用这把 key 下的订单会归到你的用户名下。",
      },
      { status: 201 },
    );
  }

  /* 路径 2：管理员签发 */
  const admin = await verifyAdminKey(request.headers.get("authorization"));
  if (!admin.ok) {
    return apiError(
      admin.status,
      admin.error,
      admin.message + "（或者先登录，再从你的个人主页绑定 agent。）",
    );
  }

  let userId: string | null = null;
  let boundHandle: string | null = null;
  const handle = typeof body.handle === "string" ? body.handle.trim() : "";
  if (handle) {
    const user = await db.findUserByHandle(handle);
    if (!user) {
      return apiError(404, "USER_NOT_FOUND", `用户名 ${handle} 不存在。`);
    }
    userId = user.id;
    boundHandle = user.handle;
  }

  const record = await issueAgentKey(label, userId);

  return NextResponse.json(
    {
      success: true,
      key: record.key,
      label: record.label,
      boundTo: boundHandle
        ? { handle: boundHandle, profileUrl: `/u/${boundHandle}` }
        : null,
      createdAt: record.createdAt,
      usage: {
        header: `Authorization: Bearer ${record.key}`,
        baseUrl: new URL(request.url).origin,
      },
      note:
        "请立刻保存 —— 这枚 key 只在本次响应里出现一次。" +
        "之后所有 /api/agent/v1/* 请求都要带上它。",
    },
    { status: 201 },
  );
}

/** 列出 key —— 登录用户看自己的，管理员看全部 */
async function __guardedGET(request: Request) {
  await connection();

  const currentUser = await getCurrentUser();
  const admin = await verifyAdminKey(request.headers.get("authorization"));
  const isAdmin = admin.ok;

  if (!currentUser && !isAdmin) {
    return apiError(401, "NOT_AUTHENTICATED", "请先登录，或用管理员密钥调用。");
  }

  const rows = await listAgentKeys();
  const visible = isAdmin
    ? rows
    : rows.filter((k) => k.userId === currentUser?.id);

  return NextResponse.json({
    success: true,
    count: visible.length,
    keys: visible.map((k) => ({
      label: k.label,
      origin: k.origin,
      handle: k.handle,
      createdAt: k.createdAt,
      /** 只显示前缀 —— 不把完整 key 吐回给前端 */
      masked: `${k.key.slice(0, 12)}…`,
    })),
  });
}

async function __guardedDELETE(request: Request) {
  await connection();

  let body: { key?: unknown } = {};
  try {
    body = (await request.json()) as { key?: unknown };
  } catch {
    body = {};
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) {
    return apiError(400, "MISSING_KEY", "请在请求体里提供要吊销的 key。");
  }

  /* 登录用户只能吊销自己的 key */
  const currentUser = await getCurrentUser();
  const admin = await verifyAdminKey(request.headers.get("authorization"));
  if (!admin.ok && !currentUser) {
    return apiError(401, "NOT_AUTHENTICATED", "请先登录，或用管理员密钥调用。");
  }

  const rows = await listAgentKeys();

  /**
   * 找到要吊销的那把 key。
   *
   * 为什么要同时接受「完整 key」和「掩码前缀」：
   *   完整 key 只在签发的那一次响应里出现一次。之后前端拿到的只有
   *   `hcd_xxxxxxxx…` 这样的掩码 —— 页面上的「吊销」按钮能拿到的
   *   就是这 12 个字符。早期版本要求精确匹配完整 key，
   *   于是**网页上的吊销按钮从来没生效过**（永远 403）。
   *
   * 前缀匹配的安全边界：
   *   · 普通用户只在**自己名下**的 key 里找前缀
   *   · 管理员可以跨用户找
   *   · 12 个字符里有 8 位十六进制（32 bit 熵），同一个人名下撞车可以忽略
   */
  let target = rows.find((k) => k.key === key);
  if (!target) {
    const scope = admin.ok ? rows : rows.filter((k) => k.userId === currentUser?.id);
    target = scope.find((k) => k.key.startsWith(key));
  }

  if (!target) {
    return apiError(
      403,
      "FORBIDDEN",
      admin.ok
        ? "找不到这把 key。"
        : "你只能吊销自己名下的 key。",
    );
  }

  const ok = await revokeAgentKey(target.key);
  if (!ok) {
    return apiError(
      404,
      "KEY_NOT_FOUND",
      "找不到这把 key（可能来自环境变量，无法在此吊销）。",
    );
  }

  return NextResponse.json({ success: true, revoked: true });
}

export const POST = withStorageGuard(__guardedPOST);
export const GET = withStorageGuard(__guardedGET);
export const DELETE = withStorageGuard(__guardedDELETE);
