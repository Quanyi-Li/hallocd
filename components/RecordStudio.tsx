"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Check,
  ImagePlus,
  Mic,
  RotateCcw,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import CheckoutPanel from "./CheckoutPanel";
import NFCExperiencePreview, {
  DEFAULT_LETTER_TEXT,
  DEFAULT_SIGNATURE,
} from "./NFCExperiencePreview";
import { useExperience } from "./ExperienceContext";
import { useHandoff } from "./HandoffContext";
import { LETTER_DEFAULTS, useLang } from "@/lib/i18n";
import { PAPER_SKINS } from "./paperSkins";
import { SPINE_FONTS, SPINE_THEMES } from "./CustomizationPanel";

type RecState = "idle" | "recording" | "recorded";
type MediaFile = {
  url: string;
  name: string;
  kind: "image" | "video";
  /** 视频抽出来的封面帧（data URL）—— CD 盘面只能印图片 */
  coverUrl?: string | null;
};

/* ---------------------------------- */
/*  信纸皮肤（素材位于 public/papers，  */
/*  已裁掉原图上下黑边与截图 UI）        */
/* ---------------------------------- */
/* 信纸皮肤与书写区定义在 paperSkins.ts，预览端共用同一份配置 */

/* 排版：可选字号与墨色 */
const FONT_SIZES = [12, 13, 14, 16, 18, 20, 24];
const TEXT_COLORS = [
  { id: "ink", label: "深灰", value: "#333333" },
  { id: "white", label: "白", value: "#FFFFFF" },
  { id: "orange", label: "橘", value: "#E65100" },
  { id: "navy", label: "深蓝", value: "#1B3A6B" },
];

/* ------------------------------------------------------------------ *
 *  HANDOFF: the panel moved to /agents (v2.9.1)                      *
 *                                                                     *
 *  /make 只该负责「做出一张 CD」。网页端已经不下单了，              *
 *  却在制作页底部杵着一个结账面板 —— 视觉上还在替用户走流程。       *
 *  交接本来就是「关于 agent 的事」（绑定 / key / 活动都在 /agents），  *
 *  所以整块搬进接入台：components/HandoffPanel.tsx。                *
 *  这里只留一条指引，指向接入台。                                   *
 * ------------------------------------------------------------------ */

/** HANDOFF pointer - the panel itself moved to /agents (v2.9.1) */
const HANDOFF_NEXT = {
  zh: {
    eyebrow: "NEXT · HANDOFF",
    lead: "也可以交给你的 coding agent —— 在接入台把下单参数复制给它，付款由它来做。",
    cta: "打开 Agent 接入台",
    /* 素材没齐时的那句提示（页面底部只剩 Preview 按钮时，用户最需要这句话） */
    hint: "先录一段录音、挑一张照片 —— 素材齐了才能下单或交接。",
  },
  en: {
    eyebrow: "NEXT · HANDOFF",
    lead: "Or hand it to your coding agent — copy the order payload at the agent desk and let it handle the payment.",
    cta: "Open the Agent desk",
    hint: "Record a voice and pick a photo first — the assets need to be in place before you can order or hand it off.",
  },
} as const;

/**
 * 网页端下单按钮（v2.10）。
 *
 * 【v2.10】这一条是被**加回来**的 —— v2.9 把网页端的下单付款拿掉了，
 * 只留了「交给你的 agent」。但产品的事实是：网页端用户就是可以付款的，
 * agent 只是另外一套流程。两条路并行，页面底部各给一个入口。
 */
const CHECKOUT_CTA = {
  zh: "下单并付款",
  en: "Order and pay",
} as const;


/**
 * 从视频里抽一帧当封面。
 *
 * 为什么需要：CD 盘面 / 信纸插页是印刷品，只能印图片。
 * 视频原文件会原样存进对象存储（不转码 —— 我们不跑 ffmpeg），
 * 但要印在纸上的那一张，得在浏览器里抽出来。
 *
 * 为什么在客户端抽：服务端转码要装 ffmpeg、要占函数时长、还容易超时；
 * 客户端抽帧是几十行代码的事，还顺手省掉一次上传。
 */
function extractVideoCover(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    let timer = 0;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };

    /* 有些浏览器解不出帧 / 不触发 seeked —— 兜个底，别把整单卡住 */
    timer = window.setTimeout(() => finish(null), 8000);

    const draw = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return finish(null);
        /* 封面只用来印在 CD 上 —— 640px 足够，别把 base64 撑大 */
        const scale = Math.min(1, 640 / w);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        finish(null);
      }
    };

    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.onerror = () => finish(null);
    video.onloadeddata = () => {
      const duration = video.duration || 0;
      /* 跳到 0.5 秒附近取一帧 —— 第 0 帧常常是黑屏 */
      const target = duration > 0.2 ? Math.min(0.5, duration / 2) : 0.01;
      if (Math.abs(video.currentTime - target) < 0.005 && video.readyState >= 2) {
        draw();
      } else {
        try {
          video.currentTime = target;
        } catch {
          draw();
        }
      }
    };
    video.onseeked = draw;
    video.src = url;
  });
}

/* 上传成功的媒体预览（带删除按钮：预览独立于上传框，点击删除不会再次唤起文件选择器） */
function MediaThumb({ media, onRemove }: { media: MediaFile; onRemove: () => void }) {
  const { t } = useLang();
  return (
    <div className="relative mt-3 overflow-hidden rounded-lg border border-black/10">
      {media.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media.url} alt={media.name} className="h-28 w-full object-cover" />
      ) : (
        /* 视频用抽出来的封面帧当 poster —— 首帧常常是黑屏 */
        <video
          src={media.url}
          poster={media.coverUrl ?? undefined}
          className="h-28 w-full object-cover"
          muted
          playsInline
        />
      )}
      <span className="absolute bottom-1.5 left-1.5 max-w-[70%] truncate rounded-full bg-[#1C2329]/75 px-2 py-0.5 text-[9px] text-[#F8F4EC]">
        {media.name}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${media.name}`}
        title={t.record.removeTitle}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#1C2329]/75 text-[#F8F4EC] transition hover:bg-[#D9381E]"
      >
        <X className="h-3 w-3" strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* 虚线上传框（与定制面板同款） */
function MediaUploadBox({
  icon,
  label,
  hint,
  accept,
  media,
  onUpload,
  onRemove,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  accept: string;
  media: MediaFile | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div>
      <label className="block cursor-pointer rounded-xl border border-dashed border-[#1C2329]/25 px-4 py-5 text-center transition-colors hover:border-[#E65100]/60 hover:bg-white/50">
        <div className="flex flex-col items-center gap-2">
          {icon}
          <span className="text-xs font-medium tracking-wide text-[#1C2329]/60">
            {label}
          </span>
          <span className="text-[10px] text-[#1C2329]/35">{hint}</span>
        </div>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </label>
      {/* 预览放在 label 之外：删除按钮点击不会再次触发文件选择器 */}
      {media && <MediaThumb media={media} onRemove={onRemove} />}
    </div>
  );
}

/* ---------------------------------- */
/*  迷你 CD 盒：纯 CSS 3D 开合 + 光盘抽取 */
/*  数据全部来自 useExperience（与 DIY 同源） */
/* ---------------------------------- */
function MiniCasePreview() {
  const {
    caseCoverUrl,
    innerLeftUrl,
    innerRightUrl,
    backCoverUrl,
    spineText,
    spineFont,
    spineTheme,
    spineTextColor,
    discColor,
    discArtUrl,
    showObi,
    obiText,
    obiFont,
    obiTheme,
    obiTextColor,
    obiImageUrl,
  } = useExperience();

  const [isOpen, setIsOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const spinePreset =
    SPINE_FONTS.find((f) => f.id === spineFont) ?? SPINE_FONTS[0];
  const spinePalette =
    SPINE_THEMES.find((t) => t.id === spineTheme) ?? SPINE_THEMES[0];
  const obiPreset = SPINE_FONTS.find((f) => f.id === obiFont) ?? SPINE_FONTS[0];
  const obiPalette =
    SPINE_THEMES.find((t) => t.id === obiTheme) ?? SPINE_THEMES[0];

  return (
    <div className="mb-12 flex flex-col items-center">
      <div style={{ perspective: "900px" }}>
        <motion.div
          ref={boxRef}
          data-testid="mini-case"
          onClick={() => setIsOpen((v) => !v)}
          animate={{
            rotateY: isOpen ? 0 : -15,
            rotateX: isOpen ? 0 : 10,
            scale: isOpen ? 1.04 : 1,
          }}
          transition={{ type: "spring", stiffness: 160, damping: 20 }}
          className="relative h-40 w-40 cursor-pointer"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* 底壳（背面图案） */}
          <div className="absolute inset-0 overflow-hidden rounded-md bg-[#17171B] shadow-[0_20px_45px_-18px_rgba(28,35,41,0.45)] ring-1 ring-black/20">
            {backCoverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={backCoverUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#242A30] via-[#17171B] to-[#0E1013]" />
            )}

            {/* 内侧右页：托盘底板（盒盖向左翻开后位于右半区，与 DIY 2D 一致） */}
            <motion.div
              initial={false}
              animate={{
                opacity: isOpen ? 1 : 0.9,
                scale: isOpen ? 1 : 0.98,
              }}
              transition={{ duration: 0.55, delay: isOpen ? 0.18 : 0 }}
              className="absolute inset-0 overflow-hidden bg-[#D9D5CC]"
            >
              {innerRightUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={innerRightUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#E8E4DB] via-[#DFDBD2] to-[#CBC7BE]" />
              )}
              {/* 塑料卡扣厚度感：内阴影 + 内描边 */}
              <div className="pointer-events-none absolute inset-0 shadow-[inset_0_2px_12px_rgba(28,35,41,0.22)] ring-1 ring-inset ring-white/40" />
              {/* 开箱扫光：盖子掀开后掠过内页的一次高光 */}
              <motion.div
                initial={false}
                animate={{ x: isOpen ? "120%" : "-120%" }}
                transition={{
                  duration: 1.1,
                  delay: isOpen ? 0.28 : 0,
                  ease: "easeInOut",
                }}
                className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent"
              />
            </motion.div>
          </div>

          {/* 光盘：开盖后向右上抽出，可拖拽 */}
          <motion.div
            drag={isOpen}
            dragConstraints={boxRef}
            dragElastic={0.15}
            dragMomentum={false}
            whileDrag={{ scale: 1.1, cursor: "grabbing" }}
            animate={{
              x: isOpen ? 64 : 0,
              y: isOpen ? -44 : 0,
              scale: isOpen ? 1.02 : 1,
            }}
            transition={{
              type: "spring",
              stiffness: 120,
              damping: 18,
              delay: isOpen ? 0.42 : 0,
            }}
            onClick={(e) => e.stopPropagation()}
            className={`absolute inset-[10%] ${
              isOpen ? "z-40 cursor-grab" : "z-20"
            }`}
            style={{ touchAction: "none" }}
          >
            <div
              className="relative h-full w-full overflow-hidden rounded-full shadow-[0_14px_30px_-12px_rgba(28,35,41,0.4)] ring-1 ring-black/10"
              style={{ background: discColor }}
            >
              <div
                className="absolute inset-0 opacity-25"
                style={{
                  background:
                    "conic-gradient(from 210deg, transparent, rgba(255,180,220,0.6), rgba(160,210,255,0.6), transparent, rgba(255,240,180,0.5), transparent)",
                }}
              />
              {discArtUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={discArtUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-90"
                />
              )}
              <div className="absolute left-1/2 top-1/2 h-[13%] w-[13%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F8F4EC] ring-1 ring-black/15" />
            </div>
          </motion.div>

          {/* 盒盖：绕左侧边缘翻开，正反面各一张面片 */}
          <motion.div
            animate={{ rotateY: isOpen ? -120 : 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-30 origin-left"
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* 正面：封面 + 腰封 + 亚克力高光 */}
            <div
              className="absolute inset-0 overflow-hidden rounded-md shadow-[0_14px_30px_-14px_rgba(28,35,41,0.4)] ring-1 ring-white/50"
              style={{ backfaceVisibility: "hidden" }}
            >
              {caseCoverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={caseCoverUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-[#EFEBE2]" />
              )}

              {showObi && (
                <div
                  className="absolute inset-y-0 left-0 flex w-[24%] items-center justify-center overflow-hidden border-r border-black/10"
                  style={
                    obiPalette.id === "glass"
                      ? {
                          background: "rgba(255,255,255,0.28)",
                          backdropFilter: "blur(6px)",
                          WebkitBackdropFilter: "blur(6px)",
                        }
                      : { background: obiPalette.bg }
                  }
                >
                  {obiImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={obiImageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      className="flex max-h-[92%] items-center justify-center overflow-hidden px-1 text-center text-[8px] font-semibold leading-tight [text-orientation:upright] [writing-mode:vertical-rl]"
                      style={{ color: obiTextColor, fontFamily: obiPreset.css }}
                    >
                      {obiText.trim() || "Hallo CD"}
                    </span>
                  )}
                </div>
              )}

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/35" />
            </div>

            {/* 盒盖内侧（翻开后位于左半区）：内侧左页 */}
            <div
              className="absolute inset-0 overflow-hidden rounded-md bg-[#F8F4EC] ring-1 ring-black/10"
              style={{
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
              }}
            >
              <motion.div
                initial={false}
                animate={{
                  scale: isOpen ? 1 : 1.06,
                  opacity: isOpen ? 1 : 0.82,
                }}
                transition={{ duration: 0.8, delay: isOpen ? 0.22 : 0 }}
                className="absolute inset-0"
              >
                {innerLeftUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={innerLeftUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#FAF6EE] via-[#F2ECE0] to-[#E4DDD0]" />
                )}
              </motion.div>
              {/* 内页厚度感 */}
              <div className="pointer-events-none absolute inset-0 shadow-[inset_0_2px_12px_rgba(28,35,41,0.18)] ring-1 ring-inset ring-white/60" />
              {/* 翻开时的内侧扫光 */}
              <motion.div
                initial={false}
                animate={{ x: isOpen ? "120%" : "-120%" }}
                transition={{
                  duration: 1.1,
                  delay: isOpen ? 0.32 : 0,
                  ease: "easeInOut",
                }}
                className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/55 to-transparent"
              />
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 font-serif text-[8px] italic tracking-[0.25em] text-[#1C2329]/30">
                Hallo CD
              </span>
            </div>
          </motion.div>

          {/* 脊背：盒子左缘的侧壁（开合都可见） */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-50 flex w-[8%] items-center justify-center overflow-hidden rounded-l-md"
            style={
              spinePalette.id === "glass"
                ? {
                    background: "rgba(255,255,255,0.30)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                    boxShadow:
                      "inset 0 0 0 1px rgba(255,255,255,0.6), inset 0 0 12px rgba(255,255,255,0.35)",
                  }
                : { background: spinePalette.bg }
            }
          >
            {spinePalette.id === "glass" && (
              <span className="absolute inset-0 opacity-40" style={{ background: "rgba(255,255,255,0.35)" }} />
            )}
            <span
              className="flex h-full w-full items-center justify-center overflow-hidden text-center text-[7px] font-semibold tracking-[0.14em] [text-orientation:upright] [writing-mode:vertical-rl]"
              style={{ color: spineTextColor, fontFamily: spinePreset.css }}
            >
              {spineText.trim() || "Hallo CD"}
            </span>
          </div>
        </motion.div>
      </div>

      <p className="mb-1 mt-6 text-[9px] uppercase tracking-[0.25em] text-[#1C2329]/35">
        Your custom CD
      </p>
      <p className="text-[9px] tracking-[0.18em] text-[#1C2329]/30">
        {isOpen ? "Click to close" : "Click to open"} / Tap disc to drag
      </p>
    </div>
  );
}


export default function RecordStudio() {
  const {
    updateDesign,
    letterText: ctxLetterText,
    signatureText: ctxSignatureText,
    paperSrc: ctxPaperSrc,
    inputMode: ctxInputMode,
    letterFontSize: ctxLetterFontSize,
    letterColor: ctxLetterColor,
    /* DIY 3D 工作台的定制 —— 下单时一起带给后端，
       否则订单记的就不是用户真正设计的那张 CD */
    discColor: ctxDiscColor,
    spineText: ctxSpineText,
    spineFont: ctxSpineFont,
    spineTheme: ctxSpineTheme,
    spineTextColor: ctxSpineTextColor,
    showObi: ctxShowObi,
    obiText: ctxObiText,
    obiFont: ctxObiFont,
    obiTheme: ctxObiTheme,
    obiTextColor: ctxObiTextColor,
    /* 贴图素材 —— blob URL，下单前要先传上去 */
    discArtUrl: ctxDiscArtUrl,
    caseCoverUrl: ctxCaseCoverUrl,
    backCoverUrl: ctxBackCoverUrl,
    innerLeftUrl: ctxInnerLeftUrl,
    innerRightUrl: ctxInnerRightUrl,
    spineImageUrl: ctxSpineImageUrl,
    obiImageUrl: ctxObiImageUrl,
    /* 手写笔迹（data URL） */
    handwrittenImage: ctxHandwrittenImage,
  } = useExperience();
  const { t, lang } = useLang();
  const rt = t.record;
  const handoffNext = HANDOFF_NEXT[lang];
  /* HANDOFF: hand the assets over to the agent desk (/agents) */
  const {
    recordingUrl: handoffRecording,
    memoryMedia: handoffMedia,
    setRecordingUrl: setHRecording,
    setMemoryMedia: setHMemory,
    setPaperSkinId: setHPaperSkin,
  } = useHandoff();
  const [recState, setRecState] = useState<RecState>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
  /* NFC 开箱预览浮层 */
  const [previewOpen, setPreviewOpen] = useState(false);
  /* 信纸文案（可自定义，默认温柔长文） */
  const [letterText, setLetterText] = useState(DEFAULT_LETTER_TEXT);
  const [signature, setSignature] = useState(DEFAULT_SIGNATURE);
  /* 信纸皮肤 + 书写方式 + 排版（字号 / 墨色） */
  const [paperId, setPaperId] = useState<string>(PAPER_SKINS[0].id);
  const [letterMode, setLetterMode] = useState<"type" | "handwrite">("type");
  const [fontIdx, setFontIdx] = useState(2);
  const [inkColor, setInkColor] = useState(TEXT_COLORS[0].value);
  const [penSize, setPenSize] = useState(2); // 手写笔触粗细（CSS px）
  const paper = PAPER_SKINS.find((s) => s.id === paperId) ?? PAPER_SKINS[0];
  const fontSize = FONT_SIZES[fontIdx];

  /* 从全局设计快照恢复标量：/make 被离开再回来时，保住信纸正文、落款与排版。
     必须排在下面「语言切换」effect 之前 —— 那个 effect 只在正文仍是出厂默认值时
     才跟随语言替换，恢复出的用户正文不能被它覆盖。 */
  useEffect(() => {
    if (ctxLetterText) setLetterText(ctxLetterText);
    if (ctxSignatureText) setSignature(ctxSignatureText);
    if (ctxPaperSrc) {
      const pid = PAPER_SKINS.find((s) => s.src === ctxPaperSrc)?.id;
      if (pid) setPaperId(pid);
    }
    setLetterMode(ctxInputMode);
    const idx = FONT_SIZES.indexOf(ctxLetterFontSize);
    if (idx >= 0) setFontIdx(idx);
    setInkColor(ctxLetterColor);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  /* 语言切换：信纸正文 / 落款仍是未改动的默认值时，跟随语言替换 */
  useEffect(() => {
    setLetterText((v) =>
      v === LETTER_DEFAULTS.zh.text || v === LETTER_DEFAULTS.en.text
        ? LETTER_DEFAULTS[lang].text
        : v,
    );
    setSignature((v) =>
      v === LETTER_DEFAULTS.zh.sign || v === LETTER_DEFAULTS.en.sign
        ? LETTER_DEFAULTS[lang].sign
        : v,
    );
  }, [lang]);

  /* 信纸编辑器 → 全局 Context：NFC 预览读取同一份数据 */
  useEffect(() => {
    updateDesign({
      paperSrc: paper.src,
      paperName: paper.name,
      inputMode: letterMode,
      letterText,
      letterFontSize: fontSize,
      letterColor: inkColor,
      signatureText: signature,
    });
  }, [
    paper.src,
    paper.name,
    letterMode,
    letterText,
    fontSize,
    inkColor,
    signature,
    updateDesign,
  ]);

  /* 切换信纸会重建画布、清空笔迹，Context 里的手写图同步失效 */
  useEffect(() => {
    updateDesign({ handwrittenImage: null });
  }, [paperId, updateDesign]);

  /* 手写板：原生 canvas + Pointer Events（不引入额外依赖） */
  const handwriteRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastExportRef = useRef(0);

  /* 画布缓冲区跟随书写区 CSS 尺寸 × DPR，切换纸张 / 窗口变化时自动重建 */
  useEffect(() => {
    const c = handwriteRef.current;
    if (!c) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const strokePoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleStrokeStart = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    lastPointRef.current = strokePoint(e);
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = penSize;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleStrokeMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = e.currentTarget.getContext("2d");
    const last = lastPointRef.current;
    if (!ctx || !last) return;
    const p = strokePoint(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    /* 节流导出：即使 pointerup 丢失，NFC 预览也能拿到最新笔迹 */
    const now = Date.now();
    if (now - lastExportRef.current > 120) {
      lastExportRef.current = now;
      updateDesign({
        handwrittenImage: e.currentTarget.toDataURL("image/png"),
      });
    }
  };

  const handleStrokeEnd = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    /* 落笔结束把透明笔迹导出为 Base64，供 NFC 预览的手写信纸使用 */
    const c = handwriteRef.current;
    if (c && letterMode === "handwrite") {
      updateDesign({ handwrittenImage: c.toDataURL("image/png") });
    }
  };

  const clearHandwriting = () => {
    const c = handwriteRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    updateDesign({ handwrittenImage: null });
  };

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  /* 声波条点击播放（回放录音） */
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  /* 当前生效的 Blob URL：用于在替换 / 删除 / 卸载时精确释放，
     避免把 revokeObjectURL 写进 setState 更新函数（更新函数必须保持纯函数） */
  const audioUrlRef = useRef<string | null>(null);
  const mediaUrlRef = useRef<string | null>(null);

  const stopTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  /* 卸载时释放麦克风（但**不释放 Blob URL**）
   *
   * 【v2.9.1】为什么不能在这里 revoke：
   *   交接面板在 /agents，录音和照片却产生在 /make。
   *   从 /make 跳到 /agents = 本组件卸载 = 这段 cleanup 被调用。
   *   一旦 revoke，blob: URL 立刻失效 —— 接入台那边拿到的
   *   只是一串没用的字符串，上传必然失败（「录音没能传上去」）。
   *   替换素材时（重录 / 换照片 / 删照片）本来就已经 revoke 过了，
   *   剩下的 blob URL 交给浏览器在文档销毁时回收。 */
  useEffect(() => {
    return () => {
      stopTimer();
      stopTracks();
      playbackRef.current?.pause();
    };
  }, []);

  /* 停止播放（重新录制/换新音频时调用） */
  const stopPlayback = () => {
    playbackRef.current?.pause();
    playbackRef.current = null;
    setIsPlaying(false);
  };

  /* 点击声波条：播放 / 暂停录制的音频 */
  const togglePlayback = () => {
    if (recState !== "recorded" || !audioUrl) return;
    if (!playbackRef.current) {
      playbackRef.current = new Audio(audioUrl);
      playbackRef.current.onended = () => setIsPlaying(false);
    }
    if (isPlaying) {
      playbackRef.current.pause();
      setIsPlaying(false);
    } else {
      playbackRef.current.play();
      setIsPlaying(true);
    }
  };

  const startRecording = async () => {
    setMicError(null);
    stopPlayback(); // 新录音使旧回放失效
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError(rt.micUnsupported);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        const url = URL.createObjectURL(blob);
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = url;
        setAudioUrl(url);
        setRecState("recorded");
        stopTracks();
      };
      rec.start();
      setSeconds(0);
      setConfirmed(false);
      setRecState("recording");
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setMicError(rt.micDenied);
      stopTracks();
    }
  };

  const stopRecording = () => {
    stopTimer();
    recorderRef.current?.stop();
    recorderRef.current = null;
  };

  const resetRecording = () => {
    stopPlayback();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
    setSeconds(0);
    setConfirmed(false);
    setRecState("idle");
  };

  const handleMediaUpload = (file: File) => {
    /* 先释放旧图再挂新图；副作用放在更新函数之外 */
    const url = URL.createObjectURL(file);
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    mediaUrlRef.current = url;
    const kind = file.type.startsWith("video/") ? "video" : "image";
    setMediaFile({ url, name: file.name, kind, coverUrl: null });

    /* 视频抽一帧当封面：原文件照存不误，但印在 CD 上的是这一张 */
    if (kind === "video") {
      void extractVideoCover(file).then((cover) => {
        if (!cover) return;
        /* 用户可能已经换掉这个视频了 —— 只在还是同一个的时候才写回 */
        setMediaFile((prev) =>
          prev && prev.url === url ? { ...prev, coverUrl: cover } : prev,
        );
      });
    }
  };

  /* 删除已上传的照片 / 视频：释放 Blob URL 并清空预览 */
  const handleMediaRemove = () => {
    if (mediaUrlRef.current) URL.revokeObjectURL(mediaUrlRef.current);
    mediaUrlRef.current = null;
    setMediaFile(null);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const ready = audioUrl !== null && mediaFile !== null;

  /* ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ */
  /*  HANDOFF: hand the recording / photo / paper-skin id to /agents    */
  /*  (v2.9.1 - the panel itself now lives at /agents)                 */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    setHRecording(audioUrl);
  }, [audioUrl, setHRecording]);

  useEffect(() => {
    setHMemory(
      mediaFile
        ? {
            url: mediaFile.url,
            name: mediaFile.name,
            kind: mediaFile.kind,
            coverUrl: mediaFile.coverUrl ?? null,
          }
        : null,
    );
  }, [mediaFile, setHMemory]);

  /* ------------------------------------------------------------------ */
  /*  v2.13：把「登录后恢复回来的素材」回填到本地 state                   */
  /* ------------------------------------------------------------------ */
  /* 网页端结账强制先登录，而录音是 blob URL —— 跳一次登录就没了。
     所以点登录之前先把素材传上去（/api/uploads/<id>），登录完再取回来。

     这一段 effect 就是「取回来」的那一步：
       录音  → 本地 audioUrl（录音条与 NFC 预览都听得到）
       照片  → 本地 mediaFile（CD 盘面还能印那张照片）

     不回填会怎样：页面写着「已恢复你刚才准备的那一单」，
     录音条却是空的、NFC 开箱也没声音 —— 用户只会觉得被骗了。

     只认 /api/uploads/ 这类**站内引用**：
       blob: 是用户刚录的（本组件自己的状态），不能被覆盖；
       用户新录一段时，本地 audioUrl 变了，再由上面的 effect 往上送。 */
  useEffect(() => {
    const restored = handoffRecording;
    if (!restored) return;
    if (restored.startsWith("blob:") || restored.startsWith("data:")) return;
    if (audioUrlRef.current === restored) return;
    audioUrlRef.current = restored;
    setAudioUrl(restored);
    setRecState("recorded");
    setConfirmed(true);
  }, [handoffRecording]);

  useEffect(() => {
    const restored = handoffMedia;
    if (!restored) return;
    if (restored.url.startsWith("blob:") || restored.url.startsWith("data:")) return;
    if (mediaUrlRef.current === restored.url) return;
    mediaUrlRef.current = restored.url;
    setMediaFile({
      url: restored.url,
      name: restored.name,
      kind: restored.kind,
      coverUrl: restored.coverUrl ?? null,
    });
  }, [handoffMedia]);

  useEffect(() => {
    setHPaperSkin(paperId);
  }, [paperId, setHPaperSkin]);

  return (
    <section
      id="record"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#F8F4EC] px-6 py-24 text-[#1C2329]"
    >
      {/* 波形动画 keyframes（局部注入，零全局污染）：recWave 起伏 / recCalm 平缓 */}
      <style>{`@keyframes recWave{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}@keyframes recCalm{0%,100%{transform:scaleY(.14)}50%{transform:scaleY(.2)}}`}</style>

      {/* 标题 */}
      <div className="mb-10 text-center">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.4em] text-[#E65100]">
          {rt.eyebrow}
        </p>
        <h2 className="font-serif text-4xl italic tracking-tight md:text-5xl">
          {rt.title}
        </h2>
        <p className="mt-3 text-sm text-[#1C2329]/50">
          {rt.lead}
        </p>
      </div>

      {/* 迷你 CD 盒：CSS 3D 开合 + 可抽取光盘（与 DIY / NFC 同源） */}
      <MiniCasePreview />

      {/* 录音按钮 */}
      <div className="relative flex flex-col items-center">
        <motion.button
          type="button"
          onClick={recState === "recording" ? stopRecording : startRecording}
          whileTap={{ scale: 0.94 }}
          animate={
            recState === "recording" ? { scale: [1, 1.06, 1] } : { scale: 1 }
          }
          transition={
            recState === "recording"
              ? { repeat: Infinity, duration: 1.6, ease: "easeInOut" }
              : { duration: 0.2 }
          }
          className={`relative flex h-28 w-28 items-center justify-center rounded-full shadow-[0_20px_50px_-15px_rgba(28,35,41,0.4)] transition-colors ${
            recState === "recording"
              ? "bg-[#D9381E] text-white"
              : "bg-[#1C2329] text-[#F8F4EC] hover:bg-[#2a333b]"
          }`}
          aria-label={recState === "recording" ? rt.stopRec : rt.startRec}
        >
          {recState === "recording" ? (
            <span className="h-8 w-8 rounded-[6px] bg-white" />
          ) : (
            <Mic className="h-9 w-9" strokeWidth={1.5} />
          )}
          {/* 录音时外圈脉冲环 */}
          {recState === "recording" && (
            <span className="absolute inset-0 animate-ping rounded-full bg-[#D9381E]/30" />
          )}
        </motion.button>

        {/* 声波：录音时红色起伏 / 录音完成后点击播放，橘色起伏 / 平时平缓 */}
        <div
          role={recState === "recorded" ? "button" : undefined}
          aria-label={recState === "recorded" ? (isPlaying ? rt.pauseRec : rt.playRec) : undefined}
          title={recState === "recorded" ? rt.playPauseTitle : undefined}
          onClick={togglePlayback}
          className={`mt-6 flex h-10 items-center gap-[3px] rounded-full px-2 transition ${
            recState === "recorded"
              ? "cursor-pointer hover:bg-black/[0.04]"
              : "pointer-events-none"
          }`}
        >
          {Array.from({ length: 28 }).map((_, i) => {
            /* 中间高、两边低的包络，模拟真实声波形态 */
            const envelope = 0.35 + 0.65 * Math.abs(Math.sin(i * 0.9));
            const active = recState === "recording" || isPlaying;
            return (
              <span
                key={i}
                className={`w-[3px] rounded-full transition-colors duration-500 ${
                  recState === "recording"
                    ? "bg-[#D9381E]/80"
                    : isPlaying
                      ? "bg-[#E65100]/80"
                      : "bg-[#1C2329]/20"
                }`}
                style={{
                  height: Math.round(10 + envelope * 26),
                  transformOrigin: "center",
                  animation: active
                    ? `recWave ${0.6 + (i % 5) * 0.12}s ease-in-out ${i * 0.04}s infinite`
                    : `recCalm 3.2s ease-in-out ${i * 0.08}s infinite`,
                }}
              />
            );
          })}
        </div>

        {/* 计时 */}
        <p className="mt-2 font-mono text-sm tracking-[0.2em] text-[#1C2329]/60">
          {mm}:{ss}
        </p>
        {micError && (
          <p className="mt-3 max-w-xs text-center text-xs text-[#D9381E]">
            {micError}
          </p>
        )}
      </div>

      {/* 回放与确认 */}
      {recState === "recorded" && audioUrl && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-black/10 bg-white/60 p-5"
        >
          <audio src={audioUrl} controls className="w-full" />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={resetRecording}
              className="flex items-center gap-1.5 rounded-full bg-black/5 px-5 py-2 text-xs font-semibold text-[#1C2329]/60 transition hover:bg-black/10 hover:text-[#1C2329]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> {rt.reRecord}
            </button>
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className={`flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold transition ${
                confirmed
                  ? "bg-[#1C2329] text-[#F8F4EC]"
                  : "bg-[#E65100] text-white hover:bg-[#c94500]"
              }`}
            >
              <Check className="h-3.5 w-3.5" />
              {confirmed ? rt.confirmed : rt.confirm}
            </button>
          </div>
        </motion.div>
      )}

      {/* 视觉回忆上传 */}
      <div className="mt-12 w-full max-w-xl">
        <p className="mb-4 text-center text-xs text-[#1C2329]/50">
          {rt.memoryTitle}
          {rt.memoryNote && (
            <span className="text-[#1C2329]/30"> {rt.memoryNote}</span>
          )}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <MediaUploadBox
            icon={<ImagePlus className="h-4 w-4 text-[#1C2329]/50" strokeWidth={1.5} />}
            label="Upload Photo"
            hint="JPG / PNG"
            accept="image/*"
            media={mediaFile?.kind === "image" ? mediaFile : null}
            onUpload={handleMediaUpload}
            onRemove={handleMediaRemove}
          />
          <MediaUploadBox
            icon={<Video className="h-4 w-4 text-[#1C2329]/50" strokeWidth={1.5} />}
            label="Upload Video"
            hint="MP4 / WebM"
            accept="video/*"
            media={mediaFile?.kind === "video" ? mediaFile : null}
            onUpload={handleMediaUpload}
            onRemove={handleMediaRemove}
          />
        </div>
      </div>

      {/* 信纸文案编辑（NFC 预览打字机内容） */}
      <div className="mt-12 w-full max-w-xl">
        <p className="mb-4 text-center text-xs text-[#1C2329]/50">
          {rt.letterTitle}
          {rt.letterNote && (
            <span className="text-[#1C2329]/30"> {rt.letterNote}</span>
          )}
        </p>
        {/* 信纸皮肤选择器：横向滚动卡片 */}
        <div className="-mx-1 mb-4 flex gap-2.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
          {PAPER_SKINS.map((skin) => {
            const active = skin.id === paperId;
            return (
              <button
                key={skin.id}
                type="button"
                onClick={() => setPaperId(skin.id)}
                aria-pressed={active}
                className={`shrink-0 text-center transition ${
                  active ? "" : "opacity-70 hover:opacity-100"
                }`}
              >
                <span
                  className={`block h-16 w-12 overflow-hidden rounded-lg bg-white shadow-sm transition ${
                    active
                      ? "ring-2 ring-[#E65100]"
                      : "ring-1 ring-black/10"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={skin.src}
                    alt={rt.paperNames[skin.id] ?? skin.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </span>
                <span
                  className={`mt-1.5 block text-[9px] font-medium tracking-wide ${
                    active ? "text-[#E65100]" : "text-[#1C2329]/45"
                  }`}
                >
                  {rt.paperNames[skin.id] ?? skin.name}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-black/10 bg-white/60 p-5">
          {/* 书写方式：打字 / 手写 */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex gap-1 rounded-full bg-black/5 p-1">
              {(
                [
                  ["type", rt.typeMode],
                  ["handwrite", rt.handwriteMode],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLetterMode(mode)}
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.05em] transition ${
                    letterMode === mode
                      ? "bg-white text-[#1C2329] shadow-sm"
                      : "text-[#1C2329]/45 hover:text-[#1C2329]/70"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {letterMode === "handwrite" && (
              <button
                type="button"
                onClick={clearHandwriting}
                className="rounded-full px-2.5 py-1 text-[10px] font-semibold text-[#1C2329]/45 transition hover:text-[#E65100]"
              >
                {rt.clearStrokes}
              </button>
            )}
          </div>

          {/* 排版工具栏：字号 + 墨色 */}
          <div className="mb-3 flex items-center justify-between gap-3 border-t border-black/5 pt-3">
            {letterMode === "type" ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFontIdx((i) => Math.max(0, i - 1))}
                  disabled={fontIdx === 0}
                  aria-label={rt.smaller}
                  className="flex h-6 w-7 items-center justify-center rounded-md bg-black/5 text-[10px] font-bold text-[#1C2329]/60 transition hover:bg-black/10 disabled:opacity-30"
                >
                  A-
                </button>
                <span className="w-7 select-none text-center text-[10px] tabular-nums text-[#1C2329]/45">
                  {fontSize}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setFontIdx((i) => Math.min(FONT_SIZES.length - 1, i + 1))
                  }
                  disabled={fontIdx === FONT_SIZES.length - 1}
                  aria-label={rt.bigger}
                  className="flex h-6 w-7 items-center justify-center rounded-md bg-black/5 text-[10px] font-bold text-[#1C2329]/60 transition hover:bg-black/10 disabled:opacity-30"
                >
                  A+
                </button>
              </div>
            ) : (
              /* 手写模式：笔触粗细滑块（两端圆点提示细 / 粗） */
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  aria-hidden
                  className="h-1 w-1 shrink-0 rounded-full bg-[#1C2329]/35"
                />
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={0.5}
                  value={penSize}
                  onChange={(e) => setPenSize(Number(e.target.value))}
                  aria-label={rt.penWidth}
                  className="h-1.5 w-full max-w-[7rem] cursor-pointer accent-[#E65100]"
                />
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#E65100]/85"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              {TEXT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setInkColor(c.value)}
                  aria-label={`${rt.textColorPrefix}: ${rt.colorNames[c.id] ?? c.label}`}
                  aria-pressed={inkColor === c.value}
                  className={`h-5 w-5 rounded-full transition ${
                    inkColor === c.value
                      ? "ring-2 ring-[#E65100] ring-offset-2 ring-offset-white"
                      : "ring-1 ring-black/15"
                  }`}
                  style={{ background: c.value }}
                />
              ))}
            </div>
          </div>

          {/* 信纸：<img> 自然撑开高度，书写层绝对定位在 area 内，绝不裁切 */}
          <div className="relative w-full overflow-hidden rounded-xl ring-1 ring-black/10 shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={paper.src}
              alt={rt.paperNames[paper.id] ?? paper.name}
              className="block h-auto w-full"
              draggable={false}
            />
            <div className="absolute" style={{ inset: paper.area }}>
              {paper.panel && (
                <div
                  className={`pointer-events-none absolute inset-0 rounded-md ${paper.panel}`}
                />
              )}
              <textarea
                value={letterText}
                onChange={(e) => setLetterText(e.target.value)}
                placeholder={rt.defaultLetter}
                spellCheck={false}
                className={`absolute inset-0 resize-none overflow-y-auto bg-transparent px-[4%] py-[3%] font-serif outline-none placeholder:text-black/25 ${
                  letterMode === "type" ? "" : "pointer-events-none opacity-0"
                }`}
                style={{
                  color: inkColor,
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.8,
                }}
              />
              <canvas
                ref={handwriteRef}
                onPointerDown={handleStrokeStart}
                onPointerMove={handleStrokeMove}
                onPointerUp={handleStrokeEnd}
                onPointerLeave={handleStrokeEnd}
                className={`absolute inset-0 h-full w-full ${
                  letterMode === "handwrite"
                    ? "cursor-crosshair touch-none"
                    : "pointer-events-none"
                }`}
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C2329]/40">
              {rt.signatureLabel}
            </span>
            <input
              type="text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder={rt.signaturePlaceholder}
              className="w-full rounded-lg border border-black/10 bg-[#FDFBF5] px-3 py-2 font-serif text-sm italic text-[#2A2A2A] outline-none transition placeholder:text-[#1C2329]/25 focus:border-[#E65100]/50"
            />
          </div>
        </div>
      </div>

      {/* NFC 开箱预览 + 结账 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-14 flex flex-wrap items-center justify-center gap-4"
      >
        {/* 预览入口常驻：删掉示例图片不应让 NFC 预览消失 */}
        <button
          type="button"
          onClick={() => {
            setPreviewOpen(true);
          }}
          className="flex items-center gap-2 rounded-full border-2 border-[#E65100] px-8 py-4 text-sm font-bold tracking-[0.08em] text-[#E65100] transition hover:bg-[#E65100] hover:text-white"
        >
          <Sparkles className="h-4 w-4" /> Preview NFC Experience ✨
        </button>
        {/* 交接需要音频与视觉回忆都就位。
            【v2.10】网页端的「下单并付款」按钮回来了 ——
            它指向下面那块结账面板（id="checkout"），不是死链。
            交接那条路（#handoff → /agents）仍然并存：两条路并行。 */}
        {ready ? (
          <button
            type="button"
            onClick={() =>
              document
                .getElementById("checkout")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="rounded-full bg-[#E65100] px-10 py-4 text-sm font-bold tracking-[0.1em] text-white shadow-[0_20px_45px_-12px_rgba(230,81,0,0.5)] transition hover:bg-[#c94500]"
          >
            {CHECKOUT_CTA[lang]} →
          </button>
        ) : (
          /* 没素材时把话说清楚 —— 否则页面底部只剩一个 Preview 按钮，
             用户会以为「下单入口」不见了。 */
          <p className="max-w-sm text-[12.5px] leading-relaxed text-[#1C2329]/45">
            {handoffNext.hint}
          </p>
        )}
      </motion.div>

      {/* NFC 沉浸式开箱预览浮层（传递录音与媒体状态） */}
      <AnimatePresence>
        {previewOpen && (
          <NFCExperiencePreview
            audioUrl={audioUrl}
            mediaFile={mediaFile}
            letterText={letterText}
            signature={signature}
            onClose={() => setPreviewOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* CHECKOUT（v2.10）：网页端结账面板 —— 用户在这里自己下单付款。
          放在按钮区下面，按钮滚过来就是这一块。
          「交接给 agent」那条路在它下面，两条路并行。 */}
      <CheckoutPanel />

      {/* HANDOFF: the panel moved to /agents - keep only a pointer here */}
      <div id="handoff" className="mt-24 w-full max-w-xl text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#E65100]">
          {handoffNext.eyebrow}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-[#1C2329]/50">
          {handoffNext.lead}
        </p>
        <Link
          href="/agents"
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#1C2329]/20 bg-white/70 px-7 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1C2329] transition hover:border-[#1C2329]/40 hover:bg-white"
        >
          <Bot className="h-4 w-4" />
          {handoffNext.cta}
        </Link>
      </div>

    </section>
  );
}
