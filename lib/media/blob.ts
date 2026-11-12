/**
 * halloCD · 媒体对象存储（Vercel Blob）—— 服务端
 * ==================================================================
 * 为什么把媒体搬出数据库：
 *
 *   以前上传的录音 / 贴图是 base64 塞进 uploads.data（TEXT 列）：
 *     · base64 膨胀 33%（8MB 文件 → 10.9MB 文本）
 *     · 数据库被媒体撑爆，备份变慢、计费变贵
 *
 *   搬进对象存储后，数据库只留几十字节的路径 + 公开 URL。
 *
 * ------------------------------------------------------------------
 * 两条通道（**这是被 Vercel 的 4.5MB 请求体硬限逼出来的**）：
 *
 *   · 小文件（≤ 4MB）：服务端中转 —— POST /api/uploads
 *     Vercel 函数请求体上限 4.5MB，超过直接返回 413 FUNCTION_PAYLOAD_TOO_LARGE，
 *     连我们的代码都到不了。所以阈值必须比 4.5MB 小，留出 multipart 的开销。
 *
 *   · 大文件（> 4MB）：客户端直传 —— POST /api/uploads/direct
 *     文件从浏览器/agent 直接进 Blob，**不经过函数**，因此没有体积上限。
 *
 * ------------------------------------------------------------------
 * 没配凭据时全部回退到 base64 存库：
 *   · 本地开发照常能跑（不需要任何云服务）
 *   · 但媒体仍在数据库里 —— health 端点与 preflight 会明确提示
 *
 * ------------------------------------------------------------------
 * 常量都在 lib/media/upload-client.ts —— 那个文件不依赖任何服务端 SDK，
 * 浏览器端也能安全 import（否则 @vercel/blob 会被打进客户端 bundle）。
 */

import { head, list, put } from "@vercel/blob";

import {
  BLOB_DIR,
  CLIENT_UPLOAD_MAX_BYTES,
  SERVER_UPLOAD_MAX_BYTES,
  UPLOAD_ID_RE,
  blobPathname,
  extOf,
  idFromPathname,
} from "@/lib/media/upload-client";

/* 常量与纯函数统一住在这里 —— 服务端从 upload-client.ts 转出去，
   浏览器端直接 import upload-client.ts，两边永远同源。 */
export {
  BLOB_DIR,
  CLIENT_UPLOAD_MAX_BYTES,
  SERVER_UPLOAD_MAX_BYTES,
  UPLOAD_ID_RE,
  blobPathname,
  extOf,
  idFromPathname,
} from "@/lib/media/upload-client";

export type BlobUpload = {
  /** 公开 URL（素材本身是公开作品） */
  url: string;
  /** Blob 内路径 */
  pathname: string;
};

export type BlobHead = {
  url: string;
  pathname: string;
  size: number;
  contentType: string;
  etag: string;
};

/**
 * 有没有配 Blob 凭据？
 *
 * 两种认证方式：
 *   · BLOB_READ_WRITE_TOKEN —— 静态长时 token（Vercel 控制台给）
 *   · VERCEL_OIDC_TOKEN + BLOB_STORE_ID —— Vercel 自动注入的短期凭据
 */
export function blobConfigured(): boolean {
  if (process.env.BLOB_READ_WRITE_TOKEN) return true;
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) return true;
  return false;
}

/**
 * 能不能做「客户端直传」？
 *
 * 直传要签发 client token，SDK 要求**静态** read-write token
 * （OIDC 的短期凭据签不了）。所以没有 BLOB_READ_WRITE_TOKEN 时，
 * 大文件通道不可用 —— 这一点要在报错里说清楚。
 */
export function blobClientTokenCapable(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Blob store id。
 *
 * SDK 的 parseStoreIdFromReadWriteToken 是 `token.split("_")[3]`，
 * 对应 token 形如 `vercel_blob_rw_<storeId>`（四段）。
 * 我们要自己算 store id（拼公开 URL、给客户端 PUT 用）时也走这一套。
 */
export function blobStoreId(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return process.env.BLOB_STORE_ID || null;
  const parts = token.split("_");
  return parts[3] || null;
}

/**
 * 服务端上传到 Blob。
 *
 * 失败返回 null —— 调用方回退到 base64 存库，
 * 而不是让整个上传 500（媒体存不进去不该等于「下单失败」）。
 */
export async function putUploadBlob(
  id: string,
  name: string,
  mime: string,
  body: Buffer,
): Promise<BlobUpload | null> {
  if (!blobConfigured()) return null;
  try {
    const pathname = blobPathname(id, name);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const result = await put(pathname, body, {
      access: "public",
      addRandomSuffix: false,
      contentType: mime,
      ...(token ? { token } : {}),
    });
    return { url: result.url, pathname: result.pathname };
  } catch (err) {
    console.warn(
      `[media] Blob 上传失败，回退到数据库存储：${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/**
 * 查一个 Blob 对象的真实信息（大小 / 类型 / URL）。
 *
 * 客户端直传完成后，服务端**不信任客户端报的大小**，
 * 而是回头问 Blob「这个路径上到底是什么」——
 * 这是 commit 环节唯一可信的数据源。
 */
export async function headUploadBlob(
  pathname: string,
): Promise<BlobHead | null> {
  if (!blobConfigured()) return null;
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const res = await head(pathname, token ? { token } : {});
    return {
      url: res.url,
      pathname: res.pathname,
      size: res.size,
      contentType: res.contentType,
      etag: res.etag,
    };
  } catch (err) {
    console.warn(
      `[media] Blob 查询失败（${pathname}）：${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 探一次对象存储 —— 给部署就绪自检用
 * ------------------------------------------------------------------ */

export type MediaProbeResult = {
  ok: boolean;
  /** 媒体现在实际存在哪：blob = 对象存储；database = 退回数据库 base64 */
  storage: "blob" | "database";
  error?: string;
  ms?: number;
};

const MEDIA_PROBE_TTL_MS = 30_000;
let mediaProbeCache: { at: number; result: Promise<MediaProbeResult> } | null = null;

/**
 * 探一次对象存储。
 *
 * 「配了 BLOB_READ_WRITE_TOKEN」≠「能用」——
 * 令牌过期、store 被删、权限不对，都会表现成上传时才报错。
 * 这里用一次只读的 list（limit=1）验证鉴权通不通，
 * 不消耗上传配额。结果缓存 30 秒（health 可能被高频调用）。
 */
export async function probeMedia(): Promise<MediaProbeResult> {
  if (!blobConfigured()) {
    return {
      ok: false,
      storage: "database",
      error:
        "未配置对象存储凭据 —— 媒体退回数据库 base64 存储（单文件 4MB 上限）",
    };
  }

  const now = Date.now();
  if (mediaProbeCache && now - mediaProbeCache.at < MEDIA_PROBE_TTL_MS) {
    return mediaProbeCache.result;
  }

  const started = Date.now();
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const result = list({ limit: 1, ...(token ? { token } : {}) })
    .then(() => ({
      ok: true,
      storage: "blob" as const,
      ms: Date.now() - started,
    }))
    .catch((err) => ({
      ok: false,
      storage: "blob" as const,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - started,
    }));

  mediaProbeCache = { at: now, result };
  return result;
}
