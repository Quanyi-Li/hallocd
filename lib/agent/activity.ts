/**
 * halloCD · Agent 活动流水
 * ==================================================================
 * 「用户自己的 agent 到底在干什么？」—— 这是接入台要回答的核心问题。
 *
 * 平台提供接口，agent 在用户自己的机器上跑。用户在网页上看不到 agent 的进程、
 * 看不到它的定时任务、看不到它刚刚是不是报错了。唯一能看见的，
 * 就是它**调用了平台接口的痕迹**。
 *
 * 所以每次 /api/agent/v1/* 调用都在这里留一笔：
 *   什么时候 · 做了什么动作 · 关联哪张订单 · 成没成 · 花了多久
 *
 * ------------------------------------------------------------------
 * 设计取舍：
 *
 *   · **只记 key 的标签，不记 key 本身** —— 日志是长期留存的东西，
 *     而 key 是可以随时吊销的凭据。把凭据写进日志等于开后门。
 *   · **站点主 key 的调用不归属任何用户**（user_id = null）——
 *     它是平台方自己的，不该出现在某个用户的活动列表里。
 *   · **记录失败绝不影响主流程** —— 活动是观测手段，不是业务前提。
 *     写活动出错时，接口照常返回成功。
 *   · **动作是稳定枚举，不是自由文本** —— 前端要拿它做 i18n，
 *     自由文本会导致中英两套文案各写一遍、慢慢漂移。
 */

import { randomUUID } from "node:crypto";

import { db, type DbAgentActivity, type DbOrder } from "@/lib/db";
import type { AgentIdentity } from "@/lib/agent/auth";

/** 平台支持的动作 —— 前端按这个枚举做 i18n */
export type AgentAction =
  | "catalog.read"
  | "order.create"
  | "order.list"
  | "order.read"
  | "order.pay"
  | "shipment.update"
  | "key.manage"
  | "other";

/**
 * 从「方法 + 路径」推出动作。
 *
 * 为什么用路径而不是让每个路由自己上报：
 *   这样新加端点时**不会漏记** —— 忘记上报只是分类落到 other，
 *   而不会悄悄少一笔记录。观测性优先于精确性。
 */
export function deriveAgentAction(method: string, pathname: string): AgentAction {
  const p = pathname.replace(/\/+$/, "");
  const isOrder = /\/api\/agent\/v1\/orders(\/[^/]+)?(\/pay|\/shipment)?$/.test(p);

  if (p.endsWith("/catalog")) return "catalog.read";
  if (p.endsWith("/keys")) return "key.manage";
  if (p.endsWith("/shipment")) return "shipment.update";
  if (p.endsWith("/pay")) return "order.pay";
  if (isOrder) {
    if (method.toUpperCase() === "POST") return "order.create";
    if (/\/orders\/[^/]+$/.test(p)) return "order.read";
    return "order.list";
  }
  return "other";
}

/** 从路径里把订单 id 抠出来（建单时路径里没有，那时要从响应体里取） */
export function orderIdFromPath(pathname: string): string | null {
  const m = pathname.match(/\/orders\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export type ActivityInput = {
  method: string;
  pathname: string;
  statusCode: number;
  ok: boolean;
  orderId: string | null;
  durationMs: number;
  detail: string;
};

/**
 * 记一笔活动。
 *
 * 永不抛错 —— 观测手段不能把业务接口带崩。
 */
export async function recordAgentActivity(
  identity: AgentIdentity,
  input: ActivityInput,
): Promise<void> {
  try {
    const row: DbAgentActivity = {
      id: randomUUID(),
      userId: identity.userId,
      keyLabel: identity.label,
      action: deriveAgentAction(input.method, input.pathname),
      method: input.method.toUpperCase(),
      path: input.pathname,
      orderId: input.orderId,
      statusCode: input.statusCode,
      ok: input.ok,
      detail: input.detail,
      durationMs: input.durationMs,
      createdAt: new Date().toISOString(),
    };
    await db.insertAgentActivity(row);
  } catch (err) {
    console.error(
      "[agent/activity] 写活动流水失败（不影响主流程）：",
      err instanceof Error ? err.message : err,
    );
  }
}

/** 活动汇总 —— 接入台顶部那几个数字 */
export type AgentActivitySummary = {
  /** 总调用次数（当前保留窗口内） */
  totalCalls: number;
  /** 最近一次活跃时间 */
  lastActiveAt: string | null;
  /** 建单次数 */
  ordersCreated: number;
  /** 付款成功次数 */
  ordersPaid: number;
  /** 失败次数 */
  failed: number;
  /** 已支付金额合计 */
  spentAmount: string;
  /** 币种 */
  currency: string;
  /** 进行中的订单（已付款但还没送达） */
  inFlight: number;
};

/**
 * 汇总活动流水 + 该用户的订单。
 *
 * 「已付金额」必须从订单表算而不是从活动流水算 ——
 * 活动里只有「付过了」这个事实，金额是订单的属性。
 */
export function summarizeAgentActivity(
  rows: DbAgentActivity[],
  orders: DbOrder[],
): AgentActivitySummary {
  let ordersCreated = 0;
  let ordersPaid = 0;
  let failed = 0;
  let spent = 0;
  let currency = "USD";
  let inFlight = 0;

  for (const row of rows) {
    if (!row.ok) failed += 1;
    if (row.action === "order.create") ordersCreated += 1;
    if (row.action === "order.pay" && row.ok) ordersPaid += 1;
  }

  for (const order of orders) {
    const quote = (order.quote ?? {}) as Record<string, unknown>;
    if (quote.currency) currency = String(quote.currency);
    if (order.status === "paid") {
      const total = Number(quote.total ?? 0);
      if (Number.isFinite(total)) spent += total;
      const shipment = (order.shipment ?? {}) as Record<string, unknown>;
      if (shipment.status !== "delivered") inFlight += 1;
    }
  }

  return {
    totalCalls: rows.length,
    lastActiveAt: rows.length ? rows[0].createdAt : null,
    ordersCreated,
    ordersPaid,
    failed,
    spentAmount: spent.toFixed(2),
    currency,
    inFlight,
  };
}
