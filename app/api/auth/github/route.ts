/**
 * GET /api/auth/github
 * ------------------------------------------------------------------
 * GitHub OAuth 的**发起端**：把浏览器 302 送到 GitHub 的授权页。
 *
 * 流程全貌：
 *   ① 本路由：生成 state → 写 httpOnly cookie → 302 到 GitHub
 *   ② 用户在 GitHub 上点「授权」
 *   ③ GitHub 302 回 /api/auth/github/callback?code=...&state=...
 *   ④ 回调路由：校验 state → 换码 → 取档案 → 建/绑账号 → 建会话 → 302 回站内
 *
 * 没配 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET 时：
 *   返回 503 并说明原因 —— 平台退回「邮箱 + 密码」登录，一切照常。
 */

import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import {
  githubAuthorizeUrl,
  githubRedirectUri,
  readGitHubConfig,
} from "@/lib/auth/github";
import {
  serializeStateCookie,
  signState,
} from "@/lib/auth/oauth-state";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedGET(request: Request) {
  const config = readGitHubConfig();

  if (!config.clientId || !config.clientSecret) {
    return NextResponse.json(
      {
        success: false,
        error: "GITHUB_NOT_CONFIGURED",
        message:
          "本部署没有启用 GitHub 登录（缺少 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET）。请用邮箱密码登录。",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const redirectUri = githubRedirectUri(origin);

  /* next 只允许站内相对路径（见 oauth-state.ts 的 safeNext） */
  const rawNext = url.searchParams.get("next");
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/";

  const state = signState({
    nonce: randomBytes(16).toString("base64url"),
    next,
    redirectUri,
    ts: Date.now(),
  });

  const authorizeUrl = githubAuthorizeUrl({
    clientId: config.clientId,
    redirectUri,
    state,
    scope: config.scope,
    oauthBase: config.oauthBase,
  });

  const res = NextResponse.redirect(authorizeUrl, 302);
  res.headers.append("Set-Cookie", serializeStateCookie(state));
  return res;
}

export const GET = withStorageGuard(__guardedGET);
