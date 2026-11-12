import type { Metadata } from "next";

import AgentConsole from "@/components/AgentConsole";

/**
 * Agent 接入台 · /agents
 * ------------------------------------------------------------------
 * halloCD 不在平台上跑 AI。
 *
 * 这一页是**用户自己的 agent 的接入口**：
 *   · 还没绑 → 一步步教：装技能包 → 签发 key → 配到 agent 里
 *   · 绑好了 → 看它的活动流水：调了哪些接口、成了没成、花了多少
 *
 * 为什么要有「活动信息」：
 *   agent 跑在用户自己的机器上，网页这边看不见它的进程与定时任务。
 *   唯一能看见的痕迹是它**调用了平台接口** —— 把这些摊开给人看，
 *   用户才能确认「我的 agent 真的在帮我寄 CD，而不是在乱花钱」。
 */

export const metadata: Metadata = {
  title: "Agent 接入台 — Hallo CD",
  description:
    "把你自己的 coding agent 接进 halloCD：装技能包、签发 API key、查看 agent 的活动流水。平台不跑 AI —— 理解与定时任务都在你自己的 agent 里。",
};

export default function AgentsPage() {
  return (
    <main className="relative min-h-screen bg-[#F8F4EC] px-6 pb-28 pt-[96px] text-[#1C2329] sm:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <AgentConsole />
      </div>
    </main>
  );
}
