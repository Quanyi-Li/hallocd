import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import AgentBinding from "@/components/AgentBinding";
import ProfileCdCard from "@/components/ProfileCdCard";
import ProfileEditor from "@/components/ProfileEditor";
import LangText from "@/components/LangText";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

/**
 * 个人主页 · /u/<handle>
 * ------------------------------------------------------------------
 * 一个用户在这个平台上的地址。这里聚合三样东西：
 *   ① TA 的 agent 介绍（agent 绑定在用户名下）
 *   ② TA 制作的 CD（作为送礼人）
 *   ③ TA 收到的 CD（作为收件人）
 *
 * 这是「agent 能给人送礼物」这条线的落点 ——
 * agent 用绑定的 key 下单后，订单会出现在这里。
 *
 * 渲染策略（Cache Components / PPR）：
 *   · shell：用户名片 —— 用户查不到就 notFound()，此时还没开始流式输出，
 *     所以响应状态码能正确变成 404
 *   · 动态部分：订单列表与 agent 面板放进 <Suspense>，不阻塞首屏
 */

export const metadata: Metadata = {
  title: "Profile — Hallo CD",
  description:
    "halloCD 用户主页：TA 的 agent、TA 做的 CD、TA 收到的 CD。 / A halloCD profile: their agent, the CDs they made, the CDs they received.",
};

/** 允许阻塞渲染（这一页必须等请求期数据） */
export const instant = false;

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const user = await db.findUserByHandle(handle);

  if (!user) notFound();

  const displayName = user.displayName || user.handle;

  return (
    <main className="relative min-h-screen bg-[#F8F4EC] px-6 pb-28 pt-[96px] text-[#1C2329] sm:px-10">
      <div className="mx-auto w-full max-w-3xl">
        {/* ---- 名片（shell） ---- */}
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {/* 绑了 GitHub 就用 TA 的头像，没绑就用色块 + 首字母 */}
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full font-serif text-3xl italic text-white"
            style={{ background: user.avatarColor }}
          >
            {user.githubAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.githubAvatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              displayName.slice(0, 1).toUpperCase()
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#E65100]">
              Hallo CD · Profile
            </p>
            <h1 className="mt-1.5 font-serif text-4xl italic leading-tight">
              {displayName}
            </h1>
            <p className="mt-1 font-mono text-[12px] text-[#1C2329]/45">
              @{user.handle}
              <span className="mx-2 text-[#1C2329]/20">·</span>
              <LangText
                zh={`加入于 ${user.createdAt.slice(0, 10)}`}
                en={`Joined ${user.createdAt.slice(0, 10)}`}
              />
            </p>
            {user.bio ? (
              <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-[#1C2329]/70">
                {user.bio}
              </p>
            ) : null}
          </div>
        </header>

        {/* ---- 动态部分 ---- */}
        <Suspense fallback={<Skeleton />}>
          <ProfileBody
            userId={user.id}
            handle={user.handle}
            displayName={user.displayName}
            bio={user.bio}
            agentNote={user.agentNote}
            avatarColor={user.avatarColor}
          />
        </Suspense>

        {/* ---- 底部（shell） ---- */}
        <footer className="mt-14 border-t border-[#1C2329]/10 pt-6">
          <p className="font-mono text-[11px] leading-relaxed text-[#1C2329]/40">
            <LangText
              zh="收到一张 CD？便签上的「回一张 CD」会带你回到这里。"
              en="Got a CD? The “reply with a CD” note on it brings you right back here."
            />
            <br />
            <LangText zh="链接长这样：" en="The link looks like this: " />
            <span className="text-[#1C2329]/60">/r/&lt;token&gt;</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/templates"
              className="rounded-full border border-[#1C2329]/15 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition hover:border-[#1C2329]/35 hover:bg-white/60"
            >
              <LangText zh="下载 DIY 模版" en="Download DIY templates" />
            </Link>
            <Link
              href="/make"
              className="rounded-full border border-[#1C2329]/15 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition hover:border-[#1C2329]/35 hover:bg-white/60"
            >
              <LangText zh="做一张 CD" en="Make a CD" />
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

async function ProfileBody({
  userId,
  handle,
  displayName,
  bio,
  agentNote,
  avatarColor,
}: {
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  agentNote: string;
  avatarColor: string;
}) {
  const all = await db.listOrders(500);
  const made = all.filter((o) => o.senderHandle === handle);
  const received = all.filter((o) => o.receiverHandle === handle);

  const keys = (await db.listAgentKeys()).filter(
    (k) => k.userId === userId && !k.revoked,
  );

  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === userId;

  return (
    <>
      {/* ---- TA 的 agent ---- */}
      <section className="mt-10 rounded-2xl border border-[#1C2329]/10 bg-white/70 p-6">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#E65100]" />
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1C2329]/45">
            <LangText zh="TA 的 Agent" en="Their Agent" />
          </h2>
        </div>
        <p className="mt-3 font-serif text-lg italic leading-relaxed text-[#1C2329]/85">
          {agentNote || (
            <LangText
              zh="这个人还没有介绍自己的 Agent —— 也许 TA 的 agent 还在学怎么写腰封。"
              en="This person hasn't introduced their agent yet — maybe it's still learning how to write a belly band."
            />
          )}
        </p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-[#1C2329]/50">
          {keys.length > 0 ? (
            <LangText
              zh={`已绑定 ${keys.length} 个 Agent API key。用这些 key 下的订单，会出现在这个主页上。`}
              en={`${keys.length} Agent API key${keys.length > 1 ? "s" : ""} bound. Orders placed with those keys show up on this profile.`}
            />
          ) : (
            <LangText
              zh="还没有绑定 Agent API key。绑定后，TA 自己的 coding agent 就能替 TA 把一张 CD 送到你手上。"
              en="No Agent API key bound yet. Once there is one, their own coding agent can send a CD to you."
            />
          )}
        </p>

        {isOwner ? (
          <>
            <ProfileEditor
              user={{ id: userId, handle, displayName, bio, agentNote, avatarColor }}
            />
            <AgentBinding />
          </>
        ) : null}
      </section>

      {/* ---- 制作 / 收到 ---- */}
      <div className="mt-10 grid gap-8">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1C2329]/45">
              <LangText zh="TA 制作的 CD" en="CDs they made" />
            </h2>
            <span className="font-mono text-[11px] text-[#1C2329]/35">
              {made.length}
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {made.length === 0 ? (
              <Empty zh="还没有送出过 CD。" en="No CDs sent yet." />
            ) : (
              made.map((o) => (
                <ProfileCdCard
                  key={o.id}
                  order={o}
                  mode="made"
                  peerHandle={o.receiverHandle}
                />
              ))
            )}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1C2329]/45">
              <LangText zh="TA 收到的 CD" en="CDs they received" />
            </h2>
            <span className="font-mono text-[11px] text-[#1C2329]/35">
              {received.length}
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {received.length === 0 ? (
              <Empty
                zh="还没有收到 CD —— 也许有人在给你准备。"
                en="No CDs received yet — maybe someone is preparing one."
              />
            ) : (
              received.map((o) => (
                <ProfileCdCard
                  key={o.id}
                  order={o}
                  mode="received"
                  peerHandle={o.senderHandle}
                />
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div className="mt-10 space-y-4">
      <div className="h-44 animate-pulse rounded-2xl border border-[#1C2329]/[0.06] bg-white/40" />
      <div className="h-28 animate-pulse rounded-2xl border border-[#1C2329]/[0.06] bg-white/40" />
    </div>
  );
}

function Empty({ zh, en }: { zh: string; en: string }) {
  return (
    <p className="rounded-xl border border-dashed border-[#1C2329]/15 px-5 py-6 text-[13px] italic text-[#1C2329]/35">
      <LangText zh={zh} en={en} />
    </p>
  );
}
