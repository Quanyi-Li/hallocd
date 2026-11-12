"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { PRODUCTS, type Product } from "@/lib/products";
import { PAPER_SKINS } from "./paperSkins";
import { useLang } from "@/lib/i18n";
import { Disc, ProductPackage } from "./DiscArtwork";

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
  const [coverFailed, setCoverFailed] = useState(false);

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
        className="absolute inset-0 bg-[#F8F4EC]/90 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
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
        {/* 极简操作提示：与盒体同层，不再有弹窗壳 */}
        <p className="mb-2 text-[9px] font-medium uppercase tracking-[0.32em] text-[#1C2329]/40 sm:text-[10px]">
          {t.showcase.hint}
        </p>

        {/* 3D 开盒舞台：盒盖沿左侧铰链旋转翻开，露出光盘与便签 */}
        <div
          className="relative mx-auto mt-1 w-full max-w-[240px] sm:max-w-[280px]"
          style={{ perspective: "1200px" }}
        >
          <div
            className="relative aspect-square w-full"
            style={{ transformStyle: "preserve-3d" }}
          >
            {/* 盒底：内页纸纹 + 光盘 */}
            <div className="absolute inset-0 overflow-hidden rounded-[3px] border border-black/10 bg-[#EFE7DA] shadow-[0_18px_40px_-18px_rgba(28,35,41,0.35)]">
              <img
                src={item.backCoverImage}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover opacity-25"
              />
              <motion.div
                className="absolute left-1/2 top-1/2 w-[72%] -translate-x-1/2 -translate-y-1/2"
                animate={{ x: open ? 34 : 0, y: open ? -4 : 0, rotate: open ? 7 : 0 }}
                transition={{ type: "spring", stiffness: 140, damping: 20 }}
              >
                <Disc item={item} />
              </motion.div>
            </div>

            {/* 便签已移到盒体下方，此处仅保留盒底与盒盖 */}

            {/* 盒盖：点击开合，正反两面都有纸壳质感 */}
            <motion.button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={`${item.name} · ${
                open ? t.showcase.close : t.showcase.open
              }`}
              className="absolute inset-0 z-10 rounded-[3px] text-left"
              style={{
                transformStyle: "preserve-3d",
                transformOrigin: "left center",
              }}
              animate={{ rotateY: open ? -118 : 0 }}
              transition={{ type: "spring", stiffness: 90, damping: 16 }}
            >
              <div
                className="absolute inset-0 overflow-hidden rounded-[3px] border border-black/15 shadow-[0_20px_45px_-18px_rgba(28,35,41,0.5)]"
                style={{ backfaceVisibility: "hidden" }}
              >
                {coverFailed ? (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: item.base }}
                  />
                ) : (
                  <img
                    src={item.coverImage}
                    alt={`${item.name} 封套封面`}
                    draggable={false}
                    onError={() => setCoverFailed(true)}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                <span className="pointer-events-none absolute inset-0 bg-white/[0.04]" />
                <span className="pointer-events-none absolute inset-y-0 left-0 w-[6px] bg-gradient-to-r from-black/25 to-transparent" />
              </div>
              <div
                className="absolute inset-0 overflow-hidden rounded-[3px] border border-black/15 bg-[#F3EADC]"
                style={{
                  transform: "rotateY(180deg)",
                  backfaceVisibility: "hidden",
                }}
              >
                <img
                  src={item.backCoverImage}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="h-full w-full object-cover opacity-80"
                />
                <span className="pointer-events-none absolute inset-y-0 right-0 w-[6px] bg-gradient-to-l from-black/25 to-transparent" />
              </div>
            </motion.button>
          </div>
        </div>

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
    <section className="w-full bg-[#F8F4EC] text-[#1C2329]">
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

      <div className="mx-auto w-full max-w-6xl px-6 pb-14 pt-4 sm:px-10 sm:pt-6">
        {/* 标题区：杂志式大字 + 中文副文案 */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.35em] text-[#1C2329]/40 sm:text-[11px]">
            {t.gallery.eyebrow}
          </p>
          <h2 className="font-serif text-[clamp(1.95rem,5.2vw,4.25rem)] font-bold leading-[1.05] tracking-[-0.01em] text-[#1C2329]/85">
            Find Your{" "}
            <em className="font-medium italic text-[#E65100]/85">Vibe</em>
          </h2>
          <p className="mt-4 font-serif-zh text-[13px] leading-relaxed tracking-[0.25em] text-[#1C2329]/55 sm:text-sm">
            {t.gallery.lead}
          </p>
        </motion.div>

        {/* 6 张光盘：移动端两列折行，桌面端一行排开 */}
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:mt-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-6 lg:gap-x-5">
          {PRODUCTS.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.45,
                delay: index * 0.05,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <button
                type="button"
                onClick={() => setSelected(item)}
                className="group flex w-full flex-col items-center text-center"
              >
                <div className="w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]">
                  <ProductPackage item={item} />
                </div>
                <span className="mt-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#1C2329]/40">
                  {t.scenes[item.id] ?? item.scene}
                </span>
                <span className="mt-1.5 font-serif text-base italic leading-snug text-[#1C2329] transition-colors duration-300 group-hover:text-[#E65100] sm:text-lg">
                  {item.name}
                </span>
              </button>
            </motion.div>
          ))}
        </div>
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
