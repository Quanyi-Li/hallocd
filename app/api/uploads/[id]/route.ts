/**
 * GET /api/uploads/{id}
 * ------------------------------------------------------------------
 * 取回上传的素材。公开可读（素材本身就是公开作品）。
 *
 * v2.7：媒体搬去对象存储后，这里改成 **302 重定向**到 Blob 的公开 URL ——
 *   · 省一次函数往返（文件直接由 CDN 出）
 *   · 省 Blob 的出网计费（文件不过我们的函数）
 *   · 旧的 base64 记录仍然照常返回字节（数据库里的历史数据不受影响）
 */

import { connection } from "next/server";

import { db } from "@/lib/db";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedGET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();

  const { id } = await params;
  const upload = await db.findUpload(id);

  if (!upload) {
    return new Response("Not found", { status: 404 });
  }

  /* 在对象存储里 → 直接甩给 CDN */
  if (upload.blobUrl) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: upload.blobUrl,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  /* 还在数据库里（没配 Blob 凭据时的回退） */
  const buf = Buffer.from(upload.data, "base64");

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": upload.mime,
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${encodeURIComponent(upload.name)}"`,
    },
  });
}

export const GET = withStorageGuard(__guardedGET);
