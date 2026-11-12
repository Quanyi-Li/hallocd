/**
 * GET /api/auth/github/callback
 * ------------------------------------------------------------------
 * GitHub OAuth 的**回调端**：GitHub 授权完成后把浏览器送回这里。
 *
 * 这里是整个 OAuth 链路里唯一「有信任边界」的地方，所以每一步都要验：
 *   ① state 必须与发起时写进 cookie 的那个**完全一致**（防 CSRF / 防会话固定）
 *   ② 换码用的 redirect_uri 必须与发起时用过的**完全一致**（GitHub 会校验）
 *   ③ 拿到的 GitHub 身份必须能对应上一个站内账号（建号或绑号）
 *
 * 任何一步没过都跳回 /login 并带上错误码 —— 绝不把异常抛给用户看堆栈。
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  GitHubError,
  exchangeGitHubCode,
  fetchGitHubProfile,
} from "@/lib/auth/github";
import {
  OAUTH_STATE_COOKIE,
  serializeClearedStateCookie,
  verifyState,
} from "@/lib/auth/oauth-state";
import { linkGithubProfile } from "@/lib/auth/oauth-account";
import {
  createSession,
  serializeSessionCookie,
} from "@/lib/auth/session";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedGET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;

  /** 出错时统一跳回登录页，并把错误码带给前端显示 */
  const fail = (error: string, message: string): NextResponse => {
    const target = new URL("/login", origin);
    target.searchParams.set("github_error", error);
    target.searchParams.set("github_message", message.slice(0, 200));
    const res = NextResponse.redirect(target, 302);
    res.headers.append("Set-Cookie", serializeClearedStateCookie());
    return res;
  };

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");

  if (!code) {
    return fail("MISSING_CODE", "GitHub 没有返回授权码，请重新发起登录。");
  }

  /* ① state 校验：签名对得上，且与 cookie 里那一份逐字相同 */
  const jar = await cookies();
  const cookieState = jar.get(OAUTH_STATE_COOKIE)?.value ?? null;
  const state = verifyState(stateParam);

  if (!state || !cookieState || stateParam !== cookieState) {
    return fail(
      "INVALID_STATE",
      "登录请求已过期或校验未通过，请重新发起一次登录。",
    );
  }

  /* ② 换码 + 取档案 */
  let profile;
  try {
    const token = await exchangeGitHubCode({
      code,
      redirectUri: state.redirectUri,
    });
    profile = await fetchGitHubProfile(token);
  } catch (err) {
    const message =
      err instanceof GitHubError || err instanceof Error
        ? err.message
        : "GitHub 登录失败，请重试。";
    return fail("GITHUB_ERROR", message);
  }

  /* ③ 建号 / 绑号 + 建会话 */
  try {
    const result = await linkGithubProfile(profile);
    const session = await createSession(result.user.id);

    const target = new URL(
      state.next && state.next !== "/" ? state.next : `/u/${result.user.handle}`,
      origin,
    );

    const res = NextResponse.redirect(target, 302);
    res.headers.append(
      "Set-Cookie",
      serializeSessionCookie(session.id, session.expiresAt),
    );
    res.headers.append("Set-Cookie", serializeClearedStateCookie());
    return res;
  } catch (err) {
    console.error(
      "[auth/github] 建立会话失败：",
      err instanceof Error ? err.message : err,
    );
    return fail("SESSION_FAILED", "登录没能完成，请稍后再试。");
  }
}

export const GET = withStorageGuard(__guardedGET);
