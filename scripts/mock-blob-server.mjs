#!/usr/bin/env node
/**
 * halloCD · Vercel Blob API 本地模拟器
 * ==================================================================
 * 为什么需要它：
 *   对象存储那套（client token 签发 → 浏览器直传 → 回查落库）
 *   牵涉签名、HTTP 头、时序，光靠 mock 函数测不出真问题。
 *
 *   而真的连 Vercel 又有两个麻烦：
 *     · 要真凭据，而且每测一次就消耗一次「上传」配额
 *     · 上传次数（Hobby 只有 2000 次/月）扛不住反复回归
 *
 * 所以本地起一个**协议级**的假 Blob：
 *   · 真的校验 client token 的 HMAC 签名（不是摆设）
 *   · 真的校验 pathname / 大小 / 类型 / 覆盖标志
 *   · 真的按 SDK 的协议回 JSON
 *
 * 覆盖的 SDK 行为（对照 @vercel/blob 2.9.0 源码）：
 *   PUT  /?pathname=...   上传        → {url, downloadUrl, pathname, contentType, contentDisposition, etag}
 *   GET  /?url=...         head 查询   → {..., size, uploadedAt, cacheControl}
 *   GET  /?limit=1         列表（只读，不消耗上传配额）
 *
 * 用法：
 *   node scripts/mock-blob-server.mjs --port=3999
 *   （也可以被别的脚本 import：createMockBlobServer / startMockBlobServer）
 */

import crypto from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

/** 默认读写令牌（本地测试用；格式必须与 Vercel 一致：四段） */
export const DEFAULT_TOKEN = "vercel_blob_rw_localteststore0001";

/** 从读写令牌里取 store id —— SDK 的 parseStoreIdFromReadWriteToken 就是 token.split("_")[3] */
export function storeIdFromToken(token) {
  return String(token || "").split("_")[3] || "";
}

/**
 * 校验 client token。
 *
 * client token 的结构（SDK 的 generateClientTokenFromReadWriteToken）：
 *   vercel_blob_client_<storeId>_<base64(`${hmacHex}.${base64(payloadJson)}`)>
 *
 * 其中 hmacHex = HMAC-SHA256(rwToken, base64PayloadJson) 的十六进制。
 * 签名覆盖整个 payload —— 也就是说类型白名单、大小上限、有效期、pathname
 * 全都被签进去了，改一个字节就过不了这一关。
 */
export function verifyClientToken(token, rwToken) {
  if (!token || !token.startsWith("vercel_blob_client_")) return null;
  const parts = token.split("_");
  const storeId = parts[3] || "";
  const encoded = parts[4] || "";
  if (!encoded) return null;

  let raw;
  try {
    raw = Buffer.from(encoded, "base64").toString();
  } catch {
    return null;
  }
  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const signature = raw.slice(0, dot);
  const payloadB64 = raw.slice(dot + 1);

  const expected = crypto
    .createHmac("sha256", rwToken)
    .update(payloadB64)
    .digest("hex");
  if (signature !== expected) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64").toString());
  } catch {
    return null;
  }
  return { storeId, payload };
}

/**
 * 起一个假 Blob 服务。
 *
 * @param {{token?: string, port?: number, host?: string}} options
 */
export function createMockBlobServer(options = {}) {
  const token = options.token || process.env.BLOB_READ_WRITE_TOKEN || DEFAULT_TOKEN;
  const storeId = storeIdFromToken(token);

  /** pathname → {body, contentType, etag, uploadedAt, size} */
  const objects = new Map();

  /* --- CORS：浏览器直传是跨源 PUT，必须先过预检 --- */
  const CORS_HEADERS = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
    "access-control-allow-headers": "*",
    "access-control-expose-headers": "*",
    "access-control-max-age": "86400",
  };

  const publicUrl = (pathname) =>
    `https://${storeId}.public.blob.vercel-storage.com/${pathname}`;

  const send = (res, status, payload) => {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      ...CORS_HEADERS,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });
    res.end(body);
  };

  const fail = (res, status, code, message) =>
    send(res, status, { error: { code, message } });

  const readBody = async (req) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    return Buffer.concat(chunks);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");

    /* --- CORS：浏览器直传是跨源 PUT，必须先过预检 --- */
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }

    /* --- 测试专用：看一眼存了什么 --- */
    if (url.pathname === "/__mock/objects") {
      const list = [...objects.entries()].map(([pathname, obj]) => ({
        pathname,
        size: obj.size,
        contentType: obj.contentType,
        etag: obj.etag,
        uploadedAt: obj.uploadedAt,
      }));
      return send(res, 200, { storeId, objects: list });
    }

    const auth = String(req.headers.authorization || "").replace(
      /^Bearer\s+/i,
      "",
    );

    /* ---------- 上传 ---------- */
    if (req.method === "PUT" && url.searchParams.has("pathname")) {
      const pathname = url.searchParams.get("pathname") || "";
      const contentType =
        req.headers["x-content-type"] || "application/octet-stream";
      const body = await readBody(req);

      if (!pathname) {
        return fail(res, 400, "invalid_request", "pathname is required");
      }

      let claims = null;
      if (auth.startsWith("vercel_blob_client_")) {
        claims = verifyClientToken(auth, token);
        if (!claims) {
          return fail(res, 401, "unauthorized", "Invalid client token");
        }
        const p = claims.payload || {};
        if (p.validUntil && Date.now() > Number(p.validUntil)) {
          return fail(res, 403, "client_token_expired", "Token expired");
        }
        if (p.pathname && p.pathname !== pathname) {
          return fail(
            res,
            400,
            "client_token_pathname_mismatch",
            'The "pathname" does not match the token payload',
          );
        }
        if (
          p.maximumSizeInBytes != null &&
          body.length > Number(p.maximumSizeInBytes)
        ) {
          return fail(
            res,
            413,
            "file_too_large",
            "The file length exceeds the maximum allowed size",
          );
        }
        if (
          Array.isArray(p.allowedContentTypes) &&
          p.allowedContentTypes.length > 0 &&
          !p.allowedContentTypes.includes(contentType)
        ) {
          return fail(
            res,
            415,
            "content_type_not_allowed",
            `The contentType "${contentType}" is not allowed`,
          );
        }
        if (p.access && req.headers["x-vercel-blob-access"] !== p.access) {
          return fail(
            res,
            400,
            "access_mismatch",
            "The access of the request does not match the token payload",
          );
        }
      } else if (auth !== token) {
        return fail(res, 401, "unauthorized", "Invalid token");
      }

      const addRandomSuffix =
        claims?.payload?.addRandomSuffix === true ||
        req.headers["x-add-random-suffix"] === "1";
      const allowOverwrite =
        claims?.payload?.allowOverwrite === true ||
        req.headers["x-allow-overwrite"] === "1";

      const finalPath = addRandomSuffix
        ? `${pathname}-${crypto.randomBytes(6).toString("hex")}`
        : pathname;

      if (objects.has(finalPath) && !allowOverwrite) {
        return fail(
          res,
          409,
          "blob_already_exists",
          "The blob already exists",
        );
      }

      const etag = crypto.createHash("md5").update(body).digest("hex");
      objects.set(finalPath, {
        body,
        contentType,
        etag,
        uploadedAt: new Date().toISOString(),
        size: body.length,
      });

      return send(res, 200, {
        url: publicUrl(finalPath),
        downloadUrl: `${publicUrl(finalPath)}?download=1`,
        pathname: finalPath,
        contentType,
        contentDisposition: 'attachment; filename="blob"',
        etag,
      });
    }

    /* ---------- head 查询 / 列表 ---------- */
    if (req.method === "GET") {
      if (auth !== token && !auth.startsWith("vercel_blob_client_")) {
        return fail(res, 401, "unauthorized", "Invalid token");
      }

      const target = url.searchParams.get("url");
      if (target) {
        const key = target.startsWith("http")
          ? new URL(target).pathname.replace(/^\//, "")
          : target;
        const obj = objects.get(key);
        if (!obj) {
          return fail(
            res,
            404,
            "not_found",
            "The requested blob does not exist.",
          );
        }
        return send(res, 200, {
          url: publicUrl(key),
          downloadUrl: `${publicUrl(key)}?download=1`,
          pathname: key,
          size: obj.size,
          contentType: obj.contentType,
          contentDisposition: 'attachment; filename="blob"',
          cacheControl: "public, max-age=31536000, immutable",
          uploadedAt: obj.uploadedAt,
          etag: obj.etag,
        });
      }

      const limit = Number(url.searchParams.get("limit") || 10);
      const blobs = [...objects.entries()]
        .slice(0, limit)
        .map(([pathname, obj]) => ({
          url: publicUrl(pathname),
          downloadUrl: `${publicUrl(pathname)}?download=1`,
          pathname,
          size: obj.size,
          uploadedAt: obj.uploadedAt,
          etag: obj.etag,
        }));
      return send(res, 200, {
        blobs,
        folders: [],
        cursor: "",
        hasMore: false,
      });
    }

    return fail(res, 405, "method_not_allowed", "Method not allowed");
  });

  return { server, token, storeId, objects };
}

/** 起服务并返回端口等信息 */
export function startMockBlobServer(options = {}) {
  const { server, token, storeId, objects } = createMockBlobServer(options);
  const port = options.port ?? 0;
  const host = options.host ?? "127.0.0.1";

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const actual = server.address().port;
      resolve({
        server,
        token,
        storeId,
        objects,
        port: actual,
        url: `http://${host}:${actual}`,
        close: () =>
          new Promise((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

/* ---- 直接当脚本跑：打印一行地址，方便另开终端指向它 ---- */
/* 注意：必须用 pathToFileURL 比对 —— Windows 上 import.meta.url 是 file:///C:/...
   手拼 "file://" + 路径会少一个斜杠，判断永远不成立，进程会直接退出。 */
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const portArg = process.argv.slice(2).find((a) => a.startsWith("--port="));
  const port = portArg ? Number(portArg.split("=")[1]) : 3999;
  const handle = await startMockBlobServer({ port });
  console.log(`[mock-blob] listening on ${handle.url}`);
  console.log(`[mock-blob] store id: ${handle.storeId}`);
  console.log(`[mock-blob] token   : ${handle.token}`);
  console.log(
    `[mock-blob] server env:\n  VERCEL_BLOB_API_URL='${handle.url}'\n  BLOB_READ_WRITE_TOKEN='${handle.token}'`,
  );
}
