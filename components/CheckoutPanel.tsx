"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, CreditCard, Loader2, LogIn, Package, Truck } from "lucide-react";

import { useExperience } from "./ExperienceContext";
import { useHandoff } from "./HandoffContext";
import { useLang } from "@/lib/i18n";
import { uploadAllAssets } from "@/lib/media/upload-asset";
import {
  clearPendingOrder,
  readPendingOrder,
  writePendingOrder,
} from "@/lib/draft/pending-order";

/**
 * halloCD · 网页端结账面板（v2.10 建，v2.11 改成直付）
 * ==================================================================
 * 【v2.10】这一块是被**加回来**的 —— v2.9 把网页端的下单与付款一起拿掉了，
 * 只留下「交给你的 agent」那条路。
 *
 * 但产品的事实是：**网页端用户就是可以付款的**，
 * 而 agent 只是**另外一套流程**。两条路并行存在：
 *
 *   · 本面板：用户自己在浏览器里下单付款 → 跳去 PayPal → 用户自己确认付款 → 寄出
 *   · /agents 的交接面板：把参数复制给用户自己的 coding agent → 由它下单付款
 *
 * 两条路共用同一套后端（lib/agent/agentPlatform.ts 的 quoteOrder /
 * settlePaidOrder），所以校验、定价、落库、寄送、回礼链接的行为完全一致 ——
 * 不会出现「网页端少算一笔运费」这种事。
 *
 * 【v2.11】付款形态从「平台代付」改成「用户直付」：
 *   v2.10：服务端拿 PayPal 的测试卡建单即扣款 —— 页面写「平台代付」。
 *          那条路是给 agent 用的（agent 没有浏览器，只能替用户扣）。
 *   v2.11：网页端跳去 PayPal 收银台，**用户自己确认金额、自己付款**，
 *          PayPal 跳回来之后我们再 capture、落库、寄出。
 *          用户点下 PayPal 上那个「确认付款」之前，一分钱都不会动。
 *
 * 流程刻意做成**两步**（先报价、后付款）：
 *   ① 填三个空 → 看到确切的金额
 *   ② 确认金额 → 跳去 PayPal 付款
 *
 * 为什么不是一点就扣：agent 路径也是这个顺序（报价 → 确认 → 付款）。
 * 让用户先看见「你要付 55.90 USD」，再让他付 —— 这一步不该省。
 *
 * 文案内联在组件里，不进 lib/i18n.tsx（该项目受保护文件）。
 */

type Quote = {
  unitPrice: string;
  shipping: string;
  total: string;
  currency: string;
  quantity: number;
};

const COPY = {
  zh: {
    eyebrow: "CHECKOUT · 网页端下单",
    title: "把这张 CD 寄出去",
    lead: "填三个空，先看报价，确认金额再付款。付款会跳到 PayPal —— 你自己确认、自己付款，付完给你运单号和回礼链接。",
    receivers: "收件人",
    receiversHint: "多个收件人用逗号或顿号分隔",
    receiversDefault: "妈妈",
    scene: "场景",
    delivery: "送达日期",
    quoteBtn: "获取报价",
    quoting: "正在上传素材…",
    payBtn: "确认付款",
    paying: "正在跳到 PayPal…",
    payCanceled: "已取消付款 —— 单子还在，随时可以再付一次。",
    payError: "付款没有走完 —— PayPal 那一步没结束，再试一次就行。",
    paid: "已付款",
    paidTitle: "订单已支付，正在寄出",
    paidLead: "运单号已经生成，收件人会收到发货通知。你可以把回礼链接发给 TA —— TA 也能给你寄一张。",
    tracking: "运单号",
    carrier: "承运",
    eta: "预计送达",
    gift: "回礼链接",
    openRoom: "去我的主页",
    unit: "单价",
    shipping: "运费",
    total: "合计",
    error: "结账失败",
    uploadFailed:
      "录音没能传上去 —— 一张没有那段声音的 CD 没什么意义。检查一下网络再试。",
    notReady:
      "还没有录音或照片 —— 先在制作页录一段录音、挑一张照片，素材齐了才能下单。",
    notReadyLink: "去制作页",
    noDesign: "还没有做过设计 —— 这张 CD 会是空白的。",
    notifySent: "发货通知已发出，收件人会在邮件里看到。",
    notifySkipped: "发货通知没发出去（没配发信服务）—— 订单不受影响，运单号照常有效。",
    guestNote:
      "网页端下单需要先登录 —— 这一单要挂在你的名下：运单号、回礼链接、以后再寄一张给你，都在这个账号里。",
    signedInNote:
      "这张 CD 会出现在你的个人主页上 —— 收件人也能顺着回礼链接给你寄一张。",
    loginTitle: "登录后下单",
    loginLead:
      "这一单要挂在你的名下 —— 运单号、回礼链接、以后收件人再寄一张给你，都在这个账号里。",
    loginBtn: "登录",
    signupBtn: "注册",
    loginKeepsWork:
      "你的录音和设计不会丢：我们先把素材传上去，登录完直接回到这一步，接着下单。",
    loginRequired: "网页端下单需要先登录。",
    savingForLogin: "正在保存你的录音…",
    restored: "已恢复你刚才准备的那一单 —— 素材还在，直接获取报价就行。",
    scenes: {
      christmas: "圣诞",
      birthday: "生日",
      anniversary: "纪念日",
      wedding: "婚礼",
      graduation: "毕业",
      everyday: "日常",
    } as Record<string, string>,
  },
  en: {
    eyebrow: "CHECKOUT · pay on the web",
    title: "Ship this CD",
    lead: "Fill in three fields, see the exact price, then confirm to pay. You'll be taken to PayPal to approve and pay — then you get a tracking number and a gift-back link.",
    receivers: "Receiver",
    receiversHint: "Separate multiple receivers with commas",
    receiversDefault: "Mom, Grandma",
    scene: "Scene",
    delivery: "Delivery date",
    quoteBtn: "Get the price",
    quoting: "Uploading assets…",
    payBtn: "Confirm and pay",
    paying: "Taking you to PayPal…",
    payCanceled: "Payment canceled — the order is still here, pay whenever you like.",
    payError: "The payment didn't finish — PayPal didn't complete. Just try again.",
    paid: "Paid",
    paidTitle: "Paid — on its way",
    paidLead: "The tracking number is in place and the receiver gets a shipping notice. Send them the gift-back link — they can send you one too.",
    tracking: "Tracking number",
    carrier: "Carrier",
    eta: "Estimated delivery",
    gift: "Gift-back link",
    openRoom: "Open my profile",
    unit: "Unit price",
    shipping: "Shipping",
    total: "Total",
    error: "Checkout failed",
    uploadFailed:
      "The recording could not be uploaded — a CD without that voice would not mean much. Check your connection and try again.",
    notReady:
      "No recording or photo yet — record a voice and pick a photo on the make page before ordering.",
    notReadyLink: "Open the make page",
    noDesign: "Nothing designed yet — this CD would come out blank.",
    notifySent: "The shipping notice went out — the receiver gets it by email.",
    notifySkipped: "The shipping notice did not go out (no mail service configured) — the order is unaffected and the tracking number still works.",
    guestNote:
      "Ordering on the web needs an account — the order belongs to you: tracking number, gift-back link, and any CD sent back to you all live there.",
    signedInNote:
      "This CD will show up on your profile — and the receiver can send you one back with the gift-back link.",
    loginTitle: "Sign in to order",
    loginLead:
      "The order belongs to your account — the tracking number, the gift-back link, and any CD sent back to you all live there.",
    loginBtn: "Sign in",
    signupBtn: "Sign up",
    loginKeepsWork:
      "Your recording and design won't be lost: we upload the assets first, then bring you straight back here to finish the order.",
    loginRequired: "Ordering on the web requires an account.",
    savingForLogin: "Saving your recording…",
    restored:
      "We restored the order you were preparing — your assets are still here, just get the quote.",
    scenes: {
      christmas: "Christmas",
      birthday: "Birthday",
      anniversary: "Anniversary",
      wedding: "Wedding",
      graduation: "Graduation",
      everyday: "Everyday",
    } as Record<string, string>,
  },
} as const;

const SCENES = [
  "christmas",
  "birthday",
  "anniversary",
  "wedding",
  "graduation",
  "everyday",
] as const;

/** 默认送达日期：七天以后（与服务端 normalizeDeliveryDate 的兜底一致） */
function defaultDeliveryDate(): string {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export default function CheckoutPanel() {
  const { lang } = useLang();
  const copy = COPY[lang];

  const {
    recordingUrl,
    memoryMedia,
    paperSkinId,
    ready,
    setRecordingUrl,
    setMemoryMedia,
  } = useHandoff();

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

  const [receivers, setReceivers] = useState<string>(COPY.zh.receiversDefault);
  const [scene, setScene] = useState<string>("christmas");
  /* 送达日期在挂载后才填 —— Date.now() 在静态预渲染里会被 Next 拦下
     （它要求「每次访问都重新算」，而预渲染时算出来的是构建那一刻的值）。 */
  const [date, setDate] = useState<string>("");

  const [stage, setStage] = useState<"form" | "quoted" | "paid">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [payToken, setPayToken] = useState<string | null>(null);
  const [giftUrl, setGiftUrl] = useState<string | null>(null);
  const [tracking, setTracking] = useState<{
    trackingNumber: string | null;
    carrier: string | null;
    eta: string | null;
  } | null>(null);  const [notifySent, setNotifySent] = useState<boolean | null>(null);

  const designed = Boolean(letterText || discArtUrl || caseCoverUrl);

  /* 切语言时，只有还是出厂值才跟着换 —— 用户自己输入的名字一律保留 */
  useEffect(() => {
    setReceivers((v) =>
      v === COPY.zh.receiversDefault || v === COPY.en.receiversDefault
        ? COPY[lang].receiversDefault
        : v,
    );
  }, [lang]);

  /* 送达日期：七天以后（与服务端 normalizeDeliveryDate 的兜底一致） */
  useEffect(() => {
    setDate((v) => (v ? v : defaultDeliveryDate()));
  }, []);

  /* 登录了才知道主页地址 —— 登录后这张 CD 会出现在 TA 的个人主页上。
     meLoaded 用来避免「还没查到就先说人家没登录」。 */
  const [handle, setHandle] = useState<string | null>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d?.user?.handle) setHandle(String(d.user.handle));
        setMeLoaded(true);
      })
      .catch(() => {
        if (alive) setMeLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /*  v2.13：登录墙                                                        */
  /* ------------------------------------------------------------------ */
  /* 网页端结账强制先登录。但录音是 blob URL，跳一次登录就没了 ——
     所以点「登录」之前先把素材传上去，连同表单存进待下单草稿，
     登录完原样恢复（lib/draft/pending-order.ts）。

     这一份 pending 是「登录前传好的素材」—— 建单时直接用，不用再传一次。 */
  const [pendingAssets, setPendingAssets] = useState<{
    assetRefs: Record<string, string>;
    handwritingUrl: string | null;
  } | null>(null);

  const signedIn = Boolean(handle);

  /* 登录之后：把刚才准备的那一单捡回来 */
  useEffect(() => {
    if (!meLoaded || !signedIn) return;
    const pending = readPendingOrder();
    if (!pending) return;
    if (pending.form.receivers) setReceivers(pending.form.receivers);
    if (pending.form.scene) setScene(pending.form.scene);
    if (pending.form.date) setDate(pending.form.date);
    setPendingAssets(
      Object.keys(pending.assetRefs).length || pending.handwritingUrl
        ? { assetRefs: pending.assetRefs, handwritingUrl: pending.handwritingUrl }
        : null,
    );
    /* 录音 / 照片恢复成已经传好的引用 —— NFC 预览照样能放 */
    if (pending.recordingUrl) setRecordingUrl(pending.recordingUrl);
    if (pending.memoryMedia) setMemoryMedia(pending.memoryMedia);
    setNotice(copy.restored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meLoaded, signedIn]);

  /** 去登录 / 注册：先把素材传上去（保住录音），再跳过去，登录完回来接着下单 */
  const goToLogin = async (target: "login" | "signup") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      /* 素材一定要先传 —— blob: 出了这个文档就失效。
         这里**不能**等 ready：ready 要求「录音和照片都在」，
         只录了音、还没挑照片的用户照样会丢录音 ——
         而录音恰恰是那一份最不能丢的。 */
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
      if (failed === "audio") {
        /* 录音没传上去 —— 现在跳去登录，回来也只是一段死掉的 blob URL。
           与其骗他走一趟，不如把话说明白，让他重录或换个网络。 */
        setError(copy.uploadFailed);
        return;
      }
      writePendingOrder({
        assetRefs,
        handwritingUrl,
        recordingUrl: assetRefs.audioUrl ?? null,
        memoryMedia: memoryMedia
          ? {
              url: assetRefs.mediaUrl ?? assetRefs.mediaVideoUrl ?? "",
              name: memoryMedia.name,
              kind: memoryMedia.kind,
            }
          : null,
        form: { receivers, scene, date },
      });
    } catch {
      /* 传不上去也别把人卡死 —— 登录完让他重录一次，比走不了强 */
    } finally {
      setBusy(false);
    }
    const next = encodeURIComponent("/make#checkout");
    window.location.assign(`/${target}?next=${next}`);
  };

  const money = useMemo(
    () => (v: string | number | undefined) =>
      v == null ? "—" : Number(v).toFixed(2),
    [],
  );

  /** 建单（只报价，不扣款） */
  const requestQuote = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      /* 素材先传上去 —— blob: 出了这个文档就失效，订单要靠引用才能复现那张 CD。
         v2.13：如果登录前已经传过一次（待下单草稿），直接用那次的引用，别再传一遍。 */
      let assetRefs: Record<string, string>;
      let handwritingUrl: string | null;
      if (
        pendingAssets &&
        (Object.keys(pendingAssets.assetRefs).length > 0 ||
          Boolean(pendingAssets.handwritingUrl))
      ) {
        assetRefs = pendingAssets.assetRefs;
        handwritingUrl = pendingAssets.handwritingUrl;
      } else {
        const uploaded = await uploadAllAssets({
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
        if (uploaded.failed) throw new Error(copy.uploadFailed);
        assetRefs = uploaded.assetRefs;
        handwritingUrl = uploaded.handwritingUrl;
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
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
            /* 网页端选的是信纸皮肤 id —— 与技能包 / v1 接口同一套取值域 */
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
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || `${res.status}`);
      }

      setQuote(data.quote as Quote);
      setOrderId(data.orderId);
      setPayToken(data.payToken);
      setStage("quoted");
      /* 单子建成了 —— 那份「待下单草稿」没用了，清掉 */
      clearPendingOrder();
      setPendingAssets(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** 把「已付款」的样子摆出来 —— 付款成功、以及从 PayPal 跳回来之后共用 */
  const showPaid = (data: {
    giftUrl?: string | null;
    shipment?: {
      trackingNumber?: string | null;
      carrier?: string | null;
      eta?: string | null;
    } | null;
    notification?: { sent?: boolean } | null;
  }) => {
    if (data.giftUrl) setGiftUrl(data.giftUrl);
    if (data.shipment) {
      setTracking({
        trackingNumber: data.shipment.trackingNumber ?? null,
        carrier: data.shipment.carrier ?? null,
        eta: data.shipment.eta ?? null,
      });
    }
    setNotifySent(Boolean(data?.notification?.sent));
    setStage("paid");
  };

  /**
   * 从 PayPal 跳回来（或者在 PayPal 上点了取消）。
   *
   * 那一跳把页面状态全冲光了 —— 这里靠 URL（订单号）+ 浏览器 cookie
   * （付款凭据）把这一单认回来，再把该显示的东西摆出来。
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("paid");
    const canceled = params.get("payCanceled");
    const failed = params.get("payError");
    const order = params.get("order");
    if (!paid && !canceled && !failed) return;

    /* 先把查询串擦掉 —— 用户刷新一次不该重新走一遍 */
    try {
      window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.hash,
      );
    } catch {
      /* 忽略 */
    }

    if (failed) {
      setError(copy.payError);
      if (order) setOrderId(order);
      return;
    }
    if (!order) return;

    const restore = async () => {
      try {
        const res = await fetch(`/api/orders/${order}`, {
          credentials: "same-origin",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          setError(copy.payError);
          return;
        }
        setOrderId(order);
        if (data.quote) setQuote(data.quote as Quote);
        if (canceled) {
          setNotice(copy.payCanceled);
          setStage("quoted");
          return;
        }
        showPaid({
          giftUrl: data.giftUrl,
          shipment: data.shipment,
          notification: data.notification,
        });
      } catch {
        setError(copy.payError);
      }
    };
    void restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 付款：跳去 PayPal，由用户自己确认、自己付 */
  const pay = async () => {
    if (busy || !orderId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ payToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || `${res.status}`);
      }
      /* 已经付过 —— 直接摆结果（幂等，不会重复扣款） */
      if (data.mode === "already_paid") {
        showPaid(data);
        return;
      }
      /* 直付：把浏览器送到 PayPal 收银台 ——
         用户自己看金额、自己付款。页面状态会在这里丢掉，
         回来时靠 URL + cookie 认回这一单。 */
      if (data.mode === "redirect" && data.approveUrl) {
        window.location.assign(data.approveUrl);
        return;
      }
      throw new Error(copy.payError);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id="checkout"
      className="mx-auto mt-24 w-full max-w-xl rounded-2xl border border-[#1C2329]/10 bg-white/60 p-7"
    >
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1C2329]/[0.06]">
          <CreditCard className="h-4 w-4 text-[#1C2329]" strokeWidth={1.6} />
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

      {stage === "paid" ? (
        /* ---------- 已付款 ---------- */
        <div className="mt-6">
          <div className="flex items-center gap-2 rounded-xl bg-[#1C2329]/[0.05] px-4 py-3">
            <Check className="h-4 w-4 text-[#1C2329]" strokeWidth={2} />
            <span className="text-[13px] font-semibold text-[#1C2329]">
              {copy.paidTitle}
            </span>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[#1C2329]/55">
            {copy.paidLead}
          </p>

          <dl className="mt-5 space-y-2 text-[12.5px]">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[#1C2329]/45">{copy.tracking}</dt>
              <dd className="font-mono text-[#1C2329]">
                {tracking?.trackingNumber ?? "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[#1C2329]/45">{copy.carrier}</dt>
              <dd className="text-[#1C2329]">{tracking?.carrier ?? "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[#1C2329]/45">{copy.eta}</dt>
              <dd className="text-[#1C2329]">{tracking?.eta ?? date}</dd>
            </div>
            {giftUrl ? (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[#1C2329]/45">{copy.gift}</dt>
                <dd>
                  <Link
                    href={giftUrl}
                    className="font-mono text-[#1C2329] underline decoration-[#E65100]/50 underline-offset-2"
                  >
                    {giftUrl}
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-4 text-[12px] leading-relaxed text-[#1C2329]/45">
            {notifySent ? copy.notifySent : copy.notifySkipped}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {handle ? (
              <Link
                href={`/u/${handle}`}
                className="rounded-full border border-[#1C2329]/20 bg-white/70 px-6 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] transition hover:border-[#1C2329]/40"
              >
                {copy.openRoom}
              </Link>
            ) : null}
          </div>
        </div>
      ) : meLoaded && !signedIn ? (
        /* ---------- v2.13：未登录 —— 登录墙 ---------- */
        <div className="mt-6 rounded-2xl border border-[#1C2329]/10 bg-[#FDFBF5] p-6">
          <div className="flex items-center gap-2">
            <LogIn className="h-4 w-4 text-[#E65100]" strokeWidth={1.8} />
            <span className="font-serif text-lg italic text-[#1C2329]">
              {copy.loginTitle}
            </span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[#1C2329]/60">
            {copy.loginLead}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void goToLogin("login")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-[#E65100] px-7 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#c94500] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogIn className="h-3.5 w-3.5" />
              )}
              {busy ? copy.savingForLogin : copy.loginBtn}
            </button>
            <button
              type="button"
              onClick={() => void goToLogin("signup")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border border-[#1C2329]/20 bg-white/70 px-7 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] transition hover:border-[#1C2329]/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {copy.signupBtn}
            </button>
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-[#1C2329]/45">
            {copy.loginKeepsWork}
          </p>
          {!ready ? (
            <p className="mt-2 text-[11.5px] leading-relaxed text-[#1C2329]/45">
              {copy.notReady}
            </p>
          ) : null}
        </div>
      ) : (
        /* ---------- 表单 / 报价 ---------- */
        <>
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
                {SCENES.map((s) => (
                  <option key={s} value={s}>
                    {copy.scenes[s]}
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

          {/* 报价 —— 金额以服务端返回为准，页面上的数字只是给人看的 */}
          {quote ? (
            <dl className="mt-6 space-y-2 border-t border-[#1C2329]/10 pt-4 text-[12.5px]">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[#1C2329]/45">
                  {copy.unit} × {quote.quantity}
                </dt>
                <dd className="text-[#1C2329]">
                  {money(quote.unitPrice)} {quote.currency}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[#1C2329]/45">{copy.shipping}</dt>
                <dd className="text-[#1C2329]">
                  {money(quote.shipping)} {quote.currency}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-t border-[#1C2329]/10 pt-2">
                <dt className="font-semibold text-[#1C2329]">{copy.total}</dt>
                <dd className="font-serif text-lg text-[#1C2329]">
                  {money(quote.total)} {quote.currency}
                </dd>
              </div>
            </dl>
          ) : null}

          {stage === "quoted" ? (
            <button
              type="button"
              onClick={pay}
              disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E65100] px-7 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition hover:bg-[#c94500] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CreditCard className="h-3.5 w-3.5" />
              )}
              {busy ? copy.paying : `${copy.payBtn} ${money(quote?.total)} ${quote?.currency ?? "USD"}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={requestQuote}
              disabled={busy}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#1C2329] px-7 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F8F4EC] transition hover:bg-[#2C3640] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Package className="h-3.5 w-3.5" />
              )}
              {busy ? copy.quoting : copy.quoteBtn}
            </button>
          )}

          {/* 素材没齐 / 没做设计 —— 说清楚缺什么 */}
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
                {copy.notReadyLink}
              </Link>
            </p>
          ) : null}

          {notice ? (
            <div className="mt-4 rounded-xl bg-[#1C2329]/[0.05] p-3 text-[12px] leading-relaxed text-[#1C2329]/60 ring-1 ring-[#1C2329]/10">
              {notice}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl bg-[#D9381E]/10 p-3 text-[12px] leading-relaxed text-[#D9381E] ring-1 ring-[#D9381E]/25">
              {copy.error}：{error}
            </div>
          ) : null}

          <p className="mt-4 flex items-start gap-2 text-[11.5px] leading-relaxed text-[#1C2329]/40">
            <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
            <span>{meLoaded ? (handle ? copy.signedInNote : copy.guestNote) : ""}</span>
          </p>
        </>
      )}
    </section>
  );
}
