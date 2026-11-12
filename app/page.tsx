import Link from "next/link";
import InteractiveHero from "@/components/InteractiveHero";
import GallerySection from "@/components/teammate/GallerySection";
import LangText from "@/components/LangText";

/**
 * 首页 · 只负责「展示」
 * ------------------------------------------------------------------
 * 制作流程（DIY 定制 → 录音信纸 → CHECKOUT）已迁到 /make。
 * 顶部导航只保留「展示 / 制作」两项，商品库完整版在 /gallery。
 */
export default function Home() {
  return (
    <main className="relative">
      {/* Section 1: 首屏（Design Your Moment + 漂浮 CD） */}
      <InteractiveHero />

      {/* Section 2: 队友 CD 墙（紧接首屏，纯内容无自带导航） */}
      <GallerySection />

      {/* Section 3: 商品库完整版入口（/gallery 路由保留，可深链） */}
      <section className="flex justify-center px-6 pb-24 sm:px-10">
        <Link
          href="/gallery"
          className="group inline-flex items-center gap-3 rounded-full border border-[#1C2329]/15 px-7 py-3.5 text-[11.5px] font-semibold uppercase tracking-[0.18em] text-[#1C2329] transition-colors hover:border-[#1C2329]/35 hover:bg-white/60"
        >
          <LangText zh="查看全部 · Find Your Vibe" en="See All · Find Your Vibe" />
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 stroke-current transition-transform duration-300 group-hover:translate-x-1"
            strokeWidth={2}
            fill="none"
          >
            <path d="M5 12h13M12 6l6 6-6 6" />
          </svg>
        </Link>
      </section>
    </main>
  );
}
