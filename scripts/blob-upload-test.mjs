#!/usr/bin/env node
/**
 * halloCD · 对象存储链路端到端测试（v2.7）
 * ==================================================================
 * 覆盖「媒体从数据库搬进 Vercel Blob」这条链路上的每一环：
 *
 *   · 服务端中转（≤4MB）→ 落库 → GET /api/uploads/<id> 302 到 CDN
 *   · 客户端直传（>4MB）→ 签 token → 直传 → 回查落库 → 302
 *   · 数据库里**不再有字节**（data 是空串，只有路径和 URL）
 *   · 幂等：同一个 commit 重复调只产生一条记录
 *   · 各种越权/越界输入被挡住（坏 pathname、超大文件、非法类型、未知 id）
 *
 * 它自带一个**协议级**的假 Blob（scripts/mock-blob-server.mjs），
 * 会真的校验 client token 的 HMAC 签名 —— 不是摆设。
 *
 * 用法：
 *   node scripts/blob-upload-test.mjs
 *   node scripts/blob-upload-test.mjs --pg        # 让它起的服务器走 Postgres 后端
 *   node scripts/blob-upload-test.mjs --base=http://localhost:3000   # 用已有的服务器
 *
 * --pg 需要先把 shim 起起来（scripts/pg-harness/shim.mjs，监听 https://localhost:443/sql）。
 *
 * 退出码：0 = 全部通过；1 = 有失败项。
 */

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { upload } from "@vercel/blob/client";

import { startMockBlobServer } from "./mock-blob-server.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const args = process.argv.slice(2);
const baseArg = args.find((a) => a.startsWith("--base="));
const EXTERNAL_BASE = baseArg ? baseArg.split("=")[1].replace(/\/+$/, "") : null;

/* --pg：让本脚本自己起的服务器走 Postgres 后端
   （默认是本地文件后端 —— 那样才能直接读 uploads.json 验证「媒体不进库」） */
const USE_PG = args.includes("--pg");
const pgUrlArg = args.find((a) => a.startsWith("--pg-url="));
const PG_URL =
  pgUrlArg?.split("=")[1] || "postgresql://postgres:pw@localhost:443/hallocd";

/* 1×1 红点 PNG —— 够真了，又不用塞一大坨二进制 */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/* ------------------------------------------------------------------ */
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail || "" });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function httpJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, json, text };
}

async function waitForServer(base, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/agent/v1/health`);
      if (res.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * 0. 环境：假 Blob + 一台带正确环境变量的服务器
 * ------------------------------------------------------------------ */
const mock = await startMockBlobServer({ port: 0 });

process.env.VERCEL_BLOB_API_URL = mock.url;
process.env.BLOB_READ_WRITE_TOKEN = mock.token;

const dataDir = mkdtempSync(join(tmpdir(), "hallocd-blob-test-"));

let server = null;
let base = EXTERNAL_BASE;

if (!base) {
  const port = 4300 + Math.floor(Math.random() * 400);
  base = `http://127.0.0.1:${port}`;
  const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");

  const env = { ...process.env };
  env.VERCEL_BLOB_API_URL = mock.url;
  env.BLOB_READ_WRITE_TOKEN = mock.token;
  env.NODE_ENV = "production";

  if (USE_PG) {
    /* Postgres 模式：走真实 Postgres 引擎（shim 用 PGlite 垫底） */
    env.DATABASE_URL = PG_URL;
    env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    delete env.HALLO_AGENT_DATA_DIR;
  } else {
    /* 文件后端：测试要能直接读 uploads.json 验证「媒体不进库」 */
    env.DATABASE_URL = "";
    env.HALLO_AGENT_DATA_DIR = dataDir;
  }

  server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => {
    serverLog += d.toString();
  });
  server.stderr.on("data", (d) => {
    serverLog += d.toString();
  });
  server.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`\n[server exited ${code}]\n${serverLog.slice(-2000)}`);
    }
  });
}

console.log("=".repeat(66));
console.log("halloCD · 对象存储链路测试（v2.7）");
console.log("=".repeat(66));
console.log(`  mock blob : ${mock.url}  (store ${mock.storeId})`);
console.log(`  server    : ${base}`);
console.log(`  data dir  : ${dataDir}`);
console.log("");

try {
  const up = await waitForServer(base);
  if (!up) {
    console.error("服务器没能在 90 秒内就绪 —— 放弃测试。");
    process.exitCode = 1;
    throw new Error("server-not-ready");
  }

  /* ---------------------------------------------------------------- *
   * 1. 服务端中转通道（≤4MB）
   * ---------------------------------------------------------------- */
  {
    const form = new FormData();
    form.append("file", new Blob([PNG_1PX], { type: "image/png" }), "dot.png");
    const { res, json } = await httpJson(`${base}/api/uploads`, {
      method: "POST",
      body: form,
    });
    check("中转上传返回 201", res.status === 201, `HTTP ${res.status}`);
    check(
      "中转上传落到对象存储（storage=blob）",
      json?.storage === "blob",
      `storage=${json?.storage}`,
    );
    check(
      "中转返回的 url 仍是 /api/uploads/<id>（契约不变）",
      typeof json?.url === "string" &&
        /^\/api\/uploads\/up_[a-z0-9]{20}$/.test(json.url),
      json?.url,
    );
    check(
      "上传 id 格式正确",
      typeof json?.id === "string" && /^up_[a-z0-9]{20}$/.test(json.id),
      json?.id,
    );

    /* GET 应 302 到 CDN */
    const got = await fetch(`${base}${json.url}`, { redirect: "manual" });
    check(
      "GET /api/uploads/<id> 302 到对象存储",
      got.status === 302,
      `HTTP ${got.status} → ${got.headers.get("location")}`,
    );
    check(
      "302 指向 Blob 的公开域名",
      String(got.headers.get("location") || "").includes(
        ".public.blob.vercel-storage.com/",
      ),
      got.headers.get("location"),
    );

    /* 字节真的在对象存储里 */
    const peek = await httpJson(`${mock.url}/__mock/objects`);
    const hit = peek.json?.objects?.find((o) =>
      String(o.pathname).includes(json.id),
    );
    check("字节确实写进了对象存储", Boolean(hit), hit?.pathname);
    check(
      "对象存储里的字节数正确",
      hit?.size === PNG_1PX.length,
      `${hit?.size} vs ${PNG_1PX.length}`,
    );

    globalThis.__firstUploadId = json?.id;
  }

  /* ---------------------------------------------------------------- *
   * 2. 数据库里不再有媒体字节
   *    （Postgres 模式下读不到本地文件 —— 那一节的等价证据是
   *      下面的「GET 302」：它要求 findUpload 真的读出了 blob_url）
   * ---------------------------------------------------------------- */
  if (!USE_PG) {
    const file = join(dataDir, "db", "uploads.json");
    const rows = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : [];
    const row = rows.find((r) => r.id === globalThis.__firstUploadId);
    check("uploads 表里有这条记录", Boolean(row), `${rows.length} 行`);
    check(
      "数据库里没有媒体字节（data 为空串）",
      row?.data === "",
      `data 长度=${(row?.data || "").length}`,
    );
    check(
      "记录里有 blobPath / blobUrl",
      Boolean(row?.blobPath) && Boolean(row?.blobUrl),
      `${row?.blobPath} / ${row?.blobUrl}`,
    );
  } else {
    console.log("  SKIP  数据库字节检查（Postgres 模式读不到本地文件）");
  }

  /* ---------------------------------------------------------------- *
   * 3. 客户端直传通道（>4MB —— 函数请求体装不下，只能绕过去）
   * ---------------------------------------------------------------- */
  {
    /* id 必须每次随机 —— 否则上一轮跑过的同一个 pathname 会命中幂等分支，
       commit 返回 200 而不是 201（那是对的行为，但会误伤断言）。 */
    const id = `up_${crypto.randomBytes(10).toString("hex")}`;
    const pathname = `uploads/${id}.mp4`;
    const big = Buffer.alloc(5 * 1024 * 1024, 7); /* 5MB */

    /* ① 换 client token */
    const tokenRes = await httpJson(`${base}/api/uploads/direct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: {
          pathname,
          clientPayload: { uploadId: id, name: "memory-video.mp4" },
          multipart: false,
        },
      }),
    });
    check("直传 token 签发返回 200", tokenRes.res.status === 200, `HTTP ${tokenRes.res.status}`);
    check(
      "签发的 clientToken 格式正确",
      typeof tokenRes.json?.clientToken === "string" &&
        tokenRes.json.clientToken.startsWith("vercel_blob_client_"),
      String(tokenRes.json?.clientToken).slice(0, 40),
    );

    /* ② 浏览器干的事：拿 token 直接 PUT 到对象存储 */
    const put = await upload(pathname, big, {
      handleUploadUrl: `${base}/api/uploads/direct`,
      access: "public",
      contentType: "video/mp4",
      clientPayload: { uploadId: id, name: "memory-video.mp4" },
    });
    check(
      "直传 PUT 成功（5MB 绕过函数 4.5MB 限制）",
      put?.pathname === pathname,
      put?.url,
    );

    /* ③ 回查落库 */
    const commit = await httpJson(`${base}/api/uploads/direct/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pathname, name: "memory-video.mp4" }),
    });
    check("commit 返回 201", commit.res.status === 201, `HTTP ${commit.res.status}`);
    check(
      "commit 返回的 url 是 /api/uploads/<id>",
      commit.json?.url === `/api/uploads/${id}`,
      commit.json?.url,
    );
    check(
      "commit 登记的字节数是真实大小",
      commit.json?.size === big.length,
      `${commit.json?.size} vs ${big.length}`,
    );
    check(
      "commit 登记的 mime 正确",
      commit.json?.mime === "video/mp4",
      commit.json?.mime,
    );

    /* GET 应 302 */
    const got = await fetch(`${base}/api/uploads/${id}`, { redirect: "manual" });
    check("直传素材 GET 302", got.status === 302, `HTTP ${got.status}`);

    /* ④ 幂等：再 commit 一次 */
    const again = await httpJson(`${base}/api/uploads/direct/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pathname, name: "memory-video.mp4" }),
    });
    check(
      "重复 commit 幂等（200 且 created=false）",
      again.res.status === 200 && again.json?.created === false,
      `HTTP ${again.res.status} created=${again.json?.created}`,
    );

    if (!USE_PG) {
      const rows = JSON.parse(
        readFileSync(join(dataDir, "db", "uploads.json"), "utf8"),
      );
      check(
        "幂等：数据库里仍然只有一条直传记录",
        rows.filter((r) => r.id === id).length === 1,
        `${rows.filter((r) => r.id === id).length} 行`,
      );
    } else {
      console.log("  SKIP  幂等行数检查（Postgres 模式读不到本地文件）");
    }
  }

  /* ---------------------------------------------------------------- *
   * 4. 越权 / 越界输入必须被挡住
   * ---------------------------------------------------------------- */
  {
    /* 4.1 坏 pathname */
    const badPath = await httpJson(`${base}/api/uploads/direct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: { pathname: "evil/hack.png" },
      }),
    });
    check(
      "签发 token 时拒绝非法 pathname",
      badPath.res.status === 400,
      `HTTP ${badPath.res.status}`,
    );

    /* 4.2 uploadId 与 pathname 对不上 */
    const mismatch = await httpJson(`${base}/api/uploads/direct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "blob.generate-client-token",
        payload: {
          pathname: "uploads/up_ffffffffffffffffffff.png",
          clientPayload: { uploadId: "up_00000000000000000000" },
        },
      }),
    });
    check(
      "uploadId 与 pathname 不一致时拒绝签发",
      mismatch.res.status === 400,
      `HTTP ${mismatch.res.status}`,
    );

    /* 4.3 不认识的事件类型 */
    const badEvent = await httpJson(`${base}/api/uploads/direct`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.hack" }),
    });
    check(
      "不认识的事件类型被拒绝",
      badEvent.res.status === 400,
      `HTTP ${badEvent.res.status}`,
    );

    /* 4.4 commit 一个不存在的对象 */
    const ghost = await httpJson(`${base}/api/uploads/direct/commit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pathname: "uploads/up_cccccccccccccccccccc.mp4",
        name: "ghost.mp4",
      }),
    });
    check(
      "commit 一个不存在的对象返回 404",
      ghost.res.status === 404,
      `HTTP ${ghost.res.status} ${ghost.json?.error}`,
    );

    /* 4.5 中转通道的类型白名单 */
    const badType = new FormData();
    badType.append(
      "file",
      new Blob(["<script>alert(1)</script>"], { type: "text/html" }),
      "x.html",
    );
    const typeRes = await httpJson(`${base}/api/uploads`, {
      method: "POST",
      body: badType,
    });
    check(
      "中转通道拒绝不支持的类型",
      typeRes.res.status === 415,
      `HTTP ${typeRes.res.status}`,
    );

    /* 4.6 中转通道的大小上限（4MB） */
    const bigForm = new FormData();
    bigForm.append(
      "file",
      new Blob([Buffer.alloc(5 * 1024 * 1024, 1)], { type: "video/mp4" }),
      "big.mp4",
    );
    const bigRes = await httpJson(`${base}/api/uploads`, {
      method: "POST",
      body: bigForm,
    });
    check(
      "中转通道拒绝超过 4MB 的文件",
      bigRes.res.status === 413,
      `HTTP ${bigRes.res.status}`,
    );

    /* 4.7 未知 id */
    const missing = await fetch(`${base}/api/uploads/up_00000000000000000000`, {
      redirect: "manual",
    });
    check("未知 id 返回 404", missing.status === 404, `HTTP ${missing.status}`);
  }

  /* ---------------------------------------------------------------- *
   * 5. health 端点要如实报告媒体状态
   * ---------------------------------------------------------------- */
  {
    const { res, json } = await httpJson(`${base}/api/agent/v1/health`);
    check("health 返回 200", res.status === 200, `HTTP ${res.status}`);
    check(
      "health.media.storage = blob",
      json?.media?.storage === "blob",
      json?.media?.storage,
    );
    check(
      "health.media.directUpload = true",
      json?.media?.directUpload === true,
      String(json?.media?.directUpload),
    );
    check(
      "health.media.transcoding = false（我们不转码）",
      json?.media?.transcoding === false,
      String(json?.media?.transcoding),
    );
    check(
      "health.media.probe.ok = true",
      json?.media?.probe?.ok === true,
      json?.media?.probe?.error || "ok",
    );
    check(
      "health.media.serverMaxBytes = 4MB",
      json?.media?.serverMaxBytes === 4 * 1024 * 1024,
      String(json?.media?.serverMaxBytes),
    );
  }
} catch (err) {
  if (err?.message !== "server-not-ready") {
    console.error("\n测试过程中抛错：", err);
    check("测试脚本本身没崩", false, String(err?.message || err));
  }
} finally {
  if (server) {
    server.kill();
  }
  await mock.close();
}

/* ------------------------------------------------------------------ */
const failed = results.filter((r) => !r.ok);
console.log("");
console.log("=".repeat(66));
console.log(
  failed.length === 0
    ? `✓ 全部通过（${results.length}/${results.length}）`
    : `✗ ${failed.length}/${results.length} 项失败`,
);
console.log("=".repeat(66));
process.exitCode = failed.length === 0 ? 0 : 1;
