/**
 * halloCD Agent API · 路由守卫
 * 把鉴权失败翻译成 agent 能读懂的错误体。
 */

import { NextResponse } from "next/server";

import { verifyAgentKey, type AgentIdentity } from "@/lib/agent/auth";
import { orderIdFromPath, recordAgentActivity } from "@/lib/agent/activity";

export type GuardResult =
  | { ok: true; identity: AgentIdentity }
  | { ok: false; response: NextResponse };

/**
 * 这次请求的鉴权身份 —— 用 WeakMap 挂在 request 对象上。
 *
 * 为什么不让每个路由自己把 identity 交出来：
 *   活动流水要覆盖**所有** agent 端点。靠自觉加一行，迟早有端点会漏 ——
 *   而漏掉的恰恰是最该被看见的那些（付款、推进物流）。
 *   挂在 request 上，包装器就能统一收口：加新端点时自动被记录。
 */
const identities = new WeakMap<Request, AgentIdentity>();

export async function guardAgent(request: Request): Promise<GuardResult> {
  const result = await verifyAgentKey(request.headers.get("authorization"));

  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: result.error,
          message: result.message,
        },
        {
          status: result.status,
          headers:
            result.status === 401
              ? { "WWW-Authenticate": 'Bearer realm="halloCD Agent API"' }
              : undefined,
        },
      ),
    };
  }

  identities.set(request, result.identity);
  return { ok: true, identity: result.identity };
}

/**
 * 包一层：handler 跑完之后，把这次调用记进活动流水。
 *
 * 用法：export const POST = withStorageGuard(withAgentActivity(__guardedPOST));
 *
 * 为什么单独一层而不是塞进 guardAgent：
 *   guardAgent 只知道「你是谁」，不知道「这次调用成没成、关联哪张订单」——
 *   那要等 handler 跑完才知道。
 *
 * 为什么用泛型保留 handler 的完整签名：
 *   动态路由的 handler 是 (request, { params }) —— 两参数。
 *   包装器如果只接一个参数，TS 就会报「参数太少」，等于逼着所有动态路由
 *   绕过包装器 —— 那就等于没有包装器。
 */
export function withAgentActivity<A extends unknown[], R extends Response>(
  handler: (request: Request, ...args: A) => Promise<R>,
): (request: Request, ...args: A) => Promise<R> {
  return async (request: Request, ...args: A): Promise<R> => {
    const startedAt = Date.now();
    const response = await handler(request, ...args);
    const identity = identities.get(request);

    /* 没鉴权身份 = 这个端点本来就不需要鉴权（比如 health），不记 */
    if (identity) {
      const url = new URL(request.url);
      const extra = await readOrderFacts(request, response, url.pathname);
      await recordAgentActivity(identity, {
        method: request.method,
        pathname: url.pathname,
        statusCode: response.status,
        ok: response.status >= 200 && response.status < 400,
        orderId: orderIdFromPath(url.pathname) ?? extra.orderId,
        durationMs: Date.now() - startedAt,
        detail: extra.detail,
      });
    }

    return response;
  };
}

/**
 * 从响应体里补两个事实：订单号与一句话摘要。
 *
 * 只在「建单」这个动作上做 —— 那时订单号还没出现在路径里。
 * 其他动作的订单号从路径就能拿到，没必要多 clone 一次响应体。
 */
async function readOrderFacts(
  request: Request,
  response: Response,
  pathname: string,
): Promise<{ orderId: string | null; detail: string }> {
  const isCreate =
    request.method.toUpperCase() === "POST" &&
    pathname.replace(/\/+$/, "").endsWith("/api/agent/v1/orders");
  if (!isCreate) return { orderId: null, detail: "" };

  try {
    const data = await response.clone().json();
    const orderId =
      typeof data?.orderId === "string" && data.orderId ? data.orderId : null;
    const productId = typeof data?.order?.productId === "string" ? data.order.productId : "";
    const quantity = data?.quote?.quantity ?? data?.order?.quantity ?? "";
    const parts: string[] = [];
    if (productId) parts.push(productId);
    if (quantity) parts.push(`x${quantity}`);
    return { orderId, detail: parts.join(" ") };
  } catch {
    /* 响应体不是 JSON（比如 5xx 的 HTML）—— 记个空摘要就行 */
    return { orderId: null, detail: "" };
  }
}

/** 统一的错误响应体 —— agent 靠 error 字段做分支 */
export function apiError(
  status: number,
  error: string,
  message: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { success: false, error, message, ...(extra ?? {}) },
    { status },
  );
}
