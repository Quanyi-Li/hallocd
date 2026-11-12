/**
 * halloCD · 订单存取（走统一存储层）
 * ==================================================================
 * 现在订单落在数据库里（Postgres）或本地文件（回退），不再是散落的 JSON。
 *
 * 订单身上多了三个业务字段：
 *   userId          —— 下单者（agent 代表用户下的单时是那个用户）
 *   senderHandle    —— 送礼人用户名，个人主页要展示
 *   receiverHandle  —— 收件人用户名（站内收件人）
 *   giftToken       —— 回礼跳转 /r/<token> 的公开凭据
 */

import { randomBytes } from "node:crypto";

import { db, type DbOrder } from "@/lib/db";

export type AgentOrder = DbOrder;

export type AgentDesign = Record<string, unknown>;

export type AgentLetter = Record<string, unknown>;

/** 回礼跳转用的公开 token —— 短、无连字符、便于口述/手输 */
export function buildGiftToken(): string {
  return randomBytes(9).toString("base64url").replace(/[-_]/g, "a").slice(0, 12);
}

export function randomOrderId(): string {
  return "ord_" + randomBytes(8).toString("hex");
}

export type NewOrder = {
  userId: string | null;
  senderHandle: string | null;
  receiverHandle: string | null;
  receiverName: string;
  giftToken: string;
  productId: string;
  quantity: number;
  deliveryDate: string;
  quote: Record<string, unknown>;
  plan: Record<string, unknown>;
  design: AgentDesign;
  letter: AgentLetter;
};

export async function createOrder(input: NewOrder): Promise<AgentOrder> {
  const now = new Date().toISOString();
  const order: AgentOrder = {
    id: randomOrderId(),
    userId: input.userId,
    senderHandle: input.senderHandle,
    receiverHandle: input.receiverHandle,
    receiverName: input.receiverName,
    giftToken: input.giftToken,
    status: "quoted",
    productId: input.productId,
    quantity: input.quantity,
    deliveryDate: input.deliveryDate,
    quote: input.quote,
    plan: input.plan,
    design: input.design,
    letter: input.letter,
    payment: null,
    shipment: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insertOrder(order);
  return order;
}

export async function getOrder(id: string): Promise<AgentOrder | null> {
  return db.findOrderById(id);
}

export async function getOrderByGiftToken(
  token: string,
): Promise<AgentOrder | null> {
  return db.findOrderByGiftToken(token);
}

export async function updateOrder(
  id: string,
  patch: Partial<AgentOrder>,
): Promise<AgentOrder | null> {
  return db.updateOrder(id, patch);
}

export async function listOrders(limit = 50): Promise<AgentOrder[]> {
  return db.listOrders(limit);
}

export async function listOrdersByUser(
  userId: string,
  limit = 50,
): Promise<AgentOrder[]> {
  return db.listOrdersByUser(userId, limit);
}
