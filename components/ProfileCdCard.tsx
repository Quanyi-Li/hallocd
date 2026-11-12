"use client";

import Link from "next/link";

import { useLang } from "@/lib/i18n";
import type { DbOrder } from "@/lib/db";

/**
 * 个人主页 / 收件箱里的 CD 卡片
 * ------------------------------------------------------------------
 * 纯服务端渲染，不引入 WebGL —— 用 CSS 画一张碟就够了：
 * 底色（design.discColor）+ 内圈镭射 + 中孔。
 *
 * （卡片本身是客户端组件：语言状态只存在 localStorage，
 *   服务端组件读不到，卡片上的状态标签必须跟着语言走。）
 */

type Props = {
  order: DbOrder;
  /** 展示视角：made = 我做的，received = 我收到的 */
  mode: "made" | "received";
  /** 对方用户名（点击进入 TA 的主页） */
  peerHandle?: string | null;
};

const COPY = {
  zh: {
    from: "来自",
    someone: "某个人",
    cdSuffix: "的 CD",
    shipped: "已寄出",
    awaiting: "待付款",
    failed: "失败",
    unit: "张",
    withRecording: "含录音",
    withPhoto: "含照片",
    customDisc: "自制盘面",
    noLetter: "（这张 CD 没有写字）",
    total: "合计",
    eta: "预计送达",
    tracking: "运单",
    to: "送给",
    fromShort: "来自",
    replyLink: "回礼链接",
    replyLinkTitle: "把这张链接发给收件人",
    replyCd: "回一张 CD →",
    obi: "腰封「",
    obiClose: "」",
  },
  en: {
    from: "from",
    someone: "someone",
    cdSuffix: "",
    shipped: "Shipped",
    awaiting: "Awaiting payment",
    failed: "Failed",
    unit: "x",
    withRecording: "With recording",
    withPhoto: "With photo",
    customDisc: "Custom disc art",
    noLetter: "(This CD has no letter)",
    total: "Total",
    eta: "Estimated",
    tracking: "Tracking",
    to: "To",
    fromShort: "From",
    replyLink: "Reply link",
    replyLinkTitle: "Send this link to the recipient",
    replyCd: "Reply with a CD →",
    obi: 'Obi "',
    obiClose: '"',
  },
};

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export default function ProfileCdCard({ order, mode, peerHandle }: Props) {
  const { lang } = useLang();
  const copy = COPY[lang];

  const design = (order.design ?? {}) as Record<string, unknown>;
  const letter = (order.letter ?? {}) as Record<string, unknown>;
  const shipment = (order.shipment ?? {}) as Record<string, unknown>;
  const quote = (order.quote ?? {}) as Record<string, unknown>;

  const discColor = str(design.discColor, "#E0E0E0");
  const discArt = str(design.discArtUrl, "");
  const obiText = str(design.obiText, "halloCD");
  const spineText = str(design.spineText, "halloCD");
  const paperSkin = str(design.paperSkin, "p08");
  const letterText = str(letter.text, "");
  const signature = str(letter.signature, "");
  const tracking = str(shipment.trackingNumber, "");
  const eta = str(shipment.eta, order.deliveryDate);
  const hasRecording = Boolean(str(design.audioUrl, ""));
  const hasPhoto = Boolean(str(design.mediaUrl, ""));

  const peer = peerHandle ?? order.senderHandle ?? "";
  const title =
    mode === "made"
      ? spineText
      : lang === "zh"
        ? `${copy.from} ${peer || copy.someone} ${copy.cdSuffix}`
        : `A CD ${copy.from} ${peer || copy.someone}`;

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-[#1C2329]/10 bg-white/70 p-5 transition hover:border-[#1C2329]/25 hover:bg-white">
      <div className="flex items-start gap-4">
        {/* 碟面 */}
        <div
          className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full"
          style={{
            background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,.55), transparent 42%), conic-gradient(from 210deg, ${discColor}, #ffffff22 28%, ${discColor} 52%, #ffffff33 74%, ${discColor})`,
            boxShadow: "inset 0 0 0 1px rgba(28,35,41,.10)",
          }}
        >
          {/* 盘面图 —— 用户自己做的封面 */}
          {discArt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={discArt}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F8F4EC] ring-1 ring-[#1C2329]/15" />
          <div
            className="absolute inset-[38%] rounded-full opacity-70"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(255,255,255,.6), transparent 30%, rgba(255,255,255,.45) 60%, transparent 85%)",
            }}
          />
        </div>

        {/* 信息 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-serif text-[17px] italic">{title}</h3>
            {order.status === "paid" ? (
              <span className="rounded-full bg-[#1C2329] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F8F4EC]">
                {copy.shipped}
              </span>
            ) : (
              <span className="rounded-full border border-dashed border-[#1C2329]/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#1C2329]/50">
                {order.status === "quoted" ? copy.awaiting : copy.failed}
              </span>
            )}
          </div>

          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[#1C2329]/35">
            {str(order.productId)} · {order.quantity} {copy.unit} · {paperSkin}
          </p>

          {/* 盘上到底有什么 —— 录音 / 照片 / 盘面图 */}
          {hasRecording || hasPhoto || discArt ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {hasRecording ? (
                <span className="rounded-full bg-[#1C2329]/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#1C2329]/55">
                  {copy.withRecording}
                </span>
              ) : null}
              {hasPhoto ? (
                <span className="rounded-full bg-[#1C2329]/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#1C2329]/55">
                  {copy.withPhoto}
                </span>
              ) : null}
              {discArt ? (
                <span className="rounded-full bg-[#1C2329]/[0.06] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#1C2329]/55">
                  {copy.customDisc}
                </span>
              ) : null}
            </div>
          ) : null}

          {letterText ? (
            <p className="mt-2.5 line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-[#1C2329]/70">
              {letterText}
              {signature ? `\n${signature}` : ""}
            </p>
          ) : (
            <p className="mt-2.5 text-[13px] italic text-[#1C2329]/35">
              {copy.noLetter}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-[#1C2329]/45">
            <span>
              {copy.total} {str(quote.total)} {str(quote.currency, "USD")}
            </span>
            <span>
              {copy.eta} {eta}
            </span>
            {tracking ? (
              <span>
                {copy.tracking} {tracking}
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {peerHandle && peerHandle !== order.senderHandle ? (
              <Link
                href={`/u/${peerHandle}`}
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] underline decoration-[#1C2329]/25 underline-offset-4 hover:decoration-[#1C2329]"
              >
                {mode === "made" ? copy.to : copy.fromShort} {peerHandle} →
              </Link>
            ) : null}

            {/* 送礼人视角：回礼链接要能随时取回 —— 收件人不在站内时，
                这是唯一能拿到链接的地方。点击可预览收件人看到的那一页。 */}
            {mode === "made" && order.giftToken ? (
              <Link
                href={`/r/${order.giftToken}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#1C2329]/15 px-3 py-1 text-[10.5px] font-semibold tracking-[0.1em] text-[#1C2329]/70 transition hover:border-[#1C2329]/40 hover:text-[#1C2329]"
                title={copy.replyLinkTitle}
              >
                {copy.replyLink}{" "}
                <span className="font-mono">/r/{order.giftToken}</span> →
              </Link>
            ) : null}

            {mode === "received" ? (
              <Link
                href={`/r/${order.giftToken}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#E65100] px-3.5 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#c94500]"
              >
                {copy.replyCd}
              </Link>
            ) : null}
            {obiText ? (
              <span className="font-mono text-[10px] text-[#1C2329]/30">
                {copy.obi}
                {obiText}
                {copy.obiClose}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
