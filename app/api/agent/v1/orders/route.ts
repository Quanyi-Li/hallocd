/**
 * /api/agent/v1/orders
 * ------------------------------------------------------------------
 * POST —— 创建订单并返回报价（**不扣款**）
 * GET  —— 列出订单（按 API key 过滤）
 *
 * 设计原则：把「报价」和「扣款」拆成两步。
 * agent 先拿到价格给人确认，再调用 /pay 完成扣款 —— 这才像人做的事，
 * 也避免 agent 在无人确认的情况下把用户的钱花掉。
 */

import { connection, NextResponse } from "next/server";

import { apiError, guardAgent, withAgentActivity } from "@/lib/agent/apiGuard";
import { describeOrder, describeOrderEn, quoteOrder } from "@/lib/agent/agentPlatform";
import { listOrders } from "@/lib/agent/orderStore";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedPOST(request: Request) {
  await connection();

  const guard = await guardAgent(request);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "请求体不是合法 JSON。");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "INVALID_BODY", "请求体必须是一个 JSON 对象。");
  }

  const result = await quoteOrder(
    body as Parameters<typeof quoteOrder>[0],
    guard.identity,
  );

  if (!result.ok) {
    return apiError(
      result.error.status,
      result.error.error,
      result.error.message,
      result.error.field ? { field: result.error.field } : undefined,
    );
  }

  const { order } = result;

  return NextResponse.json(
    {
      success: true,
      orderId: order.id,
      status: order.status,
      quote: order.quote,
      /** 人类可读摘要 —— agent 可以直接复述给用户 */
      summary: describeOrder(order),
      /** 英文版摘要 —— 面向英文用户时直接用这份，不必自己翻译 */
      summaryEn: describeOrderEn(order),
      design: order.design,
      letter: order.letter,
      shipment: order.plan.shipment,
      /** 回礼跳转链接 —— 便签上「回一张 CD」的落点 */
      giftUrl: `/r/${order.giftToken}`,
      /** 这笔单归属到谁名下（agent 绑定用户时会有值） */
      owner: {
        userId: order.userId,
        senderHandle: order.senderHandle,
        receiverHandle: order.receiverHandle,
      },
      pay: {
        method: "POST",
        path: `/api/agent/v1/orders/${order.id}/pay`,
        description:
          "确认金额后调用此端点完成扣款。幂等：重复调用不会重复扣款。",
        descriptionEn:
          "Call this endpoint to capture the payment once the amount is confirmed. Idempotent: calling it again will not charge twice.",
      },
      next:
        "把 quote.total 告知用户并取得确认，然后调用 pay 端点。",
      nextEn:
        "Tell the user quote.total and get their confirmation, then call the pay endpoint.",
    },
    { status: 201 },
  );
}

async function __guardedGET(request: Request) {
  await connection();

  const guard = await guardAgent(request);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

  const all = await listOrders(limit);
  // 站点主 key 看得到全部；用户自己的 key 只看得到自己名下的
  const orders = all
    .filter(
      (o) =>
        guard.identity.userId === null ||
        o.userId === guard.identity.userId,
    )
    .map((o) => ({
      orderId: o.id,
      status: o.status,
      productId: o.productId,
      quantity: o.quantity,
      total: (o.quote as Record<string, unknown>)?.total,
      currency: (o.quote as Record<string, unknown>)?.currency,
      deliveryDate: o.deliveryDate,
      receiverName: o.receiverName,
      trackingNumber:
        (o.shipment as Record<string, unknown> | null)?.trackingNumber ?? null,
      giftUrl: `/r/${o.giftToken}`,
      createdAt: o.createdAt,
    }));

  return NextResponse.json({ success: true, count: orders.length, orders });
}

export const POST = withStorageGuard(withAgentActivity(__guardedPOST));
export const GET = withStorageGuard(withAgentActivity(__guardedGET));
