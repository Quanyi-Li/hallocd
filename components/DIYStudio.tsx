"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { useExperience } from "./ExperienceContext";
import { useLang } from "@/lib/i18n";
import {
  DEFAULT_DIY_SCALARS,
  clearDiyDraft,
  readDiyDraft,
  writeDiyDraft,
  type DiyDraftImageMeta,
  type DiyDraftScalars,
} from "@/lib/draft/diy-draft";
import {
  clearDraftImages,
  deleteDraftImage,
  getDraftImage,
  putDraftImage,
} from "@/lib/draft/image-store";
import CustomizationPanel, {
  SPINE_FONTS,
  SPINE_THEMES,
  type LayerId,
  type ObiTemplate,
  type SpineFontId,
  type SpineTemplate,
  type SpineThemeId,
} from "./CustomizationPanel";

/* R3F 体积较大且依赖 WebGL，仅在客户端加载 */
const CD3DViewer = dynamic(() => import("./CD3DViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-44 w-44 animate-pulse rounded-full bg-black/5" />
    </div>
  ),
});

type ImgFile = { url: string; name: string };

/* ---------------------------------- */
/*  Blob URL 登记簿                     */
/*  集中登记每个图片槽位当前的 Object  */
/*  URL：替换 / 删除 / 卸载时精确释放， */
/*  避免旧图残留与内存泄漏。            */
/* ---------------------------------- */
function useBlobUrlRegistry() {
  const registry = useRef<Map<string, string>>(new Map());

  /* 卸载时**不**释放这些 Blob URL
   *
   * 【v2.9.1】为什么改了：
   *   这些 URL 早就交出去了 —— 登记簿里的每张图都同时被
   *   ExperienceContext 持有（那才是它们真正的主人，
   *   provider 挂在 layout 上，比本组件活得久）。
   *   在这里 revoke，等于「组件走了就把别人还在用的东西砸了」：
   *   交接面板在 /agents，要传的正是这些图；
   *   就算不做交接，用户从 /make 走到别的页再回来，
   *   Context 里那串 URL 也已经指不到任何东西了。
   *
   *   替换 / 删除图片时该释放的照常释放（create / release 里）；
   *   剩下的交给浏览器在文档销毁时回收。 */
  useEffect(() => {
    return () => {
      /* 故意不 revoke —— 见上面的说明 */
    };
  }, []);

  /* 返回的对象必须**引用稳定** ——
     否则把它放进 useEffect 的依赖数组里，每次渲染都是新对象，
     依赖永远「变了」，effect 就会跟着一直重跑（草稿恢复会被反复触发）。 */
  return useMemo(
    () => ({
      /* 新图上线：先释放同槽位的旧图 */
      create(key: string, file: File) {
        const old = registry.current.get(key);
        if (old) URL.revokeObjectURL(old);
        const url = URL.createObjectURL(file);
        registry.current.set(key, url);
        return url;
      },
      /* 删除图片：释放该槽位的 Blob URL */
      release(key: string) {
        const old = registry.current.get(key);
        if (old) URL.revokeObjectURL(old);
        registry.current.delete(key);
      },
    }),
    [],
  );
}

/* ------------------------------------------------------------------ */
/*  草稿状态比较                                                        */
/*  「清除草稿」之后要认出「这次变化就是清除造成的」——               */
/*  判据就是：当前值跟清除时那一版完全一样。                          */
/* ------------------------------------------------------------------ */
function sameScalars(a: DiyDraftScalars, b: DiyDraftScalars): boolean {
  const keys = Object.keys(a) as (keyof DiyDraftScalars)[];
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

function sameImages(
  a: Record<string, DiyDraftImageMeta>,
  b: Record<string, DiyDraftImageMeta>,
): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => kb[i] === k);
}

/* 2D 光盘面（disc 层 / 独立光碟模式共用，盘面图可拖拽定位） */
function Disc2D({
  discColor,
  discArt,
  elevated = false,
}: {
  discColor: string;
  discArt: ImgFile | null;
  elevated?: boolean;
}) {
  /* 拖拽边界：图片始终覆盖圆盘，不可完全拖出 */
  const discRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={discRef}
      className={`absolute left-1/2 top-1/2 aspect-square w-[86%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] ${
        elevated ? "shadow-[0_30px_60px_-20px_rgba(28,35,41,0.35)]" : ""
      }`}
      style={{ background: discColor }}
    >
      {/* 镭射光泽暗示 */}
      <div
        className="absolute inset-0 opacity-25"
        style={{
          background:
            "conic-gradient(from 210deg, transparent, rgba(255,180,220,0.6), rgba(160,210,255,0.6), transparent, rgba(255,240,180,0.5), transparent)",
        }}
      />
      {discArt && (
        <>
          {/* 图片放大 135%：留出可拖拽取景的余量 */}
          <motion.img
            src={discArt.url}
            alt=""
            drag
            dragConstraints={discRef}
            dragElastic={0.06}
            dragMomentum={false}
            className="absolute -left-[17.5%] -top-[17.5%] h-[135%] w-[135%] max-w-none cursor-grab object-cover opacity-90 active:cursor-grabbing"
            style={{ touchAction: "none" }}
            draggable={false}
          />
          {/* 拖拽提示（不挡图片） */}
          <div className="pointer-events-none absolute bottom-[6%] left-1/2 -translate-x-1/2 rounded-full bg-[#1C2329]/60 px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.2em] text-[#F8F4EC]">
            Drag to position
          </div>
        </>
      )}
      {/* 中孔 */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[13%] w-[13%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F8F4EC] shadow-inner ring-1 ring-black/15" />
    </div>
  );
}

/* 方形可拖拽封面（inner / back 层共用）：120% 放大取景，位置同步 3D 贴图偏移 */
function DraggableCover({
  url,
  pos,
  onPos,
}: {
  url: string;
  pos: { x: number; y: number }; // 归一化偏移，±0.1（对应 120% 放大的可移动范围）
  onPos: (p: { x: number; y: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const clamp = (v: number) => Math.min(0.1, Math.max(-0.1, v));
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden rounded-lg">
      <motion.img
        src={url}
        alt=""
        drag
        dragMomentum={false}
        dragElastic={0.06}
        animate={{ x: 0, y: 0 }} // 位置由 left/top 驱动，拖拽偏移归零
        onDragEnd={(_, info) => {
          const r = ref.current?.getBoundingClientRect();
          if (!r) return;
          onPos({
            x: clamp(pos.x + info.offset.x / r.width),
            y: clamp(pos.y - info.offset.y / r.height),
          });
        }}
        className="absolute max-w-none cursor-grab object-cover active:cursor-grabbing"
        style={{
          left: `${-10 + pos.x * 100}%`,
          top: `${-10 - pos.y * 100}%`,
          width: "120%",
          height: "120%",
          touchAction: "none",
        }}
        draggable={false}
      />
    </div>
  );
}

/* ---------------------------------- */
/*  2D 侧边脊背：左侧细长条              */
/*  文字 / 图片与 3D、NFC 预览共用状态    */
/* ---------------------------------- */
function Spine2D({
  text,
  image,
  bg,
  fg,
  fontFamily,
  glass,
  active,
}: {
  text: string;
  image: string | null;
  bg: string;
  fg: string;
  fontFamily: string;
  glass: boolean;
  active: boolean;
}) {
  return (
    <div
      className={`absolute inset-y-0 -left-[7%] z-30 flex w-[7%] items-center justify-center overflow-hidden rounded-l-md border-r border-black/10 transition-all ${
        active
          ? "ring-2 ring-inset ring-[#E65100] shadow-[0_0_18px_rgba(230,81,0,0.45)]"
          : ""
      }`}
      style={{
        background: glass ? "rgba(255,255,255,0.22)" : bg,
        backdropFilter: glass ? "blur(8px)" : undefined,
        WebkitBackdropFilter: glass ? "blur(8px)" : undefined,
        boxShadow: glass ? "inset 1px 0 0 rgba(255,255,255,0.55)" : undefined,
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          className="max-h-[92%] select-none overflow-hidden whitespace-nowrap text-center text-[11px] font-semibold tracking-[0.18em] [writing-mode:vertical-rl] [text-orientation:upright]"
          style={{
            color: fg,
            fontFamily,
          }}
        >
          {text.trim() || "Hallo CD"}
        </span>
      )}
    </div>
  );
}

/* ---------------------------------- */
/*  2D 平面设计视图：跟随当前编辑层级    */
/* ---------------------------------- */
function FlatPreview({
  activeLayer,
  discColor,
  discArt,
  caseCover,
  caseTint,
  showObi,
  obi,
  obiText,
  obiBg,
  obiFg,
  obiFont,
  obiGlass,
  innerLeft,
  innerLeftPos,
  onInnerLeftPosChange,
  innerRight,
  innerRightPos,
  onInnerRightPosChange,
  backCover,
  backPos,
  onBackPosChange,
  isCaseOpen,
  viewMode,
  flatViewSide,
  onFlatViewSideChange,
  spineText,
  spineImage,
  spineBg,
  spineFg,
  spineFontFamily,
  spineGlass,
}: {
  activeLayer: LayerId;
  spineText: string;
  spineImage: string | null;
  spineBg: string;
  spineFg: string;
  spineFontFamily: string;
  spineGlass: boolean;
  discColor: string;
  discArt: ImgFile | null;
  caseCover: ImgFile | null;
  caseTint: string;
  showObi: boolean;
  obi: ImgFile | null;
  obiText: string;
  obiBg: string;
  obiFg: string;
  obiFont: string;
  obiGlass: boolean;
  innerLeft: ImgFile | null; // 左内页：盒盖内侧小册子
  innerLeftPos: { x: number; y: number };
  onInnerLeftPosChange: (pos: { x: number; y: number }) => void;
  innerRight: ImgFile | null; // 右内页：光盘托盘底板
  innerRightPos: { x: number; y: number };
  onInnerRightPosChange: (pos: { x: number; y: number }) => void;
  backCover: ImgFile | null;
  backPos: { x: number; y: number };
  onBackPosChange: (pos: { x: number; y: number }) => void;
  isCaseOpen: boolean; // 开盒：翻开为双页布局
  viewMode: "full" | "disc" | "case-only"; // case-only：隐藏光盘，只看外壳
  flatViewSide: "front" | "back"; // 2D 正反面切换
  onFlatViewSideChange: (side: "front" | "back") => void;
}) {
  const { t } = useLang();
  const st = t.studio;
  /* 拖拽换算参照：容器实际像素尺寸 */
  const rootRef = useRef<HTMLDivElement>(null);

  /* 仅看外壳：若仍停在 CD 盘面 Tab，显示回退到正面外壳（保证不出现光盘） */
  const effLayer: LayerId =
    viewMode === "case-only" && activeLayer === "disc" ? "front" : activeLayer;
  /* 正面视图中不渲染 back 层（背面由「背面视图」专门展示）；侧边仍复用正面视图 */
  /* 正面视图统一承载 front / spine / obi（脊背与腰封是正面的叠加层，
     不能各自占一个 closedLayer，否则会出现空白画布） */
  const closedLayer: LayerId =
    effLayer === "back" || effLayer === "spine" || effLayer === "obi"
      ? "front"
      : effLayer;
  /* 编辑内侧任意一页时，2D 自动展开为双页 */
  const showOpen =
    isCaseOpen || activeLayer === "innerLeft" || activeLayer === "innerRight";
  /* 当前层是否落在某一内页上（用于双页高亮） */
  const leftActive = activeLayer === "innerLeft";
  const rightActive = activeLayer === "innerRight";

  /* 正反面极简分段切换（独立光碟模式无背面概念，隐藏） */
  const sideToggle = viewMode !== "disc" && (
    <div className="absolute right-3 top-3 z-20 flex rounded-full bg-[#1C2329]/80 p-0.5">
      {(["front", "back"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onFlatViewSideChange(s)}
          className={`rounded-full px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] transition-colors ${
            flatViewSide === s
              ? "bg-[#F8F4EC] text-[#1C2329]"
              : "text-[#F8F4EC]/50 hover:text-[#F8F4EC]/85"
          }`}
        >
          {s === "front" ? st.viewFront : st.viewBack}
        </button>
      ))}
    </div>
  );

  /* 独立光碟模式：只展示光盘本体，无方形外壳 */
  if (viewMode === "disc") {
    return (
      <div className="relative aspect-square w-full max-w-[520px]">
        <Disc2D discColor={discColor} discArt={discArt} elevated />
        {/* 模式角标 */}
        <div className="absolute left-3 top-3 rounded-full bg-[#1C2329]/80 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#F8F4EC]">
          Disc Only
        </div>
      </div>
    );
  }

  /* 背面视图：正方形盒背，展示 backCover（可拖拽取景），左侧脊背灰线 */
  if (flatViewSide === "back") {
    return (
      <motion.div
        key="back-side"
        initial={{ opacity: 0, rotateY: -70 }}
        animate={{ opacity: 1, rotateY: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative aspect-square w-full max-w-[520px]"
        style={{ transformPerspective: 1200 }}
      >
        {sideToggle}
        <div className="absolute inset-0 overflow-hidden rounded-lg border border-black/10 bg-white/70 shadow-[0_24px_60px_-20px_rgba(28,35,41,0.25)]">
          {/* 底色（未上传时的透明材质感） */}
          <div className="absolute inset-0 bg-[#EFEBE2]" />
          {backCover ? (
            <DraggableCover
              url={backCover.url}
              pos={backPos}
              onPos={onBackPosChange}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[#1C2329]/30">
              <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">
                Back Cover
              </span>
              <span className="text-[9px] tracking-[0.1em]">
                {st.emptyBack}
              </span>
            </div>
          )}
          {/* 脊背（Spine）：左侧灰线模拟盒侧厚度 */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[5%] border-r border-black/10 bg-black/[0.05]" />
          {/* 亚克力高光边框 */}
          <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-white/60 shadow-[inset_0_0_0_1px_rgba(28,35,41,0.08)]" />
        </div>
        {/* 模式角标 */}
        <div className="absolute left-3 top-3 rounded-full bg-[#1C2329]/80 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#F8F4EC]">
          Back Side
        </div>
      </motion.div>
    );
  }

  /* 开盒状态：真实 CD 盒双页布局（左小册子 + 右托盘光盘），CSS 3D 翻盖 */
  if (showOpen) {
    return (
      <div
        className="relative w-full max-w-[880px]"
        style={{ perspective: 1400 }}
      >
        {sideToggle}
        <motion.div
          key="open"
          initial={{ opacity: 0, rotateY: -12, scale: 0.96 }}
          animate={{ opacity: 1, rotateY: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative grid grid-cols-2 gap-1"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* 左页：盒盖内侧小册子（真实 CD 盒布局：书脊在左） */}
          <div
            className={`relative aspect-square overflow-hidden rounded-l-lg rounded-r-sm border border-black/10 bg-[#FAF6EE] shadow-[0_24px_60px_-20px_rgba(28,35,41,0.3)] transition-shadow ${
              leftActive
                ? "ring-2 ring-inset ring-[#E65100] shadow-[0_0_24px_rgba(230,81,0,0.35)]"
                : ""
            }`}
          >
            {innerLeft ? (
              <DraggableCover
                url={innerLeft.url}
                pos={innerLeftPos}
                onPos={onInnerLeftPosChange}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-[#1C2329]/30">
                <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">
                  Left Inner
                </span>
                <span className="text-[9px] tracking-[0.1em]">
                  {st.emptyLeft}
                </span>
              </div>
            )}
            {/* 中缝阴影 */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[7%] bg-gradient-to-l from-black/15 to-transparent" />
          </div>
          {/* 右页：托盘 + 光盘（右内页图垫在光盘之下） */}
          <div
            className={`relative aspect-square overflow-hidden rounded-l-sm rounded-r-lg bg-[#17171B] shadow-[0_24px_60px_-20px_rgba(28,35,41,0.3)] transition-shadow ${
              rightActive
                ? "ring-2 ring-inset ring-[#E65100] shadow-[0_0_24px_rgba(230,81,0,0.35)]"
                : ""
            }`}
          >
            {innerRight ? (
              <DraggableCover
                url={innerRight.url}
                pos={innerRightPos}
                onPos={onInnerRightPosChange}
              />
            ) : (
              <>
                {/* 默认托盘质感：光盘凹槽 + 中心转轴 */}
                <div className="absolute left-1/2 top-1/2 aspect-square w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
                <div className="absolute left-1/2 top-1/2 h-[13%] w-[13%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2A2A30] ring-1 ring-white/15" />
              </>
            )}
            {/* 仅看外壳：开盒右页不渲染光盘，只保留托盘底板 */}
            {viewMode !== "case-only" && (
              <Disc2D discColor={discColor} discArt={discArt} elevated />
            )}
            {/* 中缝阴影 */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/25 to-transparent" />
          </div>
          {/* 模式角标 */}
          <div className="absolute left-3 top-3 rounded-full bg-[#1C2329]/80 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#F8F4EC]">
            {rightActive ? "Open Case · Right Inner" : "Open Case · Left Inner"}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      key="closed"
      ref={rootRef}
      initial={{ opacity: 0, rotateY: 10, scale: 0.97 }}
      animate={{ opacity: 1, rotateY: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative aspect-square w-full max-w-[520px]"
      style={{ transformPerspective: 1200 }}
    >
      {sideToggle}
      <div className="absolute inset-0 overflow-hidden rounded-lg border border-black/10 bg-white/70 shadow-[0_24px_60px_-20px_rgba(28,35,41,0.25)]">
        {/* ===== z-0 外壳底：有图显示封面，无图显示底色（绝不 return null） ===== */}
        {caseCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={caseCover.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-[#EFEBE2]" />
        )}

        {/* ===== z-10 透明亚克力覆盖层（不拦截交互） ===== */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <div
            className="absolute inset-0"
            style={{ background: `${caseTint}1A` }}
          />
          <div className="absolute inset-0 rounded-lg border-2 border-white/60 shadow-[inset_0_0_0_1px_rgba(28,35,41,0.08)]" />
          <div className="absolute -left-[20%] top-[-15%] h-[130%] w-[32%] rotate-12 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        </div>

        {/* ===== z-10 光盘：居中的正圆（CD 盘面层） ===== */}
        {closedLayer === "disc" && (
          <Disc2D discColor={discColor} discArt={discArt} />
        )}

        {/* ===== z-20 腰封纸带：正方形内部左侧，宽 24%，满高 ===== */}
        {showObi && (
          <div
            className={`absolute inset-y-0 left-0 z-20 flex w-[24%] items-center justify-center overflow-hidden border-r border-black/10 transition-shadow ${
              activeLayer === "obi"
                ? "ring-2 ring-inset ring-[#E65100] shadow-[0_0_20px_rgba(230,81,0,0.45)]"
                : ""
            }`}
            style={
              obiGlass
                ? {
                    background: "rgba(255,255,255,0.28)",
                    backdropFilter: "blur(6px)",
                    WebkitBackdropFilter: "blur(6px)",
                  }
                : { background: obiBg }
            }
          >
            {obi ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={obi.url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span
                className="max-h-[92%] select-none overflow-hidden whitespace-nowrap text-center text-[11px] font-semibold leading-tight [writing-mode:vertical-rl] [text-orientation:upright]"
                style={{
                  color: obiFg,
                  fontFamily: obiFont,
                }}
              >
                {obiText.trim() || "Hallo CD"}
              </span>
            )}
          </div>
        )}

        {/* ===== back 层：已迁移到「背面视图」，此处不再渲染 ===== */}
      </div>

      {/* ===== z-30 侧边脊背：正方形左侧外部，紧贴边缘的窄竖条 ===== */}
      <Spine2D
        text={spineText}
        image={spineImage}
        bg={spineBg}
        fg={spineFg}
        fontFamily={spineFontFamily}
        glass={spineGlass}
        active={activeLayer === "spine"}
      />

      {/* 当前层级角标 */}
      <div className="absolute left-3 top-3 rounded-full bg-[#1C2329]/80 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#F8F4EC]">
        {closedLayer === "disc"
          ? "Layer · Disc"
          : activeLayer === "obi"
            ? "Layer · Obi"
            : activeLayer === "spine"
              ? "Layer · Spine"
              : "Layer · Front"}
      </div>
    </motion.div>
  );
}

/* ---------------------------------- */
/*  DIY 工作台：3D 预览 + 控制面板联动   */
/* ---------------------------------- */
export default function DIYStudio() {
  const { t } = useLang();
  const st = t.studio;
  /* ---- 分层编辑状态 ---- */
  const [activeLayer, setActiveLayer] = useState<LayerId>("disc");

  /* ---- 联动状态（面板 ↔ 3D 场景） ---- */
  const [discColor, setDiscColor] = useState<string>("#E0E0E0");
  const [discArt, setDiscArt] = useState<ImgFile | null>(null);
  /* 数据闭环：updateDesign 由下方同步 effect 使用（局部更新，不覆盖信纸数据） */
  const { updateDesign, discColor: ctxDiscColor, spineText: ctxSpineText, spineFont: ctxSpineFont, spineTheme: ctxSpineTheme, spineTextColor: ctxSpineTextColor, showObi: ctxShowObi, obiText: ctxObiText, obiFont: ctxObiFont, obiTheme: ctxObiTheme, obiTextColor: ctxObiTextColor } = useExperience();
  /* Blob URL 登记簿：统一管理所有上传图片的生命周期
     （提前到这里 —— 恢复草稿时要用它把 IndexedDB 里的图重新变成 blob: URL） */
  const blobs = useBlobUrlRegistry();
  const [caseTint, setCaseTint] = useState<string>("#ffffff");
  const [caseCover, setCaseCover] = useState<ImgFile | null>(null);
  const [showObi, setShowObi] = useState(false);
  const [obi, setObi] = useState<ImgFile | null>(null);
  /* 腰封纸带：与脊背完全隔离的一套状态 */
  const [obiText, setObiText] = useState("Hallo CD");
  const [obiTheme, setObiTheme] = useState<SpineThemeId>("light");
  const [obiTextColor, setObiTextColor] = useState("#1C2329");
  const [obiFont, setObiFont] = useState<SpineFontId>("serif");
  /* 内侧内页（左右独立）& 背面封面：图片 + 归一化取景偏移（±0.1，与 3D 贴图同步） */
  const [innerLeft, setInnerLeft] = useState<ImgFile | null>(null);
  const [innerRight, setInnerRight] = useState<ImgFile | null>(null);
  const [backCover, setBackCover] = useState<ImgFile | null>(null);
  const [innerLeftPos, setInnerLeftPos] = useState({ x: 0, y: 0 });
  const [innerRightPos, setInnerRightPos] = useState({ x: 0, y: 0 });
  const [backPos, setBackPos] = useState({ x: 0, y: 0 });
  /* 开盒状态：盒盖绕左缘铰链打开（2D/3D 同步） */
  const [isCaseOpen, setIsCaseOpen] = useState(false);
  /* 侧边脊背：文字 / 字体 / 配色 / 图片（图片优先于文字） */
  const [spineText, setSpineText] = useState("Hallo CD");
  const [spineFont, setSpineFont] = useState<SpineFontId>("serif");
  const [spineTheme, setSpineTheme] = useState<SpineThemeId>("glass");
  const [spineTextColor, setSpineTextColor] = useState("#1C2329");
  const [spineImage, setSpineImage] = useState<ImgFile | null>(null);
  const spinePreset =
    SPINE_FONTS.find((f) => f.id === spineFont) ?? SPINE_FONTS[0];
  const spinePalette =
    SPINE_THEMES.find((t) => t.id === spineTheme) ?? SPINE_THEMES[0];
  const spineGlass = spineTheme === "glass";
  const spineBg = spinePalette.bg;
  const spineFg = spineTextColor;
  /* 一键应用排版模板：文字 / 字体 / 材质 / 字色 */
  const applySpineTemplate = (tpl: SpineTemplate) => {
    setSpineText(tpl.text);
    setSpineFont(tpl.font);
    setSpineTheme(tpl.theme);
    setSpineTextColor(tpl.color);
  };

  /* 腰封模板：只改腰封自己的数据，不影响脊背 */
  const applyObiTemplate = (tpl: ObiTemplate) => {
    setObiText(tpl.text);
    setObiFont(tpl.font);
    setObiTheme(tpl.theme);
    setObiTextColor(tpl.color);
    setShowObi(true);
  };

  /* 腰封底色（透明主题 = transparent，与脊背同源材质定义） */
  const obiPalette =
    SPINE_THEMES.find((t) => t.id === obiTheme) ?? SPINE_THEMES[0];
  const obiBg = obiPalette.bg;
  const obiGlass = obiTheme === "glass";
  /* Restore scalar settings from the global design snapshot.
     Reason: /make can be left and re-entered via the top nav. The provider lives in
     app/layout.tsx so it is never unmounted, therefore text / colour / font survive.
     Uploaded images are Blob URLs released on unmount, so they are NOT restored. */
  useEffect(() => {
    setDiscColor(ctxDiscColor);
    setSpineText(ctxSpineText);
    setSpineFont(ctxSpineFont as SpineFontId);
    setSpineTheme(ctxSpineTheme as SpineThemeId);
    setSpineTextColor(ctxSpineTextColor);
    setShowObi(ctxShowObi);
    setObiText(ctxObiText);
    setObiFont(ctxObiFont as SpineFontId);
    setObiTheme(ctxObiTheme as SpineThemeId);
    setObiTextColor(ctxObiTextColor);
  }, []);

  /* Leaving the page: drop the Blob URL slots from the global snapshot
     (useBlobUrlRegistry already released them) so no dead URL leaks to My Room. */
  useEffect(() => {
    return () => {
      updateDesign({
        discArtUrl: null,
        caseCoverUrl: null,
        innerLeftUrl: null,
        innerRightUrl: null,
        spineImageUrl: null,
        backCoverUrl: null,
        obiImageUrl: null,
      });
    };
  }, []);
  const obiPreset = SPINE_FONTS.find((f) => f.id === obiFont) ?? SPINE_FONTS[0];

  /* ------------------------------------------------------------------ */
  /*  草稿（v2.8 / G5）                                                  */
  /*  标量存 localStorage、图片存 IndexedDB —— 见 lib/draft/。             */
  /* ------------------------------------------------------------------ */
  /* 草稿恢复完成之前不许写草稿 ——
     否则挂载瞬间那次「默认值」写入会把用户上次存的草稿直接覆盖掉。 */
  const [draftReady, setDraftReady] = useState(false);
  /* 上次保存草稿的时间（给 UI 显示「已自动保存」） */
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  /* 当前草稿里有哪些图片槽位（存的是元信息，图片本体在 IndexedDB） */
  const [draftImages, setDraftImages] = useState<
    Record<string, DiyDraftImageMeta>
  >({});
  /* 草稿去抖 timer */
  const draftTimer = useRef<number | null>(null);

  /* ------------------------------------------------------------------ */
  /*  草稿恢复（v2.8 / G5）                                              */
  /*  刷新页面 / 关掉标签页再回来时，把上次的定制完整捞回来。             */
  /* ------------------------------------------------------------------ */
  /* 草稿里有没有「待写入」的改动 —— 卸载时用它决定要不要补一次落盘 */
  const draftDirty = useRef(false);
  /* 「清除草稿」时的那一版状态 —— 用来识别「清除造成的变化」，避免它被写回去 */
  const draftDiscarded = useRef<{
    scalars: DiyDraftScalars;
    images: Record<string, DiyDraftImageMeta>;
  } | null>(null);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      const draft = readDiyDraft();

      /* 没有草稿 → 用出厂默认值，并且**不要**写回去（别把空草稿存下来） */
      if (!draft) {
        if (alive) {
          setDraftImages({});
          setDraftSavedAt(null);
          setDraftReady(true);
        }
        return;
      }

      /* 标量 */
      if (alive) {
        const s = draft.scalars;
        setDiscColor(s.discColor || DEFAULT_DIY_SCALARS.discColor);
        setCaseTint(s.caseTint || DEFAULT_DIY_SCALARS.caseTint);
        setSpineText(s.spineText);
        setSpineFont(s.spineFont as SpineFontId);
        setSpineTheme(s.spineTheme as SpineThemeId);
        setSpineTextColor(s.spineTextColor);
        setShowObi(s.showObi);
        setObiText(s.obiText);
        setObiFont(s.obiFont as SpineFontId);
        setObiTheme(s.obiTheme as SpineThemeId);
        setObiTextColor(s.obiTextColor);
      }

      /* 图片：从 IndexedDB 取回文件，重新变成 blob: URL 挂回 state */
      const restored: Record<string, DiyDraftImageMeta> = {};
      for (const slot of Object.keys(draft.images)) {
        const file = await getDraftImage(slot);
        if (!file || !alive) continue;
        restored[slot] = {
          name: file.name || draft.images[slot]?.name || slot,
          type: file.type || draft.images[slot]?.type || "",
          size: file.size || draft.images[slot]?.size || 0,
        };
        const url = blobs.create(slot, file);
        if (!alive) return;
        switch (slot) {
          case "discArt":
            setDiscArt({ url, name: file.name });
            break;
          case "caseCover":
            setCaseCover({ url, name: file.name });
            break;
          case "innerLeft":
            setInnerLeft({ url, name: file.name });
            setInnerLeftPos({ x: 0, y: 0 });
            break;
          case "innerRight":
            setInnerRight({ url, name: file.name });
            setInnerRightPos({ x: 0, y: 0 });
            break;
          case "backCover":
            setBackCover({ url, name: file.name });
            setBackPos({ x: 0, y: 0 });
            break;
          case "spineImage":
            setSpineImage({ url, name: file.name });
            break;
          case "obi":
            setObi({ url, name: file.name });
            break;
          default:
            break;
        }
      }

      if (!alive) return;
      setDraftImages(restored);
      setDraftSavedAt(draft.savedAt);
      setDraftReady(true);
    };

    void run();

    return () => {
      alive = false;
    };
  }, [blobs]);

  /* ------------------------------------------------------------------ */
  /*  草稿保存（v2.8 / G5）                                              */
  /*  每次改动都写一次 localStorage —— 写一个几 KB 的 JSON 没什么成本。  */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!draftReady) return;

    const scalars = {
      discColor,
      caseTint,
      spineText,
      spineFont,
      spineTheme,
      spineTextColor,
      showObi,
      obiText,
      obiFont,
      obiTheme,
      obiTextColor,
    };

    /* 「清除草稿」之后的那一次状态变化**不许再写回草稿** ——
       否则用户刚点掉草稿，400ms 后它又自己长回来了。
       判据：当前值还跟清除时的那一版完全一样（用户还没动过）。
       只要用户又改了任何一处，这个快照就对不上了，草稿重新开始保存。 */
    const snapshot = draftDiscarded.current;
    if (
      snapshot &&
      sameScalars(snapshot.scalars, scalars) &&
      sameImages(snapshot.images, draftImages)
    ) {
      return;
    }

    /* 去抖 400ms —— 拖动调色时不会每帧都写 */
    draftDirty.current = true;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      const draft = writeDiyDraft(scalars, draftImages);
      if (draft) setDraftSavedAt(draft.savedAt);
      draftDirty.current = false;
    }, 400);

    return () => {
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    };
  }, [
    draftReady,
    draftImages,
    discColor,
    caseTint,
    spineText,
    spineFont,
    spineTheme,
    spineTextColor,
    showObi,
    obiText,
    obiFont,
    obiTheme,
    obiTextColor,
  ]);

  /* 卸载前把最后一次改动落盘（去抖 timer 可能还没跑到）——
     用 ref 存「最新值」，这样卸载回调里拿到的永远是最后那版，
     而这个 effect 本身只依赖 []，不会每次改动都重跑。 */
  const draftLatest = useRef({
    scalars: { ...DEFAULT_DIY_SCALARS },
    images: {} as Record<string, DiyDraftImageMeta>,
  });
  draftLatest.current = {
    scalars: {
      discColor,
      caseTint,
      spineText,
      spineFont,
      spineTheme,
      spineTextColor,
      showObi,
      obiText,
      obiFont,
      obiTheme,
      obiTextColor,
    },
    images: draftImages,
  };

  useEffect(() => {
    return () => {
      if (!draftDirty.current) return;
      writeDiyDraft(draftLatest.current.scalars, draftLatest.current.images);
    };
  }, []);

  /** 手动清空草稿 —— 「我不要上次那张了」 */
  const discardDraft = useCallback(() => {
    const reset = { ...DEFAULT_DIY_SCALARS };

    clearDiyDraft();
    void clearDraftImages();
    /* 清掉草稿之前那次「待写入」的标记 —— 不然卸载时又会把草稿写回来 */
    draftDirty.current = false;
    /* 记下「清除之后的状态」—— 保存 effect 会认出它，不把它写回草稿 */
    draftDiscarded.current = { scalars: reset, images: {} };

    setDraftImages({});
    setDraftSavedAt(null);
    /* 图片本体也从工作台上拿掉 */
    blobs.release("discArt");
    blobs.release("caseCover");
    blobs.release("innerLeft");
    blobs.release("innerRight");
    blobs.release("backCover");
    blobs.release("spineImage");
    blobs.release("obi");
    setDiscArt(null);
    setCaseCover(null);
    setInnerLeft(null);
    setInnerRight(null);
    setBackCover(null);
    setSpineImage(null);
    setObi(null);
    /* 标量也回到出厂值 —— 留着旧文字却把草稿删了，是自相矛盾的 */
    setDiscColor(reset.discColor);
    setCaseTint(reset.caseTint);
    setSpineText(reset.spineText);
    setSpineFont(reset.spineFont as SpineFontId);
    setSpineTheme(reset.spineTheme as SpineThemeId);
    setSpineTextColor(reset.spineTextColor);
    setShowObi(reset.showObi);
    setObiText(reset.obiText);
    setObiFont(reset.obiFont as SpineFontId);
    setObiTheme(reset.obiTheme as SpineThemeId);
    setObiTextColor(reset.obiTextColor);
  }, [blobs]);

  /* 数据闭环：把定制实时同步到全局（录音 / NFC 预览展示同一张 CD） */
  useEffect(() => {
    updateDesign({
      discColor,
      discArtUrl: discArt?.url ?? null,
      caseCoverUrl: caseCover?.url ?? null,
      innerLeftUrl: innerLeft?.url ?? null,
      innerRightUrl: innerRight?.url ?? null,
      spineText,
      spineFont,
      spineTheme,
      spineTextColor,
      spineImageUrl: spineImage?.url ?? null,
      backCoverUrl: backCover?.url ?? null,
      showObi,
      obiText,
      obiFont,
      obiTheme,
      obiTextColor,
      obiImageUrl: obi?.url ?? null,
    });
  }, [
    discColor,
    discArt,
    caseCover,
    innerLeft,
    innerRight,
    spineText,
    spineFont,
    spineTheme,
    spineTextColor,
    spineImage,
    backCover,
    showObi,
    obiText,
    obiFont,
    obiTheme,
    obiTextColor,
    obi,
    updateDesign,
  ]);

  /* ---- AI 提示框（UI 展示） ---- */
  const [prompt, setPrompt] = useState("");
  const [aiNote, setAiNote] = useState(false);

  /* ---- 2D / 3D 视角 & 正/背面 & 完整/独立 ---- */
  const [view, setView] = useState<"2d" | "3d">("3d");
  const [face, setFace] = useState<"front" | "back">("front");
  const [autoRotate, setAutoRotate] = useState(false);
  const [viewMode, setViewMode] = useState<"full" | "disc" | "case-only">(
    "full"
  );
  /* 2D 视图正反面（与面板 Tab 联动） */
  const [flatViewSide, setFlatViewSide] = useState<"front" | "back">("front");

  /* ------------------------------------------------------------------ */
  /*  草稿图片：选图时存进 IndexedDB，删图时从草稿里摘掉               */
  /* ------------------------------------------------------------------ */
  const persistDraftImage = useCallback((slot: string, file: File) => {
    void putDraftImage(slot, file);
    setDraftImages((prev) => ({
      ...prev,
      [slot]: { name: file.name, type: file.type, size: file.size },
    }));
  }, []);

  const forgetDraftImage = useCallback((slot: string) => {
    void deleteDraftImage(slot);
    setDraftImages((prev) => {
      if (!(slot in prev)) return prev;
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }, []);

  const handleDiscArtUpload = (file: File) => {
    setDiscArt({ url: blobs.create("discArt", file), name: file.name });
    persistDraftImage("discArt", file);
  };
  const handleCaseCoverUpload = (file: File) => {
    setCaseCover({ url: blobs.create("caseCover", file), name: file.name });
    persistDraftImage("caseCover", file);
  };
  const handleObiUpload = (file: File) => {
    setObi({ url: blobs.create("obi", file), name: file.name });
    persistDraftImage("obi", file);
  };
  const handleInnerLeftUpload = (file: File) => {
    setInnerLeft({ url: blobs.create("innerLeft", file), name: file.name });
    setInnerLeftPos({ x: 0, y: 0 });
    persistDraftImage("innerLeft", file);
  };
  const handleInnerRightUpload = (file: File) => {
    setInnerRight({ url: blobs.create("innerRight", file), name: file.name });
    setInnerRightPos({ x: 0, y: 0 });
    persistDraftImage("innerRight", file);
  };
  const handleBackCoverUpload = (file: File) => {
    setBackCover({ url: blobs.create("backCover", file), name: file.name });
    setBackPos({ x: 0, y: 0 });
    persistDraftImage("backCover", file);
  };
  /* 侧边图片：上传 / 手写共用同一槽位（手写板后续也写入这里） */
  const handleSpineImageUpload = (file: File) => {
    setSpineImage({ url: blobs.create("spineImage", file), name: file.name });
    persistDraftImage("spineImage", file);
  };
  /* 恢复默认：清除图片并释放 Blob URL */
  const clearDiscArt = () => {
    blobs.release("discArt");
    setDiscArt(null);
    forgetDraftImage("discArt");
  };
  const clearCaseCover = () => {
    blobs.release("caseCover");
    setCaseCover(null);
    forgetDraftImage("caseCover");
  };
  /* 移除腰封图 */
  const clearObi = () => {
    blobs.release("obi");
    setObi(null);
    forgetDraftImage("obi");
  };
  const clearInnerLeft = () => {
    blobs.release("innerLeft");
    setInnerLeft(null);
    setInnerLeftPos({ x: 0, y: 0 });
    forgetDraftImage("innerLeft");
  };
  const clearInnerRight = () => {
    blobs.release("innerRight");
    setInnerRight(null);
    setInnerRightPos({ x: 0, y: 0 });
    forgetDraftImage("innerRight");
  };
  const clearBackCover = () => {
    blobs.release("backCover");
    setBackCover(null);
    setBackPos({ x: 0, y: 0 });
    forgetDraftImage("backCover");
  };
  const clearSpineImage = () => {
    blobs.release("spineImage");
    setSpineImage(null);
    forgetDraftImage("spineImage");
  };
  /* 层级联动：3D 视角 / 2D 展开 / 正反面自动跟随 */
  const handleLayerChange = (layer: LayerId) => {
    setActiveLayer(layer);
    const isInner = layer === "innerLeft" || layer === "innerRight";
    setFace(layer === "back" ? "back" : "front");

    /* 2D 正反面联动：背面 → 背面视图；其余回到正面 */
    if (layer === "back") setFlatViewSide("back");
    else if (layer !== "spine") setFlatViewSide("front");

    /* 编辑内侧任意一页：自动开盒（2D 展开为双页） */
    if (isInner) setIsCaseOpen(true);

    /* 腰封只看得到正面：确保纸带显示，否则调色也没反馈 */
    if (layer === "obi") setShowObi(true);

    /* 独立光碟模式看不到外壳部件，切到相应 Tab 时回到完整包装 */
    if (viewMode === "disc" && layer !== "disc") setViewMode("full");
  };

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setPrompt("");
    setAiNote(true);
    window.setTimeout(() => setAiNote(false), 2600);
  };

  return (
    <section
      id="next-section"
      className="relative min-h-screen bg-[#F8F4EC] px-6 py-24 text-[#1C2329] sm:px-12"
    >
      {/* 区块标题 */}
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-[#E65100]">
          {st.eyebrow}
        </p>
        <h2 className="mt-4 font-serif text-4xl italic tracking-tight sm:text-5xl">
          {st.title}
        </h2>
        <p className="mt-4 text-sm leading-relaxed text-[#1C2329]/55">
          {st.lead}
        </p>

        {/* 草稿状态（v2.8 / G5）—— 让用户知道「刷新了也不会丢」 */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-black/5 px-3.5 py-1.5 font-mono text-[10.5px] text-[#1C2329]/50">
            <span className="h-1.5 w-1.5 rounded-full bg-[#E65100]" />
            {draftSavedAt
              ? `${st.draftSaved} · ${new Date(draftSavedAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : st.draftAutoSave}
          </span>
          {draftSavedAt ? (
            <button
              type="button"
              onClick={discardDraft}
              className="rounded-full border border-[#1C2329]/15 px-3.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#1C2329]/50 transition hover:border-[#1C2329]/35 hover:text-[#1C2329]"
            >
              {st.draftDiscard}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        {/* ============ 左侧：3D 预览区 ============ */}
        <div className="flex flex-col items-center gap-5">
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* 2D / 3D 视角切换 */}
            <div className="flex rounded-full bg-black/5 p-1">
              {(["2d", "3d"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`relative rounded-full px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors ${
                    view === v
                      ? "text-[#1C2329]"
                      : "text-[#1C2329]/40 hover:text-[#1C2329]/70"
                  }`}
                >
                  {view === v && (
                    <motion.span
                      layoutId="view-pill"
                      className="absolute inset-0 rounded-full bg-white shadow-sm"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">
                    {v === "2d" ? st.view2d : st.view3d}
                  </span>
                </button>
              ))}
            </div>

            {/* 正面 / 背面翻转（仅 3D 生效） */}
            <div
              className={`flex rounded-full bg-black/5 p-1 transition-opacity ${
                view === "3d" ? "" : "pointer-events-none opacity-35"
              }`}
            >
              {(["front", "back"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFace(f)}
                  className={`relative rounded-full px-5 py-2 text-[11px] font-semibold tracking-[0.1em] transition-colors ${
                    face === f
                      ? "text-[#1C2329]"
                      : "text-[#1C2329]/40 hover:text-[#1C2329]/70"
                  }`}
                >
                  {face === f && (
                    <motion.span
                      layoutId="face-pill"
                      className="absolute inset-0 rounded-full bg-white shadow-sm"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">
                    {f === "front" ? st.front : st.back}
                  </span>
                </button>
              ))}
            </div>

            {/* 完整包装 / 独立光碟 / 仅看外壳 三选一分段控件 */}
            <div className="flex rounded-full bg-black/5 p-1">
              {(["full", "disc", "case-only"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setViewMode(m);
                    /* Tab 联动：仅看外壳时光盘不可见，自动切离 CD 盘面 Tab */
                    if (m === "case-only" && activeLayer === "disc") {
                      setActiveLayer("front");
                    }
                  }}
                  className={`relative rounded-full px-5 py-2 text-[11px] font-semibold tracking-[0.1em] transition-colors ${
                    viewMode === m
                      ? "text-[#1C2329]"
                      : "text-[#1C2329]/40 hover:text-[#1C2329]/70"
                  }`}
                >
                  {viewMode === m && (
                    <motion.span
                      layoutId="mode-pill"
                      className="absolute inset-0 rounded-full bg-white shadow-sm"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">
                    {m === "full"
                      ? st.modeFull
                      : m === "disc"
                        ? st.modeDisc
                        : st.modeCase}
                  </span>
                </button>
              ))}
            </div>

            {/* 开合盒开关（2D/3D 同步） */}
            <button
              type="button"
              onClick={() => setIsCaseOpen((v) => !v)}
              className={`rounded-full px-5 py-2 text-[11px] font-semibold tracking-[0.1em] transition ${
                isCaseOpen
                  ? "bg-[#E65100] text-white shadow-[0_4px_14px_rgba(230,81,0,0.3)]"
                  : "bg-black/5 text-[#1C2329]/60 hover:bg-black/10 hover:text-[#1C2329]"
              }`}
            >
              {isCaseOpen ? st.closeCase : st.openCase}
            </button>

            {/* Auto-Rotate 开关（仅 3D 生效） */}
            <div
              className={`flex items-center gap-2 rounded-full bg-black/5 py-1.5 pl-4 pr-2 transition-opacity ${
                view === "3d" ? "" : "pointer-events-none opacity-35"
              }`}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1C2329]/50">
                Auto-Rotate
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={autoRotate}
                aria-label="Auto-Rotate"
                onClick={() => setAutoRotate((v) => !v)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-300 ${
                  autoRotate ? "bg-[#E65100]" : "bg-black/15"
                }`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 ${
                    autoRotate ? "translate-x-4" : ""
                  }`}
                />
              </button>
            </div>
          </div>

          {view === "3d" ? (
            /* 3D 预览框比 2D 略大：靠容器尺寸对齐占比，而非相机怼脸 */
            <div className="relative aspect-square w-full max-w-[560px]">
              <CD3DViewer
                discColor={discColor}
                discArt={discArt?.url ?? null}
                caseCover={caseCover?.url ?? null}
                caseTint={caseTint}
                showObi={showObi}
                obiImage={obi?.url ?? null}
                obiText={obiText}
                obiBg={obiBg}
                obiFg={obiTextColor}
                obiFontFamily={obiPreset.canvas}
                activeLayer={activeLayer}
                face={face}
                autoRotate={autoRotate}
                viewMode={viewMode}
                innerLeftUrl={innerLeft?.url ?? null}
                innerLeftPos={innerLeftPos}
                innerRightUrl={innerRight?.url ?? null}
                innerRightPos={innerRightPos}
                backCoverUrl={backCover?.url ?? null}
                backPos={backPos}
                isCaseOpen={isCaseOpen}
                spineText={spineText}
                spineImage={spineImage?.url ?? null}
                spineBg={spineBg}
                spineFg={spineFg}
                spineFontFamily={spinePreset.canvas}
                spineGlass={spineGlass}
              />
            </div>
          ) : (
            <FlatPreview
              activeLayer={activeLayer}
              discColor={discColor}
              discArt={discArt}
              caseCover={caseCover}
              caseTint={caseTint}
              showObi={showObi}
              obi={obi}
              obiText={obiText}
              obiBg={obiBg}
              obiFg={obiTextColor}
              obiFont={obiPreset.css}
              obiGlass={obiGlass}
              innerLeft={innerLeft}
              innerLeftPos={innerLeftPos}
              onInnerLeftPosChange={setInnerLeftPos}
              innerRight={innerRight}
              innerRightPos={innerRightPos}
              onInnerRightPosChange={setInnerRightPos}
              backCover={backCover}
              backPos={backPos}
              onBackPosChange={setBackPos}
              isCaseOpen={isCaseOpen}
              viewMode={viewMode}
              flatViewSide={flatViewSide}
              onFlatViewSideChange={setFlatViewSide}
              spineText={spineText}
              spineImage={spineImage?.url ?? null}
              spineBg={spineBg}
              spineFg={spineFg}
              spineFontFamily={spinePreset.css}
              spineGlass={spineGlass}
            />
          )}
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#1C2329]/35">
            {view === "3d"
              ? "Drag to rotate · Scroll to zoom"
              : "Flat mode · Follows the active layer"}
          </p>
        </div>

        {/* ============ 右侧：控制面板 ============ */}
        <div className="space-y-6">
          <CustomizationPanel
            activeLayer={activeLayer}
            onLayerChange={handleLayerChange}
            discColor={discColor}
            onColorChange={setDiscColor}
            discArtName={discArt?.name ?? null}
            onDiscArtUpload={handleDiscArtUpload}
            onDiscArtClear={clearDiscArt}
            caseTint={caseTint}
            onCaseTintChange={setCaseTint}
            caseCoverName={caseCover?.name ?? null}
            onCaseCoverUpload={handleCaseCoverUpload}
            onCaseCoverClear={clearCaseCover}
            innerLeftName={innerLeft?.name ?? null}
            onInnerLeftUpload={handleInnerLeftUpload}
            onInnerLeftClear={clearInnerLeft}
            innerRightName={innerRight?.name ?? null}
            onInnerRightUpload={handleInnerRightUpload}
            onInnerRightClear={clearInnerRight}
            backCoverName={backCover?.name ?? null}
            onBackCoverUpload={handleBackCoverUpload}
            onBackCoverClear={clearBackCover}
            spineText={spineText}
            onSpineTextChange={setSpineText}
            spineFont={spineFont}
            onSpineFontChange={setSpineFont}
            spineTheme={spineTheme}
            onSpineThemeChange={setSpineTheme}
            spineTextColor={spineTextColor}
            onSpineTextColorChange={setSpineTextColor}
            onSpineTemplateApply={applySpineTemplate}
            spineImageName={spineImage?.name ?? null}
            onSpineImageUpload={handleSpineImageUpload}
            onSpineImageClear={clearSpineImage}
            showObi={showObi}
            onObiToggle={setShowObi}
            obiText={obiText}
            onObiTextChange={setObiText}
            obiTheme={obiTheme}
            onObiThemeChange={setObiTheme}
            obiTextColor={obiTextColor}
            onObiTextColorChange={setObiTextColor}
            obiFont={obiFont}
            onObiFontChange={setObiFont}
            onObiTemplateApply={applyObiTemplate}
            obiName={obi?.name ?? null}
            onObiUpload={handleObiUpload}
            onObiClear={clearObi}
          />

          {/* AI 提示框 */}
          <form
            onSubmit={handleAiSubmit}
            className="flex items-center gap-2 rounded-full border border-black/10 bg-white/70 py-2 pl-5 pr-2 shadow-sm"
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask AI to design your cover..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#1C2329]/35"
            />
            <button
              type="submit"
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E65100] text-white transition hover:brightness-110"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2} />
            </button>
          </form>
          {aiNote && (
            <p className="text-center text-[10px] uppercase tracking-[0.25em] text-[#E65100]">
              AI cover design — coming soon
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
