"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Nfc, Pause, Play, Reply, X } from "lucide-react";
import { useExperience } from "./ExperienceContext";
import { SPINE_FONTS, SPINE_THEMES } from "./CustomizationPanel";
import { findPaperSkin } from "./paperSkins";
import { useLang } from "@/lib/i18n";

export type NFCMedia = { url: string; name: string; kind: "image" | "video" };

/* AI 语音转文字（模拟）：默认温柔长文案，可被用户自定义覆盖 */
export const DEFAULT_LETTER_TEXT = `听到这首歌的时候，我刚好在想你。
那天阳光很好，风把窗帘吹得鼓起来，像一封还没写字的信。
Some things are better said in music —— 慢慢听，别急。
往后的日子，也要一起听很多很多的歌。`;

export const DEFAULT_SIGNATURE = "—— 想你的我";

export type NFCExperiencePreviewProps = {
  audioUrl: string | null; // RecordStudio 录制的真实音频（Blob URL）
  mediaFile: NFCMedia | null; // 上传的照片 / 视频
  letterText?: string; // 自定义信纸文案（空则用默认）
  signature?: string; // 自定义落款
  onClose: () => void;
};

export default function NFCExperiencePreview({
  audioUrl,
  mediaFile,
  letterText,
  signature,
  onClose,
}: NFCExperiencePreviewProps) {
  const { t } = useLang();
  const rt = t.record;
  /* 全量同步 DIY 定制数据（外壳 / 背面 / 脊背 / 腰封 / 光盘） */
  const {
    discColor,
    discArtUrl,
    caseCoverUrl,
    backCoverUrl,
    innerLeftUrl,
    innerRightUrl,
    spineText,
    spineFont,
    spineTheme,
    spineTextColor,
    spineImageUrl,
    showObi,
    obiText,
    obiFont,
    obiTheme,
    obiTextColor,
    obiImageUrl,
    paperSrc,
    inputMode,
    letterText: contextLetterText,
    letterFontSize,
    letterColor,
    signatureText,
    handwrittenImage,
  } = useExperience();

  const spinePreset = SPINE_FONTS.find((f) => f.id === spineFont) ?? SPINE_FONTS[0];
  const spinePalette =
    SPINE_THEMES.find((t) => t.id === spineTheme) ?? SPINE_THEMES[0];
  const spineGlass = spinePalette.id === "glass";
  const obiPreset = SPINE_FONTS.find((f) => f.id === obiFont) ?? SPINE_FONTS[0];
  const obiPalette = SPINE_THEMES.find((t) => t.id === obiTheme) ?? SPINE_THEMES[0];
  const obiGlass = obiPalette.id === "glass";

  /* 实际使用的文案：Context（RecordStudio 同步）优先，props 兜底，最后默认 */
  const contextText = contextLetterText?.trim() ? contextLetterText : letterText;
  const text = contextText?.trim() ? contextText : rt.defaultLetter;
  const contextSign = signatureText?.trim() ? signatureText : signature;
  const sign = contextSign?.trim() ? contextSign : rt.defaultSignature;
  const mode = inputMode;
  /* 信纸皮肤：按 paperSrc 匹配宽高比与书写区，找不到则回退默认米色信纸 */
  const paperSkin = findPaperSkin(paperSrc);

  /* nfc：碰一碰波纹 → stage：盒盖紧闭等待开启 */
  const [phase, setPhase] = useState<"nfc" | "stage">("nfc");
  const [open, setOpen] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [typed, setTyped] = useState(0);
  const [typeDone, setTypeDone] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [replied, setReplied] = useState(false);
  /* 音频总时长：由 loadedmetadata 写入，避免渲染期读取 ref */
  const [audioDuration, setAudioDuration] = useState(10);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  /* 拖拽约束区域：整个开箱舞台，允许把光盘拖出盒外但不会飞出屏幕 */
  const stageRef = useRef<HTMLDivElement>(null);
  /* 拖拽中：驱动“离开盒底悬浮”的投影反馈 */
  const [dragging, setDragging] = useState(false);
  /* 窄屏（手机）：盒盖开角与光盘位移都要收窄，否则盖子会被甩出屏幕 */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /* 交互音效：Web Audio 现场合成，不额外加载音频资源 */
  const sfxCtxRef = useRef<AudioContext | null>(null);
  const playSfx = (from: number, to: number, duration: number, volume = 0.05) => {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return;
    sfxCtxRef.current ??= new AC();
    const ctx = sfxCtxRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  };
  /* 触觉反馈：支持的设备（安卓等）给出短促震动，iOS 静默忽略 */
  const haptic = (pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  };

  /* 卸载时释放音频上下文 */
  useEffect(() => {
    return () => {
      void sfxCtxRef.current?.close();
      sfxCtxRef.current = null;
    };
  }, []);

  /* 初始状态由 useState 提供；这里只负责 2s 波纹后进入开箱舞台 */
  useEffect(() => {
    const t = setTimeout(() => setPhase("stage"), 2000);
    return () => {
      clearTimeout(t);
      audioRef.current?.pause();
    };
  }, []);

  /* 开盖后才让下方内容浮现 */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setShowContent(true), 650);
    return () => clearTimeout(t);
  }, [open]);

  /* 打字机：45ms 逐字（开箱完成后才启动；手写模式不跑动画） */
  useEffect(() => {
    if (!showContent || mode === "handwrite") return;
    const iv = setInterval(() => {
      setTyped((n) => {
        if (n >= text.length) {
          clearInterval(iv);
          setTypeDone(true);
          return n;
        }
        return n + 1;
      });
    }, 45);
    return () => clearInterval(iv);
  }, [showContent, text, mode]);

  /* 播放录制的真实音频 */
  const togglePlay = () => {
    if (!audioUrl) return;
    if (!audioRef.current) {
      const el = new Audio(audioUrl);
      el.onloadedmetadata = () => {
        if (Number.isFinite(el.duration) && el.duration > 0) {
          setAudioDuration(el.duration);
        }
      };
      el.onended = () => setPlaying(false);
      audioRef.current = el;
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="fixed inset-0 z-[90] overflow-y-auto bg-[#F8F4EC]/85 backdrop-blur-2xl"
    >
      {/* 关闭 */}
      <button
        type="button"
        onClick={onClose}
        aria-label={rt.closePreview}
        className="fixed right-6 top-6 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-[#1C2329]/5 text-[#1C2329]/60 transition hover:bg-[#1C2329]/10 hover:text-[#1C2329]"
      >
        <X className="h-5 w-5" strokeWidth={1.5} />
      </button>

      <AnimatePresence mode="wait">
        {phase === "nfc" ? (
          /* ===== 阶段一：NFC 碰一碰波纹 ===== */
          <motion.div
            key="nfc"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.4 }}
            className="flex min-h-screen flex-col items-center justify-center"
          >
            <div className="relative flex h-72 w-72 items-center justify-center">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute rounded-full border-2 border-[#E65100]/50"
                  initial={{ width: 72, height: 72, opacity: 0.9 }}
                  animate={{ width: 288, height: 288, opacity: 0 }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    delay: i * 0.6,
                    ease: "easeOut",
                  }}
                />
              ))}
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1C2329] text-[#F8F4EC] shadow-[0_20px_50px_-15px_rgba(28,35,41,0.45)]">
                <Nfc className="h-8 w-8" strokeWidth={1.5} />
              </div>
            </div>
            <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.4em] text-[#1C2329]/45">
              {rt.opening}
            </p>
          </motion.div>
        ) : (
          /* ===== 阶段二：开箱仪式 + 信纸 ===== */
          <motion.div
            key="stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center px-6 pb-20 pt-16"
          >
            <style>{`@keyframes nfcSpin{to{transform:rotate(360deg)}}`}</style>

            {/* ---------- CSS 3D 开箱舞台（纯 CSS + Framer Motion，不加载 WebGL） ---------- */}
            <div
              ref={stageRef}
              className="relative flex w-full flex-col items-center"
            >
              {/* 盒子与光盘层共用的定位基准：窄屏留出盒盖展开的余地 */}
              <div className="relative aspect-square w-[min(56vw,300px)] sm:w-[min(66vw,300px)]">
                {/* 盒体：独立的 3D 上下文（底壳 + 阴影 + 盒盖） */}
                <div
                  className="absolute inset-0"
                  style={{ perspective: "1600px", transformStyle: "preserve-3d" }}
                >
              <motion.div
                ref={boxRef}
                data-testid="nfc-case"
                onClick={() => setOpen(true)}
                animate={{ scale: open ? 0.94 : 1 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className={`relative aspect-square w-full ${
                  open ? "" : "cursor-pointer"
                }`}
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* 底壳（背面图案） */}
                <div className="absolute inset-0 overflow-hidden rounded-md bg-[#17171B] shadow-[0_30px_60px_-25px_rgba(28,35,41,0.5)] ring-1 ring-black/20">
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

                  {/* 内侧右页：托盘底板（开盖后可见，与 DIY 2D 同源） */}
                  <div className="absolute inset-0 overflow-hidden bg-[#D9D5CC]">
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
                    <div className="pointer-events-none absolute inset-0 shadow-[inset_0_2px_12px_rgba(28,35,41,0.18)] ring-1 ring-inset ring-white/40" />
                  </div>

                  {/* 脊背：底壳左缘的窄竖条（与 DIY 同源数据） */}
                  <div
                    className="absolute inset-y-0 left-0 z-10 flex w-[9%] items-center justify-center overflow-hidden"
                    style={
                      spineGlass
                        ? {
                            background: "rgba(255,255,255,0.22)",
                            backdropFilter: "blur(8px)",
                            WebkitBackdropFilter: "blur(8px)",
                            boxShadow:
                              "inset 0 0 0 1px rgba(255,255,255,0.55), inset 0 0 18px rgba(255,255,255,0.35)",
                          }
                        : { background: spinePalette.bg }
                    }
                  >
                    {spineImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={spineImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center overflow-hidden px-1 text-center text-[10px] font-semibold tracking-[0.16em] [text-orientation:upright] [writing-mode:vertical-rl]"
                        style={{
                          color: spineTextColor,
                          fontFamily: spinePreset.css,
                        }}
                      >
                        {spineText.trim() || "Hallo CD"}
                      </span>
                    )}
                  </div>
                </div>

                {/* 盒底投影：光盘被拖起时拉大、变淡，模拟离开盒底悬浮 */}
                <motion.div
                  aria-hidden
                  animate={{
                    opacity: dragging ? 0.26 : 0.18,
                    scale: dragging ? 1.24 : 1,
                  }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="pointer-events-none absolute inset-[16%] z-[15] rounded-full bg-black blur-xl"
                />

                {/* 光盘不在盒体的 3D 上下文里 —— 它被挪到盒子之上的独立图层，
                    否则盒盖翻过来时会把碟面整个盖住（看着像碟子跑进盒子后面）。
                    实体光盘见下方「光盘层」。 */}

                {/* 盒盖：绕左缘翻开（inner 面朝内，翻过去后显示背面）
                    窄屏把开角收一点，否则盖子会整块甩出屏幕外 */}
                <motion.div
                  animate={{ rotateY: open ? (narrow ? -115 : -125) : 0 }}
                  transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute inset-0 z-30 origin-left"
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {/* 正面：封面 + 腰封 */}
                  <div
                    className="absolute inset-0 overflow-hidden rounded-md shadow-[0_18px_40px_-18px_rgba(28,35,41,0.45)] ring-1 ring-white/50"
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

                    {/* 腰封：正面左侧 24% 宽纸带 */}
                    {showObi && (
                      <div
                        className="absolute inset-y-0 left-0 flex w-[24%] items-center justify-center overflow-hidden border-r border-black/10"
                        style={
                          obiGlass
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
                            className="flex max-h-[92%] items-center justify-center overflow-hidden px-1 text-center text-[11px] font-semibold leading-tight [text-orientation:upright] [writing-mode:vertical-rl]"
                            style={{
                              color: obiTextColor,
                              fontFamily: obiPreset.css,
                            }}
                          >
                            {obiText.trim() || "Hallo CD"}
                          </span>
                        )}
                      </div>
                    )}

                    {/* 亚克力高光 */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/35" />
                    <div className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-white/40" />
                  </div>

                  {/* 盒盖内侧（翻开后可见，绑定内侧左页） */}
                  <div
                    className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-md bg-[#F8F4EC] ring-1 ring-black/10"
                    style={{
                      transform: "rotateY(180deg)",
                      backfaceVisibility: "hidden",
                    }}
                  >
                    {innerLeftUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={innerLeftUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <span className="font-serif text-[11px] italic tracking-[0.25em] text-[#1C2329]/30">
                        Hallo CD
                      </span>
                    )}
                  </div>
                </motion.div>
              </motion.div>
                </div>

                {/* ---------- 光盘层：独立图层，永远画在盒体之上 ----------
                    盒盖是 3D 旋转的实体，翻到一半时会扫过盒子正面；
                    光盘如果留在同一个 3D 上下文里，就会被盖面整个盖住，
                    看起来像“碟子跑到盒子后面去了”。
                    把它挪到盒子之上的独立图层，绘制顺序就永远在盒盖之上。 */}
                <motion.div
                  className="absolute inset-0"
                  animate={{ scale: open ? 0.94 : 1 }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  style={{ perspective: "1600px" }}
                >
                  <motion.div
                    drag={open}
                    dragConstraints={stageRef}
                    dragElastic={0.2}
                    dragSnapToOrigin
                    dragMomentum={false}
                    onDragStart={() => {
                      setDragging(true);
                      /* “拿起光盘”：短促低频 + 轻震 */
                      playSfx(520, 360, 0.12, 0.045);
                      haptic(12);
                    }}
                    onDragEnd={() => {
                      setDragging(false);
                      /* “放回盒内”：上扬音 + 双击式轻震 */
                      playSfx(300, 540, 0.18, 0.04);
                      haptic([6, 28, 6]);
                    }}
                    whileDrag={{ scale: 1.08, cursor: "grabbing" }}
                    animate={{
                      /* 开盖后才浮现：等盒盖扫过去再出现，避免盖面压着碟面 */
                      opacity: open ? 1 : 0,
                      x: open ? (narrow ? "26%" : "34%") : "0%",
                      y: open ? (narrow ? "-9%" : "-7%") : "0%",
                      scale: open ? 1.04 : 1,
                      rotateY: open ? -12 : 0,
                    }}
                    transition={{
                      opacity: { duration: 0.28, delay: 0.62 },
                      x: { type: "spring", stiffness: 110, damping: 18, delay: 0.68 },
                      y: { type: "spring", stiffness: 110, damping: 18, delay: 0.68 },
                      scale: { type: "spring", stiffness: 110, damping: 18, delay: 0.68 },
                      rotateY: { duration: 0.9, delay: 0.68 },
                    }}
                    className="absolute inset-[10%]"
                    style={{ touchAction: "none", cursor: open ? "grab" : "default" }}
                  >
                    <div
                      className="relative h-full w-full overflow-hidden rounded-full shadow-[0_20px_50px_-18px_rgba(28,35,41,0.4)] ring-1 ring-black/10"
                      style={{
                        background: discColor,
                        animation: "nfcSpin 14s linear infinite",
                      }}
                    >
                      {/* 镭射光泽（与 DIY Disc2D 一致） */}
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
                      <div className="absolute left-1/2 top-1/2 h-[13%] w-[13%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F8F4EC] shadow-inner ring-1 ring-black/15" />
                    </div>
                  </motion.div>
                </motion.div>
              </div>

              {/* 开箱提示 / 取出提示 */}
              <AnimatePresence mode="wait">
                {!open ? (
                  <motion.p
                    key="hint"
                    onClick={() => setOpen(true)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.5 }}
                    className="mt-9 cursor-pointer text-center text-[11px] font-semibold uppercase tracking-[0.28em] text-[#1C2329]/45"
                  >
                    Tap to open your memory…
                    {rt.tapHintNote && (
                      <span className="mt-2 block text-[10px] tracking-[0.2em] text-[#1C2329]/30">
                        {rt.tapHintNote}
                      </span>
                    )}
                  </motion.p>
                ) : (
                  <motion.p
                    key="drag"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9, duration: 0.6 }}
                    className="mt-9 text-center text-[10px] uppercase tracking-[0.25em] text-[#1C2329]/35"
                  >
                    Drag the disc out, release to put it back
                    {rt.dragHintNote && (
                      <span className="mt-2 block text-[9px] tracking-[0.2em] text-[#1C2329]/25">
                        {rt.dragHintNote}
                      </span>
                    )}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* ---------- 开箱后依次浮现：语音 → 照片 → 信纸 ---------- */}
            <AnimatePresence>
              {showContent && (
                <div className="mt-12 flex w-full flex-col items-center">
                  {/* 视觉回忆：拍立得小卡 */}
                  {mediaFile && (
                    <motion.div
                      initial={{ opacity: 0, y: 16, rotate: 2 }}
                      animate={{ opacity: 1, y: 0, rotate: 2 }}
                      transition={{ delay: 0.1, duration: 0.6 }}
                      className="mb-8 w-28 overflow-hidden rounded-md border-4 border-white bg-white shadow-[0_16px_40px_-16px_rgba(28,35,41,0.35)]"
                    >
                      {mediaFile.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={mediaFile.url}
                          alt={mediaFile.name}
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <video
                          src={mediaFile.url}
                          className="aspect-square w-full object-cover"
                          autoPlay
                          muted
                          loop
                          playsInline
                        />
                      )}
                    </motion.div>
                  )}

                  {/* 极简音频控制条 */}
                  {audioUrl && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.6 }}
                      className="mb-8 flex w-full max-w-sm items-center gap-3 rounded-full border border-black/10 bg-white/70 px-4 py-2"
                    >
                      <button
                        type="button"
                        onClick={togglePlay}
                        aria-label={playing ? rt.pauseRec : rt.playRec}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E65100] text-white transition hover:bg-[#c94500]"
                      >
                        {playing ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="ml-0.5 h-3.5 w-3.5" />
                        )}
                      </button>
                      <span className="text-[10px] uppercase tracking-[0.25em] text-[#1C2329]/45">
                        Voice Message
                      </span>
                      <span className="ml-auto h-1 w-24 overflow-hidden rounded-full bg-black/10">
                        <motion.span
                          className="block h-full bg-[#E65100]"
                          animate={
                            playing ? { width: ["0%", "100%"] } : { width: "0%" }
                          }
                          transition={
                            playing
                              ? {
                                  duration: audioDuration,
                                  ease: "linear",
                                }
                              : { duration: 0.2 }
                          }
                        />
                      </span>
                    </motion.div>
                  )}

                  {/* 信纸：<img> 自然撑开高度（绝不裁切），书写层绝对定位在 area 内 */}
                  <motion.div
                    initial={{ opacity: 0, y: 20, scaleY: 0.96 }}
                    animate={{ opacity: 1, y: 0, scaleY: 1 }}
                    transition={{
                      delay: 0.5,
                      duration: 0.6,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className={`relative w-full overflow-hidden rounded-sm shadow-md ${
                      paperSrc ? "" : "letter-paper p-8 md:p-10"
                    }`}
                  >
                    {/* 信纸皮肤：直接用 <img> 撑开正确高度，避免背景图裁切 */}
                    {paperSrc && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={paperSrc}
                        alt=""
                        className="block h-auto w-full select-none"
                        draggable={false}
                      />
                    )}

                    {/* 书写层：有皮肤时绝对定位在 area（上右下左）内；
                        注意：不能加 h-full，否则 height:100% 会覆盖 inset 的 bottom，
                        导致书写层向下溢出信纸 */}
                    <div
                      className={
                        paperSrc ? "absolute flex flex-col" : "flex flex-col"
                      }
                      style={paperSrc ? { inset: paperSkin?.area ?? "8%" } : undefined}
                    >
                      {/* 正文：过长时内部滚动，滚动条隐藏 */}
                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[2%] py-[3%] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {mode === "handwrite" ? (
                          /* 手写模式：只展示透明笔迹图，不显示 letterText */
                          handwrittenImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={handwrittenImage}
                              alt="手写内容"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <p className="font-serif text-[13px] italic text-[#1C2329]/35">
                              {rt.handwrittenEmpty}
                            </p>
                          )
                        ) : (
                          /* 打字模式：逐字出现，字号 / 颜色来自信纸编辑器 */
                          <p
                            className="whitespace-pre-line font-serif"
                            style={{
                              fontSize: `${letterFontSize}px`,
                              color: letterColor,
                              lineHeight: 1.8,
                            }}
                          >
                            {text.slice(0, typed)}
                            {!typeDone && (
                              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-[#E65100] align-middle" />
                            )}
                          </p>
                        )}
                      </div>

                      {/* 落款 + 操作：固定在书写区底部，不遮挡信纸底部插画 */}
                      <AnimatePresence>
                        {(mode === "handwrite" || typeDone) && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="shrink-0 px-[2%] pb-[3%] pt-4"
                          >
                            <p
                              className="text-right font-serif text-[15px] italic"
                              style={{ color: letterColor, opacity: 0.8 }}
                            >
                              {sign}
                            </p>
                            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 border-t border-[#1C2329]/10 pt-4">
                              {audioUrl && (
                                <button
                                  type="button"
                                  onClick={togglePlay}
                                  className="flex items-center gap-2 rounded-full bg-[#1C2329] px-6 py-2.5 text-xs font-semibold text-[#F8F4EC] transition hover:bg-[#2a333b]"
                                >
                                  {playing ? (
                                    <Pause className="h-3.5 w-3.5" />
                                  ) : (
                                    <Play className="h-3.5 w-3.5" />
                                  )}
                                  {playing ? "Pause" : "▶ Play Voice"}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setReplied(true)}
                                className="flex items-center gap-2 rounded-full bg-[#E65100] px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-[#c94500]"
                              >
                                <Reply className="h-3.5 w-3.5" /> Reply with a CD
                              </button>
                            </div>
                            {replied && (
                              <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="mt-4 rounded-lg bg-[#E65100]/10 px-4 py-2.5 text-center text-xs text-[#E65100]"
                              >
                                {rt.replyLinkLine1}
                                <br />
                                {rt.replyLinkLine2}
                              </motion.p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
