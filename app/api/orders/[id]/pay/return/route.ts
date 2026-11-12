/**
 * GET /api/orders/[id]/pay/return
 * ------------------------------------------------------------------
 * PayPal 回跳地址（v2.11 直付）。
 *
 * 用户在 PayPal 上点完「确认付款」，PayPal 就把浏览器送到这里，
 * 并在查询串里附上 `token=<PayPal 单号>`。
 *
 * 这一步做三件事：
 *   ① 确认用户批准的那张 PayPal 单**正是我们为这一单建的那张**
 *      （payOrderApproved 内部会核对 —— 不核对的话，
 *       任何人拿自己的一张 PayPal 单过来，我们就会替他 capture）
 *   ② capture 掉这张已批准的 PayPal 单 → 落库、生成运单、发发货通知
 *   ③ 把浏览器送回 /make?paid=1，让页面显示运单号和回礼链接
 *
 * 为什么是 GET：PayPal 的回跳就是一次顶级导航。
 * 扣款本身不会重复 —— PayPal 对同一张单重复 capture 会回
 * ORDER_ALREADY_CAPTURED，我们按「已扣成功」处理。
 *
 * 【v2.13】这一条**不要求登录**：
 *   网页端结账强制先登录（建单 / 查单 / 付款都要求会话），
 *   但走到这一步说明这一单早就过了登录闸门 —— 用户在 PayPal 上
 *   点了「确认付款」，钱已经授权了，这时再把人拦在门外，
 *   等于让用户白付一次。所以这里只认「这张 PayPal 单是不是我们为这一单建的」
 *   （payOrderApproved 内部逐字比对），不认会话。
 */

import { connection, NextResponse } from "next/server";

import { payOrderApproved } from "@/lib/agent/agentPlatform";
import { withStorageGuard } from "@/lib/api/storage-guard";

type Ctx = { params: Promise<{ id: string }> };

async function __guardedGET(request: Request, context: Ctx) {
  await connection();

  const { id } = await context.params;
  const url = new URL(request.url);
  const origin = url.origin;

  /* PayPal 附带的 token = 用户批准的那张 PayPal 单号 */
  const paypalOrderId = url.searchParams.get("token") ?? "";

  const back = (query: string) =>
    NextResponse.redirect(new URL(`/make?${query}#checkout`, origin), 302);

  if (!paypalOrderId) {
    return back(`payError=MISSING_TOKEN&order=${encodeURIComponent(id)}`);
  }

  const result = await payOrderApproved(id, paypalOrderId);

  if (!result.ok) {
    return back(
      `payError=${encodeURIComponent(result.error.error)}&order=${encodeURIComponent(id)}`,
    );
  }

  return back(`paid=1&order=${encodeURIComponent(id)}`);
}

export const GET = withStorageGuard(__guardedGET);
