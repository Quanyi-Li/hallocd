/**
 * GET /api/agent/v1/activity
 * ------------------------------------------------------------------
 * 「我的 agent 都在干什么？」—— 接入台的活动流水。
 *
 * 两种身份都能查：
 *   1. **登录用户**（session cookie）→ 看自己名下所有 agent 的活动
 *   2. **agent 自己**（Bearer key）    → 看自己这把 key 名下的活动
 *
 * 为什么要有这个端点：
 *   agent 跑在用户自己的机器上，网页这边看不见它的进程、看不见它的定时任务。
 *   唯一能看见的痕迹就是它**调用了平台接口**。把这些调用记下来、摊开给人看，
 *   用户才能确认「我的 agent 真的在帮我寄 CD，而不是在乱花钱」。
 *
 * 隐私边界：
 *   · 只返回**调用者自己**名下的记录（按 user_id 过滤）
 *   · 流水里没有 API key 本身，只有 key 的标签
 *   · 摘要里的金额来自该用户自己的订单
 */

import { connection, NextResponse } from "next/server";

import { apiError } from "@/lib/agent/apiGuard";
import { verifyAgentKey } from "@/lib/agent/auth";
import { summarizeAgentActivity } from "@/lib/agent/activity";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

async function __guardedGET(request: Request) {
  await connection();

  /* ① 登录用户 */
  const user = await getCurrentUser();
  let userId = user?.id ?? null;

  /* ② agent 自己（拿 Bearer key）*/
  if (!userId) {
    const agent = await verifyAgentKey(request.headers.get("authorization"));
    if (agent.ok) userId = agent.identity.userId;
  }

  if (!userId) {
    return apiError(
      401,
      "NOT_AUTHENTICATED",
      "请先登录，或用 agent key 调用这个端点。",
    );
  }

  const [rows, orders, keys] = await Promise.all([
    db.listAgentActivityByUser(userId, 100),
    db.listOrdersByUser(userId, 100),
    db.listAgentKeys(),
  ]);

  const summary = summarizeAgentActivity(rows, orders);

  /* 每把 key 的最近活跃时间 —— 「我的 agent 还活着吗」 */
  const lastSeen = new Map<string, string>();
  for (const row of rows) {
    if (!lastSeen.has(row.keyLabel)) lastSeen.set(row.keyLabel, row.createdAt);
  }

  const myKeys = keys
    .filter((k) => k.userId === userId && !k.revoked)
    .map((k) => ({
      label: k.label,
      createdAt: k.createdAt,
      lastActiveAt: lastSeen.get(k.label) ?? null,
    }));

  return NextResponse.json({
    success: true,
    summary,
    keys: myKeys,
    activity: rows.map((r) => ({
      id: r.id,
      action: r.action,
      method: r.method,
      path: r.path,
      orderId: r.orderId,
      statusCode: r.statusCode,
      ok: r.ok,
      detail: r.detail,
      durationMs: r.durationMs,
      createdAt: r.createdAt,
      keyLabel: r.keyLabel,
    })),
  });
}

export const GET = __guardedGET;
