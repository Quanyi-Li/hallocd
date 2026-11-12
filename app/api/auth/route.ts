/**
 * /api/auth
 * ------------------------------------------------------------------
 * 「当前用户」的简写入口。完整实现在 /api/auth/me。
 *
 *   GET    —— 读自己
 *   PATCH  —— 改自己的资料
 *   POST   —— 登出（等价于 POST /api/auth/logout）
 */

export { GET, PATCH } from "./me/route";
export { POST } from "./logout/route";
