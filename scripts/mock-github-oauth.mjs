#!/usr/bin/env node
/**
 * halloCD · Mock GitHub OAuth 服务器
 * ==================================================================
 * 用途：在**本地**把 GitHub OAuth 的完整协议跑一遍，不需要真的去
 * github.com 注册 OAuth App、也不需要出网。
 *
 * 它按 GitHub 的真实协议实现（对着官方文档写的）：
 *   GET  /login/oauth/authorize  → 302 回 redirect_uri?code=...&state=...
 *   POST /login/oauth/access_token → { access_token, scope, token_type }
 *   GET  /user                    → { id, login, name, email, avatar_url }
 *   GET  /user/emails             → [{ email, primary, verified }]
 *
 * 而且它**真的做校验**（不然测出来的「通过」没有意义）：
 *   · client_id / client_secret 对不上 → 401
 *   · code 未知 / 已用过 → 401
 *   · access_token 不认识 → 401
 *   · 授权时带的 client_id 不认识 → 400
 *
 * 测试要换身份（不同 id / 登录名 / 邮箱）时：
 *   POST /__mock/profile  { id, login, name, email, privateEmail }
 *
 * 用法：
 *   node scripts/mock-github-oauth.mjs --port=3977
 */
import http from "node:http";
import { randomBytes } from "node:crypto";

const argv = process.argv.slice(2);
const portArg = argv.find((a) => a.startsWith("--port="));
const PORT = Number(portArg ? portArg.split("=")[1] : 3977);

const CLIENT_ID = process.env.MOCK_GITHUB_CLIENT_ID || "mock_client_id";
const CLIENT_SECRET = process.env.MOCK_GITHUB_CLIENT_SECRET || "mock_client_secret";

/** 当前 mock 的 GitHub 身份 —— 测试可以随时换 */
let profile = {
  id: "10001",
  login: "mockuser",
  name: "Mock User",
  email: "mockuser@github.test",
  privateEmail: false,
};

/** code → 授权上下文（一次性） */
const codes = new Map();
/** token → 身份 id */
const tokens = new Map();

const requests = [];

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
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(""));
  });
}

/**
 * GitHub 的用户 id 是**数字**。
 * 测试为了每轮都用全新身份，会传字符串 id —— 这里稳定地哈希成正整数，
 * 保证返回的 id 形状跟真 GitHub 一致。
 */
function numericId(raw) {
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  let h = 0;
  for (const ch of String(raw)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 100000 + (h % 899999999);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  requests.push({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  });

  /* ---------- 授权页：直接 302 回 redirect_uri ---------- */
  if (req.method === "GET" && url.pathname === "/login/oauth/authorize") {
    const clientId = url.searchParams.get("client_id");
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state") || "";

    if (clientId !== CLIENT_ID) {
      return json(res, 400, {
        error: "incorrect_client_credentials",
        error_description: `client_id 不认识：${clientId}`,
      });
    }
    if (!redirectUri) {
      return json(res, 400, { error: "redirect_uri_missing" });
    }

    const code = randomBytes(12).toString("hex");
    codes.set(code, {
      redirectUri,
      state,
      clientId,
      profileId: profile.id,
      used: false,
    });

    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    if (state) target.searchParams.set("state", state);

    res.writeHead(302, { Location: target.toString() });
    return res.end();
  }

  /* ---------- 换码 ---------- */
  if (req.method === "POST" && url.pathname === "/login/oauth/access_token") {
    const raw = await readBody(req);
    const form = new URLSearchParams(raw);

    if (
      form.get("client_id") !== CLIENT_ID ||
      form.get("client_secret") !== CLIENT_SECRET
    ) {
      return json(res, 401, {
        error: "incorrect_client_credentials",
        error_description: "client_id / client_secret 不匹配。",
      });
    }

    const code = form.get("code") || "";
    const record = codes.get(code);
    if (!record || record.used) {
      return json(res, 401, {
        error: "bad_verification_code",
        error_description: "code 不存在或已被使用。",
      });
    }
    /* redirect_uri 必须与授权时一致 */
    if (form.get("redirect_uri") && form.get("redirect_uri") !== record.redirectUri) {
      return json(res, 401, {
        error: "redirect_uri_mismatch",
        error_description: "redirect_uri 与授权时不一致。",
      });
    }
    record.used = true;

    const token = `gho_mock_${randomBytes(12).toString("hex")}`;
    tokens.set(token, record.profileId);

    return json(res, 200, {
      access_token: token,
      scope: "read:user user:email",
      token_type: "bearer",
    });
  }

  /* ---------- 用户信息 ---------- */
  if (req.method === "GET" && url.pathname === "/user") {
    const auth = req.headers.authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    const profileId = tokens.get(token);
    if (!profileId) {
      return json(res, 401, { message: "Bad credentials" });
    }
    if (profileId !== profile.id) {
      /* 换了身份但 token 还是老的 —— 按 GitHub 的行为返回老身份 */
      return json(res, 200, {
        id: numericId(profileId),
        login: "previous-user",
        name: "Previous User",
        email: null,
        avatar_url: null,
      });
    }

    return json(res, 200, {
      id: numericId(profile.id),
      login: profile.login,
      name: profile.name,
      /* 邮箱设为私有时，GitHub 的 /user 里 email 就是 null */
      email: profile.privateEmail ? null : profile.email,
      avatar_url: `https://avatars.example.test/${profile.login}.png`,
    });
  }

  /* ---------- 邮箱列表 ---------- */
  if (req.method === "GET" && url.pathname === "/user/emails") {
    const auth = req.headers.authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!tokens.has(token)) {
      return json(res, 401, { message: "Bad credentials" });
    }
    return json(res, 200, [
      {
        email: profile.email,
        primary: true,
        verified: true,
        visibility: "private",
      },
    ]);
  }

  /* ---------- 测试控制面 ---------- */
  if (req.method === "POST" && url.pathname === "/__mock/profile") {
    const raw = await readBody(req);
    try {
      profile = { ...profile, ...JSON.parse(raw || "{}") };
    } catch {
      return json(res, 400, { error: "INVALID_JSON" });
    }
    return json(res, 200, { ok: true, profile });
  }

  if (req.method === "GET" && url.pathname === "/__mock/requests") {
    return json(res, 200, { requests });
  }

  if (req.method === "GET" && url.pathname === "/__mock/health") {
    return json(res, 200, {
      ok: true,
      service: "mock-github-oauth",
      clientId: CLIENT_ID,
      profile,
    });
  }

  return json(res, 404, { error: "NOT_FOUND", path: url.pathname });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-github-oauth] http://127.0.0.1:${PORT}`);
  console.log(`  client_id     = ${CLIENT_ID}`);
  console.log(`  client_secret = ${CLIENT_SECRET}`);
});
