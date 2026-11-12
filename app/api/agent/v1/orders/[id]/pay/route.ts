/**
 * POST /api/agent/v1/orders/{orderId}/pay
 * ------------------------------------------------------------------
 * 扣款 + 生成寄送任务。
 *
 * 幂等：同一订单重复调用不会重复扣款 —— agent 重试安全。
 * 真实调用 PayPal Sandbox Orders v2（见 lib/agent/paypal.ts）。
 */

import { connection, NextResponse } from "next/server";

import { apiError, guardAgent, withAgentActivity } from "@/lib/agent/apiGuard";
import { describeOrder, describeOrderEn, payOrder } from "@/lib/agent/agentPlatform";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedPOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();

  const guard = await guardAgent(request);
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const result = await payOrder(id);

  if (!result.ok) {
    return apiError(
      result.error.status,
      result.error.error,
      result.error.message,
      result.order ? { orderId: result.order.id, status: result.order.status } : undefined,
    );
  }

  const { order, steps, alreadyPaid, notification } = result;

  return NextResponse.json({
    success: true,
    alreadyPaid,
    orderId: order.id,
    status: order.status,
    payment: order.payment ?? null,
    shipment: order.shipment ?? null,
    quote: order.quote,
    steps,
    /**
     * 这次付款有没有把「已发货」通知发出去。
     * agent 要把这句话如实转述给用户 —— 平台知道真相，就不该让 agent 猜。
     */
    notification,
    summary: describeOrder(order),
    summaryEn: describeOrderEn(order),
    message: alreadyPaid
      ? "该订单此前已支付，本次调用未重复扣款。"
      : "支付完成，寄送任务已创建。",
    messageEn: alreadyPaid
      ? "This order was already paid — this call did not charge again."
      : "Payment completed, shipping task created.",
  });
}

export const POST = withStorageGuard(withAgentActivity(__guardedPOST));
