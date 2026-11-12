/**
 * halloCD · 存储不可用守卫
 * ==================================================================
 * 为什么需要它：
 *
 * Vercel 这类平台的容器文件系统是**只读**的（只有 /tmp 可写）。
 * 漏配 DATABASE_URL 时，文件后端落不了盘 ——
 * 而如果直接抛出去，Next.js 会回一个**空的 500**，
 * 部署方看到的是「注册接口报 500」，日志里是一行 ENOTDIR，谁也不知道要去配数据库。
 *
 * 更糟的是「静默错」：读路径把 ENOENT 之外的错误也当成「空集合」的话，
 * 线上会表现成「订单查不到 / 注册成功但登不进去」—— 那是最难查的一类问题。
 *
 * 所以：
 *   · lib/db/file.ts 不再吞掉非 ENOENT 的读错误
 *   · lib/db/index.ts 在文件后端不可写时直接拒绝启动（而不是等用户注册时才发现）
 *   · 本文件把所有路由的存储异常翻译成一条能照着做的 503
 *
 * 503 而不是 500：这是**配置问题**，不是代码 bug。
 */

import { NextResponse } from "next/server";

/** 机器可读错误码 —— 前端与 agent 都能靠它做分支 */
export const STORAGE_UNAVAILABLE = "STORAGE_UNAVAILABLE";

/** 数据库不可达时的错误码（区别于「文件系统不可写」） */
export const DATABASE_UNREACHABLE = "DATABASE_UNREACHABLE";

/** 文件系统类错误码（跨平台大致一致） */
const FS_ERROR_CODES = new Set([
  "EROFS", // read-only file system
  "EACCES", // permission denied
  "ENOSPC", // no space left on device
  "ENOTDIR", // path component is not a directory
  "EISDIR", // illegal operation on a directory
  "EMFILE", // too many open files
  "ENFILE",
]);

/**
 * 数据库连接类错误码。
 *
 * `ERR_INVALID_URL` 也在里面：驱动把 `postgresql://host/db` 映射成
 * `https://host/sql`，而 **IPv4 字面量会被它改写**（127.0.0.1 → api.0.0.1），
 * 于是 URL 合法但 endpoint 不合法 —— 这同样属于「配错了」。
 */
const DB_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
  "ERR_INVALID_URL",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
]);

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: unknown }).code ?? "");
  }
  return "";
}

/**
 * 把一个异常链上的所有 code 与 message 收集起来。
 *
 * 为什么不能只看最外层：Neon 驱动抛出的最外层对象没有 code，
 * 真正的 `ECONNREFUSED` 藏在 `cause.sourceError` 下面两三层。
 */
function collectErrorFacts(
  err: unknown,
  depth = 0,
): { codes: string[]; messages: string[] } {
  const codes: string[] = [];
  const messages: string[] = [];
  if (!err || depth > 6) return { codes, messages };

  if (err instanceof Error) {
    messages.push(err.message);
    const code = errorCode(err);
    if (code) codes.push(code);

    for (const nested of [
      (err as { cause?: unknown }).cause,
      (err as { sourceError?: unknown }).sourceError,
    ]) {
      if (!nested || nested === err) continue;
      const sub = collectErrorFacts(nested, depth + 1);
      codes.push(...sub.codes);
      messages.push(...sub.messages);
    }
  }
  return { codes, messages };
}

/**
 * 判断一个异常是不是「数据库连不上」。
 *
 * 典型场景：
 *   · `DATABASE_URL` 指向 Supabase / RDS（只有 TCP:5432，驱动走 HTTP /sql）
 *   · URL 里的 host 写成了 IPv4 字面量（被驱动改写成 api.x.x.x）
 *   · 出网被防火墙拦 / DNS 解析不了 / 证书链不对
 *
 * 这些都会让「配了 DATABASE_URL」变成一句空话 —— 必须在接口层说清楚。
 */
export function isDatabaseUnreachable(err: unknown): boolean {
  const { codes, messages } = collectErrorFacts(err);
  if (codes.some((c) => DB_NETWORK_CODES.has(c))) return true;
  /* 驱动把底层网络错误统一包成 "fetch failed" */
  if (messages.some((m) => /fetch failed/i.test(m))) return true;
  return false;
}

/**
 * 判断一个异常是不是「存储不可用」（文件系统侧）。
 *
 * 两种来源：
 *   1. lib/db/index.ts 的 storageUnavailable() —— 主动拒绝启动（带明确提示）
 *   2. lib/db/file.ts 的 explain() —— 具体的 I/O 失败（EROFS / EACCES / …）
 */
export function isStorageUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.message.includes("halloCD 存储不可用")) return true;
  if (FS_ERROR_CODES.has(errorCode(err))) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && cause !== err) return isStorageUnavailable(cause);
  return false;
}

/** 统一的 503 响应体 */
export function storageErrorResponse(err: unknown): NextResponse {
  const detail =
    err instanceof Error ? err.message : "存储后端不可用（未知原因）。";
  return NextResponse.json(
    {
      success: false,
      error: STORAGE_UNAVAILABLE,
      message:
        "存储后端不可用 —— 订单与账号无法落库。这是部署配置问题，不是你的操作有误。",
      detail,
      hint:
        "生产环境必须配置 DATABASE_URL（Neon 兼容的 HTTP /sql 端点）。" +
        "Vercel 等平台的容器文件系统是只读的，文件后端只能用于本地开发。",
    },
    { status: 503 },
  );
}

/** 数据库连不上时的 503（带 Retry-After —— 这是可重试的临时故障） */
export function databaseUnreachableResponse(err: unknown): NextResponse {
  const { codes, messages } = collectErrorFacts(err);
  const detail =
    messages.find((m) => m && m !== "fetch failed") ??
    (err instanceof Error ? err.message : "未知原因");
  const code = codes.find((c) => DB_NETWORK_CODES.has(c));
  return NextResponse.json(
    {
      success: false,
      error: DATABASE_UNREACHABLE,
      message:
        "数据库连不上 —— 订单与账号无法落库。这是部署配置或网络问题，不是你的操作有误。",
      detail,
      code: code ?? null,
      hint:
        "逐条排查：" +
        "① DATABASE_URL 是否是 Neon 兼容的 HTTP /sql 端点（Neon / Vercel Postgres ✅；Supabase / RDS ❌ 只有 TCP）；" +
        "② host 写的是域名还是 IPv4 字面量（驱动会把 127.0.0.1 改写成 api.0.0.1）；" +
        "③ 出网是否被防火墙拦（Neon 默认允许）；" +
        "④ 跑 node scripts/preflight.mjs 可以直接看到是哪一环。",
    },
    { status: 503, headers: { "Retry-After": "30" } },
  );
}

/**
 * 给 API 路由套上守卫。
 *
 * 用法（每个路由两行改动）：
 *   export const POST = withStorageGuard(async (request) => { ...原逻辑... });
 *
 * 只拦截「存储/数据库不可用」这一类错误，其余异常照常抛出 ——
 * 免得把真正的 bug 也伪装成 503。
 */
export function withStorageGuard<A extends unknown[], C>(
  handler: (request: Request, context: C, ...rest: A) => Promise<Response>,
): (request: Request, context: C, ...rest: A) => Promise<Response> {
  return async (request: Request, context: C, ...rest: A) => {
    try {
      return await handler(request, context, ...rest);
    } catch (err) {
      if (isDatabaseUnreachable(err)) return databaseUnreachableResponse(err);
      if (isStorageUnavailable(err)) return storageErrorResponse(err);
      throw err;
    }
  };
}
