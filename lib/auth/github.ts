/**
 * halloCD · GitHub OAuth 客户端（服务端专用）
 * ==================================================================
 * 为什么用 GitHub OAuth，而不是「只用邮箱」：
 *
 *   · 「只用邮箱的 OAuth」在技术上叫 OIDC / magic link / email OTP / passwordless ——
 *     OAuth 2.0 本身不管身份，这三样都得额外接一个身份服务。
 *   · 托管 IdP（Clerk / Auth0 / Logto / Supabase Auth…）免费额度都在 1 万 ~ 5 万 MAU 量级，
 *     且 Supabase Auth 强绑 Supabase Postgres —— 本项目用的是 Neon，直接出局。
 *   · magic link 还要再买一个发信服务（Resend / Mailgun / Brevo…），
 *     每月几百封的免费额度，发货通知会跟它抢同一个池子。
 *   · GitHub OAuth：零成本、零额度、零发信。目标用户本来就是用 coding agent 的人，
 *     天然有 GitHub 账号。国内可直连，不像 Google OAuth 那样不可用。
 *
 * 所以这里手写一个最小可用的 GitHub OAuth 客户端 —— 零新增依赖。
 *
 * ------------------------------------------------------------------
 * 环境变量（全部可选，缺了就退回「只有邮箱密码」的老路，平台照常可用）
 * ------------------------------------------------------------------
 *   GITHUB_CLIENT_ID      OAuth App 的 client id          —— 必填才启用
 *   GITHUB_CLIENT_SECRET  OAuth App 的 client secret      —— 必填才启用
 *   GITHUB_OAUTH_BASE     授权/换码端点前缀（默认 https://github.com）
 *                         —— 覆盖它就能用本地 mock 服务器离线验证
 *   GITHUB_API_BASE       用户信息端点前缀（默认 https://api.github.com）
 *   GITHUB_SCOPE          申请的 scope（默认 read:user user:email）
 *   GITHUB_REDIRECT_URI   回调地址（默认 {站点根}/api/auth/github/callback）
 *   AUTH_STATE_SECRET     state 签名密钥（默认复用 GITHUB_CLIENT_SECRET）
 */

/** GitHub 返回的用户档案（只取我们要的字段） */
export type GitHubProfile = {
  /** GitHub 数字 id —— 稳定不变，用它做身份锚点 */
  id: string;
  /** 登录名（可改） */
  login: string;
  /** 显示名 */
  name: string;
  /** 主邮箱（用户可能设为私有，所以要去 /user/emails 补查） */
  email: string | null;
  /** 头像 URL */
  avatarUrl: string | null;
};

export type GitHubConfig = {
  clientId: string;
  clientSecret: string;
  oauthBase: string;
  apiBase: string;
  scope: string;
};

function trimBase(raw: string | undefined, fallback: string): string {
  const value = (raw ?? "").trim();
  return (value || fallback).replace(/\/+$/, "");
}

export function readGitHubConfig(): GitHubConfig {
  return {
    clientId: (process.env.GITHUB_CLIENT_ID ?? "").trim(),
    clientSecret: (process.env.GITHUB_CLIENT_SECRET ?? "").trim(),
    oauthBase: trimBase(process.env.GITHUB_OAUTH_BASE, "https://github.com"),
    apiBase: trimBase(process.env.GITHUB_API_BASE, "https://api.github.com"),
    scope: (process.env.GITHUB_SCOPE ?? "").trim() || "read:user user:email",
  };
}

/** 没配 client id / secret 就不启用 GitHub 登录 —— 平台退回邮箱密码 */
export function githubConfigured(config = readGitHubConfig()): boolean {
  return Boolean(config.clientId && config.clientSecret);
}

/**
 * 回调地址。
 *
 * 为什么优先用 GITHUB_REDIRECT_URI：GitHub OAuth App 里登记的回调地址是**逐字匹配**的，
 * 线上域名一旦有 www / 非 www 差别就会 400。显式配一次最省事。
 * 没配就从当前请求的 origin 推导 —— 本地开发与「一次一配」的部署都能跑。
 */
export function githubRedirectUri(origin: string): string {
  const explicit = (process.env.GITHUB_REDIRECT_URI ?? "").trim();
  if (explicit) return explicit;

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  const base = site || origin;
  return `${base.replace(/\/+$/, "")}/api/auth/github/callback`;
}

/** 拼授权跳转地址（用 oauthBase 而不是写死 github.com —— 这样能对 mock 服务器联调） */
export function githubAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope: string;
  oauthBase?: string;
}): string {
  const query = new URLSearchParams({
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: params.scope,
    state: params.state,
    allow_signup: "true",
  });
  const base = trimBase(params.oauthBase, "https://github.com");
  return `${base}/login/oauth/authorize?${query.toString()}`;
}

export class GitHubError extends Error {
  readonly status: number;
  readonly issue: string;

  constructor(status: number, issue: string, message: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
    this.issue = issue;
  }
}

/**
 * 换码拿 access token。
 *
 * GitHub 的 token 端点默认返回 form-urlencoded，加 Accept: application/json 才回 JSON。
 * 这里两种都认 —— 免得 GitHub 改了默认行为就整条链路断掉。
 */
export async function exchangeGitHubCode(params: {
  code: string;
  redirectUri: string;
  config?: GitHubConfig;
}): Promise<string> {
  const config = params.config ?? readGitHubConfig();
  if (!githubConfigured(config)) {
    throw new GitHubError(
      503,
      "MISSING_CREDENTIALS",
      "服务端缺少 GitHub OAuth 凭据（GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET）。",
    );
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  const res = await fetch(`${config.oauthBase}/login/oauth/access_token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "halloCD",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new GitHubError(
      502,
      "TOKEN_EXCHANGE_FAILED",
      `GitHub 换码失败（HTTP ${res.status}）。`,
    );
  }

  const text = await res.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* form-urlencoded 回退 */
    const form = new URLSearchParams(text);
    for (const [k, v] of form.entries()) payload[k] = v;
  }

  const token = String(payload.access_token ?? "").trim();
  if (!token) {
    throw new GitHubError(
      401,
      "TOKEN_EXCHANGE_FAILED",
      `GitHub 没有返回 access token：${String(payload.error_description ?? payload.error ?? "未知原因")}`,
    );
  }
  return token;
}

/** GitHub 要求带 User-Agent，否则 403 */
function apiHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "halloCD",
  };
}

/**
 * 取用户档案。
 *
 * 邮箱为什么要多查一次 /user/emails：
 *   GitHub 用户可以把自己的邮箱设为私有，这时 GET /user 的 email 字段是 null。
 *   而「用同一个邮箱把 OAuth 账号和站内已有账号对上」是避免重复账号的关键，
 *   所以要拿 /user/emails 里 primary && verified 的那一个。
 */
export async function fetchGitHubProfile(
  token: string,
  config = readGitHubConfig(),
): Promise<GitHubProfile> {
  const res = await fetch(`${config.apiBase}/user`, {
    headers: apiHeaders(token),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new GitHubError(
      res.status === 401 ? 401 : 502,
      "PROFILE_FETCH_FAILED",
      `读取 GitHub 用户信息失败（HTTP ${res.status}）。`,
    );
  }

  const raw = (await res.json()) as Record<string, unknown>;
  const id = String(raw.id ?? "").trim();
  const login = String(raw.login ?? "").trim();
  if (!id || !login) {
    throw new GitHubError(502, "PROFILE_FETCH_FAILED", "GitHub 返回的用户信息不完整。");
  }

  let email = typeof raw.email === "string" ? raw.email.trim() : "";
  if (!email) {
    try {
      const emailsRes = await fetch(`${config.apiBase}/user/emails`, {
        headers: apiHeaders(token),
        cache: "no-store",
      });
      if (emailsRes.ok) {
        const list = (await emailsRes.json()) as unknown[];
        const picked = (Array.isArray(list) ? list : []).find((item) => {
          const row = (item ?? {}) as Record<string, unknown>;
          return row.primary === true && row.verified === true;
        }) as Record<string, unknown> | undefined;
        if (picked) email = String(picked.email ?? "").trim();
      }
    } catch {
      /* 拿不到就算了 —— 有 id 一样能建账号 */
    }
  }

  return {
    id,
    login,
    name: typeof raw.name === "string" ? raw.name.trim() : "",
    email: email || null,
    avatarUrl:
      typeof raw.avatar_url === "string" ? raw.avatar_url.trim() || null : null,
  };
}
