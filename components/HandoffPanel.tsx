"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, Package } from "lucide-react";
import { useExperience } from "./ExperienceContext";
import { useHandoff } from "./HandoffContext";
import { useLang } from "@/lib/i18n";
import { copyText, uploadAllAssets } from "@/lib/media/upload-asset";

/**
 * 交接给用户自己的 agent —— 接入台（/agents）里的那一块。
 * ==================================================================
 * 【v2.9.1】这一块原先长在 /make 的底部（RecordStudio 里）。
 *   当时的判断是「设计完顺手就能把参数复制走」，所以留在了制作页。
 *   但它带来两个问题：
 *     ① /make 变成了「既做设计又管下单交接」的混合页 ——
 *        网页端明明已经不做下单了，视觉上却还杵着一个结账面板；
 *     ② 交接是**关于 agent 的事**（绑定、key、活动都在 /agents），
 *        摊在制作页上会让用户以为平台还在替他们走流程。
 *   所以整块搬到 /agents：/make 只负责做设计，接入台负责交接。
 *
 * 文案内联在组件里，不进 lib/i18n.tsx（该项目受保护文件）。
 */

/** 交接给 agent 的下单参数 —— 字段与 POST /api/agent/v1/orders 的请求体一致 */
type HandoffPayload = {
  productId: string;
  quantity: number;
  deliveryDate: string;
  receiver: { name: string };
  design: Record<string, unknown>;
  letter: Record<string, unknown>;
};

const COPY = {
  zh: {
    eyebrow: "HANDOFF TO YOUR AGENT",
    title: "把这张 CD 交给你的 Agent",
    lead: "填三个空，把参数复制给你的 coding agent —— 它会读目录、给你报价，确认金额之后再付款寄出。平台不会替你花钱。",
    receivers: "收件人",
    receiversHint: "多个收件人用逗号或顿号分隔",
    receiversDefault: "妈妈",
    scene: "场景",
    delivery: "送达日期",
    cta: "复制下单参数",
    running: "正在上传素材…",
    copied: "已复制",
    error: "交接失败",
    uploadFailed:
      "录音没能传上去 —— 一张没有那段声音的 CD 没什么意义。检查一下网络再试。",
    note: "复制之后，把这句话也发给你的 agent：「按这些参数给我寄一张 halloCD —— 先报价给我看。」",
    notReady:
      "还没有录音或照片 —— 先在制作页录一段录音、挑一张照片。素材留在当前标签页里，别硬刷新。",
    notReadyLink: "去制作页",
    noDesign: "还没有做过设计 —— 这张 CD 会是空白的。",
    noDesignLink: "去制作页做设计",
    /* v2.9.3：访客也能复制参数，只是没法直接下单（没有 key） */
    guestNote:
      "还没登录 —— 参数照样能复制，但真正下单需要一把 key：登录后在上面签发，再让 agent 用它调下单接口。",
    sceneNames: {
      christmas: "圣诞",
      birthday: "生日",
      anniversary: "纪念日",
      wedding: "婚礼",
      graduation: "毕业",
      everyday: "日常",
    } as Record<string, string>,
  },
  en: {
    eyebrow: "HANDOFF TO YOUR AGENT",
    title: "Hand off to your Agent",
    lead: "Fill in three fields, then copy the payload into your coding agent — it reads the catalog, quotes a price, and only pays after you confirm.",
    receivers: "Receiver",
    receiversHint: "Separate multiple receivers with commas",
    receiversDefault: "Mom, Grandma",
    scene: "Scene",
    delivery: "Delivery date",
    cta: "Copy order payload",
    running: "Uploading assets…",
    copied: "Copied",
    error: "Handoff failed",
    uploadFailed:
      "The recording could not be uploaded — a CD without that voice would not mean much. Check your connection and try again.",
    note: "After copying, send your agent this too: “Send me a halloCD with these parameters — quote me the price first.”",
    notReady:
      "No recording or photo yet — record a voice and pick a photo on the make page. The assets stay in this tab, so don't hard-refresh.",
    notReadyLink: "Open the make page",
    noDesign: "Nothing designed yet — this CD would come out blank.",
    noDesignLink: "Design it first",
    /* v2.9.3: guests can copy the payload too — they just can't place the order without a key */
    guestNote:
      "Not signed in yet — you can still copy the payload, but placing the actual order needs a key: sign in above, issue one, and let your agent use it to call the order endpoint.",
    sceneNames: {
      christmas: "Christmas",
      birthday: "Birthday",
      anniversary: "Anniversary",
      wedding: "Wedding",
      graduation: "Graduation",
      everyday: "Everyday",
    } as Record<string, string>,
  },
} as const;

/** 场景 id —— 与服务端 catalog / 技能包里的取值域完全一致 */
const HANDOFF_SCENES = [
  "christmas",
  "birthday",
  "anniversary",
  "wedding",
  "graduation",
  "everyday",
] as const;


export default function HandoffPanel({ signedIn = true }: { signedIn?: boolean }) {
  const { lang } = useLang();
  const copy = COPY[lang];
  const {
    recordingUrl,
    memoryMedia,
    paperSkinId,
    ready,
  } = useHandoff();

  /* DIY 定制 + 信纸 —— 都在受保护的 ExperienceContext 里，直接读 */
  const {
    discColor,
    spineText,
    spineFont,
    spineTheme,
    spineTextColor,
    showObi,
    obiText,
    obiFont,
    obiTheme,
    obiTextColor,
    discArtUrl,
    caseCoverUrl,
    backCoverUrl,
    innerLeftUrl,
    innerRightUrl,
    spineImageUrl,
    obiImageUrl,
    handwrittenImage,
    letterText,
    letterFontSize,
    letterColor,
    signatureText,
    inputMode,
  } = useExperience();

  const [scene, setScene] = useState<string>("christmas");
  const [receivers, setReceivers] = useState<string>(COPY.zh.receiversDefault);
  const [date, setDate] = useState("2025-12-24");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* 切换语言时，只有还是出厂值才跟着换 —— 用户自己输入的名字一律保留 */
  useEffect(() => {
    setReceivers((v) =>
      v === COPY.zh.receiversDefault || v === COPY.en.receiversDefault
        ? COPY[lang].receiversDefault
        : v,
    );
  }, [lang]);

  const copyPayload = async () => {
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      /* ---------- 先把素材传上去 ---------- */
      // blob URL 离开页面就失效；agent 拿到的是**必须还能访问的引用**。
      // 录音是关键 —— 传不上去就别交接了（那张 CD 没有声音就没有意义）。
      // 上传规则与网页端结账共用一套（lib/media/upload-asset.ts）。
      const { assetRefs, handwritingUrl, failed } = await uploadAllAssets({
        recordingUrl,
        memoryMedia,
        design: {
          discArtUrl,
          caseCoverUrl,
          backCoverUrl,
          innerLeftUrl,
          innerRightUrl,
          spineImageUrl,
          obiImageUrl,
        },
        handwrittenImage,
      });

      if (failed) {
        throw new Error(copy.uploadFailed);
      }

      const payload: HandoffPayload = {
        productId: scene,
        quantity: 1,
        deliveryDate: date,
        receiver: { name: receivers.trim() },
        design: {
          discColor,
          spineText,
          spineFont,
          spineTheme,
          spineTextColor,
          showObi,
          obiText,
          obiFont,
          obiTheme,
          obiTextColor,
          /* 技能包 / v1 接口收的是信纸皮肤 id，不是网页端的图片路径 */
          paperSkin: paperSkinId,
          ...assetRefs,
        },
        letter: {
          text: letterText,
          fontSize: letterFontSize,
          color: letterColor,
          signature: signatureText,
          inputMode,
          ...(handwritingUrl ? { handwritingUrl } : {}),
        },
      };

      await copyText(JSON.stringify(payload, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setBusy(false);
    }
  };

  const designed = Boolean(letterText || discArtUrl || caseCoverUrl);

  return (
    <section className="mt-10 rounded-2xl border border-[#1C2329]/10 bg-white/50 p-7">
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1C2329]/[0.06]">
          <Package className="h-4 w-4 text-[#1C2329]" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#E65100]">
            {copy.eyebrow}
          </p>
          <h2 className="mt-1 font-serif text-xl italic text-[#1C2329]">
            {copy.title}
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#1C2329]/60">
            {copy.lead}
          </p>
        </div>
      </div>

      {/* 交接参数 —— 只描述「这张 CD 长什么样、寄给谁」，不含价格 */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/45">
            {copy.receivers}
          </span>
          <input
            type="text"
            value={receivers}
            onChange={(e) => setReceivers(e.target.value)}
            placeholder={copy.receiversDefault}
            className="mt-1.5 w-full rounded-lg border border-black/10 bg-[#FDFBF5] px-3 py-2 text-sm text-[#1C2329] outline-none transition placeholder:text-[#1C2329]/25 focus:border-[#E65100]/60"
          />
          <span className="mt-1 block text-[10px] text-[#1C2329]/35">
            {copy.receiversHint}
          </span>
        </label>

        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/45">
            {copy.scene}
          </span>
          <select
            value={scene}
            onChange={(e) => setScene(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-black/10 bg-[#FDFBF5] px-3 py-2 text-sm text-[#1C2329] outline-none transition focus:border-[#E65100]/60"
          >
            {HANDOFF_SCENES.map((s) => (
              <option key={s} value={s}>
                {copy.sceneNames[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/45">
            {copy.delivery}
          </span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-black/10 bg-[#FDFBF5] px-3 py-2 text-sm text-[#1C2329] outline-none transition focus:border-[#E65100]/60"
          />
        </label>
      </div>

      {/* 复制参数 —— 录音与照片都就位才放行 */}
      <button
        type="button"
        onClick={copyPayload}
        disabled={busy || !ready}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1C2329] px-7 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {busy ? copy.running : copied ? copy.copied : copy.cta}
      </button>

      {/* 没做完的时候说清楚缺什么、去哪补 */}
      {!ready ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[#1C2329]/45">
          {copy.notReady}{" "}
          <Link
            href="/make"
            className="font-semibold text-[#1C2329] underline decoration-[#E65100]/50 underline-offset-2"
          >
            {copy.notReadyLink}
          </Link>
        </p>
      ) : !designed ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[#1C2329]/45">
          {copy.noDesign}{" "}
          <Link
            href="/make"
            className="font-semibold text-[#1C2329] underline decoration-[#E65100]/50 underline-offset-2"
          >
            {copy.noDesignLink}
          </Link>
        </p>
      ) : null}

      {/* v2.9.3：访客提示 —— 参数能复制，下单需要 key */}
      {!signedIn ? (
        <p className="mt-3 text-[12px] leading-relaxed text-[#1C2329]/45">
          {copy.guestNote}
        </p>
      ) : null}

      {/* 复制成功后的提示 —— 告诉用户下一步该做什么 */}
      {copied ? (
        <p className="mt-4 rounded-xl bg-[#E65100]/[0.07] px-4 py-3 text-[12px] leading-relaxed text-[#1C2329]/60 ring-1 ring-[#E65100]/20">
          {copy.note}
        </p>
      ) : null}

      {/* 失败 */}
      {error ? (
        <div className="mt-4 rounded-xl bg-[#D9381E]/10 p-3 text-[12px] leading-relaxed text-[#D9381E] ring-1 ring-[#D9381E]/25">
          {copy.error}：{error}
        </div>
      ) : null}
    </section>
  );
}
