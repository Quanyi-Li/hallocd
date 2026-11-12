/**
 * GET /api/orders/[id]
 * ------------------------------------------------------------------
 * 查一笔网页端订单（v2.10 建，v2.11 补齐直付后的状态回读）。
 *
 * 鉴权与付款端点同一套：会话对得上，或者出示建单时拿到的一次性凭据
 * （凭据可以从查询参数给，也可以从浏览器 cookie 里自动带）。
 *
 * v2.11 为什么要在读单时补这些字段：
 *   网页端付款现在会跳去 PayPal 再跳回来 —— 一次跳转把页面状态全冲没了。
 *   回来之后页面手里只有「这一单已经付过」这件事，
 *   运单号 / 回礼链接 / 发货通知到底发没发出去，全得靠查单拿回来。
 *
 * 返回的是**摘要**，不含 payment_json —— 付款凭据是 capability 凭据，
 * 出现在任何能被看见的地方都不合适。
 */

import { connection, NextResponse } from "next/server";

import { apiError } from "@/lib/agent/apiGuard";
import { getOrder } from "@/lib/agent/orderStore";
import {
  canAccessOrder,
  currentWebIdentity,
  readWebNotification,
  resolvePayToken,
  webOrderSummary,
  WEB_LOGIN_REQUIRED_CODE,
  WEB_LOGIN_REQUIRED_MESSAGE,
} from "@/lib/agent/webOrder";
import { withStorageGuard } from "@/lib/api/storage-guard";

type Ctx = { params: Promise<{ id: string }> };

async function __guardedGET(request: Request, context: Ctx) {
  await connection();

  const { id } = await context.params;

  /* v2.13：查单也要登录 —— 订单是账号下的东西 */
  const identity = await currentWebIdentity();
  if (!identity.userId) {
    return apiError(401, WEB_LOGIN_REQUIRED_CODE, WEB_LOGIN_REQUIRED_MESSAGE);
  }

  const order = await getOrder(id);
  if (!order) {
    return apiError(404, "ORDER_NOT_FOUND", `订单 ${id} 不存在。`);
  }

  const url = new URL(request.url);
  const explicitToken = url.searchParams.get("payToken");
  const payToken = await resolvePayToken(id, explicitToken);

  if (!canAccessOrder(order, { userId: identity.userId, payToken })) {
    return apiError(403, "ORDER_ACCESS_DENIED", "这笔订单不属于你。");
  }

  const shipment = (order.shipment ?? {}) as {
    trackingNumber?: string;
    carrier?: string;
    eta?: string;
    status?: string;
  };
  const payment = (order.payment ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    success: true,
    order: webOrderSummary(order),
    quote: order.quote,
    shipment: {
      trackingNumber: shipment.trackingNumber ?? null,
      carrier: shipment.carrier ?? null,
      eta: shipment.eta ?? order.deliveryDate,
      status: shipment.status ?? null,
    },
    giftUrl: `/r/${order.giftToken}`,
    /** 支付状态（不含任何凭据） */
    payment: {
      status: typeof payment.status === "string" ? payment.status : null,
      amount: typeof payment.amount === "string" ? payment.amount : null,
      currency: typeof payment.currency === "string" ? payment.currency : null,
      paypalOrderId:
        typeof payment.paypalOrderId === "string" ? payment.paypalOrderId : null,
    },
    /** 发货通知到底发出去没有 */
    notification: readWebNotification(order),
  });
}

export const GET = withStorageGuard(__guardedGET);
