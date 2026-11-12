"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, User } from "lucide-react";

import { useSignOut } from "./useSignOut";
import type { NavUser } from "./SiteNav";

/**
 * 导航栏右侧的账号菜单
 * ==================================================================
 * 已登录 → 头像药丸；**悬停展开下拉**（个人主页 / 退出登录）。
 *
 * 交互约定：
 *   · 悬停头像即展开，移出整个菜单区域即收起
 *     （触发器与面板是同一个 relative 容器里的两个子元素，
 *       中间 8px 的空隙也由外层透明 div 兜住，鼠标划过不会关掉菜单）
 *   · 点击也能开合 —— 触屏没有 hover，得给一条手动路径
 *   · Esc 收起、点到外面收起；键盘 Tab 移出菜单同样收起
 *
 * 登录态由 SiteNav 取一次（/api/auth/me）再传进来 ——
 * 导航栏要拿它决定「露不露 My Room」，两边共用一份请求，
 * 不要各拉一次。
 *
 * 注意：未登录时这里**什么都不渲染** ——
 * 「登录 / 注册」两个入口由 SiteNav 画在工具区里（那个位置原本是 My Room）。
 */

const COPY = {
  zh: { profile: "个人主页", signOut: "退出登录", menu: "账号菜单" },
  en: { profile: "Profile", signOut: "Sign out", menu: "Account menu" },
} as const;

export default function AccountMenu({
  lang,
  me,
  loaded,
}: {
  lang: "zh" | "en";
  me: NavUser;
  loaded: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { signOut, busy } = useSignOut();

  const copy = COPY[lang];

  /* 点外面 / 按 Esc → 收起 */
  useEffect(() => {
    if (!open) return;

    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!loaded) {
    // 占位，避免加载完闪一下
    return <span className="inline-block h-[34px] w-[70px]" aria-hidden />;
  }

  if (!me) {
    return null;
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        // 焦点离开整个菜单区域才收起（面板里的链接/按钮之间互移不算）
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={copy.menu}
        onClick={() => setOpen((v) => !v)}
        className="flex h-[34px] items-center gap-2 rounded-full border border-[#1C2329]/15 bg-white/60 pl-1.5 pr-3.5 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] transition-colors hover:border-[#1C2329]/30 hover:bg-white"
      >
        <span
          aria-hidden
          className="flex h-[24px] w-[24px] items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ background: me.avatarColor }}
        >
          {me.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[110px] truncate normal-case tracking-normal">
          {me.displayName}
        </span>
      </button>

      {open ? (
        /* 外层无背景：撑出 8px 的悬停缓冲，鼠标从触发器划到面板时菜单不会断 */
        <div className="absolute right-0 top-full z-50 pt-2">
          <div
            role="menu"
            aria-label={copy.menu}
            className="w-[186px] overflow-hidden rounded-xl border border-[#1C2329]/12 bg-white/95 p-1 shadow-[0_18px_40px_-18px_rgba(28,35,41,0.5)] backdrop-blur-md"
          >
            <Link
              href={`/u/${me.handle}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#1C2329] transition-colors hover:bg-[#1C2329]/[0.06]"
            >
              <User className="h-3.5 w-3.5" strokeWidth={1.7} />
              {copy.profile}
            </Link>

            <div className="mx-2 my-1 h-px bg-[#1C2329]/10" />

            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-[#1C2329] transition-colors hover:bg-[#1C2329]/[0.06] disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.7} />
              {copy.signOut}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
