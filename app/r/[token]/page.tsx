import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import LangText from "@/components/LangText";

/**
 * 回礼落地页 · /r/<token>
 * ------------------------------------------------------------------
 * 便签上那句「回一张 CD」的落点。
 *
 * 收到 CD 的人扫到 / 看到这个页面：
 *   ① 看到谁送了他什么（碟面、信纸正文、落款）
 *   ② 点「回一张 CD」→ 跳 /make?reply=<token>，制作流程会自动带上寄件信息
 *   ③ 点送礼人 → 进入 TA 的个人主页
 */

export const metadata: Metadata = {
  title: "You got a Hallo CD — 回一张 CD / Reply with a CD",
  description:
    "有人给你寄了一张 halloCD。回一张 CD 给 TA。 / Someone sent you a halloCD. Reply with a CD of your own.",
};

/**
 * 这一页按 token 取订单 —— 是请求期数据。
 * Cache Components 下必须显式声明 instant = false（允许阻塞渲染），
 * 否则构建期预渲染会因为「访问了未缓存数据」而失败。
 */
export const instant = false;

export default async function GiftPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await db.findOrderByGiftToken(token);

  if (!order) notFound();

  const design = (order.design ?? {}) as Record<string, unknown>;
  const letter = (order.letter ?? {}) as Record<string, unknown>;
  const shipment = (order.shipment ?? {}) as Record<string, unknown>;

  const discColor =
    typeof design.discColor === "string" ? design.discColor : "#E0E0E0";
  const discArt = typeof design.discArtUrl === "string" ? design.discArtUrl : "";
  const hasRecording =
    typeof design.audioUrl === "string" && design.audioUrl.length > 0;
  const hasPhoto = typeof design.mediaUrl === "string" && design.mediaUrl.length > 0;
  const obiText = typeof design.obiText === "string" ? design.obiText : "";
  const spineText =
    typeof design.spineText === "string" ? design.spineText : "halloCD";
  const paperSkin =
    typeof design.paperSkin === "string" ? design.paperSkin : "p08";
  const letterText = typeof letter.text === "string" ? letter.text : "";
  const signature = typeof letter.signature === "string" ? letter.signature : "";
  const tracking =
    typeof shipment.trackingNumber === "string" ? shipment.trackingNumber : "";
  const eta =
    typeof shipment.eta === "string" ? shipment.eta : order.deliveryDate;

  const senderProfile = order.senderHandle
    ? `/u/${order.senderHandle}`
    : null;

  return (
    <main className="relative min-h-screen bg-[#F8F4EC] px-6 pb-28 pt-[96px] text-[#1C2329] sm:px-10">
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#E65100]">
          Someone sent you a Hallo CD
        </p>
        <h1 className="mt-3 font-serif text-4xl italic leading-tight sm:text-5xl">
          <LangText zh="你收到了一张 CD。" en="You received a CD." />
        </h1>
        <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-[#1C2329]/60">
          {order.senderHandle ? (
            <LangText
              zh={`@${order.senderHandle} 用 TA 的 agent 替你准备了一张 halloCD。`}
              en={`@${order.senderHandle} had their agent prepare a halloCD for you. `}
            />
          ) : (
            <LangText
              zh="有人用 halloCD 替你准备了一张 CD。"
              en="Someone used halloCD to prepare a CD for you. "
            />
          )}
          <LangText
            zh="碟里装着 TA 录下的声音，盒子里还有一封手写的信。"
            en="A recorded voice is on the disc, and a handwritten letter is in the case."
          />
        </p>

        {/* ---- CD ---- */}
        <section className="mt-10 overflow-hidden rounded-2xl border border-[#1C2329]/10 bg-white/70">
          <div className="flex flex-col items-center gap-8 p-8 sm:flex-row sm:items-start">
            <div className="relative h-40 w-40 shrink-0">
              {/* 外壳 */}
              <div
                className="absolute inset-0 rounded-[14px] border border-[#1C2329]/12 shadow-[0_18px_40px_-18px_rgba(28,35,41,.35)]"
                style={{ background: "rgba(255,255,255,.55)" }}
              />
              {/* 腰封 */}
              {obiText ? (
                <div className="absolute left-0 top-0 flex h-full w-[22%] items-center justify-center overflow-hidden rounded-l-[14px] bg-[#1C2329]/90">
                  <span
                    className="whitespace-nowrap text-[11px] tracking-[0.22em] text-[#F8F4EC]"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {obiText}
                  </span>
                </div>
              ) : null}
              {/* 碟 */}
              <div
                className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
                style={{
                  background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,.55), transparent 42%), conic-gradient(from 210deg, ${discColor}, #ffffff22 28%, ${discColor} 52%, #ffffff33 74%, ${discColor})`,
                  boxShadow: "inset 0 0 0 1px rgba(28,35,41,.12)",
                }}
              >
                {/* 盘面图 —— 送礼人自己做的封面 */}
                {discArt ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={discArt}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}
                <div className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F8F4EC] ring-1 ring-[#1C2329]/15" />
              </div>
              {/* 脊背 */}
              <div className="absolute -left-[3px] top-1/2 h-[70%] w-[5px] -translate-y-1/2 rounded-full bg-[#1C2329]/25" />
            </div>

            {/* 信纸 */}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#1C2329]/35">
                <LangText zh="信纸" en="Paper" /> · {paperSkin}
              </p>
              {letterText ? (
                <blockquote className="mt-3 whitespace-pre-line border-l-2 border-[#E65100]/40 pl-4 font-serif text-[15px] leading-[1.9] text-[#1C2329]/85">
                  {letterText}
                  {signature ? (
                    <span className="mt-2 block text-[13px] text-[#1C2329]/55">
                      {signature}
                    </span>
                  ) : null}
                </blockquote>
              ) : (
                <p className="mt-3 italic text-[#1C2329]/35">
                  <LangText
                    zh="这个人没有写字 —— 那就回一张吧。"
                    en="They didn't write a word — so reply with one of your own."
                  />
                </p>
              )}

              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11px] text-[#1C2329]/50">
                <div>
                  <dt className="text-[#1C2329]/30">
                    <LangText zh="场景" en="Scene" />
                  </dt>
                  <dd className="mt-0.5 text-[#1C2329]/75">{order.productId}</dd>
                </div>
                <div>
                  <dt className="text-[#1C2329]/30">
                    <LangText zh="预计送达" en="Estimated arrival" />
                  </dt>
                  <dd className="mt-0.5 text-[#1C2329]/75">{eta}</dd>
                </div>
                {tracking ? (
                  <div>
                    <dt className="text-[#1C2329]/30">
                      <LangText zh="运单号" en="Tracking" />
                    </dt>
                    <dd className="mt-0.5 text-[#1C2329]/75">{tracking}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-[#1C2329]/30">
                    <LangText zh="脊背" en="Spine" />
                  </dt>
                  <dd className="mt-0.5 text-[#1C2329]/75">{spineText}</dd>
                </div>
                {hasRecording || hasPhoto ? (
                  <div>
                    <dt className="text-[#1C2329]/30">
                      <LangText zh="盘里有" en="On the disc" />
                    </dt>
                    <dd className="mt-0.5 text-[#1C2329]/75">
                      {hasRecording ? (
                        <span>
                          <LangText zh="TA 录下的声音" en="A recorded voice" />
                        </span>
                      ) : null}
                      {hasRecording && hasPhoto ? " · " : null}
                      {hasPhoto ? (
                        <span>
                          <LangText zh="一张照片" en="A photo" />
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        </section>

        {/* ---- CTA ---- */}
        <section className="mt-8 rounded-2xl border border-[#E65100]/25 bg-[#E65100]/[0.04] p-8">
          <h2 className="font-serif text-2xl italic">
            <LangText zh="回一张 CD" en="Reply with a CD" />
          </h2>
          <p className="mt-2.5 max-w-prose text-[14px] leading-relaxed text-[#1C2329]/65">
            <LangText
              zh="便签上那句话是真的。做一个属于你的瞬间 —— 可以是给 TA 的，也可以是给自己的。"
              en="That note was no joke. Make a moment of your own — for them, or for yourself. "
            />
            <LangText
              zh="你的 agent 也能替你做：你只要说一句「帮我回一张 CD 给 @xxx」，它就会跑完全流程。"
              en="Your agent can do it too: just say “reply with a CD to @xxx” and it runs the whole flow."
            />
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/make?reply=${order.giftToken}`}
              className="inline-flex items-center gap-2 rounded-full bg-[#E65100] px-7 py-3.5 text-[11.5px] font-bold uppercase tracking-[0.16em] text-white shadow-[0_18px_38px_-14px_rgba(230,81,0,.6)] transition hover:bg-[#c94500]"
            >
              <LangText zh="回一张 CD →" en="Reply with a CD →" />
            </Link>
            {senderProfile ? (
              <Link
                href={senderProfile}
                className="inline-flex items-center gap-2 rounded-full border border-[#1C2329]/20 bg-white/60 px-7 py-3.5 text-[11.5px] font-semibold uppercase tracking-[0.16em] transition hover:border-[#1C2329]/40 hover:bg-white"
              >
                <LangText
                  zh={`看看 @${order.senderHandle}`}
                  en={`See @${order.senderHandle}`}
                />
              </Link>
            ) : null}
          </div>
          <p className="mt-5 font-mono text-[10.5px] text-[#1C2329]/35">
            <LangText
              zh="想让你的 agent 来做？给它一把绑定到你名下的 key，然后说「用我的 agent 给 @xxx 寄一张 CD」。"
              en="Want your agent to do it? Give it a key bound to your name, then say “use my agent to send a CD to @xxx”."
            />
          </p>
        </section>

        <footer className="mt-12 border-t border-[#1C2329]/10 pt-6">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#1C2329]/40 transition hover:text-[#1C2329]"
          >
            <LangText zh="← 回 halloCD" en="← Back to halloCD" />
          </Link>
        </footer>
      </div>
    </main>
  );
}
