"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useLang } from "@/lib/i18n";

/* ---------------------------------- */
/*  共享：CD 柔和镭射锥形渐变（低饱和） */
/* ---------------------------------- */
const RAINBOW_CONIC =
  "conic-gradient(from 205deg," +
  "#e6e2d8 0deg, #d5d1c8 25deg," +
  "#f0dfe3 55deg, #dfe9ee 80deg, #e4efe2 105deg," + // 第一弧：淡粉→淡蓝→淡绿
  "#e3e0d8 130deg, #d6d3cc 155deg," +
  "#f2ecd7 200deg, #f0dfe3 235deg, #dfe9ee 265deg," + // 第二弧：米黄→淡粉→淡蓝
  "#d9d6cf 300deg, #e9e6de 330deg, #e6e2d8 360deg)";

/* 柔和悬浮阴影：默认 / hover（更大更淡，无发光） */
const SOFT_SHADOW =
  "shadow-[0_20px_40px_rgba(28,35,41,0.08)] transition-all duration-500 " +
  "hover:shadow-[0_25px_50px_rgba(28,35,41,0.10)]";

/* Hover 描边：默认浅灰 → 赤陶橘（唯一亮色） */
const HOVER_BORDER =
  "border border-black/10 transition-colors duration-300 hover:border-[#E65100]";

/* 模拟音频时长（秒） */
const PLAYER_DURATION = 14;

/* ---------------------------------- */
/*  Mock 数据：带图样例 + 空白模板      */
/* ---------------------------------- */
type Item = {
  id: number;
  kind: "case" | "disc";
  size: string;
  x: string;
  y: string;
  rotate: number;
  z: number;
  delay: number;
  image?: string; // 有图 = DIY 样例；无图 = 空白镭射模板
  title: string;
  desc: string;
  letter?: { body: string[]; sender: string }; // 展开书信内容
};

const BLANK = { title: "Blank Moment", desc: "一段等待被填满的空白。" };

/* 默认书信（未单独定制 letter 的带图碟片使用） */
const DEFAULT_LETTER = {
  body: [
    "I still remember the light that day — soft, unhurried, falling across everything like it had nowhere else to be. We weren't doing anything important, and maybe that's exactly why it stayed with me.",
    "You laughed at something small, and for a moment the whole world felt like it was holding its breath. I remember thinking: don't forget this. Not the place, not the weather — just the feeling of being exactly where I belonged.",
    "Time moves on, quietly. But every time I see this photograph, I'm back there again. Same light, same laughter, same us.",
  ],
  sender: "A.",
};

const ITEMS: Item[] = [
  // 近景大物（前景，z-30）
  { id: 1, kind: "case", size: "clamp(140px, 19vw, 235px)", x: "0%", y: "50%", rotate: -10, z: 30, delay: 0.05,
    image: "/images/my-cat.jpg",
    title: "A memory with my cat", desc: "灯亮着，沙发归它，夜晚归我。",
    letter: {
      body: [
        "The lamp was on, the house was quiet, and you were asleep on my side of the sofa — again. Your paws tucked under the blanket like you had paid rent for that exact corner.",
        "I sat down next to you and didn't move for an hour. You purred in your sleep, small and steady, like a little engine keeping the whole evening warm.",
        "People think pets live in our homes. They don't. They live in our days, in the softest hours — exactly like this one.",
      ],
      sender: "the one who shares the sofa",
    } },
  { id: 7, kind: "case", size: "clamp(125px, 17vw, 215px)", x: "42%", y: "64%", rotate: -6, z: 30, delay: 0.20,
    image: "/images/couple-1.jpg",
    title: "Golden hour, golden boy", desc: "风追不上它，夕阳也追不上。",
    letter: {
      body: [
        "The sun was low and gold, the grass still warm from the afternoon. I called your name once, and you came running like that single word meant everything.",
        "Your ears were flying. You were smiling — I know people say dogs don't smile, but you were. For those few seconds, nothing existed except you, the light, and the field.",
        "I took one photo. Just one. It's a little blurry at the edges, and it's perfect.",
      ],
      sender: "his favorite human",
    } },
  { id: 10, kind: "disc", size: "clamp(88px, 11vw, 145px)", x: "30%", y: "22%", rotate: -8, z: 30, delay: 0.30,
    image: "/images/my-dog.jpg",
    title: "Make a wish, together", desc: "蜡烛只有三根，愿望却装了一整个童年。",
    letter: {
      body: [
        "Three candles, one small cake, and two of you leaning in so close I was afraid your hair would catch the flame. You argued about who would blow first — then blew together, like always.",
        "The wishes were secrets, you said. But I heard one of you whisper \"again tomorrow\" — and honestly, that might be the best wish I have ever heard.",
        "Years from now you'll both be taller than me. But this photograph will always stay the size of my heart: two small faces, three candles, and all the light in the world.",
      ],
      sender: "Mom",
    } },
  { id: 5, kind: "case", size: "clamp(85px, 11vw, 140px)", x: "75%", y: "12%", rotate: 9, z: 30, delay: 0.40, ...BLANK },
  // 中景（z-20，与前景互相压叠）
  { id: 3, kind: "case", size: "clamp(105px, 14vw, 180px)", x: "13%", y: "41%", rotate: 6, z: 20, delay: 0.12, ...BLANK },
  // 说明：原先这里引用 images.unsplash.com 的两张占位图。该域名在部分网络环境
  //（含中国大陆）不可达，会让 Next 图片优化代理一直等待上游超时，首屏被拖住。
  // 现改为与其他空槽位一致的空白碟：不依赖任何外部资源，离线也能秒开。
  { id: 6, kind: "disc", size: "clamp(95px, 12vw, 155px)", x: "80%", y: "34%", rotate: 5, z: 20, delay: 0.25, ...BLANK },
  { id: 8, kind: "disc", size: "clamp(58px, 7vw, 95px)", x: "33%", y: "66%", rotate: 18, z: 20, delay: 0.35, ...BLANK },
  // 远景小物（背景，z-10，被压住）
  { id: 2, kind: "disc", size: "clamp(64px, 8vw, 105px)", x: "9%", y: "10%", rotate: 12, z: 10, delay: 0.15, ...BLANK },
  { id: 4, kind: "disc", size: "clamp(115px, 15vw, 185px)", x: "57%", y: "7%", rotate: -14, z: 10, delay: 0.45, ...BLANK },
  { id: 9, kind: "case", size: "clamp(100px, 13vw, 170px)", x: "58%", y: "58%", rotate: 11, z: 10, delay: 0.55, ...BLANK },
];

/* ---------------------------------- */
/*  碟面：有图渲染照片，无图纯镭射      */
/* ---------------------------------- */
function DiscFace({ image }: { image?: string }) {
  return (
    <>
      {/* 照片层：圆形裁切、轻微降透明度融入碟面 */}
      {image && (
        <>
          <Image
            src={image}
            alt=""
            fill
            sizes="(max-width: 640px) 40vw, 300px"
            className="rounded-full object-cover opacity-90"
          />
          {/* 照片上再罩一层微弱镭射，保留 CD 质感 */}
          <div
            className="absolute inset-0 rounded-full opacity-25"
            style={{ background: RAINBOW_CONIC }}
          />
        </>
      )}
      {/* 细密圆环刻纹 */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "repeating-radial-gradient(circle, rgba(255,255,255,0.10) 0 1px, transparent 1px 3px)",
        }}
      />
      {/* 顶部柔光 */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/60 via-transparent to-transparent" />
      {/* 内圈数据环 */}
      <div className="absolute inset-[18%] rounded-full ring-1 ring-black/5" />
      {/* 中孔（与页面底色一致，带一圈微弱塑料高光） */}
      <div
        className="absolute left-1/2 top-1/2 h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F8F4EC] ring-1 ring-black/10"
        style={{
          boxShadow:
            "inset 0 1px 2px rgba(28,35,41,0.18), 0 0 0 2px rgba(255,255,255,0.4), 0 1px 4px rgba(255,255,255,0.6)",
        }}
      />
    </>
  );
}

/* ---------------------------------- */
/*  裸光碟（柔和镭射反光）             */
/* ---------------------------------- */
function Disc({ image }: { image?: string }) {
  return (
    <div
      className={`disc-3d relative h-full w-full overflow-hidden rounded-full ${HOVER_BORDER}`}
      style={{ background: RAINBOW_CONIC }}
    >
      <DiscFace image={image} />
    </div>
  );
}

/* ---------------------------------- */
/*  CD 塑料壳（米色磨砂质感）          */
/* ---------------------------------- */
function JewelCase({ image }: { image?: string }) {
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-[6px] opacity-90 ${SOFT_SHADOW} ${HOVER_BORDER}`}
      style={{
        // 米色磨砂：半透明白/米 + 背景虚化
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.85), rgba(250,247,240,0.6) 45%, rgba(236,231,220,0.65))",
        backdropFilter: "blur(10px) saturate(0.9)",
        WebkitBackdropFilter: "blur(10px) saturate(0.9)",
      }}
    >
      {/* 左侧书脊 */}
      <div className="absolute inset-y-0 left-0 w-[15%] border-r border-black/5 bg-gradient-to-r from-white/60 to-transparent" />
      <div className="absolute inset-y-[8%] left-[6%] w-px bg-black/5" />
      <div className="absolute inset-y-[8%] left-[10%] w-px bg-black/5" />
      {/* 壳内光碟：与裸碟共享同一套碟面逻辑 */}
      <div
        className="absolute right-[7%] top-1/2 aspect-square w-[70%] -translate-y-1/2 overflow-hidden rounded-full ring-1 ring-black/5"
        style={{ background: RAINBOW_CONIC }}
      >
        <DiscFace image={image} />
      </div>
      {/* 磨砂漫射层：朦胧化壳内物体 */}
      <div className="absolute inset-0 bg-white/25 backdrop-blur-[2px]" />
      {/* 柔和漫反射高光（无锐利反光） */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-transparent opacity-70" />
      {/* 亚克力斜向玻璃反光带 */}
      <div className="pointer-events-none absolute -left-[25%] top-[-20%] h-[140%] w-[38%] rotate-12 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </div>
  );
}

/* ---------------------------------- */
/*  单个可拖拽元素（含拖拽/点击甄别）   */
/* ---------------------------------- */
function DraggableItem({
  item,
  constraintsRef,
  onSelect,
}: {
  item: Item;
  constraintsRef: React.RefObject<HTMLElement | null>;
  onSelect: () => void;
}) {
  // 记录拖拽结束时间，拖拽刚结束时的“点击”一律吞掉，防止拖完松手误触发展开
  const lastDragEnd = useRef(0);

  const handleActivate = () => {
    if (Date.now() - lastDragEnd.current < 150) return;
    onSelect();
  };

  return (
    <motion.div
      className="absolute cursor-grab active:cursor-grabbing"
      style={{
        left: item.x,
        top: item.y,
        width: item.size,
        height: item.size,
        zIndex: item.z,
        touchAction: "none", // 手机端拖拽时不触发页面滚动
      }}
      initial={{ opacity: 0, scale: 0.5, y: 60, rotate: item.rotate - 10 }}
      animate={{ opacity: 1, scale: 1, y: 0, rotate: item.rotate }}
      transition={{
        type: "spring",
        stiffness: 120,
        damping: 16,
        delay: item.delay,
      }}
      drag
      dragConstraints={constraintsRef}
      dragElastic={0.25}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 1.12, cursor: "grabbing" }}
      onDragEnd={() => {
        lastDragEnd.current = Date.now();
      }}
      onTap={handleActivate} // 真实指针轻点
      onClick={handleActivate} // 兜底：合成事件 / 键盘 / 辅助技术激活
    >
      {item.kind === "case" ? (
        <JewelCase image={item.image} />
      ) : (
        <Disc image={item.image} />
      )}
    </motion.div>
  );
}

/* ---------------------------------- */
/*  展开详情遮罩（米色杂志风）          */
/* ---------------------------------- */
function DetailModal({
  item,
  onClose,
  onCreate,
}: {
  item: Item;
  onClose: () => void;
  onCreate: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showLetter, setShowLetter] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // Toast 自动隐藏
  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(false), 2400);
    return () => clearTimeout(t);
  }, [showToast]);

  // 书信内容（未定制时使用默认信）
  const letter = item.letter ?? DEFAULT_LETTER;

  // 模拟播放：进度随时间推进
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setProgress((p) => Math.min(1, p + 0.1 / PLAYER_DURATION));
    }, 100);
    return () => clearInterval(timer);
  }, [playing]);

  // 播完自动停在暂停态
  useEffect(() => {
    if (progress >= 1) setPlaying(false);
  }, [progress]);

  const togglePlay = () => {
    if (!playing && progress >= 1) setProgress(0); // 播完再点 = 重播
    setPlaying((v) => !v);
  };

  // 歌词式逐字点亮：已点亮字数随进度增长
  const chars = item.desc.split("");
  const litCount = Math.floor(progress * chars.length);

  return (
    <motion.div
      className="fixed inset-0 z-50 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* 遮罩：米色磨砂，点击关闭 */}
      <div
        className="fixed inset-0 bg-[#F8F4EC]/90 backdrop-blur-md"
        onClick={onClose}
      />

      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="fixed right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-black/15 text-[#1C2329]/60 transition-colors hover:bg-[#1C2329] hover:text-[#F8F4EC]"
      >
        ✕
      </button>

      {/* 单列内容：可滚动 */}
      <div className="relative mx-auto flex min-h-full w-full max-w-2xl flex-col items-center px-6 py-16 text-center sm:py-20">
        {/* 大碟面 */}
        <motion.div
          className="aspect-square w-52 shrink-0 sm:w-64"
          initial={{ scale: 0.5, opacity: 0, y: 60, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, y: 0, rotate: 0 }}
          exit={{ scale: 0.6, opacity: 0, y: 40, rotate: 6 }}
          transition={{ type: "spring", stiffness: 170, damping: 19 }}
        >
          {item.kind === "case" ? (
            <JewelCase image={item.image} />
          ) : (
            <Disc image={item.image} />
          )}
        </motion.div>

        {/* 文案 */}
        <div className="mt-8 flex w-full flex-col items-center">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.35em] text-[#1C2329]/40">
            No. {String(item.id).padStart(2, "0")} — {item.image ? "Sample" : "Blank"}
          </p>
          <h3 className="font-serif text-3xl font-medium italic leading-tight text-[#1C2329] sm:text-4xl">
            {item.title}
          </h3>
          {/* 播放控件：圆形播放键 + 录音波纹 + 极细进度条 */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E65100] text-white transition-transform duration-300 hover:scale-105 active:scale-95"
            >
              {playing ? (
                <Pause size={16} strokeWidth={2} />
              ) : (
                <Play size={16} strokeWidth={2} className="ml-0.5" />
              )}
            </button>
            {/* 录音波纹：播放时高低跳动，暂停时静止 */}
            <div className="flex h-4 items-center gap-[3px]">
              {[0.9, 0.7, 1.1, 0.8, 1].map((dur, i) => (
                <span
                  key={i}
                  className="h-3.5 w-[2px] origin-center rounded-full bg-[#E65100] transition-transform duration-300"
                  style={
                    playing
                      ? { animation: `wave-bar ${dur}s ease-in-out ${i * 0.12}s infinite` }
                      : { transform: "scaleY(0.3)" }
                  }
                />
              ))}
            </div>
            {/* 进度条：灰轨 + 橘色进度 */}
            <div className="relative h-px w-28 bg-[#1C2329]/15 sm:w-44">
              <div
                className="absolute inset-y-0 left-0 bg-[#E65100]"
                style={{ width: `${progress * 100}%`, transition: "width 100ms linear" }}
              />
            </div>
          </div>
          {/* 歌词式描述：随播放进度逐字点亮 */}
          <p className="mt-4 font-serif-zh text-sm leading-loose tracking-[0.2em]">
            {chars.map((ch, i) => (
              <span
                key={i}
                style={{
                  color: i < litCount ? "#1C2329" : "rgba(28,35,41,0.25)",
                  transition: "color 0.3s ease",
                }}
              >
                {ch}
              </span>
            ))}
          </p>
          {/* 书信展开入口 + DIY 暗示（仅有照片的碟片显示） */}
          {item.image && (
            <div className="mt-6 flex w-full flex-col items-center">
              <button
                onClick={() => {
                  setPlaying(false); // 展开书信时暂停“播放”
                  setShowLetter((v) => !v);
                }}
                className="group block text-xs font-semibold uppercase tracking-[0.3em] text-[#E65100]"
              >
                <span className="relative">
                  {showLetter ? "Fold the letter ↑" : "Read the full letter →"}
                  <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-[#E65100] transition-all duration-300 group-hover:w-full" />
                </span>
              </button>
              <p className="mt-2.5 text-[9px] tracking-wide text-[#1C2329]/25">
                You can choose this paper style in the DIY Studio.
              </p>

              {/* 信纸：平滑展开（Slide Down） */}
              <AnimatePresence initial={false}>
                {showLetter && (
                  <motion.div
                    key="letter"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full overflow-hidden"
                  >
                    <div className="letter-paper mb-12 mt-8 px-10 py-8 text-left sm:px-16">
                      <p className="font-serif text-base italic text-[#1C2329]/60">Dear you,</p>
                      {/* 段落间距用 padding 撑开整行，横线不断 */}
                      <div className="font-serif text-sm text-[#1C2329]/85">
                        {letter.body.map((paragraph, i) => (
                          <p key={i} className="paper-gap">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                      <p className="paper-gap font-serif text-base italic text-[#1C2329]/60">
                        With love, {letter.sender}
                      </p>
                      {/* 商业标签 + 升级入口（UI 展示） */}
                      <div className="paper-gap flex flex-col items-end gap-3 border-t border-black/5">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[#1C2329]/40">
                          Classic Note (Free)
                        </span>
                        <button
                          onClick={() => setShowToast(true)}
                          className="rounded-full border border-[#E65100]/40 px-5 py-2 text-[11px] font-medium tracking-[0.15em] text-[#E65100] transition-colors hover:bg-[#E65100] hover:text-white"
                        >
                          ✨ Upgrade to Premium Paper ($1.99)
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
          <button
            onClick={onCreate}
            className="mt-8 rounded-full bg-[#E65100] px-7 py-3 text-xs font-medium uppercase tracking-[0.25em] text-white transition-transform duration-300 hover:scale-105 active:scale-95"
          >
            Create your own ↓
          </button>
        </div>
      </div>

      {/* Toast：PayPal 跳转提示（UI 展示） */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed bottom-8 left-0 right-0 z-[70] mx-auto w-fit rounded-full bg-[#1C2329] px-5 py-2.5 text-xs tracking-wide text-[#FDFBF7] shadow-lg"
          >
            Redirecting to PayPal...
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ---------------------------------- */
/*  主组件                             */
/* ---------------------------------- */
export default function InteractiveHero() {
  const { t } = useLang();
  const constraintsRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedItem = ITEMS.find((i) => i.id === selectedId) ?? null;

  // 展开时锁定背景滚动 + Esc 关闭
  useEffect(() => {
    if (selectedId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [selectedId]);

  // 关闭弹层后平滑滚动到 DIY 工作台
  const handleCreate = () => {
    setSelectedId(null);
    setTimeout(() => {
      document
        .getElementById("next-section")
        ?.scrollIntoView({ behavior: "smooth" });
    }, 60);
  };

  return (
    <>
      <section
        ref={constraintsRef}
        className="relative h-[92vh] w-full select-none overflow-hidden bg-[#F8F4EC] text-[#1C2329]"
      >
        {/* 顶部导航改由 app/layout.tsx 的 SiteNav 统一提供，
            此处原有的 pointer-events-none 装饰条已移除 */}

        {/* 中央文案（pointer-events-none：不遮挡后方碟片的拖拽与点击） */}
        <div className="pointer-events-none absolute inset-0 z-[35] flex flex-col items-center justify-center px-6 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-4 text-[11px] font-medium uppercase tracking-[0.35em] text-[#1C2329]/45 sm:text-xs"
          >
            halloCD · STUDIO
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-[12ch] font-serif text-[clamp(3rem,10vw,9rem)] font-black leading-[0.95] tracking-[-0.02em]"
          >
            Design Your <em className="font-medium italic text-[#E65100]">Moment.</em>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-8 font-serif-zh text-sm leading-loose tracking-[0.35em] text-[#1C2329]/55 sm:text-base"
          >
            {t.hero.lead}
          </motion.p>
        </div>

        {/* 散落的 CD 壳与光碟 */}
        {ITEMS.map((item) => (
          <DraggableItem
            key={item.id}
            item={item}
            constraintsRef={constraintsRef}
            onSelect={() => setSelectedId(item.id)}
          />
        ))}

      </section>

      {/* 展开详情弹层 */}
      <AnimatePresence>
        {selectedItem && (
          <DetailModal
            key={selectedItem.id}
            item={selectedItem}
            onClose={() => setSelectedId(null)}
            onCreate={handleCreate}
          />
        )}
      </AnimatePresence>
    </>
  );
}
