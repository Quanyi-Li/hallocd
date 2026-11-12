"use client";

import { useState } from "react";

/**
 * 登出
 * ==================================================================
 * POST /api/auth/logout 会删掉 session 并清掉 cookie。
 *
 * 为什么登出后是**整页跳转**而不是 router.push("/")：
 *   导航栏的登录态是客户端 fetch /api/auth/me 拿的（SiteNav 里那个
 *   「只问一次」的 effect），客户端路由不会重新触发它 ——
 *   留在原地的话，导航栏上那个头像会一直挂着，直到用户手动刷新。
 *   整页刷新才能让「登录 / 注册」立刻回到导航栏。
 */
export function useSignOut() {
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      /* 请求失败也照样回首页 —— 真正的登录态由服务端会话决定 */
    }
    setBusy(false);
    window.location.assign("/");
  };

  return { signOut, busy };
}
