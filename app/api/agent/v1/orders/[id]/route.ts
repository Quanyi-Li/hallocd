/**
 * GET /api/agent/v1/orders/{orderId}
 * ------------------------------------------------------------------
 * 查订单状态。agent 用它来确认「这笔单到底付了没 / 发货了没」。
 */

import { connection, NextResponse } from "next/server";

import { apiError, guardAgent, withAgentActivity } from "@/lib/agent/apiGuard";
import { describeOrder, describeOrderEn } from "@/lib/agent/agentPlatform";
import { getOrder } from "@/lib/agent/orderStore";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedGET(
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

  return NextResponse.json({
    success: true,
    order: {
      orderId: order.id,
      status: order.status,
      productId: order.productId,
      quantity: order.quantity,
      deliveryDate: order.deliveryDate,
      receiverName: order.receiverName,
      receiverHandle: order.receiverHandle,
      senderHandle: order.senderHandle,
      design: order.design,
      letter: order.letter,
      quote: order.quote,
      payment: order.payment ?? null,
      shipment: order.shipment ?? null,
      error: order.error ?? null,
      giftUrl: `/r/${order.giftToken}`,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    },
    summary: describeOrder(order),
    summaryEn: describeOrderEn(order),
  });
}

export const GET = withStorageGuard(withAgentActivity(__guardedGET));
