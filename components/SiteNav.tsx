"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DoorOpen, Menu, X } from "lucide-react";

import { useLang } from "@/lib/i18n";
import { useRoom } from "./RoomProvider";
import AccountMenu from "./AccountMenu";
import { useSignOut } from "./useSignOut";

/**
 * 全局导航栏
 * ==================================================================
 * 设计说明（详见 docs/navigation-README.md）：
 *   · 导航项按「模式」划分：展示（/）与 制作（/make），对应浏览与创作两种意图
 *   · 整条导航无彩色 —— 饱和色不用于导航，橙色只留给「状态」
 *     （当前页小圆点、步骤条当前步、制作页的「打开 Agent 接入台」按钮）
 *   · 主 CTA「制作」用墨色药丸：层级来自明度对比而非色相
 *   · 文案内联在此，不改动受保护的 lib/i18n.tsx
 */

const COPY = {
  zh: {
    showcase: "展示",
    make: "制作",
    templates: "模版",
    agent: "Agent",
    room: "My Room",
    signIn: "登录",
    signUp: "注册",
    menu: "菜单",
    close: "关闭菜单",
    profile: "个人主页",
    signOut: "退出登录",
    /* 语言按钮的 aria-label：**当前处于哪种语言**，就写「切到另一种」 */
    switchToEn: "切换到英文",
    switchToZh: "Switch to Chinese",
  },
  en: {
    showcase: "Showcase",
    make: "Make",
    templates: "Templates",
    agent: "Agent",
    room: "My Room",
    signIn: "Sign in",
    signUp: "Sign up",
    menu: "Menu",
    close: "Close menu",
    profile: "Profile",
    signOut: "Sign out",
    switchToEn: "Switch to English",
    switchToZh: "Switch to Chinese",
  },
} as const;

/* 登录态：session 存在 httpOnly cookie 里，前端拿不到 token，只能问服务端。
   这里取一次，同时喂给「工具区」（要不要露 My Room）和「账号菜单」（头像/用户名）。 */
export type NavUser = {
  handle: string;
  displayName: string;
  avatarColor: string;
} | null;

/* 导航项两种状态：
   NAV_PILL  = 当前页（全站唯一的高亮，跟随路由）
   NAV_PLAIN = 非当前页（纯文字，悬停变实色） */
const NAV_PILL =
  "rounded-full bg-[#1C2329] px-[18px] py-[9px] text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#F8F4EC] shadow-[0_4px_12px_-6px_rgba(28,35,41,0.5)] transition-colors hover:bg-[#0d1116]";
const NAV_PLAIN =
  "rounded-full px-2.5 py-2 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#1C2329]/50 transition-colors hover:text-[#1C2329]";

export default function SiteNav() {
  const pathname = usePathname();
  const { lang, toggleLang } = useLang();
  const { openRoom } = useRoom();
  const { signOut, busy: signOutBusy } = useSignOut();

  const copy = COPY[lang];

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);

  /* 登录态（见 NavUser 的注释）：问一次服务端就够了 */
  const [me, setMe] = useState<NavUser>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive) return;
        setMe(data?.user ?? null);
      })
      .catch(() => {
        if (alive) setMe(null);
      })
      .finally(() => {
        if (alive) setAuthLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loggedIn = Boolean(me);

  const isShowcase = pathname === "/" || pathname === "/gallery";
  const isMake = pathname === "/make";
  const isTemplates = pathname === "/templates";
  const isAgents = pathname === "/agents";

  /* 同步 <html lang>：布局里的 <html lang="en"> 是静态的，
     语言切换后不跟随会影响读屏软件与搜索引擎。
     放在这里而不是受保护的 lib/i18n.tsx 里。 */
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  /* 滚动超过 40px 切成实底（rAF 节流，避免滚动抖动） */
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setScrolled(window.scrollY > 40);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* 移动端菜单：锁背景滚动 + Esc 关闭 + 关闭后焦点归还汉堡按钮 */
  useEffect(() => {
    if (!menuOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        burgerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /* 路由变化时收起移动端菜单 */
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const shell = scrolled
    ? "bg-[#F8F4EC]/88 backdrop-blur-md border-b border-[#1C2329]/10"
    : "bg-transparent border-b border-transparent";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${shell}`}
      >
        <div className="mx-auto flex h-[60px] w-full max-w-[1600px] items-center gap-2 px-5 sm:px-8">
          {/* 品牌 */}
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 font-serif text-[18px] leading-none tracking-tight text-[#1C2329]"
            aria-label="halloCD"
          >
            <span
              aria-hidden
              className="relative block h-[21px] w-[21px] rounded-full shadow-[inset_0_0_0_1px_rgba(28,35,41,0.14),0_2px_5px_rgba(28,35,41,0.18)]"
              style={{
                background:
                  "conic-gradient(from 210deg,#f0c37a,#e8875c,#c9556f,#8b5ea8,#5b8bc4,#6fbf9a,#f0c37a)",
              }}
            >
              <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(248,244,236,1)_0_18%,rgba(248,244,236,0.55)_19%_26%,transparent_27%)]" />
            </span>
            halloCD
            <sup className="relative -top-[0.55em] text-[9px] font-semibold tracking-[0.06em] text-[#1C2329]/40">
              ®
            </sup>
          </Link>

          {/* 导航项（桌面）
              规则：墨色药丸 = 当前页，全站唯一的高亮，跟着路由走。
              之前把药丸当成「制作」的固定 CTA 样式，导致在首页上
              「展示的当前页标记」和「制作的药丸」同时像被选中。 */}
          <nav className="ml-7 hidden items-center gap-1.5 md:flex">
            <Link
              href="/"
              aria-current={isShowcase ? "page" : undefined}
              className={isShowcase ? NAV_PILL : NAV_PLAIN}
            >
              {copy.showcase}
            </Link>

            <Link
              href="/make"
              aria-current={isMake ? "page" : undefined}
              className={isMake ? NAV_PILL : NAV_PLAIN}
            >
              {copy.make}
            </Link>

            <Link
              href="/templates"
              aria-current={isTemplates ? "page" : undefined}
              className={isTemplates ? NAV_PILL : NAV_PLAIN}
            >
              {copy.templates}
            </Link>

            <Link
              href="/agents"
              aria-current={isAgents ? "page" : undefined}
              className={isAgents ? NAV_PILL : NAV_PLAIN}
            >
              {copy.agent}
            </Link>
          </nav>

          <div className="flex-1" />

          {/* 工具区
              未登录 → 「登录」「注册」两个入口，**不显示 My Room**
                （My Room 是登录后的私人空间 —— 访客看到它只会点进一个空房间，
                  该给的是「去登录 / 去注册」）
              已登录 → My Room + 语言 + 账号菜单 */}
          <div className="hidden items-center gap-2 md:flex">
            {!authLoaded ? (
              /* 占位，避免登录态查回来时整排按钮跳一下 */
              <span className="inline-block h-[34px] w-[132px]" aria-hidden />
            ) : loggedIn ? (
              <button
                type="button"
                onClick={openRoom}
                className="flex h-[34px] items-center gap-2 rounded-full border border-[#1C2329]/15 bg-white/60 px-3.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] transition-colors hover:border-[#1C2329]/30 hover:bg-white"
              >
                <DoorOpen className="h-3.5 w-3.5" strokeWidth={1.6} />
                {copy.room}
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="flex h-[34px] items-center gap-2 rounded-full border border-[#1C2329]/15 bg-white/60 px-3.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] transition-colors hover:border-[#1C2329]/30 hover:bg-white"
                >
                  {copy.signIn}
                </Link>
                <Link
                  href="/signup"
                  className="flex h-[34px] items-center gap-2 rounded-full border border-[#1C2329]/15 bg-white/60 px-3.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] transition-colors hover:border-[#1C2329]/30 hover:bg-white"
                >
                  {copy.signUp}
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={toggleLang}
              aria-label={lang === "zh" ? copy.switchToEn : copy.switchToZh}
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[#1C2329]/15 bg-white/60 text-[11px] font-semibold tracking-[0.06em] text-[#1C2329] transition-colors hover:border-[#1C2329]/30 hover:bg-white"
            >
              {lang === "zh" ? "中" : "EN"}
            </button>
            <AccountMenu lang={lang} me={me} loaded={authLoaded} />
          </div>

          {/* 汉堡（移动端） */}
          <button
            ref={burgerRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={copy.menu}
            aria-expanded={menuOpen}
            className="ml-auto flex h-[34px] w-[34px] items-center justify-center rounded-full border border-[#1C2329]/15 bg-white/60 text-[#1C2329] md:hidden"
          >
            <Menu className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>
      </header>

      {/* 移动端全屏菜单 */}
      {menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={copy.menu}
          className="fixed inset-0 z-[60] flex flex-col bg-[#F8F4EC]/97 px-6 pb-8 pt-5 backdrop-blur-xl md:hidden"
        >
          <div className="flex items-center">
            <span className="flex items-center gap-2.5 font-serif text-[18px] leading-none text-[#1C2329]">
              <span
                aria-hidden
                className="relative block h-[21px] w-[21px] rounded-full shadow-[inset_0_0_0_1px_rgba(28,35,41,0.14)]"
                style={{
                  background:
                    "conic-gradient(from 210deg,#f0c37a,#e8875c,#c9556f,#8b5ea8,#5b8bc4,#6fbf9a,#f0c37a)",
                }}
              />
              halloCD
            </span>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                burgerRef.current?.focus();
              }}
              aria-label={copy.close}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full border border-[#1C2329]/15 bg-white/60 text-[#1C2329]"
            >
              <X className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </div>

          <nav className="mt-8 flex flex-col">
            <Link
              href="/"
              className="flex items-center justify-between border-b border-[#1C2329]/8 py-3.5 font-serif text-[28px] italic text-[#1C2329]"
            >
              {copy.showcase}
              {isShowcase ? (
                <span className="h-[5px] w-[5px] rounded-full bg-[#E65100]" />
              ) : (
                <span className="text-[10px] font-sans uppercase tracking-[0.18em] text-[#1C2329]/35">
                  Home
                </span>
              )}
            </Link>
            <Link
              href="/make"
              className="flex items-center justify-between border-b border-[#1C2329]/8 py-3.5 font-serif text-[28px] italic text-[#1C2329]"
            >
              {copy.make}
              {isMake ? (
                <span className="h-[5px] w-[5px] rounded-full bg-[#E65100]" />
              ) : (
                <span className="text-[10px] font-sans uppercase tracking-[0.18em] text-[#1C2329]/35">
                  Make
                </span>
              )}
            </Link>
            <Link
              href="/templates"
              className="flex items-center justify-between border-b border-[#1C2329]/8 py-3.5 font-serif text-[28px] italic text-[#1C2329]"
            >
              {copy.templates}
              {isTemplates ? (
                <span className="h-[5px] w-[5px] rounded-full bg-[#E65100]" />
              ) : (
                <span className="text-[10px] font-sans uppercase tracking-[0.18em] text-[#1C2329]/35">
                  Templates
                </span>
              )}
            </Link>
            <Link
              href="/agents"
              className="flex items-center justify-between border-b border-[#1C2329]/8 py-3.5 font-serif text-[28px] italic text-[#1C2329]"
            >
              {copy.agent}
              {isAgents ? (
                <span className="h-[5px] w-[5px] rounded-full bg-[#E65100]" />
              ) : (
                <span className="text-[10px] font-sans uppercase tracking-[0.18em] text-[#1C2329]/35">
                  Agent
                </span>
              )}
            </Link>
          </nav>

          <div className="mt-auto border-t border-[#1C2329]/8 pt-5">
            {/* 账号入口：桌面端是头像悬停下拉，移动端没有 hover，
                所以在这里补一份「个人主页 / 退出登录」。 */}
            {me ? (
              <div className="mb-4 flex gap-2">
                <Link
                  href={`/u/${me.handle}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex h-[42px] flex-1 items-center justify-center rounded-full border border-[#1C2329]/15 bg-white/60 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329]"
                >
                  {copy.profile}
                </Link>
                <button
                  type="button"
                  disabled={signOutBusy}
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut();
                  }}
                  className="flex h-[42px] flex-1 items-center justify-center rounded-full border border-[#1C2329]/15 bg-white/60 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] disabled:opacity-50"
                >
                  {copy.signOut}
                </button>
              </div>
            ) : null}

            <div className="flex gap-2">
              {loggedIn ? (
                <button
                  type="button"
                  onClick={() => {
                    openRoom();
                    setMenuOpen(false);
                  }}
                  className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-full border border-[#1C2329]/15 bg-white/60 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329]"
                >
                  <DoorOpen className="h-3.5 w-3.5" strokeWidth={1.6} />
                  {copy.room}
                </button>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-full border border-[#1C2329]/15 bg-white/60 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329]"
                  >
                    {copy.signIn}
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setMenuOpen(false)}
                    className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-full border border-[#1C2329]/15 bg-white/60 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329]"
                  >
                    {copy.signUp}
                  </Link>
                </>
              )}
              <button
                type="button"
                onClick={toggleLang}
                aria-label={lang === "zh" ? copy.switchToEn : copy.switchToZh}
                className="h-[42px] w-[42px] rounded-full border border-[#1C2329]/15 bg-white/60 text-[11px] font-semibold text-[#1C2329]"
              >
                {lang === "zh" ? "中" : "EN"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
