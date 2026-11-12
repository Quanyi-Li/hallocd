import { notFound } from "next/navigation";

/**
 * 404 占位页
 * ------------------------------------------------------------------
 * 由 proxy.ts 在「用户名 / token 不存在」时 rewrite 到这里，
 * 并把响应状态码覆盖成 404。
 *
 * 这个路由本身也必须返回 404（所以直接调 notFound()）。
 */

export default function HalloCdNotFound() {
  notFound();
}
