#!/usr/bin/env node
/**
 * halloCD · Mock 邮件服务器
 * ==================================================================
 * 用途：在**本地**验证发货通知真的会发出去 —— 不需要真的注册发信服务、
 * 也不用消耗额度、更不会把邮件真的寄给谁。
 *
 * 它按 Resend 的 API 形状实现（POST /emails → { id }），并且真的校验：
 *   · Authorization: Bearer <key> 对不上 → 401
 *   · 缺 from / to / subject / html → 422
 *   · to 不是合法邮箱 → 422
 *
 * 测试控制面：
 *   GET  /__mock/messages  → 已收到的所有邮件
 *   POST /__mock/reset     → 清空
 *   GET  /__mock/health
 *
 * 用法：
 *   node scripts/mock-mail-server.mjs --port=3978
 */
import http from "node:http";

const argv = process.argv.slice(2);
const portArg = argv.find((a) => a.startsWith("--port="));
const PORT = Number(portArg ? portArg.split("=")[1] : 3978);

const API_KEY = process.env.MOCK_MAIL_API_KEY || "mock_mail_key";

const messages = [];

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5e6) req.destroy();
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  /* ---------- 发信 ---------- */
  if (req.method === "POST" && url.pathname === "/emails") {
    const auth = req.headers.authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (token !== API_KEY) {
      return json(res, 401, {
        name: "validation_error",
        message: "Invalid API key",
      });
    }

    let payload = {};
    try {
      payload = JSON.parse((await readBody(req)) || "{}");
    } catch {
      return json(res, 422, {
        name: "validation_error",
        message: "Invalid JSON body",
      });
    }

    const to = Array.isArray(payload.to)
      ? payload.to
      : typeof payload.to === "string"
        ? [payload.to]
        : [];

    if (!payload.from) {
      return json(res, 422, {
        name: "validation_error",
        message: "Missing `from` field",
      });
    }
    if (!to.length || to.some((x) => typeof x !== "string" || !EMAIL_RE.test(x))) {
      return json(res, 422, {
        name: "validation_error",
        message: "Invalid `to` field",
      });
    }
    if (!payload.subject) {
      return json(res, 422, {
        name: "validation_error",
        message: "Missing `subject` field",
      });
    }
    if (!payload.html && !payload.text) {
      return json(res, 422, {
        name: "validation_error",
        message: "Missing `html` / `text` field",
      });
    }

    const message = {
      id: `mock_email_${messages.length + 1}_${Date.now().toString(36)}`,
      from: payload.from,
      to,
      subject: payload.subject,
      html: payload.html || "",
      text: payload.text || "",
      receivedAt: new Date().toISOString(),
    };
    messages.push(message);

    return json(res, 200, { id: message.id });
  }

  /* ---------- 测试控制面 ---------- */
  if (req.method === "GET" && url.pathname === "/__mock/messages") {
    return json(res, 200, { count: messages.length, messages });
  }

  if (req.method === "POST" && url.pathname === "/__mock/reset") {
    messages.length = 0;
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/__mock/health") {
    return json(res, 200, {
      ok: true,
      service: "mock-mail-server",
      count: messages.length,
    });
  }

  return json(res, 404, { error: "NOT_FOUND", path: url.pathname });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-mail-server] http://127.0.0.1:${PORT}`);
  console.log(`  api key = ${API_KEY}`);
});
