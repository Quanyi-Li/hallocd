/**
 * @vercel/blob 的类型声明（手写）
 * ==================================================================
 * 装进来的 @vercel/blob@2.9.0 **不带 .d.ts**（dist/ 下只有 .js）。
 * TypeScript 只能靠 allowJs 去猜函数签名 —— 猜出来基本是 any，
 * 于是 `put()` 传错参数、`handleUpload()` 的回调返回结构不对，
 * 全都没人拦得住（只会在运行时报一个莫名其妙的错）。
 *
 * 这里把我们**实际用到的**部分手写出来：
 *   · 字段名与 SDK 源码逐字对齐（对照 node_modules/@vercel/blob/dist）
 *   · 不是 SDK 的完整镜像 —— 用到哪补到哪
 *
 * 注意：这个声明会**遮蔽**包自带的类型（如果将来包补上 .d.ts）。
 * 版本锁在 package.json 里，升级 SDK 时顺手核对一下这里即可。
 */

declare module "@vercel/blob" {
  export interface PutCommandOptions {
    access: "public" | "private";
    addRandomSuffix?: boolean;
    allowOverwrite?: boolean;
    cacheControlMaxAge?: number;
    contentType?: string;
    token?: string;
    signal?: AbortSignal;
  }

  export interface PutBlobResult {
    url: string;
    downloadUrl: string;
    pathname: string;
    contentType: string;
    contentDisposition: string;
    etag: string;
  }

  export interface HeadBlobResult {
    url: string;
    downloadUrl: string;
    pathname: string;
    size: number;
    contentType: string;
    contentDisposition: string;
    cacheControl: string;
    uploadedAt: Date;
    etag: string;
  }

  export function put(
    pathname: string,
    body: string | Blob | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: PutCommandOptions,
  ): Promise<PutBlobResult>;

  export function head(
    urlOrPathname: string,
    options?: { token?: string; signal?: AbortSignal },
  ): Promise<HeadBlobResult>;

  export interface ListBlobResult {
    url: string;
    downloadUrl: string;
    pathname: string;
    size: number;
    uploadedAt: Date;
    etag: string;
  }

  export function list(options?: {
    limit?: number;
    prefix?: string;
    cursor?: string;
    token?: string;
    signal?: AbortSignal;
  }): Promise<{
    cursor: string;
    hasMore: boolean;
    blobs: ListBlobResult[];
  }>;
}

declare module "@vercel/blob/client" {
  export interface ClientUploadOptions {
    /** 我们的 token 签发端点 —— SDK 会 POST 到它换 client token */
    handleUploadUrl: string;
    access: "public" | "private";
    /** 原样带给服务端的自定义载荷（我们用它带 uploadId / 文件名） */
    clientPayload?: unknown;
    contentType?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    onUploadProgress?: (progress: {
      loaded: number;
      total: number;
      percentage: number;
    }) => void;
  }

  export interface ClientUploadResult {
    url: string;
    downloadUrl: string;
    pathname: string;
    contentType: string;
    contentDisposition: string;
    etag: string;
  }

  export function upload(
    pathname: string,
    body: string | Blob | ArrayBuffer | ArrayBufferView | ReadableStream,
    options: ClientUploadOptions,
  ): Promise<ClientUploadResult>;

  export interface HandleUploadEvent {
    type: "blob.generate-client-token" | "blob.upload-completed";
    payload: {
      pathname?: string;
      clientPayload?: unknown;
      multipart?: boolean;
      blob?: {
        url: string;
        downloadUrl: string;
        pathname: string;
        contentType: string;
        contentDisposition: string;
        etag: string;
      };
      tokenPayload?: unknown;
    };
  }

  export interface ClientTokenPayload {
    access: "public" | "private";
    allowedContentTypes?: string[];
    maximumSizeInBytes?: number;
    validUntil?: number;
    addRandomSuffix?: boolean;
    allowOverwrite?: boolean;
    cacheControlMaxAge?: number;
    tokenPayload?: unknown;
    callbackUrl?: string;
  }

  export interface HandleUploadResult {
    type: string;
    clientToken?: string;
    response?: string;
  }

  export function handleUpload(options: {
    token?: string;
    request: Request;
    body: HandleUploadEvent;
    /** 签发 client token 前调用 —— 决定这个 token 能传什么、传多大 */
    onBeforeGenerateToken: (
      pathname: string,
      clientPayload: unknown,
      multipart: boolean | undefined,
    ) => Promise<ClientTokenPayload> | ClientTokenPayload;
    /** 上传完成回调（只有 Vercel 部署下才会被回调） */
    onUploadCompleted?: (event: {
      blob: ClientUploadResult;
      tokenPayload?: unknown;
    }) => Promise<void> | void;
  }): Promise<HandleUploadResult>;
}
