/**
 * GET /api/my/orders
 * ------------------------------------------------------------------
 * 当前登录用户的订单，分「我送出的」与「我收到的」。
 *
 * 为什么要有这个端点：
 *   · 个人主页 /u/<handle> 是**公开**的（任何人能看），用的是 `db.listOrders()` 全量过滤；
 *   · My Room 是**登录后**的私人空间，应该只返回「我自己的」订单 ——
 *     直接在前端拿全量再过滤，等于把别人的订单也发到浏览器里。
 *
 * 「我收到的」按 receiver_handle 匹配：
 *   收件人未必注册了账号（很多礼物送给站外的人），
 *   所以订单里记的是收件人写的名字或站内用户名。
 *   只有对方正好用同一个 handle 注册了，TA 登录后才能在这里看到这张 CD。
 *
 * 鉴权：会话 cookie（不是 agent key）—— 这是给人用的接口。
 */

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { db, type DbOrder } from "@/lib/db";
import { withStorageGuard } from "@/lib/api/storage-guard";

/** 给前端用的一张 CD 的最小信息集 */
export type MyCd = {
  orderId: string;
  /** 场景 id */
  productId: string;
  /** 主题文案（中英都有，取中文） */
  theme: string;
  themeEn: string;
  /** 碟面颜色 */
  discColor: string;
  /** 自制盘面图（自家上传端点的引用） */
  coverArt: string | null;
  /** 信纸正文 */
  letter: string;
  /** 落款 */
  signature: string;
  /** 收件人 / 寄件人显示名 */
  peer: string;
  peerHandle: string | null;
  status: string;
  /** 回礼链接 */
  giftUrl: string;
  createdAt: string;
};

function pickString(
  obj: Record<string, unknown> | null | undefined,
  key: string,
): string {
  if (!obj) return "";
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function toMyCd(order: DbOrder, mode: "sent" | "received"): MyCd {
  const design = (order.design ?? {}) as Record<string, unknown>;
  const letter = (order.letter ?? {}) as Record<string, unknown>;
  const plan = (order.plan ?? {}) as Record<string, unknown>;

  return {
    orderId: order.id,
    productId: order.productId,
    theme: pickString(plan, "theme") || order.productId,
    themeEn: pickString(plan, "themeEn"),
    discColor: pickString(design, "discColor") || "#E9DFD2",
    coverArt: pickString(design, "discArtUrl") || null,
    letter: pickString(letter, "text"),
    signature: pickString(letter, "signature"),
    peer:
      mode === "sent"
        ? order.receiverName || order.receiverHandle || "收件人"
        : order.senderHandle || "匿名好友",
    peerHandle:
      mode === "sent"
        ? order.receiverHandle
        : order.senderHandle,
    status: order.status,
    giftUrl: `/r/${order.giftToken}`,
    createdAt: order.createdAt,
  };
}

export const GET = withStorageGuard(async () => {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: "NOT_AUTHENTICATED", message: "未登录。" },
      { status: 401 },
    );
  }

  const [sent, received] = await Promise.all([
    db.listOrdersByUser(user.id, 100),
    db.listOrdersByReceiverHandle(user.handle, 100),
  ]);

  return NextResponse.json({
    success: true,
    handle: user.handle,
    displayName: user.displayName || user.handle,
    sent: sent.map((o) => toMyCd(o, "sent")),
    received: received.map((o) => toMyCd(o, "received")),
  });
});
