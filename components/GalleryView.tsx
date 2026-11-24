"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import type { Product } from "@/lib/products";
import { PAPER_SKINS } from "./paperSkins";
import { useLang } from "@/lib/i18n";
import SpineShelf from "./SpineShelf";
import CDCase3D from "./CDCase3D";

/* ---------------------------------- */
/*  居中放大弹层                       */
/* ---------------------------------- */
function DetailModal({
  item,
  onClose,
}: {
  item: Product;
  onClose: () => void;
}) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);

  /* 便签信纸：复用 NFC 信纸编辑区的同一套模板素材 */
  const noteSkin =
    PAPER_SKINS.find((skin) => skin.id === item.noteTemplate) ?? PAPER_SKINS[0];
  /* 墨色按书写区底色选：浅底用深墨，深底才用米白墨。
     底色看 paperSkins 的 paper 字段（p01–p11 实测全是浅底）。
     早先这里把 p05「牛皮胶带」和 p07「星星笺」当成深底，白纸白字 → 整段隐形。 */
  const noteOnDark = (noteSkin.paper ?? "light") === "dark";
  const noteInk = noteOnDark ? "#F7F1E4" : "#2E1B15";
  const noteInkSoft = noteOnDark ? "rgba(247,241,228,0.88)" : "#3A2620";
  const [noteTop, noteRight, noteBottom, noteLeft] = noteSkin.area.split(" ");

  // 进入弹层后自动开盒一次；再点盒盖可反向合上
  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), 140);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* 遮罩：米色磨砂，点击关闭 */}
      <div
        className="absolute inset-0 bg-[#F7F5EF]/90 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 棚拍环境光：主光在左前（收紧，不然整幅画面一片白）、冷补光在右下 */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(62% 48% at 6% -4%, rgba(255,255,255,0.66), rgba(255,255,255,0) 64%)," +
            "radial-gradient(86% 70% at 96% 108%, rgba(138,166,188,0.40), rgba(138,166,188,0) 68%)",
        }}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`gallery-modal-title-${item.id}`}
        initial={{ opacity: 0, scale: 0.96, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
        className="relative flex w-full max-w-lg flex-col items-center text-center"
      >
        {/* 3D 开盒：盒子平躺在倾斜的桌面上，盒盖绕左侧书脊立起来 */}
        <CDCase3D
          item={item}
          open={open}
          onToggle={() => setOpen((v) => !v)}
        />

        {/* 极简操作提示：放在盒子下面 —— 立起来的盒盖会盖住上方空间 */}
        <p className="mt-3 text-[9px] font-medium uppercase tracking-[0.32em] text-[#1C2329]/40 sm:text-[10px]">
          {t.showcase.hint}
        </p>

        {/* 便签：按当前 CD 的 noteTemplate 复用信纸模板素材，排在盒体正下方 */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 10, rotate: -8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, rotate: -4, scale: 1 }}
              exit={{ opacity: 0, y: 8, rotate: -6, scale: 0.96 }}
              transition={{
                type: "spring",
                stiffness: 160,
                damping: 18,
                delay: 0.3,
              }}
              className="mt-2 w-full max-w-[190px] origin-top sm:max-w-[220px]"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-[2px] shadow-[0_16px_30px_-14px_rgba(28,35,41,0.45)]">
                <img
                  src={noteSkin.src}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div
                  className="absolute text-left"
                  style={{
                    top: noteTop,
                    right: noteRight,
                    bottom: noteBottom,
                    left: noteLeft,
                  }}
                >
                  <p
                    className="font-serif text-[12px] italic leading-tight sm:text-[13px]"
                    style={{ color: noteInk }}
                  >
                    {item.name}
                  </p>
                  <p
                    className="mt-1 line-clamp-3 text-[9px] leading-[1.5] sm:text-[10px]"
                    style={{ color: noteInkSoft }}
                  >
                    {lang === "zh" ? item.noteTextZh : item.noteText}
                  </p>
                </div>
                <span
                  className={`absolute bottom-[7%] right-[6%] rounded-full border px-2 py-[3px] text-[8px] font-semibold uppercase tracking-[0.14em] sm:text-[9px] ${
                    noteOnDark
                      ? "border-white/45 bg-white/15 text-[#F7F1E4]"
                      : "border-[#7C3B2E]/40 bg-white/85 text-[#7C3B2E]"
                  }`}
                >
                  {lang === "zh" ? item.noteCtaZh : item.noteCtaEn}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/45">
          {t.scenes[item.id] ?? item.scene}
        </p>
        <h2
          id={`gallery-modal-title-${item.id}`}
          className="mt-2 font-serif text-2xl font-medium italic leading-tight text-[#1C2329] sm:text-3xl"
        >
          {item.name}
        </h2>
      </motion.div>
    </motion.div>
  );
}

export default function GalleryView({ bare = false }: { bare?: boolean }) {
  const { t } = useLang();
  const [selected, setSelected] = useState<Product | null>(null);

  // 弹层打开时锁定背景滚动 + Esc 关闭
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [selected]);

  return (
    <section className="w-full bg-[#F7F5EF] text-[#1C2329]">
      {/* 顶部装饰条（bare 模式嵌入首页时隐藏，避免第二屏重复导航） */}
      {!bare && (
        <header className="flex items-center justify-between px-6 py-5 text-[11px] font-medium uppercase tracking-[0.25em] text-[#1C2329]/50 sm:px-10">
          <span>CD® Studio</span>
          <span className="hidden sm:block">The Gallery</span>
          <Link
            href="/"
            className="transition-colors duration-300 hover:text-[#E65100]"
          >
            ← Home
          </Link>
        </header>
      )}

      <div className="mx-auto w-full max-w-6xl px-6 pb-16 pt-10 sm:px-10 sm:pt-14">
        {/* 大标题：粗黑几何无衬线 + 黄色高亮块（参照 taylor.fyi/top 的标题排法） */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl whitespace-pre-line text-left font-sans text-[clamp(2.05rem,5.4vw,4.3rem)] font-black leading-[1.02] tracking-[-0.035em] text-[#1C2329]"
        >
          {t.gallery.headlinePre}{" "}
          <span className="inline-block rounded-[6px] bg-[#FFE500] px-[0.16em] py-[0.03em]">
            {t.gallery.headlineMark}
          </span>{" "}
          {t.gallery.headlinePost}
        </motion.h2>

        {/* 盒脊架：一排竖立的 CD 盒脊，点一根就开盒 */}
        <SpineShelf onSelect={setSelected} />

        {/* 底部 CTA：参照视频里的 "Make yours at …" 那一行 */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-14 text-center text-[13px] text-[#1C2329]/60 sm:mt-20 sm:text-[15px]"
        >
          {t.gallery.ctaPre}
          <a
            href="https://hallocd.vercel.app"
            className="font-bold text-[#1C2329] underline decoration-[#FFE500] decoration-[3px] underline-offset-[5px] transition-opacity hover:opacity-70"
          >
            {t.gallery.ctaLink}
          </a>
          {t.gallery.ctaPost}
        </motion.p>
      </div>

      {/* 点击光盘 → 居中放大弹层 */}
      <AnimatePresence>
        {selected && (
          <DetailModal
            key={selected.id}
            item={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
