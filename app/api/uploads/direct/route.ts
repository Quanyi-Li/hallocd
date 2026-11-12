/**
 * POST /api/uploads/direct
 * ==================================================================
 * 客户端直传通道 —— **文件不经过 Vercel 函数**。
 *
 * 为什么需要这条通道：
 *   Vercel Functions 的请求体硬上限是 4.5MB，超过直接 413。
 *   也就是说一条 8MB 的视频，根本到不了我们的代码。
 *   直传通道让浏览器直接 PUT 到 Blob，函数只负责「签一张通行证」。
 *
 * ------------------------------------------------------------------
 * 协议（Vercel Blob 的标准 client-token 流程）：
 *
 *   ① 浏览器 POST 这里：
 *        { type: "blob.generate-client-token",
 *          payload: { pathname, clientPayload: { uploadId, name }, multipart: false } }
 *      → 我们回 { type, clientToken }
 *
 *   ② 浏览器拿 clientToken 直接 PUT 到 Blob 的 API
 *      （@vercel/blob/client 的 upload() 会自动做这一步）
 *
 *   ③ 浏览器 POST /api/uploads/direct/commit 落库
 *
 * ------------------------------------------------------------------
 * 签发出去的 token 带了四道闸：
 *   · allowedContentTypes —— 只收白名单里的类型
 *   · maximumSizeInBytes  —— 单文件上限
 *   · validUntil          —— 15 分钟过期
 *   · allowOverwrite:false—— 不许覆盖已存在的对象（防抢 id）
 */

import { connection, NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";

import { getCurrentUser } from "@/lib/auth/session";
import { withStorageGuard } from "@/lib/api/storage-guard";
import { blobClientTokenCapable } from "@/lib/media/blob";
import { commitDirectUpload } from "@/lib/media/commit";
import {
  CLIENT_UPLOAD_MAX_BYTES,
  DIRECT_UPLOAD_CONTENT_TYPES,
  idFromPathname,
} from "@/lib/media/upload-client";

/**
 * 上传完成回调。
 *
 * 只有部署在 Vercel 上才有意义 —— 平台会拿签名回调我们的路由。
 * 本地开发没有回调，commit 步骤由客户端显式调用。
 * 不传这个回调时 SDK 不会去找 callbackUrl，所以本地不会有告警噪音。
 */
async function onUploadCompleted(event: {
  blob?: { pathname?: string };
  tokenPayload?: unknown;
}): Promise<void> {
  const pathname = event.blob?.pathname;
  if (!pathname) return;
  const tokenPayload = event.tokenPayload as
    | { uploadId?: string; name?: string }
    | undefined;
  try {
    const user = await getCurrentUser();
    await commitDirectUpload({
      pathname,
      name: tokenPayload?.name,
      userId: user?.id ?? null,
    });
  } catch (err) {
    console.warn(
      `[media] 上传回调落库失败（${pathname}）：${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function __guardedPOST(request: Request) {
  await connection();

  if (!blobClientTokenCapable()) {
    return NextResponse.json(
      {
        success: false,
        error: "BLOB_DIRECT_UNAVAILABLE",
        message:
          "客户端直传不可用 —— 没有 BLOB_READ_WRITE_TOKEN（直传要签 client token，只能用静态读写凭据）。",
        hint:
          "在 Vercel 上给项目接一个 Blob store（Store access 选 Public），" +
          "BLOB_READ_WRITE_TOKEN 会自动注入；" +
          "没配的话媒体会退回数据库 base64（受 4MB 限制）。",
      },
      { status: 501 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
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

  const type = (body as { type?: unknown } | null)?.type;
  if (type !== "blob.generate-client-token" && type !== "blob.upload-completed") {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_EVENT",
        message: `不认识的事件类型 ${String(type)}。`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await handleUpload({
      body: body as Parameters<typeof handleUpload>[0]["body"],
      request,
      onBeforeGenerateToken: (pathname, clientPayload) => {
        const id = idFromPathname(pathname);
        if (!id) {
          throw new Error(
            `pathname 非法：${pathname}（必须形如 uploads/up_xxxxxxxxxxxxxxxxxxxx.ext）`,
          );
        }
        const payload = (clientPayload ?? {}) as {
          uploadId?: unknown;
          name?: unknown;
        };
        if (typeof payload.uploadId === "string" && payload.uploadId !== id) {
          throw new Error("uploadId 与 pathname 对不上，已拒绝签发。");
        }
        return {
          /* 与客户端 upload({ access: "public" }) 保持一致 —— Blob 会校验
             PUT 时的 x-vercel-blob-access 与 token 里的 access 是否相符 */
          access: "public",
          allowedContentTypes: DIRECT_UPLOAD_CONTENT_TYPES,
          maximumSizeInBytes: CLIENT_UPLOAD_MAX_BYTES,
          validUntil: Date.now() + 15 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 31536000,
          tokenPayload: {
            uploadId: id,
            name: typeof payload.name === "string" ? payload.name : id,
          },
        };
      },
      onUploadCompleted:
        process.env.VERCEL === "1" ? onUploadCompleted : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: "BLOB_TOKEN_FAILED",
        message: message || "签发 client token 失败。",
      },
      { status: 400 },
    );
  }
}

export const POST = withStorageGuard(__guardedPOST);
