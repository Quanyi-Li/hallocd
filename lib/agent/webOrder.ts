/**
 * halloCD · 网页端下单的身份与鉴权
 * ==================================================================
 * 网页端付款与 agent 路径是**两套并行的流程**，共用同一套
 * 校验 / 定价 / 落库 / 扣款 / 寄送（lib/agent/agentPlatform.ts）。
 * 区别只有两处：入口在哪、拿什么证明「这单是你的」。
 *
 * 身份从哪来：
 *   · 登录了 → 会话里的用户。订单挂到 TA 名下，会出现在 TA 的个人主页。
 *   · 没登录 → 访客。**v2.13 起网页端结账强制先登录**，访客建单会被拒
 *     （401 LOGIN_REQUIRED）—— 订单要有主人：运单号、回礼链接、以后再寄一张，
 *     都得挂在某个账号下面。
 *
 * 【v2.13 为什么改了口径】
 *   v2.10–v2.12 允许访客下单付款，理由是「录音是 blob URL，强制登录等于让用户重录」。
 *   这个理由现在由**另一条路**解决了：点登录之前先把素材传上去，
 *   登录完原样恢复（lib/draft/pending-order.ts + CheckoutPanel）。
 *   所以登录墙不必再替用户承担「白录一遍」的代价。
 *
 * 一次性凭据存在哪：
 *   orders 表没有专门的列。payment_json 是这张表里唯一的自由 JSON 列，
 *   付款前它是空的，正好放。付款成功后会被 PayPal 的信息覆盖 ——
 *   所以我们在付款后把它补回去（见 app/api/orders/[id]/pay/route.ts），
 *   让重试仍然是幂等的。
 */

import { randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import type { AgentIdentity } from "@/lib/agent/auth";
import { getCurrentUser } from "@/lib/auth/session";
import type { AgentOrder } from "@/lib/agent/orderStore";

/** 一次性付款凭据在 payment_json 里的键名 */
export const WEB_PAY_TOKEN_FIELD = "webPayToken";

/** 我们为这一单建的那张 PayPal 单的 id（直付流程用） */
export const WEB_PAYPAL_ORDER_FIELD = "paypalOrderId";

/** 「发货通知到底发出去没有」落库用的键名 */
export const WEB_NOTIFY_FIELD = "notify";

/** 未登录时统一的错误码与话术（v2.13 起网页端结账强制先登录） */
export const WEB_LOGIN_REQUIRED_CODE = "LOGIN_REQUIRED";
export const WEB_LOGIN_REQUIRED_MESSAGE =
  "网页端下单需要先登录 —— 这一单要挂在你的名下：运单号、回礼链接、以后再寄一张给你，都在这个账号里。";


export type WebIdentity = {
  /** 登录用户 id；访客为 null */
  userId: string | null;
  /** 登录用户名；访客为 null */
  handle: string | null;
};

/** 取当前网页端身份 —— 登录了就是那个用户，没登录就是访客 */
export async function currentWebIdentity(): Promise<WebIdentity> {
  const user = await getCurrentUser();
  return { userId: user?.id ?? null, handle: user?.handle ?? null };
}

/**
 * v2.13：网页端结账要求登录。
 *
 * 返回登录用户的身份；没登录就返回 null —— 调用方据此回 401。
 * （agent 路径不受影响：agent 用 API key 鉴权，本来就有个主人。）
 */
export async function requireWebUser(): Promise<WebIdentity | null> {
  const identity = await currentWebIdentity();
  return identity.userId ? identity : null;
}

/**
 * 把网页端身份包成 quoteOrder() 需要的形状。
 *
 * key / label 只是占位：网页端不走 API key 鉴权那一套，
 * 这里的身份来源是**会话 cookie**，不是 Bearer token。
 */
export function webIdentity(identity: WebIdentity): AgentIdentity {
  return {
    key: "",
    label: "web",
    origin: "db",
    userId: identity.userId,
    handle: identity.handle,
    createdAt: "",
  };
}

/** 发一枚一次性付款凭据 */
export function issueWebPayToken(): string {
  return "wpt_" + randomBytes(18).toString("base64url");
}

/** 定长比较：先比长度再逐字节比，避免提前返回带来的时序差异 */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 读出订单上的网页端付款凭据 */
export function readWebPayToken(order: AgentOrder): string | null {
  const payment = order.payment as Record<string, unknown> | null;
  const token = payment?.[WEB_PAY_TOKEN_FIELD];
  return typeof token === "string" && token ? token : null;
}

/** 读出这一单对应的 PayPal 单号（直付流程：用户批准后要凭它 capture） */
export function readWebPaypalOrderId(order: AgentOrder): string | null {
  const payment = order.payment as Record<string, unknown> | null;
  const id = payment?.[WEB_PAYPAL_ORDER_FIELD];
  return typeof id === "string" && id ? id : null;
}

/**
 * 读出「发货通知有没有发出去」。
 *
 * 落库在 settlePaidOrder 里 —— 因为通知是付款成功之后才发的，
 * 而网页端付完款是**跳回页面**再查库才知道结果的。
 */
export function readWebNotification(order: AgentOrder): {
  sent: boolean;
  skipped: string | null;
} {
  const payment = order.payment as Record<string, unknown> | null;
  const notify = payment?.[WEB_NOTIFY_FIELD] as
    | { sent?: unknown; skipped?: unknown }
    | undefined;
  return {
    sent: Boolean(notify?.sent),
    skipped:
      typeof notify?.skipped === "string" && notify.skipped
        ? notify.skipped
        : null,
  };
}

/**
 * 订单归属校验。
 *
 * 登录用户的订单 → 必须是本人（会话里的 userId 对得上）。
 * 访客的订单     → 必须出示建单时拿到的那枚一次性凭据。
 *
 * 两条路都不满足就是没权限 —— 403，不泄露订单是否存在之外的任何信息。
 */
export function canAccessOrder(
  order: AgentOrder,
  opts: { userId: string | null; payToken: string | null },
): boolean {
  if (order.userId) {
    return Boolean(opts.userId) && opts.userId === order.userId;
  }
  const token = readWebPayToken(order);
  if (!token) return false;
  return safeEqual(token, opts.payToken ?? "");
}

/**
 * 给前端看的订单摘要 —— 刻意**不含** payment_json。
 *
 * 付款凭据是 capability 凭据：谁拿到它谁就能付这一单。
 * 摘要里带上它等于把它发到每一个能看到订单的地方。
 */
export function webOrderSummary(order: AgentOrder) {
  const plan = order.plan as unknown as {
    sceneLabel?: string;
    theme?: string;
    receivers?: string[];
    shipment?: { trackingNumber?: string; eta?: string; carrier?: string };
  };
  const shipment = order.shipment as
    | { trackingNumber?: string; eta?: string; carrier?: string; status?: string }
    | null;

  return {
    orderId: order.id,
    status: order.status,
    productId: order.productId,
    quantity: order.quantity,
    deliveryDate: order.deliveryDate,
    receiverName: order.receiverName,
    sceneLabel: plan?.sceneLabel ?? order.productId,
    quote: order.quote as Record<string, unknown>,
    giftUrl: `/r/${order.giftToken}`,
    trackingNumber: shipment?.trackingNumber ?? null,
    carrier: shipment?.carrier ?? null,
    eta: shipment?.eta ?? order.deliveryDate,
    shipmentStatus: shipment?.status ?? null,
    createdAt: order.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/*  付款凭据的 cookie                                                   */
/* ------------------------------------------------------------------ */

/**
 * 网页端付款凭据放在 cookie 里，而不是只留在页面内存。
 *
 * 为什么（v2.11 直付）：
 *   网页端付款现在会**跳去 PayPal** —— 用户在那边确认完再跳回来。
 *   一次页面跳转就把 React 状态全冲没了，回来之后页面手里没有凭据，
 *   就认不出「刚才那单是我付的」。
 *
 *   cookie 正好扛这个：浏览器自己会带着它，
 *   跨站跳去 PayPal 再跳回来也照样带着（SameSite=Lax 对顶级导航放行）。
 *
 * 为什么不让凭据进 PayPal 那个 URL：
 *   return_url 是要给 PayPal 看的。凭据进了那个 URL，
 *   就等于把它交给支付机构、再进它的日志。
 *   cookie 只在我们自己这一侧 —— 干净。
 *
 * cookie 里存的是 {订单号: 凭据} 的映射（最多留 8 条），
 * 这样同时开着几单也不会互相顶掉。
 */
export const WEB_PAY_COOKIE = "hallocd_web_pay";
const WEB_PAY_COOKIE_MAX = 8;
const WEB_PAY_COOKIE_TTL_SECONDS = 7 * 24 * 3600;

export type WebPayCookieMap = Record<string, string>;

export function parseWebPayCookie(raw: string | undefined | null): WebPayCookieMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: WebPayCookieMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeWebPayCookie(map: WebPayCookieMap): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const trimmed = Object.fromEntries(
    Object.entries(map).slice(-WEB_PAY_COOKIE_MAX),
  );
  const value = encodeURIComponent(JSON.stringify(trimmed));
  return [
    `${WEB_PAY_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${WEB_PAY_COOKIE_TTL_SECONDS}`,
    secure,
  ]
    .filter(Boolean)
    .join("; ");
}

/** 读当前浏览器带的付款凭据映射 */
export async function readWebPayCookieMap(): Promise<WebPayCookieMap> {
  const store = await cookies();
  return parseWebPayCookie(store.get(WEB_PAY_COOKIE)?.value);
}

/**
 * 取某一单的付款凭据：先看显式传进来的（查询参数），
 * 没有再看 cookie —— 跳回页面时页面手里什么都没有，只能靠 cookie。
 */
export async function resolvePayToken(
  orderId: string,
  explicit: string | null,
): Promise<string | null> {
  if (explicit) return explicit;
  const map = await readWebPayCookieMap();
  return map[orderId] ?? null;
}
