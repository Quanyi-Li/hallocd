"use client";

import { useState } from "react";

import { useLang } from "@/lib/i18n";

/**
 * 个人主页 · 本人可见的编辑区
 * ==================================================================
 * 改昵称 / 简介 / agent 介绍。保存走 /api/auth/me 的 PATCH。
 */

type Props = {
  user: {
    id: string;
    handle: string;
    displayName: string;
    bio: string;
    agentNote: string;
    avatarColor: string;
  };
};

const COLORS = ["#E65100", "#8B5852", "#2E3A31", "#1B3A6B", "#AF8E5C", "#C2185B"];

const COPY = {
  zh: {
    section: "编辑我的主页",
    displayName: "显示名",
    avatarColor: "头像色",
    bio: "简介",
    bioPlaceholder: "一句话介绍自己",
    agentNote: "我的 Agent 介绍",
    agentNotePlaceholder: "TA 的 agent 是做什么的 —— 会展示在主页上",
    saving: "保存中…",
    save: "保存",
    saved: "已保存",
    saveFailed: "保存失败",
    networkError: "网络错误",
  },
  en: {
    section: "Edit my profile",
    displayName: "Display name",
    avatarColor: "Avatar color",
    bio: "Bio",
    bioPlaceholder: "One line about you",
    agentNote: "My agent introduction",
    agentNotePlaceholder: "What their agent does — shown on your profile",
    saving: "Saving…",
    save: "Save",
    saved: "Saved",
    saveFailed: "Save failed",
    networkError: "Network error",
  },
};

export default function ProfileEditor({ user }: Props) {
  const { lang } = useLang();
  const copy = COPY[lang];

  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio);
  const [agentNote, setAgentNote] = useState(user.agentNote);
  const [avatarColor, setAvatarColor] = useState(user.avatarColor);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ displayName, bio, agentNote, avatarColor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setStatus(
          data.message ||
            (lang === "zh"
              ? `${copy.saveFailed}（HTTP ${res.status}）`
              : `${copy.saveFailed} (HTTP ${res.status})`),
        );
        return;
      }
      setStatus(copy.saved);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : copy.networkError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={save}
      className="mt-6 space-y-4 border-t border-[#1C2329]/10 pt-6"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/45">
        {copy.section}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1C2329]/45">
            {copy.displayName}
          </span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-black/10 bg-[#FDFBF5] px-4 py-2.5 text-[14px] outline-none transition focus:border-[#E65100]/60"
          />
        </label>

        <div>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1C2329]/45">
            {copy.avatarColor}
          </span>
          <div className="mt-2 flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAvatarColor(c)}
                aria-label={c}
                className={`h-7 w-7 rounded-full transition ${
                  avatarColor === c
                    ? "ring-2 ring-[#1C2329] ring-offset-2 ring-offset-[#F8F4EC]"
                    : "opacity-70 hover:opacity-100"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1C2329]/45">
          {copy.bio}
        </span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={2}
          placeholder={copy.bioPlaceholder}
          className="mt-1.5 w-full resize-y rounded-xl border border-black/10 bg-[#FDFBF5] px-4 py-2.5 text-[14px] outline-none transition placeholder:text-[#1C2329]/25 focus:border-[#E65100]/60"
        />
      </label>

      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1C2329]/45">
          {copy.agentNote}
        </span>
        <textarea
          value={agentNote}
          onChange={(e) => setAgentNote(e.target.value)}
          rows={2}
          placeholder={copy.agentNotePlaceholder}
          className="mt-1.5 w-full resize-y rounded-xl border border-black/10 bg-[#FDFBF5] px-4 py-2.5 text-[14px] outline-none transition placeholder:text-[#1C2329]/25 focus:border-[#E65100]/60"
        />
      </label>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-[#1C2329] px-6 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640] disabled:opacity-60"
        >
          {busy ? copy.saving : copy.save}
        </button>
        {status ? (
          <span className="text-[12.5px] text-[#1C2329]/55">{status}</span>
        ) : null}
      </div>
    </form>
  );
}
