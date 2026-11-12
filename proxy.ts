import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";

/**
 * 路由守卫（Next 16 的 proxy）
 * ==================================================================
 * 存在的唯一理由：**404 的状态码**。
 *
 * 背景：项目开着 cacheComponents（Partial Prerender）。
 * 在 PPR 下，响应头会先发出去（200），之后才在流里渲染动态部分。
 * 所以页面里调 notFound() 的结果是「内容是 404 页，状态码却是 200」。
 *
 * 个人主页和回礼页是「按用户名 / token 取数据」的请求期页面，
 * 对不存在的地址必须真的返回 404 —— 在渲染之前拦一道最干脆。
 *
 * 只在这两个路由上生效，其他路径零开销。
 */

export const config = {
  matcher: ["/u/:handle", "/r/:token"],
  // Proxy 固定跑在 Node.js runtime —— 不用也不能声明 runtime
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segment = pathname.split("/")[2] ?? "";

  const exists = pathname.startsWith("/u/")
    ? Boolean(await db.findUserByHandle(segment))
    : Boolean(await db.findOrderByGiftToken(segment));

  if (!exists) {
    // rewrite 到一个必定 notFound() 的页面，同时把状态码改成 404
    return NextResponse.rewrite(new URL("/hallocd-not-found", request.url), {
      status: 404,
    });
  }

  return NextResponse.next();
}
