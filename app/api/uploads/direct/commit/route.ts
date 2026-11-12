/**
 * POST /api/uploads/direct/commit
 * ==================================================================
 * 客户端直传的最后一步：把「已经躺在 Blob 里」的对象登记进数据库。
 *
 * 为什么要单独一步：
 *   文件是浏览器直接 PUT 到 Blob 的，我们的函数压根没见过那些字节。
 *   订单要靠一个稳定的引用（/api/uploads/<id>）才能真的做出那张 CD，
 *   所以必须有一个「文件确实在那儿」的确认动作 —— 同时也是入库的时机。
 *
 * 幂等：
 *   · 客户端可能重复调（网络重试）
 *   · 生产环境 Vercel 的 blob.upload-completed 回调也会走同一套逻辑
 *   → 同一个 pathname 只会产生一条记录
 *
 * 返回结构与 POST /api/uploads **完全一致** ——
 * 对 agent 和前端来说，直传和中转是同一条链路。
 */

import { connection, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { withStorageGuard } from "@/lib/api/storage-guard";
import { CommitError, commitDirectUpload } from "@/lib/media/commit";

async function __guardedPOST(request: Request) {
  await connection();

  let body: { pathname?: unknown; name?: unknown };
  try {
    body = (await request.json()) as { pathname?: unknown; name?: unknown };
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_JSON",
        message: "请求体必须是 JSON。",
      },
      { status: 400 },
    );
  }

  if (typeof body?.pathname !== "string" || !body.pathname) {
    return NextResponse.json(
      {
        success: false,
        error: "MISSING_PATHNAME",
        message: "缺少 pathname（对象存储里的路径）。",
      },
      { status: 400 },
    );
  }

  const user = await getCurrentUser();

  try {
    const result = await commitDirectUpload({
      pathname: body.pathname,
      name: typeof body.name === "string" ? body.name : undefined,
      userId: user?.id ?? null,
    });

    return NextResponse.json(
      {
        success: true,
        id: result.id,
        name: result.row.name,
        mime: result.row.mime,
        size: result.row.size,
        url: `/api/uploads/${result.id}`,
        storage: "blob",
        /** false = 之前已经登记过（幂等命中） */
        created: result.created,
        usage: `design 里填 "${result.id}" 或 "/api/uploads/${result.id}"。`,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (err) {
    if (err instanceof CommitError) {
      return NextResponse.json(
        {
          success: false,
          error: err.code,
          message: err.message,
        },
        { status: err.status },
      );
    }
    throw err;
  }
}

export const POST = withStorageGuard(__guardedPOST);
