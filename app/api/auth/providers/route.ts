/**
 * GET /api/auth/providers
 * ------------------------------------------------------------------
 * 这个部署支持哪些登录方式。
 *
 * 为什么要有这个端点：登录页要决定**要不要显示「用 GitHub 登录」按钮**。
 * 没配 GitHub 凭据还显示按钮，点过去只会得到一句 503 —— 那是骗用户。
 *
 * 只暴露「有没有配」，绝不暴露 client id / secret 本身。
 */

import { NextResponse, connection } from "next/server";

import { githubConfigured, readGitHubConfig } from "@/lib/auth/github";
import { oauthStateSecretIsWeak } from "@/lib/auth/oauth-state";

export async function GET() {
  /* Cache Components 下，GET 若不访问请求期 API 会在构建期被预渲染，
     「有没有配」就会被固化成构建那一刻的状态。connection() 强制请求期求值。 */
  await connection();

  const config = readGitHubConfig();
  const enabled = githubConfigured(config);

  return NextResponse.json({
    success: true,
    providers: {
      github: {
        enabled,
        /* 没配凭据 → 按钮不显示（退回邮箱密码登录） */
        enabled_reason: enabled
          ? "configured"
          : "missing_credentials",
        /* 配了凭据但没配 state 签名密钥 → 登录能用，但 CSRF 防护是弱的 */
        stateSecretWeak: oauthStateSecretIsWeak(),
      },
    },
  });
}
