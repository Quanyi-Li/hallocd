"use client";

import { useEffect, useRef, useState } from "react";
import type { ArtVariant, Product } from "@/lib/products";

/* 纯 SVG 封面：外链图失败时兜底，不依赖网络 */
function GeneratedCover({ art, base }: { art: ArtVariant; base: string }) {
  return (
    <div className="absolute inset-0" style={{ background: base }}>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.35), transparent 58%)",
        }}
      />
      {art === "rings" && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <circle cx="42" cy="50" r="24" fill="none" stroke="#1C2329" strokeWidth="0.9" opacity="0.65" />
          <circle cx="42" cy="50" r="19.5" fill="none" stroke="#1C2329" strokeWidth="0.4" opacity="0.35" />
          <circle cx="58" cy="50" r="24" fill="none" stroke="#E65100" strokeWidth="0.9" opacity="0.75" />
          <circle cx="58" cy="50" r="19.5" fill="none" stroke="#E65100" strokeWidth="0.4" opacity="0.35" />
        </svg>
      )}
      {art === "ribbon" && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <path d="M12 78 L52 18 L88 18 L48 78 Z" fill="#F8F4EC" opacity="0.16" />
          <path d="M30 82 L70 22" stroke="#E65100" strokeWidth="1.4" opacity="0.9" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#F8F4EC" strokeWidth="0.35" opacity="0.22" />
        </svg>
      )}
      {art === "star" && (
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          <path
            d="M50 20 L57 43 L80 50 L57 57 L50 80 L43 57 L20 50 L43 43 Z"
            fill="none"
            stroke="#F8F4EC"
            strokeWidth="1.1"
            opacity="0.85"
          />
          <circle cx="50" cy="50" r="3.2" fill="#E65100" />
          <circle cx="50" cy="50" r="34" fill="none" stroke="#F8F4EC" strokeWidth="0.3" opacity="0.25" />
        </svg>
      )}
    </div>
  );
}

/* 真实透明盒素材：中间镂空，露出嵌入的封面 */
const CASE_SRC = "/images/cd/jewel-case.png";
/* 盒内可放封面的区域（与 jewel-case.png 镂空区域一致） */
export const CASE_RATIO = 900 / 771;
export const CASE_INNER = {
  left: "7.2%",
  top: "2.9%",
  right: "1.7%",
  bottom: "2.5%",
} as const;

/*
 * 商品自己的盘面图：圆形裁切 + 外沿阴影（投影落在盒面上）。
 *
 * 原来这里先试一张通用光盘 PNG（/images/cd/cd-disc.png），但那张素材并不在包内 ——
 * 于是每次进 /gallery 都发 6 次 404，再靠 onError 回落到下面这张 item.discImage。
 * 也就是说**渲染出来的一直就是 item.discImage**，首图分支只是个每次必失败的请求。
 * 现按 docs/gallery-README.md 5.6 节的方案 A 直接删掉首图分支：
 * 视觉零变化，404 彻底消失。
 */
export function Disc({ item }: { item: Product }) {
  const [fallbackFailed, setFallbackFailed] = useState(false);

  return (
    <div
      className="relative aspect-square w-full overflow-hidden rounded-full"
      style={{ backgroundColor: item.base }}
    >
      {!fallbackFailed && (
        <img
          src={item.discImage}
          alt=""
          loading="lazy"
          decoding="async"
          /*
           * 必须禁掉原生拖拽：图片默认可拖，
           * 一旦用户按着碟面拖，浏览器会启动「拖图片」手势，
           * pointermove 随即被 pointercancel 打断 ——
           * 3D 旋转拖到一半就断了，光盘根本转不起来。
           */
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onError={() => setFallbackFailed(true)}
          className="absolute inset-0 h-full w-full select-none object-cover"
        />
      )}
    </div>
  );
}

/*
 * 画廊卡片：
 * 透明盒素材当底框，封面嵌进盒内镂空区；光盘 PNG 压在盒面右侧，
 * 用 alpha 形状的 drop-shadow 做投影。CSS 只负责定位、尺寸、投影和过渡。
 */
export function ProductPackage({ item }: { item: Product }) {
  // 封面失败时依次退回本地已有图片、纯 SVG 封面、底色
  const coverSources = [item.coverImage, item.image].filter(
    (src): src is string => Boolean(src)
  );
  const [failedCovers, setFailedCovers] = useState<string[]>([]);
  const [caseFailed, setCaseFailed] = useState(false);
  const coverRef = useRef<HTMLImageElement>(null);
  const caseRef = useRef<HTMLImageElement>(null);
  const coverSrc = coverSources.find((src) => !failedCovers.includes(src));

  // 同一张图被 onError 和挂载检查重复标记也无害（按 src 去重）
  const markCoverFailed = (src: string) => {
    setFailedCovers((list) => (list.includes(src) ? list : [...list, src]));
  };

  useEffect(() => {
    const img = caseRef.current;
    if (img && img.complete && img.naturalWidth === 0) setCaseFailed(true);
  }, []);

  useEffect(() => {
    const img = coverRef.current;
    const src = img?.getAttribute("src");
    if (img && img.complete && img.naturalWidth === 0 && src) {
      setFailedCovers((list) => (list.includes(src) ? list : [...list, src]));
    }
  }, []);

  return (
    <div className="relative aspect-square w-full">
      {/* 盒体：整块投影沿盒子矩形轮廓走 */}
      <div
        className="absolute left-[1%] top-[12%] w-[78%] -rotate-[3deg]"
        style={{
          filter:
            "drop-shadow(0 18px 18px rgba(28,35,41,0.20)) drop-shadow(0 5px 6px rgba(28,35,41,0.18))",
        }}
      >
        <div className="relative" style={{ aspectRatio: "900 / 771" }}>
          {/* 封面嵌在透明壳里，只占镂空区域 */}
          <div
            className="absolute overflow-hidden"
            style={CASE_INNER}
          >
            {coverSrc ? (
              <img
                ref={coverRef}
                src={coverSrc}
                alt={`${item.name} 封套封面`}
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={() => markCoverFailed(coverSrc)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : item.art ? (
              <GeneratedCover art={item.art} base={item.base} />
            ) : (
              <div
                className="absolute inset-0"
                style={{ backgroundColor: item.base }}
              />
            )}
            {/* 塑料面很薄的一层白雾，让印刷面像隔着壳 */}
            <div className="pointer-events-none absolute inset-0 bg-white/[0.05]" />
          </div>

          {/* 透明壳素材：铰链、厚度、边缘折射都在图里 */}
          {!caseFailed ? (
            <img
              ref={caseRef}
              src={CASE_SRC}
              alt=""
              aria-hidden="true"
              draggable={false}
              decoding="async"
              onError={() => setCaseFailed(true)}
              className="pointer-events-none absolute inset-0 h-full w-full select-none"
            />
          ) : (
            <div className="pointer-events-none absolute inset-0 rounded-[4px] border border-white/70 bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.38)]" />
          )}

          {/* 壳面斜向高光，hover 时轻微位移（参数在 globals.css） */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="case-glare absolute -left-[14%] top-[-25%] h-[150%] w-[56%]" />
          </div>
        </div>
      </div>

      {/* 光盘：压在盒面右侧，投影贴着盘面形状落到盒子上 */}
      <div
        className="absolute right-[1%] top-[20%] z-10 w-[62%] rotate-[4deg]"
        style={{
          filter:
            "drop-shadow(5px 9px 10px rgba(28,35,41,0.30)) drop-shadow(1px 2px 3px rgba(28,35,41,0.24))",
        }}
      >
        <Disc item={item} />
      </div>
    </div>
  );
}
