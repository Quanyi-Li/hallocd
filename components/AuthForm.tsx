"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useLang } from "@/lib/i18n";

/**
 * 注册 / 登录表单
 * ------------------------------------------------------------------
 * 调 /api/auth/register 或 /api/auth/login，成功后跳到自己的主页。
 *
 * 另外提供 **GitHub OAuth** 入口（v2.8 / G18）：
 *   · 按钮的显示与否由 /api/auth/providers 决定 ——
 *     没配 GitHub 凭据的部署不显示这个按钮（点了也只会得到 503）。
 *   · 用的是原生 <a> 而不是 next/link —— OAuth 要走整页跳转，
 *     客户端路由会拦掉这次跳转、把 GitHub 的 302 吃掉。
 *
 * 文案：两种语言各一份，内联在此（受保护的 lib/i18n.tsx 不动）。
 */

type Mode = "login" | "signup";

/* 登录 / 注册两种语言的文案 */
const COPY = {
  zh: {
    signupTitle: "给自己一个名字。",
    loginTitle: "回来继续做。",
    signupLead:
      "用户名就是你在 halloCD 的地址 —— 你的个人主页、你的 agent、你收到的每一张 CD 都挂在这个名字下。",
    loginLead:
      "登录后可以绑定属于你的 coding agent，让它替你把一张 CD 送出去。",
    oauthError: "GitHub 登录失败，请重试。",
    handle: "用户名",
    handleHint: "3–24 位字母、数字、- 或 _。个人主页会是 /u/你的用户名。",
    email: "邮箱",
    password: "密码",
    passwordPlaceholder: "至少 8 位",
    requestFailed: "请求失败",
    networkError: "网络错误",
    waiting: "请稍候…",
    createAccount: "创建账号",
    signIn: "登录",
    or: "或",
    signupWithGithub: "用 GitHub 注册",
    loginWithGithub: "用 GitHub 登录",
    noPassword: "不用记密码 —— 用 GitHub 账号直接进。",
    haveAccount: "已经有账号了？",
    noAccount: "还没有账号？",
    goLogin: "去登录",
    goSignup: "去注册",
  },
  en: {
    signupTitle: "Give yourself a name.",
    loginTitle: "Welcome back.",
    signupLead:
      "Your handle is your address on halloCD — your profile, your agent and every CD you receive hang under this name.",
    loginLead:
      "Sign in to bind your own coding agent, so it can send a CD on your behalf.",
    oauthError: "GitHub sign-in failed. Please try again.",
    handle: "Handle",
    handleHint: "3–24 letters, digits, - or _. Your profile will be /u/your-handle.",
    email: "Email",
    password: "Password",
    passwordPlaceholder: "At least 8 characters",
    requestFailed: "Request failed",
    networkError: "Network error",
    waiting: "One moment…",
    createAccount: "Create account",
    signIn: "Sign in",
    or: "or",
    signupWithGithub: "Sign up with GitHub",
    loginWithGithub: "Sign in with GitHub",
    noPassword: "No password to remember — come in with your GitHub account.",
    haveAccount: "Already have an account?",
    noAccount: "No account yet?",
    goLogin: "Sign in",
    goSignup: "Sign up",
  },
} as const;

/** GitHub 官方 mark —— 一条路径，没有外部字体/图片依赖 */
function GitHubMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { lang } = useLang();
  const copy = COPY[lang];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  /* 这次部署有没有启用 GitHub 登录 —— null = 还没问出来 */
  const [githubEnabled, setGithubEnabled] = useState<boolean | null>(null);
  /* GitHub 回调失败时带的错误（从地址栏读，见下方 effect） */
  const [oauthError, setOauthError] = useState("");
  const [oauthMessage, setOauthMessage] = useState("");
  /* 登录完回哪去（v2.13：网页端结账强制先登录，结账页会把 ?next= 带过来） */
  const [nextPath, setNextPath] = useState<string | null>(null);

  const isSignup = mode === "signup";

  /* 挂载时做三件事：
     ① 问一次「这个部署支持哪些登录方式」
     ② 从地址栏捞 GitHub 回调失败时带回来的错误码
     ③ 从地址栏捞 ?next= —— 登录完要回原页（结账流程靠它把用户送回制作页）
     为什么从地址栏读而不是让服务端把 searchParams 传下来：
     那样会把 /login 变成动态页（每次都要等一趟服务端渲染），
     而错误信息本来就只需要显示一次 —— 客户端读一次就够了。 */
  useEffect(() => {
    let alive = true;

    const params = new URLSearchParams(window.location.search);
    const err = params.get("github_error");
    if (err) {
      setOauthError(err);
      setOauthMessage(params.get("github_message") ?? "");
    }

    /* ?next= 只认站内相对路径 —— 绝不能拿它当跳板把用户送到外站 */
    const raw = params.get("next");
    if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
      setNextPath(raw.slice(0, 300));
    }

    fetch("/api/auth/providers", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive) return;
        setGithubEnabled(Boolean(data?.providers?.github?.enabled));
      })
      .catch(() => {
        if (alive) setGithubEnabled(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      const res = await fetch(
        isSignup ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(
            isSignup ? { email, password, handle } : { email, password },
          ),
        },
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setError(
          data.message ||
            (lang === "zh"
              ? `${copy.requestFailed}（HTTP ${res.status}）`
              : `${copy.requestFailed} (HTTP ${res.status})`),
        );
        setBusy(false);
        return;
      }

      /* v2.13：带 ?next= 就回原页（结账流程：登录完直接回到结账那一步） */
      router.push(nextPath || data.profileUrl || "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.networkError);
      setBusy(false);
    }
  };

  /* GitHub 回调带回来的错误 —— 优先显示它 */
  const shownError = oauthMessage || error;

  return (
    <div className="mx-auto w-full max-w-md">
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#E65100]">
        Hallo CD · {isSignup ? "Create Account" : "Sign In"}
      </p>
      <h1 className="mt-3 font-serif text-4xl italic leading-tight">
        {isSignup ? copy.signupTitle : copy.loginTitle}
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-[#1C2329]/55">
        {isSignup ? copy.signupLead : copy.loginLead}
      </p>

      {oauthError ? (
        <p className="mt-6 rounded-xl border border-[#C62828]/25 bg-[#C62828]/[0.05] px-4 py-3 text-[13px] text-[#C62828]">
          {oauthMessage || copy.oauthError}
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-8 space-y-4">
        {isSignup ? (
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/45">
              {copy.handle}
            </span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="kok"
              autoComplete="username"
              className="mt-1.5 w-full rounded-xl border border-black/10 bg-[#FDFBF5] px-4 py-3 text-[15px] outline-none transition placeholder:text-[#1C2329]/25 focus:border-[#E65100]/60"
            />
            <span className="mt-1 block text-[11px] text-[#1C2329]/35">
              {copy.handleHint}
            </span>
          </label>
        ) : null}

        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/45">
            {copy.email}
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-[#FDFBF5] px-4 py-3 text-[15px] outline-none transition placeholder:text-[#1C2329]/25 focus:border-[#E65100]/60"
          />
        </label>

        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/45">
            {copy.password}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={copy.passwordPlaceholder}
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-[#FDFBF5] px-4 py-3 text-[15px] outline-none transition placeholder:text-[#1C2329]/25 focus:border-[#E65100]/60"
          />
        </label>

        {shownError && !oauthError ? (
          <p className="rounded-xl border border-[#C62828]/25 bg-[#C62828]/[0.05] px-4 py-3 text-[13px] text-[#C62828]">
            {shownError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-[#1C2329] px-8 py-4 text-[12px] font-bold uppercase tracking-[0.16em] text-[#F8F4EC] shadow-[0_18px_40px_-16px_rgba(28,35,41,.6)] transition hover:bg-[#2C3640] disabled:opacity-60"
        >
          {busy ? copy.waiting : isSignup ? copy.createAccount : copy.signIn}
        </button>
      </form>

      {githubEnabled ? (
        <>
          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-[#1C2329]/12" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#1C2329]/30">
              {copy.or}
            </span>
            <span className="h-px flex-1 bg-[#1C2329]/12" />
          </div>

          {/* 用原生 <a>：OAuth 需要整页跳转。
              v2.13：带 ?next= —— GitHub 登录完也要回原页（结账流程）。 */}
          <a
            href={`/api/auth/github${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`}
            className="flex w-full items-center justify-center gap-2.5 rounded-full border border-[#1C2329]/20 bg-white/70 px-8 py-4 text-[12px] font-bold uppercase tracking-[0.16em] text-[#1C2329] transition hover:border-[#1C2329]/40 hover:bg-white"
          >
            <GitHubMark className="h-[18px] w-[18px]" />
            {isSignup ? copy.signupWithGithub : copy.loginWithGithub}
          </a>
          <p className="mt-3 text-center text-[11.5px] leading-relaxed text-[#1C2329]/40">
            {copy.noPassword}
          </p>
        </>
      ) : null}

      <p className="mt-6 text-center text-[13px] text-[#1C2329]/50">
        {isSignup ? copy.haveAccount : copy.noAccount} {" "}
        <Link
          href={
            nextPath
              ? `${isSignup ? "/login" : "/signup"}?next=${encodeURIComponent(nextPath)}`
              : isSignup
                ? "/login"
                : "/signup"
          }
          className="font-semibold text-[#1C2329] underline decoration-[#1C2329]/25 underline-offset-4 hover:decoration-[#1C2329]"
        >
          {isSignup ? copy.goLogin : copy.goSignup}
        </Link>
      </p>
    </div>
  );
}
