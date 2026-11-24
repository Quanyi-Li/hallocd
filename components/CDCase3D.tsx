"use client";

import { useEffect, useRef } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import type { Product } from "@/lib/products";
import { Disc } from "./DiscArtwork";

/*
 * ============================================================================
 * CD 盒 —— 真 3D · 正视平铺 · 丝滑开合与转动   v2.27
 * ============================================================================
 *
 * 【v2.27 改了三件事】
 *
 *   1. 相机：正面朝向屏幕，一根水平线，不畸变
 *      视距 1800px → 2400px —— 透视越弱，方盒子越不会被压成梯形；
 *      固定倾角收到 -6°（只绕竖直轴），开合两态永远在同一条水平线上；
 *      **打开时自动把转角摆正**到最近的整圈 —— 正面正对镜头，
 *      用户第一眼看到的是完整的盒子结构，而不是上次拖拽留下的歪角度。
 *
 *   2. 材质：两侧外壳都是真塑料
 *      v2.26 只有盖板（左边那块）有 PlasticShell 的反光，
 *      托盘（右边那块）几乎是裸的印刷纸板 —— 用户一眼看出「右边是空的」。
 *      现在托盘补齐：宽面光源反光 + 条形灯 + 模具口沿 + 四边锐利高光，
 *      纸板压到 4.6% 内缩（露出一圈透明塑料边）+ 纸面覆膜光泽。
 *
 *   3. 交互：跟手 + 惯性 + 丝滑开合
 *      · 拖拽走 MotionValue 直写 transform，热路径里**一个 CSS 变量都没有**
 *        （变量挂在根节点上，每改一次整棵子树都要重算样式）；
 *      · 松手后：自适应阻尼（甩得快阻尼强，慢下来就长尾滑行）
 *        + 末段 smoothstep 收尾 —— 速度连续地归零，绝不戛然而止；
 *      · 开合统一走 cubic-bezier(0.22, 1, 0.36, 1) 0.72s，
 *        盖板角度、世界组位移、影子宽度**同一口钟**。
 *
 * 【性能：卡顿不是 JS 的锅，是光栅的锅】
 *   实测（CDP Performance.getMetrics）：拖拽 1.5s 里主线程只忙了 4.5%
 *   （脚本 10~13ms、样式 7~9ms、布局 0ms）—— JS 根本不是瓶颈。
 *   真正贵的是**每一帧都要重新光栅**：整棵 3D 子树里挂着
 *   「blur 滤镜」「SVG 位移 backdrop-filter」「mix-blend-mode」，
 *   盒子一转它们就得重算一遍。
 *   v2.27 把这三样全拆掉：
 *     · 碟影的 blur(11px) → 纯渐变（本来就是柔的，不需要真模糊）
 *     · 幽灵地板的 backdrop-filter: url(#SVG) → 去掉（纸板盖住 95%，根本看不见）
 *     · 磨砂颗粒的 mix-blend-overlay → 去掉（0.03 不透明度，本来就看不出来）
 *
 * 【层级：严格按真实 CD 盒（宝石盒 / Jewel Case）建组】
 *
 *   世界组 World Group      ← 整个物体的容器
 *     │
 *     ├── 背板组 Backboard   ← 最底层：透明背壳（托盘）+ 印着封面的纸板
 *     │
 *     ├── 光盘组 Disc Group  ← 悬空在两者之间，可独立 360° 自转
 *     │
 *     └── 前盖组 Front Cover ← 最前层：透明盖板
 *                               旋转轴心（Pivot）钉在**左边缘的铰链**上，
 *                               绕 Y 轴转 180° = 跟托盘平摊在同一张平面上
 *
 * 【舞台怎么摆】
 *   舞台 2:1（宽 : 高）。世界组是舞台**一半宽**的正方形（w-1/2），
 *   居中放在舞台里 —— 它就是「托盘」那一块。
 *   盖板绕左边铰链翻 180° 之后落在托盘左侧，两块并排 = 舞台整宽。
 *   打开态要把世界组往右挪半格（worldShift: 0% → 50%），
 *   整套展开才落在舞台正中；闭合态不挪，盒子居中。
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
/* 相机                                                                        */
/* -------------------------------------------------------------------------- */

/*
 * 固定倾角（度）—— 只绕**竖直轴**，所以俯仰恒为 0，
 * 打开、闭合时 CD 永远在同一条水平线上。
 * 比 v2.26 更收一点（-10° → -6°）：少一些畸变，
 * 盒子的厚度交给「塑料口沿 + 倒角高光」交代，不靠透视硬拗。
 */
const TABLE_YAW = -6;

/* 视距（px）—— 视距越长，透视越弱，方盒子越不会被压成梯形。 */
const PERSPECTIVE = 2400;

/* -------------------------------------------------------------------------- */
/* 转动手感：灵敏度 + 惯性阻尼                                                  */
/* -------------------------------------------------------------------------- */

/* 整盒转动的灵敏度（度 / 像素）。0.42 ≈ 抓着盒子边缘转。 */
const YAW_PER_PX = 0.42;

/* 碟面自转的灵敏度（度 / 像素），比整盒快一点。 */
const SPIN_PER_PX = 0.8;

/* 惯性速度上限（度 / 秒）—— 甩得太快时不让它变成陀螺。 */
const MAX_VEL = 720;

/*
 * 自适应阻尼（1 / 秒）：
 *   甩得快的时候阻尼强（快快收住，别像陀螺一样转不停）；
 *   慢下来以后阻尼弱（长尾滑行，慢慢减速停）。
 * 速度在 [0, 160] deg/s 之间线性插值。
 */
const DAMP_FAST = 3.4;
const DAMP_SLOW = 1.35;

/* 速度低于这个值（度 / 秒）就交给「末段收尾」。 */
const HANDOFF_VEL = 26;

/* 末段收尾时长（秒）：用 smoothstep 把速度平滑地收到 0。 */
const SETTLE_TIME = 0.55;

/* -------------------------------------------------------------------------- */
/* 开合缓动                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * quint 缓出：cubic-bezier(0.22, 1, 0.36, 1)。
 * 开头的速度很快（像铰链被推开），尾巴极长（最后 40% 的时间只走 4% 的距离），
 * 所以看起来是「顺滑地摊开」，不是「弹一下就停」。
 * 盖板角度、世界组位移、影子宽度、碟子位移全部用这一条曲线、同一个时钟。
 */
const OPEN_EASE = {
  duration: 0.72,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

/* 摆正（打开时把转角归到最近的整圈）—— 比开合稍慢一点，像被手扶正。 */
const ALIGN_EASE = {
  duration: 0.92,
  ease: [0.32, 0, 0.14, 1] as [number, number, number, number],
};

/* -------------------------------------------------------------------------- */
/* 手感：速度平滑 + 惯性推进                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 瞬时速度 → 平滑速度（指数滑动平均）。
 *
 * 单个 pointermove 的瞬时速度噪声很大：手指停顿一下再动，
 * dt 突然变大、瞬时速度掉到很低，紧接着又冲上来。
 * 直接拿瞬时值当初速度，松手时的惯性会跟着抖。
 * 取最近几帧的加权平均，初速度才稳。
 * 指针停了超过 0.12s 说明这是一次全新的起手 —— 旧值直接丢掉。
 */
function blendVel(prev: number, inst: number, dt: number): number {
  const clamped = Math.max(-MAX_VEL, Math.min(MAX_VEL, inst));
  if (dt > 0.12) return clamped;
  return Math.max(-MAX_VEL, Math.min(MAX_VEL, prev * 0.7 + clamped * 0.3));
}

/** 一路惯性通道的状态机 */
type InertiaChannel = {
  phase: "glide" | "settle";
  settleV: number;
  settleT: number;
};

/**
 * 推进一路惯性（输入：度 / 秒；输出：这一帧的角度增量）。
 *
 * ① **滑行段**：阻尼随速度自适应 ——
 *    甩得快阻尼强（别转成陀螺），慢下来阻尼弱（长尾滑行，慢慢减速）。
 *    v2.26 是单一指数阻尼（λ=4.2），快甩和慢推用同一个阻尼，
 *    结果是「慢慢推一下几乎立刻停住」—— 手感生硬。
 *
 * ② **收尾段**：速度低到 HANDOFF_VEL 以下时，用 smoothstep 把速度**平滑地**收到 0。
 *    smoothstep 两端导数都是 0，所以速度是连续归零的 ——
 *    松手之后绝不戛然而止，而是像有摩擦力的转盘一样慢慢停。
 */
function advanceInertia(
  v: number,
  dt: number,
  st: InertiaChannel,
  apply: (delta: number) => void,
): number {
  if (Math.abs(v) <= 0.4) return 0;
  if (st.phase === "glide") {
    const speed = Math.abs(v);
    /* 阻尼随速度自适应：160 deg/s 以内从慢阻尼线性过渡到快阻尼 */
    const lam = DAMP_SLOW + (DAMP_FAST - DAMP_SLOW) * Math.min(1, speed / 160);
    const nv = v * Math.exp(-lam * dt);
    apply(nv * dt);
    if (Math.abs(nv) <= HANDOFF_VEL) {
      st.phase = "settle";
      st.settleV = nv;
      st.settleT = 0;
    }
    return nv;
  }
  st.settleT += dt;
  const u = Math.min(1, st.settleT / SETTLE_TIME);
  const s = u * u * (3 - 2 * u); /* smoothstep */
  const nv = st.settleV * (1 - s);
  apply(nv * dt);
  return u >= 1 ? 0 : nv;
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
 * 托盘专用的**反光**。
 *
 * 盖板上压着白纸衬，0.32 不透明度的面光源打上去是一条清清楚楚的白条；
 * 托盘上压着的是彩色印刷纸板，同样的强度会把画面洗白 ——
 * 所以托盘用略低一档的版本，但**过渡带更窄**：
 * 边缘越锐，越读成「一道反光」；边缘越软，越读成「一层雾」。
 * v2.27 第一版把强度砍到 0.18，结果右半边完全不像塑料 —— 就是这个教训。
 */
const SOFTBOX_TRAY =
  "linear-gradient(118deg," +
  "rgba(255,255,255,0) 31.6%," +
  "rgba(255,255,255,0.05) 32.3%," +
  "rgba(255,255,255,0.15) 32.9%," +
  "rgba(255,255,255,0.30) 33.5%," +
  "rgba(255,255,255,0.10) 34.2%," +
  "rgba(255,255,255,0.02) 35.0%," +
  "rgba(255,255,255,0) 36.2%)";

const STRIP_TRAY =
  "linear-gradient(118deg," +
  "rgba(255,255,255,0) 60.7%," +
  "rgba(255,255,255,0.24) 62.1%," +
  "rgba(255,255,255,0.06) 63.4%," +
  "rgba(255,255,255,0) 65.4%)";

/*
 * 托盘的塑料壳（v2.27 新增）。
 *
 * v2.26 的漏洞在哪儿：展开态右边那块是**托盘**，可它几乎就是一张裸的印刷纸板 ——
 * 塑料只露出 3.5% 的一圈边，主体全是纸。
 * 左边那块（盖板）有整套 PlasticShell 的反光，右边什么都没有，
 * 用户一眼就看出来了：「右边是空的，没有材质」。
 *
 * 这一层把托盘补成一只真正的透明塑料托盘：
 *   · 霜面（极淡的一层白，把印刷面往塑料那边拉）
 *   · 宽面光源反光 + 条形灯（和盖板同一套光位，两边质感是一路的）
 *   · 模具口沿：真宝石盒四周压出来的那圈台阶（内亮外暗，交代厚度）
 *   · 四边锐利高光 + 色散（ior）
 *   · 磨砂颗粒
 *
 * ⚠ 全部是渐变 / 阴影，**一个 blur 都没有**。
 * 盒子一转这整棵子树就要重新光栅，这一层必须保持便宜。
 */
function TrayShell() {
  return (
    <>
      {/*
        霜面：一层极淡的白。
        真宝石盒的托盘内壁也是有一层「雾」的 —— 它把印刷面和塑料之间
        那点距离感补上了。没有它，印刷面读起来像直接贴在屏幕上。
      */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: "rgba(255,255,255,0.07)" }}
      />
      {/* 面光源在壳面中部的宽反射 */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: SOFTBOX_TRAY }}
      />
      {/* 条形灯 */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: STRIP_TRAY }}
      />
      {/* 磨砂颗粒 */}
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{ backgroundImage: GRAIN, backgroundSize: "140px 140px" }}
      />
      {/*
        模具口沿：托盘四周压出来的那圈台阶。
        上/左受光（一条亮边），下/右背光（一条暗边）—— 这一圈是「塑料托盘」
        最强的识别特征：有它，纸板才被读成「插在壳里的纸」，而不是一张贴图。
      */}
      <span
        className="pointer-events-none absolute inset-[3.2%] rounded-[3px]"
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.92)," +
            "inset 1px 0 0 rgba(255,255,255,0.58)," +
            "inset 0 -1px 0 rgba(28,35,41,0.40)," +
            "inset -1px 0 0 rgba(28,35,41,0.24)," +
            "inset 0 0 0 1px rgba(178,216,236,0.12)",
        }}
      />
      {/* 四边锐利高光：交代亚克力的厚度 */}
      <span
        className="pointer-events-none absolute inset-0 rounded-[5px]"
        style={{
          /*
           * 色散环压得很淡（0.10 / 0.12）：
           * 托盘底下是浅色印刷面，青蓝色描边稍微一重就读成「UI 选框」了，
           * 不像塑料。盖板那边是 0.14，但压在白纸衬上就看不出色。
           */
          boxShadow:
            "inset 0 0 0 2px rgba(178,216,236,0.10)," +
            "inset 0 0 0 1px rgba(255,255,255,0.30)," +
            "inset 0 1px 0 rgba(255,255,255,0.88)," +
            "inset 1px 0 0 rgba(255,255,255,0.38)," +
            "inset 0 -1px 0 rgba(28,35,41,0.30)," +
            "inset -1px 0 0 rgba(28,35,41,0.20)",
        }}
      />
    </>
  );
}

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
      {/*
        磨砂颗粒（roughness 很低，所以很淡）。
        v2.27：去掉 mix-blend-overlay —— 混合模式会在每次重新光栅时
        多跑一条混合通道，而 0.03 的不透明度本来也看不出差别。
      */}
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
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
      /*
       * v2.27：内缩 3.5% → 4.6%。
       * 纸板要塞进托盘的口沿里，留出来的那一圈才是**透明塑料**；
       * 内缩太小，塑料只剩一条几乎看不见的边 —— 托盘就读成了一张裸纸板。
       */
      className="absolute inset-[4.6%] overflow-hidden rounded-[1px]"
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
      {/*
        光碟落在纸板上的影：悬空才有影。

        v2.27：原来这里是 `box-shadow` + `filter: blur(11px)`。
        盒子一转，整棵 3D 子树要重新光栅，这个 11px 模糊就得**每帧重算一遍**
        —— 它是整棵子树里最贵的一笔（实测主线程不忙、忙的全在光栅）。
        换成自带柔边的径向渐变：本来这个影就是一团柔和的暗，
        真模糊和渐变柔边在视觉上几乎无差别，但成本从「每帧一次 11px 模糊」
        降到「一次渐变绘制」。
      */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          /* v2.26：碟子移到托盘正中（50%），影也跟着对齐 */
          left: "50%",
          top: "51.5%",
          width: "57%",
          aspectRatio: "1 / 1",
          transform: "translate(-50%,-50%)",
          background:
            "radial-gradient(circle at 50% 54%," +
            "rgba(28,35,41,0.19) 0%," +
            "rgba(28,35,41,0.13) 42%," +
            "rgba(28,35,41,0.05) 64%," +
            "rgba(28,35,41,0) 80%)",
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
   * v2.27：亚克力折射用的 SVG 置换滤镜（refractId）整段删掉了 ——
   * 它挂在「幽灵地板」的 backdrop-filter 上，是整棵子树里最贵的一笔，
   * 而那块地板九成被印刷纸板盖住，根本看不见。
   * 详细理由见 JSX 里「幽灵地板」那段注释。
   */

  /*
   * 脊背折边上的油墨：按纸的明度自动选深/浅（真盒上就是印在纸上的油墨，不是贴在壳上的白字）
   */
  const spineLight = isLightPaper(item.base);
  const spineInk = spineLight ? "#1C2329" : "#FFFFFF";
  const spineInkLift = spineLight
    ? "0 1px 0 rgba(255,255,255,0.45)"
    : "0 1px 0 rgba(0,0,0,0.38)";

  /* ================================================================== */
  /* v2.27：所有会动的量都搬进 MotionValue —— 热路径里一个 CSS 变量都没有  */
  /* ================================================================== */

  /*
   * 为什么不再用 CSS 变量驱动？
   *   v2.26 的 `--case-world-shift` / `--case-lid-angle` 挂在**根节点**上，
   *   而 CSS 自定义属性是**继承**的：根节点每改一次，整棵子树的样式都要重算。
   *   开合那 0.72s 里根节点每帧都在变 → 每帧全子树 style recalc。
   *   拖拽时 transform 串里还写着 var(...)，浏览器每次也得去解析继承链。
   * 现在全部走 MotionValue：改的是**元素自己的 transform**，
   * 谁动谁重算，动谁谁更新 —— 别的元素一点样式都不碰。
   */

  /* ---- 整盒绕竖直轴的转角（度）：拖拽 + 惯性 + 摆正都写进这一个 motion value ---- */
  const yaw = useMotionValue(0);
  /* ---- 碟子绕自己法线的自转角（度） ---- */
  const discSpin = useMotionValue(0);
  /* ---- 盖板铰链转角（度）：0 = 合上，-180 = 摊平 ---- */
  const lidAngle = useMotionValue(0);
  /* ---- 盖板离地板的高度（px）---- */
  const lidZ = useMotionValue(24);
  /* ---- 世界组横向位移（%，相对自身宽度）：展开后往右挪半格 ---- */
  const worldShift = useMotionValue(0);
  /* ---- 地影横向铺开的倍数 ---- */
  const shadowSpan = useMotionValue(1);
  /* ---- 碟子被推出去的位移（px）---- */
  const discX = useMotionValue(0);
  /* ---- 碟子被拨动的转角（度）---- */
  const discRot = useMotionValue(0);

  /*
   * 世界组的 transform 串：
   *   translateX(shift%)  展开后把「盖板 + 托盘」挪到舞台正中
   *   rotateY(yaw)        拖拽转动的角度（**竖直轴**）
   *   rotateY(TABLE_YAW)  固定的小倾角（同样只绕竖直轴 → 俯仰恒为 0）
   *
   * 整串写成一个 MotionValue：拖拽时直接改 DOM，不触发 React 重渲染 → 最跟手。
   * 百分比是相对**元素自身**的宽度：世界组宽 = 舞台一半，
   * 所以 shift=50% 正好把展开的两块推到舞台正中。
   */
  const worldTransform = useTransform(
    [yaw, worldShift],
    ([y, s]: number[]) =>
      `translateX(${s.toFixed(3)}%) rotateY(${y.toFixed(3)}deg) rotateY(${TABLE_YAW}deg)`,
  );

  /* 盖板：铰链钉在左边缘，转角 + 离地高度一起走 */
  const lidTransform = useTransform(
    [lidAngle, lidZ],
    ([a, z]: number[]) =>
      `translateZ(${z.toFixed(2)}px) rotateY(${a.toFixed(3)}deg)`,
  );

  /* 碟组：绕法线自转 + 开合时被轻轻推出去一点 */
  const discTransform = useTransform(
    [discSpin, discX, discRot],
    ([s, x, r]: number[]) =>
      [
        "translate(-50%,-50%)",
        `translateX(${x.toFixed(2)}px)`,
        "translateZ(13px)",
        `rotateZ(${s.toFixed(2)}deg)`,
        `rotate(${r.toFixed(2)}deg)`,
      ].join(" "),
  );

  /* 地影：跟着开合摊开成两格宽 */
  const shadowTransform = useTransform(shadowSpan, (v) => `scaleX(${v.toFixed(3)})`);

  /* ================================================================== */
  /* 开合：盖板角度 / 世界组位移 / 地影宽度 / 碟子位移 —— 同一口钟          */
  /* ================================================================== */

  /*
   * 四条曲线用同一条 cubic-bezier、同一个时钟 → 盖板摊开的同时，
   * 世界组往右挪半格、地影铺开、碟子被推出去 —— 读起来是**一个动作**，
   * 不是四个各跑各的。
   */
  const openAnims = useRef<{ stop: () => void }[]>([]);

  useEffect(() => {
    openAnims.current = [
      animate(lidAngle, open ? -180 : 0, OPEN_EASE),
      animate(lidZ, open ? 20 : 24, OPEN_EASE),
      animate(worldShift, open ? 50 : 0, OPEN_EASE),
      animate(shadowSpan, open ? 2 : 1, OPEN_EASE),
      animate(discX, open ? 8 : 0, OPEN_EASE),
      animate(discRot, open ? 3 : 0, OPEN_EASE),
    ];
    /*
     * 打开时**顺手把转角摆正**：归到最近的整圈，正面正对镜头。
     * 这是 v2.27 解决「打开状态角度生硬且变形」的关键 ——
     * 以前用户拖到哪儿，盒子就歪在哪儿打开。
     * 归到最近的整圈，最多转 180°，不会突兀地甩一整圈。
     */
    if (open) {
      const current = yaw.get();
      const target = Math.round(current / 360) * 360;
      if (Math.abs(target - current) > 0.5) {
        openAnims.current.push(animate(yaw, target, ALIGN_EASE));
      }
    }
    return () => {
      openAnims.current.forEach((a) => a.stop());
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [open]);

  const drag = useRef<{
    mode: "world" | "disc";
    zone: "lid" | "disc" | "case" | "other";
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastT: number;
    moved: boolean;
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
  const clickZone = useRef<"lid" | "disc" | "case" | "other" | null>(null);

  /* ---- 惯性：松手之后带着速度继续转，越转越慢地停 ---- */
  const vel = useRef({ yaw: 0, spin: 0 });
  const inertiaFrame = useRef(0);

  const stopInertia = () => {
    if (inertiaFrame.current) {
      cancelAnimationFrame(inertiaFrame.current);
      inertiaFrame.current = 0;
    }
  };

  const startInertia = () => {
    stopInertia();
    /* 慢得可以忽略就不必再转了 */
    if (Math.abs(vel.current.yaw) < 6 && Math.abs(vel.current.spin) < 6) return;

    /* 每一路（整盒 / 碟子）各自的状态机：滑行 → 收尾 */
    const ch: { yaw: InertiaChannel; spin: InertiaChannel } = {
      yaw: { phase: "glide", settleV: 0, settleT: 0 },
      spin: { phase: "glide", settleV: 0, settleT: 0 },
    };
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.032, Math.max(0.004, (t - last) / 1000));
      last = t;
      vel.current.yaw = advanceInertia(vel.current.yaw, dt, ch.yaw, (d) =>
        yaw.set(yaw.get() + d),
      );
      vel.current.spin = advanceInertia(vel.current.spin, dt, ch.spin, (d) =>
        discSpin.set(discSpin.get() + d),
      );
      const alive = Math.abs(vel.current.yaw) > 0 || Math.abs(vel.current.spin) > 0;
      inertiaFrame.current = alive ? requestAnimationFrame(step) : 0;
    };
    inertiaFrame.current = requestAnimationFrame(step);
  };

  /* 组件卸载时把惯性停下来，别让 rAF 悬着 */
  useEffect(() => () => stopInertia(), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    /* 拖到碟上 = 转碟；拖到别处 = 整盒绕竖直轴转 */
    const onDisc = !!target.closest('[data-testid="cdcase-disc-group"]');
    const onLid = !!target.closest('[data-testid="cdcase-lid"]');
    const inCase = !!target.closest('[data-testid="cdcase-world"]');
    const zone = onDisc ? "disc" : onLid ? "lid" : inCase ? "case" : "other";
    clickZone.current = zone;
    /*
     * 每次按下都把「这是拖拽不是点击」这个标记清掉。
     *
     * v2.26 修的坑：拖拽如果在盒子外面松手，click 事件会被派发到别的元素上，
     * 根本到不了根节点 —— suppressClick 就一直挂着 true，
     * 接下来用户正常点一下盖板也会被当成「拖拽的余波」给吞掉。
     * 改成在 pointerdown 统一复位，就不会再误吞。
     */
    suppressClick.current = false;
    /* 别让上一段惯性跟手指打架 */
    stopInertia();
    vel.current.yaw = 0;
    vel.current.spin = 0;
    /*
     * 也别让开合 / 摆正动画跟手指打架 ——
     * 尤其是「摆正」那一条，它动的正是 yaw。
     */
    openAnims.current.forEach((a) => a.stop());
    drag.current = {
      /*
       * 闭合时光盘藏在盖板后面 —— 拖它既看不见也没意义，
       * 改成转整只盒子；打开后碟子露在外面，才轮到它自己转。
       */
      mode: onDisc && open ? "disc" : "world",
      zone,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      /* 事件时间戳和 performance.now() 同一个时钟原点，混用不会错位 */
      lastT: e.timeStamp > 0 ? e.timeStamp : performance.now(),
      moved: false,
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

    /*
     * 高频指针设备（120Hz 触控板 / 240Hz 鼠标）上，浏览器会把一帧里的
     * 多个移动**合并**成一次 pointermove 派发，中间位置装在 coalesced 列表里。
     * 只取 e.clientX 就等于丢掉了中间轨迹 —— 盒子会「一跳一跳」地转，不跟手。
     * 把合并出来的采样点全都用上，轨迹才是连续的。
     */
    const coalesced =
      typeof e.nativeEvent.getCoalescedEvents === "function"
        ? e.nativeEvent.getCoalescedEvents()
        : [];
    const pts =
      coalesced.length > 1
        ? coalesced.map((ev) => ({
            x: ev.clientX,
            y: ev.clientY,
            t: ev.timeStamp > 0 ? ev.timeStamp : performance.now(),
          }))
        : [
            {
              x: e.clientX,
              y: e.clientY,
              t: e.timeStamp > 0 ? e.timeStamp : performance.now(),
            },
          ];

    for (const p of pts) {
      const dx = p.x - d.lastX;
      const dy = p.y - d.lastY;
      /* dt 上限 0.1s：指针停顿很久之后的第一次移动，不该带出巨大的速度 */
      const dt = Math.min(0.1, Math.max(0.004, (p.t - d.lastT) / 1000));
      d.lastX = p.x;
      d.lastY = p.y;
      d.lastT = p.t;

      if (!d.moved && Math.abs(p.x - d.startX) + Math.abs(p.y - d.startY) > 6) {
        d.moved = true;
        suppressClick.current = true;
      }
      if (!d.moved) continue;

      if (d.mode === "disc") {
        /* 碟子绕自己的法线（碟面法线 = 局部 Z）自转，横向拖得多转得多 */
        const delta = dx * SPIN_PER_PX + dy * 0.25;
        discSpin.set(discSpin.get() + delta);
        vel.current.spin = blendVel(vel.current.spin, delta / dt, dt);
        continue;
      }

      /* 整盒：绕竖直轴左右转 —— 横向拖多少就转多少 */
      const delta = dx * YAW_PER_PX;
      yaw.set(yaw.get() + delta);
      vel.current.yaw = blendVel(vel.current.yaw, delta / dt, dt);
    }
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, withInertia: boolean) => {
    const d = drag.current;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* 同上 */
    }
    if (d && !d.moved) suppressClick.current = false;
    /* 松手 → 带着惯性继续转 */
    if (d && d.moved && withInertia) startInertia();
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
    /*
     * ⚠ 判定必须用 pointerdown 时记下的 zone，不能用 e.target：
     * 根节点上做了 setPointerCapture，click 事件的 target 会被**重定向到根节点**，
     * e.target.closest(...) 永远是根节点自己，什么都判不出来。
     */
    if (zone === "lid") {
      onToggle();
      return;
    }
    /*
     * 闭合态：整只盒子就是「封面」，点盒子上任何地方都该打开。
     *
     * v2.26 踩到的坑：盒子被转到 90° 上下之后，盖板在屏幕上只剩一条窄边，
     * 命中测试会先捞走更靠前的光盘 / 托盘 —— 这时候点「盖板」其实点的是别的东西，
     * 开合就失灵了。所以闭合态放宽：落在盒子里的点击一律开盒。
     */
    if (!open && (zone === "disc" || zone === "case")) onToggle();
  };

  return (
    <motion.div
      data-testid="cdcase-3d"
      /*
       * v2.26：舞台从方形改成 2:1 宽扁。
       * 展开后「盖板 + 托盘」是并排的两块，正好铺满这个宽度 —— 两块一样大，
       * 不会被舞台裁掉；闭合时只占中间一半，像一张居中的产品照。
       */
      className="relative mx-auto mt-6 aspect-[2/1] w-full max-w-[300px] sm:max-w-[600px]"
      style={
        {
          /*
           * v2.27：视距 1800px → 2400px。
           * 视距越长，透视越弱 —— 方盒子不会被压成梯形，
           * 盖板摊平时也不会被视锥切掉一角。
           * 「打开状态角度生硬且变形」这一条，主要就是这里的锅。
           */
          perspective: `${PERSPECTIVE}px`,
          /* 透视中心放在舞台正中（偏上 36% 那会让上下不对称） */
          perspectiveOrigin: "50% 50%",
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
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
      /* 开合判定在根节点（setPointerCapture 会把 click 重定向到这里） */
      onClick={onRootClick}
      /* 别让浏览器的原生拖拽/选中抢走指针 */
      onDragStart={(e) => e.preventDefault()}
      /*
       * v2.27：根节点**不再有 animate**。
       * 以前开合是「根节点上的两个 CSS 变量在动」——
       * 而 CSS 变量是继承的，根节点每帧改一次，整棵子树的样式都要重算。
       * 现在开合由 MotionValue 直接驱动各自的 transform（见上面的 useEffect），
       * 根节点一根手指都不用动。
       */
    >
      {/*
        ---------- 亚克力折射滤镜 ----------
        v2.27：整段删掉了。

        原来这里挂着一个 SVG 位移滤镜（feTurbulence + feDisplacementMap），
        给「幽灵地板」的 backdrop-filter 用 —— 做「光穿过亚克力被折弯」那点感觉。

        为什么必须删：
          · backdrop-filter 是**每帧重算**的：盒子一转，地板的投影四边形就变，
            背后的页面内容就得被重新采样、重新位移一次；
          · SVG 位移滤镜是最贵的一种 backdrop-filter（每像素都要做湍流采样）；
          · 而这块地板**九成被印刷纸板盖住** —— 用户根本看不见它。
        实测（CDP Performance.getMetrics）：拖拽时主线程只忙 4.5%，
        卡顿全在光栅 —— 贵的正是这些「每帧重算」的滤镜。

        亚克力的质感现在由 TrayShell（面光源 + 条形灯 + 模具口沿 + 边缘高光）
        和四周的 45° 倒角高光来交代 —— 全是静态渐变，零重算成本。
      */}

      {/*
        ---------- 地面阴影 ----------
        盒子里面已经空了（没有实心内页），影子就得跟着变轻 ——
        否则一团死黑的影会让里面看起来还垫着一块黑布。
        主光在**右上方**，影子往左下拖；四层都整体压淡。

        v2.26：这一层挂在世界组**外面**（光和桌子不动，盒子转），
        尺寸跟世界组一致（舞台的一半宽），摊开时用 scaleX 拉到两格宽，
        好让「盖板 + 托盘」整片都有影。

        v2.27 两处改动：
          ① 宽度改由 MotionValue 驱动（shadowTransform）——
             以前是根节点上的 --case-shadow-span，每帧改一次就要全子树重算样式；
          ② **五个 blur 滤镜全拆了**。
             这一层在开合那 0.72s 里是**在缩放**的：每缩放一帧，
             五个 blur 就各重算一遍（模糊结果跟着缩放走，没法只缓存一次）。
             而这五团影本来就是柔和的径向渐变，模糊只是把边缘摊得更软 ——
             把渐变的衰减调长，视觉几乎一样，成本从「五次模糊」降到「五次渐变」。
      */}
      <motion.div
        className="pointer-events-none absolute left-0 right-0 top-0 mx-auto aspect-square w-1/2 overflow-hidden"
        style={{
          transform: shadowTransform,
          transformOrigin: "center center",
        }}
      >
        {/* 软影：往左下拖出去 */}
        <div
          className="absolute left-[34%] top-[56%] h-[44%] w-[84%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 56% 44%," +
              "rgba(28,35,41,0.13) 0%," +
              "rgba(28,35,41,0.085) 34%," +
              "rgba(28,35,41,0.038) 58%," +
              "rgba(28,35,41,0.012) 76%," +
              "rgba(28,35,41,0) 92%)",
          }}
        />
        {/* 接触影：紧贴盒底 —— 空壳，只有很淡的一圈 */}
        <div
          className="absolute left-[48%] top-[52%] h-[24%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%," +
              "rgba(28,35,41,0.15) 0%," +
              "rgba(28,35,41,0.10) 40%," +
              "rgba(28,35,41,0.045) 66%," +
              "rgba(28,35,41,0.012) 82%," +
              "rgba(28,35,41,0) 94%)",
          }}
        />
        {/* 折射彩边：光穿过塑料后影子边缘泛冷光（朝光的一侧） */}
        <div
          className="absolute left-[46%] top-[47%] h-[26%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 68% 34%," +
              "rgba(126,186,224,0.26) 0%," +
              "rgba(126,186,224,0.12) 38%," +
              "rgba(126,186,224,0.03) 62%," +
              "rgba(126,186,224,0) 86%)",
            mixBlendMode: "screen",
          }}
        />
        {/* 折射彩边：另一侧一点点暖色，塑料边缘的色散 */}
        <div
          className="absolute left-[38%] top-[54%] h-[22%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 40% 62%," +
              "rgba(255,206,150,0.17) 0%," +
              "rgba(255,206,150,0.08) 36%," +
              "rgba(255,206,150,0.02) 62%," +
              "rgba(255,206,150,0) 88%)",
            mixBlendMode: "screen",
          }}
        />
        {/* 焦散：塑料边缘把光聚出来的一道亮线（不是死黑的影） */}
        <div
          className="absolute left-[44%] top-[50%] h-[9%] w-[56%] -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
          style={{
            background:
              "radial-gradient(ellipse at 62% 50%," +
              "rgba(255,255,255,0.30) 0%," +
              "rgba(255,255,255,0.14) 40%," +
              "rgba(255,255,255,0.04) 66%," +
              "rgba(255,255,255,0) 88%)",
            mixBlendMode: "screen",
          }}
        />
      </motion.div>

      {/*
        ---------- 幽灵地板（真折射层）—— v2.27 已删除 ----------
        原来这是一层扁平元素挂在有 perspective 的舞台下，用
        `backdrop-filter: url(#SVG 位移滤镜)` 做「光穿过亚克力被折弯」。

        删掉的理由见上面那段注释：一层 backdrop-filter 跟着盒子每帧重算，
        是整棵子树里最贵的一笔，而它九成被印刷纸板盖住 —— 看不见。
        亚克力的质感改由 TrayShell + 45° 倒角高光交代，零重算成本。
      */}

      {/* ================================================================== */}
      {/* ====================== 世界组 World Group ========================== */}
      {/* ================================================================== */}
      {/*
        v2.26：世界组是舞台**一半宽**的正方形（w-1/2），居中放在舞台里 ——
        它就是「托盘」那一块。盖板翻 180° 落在它左边，两块并排正好铺满舞台。
      */}
      <motion.div
        data-testid="cdcase-world"
        className="relative mx-auto aspect-square w-1/2"
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

          {/*
            ---------- 托盘的塑料壳（v2.27 新增）----------
            盖在纸板**上面**：面光源 + 条形灯 + 模具口沿 + 四边高光。
            这一层就是「托盘也是一只塑料壳」的交代 ——
            v2.26 右边那块只有纸板，和左边盖板一比就露馅了（用户说「右边是空的」）。
            z 压在纸板之上、碟子之下，所以反光会被碟子的影子打断，层次才对。
          */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ transform: "translateZ(1.1px)" }}
          >
            <TrayShell />
          </div>

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
        <motion.div
          data-testid="cdcase-disc-group"
          className="absolute"
          style={{
            /* v2.26：正视视角下碟子就该在托盘正中间（原来 60% 是斜视角的老位置） */
            left: "var(--case-disc-left, 50%)",
            top: "var(--case-disc-top, 52%)",
            width: "var(--case-disc-size, 54%)",
            aspectRatio: "1 / 1",
            transformStyle: "preserve-3d",
            /*
             * v2.27：位移（打开时把碟往右推一截）/ 自转 / 拨动的转角
             * 全部由 MotionValue 直写 transform。
             * 以前这些是 motion.div 上的 animate CSS 变量 ——
             * 变量挂在这一层，每帧改一次就要重算这层的子树样式。
             * 现在改的是自己的 transform，谁动谁更新。
             */
            transform: discTransform,
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
        </motion.div>

        {/* ================================================================= */}
        {/* ================== 前盖组 Front Cover Group ===================== */}
        {/* ================================================================= */}
        {/*
          最前层：透明盖板。
          旋转轴心（Pivot）钉在**左边缘的铰链**上（transform-origin: left center），
          再叠 rotateY(-180°) → 跟托盘平摊在同一张平面上，两块并排。
        */}
        <motion.button
          type="button"
          data-testid="cdcase-lid"
          aria-label={item.name}
          className="absolute inset-0 z-20 cursor-pointer rounded-[5px]"
          style={{
            transformStyle: "preserve-3d",
            /* ★ 铰链在左边缘 —— 平铺打开的轴心就钉在这儿 */
            transformOrigin: "left center",
            /*
             * v2.27：铰链转角 + 离地高度改由 MotionValue 直写。
             * 打开 = 绕左边缘的铰链转 180°，跟托盘完全平摊在同一张平面上；
             * 闭合 = 0°，盖板叠在托盘前面。
             * 打开时铰链落在托盘壁顶（z=20），合上时盖板叠在壁顶之上（z=24，
             * 盖板的 4px 厚度正好压住壁顶）。
             *
             * 以前这里是 motion.button 的 animate CSS 变量 ——
             * 变量挂在这一层，每帧改一次就要重算这层整棵子树的样式。
             */
            transform: lidTransform,
          }}
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
                  /*
                   * v2.26：正视平铺时盖板内侧是半幅画面，封面太淡会读成一张白纸。
                   * 18% → 32%：白纸衬还在，但封面的字与图都认得出来。
                   */
                  className="absolute inset-0 h-full w-full object-cover opacity-32"
                />
              </div>
              {/* 纸纹（v2.27：去掉 mix-blend-multiply —— 混合模式每帧多跑一条通道） */}
              <span
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
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
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
