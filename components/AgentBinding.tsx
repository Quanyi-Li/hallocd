"use client";

import { useCallback, useEffect, useState } from "react";

import { useLang } from "@/lib/i18n";

/**
 * 个人主页 · 「我的 Agent」绑定面板
 * ==================================================================
 * 把一把 API key 绑到当前用户名下 —— agent 用它下的单，
 * 会出现在这个人的主页上。
 *
 * key 只在签发的那一次响应里出现，之后前端只能看到掩码。
 */

type KeyRow = {
  label: string;
  origin: string;
  handle: string | null;
  createdAt: string;
  masked: string;
};

const COPY = {
  zh: {
    issue: "签发新 key",
    working: "处理中…",
    issueFailed: "签发失败",
    networkError: "网络错误",
    onceOnly: "只显示这一次",
    copyInto: "复制走，然后放进你的 agent 配置：",
    goneAfter: "。关掉这个提示后就看不到了。",
    copyAndClose: "复制并关闭",
    loading: "加载中…",
    noKeys: "还没有 key。签发一把之后，你的 coding agent 就能替你下单、送礼。",
    revoke: "吊销",
    thenZip: "然后把",
    thenZipAfter:
      "装进你的 coding agent —— 它读完 SKILL.md 就会自己来读目录、下单、付款。",
    keyLabel: "我的 agent",
  },
  en: {
    issue: "Issue a new key",
    working: "Working…",
    issueFailed: "Issue failed",
    networkError: "Network error",
    onceOnly: "Shown only once",
    copyInto: "Copy it into your agent's configuration:",
    goneAfter: ". Close this and it is gone.",
    copyAndClose: "Copy and close",
    loading: "Loading…",
    noKeys:
      "No keys yet. Issue one and your coding agent can order and send CDs for you.",
    revoke: "Revoke",
    thenZip: "Then put",
    thenZipAfter:
      "into your coding agent — once it reads SKILL.md it will fetch the catalog, order and pay on its own.",
    keyLabel: "My agent",
  },
};

export default function AgentBinding() {
  const { lang } = useLang();
  const copy = COPY[lang];

  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/v1/keys", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setKeys([]);
        return;
      }
      const data = await res.json();
      setKeys(Array.isArray(data.keys) ? data.keys : []);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const issue = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/agent/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ label: copy.keyLabel }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(
          data.message ||
            (lang === "zh"
              ? `${copy.issueFailed}（HTTP ${res.status}）`
              : `${copy.issueFailed} (HTTP ${res.status})`),
        );
        return;
      }
      setFreshKey(data.key);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.networkError);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (key: string) => {
    setBusy(true);
    setError("");
    try {
      await fetch("/api/agent/v1/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ key }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.networkError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 border-t border-[#1C2329]/10 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/45">
          API Key
        </h3>
        <button
          type="button"
          onClick={issue}
          disabled={busy}
          className="rounded-full bg-[#1C2329] px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640] disabled:opacity-60"
        >
          {busy ? copy.working : copy.issue}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-[#C62828]/25 bg-[#C62828]/[0.05] px-3 py-2 text-[12.5px] text-[#C62828]">
          {error}
        </p>
      ) : null}

      {freshKey ? (
        <div className="mt-4 rounded-xl border border-[#E65100]/30 bg-[#E65100]/[0.05] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#E65100]">
            {copy.onceOnly}
          </p>
          <code className="mt-2 block break-all rounded-lg bg-white/70 px-3 py-2 font-mono text-[12px] text-[#1C2329]">
            {freshKey}
          </code>
          <p className="mt-2 text-[12px] leading-relaxed text-[#1C2329]/55">
            {copy.copyInto}
            <code className="font-mono text-[11.5px]">
              Authorization: Bearer &lt;key&gt;
            </code>
            {copy.goneAfter}
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(freshKey);
              setFreshKey(null);
            }}
            className="mt-3 rounded-full border border-[#1C2329]/20 bg-white/70 px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] transition hover:bg-white"
          >
            {copy.copyAndClose}
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="text-[12.5px] text-[#1C2329]/40">{copy.loading}</p>
        ) : keys.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-[#1C2329]/45">
            {copy.noKeys}
          </p>
        ) : (
          keys.map((k) => (
            <div
              key={k.masked}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1C2329]/10 bg-white/60 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{k.label}</p>
                <p className="mt-0.5 font-mono text-[10.5px] text-[#1C2329]/40">
                  {k.masked} · {k.createdAt.slice(0, 10)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revoke(k.masked.replace("…", ""))}
                disabled={busy}
                className="rounded-full border border-[#1C2329]/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1C2329]/50 transition hover:border-[#C62828]/40 hover:text-[#C62828] disabled:opacity-50"
              >
                {copy.revoke}
              </button>
            </div>
          ))
        )}
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-[#1C2329]/45">
        {copy.thenZip} <code className="font-mono">halloCD-agent-skill.zip</code>{" "}
        {copy.thenZipAfter}
      </p>
    </div>
  );
}
