/**
 * POST /api/agent/v1/orders/{orderId}/shipment
 * ------------------------------------------------------------------
 * 推进订单的物流状态，并按需发出通知（v2.8 / G17）。
 *
 * 为什么要有这个端点：
 *   「发货」这个动作在现实里发生在**履约侧**，不在下单侧。
 *   下单那一刻只产生运单号；等包裹真的寄出 / 送到，收件人才需要知道。
 *   物流系统（或运营、或 agent）通过这个端点把状态推上来，
 *   平台在状态跃迁时自动发通知 —— 这就是「发货后通知」的闭环。
 *
 * 请求体：
 *   { "status": "shipped" | "delivered", "trackingNumber"?, "eta"?, "carrier"? }
 *
 * 幂等：
 *   · 同一个 status 重复提交 → 不会重复发信（notification 记录里有 sentAt）
 *   · 不带 status 时，沿用订单当前状态
 */

import { connection, NextResponse } from "next/server";

import { apiError, guardAgent, withAgentActivity } from "@/lib/agent/apiGuard";
import { getOrder, updateOrder } from "@/lib/agent/orderStore";
import {
  isShipmentStatus,
  notifyShipment,
  type ShipmentStatus,
} from "@/lib/notify/shipment";
import { withStorageGuard } from "@/lib/api/storage-guard";

type ShipmentBlob = {
  trackingNumber?: string;
  eta?: string;
  carrier?: string;
  status?: string;
  shippedAt?: string;
  deliveredAt?: string;
  notification?: unknown;
};

async function __guardedPOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();

  const guard = await guardAgent(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const order = await getOrder(id);
  if (!order) {
    return apiError(404, "ORDER_NOT_FOUND", `订单 ${id} 不存在。`);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError(400, "INVALID_JSON", "请求体不是合法 JSON。");
  }

  const current = (order.shipment ?? {}) as ShipmentBlob;
  const rawStatus = body.status ?? current.status ?? "shipped";

  if (!isShipmentStatus(rawStatus)) {
    return apiError(
      400,
      "INVALID_STATUS",
      `status 只能是 shipped / delivered / pending，收到的是「${String(rawStatus)}」。`,
    );
  }
  const status: ShipmentStatus = rawStatus;

  const next: ShipmentBlob = {
    ...current,
    status,
    trackingNumber:
      typeof body.trackingNumber === "string" && body.trackingNumber
        ? body.trackingNumber
        : (current.trackingNumber ?? ""),
    eta:
      typeof body.eta === "string" && body.eta
        ? body.eta
        : (current.eta ?? order.deliveryDate),
    carrier:
      typeof body.carrier === "string" && body.carrier
        ? body.carrier
        : (current.carrier ?? "halloCD Express"),
  };

  if (status === "shipped" && !next.shippedAt) {
    next.shippedAt = new Date().toISOString();
  }
  if (status === "delivered") {
    next.deliveredAt = new Date().toISOString();
    if (!next.shippedAt) next.shippedAt = next.deliveredAt;
  }

  const updated = await updateOrder(order.id, {
    shipment: next as unknown as Record<string, unknown>,
  });

  /* 状态跃迁 → 发通知（失败不影响状态写入） */
  let notified = false;
  let noticeSkipped: string | null = null;
  try {
    const notice = await notifyShipment(
      updated ?? { ...order, shipment: next as unknown as Record<string, unknown> },
      status,
    );
    notified = notice.sent;
    noticeSkipped = notice.skipped ?? null;
  } catch (err) {
    console.error(
      "[agent/shipment] 发货通知失败：",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({
    success: true,
    orderId: order.id,
    status,
    shipment: updated?.shipment ?? next,
    notification: { sent: notified, skipped: noticeSkipped },
  });
}

export const POST = withStorageGuard(withAgentActivity(__guardedPOST));
