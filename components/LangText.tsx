"use client";

import { useLang } from "@/lib/i18n";

/**
 * 按当前语言显示一段文案
 * ==================================================================
 * 为什么需要它：
 *   语言状态只存在 localStorage 里（受保护的 lib/i18n.tsx 不动），
 *   **服务端组件读不到它** —— /templates、/u/<handle>、/r/<token> 都是服务端页面，
 *   可它们的文案又必须跟着用户选的语言走。
 *
 *   所以把「这句话两种语言分别怎么说」一起交给客户端挑：
 *   服务端照常把两个版本传下去，客户端只渲染其中一个。
 *   首帧仍是中文（与 SSR 一致，不会 hydration 报错），挂载后切成用户选的语言。
 *
 * 什么时候用：
 *   · 已经是客户端组件 → 直接用 useLang() 写 COPY.zh / COPY.en（更顺）
 *   · 服务端组件里夹了一句要双语 → 用这个（省得为一个句子拆一个组件）
 *
 * 只接受纯字符串：需要插入元素或插值时，把整句拼好再传进来。
 */
export default function LangText({
  zh,
  en,
}: {
  zh: string;
  en: string;
}) {
  const { lang } = useLang();
  return <>{lang === "zh" ? zh : en}</>;
}
