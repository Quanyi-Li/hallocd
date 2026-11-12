/**
 * halloCD · 媒体上传的共享常量与纯函数
 * ==================================================================
 * 这个文件**不 import 任何服务端 SDK**。
 *
 * 原因：它同时被浏览器端（components/RecordStudio.tsx）
 * 和服务端（lib/media/blob.ts）使用 ——
 * 如果把常量写在服务端模块里，浏览器一 import 就把
 * @vercel/blob 整个打进客户端 bundle（几万行 + Node 专用依赖）。
 *
 * 所以规矩是：**阈值和协议常量只有这一份**，
 * 两边都从这里取，绝不各写一份 —— 否则早晚对不上，
 * 表现就是「前端以为走了直传、后端按中转处理」这种阴间 bug。
 */

/** Blob 里的目录前缀 */
export const BLOB_DIR = "uploads";

/**
 * 服务端中转通道的上限（字节）。必须 < 4.5MB，否则 Vercel 直接 413。
 * 4.5MB 是 Vercel Functions 的请求体硬上限，超过返回 FUNCTION_PAYLOAD_TOO_LARGE。
 */
export const SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/**
 * 客户端直传通道的上限（字节）。
 * Blob 单文件最大 5TB；这里给个保守值，避免有人把视频整盘传上来。
 */
export const CLIENT_UPLOAD_MAX_BYTES = 200 * 1024 * 1024;

/** 上传 id 的格式：up_ + 20 位小写十六进制 */
export const UPLOAD_ID_RE = /^up_[a-z0-9]{20}$/;

/** 服务端中转通道接受的前缀（image/ audio/ video/） */
export const UPLOAD_MIME_PREFIXES = ["image/", "audio/", "video/"];

/** 服务端中转通道接受的精确类型 */
export const UPLOAD_MIME_EXACT = ["application/pdf", "text/svg+xml"];

/**
 * 客户端直传通道允许的 content type（**精确匹配**，不是前缀）。
 *
 * 为什么必须是精确列表：
 *   · client token 里带 allowedContentTypes，Blob 服务端会逐字校验
 *   · 这同时是一道白名单 —— 不接受 html/svg+xml 之外的可执行内容
 *
 * 注意 MediaRecorder 的音频类型是 `audio/webm;codecs=opus` 这种带参数的，
 * 传之前要用 normalizeMime() 把参数剥掉。
 */
export const DIRECT_UPLOAD_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-m4a",
  "audio/aac",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "application/pdf",
  "text/plain",
];

/**
 * 剥掉 mime 里的参数部分。
 *
 *   "audio/webm;codecs=opus" → "audio/webm"
 *   "video/mp4"              → "video/mp4"
 *
 * 为什么必须剥：Blob 的 allowedContentTypes 是精确匹配，
 * 而浏览器给 MediaRecorder 产出的 blob 一定带 codecs 参数。
 */
export function normalizeMime(mime: string): string {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  return base || "application/octet-stream";
}

/** 服务端中转通道：这个类型收不收？ */
export function mimeAllowed(mime: string): boolean {
  const base = normalizeMime(mime);
  return (
    UPLOAD_MIME_PREFIXES.some((p) => base.startsWith(p)) ||
    UPLOAD_MIME_EXACT.includes(base)
  );
}

/** 客户端直传通道：这个类型能不能进 allowedContentTypes 白名单？ */
export function directMimeAllowed(mime: string): boolean {
  return DIRECT_UPLOAD_CONTENT_TYPES.includes(normalizeMime(mime));
}

/** 从文件名取扩展名（只保留安全字符） */
export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  return m ? `.${m[1].toLowerCase()}` : "";
}

/**
 * 生成一个上传 id：up_ + 20 位十六进制。
 *
 * 浏览器和 Node 都有 globalThis.crypto.getRandomValues，
 * 所以这个函数两边都能用（客户端也走直传，需要自己造 id）。
 */
export function randomUploadId(): string {
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `up_${hex}`;
}

/** 拼出 Blob 里的 pathname —— 用上传 id 做主键，重名不会互相覆盖 */
export function blobPathname(id: string, name: string): string {
  return `${BLOB_DIR}/${id}${extOf(name)}`;
}

/**
 * 从 pathname 反推上传 id。
 * 只认我们自己的目录 + id 格式 —— 别人传什么路径都不认。
 */
export function idFromPathname(pathname: string): string | null {
  if (!pathname.startsWith(`${BLOB_DIR}/`)) return null;
  const rest = pathname.slice(BLOB_DIR.length + 1);
  const id = rest.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  return UPLOAD_ID_RE.test(id) ? id : null;
}

/**
 * 把客户端传上来的文件名收拾干净。
 *
 * 客户端直传时，文件名是客户端自己给的 —— 不可信。
 * 这里去掉目录成分、控制字符，并限制长度。
 */
export function safeUploadName(name: string, fallback: string): string {
  const base = (name || "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 100);
  return base || fallback;
}
