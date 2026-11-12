"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bot,
  Check,
  Copy,
  Download,
  KeyRound,
  Loader2,
  LogOut,
  Package,
  X,
} from "lucide-react";

import { useLang } from "@/lib/i18n";
import HandoffPanel from "./HandoffPanel";

/**
 * halloCD · Agent 接入台
 * ==================================================================
 * 这个页面回答一个问题：**「我的 agent 怎么接进来？它现在在干什么？」**
 *
 * 两态：
 *   · 未绑定 → 一步步教用户：装技能包 → 签发 key → 配到 agent 里
 *   · 已绑定 → 看 agent 的活动流水（它调了哪些接口、成了没成、花了多少）
 *
 * ------------------------------------------------------------------
 * 设计语言（与全站一致）：
 *   · 米色 #F8F4EC / 墨色 #1C2329 / 橙色 #E65100
 *   · 标题用 serif italic
 *   · 橙色只用于「状态」（当前页圆点、失败标记），不做装饰
 *   · 墨色药丸留给页内主行动（签发 / 复制），导航里代表「当前页」
 */

type Summary = {
  totalCalls: number;
  lastActiveAt: string | null;
  ordersCreated: number;
  ordersPaid: number;
  failed: number;
  spentAmount: string;
  currency: string;
  inFlight: number;
};

type ActivityRow = {
  id: string;
  action: string;
  method: string;
  path: string;
  orderId: string | null;
  statusCode: number;
  ok: boolean;
  detail: string;
  durationMs: number;
  createdAt: string;
  keyLabel: string;
};

type KeyRow = {
  label: string;
  createdAt: string;
  lastActiveAt: string | null;
};

type Me = { handle: string; displayName: string } | null;

const COPY = {
  zh: {
    eyebrow: "YOUR OWN AGENT",
    title: "Agent 接入台",
    lead: "halloCD 不在平台上跑 AI。你的 coding agent 直接调我们的接口 —— 理解、定时任务、催办，全都住在你自己的机器上。",
    signInTitle: "先登录，再绑定你的 agent",
    signInLead: "key 要绑在你的用户名下 —— agent 用它下的单，才会出现在你的主页上。",
    signIn: "登录",
    signUp: "注册",
    /* v2.9.3：把访客往交接面板上引 —— 别让登录墙把「下单入口」藏起来 */
    guestHandoffHint:
      "还没登录也能先把参数备好 —— 下面那块「交接」面板就是下单入口，填好收件人、场景和日期，点「复制下单参数」发给你的 agent 就行。真正下单需要一把 key，登录后在上方签发。",
    step1: "① 装技能包",
    step1Lead: "下载 zip，解压后得到 halloCD/ 目录（含 SKILL.md 与参考资料）。",
    step1How: "把这个目录放进你的 agent 的技能目录（Claude Code 是 ~/.claude/skills/），或者直接把 SKILL.md 贴给它。",
    step2: "② 签发一把 key",
    step2Lead: "key 只在签发的那一次出现。之后所有 /api/agent/v1/* 请求都要带上它。",
    issue: "签发新 key",
    step3: "③ 配到你的 agent 里",
    step3Lead: "把这两行放进 agent 的环境变量，再把这句提示词发给它。",
    envLabel: "环境变量",
    promptLabel: "发给 agent 的第一句话",
    copyEnv: "复制环境变量",
    copyPrompt: "复制提示词",
    copied: "已复制",
    oneShot: "复制连接信息",
    oneShotLead: "把 URL、key 和提示词一起复制走 —— 粘到 agent 的配置里就能用。",
    keyOnlyOnce: "只显示这一次",
    keyOnlyOnceLead: "关掉这个提示后就看不到了。如果丢了，吊销旧的再签一把新的。",
    download: "下载技能包",
    activity: "Agent 活动",
    activityEmpty: "还没有任何调用记录 —— agent 装好之后，它每调一次接口这里就会多一行。",
    noKeys: "还没有绑定的 agent。",
    calls: "调用",
    orders: "建单",
    paid: "已付",
    spent: "已花",
    lastSeen: "最近活跃",
    never: "还没动过",
    keyList: "已绑定的 key",
    revoke: "吊销",
    revokeDone: "已吊销",
    inFlight: "在途",
    failed: "失败",
    total: "共",
    items: "条记录",
    actions: {
      "catalog.read": "读目录",
      "order.create": "建单",
      "order.list": "查订单列表",
      "order.read": "查订单",
      "order.pay": "付款",
      "shipment.update": "推进物流",
      "key.manage": "管理 key",
      other: "其他调用",
    } as Record<string, string>,
    actionsEn: {
      "catalog.read": "Read catalog",
      "order.create": "Create order",
      "order.list": "List orders",
      "order.read": "Read order",
      "order.pay": "Pay",
      "shipment.update": "Update shipment",
      "key.manage": "Manage keys",
      other: "Other call",
    } as Record<string, string>,
    order: "订单",
    goMake: "去做一张 CD →",
  },
  en: {
    eyebrow: "YOUR OWN AGENT",
    title: "Agent desk",
    lead: "halloCD runs no AI on the platform. Your coding agent calls our API directly — understanding, scheduled tasks and reminders all live on your machine.",
    signInTitle: "Sign in first, then bind your agent",
    signInLead: "The key is bound to your handle — orders your agent places with it show up on your profile.",
    signIn: "Sign in",
    signUp: "Sign up",
    /* v2.9.3: point guests at the handoff panel — don't let the sign-in wall hide the order entry */
    guestHandoffHint:
      "You can prepare the payload without signing in — the handoff panel below is the order entry. Fill in receiver, scene and delivery date, then hit \"Copy order payload\" and send it to your agent. Placing the actual order needs a key, which you can issue above once signed in.",
    step1: "① Install the skill",
    step1Lead: "Download the zip — unzipping gives you a halloCD/ folder (SKILL.md plus references).",
    step1How: "Drop that folder into your agent's skills directory (Claude Code: ~/.claude/skills/), or just paste SKILL.md to it.",
    step2: "② Issue a key",
    step2Lead: "The key appears exactly once. Every /api/agent/v1/* call must carry it.",
    issue: "Issue a new key",
    step3: "③ Wire it into your agent",
    step3Lead: "Put these two lines in your agent's environment, then send it the prompt.",
    envLabel: "Environment",
    promptLabel: "First message to your agent",
    copyEnv: "Copy environment",
    copyPrompt: "Copy prompt",
    copied: "Copied",
    oneShot: "Copy connection details",
    oneShotLead: "Copy the URL, the key and the prompt together — paste it into your agent's config.",
    keyOnlyOnce: "Shown only once",
    keyOnlyOnceLead: "Close this and it is gone. If you lose it, revoke and issue a new one.",
    download: "Download the skill",
    activity: "Agent activity",
    activityEmpty: "No calls yet — once your agent is wired up, every API call shows up here.",
    noKeys: "No agent bound yet.",
    calls: "Calls",
    orders: "Orders",
    paid: "Paid",
    spent: "Spent",
    lastSeen: "Last active",
    never: "not yet",
    keyList: "Bound keys",
    revoke: "Revoke",
    revokeDone: "Revoked",
    inFlight: "In flight",
    failed: "Failed",
    total: "Total",
    items: "records",
    actions: {
      "catalog.read": "Read catalog",
      "order.create": "Create order",
      "order.list": "List orders",
      "order.read": "Read order",
      "order.pay": "Pay",
      "shipment.update": "Update shipment",
      "key.manage": "Manage keys",
      other: "Other call",
    } as Record<string, string>,
    actionsEn: {
      "catalog.read": "Read catalog",
      "order.create": "Create order",
      "order.list": "List orders",
      "order.read": "Read order",
      "order.pay": "Pay",
      "shipment.update": "Update shipment",
      "key.manage": "Manage keys",
      other: "Other call",
    } as Record<string, string>,
    order: "Order",
    goMake: "Make a CD →",
  },
} as const;

const SKILL_URL = "/halloCD-agent-skill.zip";

/** 时间显示：相对时间 + 绝对时间（tooltip） */
function when(iso: string | null, lang: "zh" | "en"): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return lang === "zh" ? "刚刚" : "just now";
  if (min < 60) return lang === "zh" ? `${min} 分钟前` : `${min}m ago`;
  const hour = Math.round(min / 60);
  if (hour < 24) return lang === "zh" ? `${hour} 小时前` : `${hour}h ago`;
  const day = Math.round(hour / 24);
  if (day < 30) return lang === "zh" ? `${day} 天前` : `${day}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export default function AgentConsole() {
  const { lang } = useLang();
  const copy = COPY[lang];

  const [me, setMe] = useState<Me>(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const origin =
    typeof window === "undefined" ? "" : window.location.origin;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/v1/activity", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setKeys([]);
        setActivity([]);
        setSummary(null);
        return;
      }
      const data = await res.json();
      setKeys(Array.isArray(data.keys) ? data.keys : []);
      setActivity(Array.isArray(data.activity) ? data.activity : []);
      setSummary(data.summary ?? null);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    if (!authLoaded) return;
    if (!me) {
      setLoading(false);
      return;
    }
    void load();
  }, [authLoaded, me, load]);

  const copyText = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {
        /* 复制不了就算了 —— 下面的文本是可见的，可以手动选中 */
      }
      document.body.removeChild(area);
    }
    setCopied(tag);
    window.setTimeout(() => setCopied(""), 2000);
  };

  const issue = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/agent/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          label: lang === "zh" ? "我的 agent" : "My agent",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(
          data?.message ||
            (lang === "zh"
              ? `签发失败（HTTP ${res.status}）`
              : `Issue failed (HTTP ${res.status})`),
        );
        return;
      }
      setFreshKey(data.key);
      void load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === "zh"
            ? "网络错误"
            : "Network error",
      );
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (label: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const rows = await fetch("/api/agent/v1/keys", {
        credentials: "same-origin",
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      const target = (rows?.keys ?? []).find(
        (k: { label: string; masked: string }) => k.label === label,
      );
      if (!target) {
        setError(
          lang === "zh" ? "找不到这把 key。" : "That key was not found.",
        );
        return;
      }
      await fetch("/api/agent/v1/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ key: target.masked.replace("…", "") }),
      });
      void load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : lang === "zh"
            ? "网络错误"
            : "Network error",
      );
    } finally {
      setBusy(false);
    }
  };

  /* ---------- 文本块 ---------- */
  const envBlock = (key?: string | null) =>
    [
      `HALLOCD_URL=${origin}`,
      `HALLOCD_KEY=${key || "<your key>"}`,
    ].join("\n");

  const promptBlock = (key?: string | null) =>
    lang === "zh"
      ? [
          `我用 halloCD（${origin}）。`,
          key ? `我的 key 是 ${key}。` : "",
          "请先读 halloCD 技能的 SKILL.md，再读一次目录给我报价。",
          "我确认金额之后，你再调付款接口把这张 CD 寄出去。",
          "（以后要看物流进度，就查 GET /api/agent/v1/orders/<orderId>。）",
        ]
          .filter(Boolean)
          .join("\n")
      : [
          `I use halloCD (${origin}).`,
          key ? `My key is ${key}.` : "",
          "Read the halloCD SKILL.md first, then read the catalog and quote me.",
          "Once I confirm the amount, call the pay endpoint and ship the CD.",
          "(Later, check progress with GET /api/agent/v1/orders/<orderId>.)",
        ]
          .filter(Boolean)
          .join("\n");

  /* ---------- 渲染 ---------- */
  const actionLabel = (action: string) =>
    lang === "en"
      ? (copy.actionsEn[action] ?? copy.actionsEn.other)
      : (copy.actions[action] ?? copy.actions.other);

  const statCards = summary
    ? [
        { label: copy.calls, value: String(summary.totalCalls) },
        { label: copy.orders, value: String(summary.ordersCreated) },
        { label: copy.spent, value: `${summary.spentAmount} ${summary.currency}` },
        { label: copy.inFlight, value: String(summary.inFlight) },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* ---------- 页头 ---------- */}
      <header className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-[#E65100]">
          {copy.eyebrow}
        </p>
        <h1 className="mt-3 font-serif text-4xl italic tracking-tight text-[#1C2329] md:text-5xl">
          {copy.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#1C2329]/55">
          {copy.lead}
        </p>
      </header>

      {error ? (
        <p className="mt-6 rounded-xl border border-[#C62828]/25 bg-[#C62828]/[0.05] px-4 py-3 text-[13px] text-[#C62828]">
          {error}
        </p>
      ) : null}

      {/* ---------- 访客 ---------- */}
      {authLoaded && !me ? (
        <section className="mt-10 rounded-2xl border border-[#1C2329]/10 bg-white/50 p-8 text-center">
          <Bot className="mx-auto h-8 w-8 text-[#1C2329]/25" strokeWidth={1.4} />
          <h2 className="mt-4 font-serif text-2xl italic text-[#1C2329]">
            {copy.signInTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#1C2329]/50">
            {copy.signInLead}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-full bg-[#1C2329] px-7 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640]"
            >
              {copy.signIn}
            </Link>
            <Link
              href="/signup"
              className="rounded-full border border-[#1C2329]/20 bg-white/70 px-7 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1C2329] transition hover:border-[#1C2329]/40"
            >
              {copy.signUp}
            </Link>
          </div>
          {/* 访客也能先交接 —— 下面那块面板就是「下单入口」，
              不该被登录墙挡在后面。真正下单才需要 key。 */}
          <p className="mx-auto mt-5 max-w-md text-[12px] leading-relaxed text-[#1C2329]/45">
            {copy.guestHandoffHint}
          </p>
        </section>
      ) : null}

      {/* ---------- 已登录 ---------- */}
      {authLoaded && me ? (
        <>
          {/* ===== 未绑定：一步步引导 ===== */}
          {!loading && keys.length === 0 ? (
            <section className="mt-10 space-y-6">
              {/* ① 技能包 */}
              <div className="rounded-2xl border border-[#1C2329]/10 bg-white/50 p-7">
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1C2329]/[0.06]">
                    <Package className="h-4 w-4 text-[#1C2329]" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-xl italic text-[#1C2329]">
                      {copy.step1}
                    </h2>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[#1C2329]/60">
                      {copy.step1Lead}
                    </p>
                    <p className="mt-2 text-[12px] leading-relaxed text-[#1C2329]/45">
                      {copy.step1How}
                    </p>
                    <a
                      href={SKILL_URL}
                      download
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1C2329] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {copy.download}
                    </a>
                  </div>
                </div>
              </div>

              {/* ② 签发 key */}
              <div className="rounded-2xl border border-[#1C2329]/10 bg-white/50 p-7">
                <div className="flex items-start gap-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1C2329]/[0.06]">
                    <KeyRound className="h-4 w-4 text-[#1C2329]" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-xl italic text-[#1C2329]">
                      {copy.step2}
                    </h2>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-[#1C2329]/60">
                      {copy.step2Lead}
                    </p>
                    <button
                      type="button"
                      onClick={issue}
                      disabled={busy}
                      className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#1C2329] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640] disabled:opacity-60"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="h-3.5 w-3.5" />
                      )}
                      {copy.issue}
                    </button>
                  </div>
                </div>
              </div>

              {/* 新 key 只显示一次 */}
              {freshKey ? (
                <div className="rounded-2xl border border-[#E65100]/30 bg-[#E65100]/[0.05] p-7">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E65100]">
                    {copy.keyOnlyOnce}
                  </p>
                  <code className="mt-3 block break-all rounded-lg bg-white/70 px-4 py-3 font-mono text-[13px] text-[#1C2329]">
                    {freshKey}
                  </code>
                  <p className="mt-2 text-[12px] leading-relaxed text-[#1C2329]/55">
                    {copy.keyOnlyOnceLead}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        copyText(envBlock(freshKey), "env")
                      }
                      className="inline-flex items-center gap-2 rounded-full bg-[#1C2329] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copied === "env" ? copy.copied : copy.copyEnv}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(promptBlock(freshKey), "prompt")
                      }
                      className="inline-flex items-center gap-2 rounded-full border border-[#1C2329]/20 bg-white/70 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] transition hover:border-[#1C2329]/40"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copied === "prompt" ? copy.copied : copy.copyPrompt}
                    </button>
                    <button
                      type="button"
                      onClick={() => setFreshKey(null)}
                      className="inline-flex items-center gap-2 rounded-full border border-[#1C2329]/12 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329]/50 transition hover:text-[#1C2329]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : null}

              {/* ③ 配到 agent 里 */}
              <div className="rounded-2xl border border-[#1C2329]/10 bg-white/50 p-7">
                <h2 className="font-serif text-xl italic text-[#1C2329]">
                  {copy.step3}
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#1C2329]/60">
                  {copy.step3Lead}
                </p>

                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/40">
                  {copy.envLabel}
                </p>
                <pre className="mt-1.5 overflow-x-auto rounded-lg bg-white/70 px-4 py-3 font-mono text-[12px] leading-relaxed text-[#1C2329]">
                  {envBlock()}
                </pre>

                <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/40">
                  {copy.promptLabel}
                </p>
                <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/70 px-4 py-3 font-mono text-[12px] leading-relaxed text-[#1C2329]">
                  {promptBlock()}
                </pre>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(envBlock(), "env2")}
                    className="inline-flex items-center gap-2 rounded-full bg-[#1C2329] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied === "env2" ? copy.copied : copy.copyEnv}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyText(promptBlock(), "prompt2")}
                    className="inline-flex items-center gap-2 rounded-full border border-[#1C2329]/20 bg-white/70 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] transition hover:border-[#1C2329]/40"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied === "prompt2" ? copy.copied : copy.copyPrompt}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {/* ===== 已绑定：活动信息 ===== */}
          {!loading && keys.length > 0 ? (
            <section className="mt-10 space-y-6">
              {/* 汇总 */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {statCards.map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl border border-[#1C2329]/10 bg-white/60 px-4 py-4"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1C2329]/40">
                      {s.label}
                    </p>
                    <p className="mt-1.5 font-serif text-2xl italic text-[#1C2329]">
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1C2329]/10 bg-white/50 px-5 py-4">
                <span className="inline-flex items-center gap-2 text-[12px] text-[#1C2329]/60">
                  <Activity className="h-4 w-4 text-[#1C2329]/40" strokeWidth={1.6} />
                  {copy.lastSeen}:{" "}
                  <strong className="font-semibold text-[#1C2329]">
                    {when(summary?.lastActiveAt ?? null, lang)}
                  </strong>
                  {summary && summary.failed > 0 ? (
                    <span className="text-[#C62828]">
                      · {copy.failed} {summary.failed}
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] text-[#1C2329]/40">
                  {copy.total} {activity.length} {copy.items}
                </span>
              </div>

              {/* 活动流水 */}
              <div className="rounded-2xl border border-[#1C2329]/10 bg-white/50 p-6">
                <h2 className="font-serif text-xl italic text-[#1C2329]">
                  {copy.activity}
                </h2>
                {activity.length === 0 ? (
                  <p className="mt-3 text-[13px] leading-relaxed text-[#1C2329]/45">
                    {copy.activityEmpty}
                  </p>
                ) : (
                  <ol className="mt-4 space-y-1.5">
                    {activity.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 odd:bg-white/50"
                      >
                        <span
                          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${row.ok ? "bg-[#1C2329]/30" : "bg-[#C62828]"}`}
                          aria-hidden
                        />
                        <span className="w-28 shrink-0 text-[11px] tabular-nums text-[#1C2329]/40">
                          {when(row.createdAt, lang)}
                        </span>
                        <span className="shrink-0 text-[12.5px] font-medium text-[#1C2329]">
                          {actionLabel(row.action)}
                        </span>
                        {row.detail ? (
                          <span className="shrink-0 font-mono text-[11px] text-[#1C2329]/45">
                            {row.detail}
                          </span>
                        ) : null}
                        {row.orderId ? (
                          <span className="shrink-0 font-mono text-[11px] text-[#1C2329]/40">
                            {row.orderId}
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-[#1C2329]/35">
                          {row.statusCode} · {row.durationMs}ms
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* key 列表 */}
              <div className="rounded-2xl border border-[#1C2329]/10 bg-white/50 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-serif text-xl italic text-[#1C2329]">
                    {copy.keyList}
                  </h2>
                  <button
                    type="button"
                    onClick={issue}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full bg-[#1C2329] px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640] disabled:opacity-60"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    {copy.issue}
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {keys.map((k) => (
                    <div
                      key={`${k.label}-${k.createdAt}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1C2329]/10 bg-white/60 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-[#1C2329]">
                          {k.label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#1C2329]/40">
                          {copy.lastSeen}: {when(k.lastActiveAt, lang)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => revoke(k.label)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#1C2329]/15 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1C2329]/50 transition hover:border-[#C62828]/40 hover:text-[#C62828] disabled:opacity-50"
                      >
                        <LogOut className="h-3 w-3" />
                        {copy.revoke}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* 复制连接信息 */}
              <div className="rounded-2xl border border-[#1C2329]/10 bg-white/50 p-6">
                <h2 className="font-serif text-xl italic text-[#1C2329]">
                  {copy.oneShot}
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#1C2329]/60">
                  {copy.oneShotLead}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      copyText(
                        `${envBlock()}\n\n${promptBlock()}`,
                        "all",
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-full bg-[#1C2329] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied === "all" ? copy.copied : copy.oneShot}
                  </button>
                  <a
                    href={SKILL_URL}
                    download
                    className="inline-flex items-center gap-2 rounded-full border border-[#1C2329]/20 bg-white/70 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] transition hover:border-[#1C2329]/40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {copy.download}
                  </a>
                </div>
              </div>
            </section>
          ) : null}

          {loading ? (
            <p className="mt-10 flex items-center justify-center gap-2 text-[13px] text-[#1C2329]/40">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.activity}…
            </p>
          ) : null}

          <div className="mt-10 text-center">
            <Link
              href="/make"
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1C2329]/45 underline decoration-[#1C2329]/20 underline-offset-4 transition hover:text-[#1C2329]"
            >
              {copy.goMake}
            </Link>
          </div>
        </>
      ) : null}

      {/* 交接：把做好的 CD 交给用户自己的 agent。
          v2.9.1 从 /make 搬过来 —— 交接本来就是「关于 agent 的事」，
          放在接入台里才顺：绑定、key、活动、交接收在一页。

          v2.9.3：**挪到登录分支外面**。
          原来它被关在 `me ?` 里，结果访客点「打开 Agent 接入台」只看到一堵
          登录墙 —— 用户问「下单按钮在哪」就是这么来的。
          复制下单参数不需要账号（/api/uploads 允许匿名上传），
          真正下单才需要 key —— 所以访客先把参数备好，是完全成立的用法。 */}
      <HandoffPanel signedIn={Boolean(me)} />
    </div>
  );
}
