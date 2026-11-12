/**
 * halloCD · 客户端直传的「落库确认」
 * ==================================================================
 * 客户端直传的两步协议：
 *
 *   ① POST /api/uploads/direct          → 换一张 client token（限类型、限大小、限时效）
 *   ② 浏览器 PUT 到 Blob                 → 文件直接进对象存储，不经过函数
 *   ③ POST /api/uploads/direct/commit   → 本文件：确认对象真的在，然后把记录写进数据库
 *
 * ------------------------------------------------------------------
 * 第 ③ 步为什么必须回查 Blob，而不是相信客户端：
 *
 *   客户端报上来的 size / mime / name 全都不可信。
 *   我们回 Blob 查一次「这个路径上到底是什么」，
 *   拿到的大小和类型才是真的 —— 这也是防刷的第一道闸。
 *
 *   顺带解决幂等：commit 可以被重复调用（生产环境 Vercel 的
 *   blob.upload-completed 回调也会走这里），已有记录就直接返回。
 */

import { db } from "@/lib/db";
import type { DbUpload } from "@/lib/db/types";
import { blobConfigured, headUploadBlob } from "@/lib/media/blob";
import {
  CLIENT_UPLOAD_MAX_BYTES,
  DIRECT_UPLOAD_CONTENT_TYPES,
  idFromPathname,
  normalizeMime,
  safeUploadName,
} from "@/lib/media/upload-client";

/** 可预期的业务错误 —— 路由层直接翻译成对应的状态码 */
export class CommitError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CommitError";
    this.code = code;
    this.status = status;
  }
}

export type CommitResult = {
  id: string;
  row: DbUpload;
  /** false = 这条记录之前已经落过库（幂等命中） */
  created: boolean;
};

/**
 * 把一个已经躺在 Blob 里的对象登记进数据库。
 *
 * 幂等：同一个 pathname 重复调用只会有一条记录。
 */
export async function commitDirectUpload(opts: {
  pathname: string;
  name?: string;
  userId: string | null;
}): Promise<CommitResult> {
  const id = idFromPathname(opts.pathname);
  if (!id) {
    throw new CommitError(
      "INVALID_PATHNAME",
      `pathname 非法：${opts.pathname}（必须形如 uploads/up_xxxxxxxxxxxxxxxxxxxx.ext）`,
      400,
    );
  }

  /* 幂等：已经登记过就直接返回 */
  const existing = await db.findUpload(id);
  if (existing) return { id, row: existing, created: false };

  if (!blobConfigured()) {
    throw new CommitError(
      "BLOB_NOT_CONFIGURED",
      "对象存储没有配置（BLOB_READ_WRITE_TOKEN 缺失）—— 客户端直传不可用。",
      503,
    );
  }

  const head = await headUploadBlob(opts.pathname);
  if (!head) {
    throw new CommitError(
      "BLOB_OBJECT_NOT_FOUND",
      `对象存储里找不到 ${opts.pathname} —— 上传多半没成功，请重试。`,
      404,
    );
  }
  if (head.pathname !== opts.pathname) {
    throw new CommitError(
      "PATHNAME_MISMATCH",
      "对象存储返回的路径与请求不一致，已拒绝登记。",
      400,
    );
  }
  if (head.size <= 0) {
    throw new CommitError("EMPTY_OBJECT", "上传的对象是空的。", 400);
  }
  if (head.size > CLIENT_UPLOAD_MAX_BYTES) {
    throw new CommitError(
      "FILE_TOO_LARGE",
      `文件太大（${(head.size / 1024 / 1024).toFixed(1)}MB），` +
        `上限 ${(CLIENT_UPLOAD_MAX_BYTES / 1024 / 1024).toFixed(0)}MB。`,
      413,
    );
  }

  const mime = normalizeMime(head.contentType);
  if (!DIRECT_UPLOAD_CONTENT_TYPES.includes(mime)) {
    throw new CommitError(
      "UNSUPPORTED_TYPE",
      `不支持的类型 ${mime}。`,
      415,
    );
  }

  const row: DbUpload = {
    id,
    name: safeUploadName(opts.name ?? id, id),
    mime,
    /* 媒体在对象存储里 —— 数据库不存字节 */
    data: "",
    size: head.size,
    userId: opts.userId,
    createdAt: new Date().toISOString(),
    blobPath: head.pathname,
    blobUrl: head.url,
  };

  await db.insertUpload(row);
  return { id, row, created: true };
}
