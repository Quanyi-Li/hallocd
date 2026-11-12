/**
 * POST /api/uploads
 * ------------------------------------------------------------------
 * 上传 DIY 成品（agent 生成的 SVG / PNG / 音频 / 视频）。
 *
 * 这是「模版 → 用户自己的 agent 去做 → 成果回到平台」这条链路的最后一跳。
 * 有了它，agent 能交付的不只是文字和颜色，还有真的图和声音。
 *
 * ------------------------------------------------------------------
 * v2.7：媒体搬去对象存储
 *
 *   · 配了 Blob 凭据 → 文件进 Vercel Blob，数据库只留路径
 *   · 没配 → 回退到 base64 存库（本地开发照常能跑）
 *
 *   上限 4MB 而不是 8MB：Vercel 函数请求体硬上限 4.5MB，
 *   超过会直接 413 FUNCTION_PAYLOAD_TOO_LARGE，连这段代码都到不了。
 *   **更大的文件走客户端直传** —— POST /api/uploads/direct。
 *
 *   注意：返回的 url 永远是 `/api/uploads/<id>` —— 对 agent 的契约不变。
 */

import { randomUUID } from "node:crypto";
import { connection, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { withStorageGuard } from "@/lib/api/storage-guard";
import {
  SERVER_UPLOAD_MAX_BYTES,
  blobConfigured,
  putUploadBlob,
} from "@/lib/media/blob";

const ALLOWED_PREFIXES = ["image/", "audio/", "video/"];
const ALLOWED_EXACT = ["application/pdf", "text/svg+xml"];

async function __guardedPOST(request: Request) {
  await connection();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_FORM",
        message: "请用 multipart/form-data 上传，字段名 file。",
      },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        success: false,
        error: "MISSING_FILE",
        message: "没有收到文件。表单字段名要是 file。",
      },
      { status: 400 },
    );
  }

  if (file.size > SERVER_UPLOAD_MAX_BYTES) {
    return NextResponse.json(
      {
        success: false,
        error: "FILE_TOO_LARGE",
        message:
          `文件太大（${(file.size / 1024 / 1024).toFixed(1)}MB）。` +
          `这条通道上限 ${(SERVER_UPLOAD_MAX_BYTES / 1024 / 1024).toFixed(0)}MB` +
          `（Vercel 函数请求体硬上限 4.5MB）。更大的文件请走客户端直传` +
          `（POST /api/uploads/direct）。`,
      },
      { status: 413 },
    );
  }

  const mime = file.type || "application/octet-stream";
  const allowed =
    ALLOWED_PREFIXES.some((p) => mime.startsWith(p)) ||
    ALLOWED_EXACT.includes(mime);
  if (!allowed) {
    return NextResponse.json(
      {
        success: false,
        error: "UNSUPPORTED_TYPE",
        message: `不支持的类型 ${mime}。只接受图片（png/jpg/webp/svg）、音频与视频。`,
      },
      { status: 415 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const user = await getCurrentUser();

  const id = `up_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  /* 优先进对象存储；失败或没配凭据就回退到数据库 */
  const blob = await putUploadBlob(id, file.name || id, mime, buf);

  await db.insertUpload({
    id,
    name: file.name || id,
    mime,
    data: blob ? "" : buf.toString("base64"),
    size: file.size,
    userId: user?.id ?? null,
    createdAt: new Date().toISOString(),
    blobPath: blob?.pathname ?? "",
    blobUrl: blob?.url ?? "",
  });

  return NextResponse.json(
    {
      success: true,
      id,
      name: file.name,
      mime,
      size: file.size,
      url: `/api/uploads/${id}`,
      /** 这个文件最终存在哪 —— agent / 前端都靠它判断 */
      storage: blob ? "blob" : "database",
      /** 下单时把这个 url 放进 design 的对应字段 */
      usage: `design 里填 "${id}" 或 "${`/api/uploads/${id}`}"。`,
    },
    { status: 201 },
  );
}

export const POST = withStorageGuard(__guardedPOST);
