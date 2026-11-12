/**
 * POST /api/orders
 * ------------------------------------------------------------------
 * 网页端建单（v2.10）—— 与 agent 路径**并行**的一套流程。
 *
 * 为什么又有一套：网页端用户就是可以付款的。
 *   · agent 路径：用户自己的 coding agent 替用户下单（POST /api/agent/v1/orders）
 *   · 网页端路径：用户自己在浏览器里下单付款（本端点）
 * 两条路共用同一套校验 / 定价 / 落库 / 扣款 / 寄送，
 * 换的只是入口与鉴权方式（会话 cookie vs API key）。
 *
 * 这里**不扣款**：只建单并给出报价。
 * 扣款是 POST /api/orders/<id>/pay —— 先让用户看见金额，再让他确认。
 * 这一条原则跟 agent 路径完全一致（报价 → 确认 → 付款）。
 *
 * 请求体与 POST /api/agent/v1/orders 完全同构，
 * 所以网页端复制出去的那段 JSON 可以原样再发回这里。
 */

import { connection, NextResponse } from "next/server";

import { apiError } from "@/lib/agent/apiGuard";
import { quoteOrder, describeOrder, describeOrderEn } from "@/lib/agent/agentPlatform";
import { updateOrder } from "@/lib/agent/orderStore";
import {
  currentWebIdentity,
  issueWebPayToken,
  readWebPayCookieMap,
  serializeWebPayCookie,
  webIdentity,
  WEB_LOGIN_REQUIRED_CODE,
  WEB_LOGIN_REQUIRED_MESSAGE,
} from "@/lib/agent/webOrder";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedPOST(request: Request) {
  await connection();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_JSON", "请求体不是合法 JSON。");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return apiError(400, "INVALID_BODY", "请求体必须是一个 JSON 对象。");
  }

  /* v2.13：网页端结账强制先登录。
     订单要有主人 —— 运单号、回礼链接、以后再寄一张，都在账号里。
     （agent 路径不受影响：它用 API key 鉴权，本来就有个主人。） */
  const identity = await currentWebIdentity();
  if (!identity.userId) {
    return apiError(401, WEB_LOGIN_REQUIRED_CODE, WEB_LOGIN_REQUIRED_MESSAGE);
  }

  const result = await quoteOrder(
    body as Parameters<typeof quoteOrder>[0],
    webIdentity(identity),
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

  /* 登录用户也要发一枚一次性凭据：万一换了标签页 / 刷新了，
     会话还在但凭据更直接（它同时写进 cookie，跳去 PayPal 再跳回来也认得这一单）。 */
  const payToken = issueWebPayToken();
  await updateOrder(order.id, {
    payment: { webPayToken: payToken },
  });

  /* 凭据同时写进 cookie —— 网页端付款要跳去 PayPal 再跳回来，
     一次跳转就会把页面状态冲光，回来时只能靠 cookie 认领这笔单。
     cookie 是 httpOnly：JS 读不到，页面里也翻不出它。 */
  const cookieMap = await readWebPayCookieMap();
  cookieMap[order.id] = payToken;

  const res = NextResponse.json(
    {
      success: true,
      orderId: order.id,
      status: order.status,
      quote: order.quote,
      /** 人类可读摘要 —— 网页端可以直接渲染这份 */
      summary: describeOrder(order),
      /** 英文版摘要 */
      summaryEn: describeOrderEn(order),
      design: order.design,
      letter: order.letter,
      /** 回礼跳转链接 —— 便签上「回一张 CD」的落点 */
      giftUrl: `/r/${order.giftToken}`,
      owner: {
        userId: order.userId,
        senderHandle: order.senderHandle,
        receiverHandle: order.receiverHandle,
      },
      /** 一次性付款凭据 —— 只在本次响应里出现，存本地（localStorage）供付款用 */
      payToken,
      pay: {
        method: "POST",
        path: `/api/orders/${order.id}/pay`,
        description:
          "确认金额后调用此端点。返回 approveUrl —— 把浏览器跳过去，用户在 PayPal 上自己确认付款。",
        descriptionEn:
          "Call this endpoint once the amount is confirmed. It returns an approveUrl — send the browser there so the user pays on PayPal.",
      },
      next: "把 quote.total 告知用户并取得确认，然后调用 pay 端点并跳转 approveUrl。",
      nextEn:
        "Show the user quote.total, get their confirmation, then call the pay endpoint and redirect to approveUrl.",
    },
    { status: 201 },
  );
  res.headers.append("Set-Cookie", serializeWebPayCookie(cookieMap));
  return res;
}

export const POST = withStorageGuard(__guardedPOST);
