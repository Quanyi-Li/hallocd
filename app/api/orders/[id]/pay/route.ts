/**
 * POST /api/orders/[id]/pay
 * ------------------------------------------------------------------
 * 网页端付款（v2.11 · 直付）。
 *
 * 【v2.11 改了什么】
 * v2.10 这里做的是**服务端代付**：直接拿 PayPal 的 payment_source 建单，
 * 建单即完成扣款 —— 页面上的文案因此写的是「平台代付」。
 * 那条路是给 agent 用的（agent 没有浏览器，只能替用户扣）。
 *
 * 网页端不该这样：钱应该是**用户自己付**的。
 * 所以现在这里改成标准网页结账形态：
 *
 *   ① POST /api/orders/<id>/pay
 *      → 建一张 PayPal「审批单」（intent=CAPTURE，但不带 payment_source）
 *      → PayPal 只把单子停在 CREATED，交回一条收银台链接
 *      → 返回 { mode: "redirect", approveUrl }
 *   ② 浏览器跳到 approveUrl —— 用户在 PayPal 上登录/刷卡，自己确认金额
 *   ③ PayPal 跳回 GET /api/orders/<id>/pay/return
 *      → 服务端 capture 这张已批准的 PayPal 单 → 落库、寄出、通知
 *      → 再把浏览器送回 /make?paid=1，页面显示运单号与回礼链接
 *
 * 在用户点下 PayPal 上那个「确认付款」之前，**一分钱都不会动**。
 *
 * 与 agent 路径的关系：
 *   agent 路径仍然是代付（POST /api/agent/v1/orders/<id>/pay）——
 *   agent 的职责就是替用户把单付掉。
 *   两条路共用同一套校验 / 定价 / 落库 / 寄送 / 通知内核。
 *
 * 幂等：已付过的单再调一次不会重复扣款，直接回同一份结果；
 * 没付过但用户多点了几次「确认付款」，也不会多建 PayPal 单
 * （复用同一张，回跳时 capture 一次就够）。
 */

import { connection, NextResponse } from "next/server";

import { apiError } from "@/lib/agent/apiGuard";
import {
  describeOrder,
  describeOrderEn,
  payOrderApproved,
} from "@/lib/agent/agentPlatform";
import { getOrder, updateOrder } from "@/lib/agent/orderStore";
import {
  createApprovalOrder,
  hasCredentials,
  readPayPalConfig,
  readPaypalOrder,
  PayPalError,
} from "@/lib/agent/paypal";
import {
  canAccessOrder,
  currentWebIdentity,
  readWebNotification,
  readWebPaypalOrderId,
  resolvePayToken,
  webOrderSummary,
  WEB_LOGIN_REQUIRED_CODE,
  WEB_LOGIN_REQUIRED_MESSAGE,
} from "@/lib/agent/webOrder";
import { withStorageGuard } from "@/lib/api/storage-guard";

type Ctx = { params: Promise<{ id: string }> };

/** 已付款时回的载荷 —— 幂等分支和 capture 成功后共用 */
function paidPayload(order: Parameters<typeof webOrderSummary>[0]) {
  const shipment = (order.shipment ?? {}) as {
    trackingNumber?: string;
    carrier?: string;
    eta?: string;
    status?: string;
  };
  const notification = readWebNotification(order);
  return {
    success: true,
    mode: "already_paid" as const,
    orderId: order.id,
    status: order.status,
    quote: order.quote,
    summary: describeOrder(order),
    summaryEn: describeOrderEn(order),
    giftUrl: `/r/${order.giftToken}`,
    shipment: {
      trackingNumber: shipment.trackingNumber ?? null,
      carrier: shipment.carrier ?? null,
      eta: shipment.eta ?? order.deliveryDate,
      status: shipment.status ?? null,
    },
    notification,
    order: webOrderSummary(order),
  };
}

async function __guardedPOST(request: Request, context: Ctx) {
  await connection();

  const { id } = await context.params;

  /* v2.13：付款也要登录 —— 付款是账号下的动作 */
  const identity = await currentWebIdentity();
  if (!identity.userId) {
    return apiError(401, WEB_LOGIN_REQUIRED_CODE, WEB_LOGIN_REQUIRED_MESSAGE);
  }

  const order = await getOrder(id);
  if (!order) {
    return apiError(404, "ORDER_NOT_FOUND", `订单 ${id} 不存在。`);
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* 没有 body 也行 —— 登录用户光靠会话就能付 */
  }
  const bodyToken =
    body && typeof body === "object" && !Array.isArray(body)
      ? String((body as Record<string, unknown>).payToken ?? "") || null
      : null;

  /* 凭据从哪来都行：显式传的、或者浏览器 cookie 里那枚
     （跳去 PayPal 再跳回来时，页面手里已经没有它了）。 */
  const payToken = await resolvePayToken(order.id, bodyToken);

  if (!canAccessOrder(order, { userId: identity.userId, payToken })) {
    return apiError(
      403,
      "ORDER_ACCESS_DENIED",
      "这笔订单不属于你 —— 登录下单的用户请用同一个账号登录后再付款。",
    );
  }

  /* 已经付过了 —— 幂等：回同一份结果，不重复扣款 */
  if (order.status === "paid" && order.payment) {
    return NextResponse.json(paidPayload(order));
  }

  const config = readPayPalConfig();
  if (!hasCredentials(config)) {
    return apiError(
      503,
      "MISSING_CREDENTIALS",
      "服务端缺少 PayPal 凭据：请在 .env.local 配置 PAYPAL_CLIENT_ID 与 PAYPAL_CLIENT_SECRET",
    );
  }

  const origin = new URL(request.url).origin;
  const plan = order.plan as unknown as {
    sceneLabel?: string;
    receivers?: string[];
  };

  /* 用户可能连点了好几次「确认付款」——
     复用同一张 PayPal 单，不要多建一张（多建一张就多一个待批的单）。 */
  let existingId = readWebPaypalOrderId(order);
  let approval = null;

  if (existingId) {
    try {
      approval = await readPaypalOrder({ orderId: existingId, config });
    } catch {
      /* 这张 PayPal 单已经查不到了（过期 / 被删）—— 重新建一张 */
      approval = null;
      existingId = null;
    }
  }

  if (!approval) {
    try {
      approval = await createApprovalOrder({
        amount: String((order.quote as { total?: string }).total ?? "0"),
        currency: String((order.quote as { currency?: string }).currency ?? "USD"),
        description: `halloCD ${plan?.sceneLabel ?? order.productId} x${order.quantity} -> ${(plan?.receivers ?? []).join(", ")}`,
        referenceId: `WEB-${order.deliveryDate}-${order.quantity}`,
        customId: "halloCD-web-checkout",
        /* 用户批准后 PayPal 跳回来的地址 —— 我们在那里把这一单扣下来 */
        returnUrl: `${origin}/api/orders/${order.id}/pay/return`,
        /* 用户在 PayPal 上点「取消」—— 直接送回制作页 */
        cancelUrl: `${origin}/make?payCanceled=1&order=${encodeURIComponent(order.id)}#checkout`,
        config,
      });
    } catch (error) {
      const isPayPalError = error instanceof PayPalError;
      return apiError(
        isPayPalError && error.status >= 400 && error.status < 600
          ? error.status
          : 502,
        isPayPalError ? error.issue : "PAYPAL_REQUEST_FAILED",
        error instanceof Error ? error.message : "PayPal 建单失败",
      );
    }

    /* 记下这张 PayPal 单 —— 回跳时靠它认账：
       capture 之前必须确认「用户批准的正是我们建的那一张」。 */
    await updateOrder(order.id, {
      payment: {
        ...((order.payment as Record<string, unknown> | null) ?? {}),
        paypalOrderId: approval.orderId,
        approvalStatus: approval.status,
        approvalStartedAt: new Date().toISOString(),
      },
    });
  }

  /* 已经批过了（用户批了但当时没扣成功 / 重复点确认）—— 直接收尾。
     注意：PayPal 用 payment_source.paypal 建单时返回的状态是
     PAYER_ACTION_REQUIRED（不带 payment_source 建单才是 CREATED），
     这两个状态都还**没有**人付过钱 —— 必须让用户先在收银台点确认。 */
  const awaitingPayer = approval.status === "CREATED" || approval.status === "PAYER_ACTION_REQUIRED";

  if (!awaitingPayer) {
    const result = await payOrderApproved(order.id, approval.orderId);
    if (!result.ok) {
      return apiError(
        result.error.status,
        result.error.error,
        result.error.message,
        result.error.field ? { field: result.error.field } : undefined,
      );
    }
    return NextResponse.json({
      ...paidPayload(result.order),
      mode: "already_paid",
    });
  }

  return NextResponse.json({
    success: true,
    mode: "redirect" as const,
    /** 把浏览器送过去 —— 用户在 PayPal 上自己确认、自己付款 */
    approveUrl: approval.approveUrl,
    orderId: order.id,
    status: order.status,
    quote: order.quote,
    summary: describeOrder(order),
    summaryEn: describeOrderEn(order),
    giftUrl: `/r/${order.giftToken}`,
    order: webOrderSummary(order),
  });
}

export const POST = withStorageGuard(__guardedPOST);
