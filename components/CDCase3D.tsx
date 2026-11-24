"use client";

import { useId, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { motion } from "framer-motion";
import type { Product } from "@/lib/products";
import { Disc } from "./DiscArtwork";

/*
 * ============================================================================
 * CD 盒 —— 真 3D · 按真实 CD 盒结构建组 · 真 3D 坐标系旋转   v2.23
 * ============================================================================
 *
 * 【层级：严格按真实 CD 盒（宝石盒 / Jewel Case）建组】
 *
 *   世界组 World Group      ← 整个物体的容器，拖拽它 = 三轴 360° 自由查看
 *     │
 *     ├── 背板组 Backboard   ← 最底层：透明背壳（托盘）+ 印着 THE VOW 的纸板
 *     │
 *     ├── 光盘组 Disc Group  ← 悬空在两者之间，可独立 360° 自转
 *     │
 *     └── 前盖组 Front Cover ← 最前层：透明盖板
 *                               旋转轴心（Pivot）钉在**左边缘的铰链**上，
 *                               绕 Y 轴转 160° = 像书本一样平铺打开
 *
 * 【三组动作，都是真的 3D 坐标系旋转，不是 2D 缩放/位移糊弄】
 *
 *   1. 整体 360°：主容器挂 **matrix3d**（四元数累积的弧球 arcball），
 *      拖拽 = 在球面上推 → 绕任意轴自由转，角度不设上限（可以转过 360°）。
 *      四元数 → matrix3d 的换算写在下面，没有引第三方 3D 库。
 *
 *   2. 光盘自转 360°：光盘组自己挂 `rotateZ`，绕**碟面法线**转，
 *      转多少度都行（转过 360° 也认）。
 *
 *   3. 平铺打开 160°：前盖组的 transform-origin 是 `left center`
 *      —— 也就是铰链线；再叠 `rotateY(-160deg)`，
 *      于是盖板绕铰链翻到盒子左边、跟桌面差 20°，像摊开的书。
 *
 * 【平面朝向】
 *   整个盒子仍然躺在那张倾斜的桌面上（--case-table），
 *   但**桌子那一层现在挂在世界组外面**（地面阴影 / 幽灵地板），
 *   世界组只管物体自己的转轴。
 */

/* -------------------------------------------------------------------------- */
/* 碟心镂空                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * 中心镂空：把碟面正中间真的打穿，透过孔直接看到后面的东西。
 *
 * 用 mask 打洞 —— `radial-gradient(circle at 50% 50%)` 不写尺寸时，
 * 射线长度 = 元素最远角距离 = 元素宽的 70.71%，
 * 所以「占盘面宽 r% 的半径」对应的色标位置是 r / 0.7071。
 *
 * 孔径必须盖住**所有 6 张盘面图**的印刷轴心。实测（1280×1280，水平中线暗区）：
 *   anniversary 21.56% · christmas 16.9% · everyday 16.56%
 *   graduation  ~16%   · wedding    16.09% · birthday  ~13.4%
 * 最大的是 anniversary 的 21.56%（半径 10.78%），所以孔半径取 12.02%
 * （色标 17%），最差也留得住 1.2% 的余量，黑轴心整个切净；
 * 同时 12.02% << 15%（外圈印刷细环的半径），细环完整保留。
 */
const DISC_HOLE_MASK =
  "radial-gradient(circle at 50% 50%, transparent 0 var(--case-disc-hole, 17%), " +
  "#000 calc(var(--case-disc-hole, 17%) + 0.10%) 100%)";

/*
 * 圆柱侧壁的洞：中心往上偏 2.4px，抵掉它自己那 2.4px 的下移，
 * 让两个洞在父空间里对齐；半径再大一圈，避免在孔里露一圈灰。
 */
const DISC_HOLE_MASK_WALL =
  "radial-gradient(circle at 50% calc(50% - 2.4px), transparent 0 var(--case-disc-hole-wall, 19.5%), " +
  "#000 calc(var(--case-disc-hole-wall, 19.5%) + 0.10%) 100%)";

/* -------------------------------------------------------------------------- */
/* 弧球（arcball）：把 2D 拖拽变成真正的三轴自由旋转                            */
/* -------------------------------------------------------------------------- */

type Vec3 = [number, number, number];
/* 四元数 [x, y, z, w] */
type Quat = [number, number, number, number];

function qMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function qAxisAngle(axis: Vec3, angle: number): Quat {
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const s = Math.sin(angle / 2);
  return [(axis[0] / len) * s, (axis[1] / len) * s, (axis[2] / len) * s, Math.cos(angle / 2)];
}

/* 屏幕坐标 → 单位球面上的点（超出球面就投影到球赤道） */
function ballVector(x: number, y: number, w: number, h: number): Vec3 {
  const px = (x / Math.max(1, w)) * 2 - 1;
  const py = 1 - (y / Math.max(1, h)) * 2;
  const r2 = px * px + py * py;
  if (r2 <= 1) return [px, py, Math.sqrt(1 - r2)];
  const s = 1 / Math.sqrt(r2);
  return [px * s, py * s, 0];
}

/* 球面上两点的旋转（四元数增量） */
function qFromBall(v0: Vec3, v1: Vec3): Quat {
  const dot = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  if (dot > 0.999999) return [0, 0, 0, 1];
  const axis: Vec3 = [
    v0[1] * v1[2] - v0[2] * v1[1],
    v0[2] * v1[0] - v0[0] * v1[2],
    v0[0] * v1[1] - v0[1] * v1[0],
  ];
  return qAxisAngle(axis, Math.acos(Math.min(1, Math.max(-1, dot))));
}

/* 四元数 → CSS matrix3d（CSS 是列主序） */
function qMatrix3d(q: Quat): string {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m11 = 1 - (yy + zz), m12 = xy - wz, m13 = xz + wy;
  const m21 = xy + wz, m22 = 1 - (xx + zz), m23 = yz - wx;
  const m31 = xz - wy, m32 = yz + wx, m33 = 1 - (xx + yy);
  return (
    `matrix3d(${m11},${m12},${m13},0,` +
    `${m21},${m22},${m23},0,` +
    `${m31},${m32},${m33},0,` +
    `0,0,0,1)`
  );
}

/* -------------------------------------------------------------------------- */
/* 材质常量                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * 相对亮度（sRGB → WCAG 近似）：判断「纸」是深是浅，
 * 好决定印在纸上的油墨用深还是浅（浅色纸用深油墨，深色纸用白油墨）。
 */
function isLightPaper(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55;
}

/* #RRGGBB → rgba()，用来把强调色做成渐隐的印刷色带 */
function withAlpha(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/* 塑料的磨砂颗粒：一小段 feTurbulence，铺在最上层，opacity 极低 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

/*
 * 面光源在壳面中部留下的一道宽反射 —— 压得很淡。
 * 中间必须透明，这是「透明塑料」和「白花花一片」的分界。
 */
const SOFTBOX =
  "linear-gradient(118deg," +
  "rgba(255,255,255,0) 31.4%," +
  "rgba(255,255,255,0.04) 32.2%," +
  "rgba(255,255,255,0.16) 32.9%," +
  "rgba(255,255,255,0.32) 33.5%," +
  "rgba(255,255,255,0.10) 34.3%," +
  "rgba(255,255,255,0.02) 35.2%," +
  "rgba(255,255,255,0) 36.4%)";

/* 条形灯：第二道更细更锐的反光 */
const STRIP =
  "linear-gradient(118deg," +
  "rgba(255,255,255,0) 60.5%," +
  "rgba(255,255,255,0.26) 62.2%," +
  "rgba(255,255,255,0.05) 63.6%," +
  "rgba(255,255,255,0) 65.6%)";

/*
 * 左前方的矩形面光源（RectAreaLight）在**竖直边缘**上留下的反光条。
 *
 * 硬边、1~2% 宽、峰值接近纯白 —— 真实摄影棚里拍出来的 CD 盒，
 * 边缘上就是一条这么窄、这么硬的白线；糊成一片就不是塑料了。
 */
function EdgeSpecular({
  side = "left",
  inset = 0.5,
  width = 2.4,
  strength = 0.97,
}: {
  side?: "left" | "right";
  inset?: number;
  width?: number;
  strength?: number;
}) {
  const ramp = `rgba(255,255,255,${strength}) 0%,` +
    `rgba(255,255,255,${strength}) 42%,` +
    `rgba(255,255,255,${strength},0.52) 66%,` +
    `rgba(255,255,255,${strength},0.14) 86%,` +
    `rgba(255,255,255,${strength},0) 100%`;
  const style: CSSProperties =
    side === "left"
      ? {
          left: `${inset}%`,
          width: `${width}%`,
          background: `linear-gradient(90deg,${ramp})`,
        }
      : {
          right: `${inset}%`,
          width: `${width}%`,
          background: `linear-gradient(270deg,${ramp})`,
        };
  return (
    <span className="pointer-events-none absolute inset-y-0" style={style} />
  );
}

/*
 * 塑料面：很淡的面光源反射 + 条形灯 + 磨砂颗粒 + 边缘高光。
 * 这一层就是「透明塑料壳」本体 —— 它盖在内容物上面。
 * **中间不铺任何大面积的白。**
 */
function PlasticShell() {
  return (
    <>
      {/* 面光源在壳面中部的宽反射（很淡） */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: SOFTBOX }}
      />
      {/* 条形灯 */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: STRIP }}
      />
      {/* 磨砂颗粒（roughness 很低，所以很淡） */}
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: GRAIN, backgroundSize: "140px 140px" }}
      />
      {/* 边缘：色散（ior）+ 1px 锐利白高光 + 折射压暗，中间保持透明 */}
      <span
        className="pointer-events-none absolute inset-0 rounded-[5px]"
        style={{
          boxShadow:
            "inset 0 0 0 2px rgba(178,216,236,0.14)," +
            "inset 0 0 0 1px rgba(255,255,255,0.30)," +
            "inset 0 1px 0 rgba(255,255,255,0.86)," +
            "inset 1px 0 0 rgba(255,255,255,0.36)," +
            "inset 0 -1px 0 rgba(28,35,41,0.24)," +
            "inset -1px 0 0 rgba(28,35,41,0.14)",
        }}
      />
    </>
  );
}

/*
 * 左侧书脊：真实 CD 盒的塑料铰链就在这条边上。
 *
 * v2.24：原来这条棱是 repeating-linear-gradient 做的「一格格拉链」，
 * 在近景特写里它比印在纸上的字还抢眼（像拉链、像齿条）——
 * 真盒的铰链是一条**平滑的塑料凹槽 + 一道亮边**，不是齿条。
 * 现在改成：柔和的凹槽明暗 + 靠外缘一条 1px 的锐利白高光。
 */
function Spine({ side = "left" }: { side?: "left" | "right" }) {
  /*
   * side 说明这一面是盖板的哪一面：
   *   · 正面（外侧）—— 书脊在 local 左边
   *   · 背面（内侧）—— 盖板绕 Y 轴翻了 180°，内容整体左右对调，
   *     所以内侧面的铰链条要画在 local 右边，才会落到同一条物理铰链上。
   */
  const gradient =
    "linear-gradient(90deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 22%, " +
    "rgba(198,224,238,0.08) 46%, rgba(28,35,41,0.16) 70%, rgba(28,35,41,0.28) 100%)";
  return (
    <span
      data-testid="cdcase-spine-ridge"
      className={`pointer-events-none absolute inset-y-0 w-[6%] ${side === "left" ? "left-0" : "right-0"}`}
      style={{
        background: side === "left" ? gradient : gradient.replace("90deg", "270deg"),
      }}
    >
      {/* 铰链凹槽：两道柔和的暗，中间夹一条更暗的沟 —— 不再是齿条 */}
      <span
        className={`absolute inset-y-0 w-[46%] ${side === "left" ? "left-[30%]" : "right-[30%]"}`}
        style={{
          background:
            "linear-gradient(90deg, rgba(28,35,41,0.16) 0%, rgba(28,35,41,0.05) 42%, rgba(255,255,255,0.10) 64%, rgba(255,255,255,0.02) 100%)",
        }}
      />
      {/* 靠外缘的锐利白高光：交代塑料的厚度 */}
      <span
        className={`absolute inset-y-0 w-px ${side === "left" ? "left-0" : "right-0"}`}
        style={{
          background: "rgba(255,255,255,0.85)",
          boxShadow: "0 0 2px rgba(255,255,255,0.45)",
        }}
      />
    </span>
  );
}

/*
 * 盖板的板边厚度 —— 盖板不是一张纸，而是有 4px 厚的塑料板。
 *
 * 三条边各一个 quad：
 *   · 下边（法线 +y，朝下外侧）—— 最显眼的那条「板边」
 *   · 上边（法线 -y）
 *   · 远边（法线 +x，盖子斜立时是顶上那条）
 * 每个 quad 从盖面向 local -z 延伸 4px。
 */
function LidEdges() {
  return (
    <>
      {/* 下沿板边：top:100% 往下伸，再绕 X 轴 -90°，从盖面向 -z 延伸 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-full h-[4px]"
        style={{
          transformOrigin: "top center",
          transform: "rotateX(-90deg)",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.55) 34%, rgba(176,216,238,0.42) 74%, rgba(120,180,220,0.30) 100%)",
        }}
      />
      {/* 上沿板边 */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-full h-[4px]"
        style={{
          transformOrigin: "bottom center",
          transform: "rotateX(90deg)",
          background:
            "linear-gradient(0deg, rgba(255,255,255,0.80) 0%, rgba(255,255,255,0.42) 40%, rgba(176,216,238,0.34) 100%)",
        }}
      />
      {/* 远端板边（盖子斜立时的顶边） */}
      <div
        className="pointer-events-none absolute left-full top-0 h-full w-[4px]"
        style={{
          transformOrigin: "left center",
          transform: "rotateY(90deg)",
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.86) 0%, rgba(255,255,255,0.46) 45%, rgba(176,216,238,0.36) 100%)",
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 背板组里的「印着 THE VOW 的纸板」                                            */
/* -------------------------------------------------------------------------- */

/*
 * 真宝石盒（jewel case）里，印刷纸板是**压在透明背壳（托盘）上面**的，
 * 光盘就悬在这张纸板上方 —— 于是：
 *   · 合上时：透过透明前盖能看见 THE VOW（和真盒一样）
 *   · 打开平铺时：背板上是纸板 + 悬空的碟，碟心孔透过去是**浅色纸面**
 *     （不再是压在桌面影里的一块灰饼）
 */
function ArtworkPanel({ item }: { item: Product }) {
  return (
    <div
      data-testid="cdcase-artwork"
      className="absolute inset-[3.5%] overflow-hidden rounded-[1px]"
      style={{ transform: "translateZ(0.6px)" }}
    >
      <img
        src={item.coverImage}
        alt={`${item.name} 封套封面`}
        draggable={false}
        className="h-full w-full object-cover"
      />
      {/* 纸板与托盘之间那道缝 */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 0 1px rgba(28,35,41,0.28)" }}
      />
      {/* 光碟落在纸板上的影：悬空才有影 */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          left: "60.3%",
          top: "51.5%",
          width: "57%",
          aspectRatio: "1 / 1",
          transform: "translate(-50%,-50%)",
          boxShadow: "0 8px 16px rgba(28,35,41,0.17)",
          filter: "blur(11px)",
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 主组件                                                                      */
/* -------------------------------------------------------------------------- */

export default function CDCase3D({
  item,
  open,
  onToggle,
}: {
  item: Product;
  open: boolean;
  onToggle: () => void;
}) {
  /*
   * 亚克力折射用的 SVG 置换滤镜（每个实例一个唯一 id，避免同页多个盒子打架）。
   * feTurbulence 当位移图 + feDisplacementMap：透过盒底/盒侧看到的背景会被
   * 轻微扭一下 —— 这就是「光穿过亚克力被折弯」那点感觉。
   * 实测 Chrome / Edge 的 backdrop-filter 支持 url() 引用 SVG 滤镜。
   *
   * ⚠ 关键：滤镜本体挂在舞台下的**扁平「幽灵地板」**上，不在 preserve-3d 里。
   * 挂在 3D 子树内部时透视上下文的 backdrop 是空的，滤镜等于没挂。
   */
  const refractId = `case-acrylic-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  /*
   * 脊背折边上的油墨：按纸的明度自动选深/浅（真盒上就是印在纸上的油墨，不是贴在壳上的白字）
   */
  const spineLight = isLightPaper(item.base);
  const spineInk = spineLight ? "#1C2329" : "#FFFFFF";
  const spineInkLift = spineLight
    ? "0 1px 0 rgba(255,255,255,0.45)"
    : "0 1px 0 rgba(0,0,0,0.38)";

  /* ---- 世界组：弧球拖出来的三轴旋转（四元数累积，角度不限） ---- */
  const [worldQuat, setWorldQuat] = useState<Quat>([0, 0, 0, 1]);
  /* ---- 光盘组：绕自己法线的自转角（度） ---- */
  const [discSpin, setDiscSpin] = useState(0);

  const drag = useRef<{
    mode: "world" | "disc";
    zone: "lid" | "disc" | "other";
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    v0: Vec3;
  } | null>(null);
  const suppressClick = useRef(false);
  /*
   * pointerdown 时记下的落点区域。
   *
   * 为什么单独记：根节点上做了 setPointerCapture，按 Pointer Events 规范，
   * 捕获期间的 click 会被**重定向到捕获元素**（也就是根节点），
   * 盒盖按钮自己的 onClick 根本收不到 —— 表现为「点了没反应」。
   * 所以开合判定必须放在根节点上，并靠这个 ref 还原「当时点的是哪儿」。
   */
  const clickZone = useRef<"lid" | "disc" | "other" | null>(null);

  /*
   * 世界组的 transform 串：
   *   matrix3d(用户弧球旋转)  →  平铺时整体缩一下  →  沿桌面 x 平移  →  桌面坐标系
   * 顺序即嵌套：桌面旋转作用在模型上，然后平移、缩放，最后用户的旋转套在最外层。
   */
  const worldTransform =
    `${qMatrix3d(worldQuat)} ` +
    `scale(var(--case-world-scale, 1)) ` +
    `translateX(var(--case-world-shift, 0px)) ` +
    `var(--case-table, rotateX(40deg) rotateY(34deg) rotateZ(-4deg))`;

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    /* 拖到碟上 = 转碟；拖到别处 = 转整个盒子 */
    const onDisc = !!target.closest('[data-testid="cdcase-disc-group"]');
    const onLid = !!target.closest('[data-testid="cdcase-lid"]');
    const zone = onDisc ? "disc" : onLid ? "lid" : "other";
    clickZone.current = zone;
    const rect = e.currentTarget.getBoundingClientRect();
    drag.current = {
      mode: onDisc ? "disc" : "world",
      zone,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
      v0: ballVector(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height),
    };
    /* 顺手掐掉原生拖拽/选中，别让浏览器的图片拖拽手势抢走指针 */
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 某些浏览器在 pointer 已释放时会抛，忽略即可 */
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.lastX;
    const dy = e.clientY - d.lastY;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    if (
      !d.moved &&
      Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 6
    ) {
      d.moved = true;
      suppressClick.current = true;
    }
    if (!d.moved) return;

    if (d.mode === "disc") {
      /* 碟子绕自己的法线（碟面法线 = 局部 Z）自转，横向拖得多转得多 */
      setDiscSpin((s) => s + dx * 0.8 + dy * 0.25);
      return;
    }

    /* 整个盒子：球面推 → 绕任意轴自由转（四元数增量累积） */
    const rect = e.currentTarget.getBoundingClientRect();
    const v1 = ballVector(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
    const dq = qFromBall(d.v0, v1);
    setWorldQuat((q) => qMul(dq, q));
    d.v0 = v1;
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* 同上 */
    }
    if (d && !d.moved) suppressClick.current = false;
  };

  /*
   * 开合判定放在**根节点**上，而不是盒盖按钮上。
   *
   * 原因见 clickZone 的注释：setPointerCapture 之后 click 会被重定向到根节点，
   * 按钮自己的 onClick 收不到。放在根节点上，鼠标点击和键盘激活（Enter/Space，
   * 事件 target 就是按钮本身）两条路径都能覆盖。
   */
  const onRootClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    const zone = clickZone.current;
    clickZone.current = null;
    /* 刚刚是在拖拽，不是点击 —— 别把开合状态给误改了 */
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const target = e.target as HTMLElement;
    const onLid = !!target.closest('[data-testid="cdcase-lid"]');
    if (onLid || zone === "lid") onToggle();
  };

  return (
    <motion.div
      data-testid="cdcase-3d"
      className="relative mx-auto mt-6 w-full max-w-[300px] sm:max-w-[380px]"
      style={
        {
          perspective: "var(--case-perspective, 1250px)",
          perspectiveOrigin: "var(--case-po, 50% 36%)",
          /*
           * 盒体几何（单位 px，无单位数供 transform 用）
           *   --case-depth    托盘壁高 —— 塑料厚度
           *   --case-chamfer  45° 倒角宽
           *   --case-disc-z   碟中心离地板的高度（前层空间）
           */
          "--case-depth": "20",
          "--case-chamfer": "3.4",
          "--case-disc-z": "13",
          /*
           * 碟心孔径（色标，见 DISC_HOLE_MASK 注释）：
           * 必须一次盖住 6 张盘面图里最大的那个印刷轴心（anniversary 21.56%）。
           * 写在根节点上是为了「浏览器里可实时覆盖调参 + 回归脚本能读到真值」。
           */
          "--case-disc-hole": "17%",
          "--case-disc-hole-wall": "19.5%",
          /* 别让浏览器的原生拖拽/选中抢走指针 */
          userSelect: "none",
          WebkitUserSelect: "none",
          /* 触屏上别让浏览器抢走手势去滚页面 */
          touchAction: "none",
        } as CSSProperties
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      /* 开合判定在根节点（setPointerCapture 会把 click 重定向到这里） */
      onClick={onRootClick}
      /* 别让浏览器的原生拖拽/选中抢走指针 */
      onDragStart={(e) => e.preventDefault()}
      /* 盒盖开合角、碟的位移、平铺时的缩放都走 CSS 变量：调参不用重编译 */
      animate={{
        /* 打开 = 绕左边缘铰链转 160°，像书本一样平铺 */
        "--case-lid-angle": open ? -160 : 0,
        /* 打开时把碟往右推一截（拉出托盘一点，但仍在盒内，不穿墙） */
        "--case-disc-x": open ? 14 : 0,
        "--case-disc-rot": open ? 3 : 0,
        /* 平铺后整体缩一点 + 往右挪一点，让「摊开的书」整个留在画面里 */
        "--case-world-scale": open ? 0.66 : 1,
        "--case-world-shift": open ? "118px" : "0px",
      }}
      transition={{ type: "spring", stiffness: 72, damping: 15 }}
    >
      {/*
        ---------- 亚克力折射滤镜定义 ----------
        只占 0×0，不参与布局；滤镜本体给托盘内底用。
      */}
      <svg
        aria-hidden="true"
        focusable="false"
        style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
      >
        <filter
          id={refractId}
          x="-12%"
          y="-12%"
          width="124%"
          height="124%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012"
            numOctaves="1"
            seed="7"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="18"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>

      {/*
        ---------- 地面阴影 ----------
        盒子里面已经空了（没有实心内页），影子就得跟着变轻 ——
        否则一团死黑的影会让里面看起来还垫着一块黑布。
        主光在**右上方**，影子往左下拖；四层都整体压淡。
      */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* 软影：往左下拖出去 */}
        <div
          className="absolute left-[34%] top-[56%] h-[44%] w-[84%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 56% 44%, rgba(28,35,41,0.13), rgba(28,35,41,0.05) 54%, rgba(28,35,41,0) 78%)",
            filter: "blur(22px)",
          }}
        />
        {/* 接触影：紧贴盒底 —— 空壳，只有很淡的一圈 */}
        <div
          className="absolute left-[48%] top-[52%] h-[24%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, rgba(28,35,41,0.15), rgba(28,35,41,0.04) 56%, rgba(28,35,41,0) 80%)",
            filter: "blur(11px)",
          }}
        />
        {/* 折射彩边：光穿过塑料后影子边缘泛冷光（朝光的一侧） */}
        <div
          className="absolute left-[46%] top-[47%] h-[26%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 68% 34%, rgba(126,186,224,0.26), rgba(126,186,224,0) 62%)",
            filter: "blur(13px)",
            mixBlendMode: "screen",
          }}
        />
        {/* 折射彩边：另一侧一点点暖色，塑料边缘的色散 */}
        <div
          className="absolute left-[38%] top-[54%] h-[22%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 40% 62%, rgba(255,206,150,0.17), rgba(255,206,150,0) 64%)",
            filter: "blur(15px)",
            mixBlendMode: "screen",
          }}
        />
        {/* 焦散：塑料边缘把光聚出来的一道亮线（不是死黑的影） */}
        <div
          className="absolute left-[44%] top-[50%] h-[9%] w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 62% 50%, rgba(255,255,255,0.30), rgba(255,255,255,0) 68%)",
            filter: "blur(7px)",
            mixBlendMode: "screen",
          }}
        />
      </div>

      {/*
        ---------- 幽灵地板（真折射层） ----------
        一个**扁平**元素，直接挂在有 perspective 的舞台下，
        **不在 preserve-3d 子树里**。

        （实测：backdrop-filter 挂在 preserve-3d 里面时采样不到任何东西 ——
          透视上下文的 backdrop 是空的，滤镜等于没挂。挪到扁平层之后，
          它吃到的就是页面内容本身。）

        位置用 absolute + 同尺寸 aspect-square，和下面那只 3D 盒子的
        盒子框完全重合；transform 和**世界组用同一串**，
        所以不管用户怎么转，投出来的四边形都跟托盘内底严丝合缝。
      */}
      <div
        className="pointer-events-none absolute left-0 top-0 aspect-square w-full"
        style={{ transform: worldTransform }}
      >
        <span
          className="absolute inset-0"
          style={{
            backdropFilter: `url(#${refractId})`,
            WebkitBackdropFilter: `url(#${refractId})`,
          }}
        />
      </div>

      {/* ================================================================== */}
      {/* ====================== 世界组 World Group ========================== */}
      {/* ================================================================== */}
      <div
        data-testid="cdcase-world"
        className="relative aspect-square w-full"
        style={{
          transformStyle: "preserve-3d",
          transform: worldTransform,
        }}
      >
        {/* ================================================================= */}
        {/* ==================== 背板组 Backboard Group ====================== */}
        {/* ================================================================= */}
        {/* 最底层：透明背壳（托盘）+ 印着 THE VOW 的纸板 */}
        <div
          data-testid="cdcase-back"
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* ---------- 透明背壳：地板（z = 0）：托盘的内底 ---------- */}
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ transform: "translateZ(0px)" }}
          >
            {/* 托盘内底：几乎是空的，只留极淡的一层塑料面 */}
            <span
              className="absolute inset-0"
              style={{ background: "rgba(238,246,252,0.035)" }}
            />
            {/* 塑料边缘的一点内散光（不是暗角 —— 里面没有东西，不该有暗） */}
            <span
              className="absolute inset-0"
              style={{
                boxShadow:
                  "inset 0 0 22px rgba(255,255,255,0.10)," +
                  "inset 0 8px 16px -14px rgba(255,255,255,0.16)",
              }}
            />
          </div>

          {/* ---------- 印着 THE VOW 的纸板：压在透明背壳上面 ---------- */}
          <ArtworkPanel item={item} />

          {/* ---------- 近端墙（外表面朝观众）：厚度的主体现 ---------- */}
          <div
            className="absolute inset-x-0 bottom-0 rounded-br-[4px] rounded-bl-[4px]"
            style={{
              height: "calc(var(--case-depth) * 1px)",
              transformOrigin: "bottom center",
              transform: "rotateX(-90deg)",
            }}
          >
            {/* 塑料侧壁：上缘被光打透（青蓝折射），下缘压在桌面上（暗） */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg," +
                  "rgba(238,249,255,0.22) 0%," +
                  "rgba(182,220,241,0.13) 20%," +
                  "rgba(255,255,255,0.04) 46%," +
                  "rgba(28,35,41,0.08) 80%," +
                  "rgba(28,35,41,0.28) 100%)",
              }}
            />
            {/* 右端角上的锐利白条（主光从右上来） */}
            <div
              className="absolute inset-y-0 right-[2.5%] w-[4%]"
              style={{
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.62) 40%, rgba(255,255,255,0.96) 76%, rgba(255,255,255,0.35) 100%)",
              }}
            />
            {/* 底边那道上桌面的暗线 + 一道锐利反光 */}
            <div
              className="absolute inset-x-0 bottom-0 h-[16%]"
              style={{
                background:
                  "linear-gradient(180deg, rgba(28,35,41,0.26) 0%, rgba(28,35,41,0.05) 60%, rgba(255,255,255,0.34) 100%)",
              }}
            />
          </div>

          {/* ---------- 近端墙顶 45° 倒角：最亮的那条棱 ---------- */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: "calc(var(--case-chamfer) * 1.4142px)",
              transformOrigin: "bottom center",
              transform:
                "translateZ(calc((var(--case-depth) - var(--case-chamfer)) * 1px)) rotateX(-45deg)",
              background:
                "linear-gradient(180deg," +
                "rgba(255,255,255,0.99) 0%," +
                "rgba(255,255,255,0.86) 26%," +
                "rgba(214,238,252,0.66) 62%," +
                "rgba(150,205,240,0.44) 100%)",
            }}
          />

          {/* ---------- 右墙（内表面可见）：从右上打进来的那道竖直高光 ---------- */}
          <div
            className="absolute inset-y-0 left-full rounded-tr-[3px] rounded-br-[3px]"
            style={{
              width: "calc(var(--case-depth) * 1px)",
              transformOrigin: "left center",
              transform: "rotateY(-90deg)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg," +
                  "rgba(28,35,41,0.16) 0%," +
                  "rgba(176,216,238,0.09) 26%," +
                  "rgba(255,255,255,0.10) 74%," +
                  "rgba(255,255,255,0.72) 93%," +
                  "rgba(255,255,255,0.98) 100%)",
              }}
            />
          </div>

          {/* ---------- 右墙顶 45° 倒角 ---------- */}
          <div
            className="absolute inset-y-0 right-0"
            style={{
              width: "calc(var(--case-chamfer) * 1.4142px)",
              transformOrigin: "right center",
              transform:
                "translateZ(calc((var(--case-depth) - var(--case-chamfer)) * 1px)) rotateY(45deg)",
              background:
                "linear-gradient(90deg," +
                "rgba(255,255,255,0.98) 0%," +
                "rgba(255,255,255,0.80) 30%," +
                "rgba(208,236,252,0.58) 70%," +
                "rgba(150,205,240,0.40) 100%)",
            }}
          />

          {/* ---------- 远端墙（内表面可见） ---------- */}
          <div
            className="absolute inset-x-0 bottom-full rounded-bl-[3px] rounded-br-[3px]"
            style={{
              height: "calc(var(--case-depth) * 1px)",
              transformOrigin: "bottom center",
              transform: "rotateX(-90deg)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg," +
                  "rgba(255,255,255,0.18) 0%," +
                  "rgba(196,228,245,0.11) 26%," +
                  "rgba(255,255,255,0.04) 58%," +
                  "rgba(28,35,41,0.11) 100%)",
              }}
            />
          </div>

          {/* ---------- 远端墙顶 45° 倒角（上沿的厚度线，和另外三面一致） ---------- */}
          {/*
            v2.24：原来只有近端墙 / 右墙 / 书脊墙三面有 45° 倒角，
            远端墙（盒子的上沿）那一条厚度线是缺的 —— 补上，四周才齐。
          */}
          <div
            className="absolute inset-x-0 bottom-full"
            style={{
              height: "calc(var(--case-chamfer) * 1.4142px)",
              transformOrigin: "bottom center",
              transform:
                "translateZ(calc((var(--case-depth) - var(--case-chamfer)) * 1px)) rotateX(45deg)",
              background:
                "linear-gradient(0deg," +
                "rgba(255,255,255,0.99) 0%," +
                "rgba(255,255,255,0.84) 30%," +
                "rgba(210,238,252,0.62) 68%," +
                "rgba(150,205,240,0.42) 100%)",
            }}
          />

          {/* ---------- 书脊墙（外表面可见，铰链在这条边上） ---------- */}
          {/*
            v2.24：这一面从「一堵发白的实心塑料墙」改成**冰透的透明壳**——
            壳体本身几乎全透（透过去能看见里面的折边纸和印在纸上的字），
            只在边缘留一条**锐利、明亮的白色高光**交代亚克力的厚度。
          */}
          <div
            data-testid="cdcase-spine-wall"
            className="absolute inset-y-0 left-0 rounded-tl-[3px] rounded-bl-[3px]"
            style={{
              width: "calc(var(--case-depth) * 1px)",
              transformOrigin: "left center",
              transform: "rotateY(-90deg)",
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg," +
                  "rgba(28,35,41,0.10) 0%," +
                  "rgba(198,224,238,0.05) 30%," +
                  "rgba(255,255,255,0.05) 74%," +
                  "rgba(255,255,255,0.14) 100%)",
              }}
            />
            {/* 铰链棱：沿书脊的三道 */}
            <div
              className="absolute inset-y-0 right-[22%] w-[38%]"
              style={{
                background:
                  "repeating-linear-gradient(to right, rgba(255,255,255,0.42) 0 1px, rgba(28,35,41,0.24) 1px 4px)",
              }}
            />
            {/* 边缘那条锐利、明亮的白色高光（1px，压在所有东西之上） */}
            <div
              className="absolute inset-y-0 right-0 w-px"
              style={{
                background: "rgba(255,255,255,0.96)",
                boxShadow: "0 0 2px rgba(255,255,255,0.55)",
              }}
            />
          </div>

          {/* ---------- 脊背：内页纸的折边（专辑名印在这条折边上） ---------- */}
          {/*
            真宝石盒的内页纸是折起来的：纸在盒底铺平，到了脊背这一边折起来，
            于是侧边看到的是**一条立起来的纸边**，专辑名就印在这条边上。
            这条折边夹在「透明外壳」和「盒底的纸」之间（x = 1.2px 处），
            所以：透壳可见、字不会被塑料高光糊掉。
          */}
          <div
            data-testid="cdcase-spine-fold"
            className="absolute inset-y-0 left-0"
            style={{
              width: "14px",
              transformOrigin: "left center",
              transform: "translateX(1.2px) rotateY(-90deg)",
            }}
          >
            {/* 折边纸面：专辑底色 + 封面上那块强调色徽标（THE VOW 的黄） */}
            {/*
              强调色不是硬边通栏（会读成贴纸），而是一段**羽化**的印刷色带：
              两头渐隐，纸底色透上来 —— 看着像印在纸上的画，不是贴上去的色块。
            */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  `linear-gradient(180deg,` +
                  `${item.base} 0%,` +
                  `${item.base} 56%,` +
                  `${withAlpha(item.accent, 0)} 60%,` +
                  `${withAlpha(item.accent, 0.95)} 66%,` +
                  `${withAlpha(item.accent, 0.95)} 73%,` +
                  `${withAlpha(item.accent, 0)} 78%,` +
                  `${item.base} 83%)`,
              }}
            />
            {/* 印在折边上的专辑名：竖排、锐利（外壳在它之外，但壳是全透的，不糊） */}
            <span
              className="absolute inset-0 flex items-center justify-center overflow-hidden"
              style={{ writingMode: "vertical-rl" }}
            >
              <span
                data-testid="cdcase-spine-name"
                style={{
                  fontSize: "9px",
                  fontWeight: 900,
                  letterSpacing: "0.03em",
                  lineHeight: 1,
                  color: spineInk,
                  textShadow: spineInkLift,
                }}
              >
                {item.name.toUpperCase()}
              </span>
            </span>
            {/* 折边上那道纸的折痕高光（纸折起来之后折角上会有一道亮线） */}
            <span
              className="absolute inset-y-0 right-0 w-px"
              style={{ background: "rgba(255,255,255,0.55)" }}
            />
          </div>

          {/* ---------- 书脊墙顶 45° 倒角（左上角那道抢到高光的厚度线） ---------- */}
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: "calc(var(--case-chamfer) * 1.4142px)",
              transformOrigin: "left center",
              transform:
                "translateZ(calc((var(--case-depth) - var(--case-chamfer)) * 1px)) rotateY(-45deg)",
              background:
                "linear-gradient(90deg," +
                "rgba(255,255,255,0.99) 0%," +
                "rgba(255,255,255,0.84) 30%," +
                "rgba(210,238,252,0.62) 68%," +
                "rgba(150,205,240,0.42) 100%)",
            }}
          />
        </div>

        {/* ================================================================= */}
        {/* ==================== 光盘组 Disc Group ========================== */}
        {/* ================================================================= */}
        {/* 悬空在背板和前盖之间；自己挂 rotateZ = 绕碟面法线独立 360° 自转 */}
        <div
          data-testid="cdcase-disc-group"
          className="absolute"
          style={{
            left: "var(--case-disc-left, 60%)",
            top: "var(--case-disc-top, 52%)",
            width: "var(--case-disc-size, 54%)",
            aspectRatio: "1 / 1",
            transformStyle: "preserve-3d",
            transform:
              "translate(-50%,-50%) translateX(calc(var(--case-disc-x, 0) * 1px)) " +
              "translateZ(calc(var(--case-disc-z, 13) * 1px)) " +
              `rotateZ(${discSpin}deg)`,
          }}
        >
          {/* 圆柱侧壁：往近端偏一点，深色盘缘（中心一起镂空，别把洞堵住） */}
          <div
            data-testid="cdcase-disc-wall"
            className="absolute inset-0 rounded-full"
            style={{
              transform: "translateY(2.4px)",
              background:
                "linear-gradient(180deg, #9aa1a7 0%, #c3c9ce 32%, #e6eaee 58%, #adb5ba 80%, #7f878d 100%)",
              WebkitMaskImage: DISC_HOLE_MASK_WALL,
              maskImage: DISC_HOLE_MASK_WALL,
            }}
          />
          {/* 盘面：中心同样镂空 —— 透过孔直接看穿到后面的东西 */}
          <div
            data-testid="cdcase-disc-face"
            className="absolute inset-0"
            style={{
              transform: "translateZ(1.6px)",
              WebkitMaskImage: DISC_HOLE_MASK,
              maskImage: DISC_HOLE_MASK,
            }}
          >
            <Disc item={item} />
            {/* 盘面上那道锐利的塑料反光 */}
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(124deg, rgba(255,255,255,0) 33%, rgba(255,255,255,0.16) 35.4%, rgba(255,255,255,0.62) 36.6%, rgba(255,255,255,0.20) 38.4%, rgba(255,255,255,0) 41.4%)",
              }}
            />
          </div>
          {/*
            中心孔口：圆孔是「切」出来的，切口那圈塑料断面正好接住主光。
            一道 1px 的锐利白线交代孔的厚度，下缘一线极淡的暗当孔壁阴影。
            **没有轴座、没有柱体**，中间是真的空的。

            ⚠ 2026-11-24：光靠「切口白线」不够 —— 孔里透出来的是浅色纸面，
            比周围还亮，整块读起来是**一个白色的实心圆块**（用户连着两次指认这一点）。
            补上**孔内壁的暗环**（inset 阴影往孔心渐隐）才有「管子」的深度：
            孔中央依旧完全透明（还是镂空、还是能透过去），但边缘一圈沉下去，
            于是眼睛读作「孔」而不是「圆饼」。
          */}
          <span
            data-testid="cdcase-disc-hole"
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: "calc(var(--case-disc-hole, 17%) * 1.4142)",
              transform: "translateZ(1.75px)",
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.82)," +
                "inset 0 0 7px rgba(28,35,41,0.46)," +
                "inset -1px 2px 5px rgba(28,35,41,0.45)," +
                "inset 1px -1px 1px rgba(255,255,255,0.55)",
            }}
          />
          {/* 盘面外缘的一圈亮边：碟子自己的塑料/金属边 */}
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              transform: "translateZ(1.7px)",
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.40)," +
                "inset 0 2px 5px rgba(255,255,255,0.22)",
            }}
          />
        </div>

        {/* ================================================================= */}
        {/* ================== 前盖组 Front Cover Group ===================== */}
        {/* ================================================================= */}
        {/*
          最前层：透明盖板。
          旋转轴心（Pivot）钉在**左边缘的铰链**上（transform-origin: left center），
          再叠 rotateY(-160°) → 像书本一样平铺摊开。
        */}
        <button
          type="button"
          data-testid="cdcase-lid"
          aria-label={item.name}
          className="absolute inset-0 z-20 cursor-pointer rounded-[5px]"
          style={
            {
              transformStyle: "preserve-3d",
              /* ★ 铰链在左边缘 —— 平铺打开的轴心就钉在这儿 */
              transformOrigin: "left center",
              /*
               * 打开时铰链落在托盘壁顶（z=20），合上时盖板叠在壁顶之上（z=24，
               * 盖板的 4px 厚度正好压住壁顶）。
               */
              "--case-lid-z": open ? 20 : 24,
              transform:
                "translateZ(calc(var(--case-lid-z) * 1px)) rotateY(calc(var(--case-lid-angle, 0) * 1deg))",
            } as CSSProperties
          }
        >
          {/* 正面：透明盖板本体（真宝石盒的前盖就是一块透明塑料） */}
          <div
            className="absolute inset-0"
            style={{ transformStyle: "preserve-3d", backfaceVisibility: "hidden" }}
          >
            <div
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-[5px]"
              style={{ background: "rgba(240,240,240,0.20)" }}
            >
              <PlasticShell />
              <Spine />
              {/* 主光打在竖直边缘上的锐利白条（整幅图最显眼的那条竖线） */}
              <EdgeSpecular side="left" inset={0.3} width={3} />
            </div>
          </div>

          {/* 背面：盖板内侧的白纸衬（真宝石盒的透明盖里常衬一张白纸） */}
          <div
            className="absolute inset-0"
            style={{
              transformStyle: "preserve-3d",
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
            }}
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[5px]">
              <span className="absolute inset-0 bg-[#F4EFE5]" />
              {/*
                盖板内面：白纸衬 + 封面图淡淡透出来。
                这一面整体绕 Y 轴翻了 180°，但**翻完之后正对相机**，
                内容本来就是正的 —— 所以这里不能再多翻一次（否则字会镜像）。
              */}
              <div className="absolute inset-0">
                <img
                  src={item.coverImage}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover opacity-18"
                />
              </div>
              {/* 纸纹 */}
              <span
                className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-multiply"
                style={{ backgroundImage: GRAIN, backgroundSize: "140px 140px" }}
              />
              {/* 壳体底色 */}
              <span
                className="pointer-events-none absolute inset-0 rounded-[5px]"
                style={{ background: "rgba(240,240,240,0.20)" }}
              />
              <PlasticShell />
              {/*
                盖板内侧**不再画铰链条**（v2.24）：
                打开平铺时，内侧那条铰链棱和「内页纸折边」的屏幕投影几乎重合，
                会把印在折边上的专辑名整条挡死 —— 拉链一样的高光比字还抢眼。
                铰链的交代交给下面那道**内页纸折边**（纸 + 油墨），外壳那一面保留铰链条。
              */}
              {/* 背面被翻转过，主光的白条要落在镜像后的同一侧 */}
              <EdgeSpecular side="right" inset={0.3} width={3} />
            </div>
          </div>

          {/* 盖板的厚度边（外层容器只做定位，板边本身各自朝外） */}
          <div
            className="absolute inset-0"
            style={{ transformStyle: "preserve-3d", backfaceVisibility: "hidden" }}
          >
            <LidEdges />
          </div>
        </button>
      </div>
    </motion.div>
  );
}
