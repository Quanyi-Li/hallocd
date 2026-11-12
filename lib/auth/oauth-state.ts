/**
 * halloCD · OAuth state 签名
 * ==================================================================
 * OAuth 授权码流程里的 state 是**防 CSRF**的唯一一道锁：
 * 攻击者把受害者骗到自己的回调 URL（带攻击者的 code），
 * 受害者浏览器一跟过去就会把攻击者的 GitHub 账号绑到这个站点上。
 *
 * 做法：
 *   1. 发起授权前生成一串 state（payload + HMAC），写进 httpOnly cookie
 *   2. 回调时把 URL 上的 state 和 cookie 里的比 —— 对不上就拒绝
 *   3. 比完就把 cookie 清掉（一次性）
 *
 * 为什么用 HMAC 而不是随机串直接比：
 *   随机串比对了，但 cookie 里的内容是攻击者可能预先知道的？不 —— cookie 是 httpOnly 的，
 *   攻击者读不到。真正的风险在于「同源的其他页面能写同名 cookie」。
 *   加上 payload 的签名后，即使有人能写 cookie，也伪造不出合法 state。
 *
 * 密钥：优先 AUTH_STATE_SECRET，没有就复用 GITHUB_CLIENT_SECRET。
 * 都没有时用一个固定的开发串 —— 本地能跑，线上等于没保护，
 * 所以 preflight 会把它列为必须配置项。
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const OAUTH_STATE_COOKIE = "hallocd_oauth_state";

/** state 有效期：10 分钟。授权来回 + 用户在 GitHub 上挑个头像的时间是够的。 */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthStatePayload = {
  /** 一次性随机串 */
  nonce: string;
  /** 登录成功后跳回哪里（只允许站内相对路径） */
  next: string;
  /** 发起授权时用的回调地址 —— 换码时必须用同一个 */
  redirectUri: string;
  /** 签发时间戳 */
  ts: number;
};

function stateSecret(): string {
  return (
    process.env.AUTH_STATE_SECRET?.trim() ||
    process.env.GITHUB_CLIENT_SECRET?.trim() ||
    "hallocd-dev-oauth-state-secret"
  );
}

/**
 * state 签名用的是**开发兜底密钥**时返回 false。
 * 线上必须配 AUTH_STATE_SECRET（或至少配 GITHUB_CLIENT_SECRET）。
 */
export function oauthStateSecretIsWeak(): boolean {
  return !(
    process.env.AUTH_STATE_SECRET?.trim() ||
    process.env.GITHUB_CLIENT_SECRET?.trim()
  );
}

function mac(body: string): string {
  return createHmac("sha256", stateSecret()).update(body).digest("base64url");
}

export function signState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${mac(body)}`;
}

/** 校验并解出 state；任何一步对不上都返回 null（调用方应拒绝这次回调） */
export function verifyState(raw: string | null | undefined): OAuthStatePayload | null {
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length !== 2) return null;

  const [body, signature] = parts;
  const expected = mac(body);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as OAuthStatePayload;
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.ts !== "number") return null;
  if (Date.now() - payload.ts > OAUTH_STATE_TTL_MS) return null;
  if (Date.now() - payload.ts < -60_000) return null;

  return payload;
}

/**
 * 只允许站内相对路径做跳转目标。
 *
 * 不做这一步的话，state 里的 next 可以是 `https://evil.example` ——
 * 攻击者就能把登录成功后的用户送去钓鱼页。
 */
export function safeNext(raw: unknown, fallback = "/"): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  return value;
}

/** state cookie 的序列化 —— httpOnly + SameSite=Lax（GitHub 是顶层 GET 跳回，Lax 会带上） */
export function serializeStateCookie(state: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return [
    `${OAUTH_STATE_COOKIE}=${state}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(OAUTH_STATE_TTL_MS / 1000)}`,
    secure,
  ]
    .filter(Boolean)
    .join("; ");
}

export function serializeClearedStateCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return [
    `${OAUTH_STATE_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    secure,
  ]
    .filter(Boolean)
    .join("; ");
}
