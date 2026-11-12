"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  OrbitControls,
  RoundedBox,
} from "@react-three/drei";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/* 本地内置摄影棚环境（RoomEnvironment：纯代码生成，零网络请求） */
function LocalStudioEnv() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    return () => {
      scene.environment = null;
      envTex.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/* ---------------------------------- */
/*  对外 Props：由 DIYStudio 的 state 驱动 */
/* ---------------------------------- */
export type LayerId =
  | "disc"
  | "front"
  | "innerLeft"
  | "innerRight"
  | "spine"
  | "obi"
  | "back";

export type CD3DViewerProps = {
  discColor?: string; // 光盘底色（Hex，默认镭射银）
  discArt?: string | null; // 上传盘面图（blob URL）
  caseCover?: string | null; // 盒面封面图（blob URL，贴前盖内侧）
  caseTint?: string; // 外壳色调（亚克力着色）
  showObi?: boolean; // 腰封开关
  obiImage?: string | null; // 腰封图案（blob URL，优先于文字）
  obiText?: string; // 腰封文字（独立于脊背）
  obiBg?: string; // 腰封底色
  obiFg?: string; // 腰封文字色
  obiFontFamily?: string; // 腰封 Canvas 字体
  activeLayer?: LayerId; // 当前编辑层级（驱动高亮/虚化反馈）
  face?: "front" | "back"; // 正面 / 背面（盒组 180° 翻转）
  autoRotate?: boolean; // 自动旋转开关（默认关闭，用户可拖拽）
  viewMode?: "full" | "disc" | "case-only"; // 完整包装 / 独立光碟 / 仅看外壳
  innerLeftUrl?: string | null; // 左内页贴图（小册子插页，盒盖内侧）
  innerLeftPos?: { x: number; y: number }; // 与 2D 共享的取景偏移（±0.1）
  innerRightUrl?: string | null; // 右内页贴图（托盘底板，光盘之下）
  innerRightPos?: { x: number; y: number };
  backCoverUrl?: string | null; // 背面封面贴图
  backPos?: { x: number; y: number };
  isCaseOpen?: boolean; // 开盒状态：盒盖绕左缘铰链旋转 120°
  /* 侧边脊背（Spine） */
  spineText?: string; // 侧边文字
  spineImage?: string | null; // 侧边图片（优先于文字）
  spineBg?: string; // 侧边底色
  spineFg?: string; // 侧边文字色
  spineGlass?: boolean; // 透明磨砂玻璃脊背（底板半透明，文字贴图透明底）
  spineFontFamily?: string; // Canvas 文字字体（css font-family）
};

/* ---------------------------------- */
/*  镭射光盘材质（useMemo 缓存 + 释放） */
/* ---------------------------------- */
function useDiscMaterial(
  color: string,
  active: boolean,
  dimmed: boolean,
  solo: boolean
) {
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color,
        metalness: 1,
        roughness: 0.1,
        iridescence: 1, // 彩虹薄膜干涉反光
        iridescenceIOR: 1.5,
        envMapIntensity: active || solo ? 2.4 : dimmed ? 0.8 : 2, // 强环境反射 → 环形高光
        emissive: new THREE.Color(color),
        emissiveIntensity: active ? 0.25 : solo ? 0.18 : 0, // 选中层/独立模式微微发光
        transparent: dimmed,
        opacity: dimmed ? 0.55 : 1, // 编辑外壳时盘退后
        side: THREE.DoubleSide,
      }),
    [color, active, dimmed, solo]
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

/* ---------------------------------- */
/*  光盘：RingGeometry + 数据区银圈 + 透明孔 */
/* ---------------------------------- */
function Disc({
  color,
  art,
  active,
  dimmed,
  solo,
}: {
  color: string;
  art?: string | null;
  active: boolean;
  dimmed: boolean;
  solo: boolean;
}) {
  const material = useDiscMaterial(color, active, dimmed, solo);
  const dataRingMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#d8d8dc",
        metalness: 1,
        roughness: 0.15,
        iridescence: 0.6,
        iridescenceIOR: 1.5,
        envMapIntensity: active || solo ? 2 : dimmed ? 0.7 : 1.4,
        transparent: dimmed,
        opacity: dimmed ? 0.55 : 1,
        side: THREE.DoubleSide,
      }),
    [active, dimmed, solo]
  );
  useEffect(() => () => dataRingMaterial.dispose(), [dataRingMaterial]);

  return (
    /* 光盘整体放大 8%：与 2D 视图的视觉占比对齐（仍在盒内，余量充足） */
    <group scale={1.08}>
      {/* 光盘本体：圆环几何体，中央真实镂空 */}
      <mesh material={material}>
        <ringGeometry args={[0.22, 1.05, 96]} />
      </mesh>
      {/* 数据区银圈（内圈，略凸起） */}
      <mesh material={dataRingMaterial} position={[0, 0, 0.0015]}>
        <ringGeometry args={[0.34, 0.52, 96]} />
      </mesh>
      {/* 盘面贴图（可选，覆盖盘面） */}
      {art && <DiscArtRing url={art} dimmed={dimmed} />}
      {/* 中心卡扣：黑色细环 */}
      <mesh position={[0, 0, 0.002]}>
        <ringGeometry args={[0.14, 0.22, 48]} />
        <meshStandardMaterial
          color="#111114"
          metalness={0.6}
          roughness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* 中心孔保持透明：可看到下方托盘的中轴 */}
    </group>
  );
}

/* 盘面纹理环（Suspense 内加载） */
function DiscArtRing({ url, dimmed }: { url: string; dimmed: boolean }) {
  const texture = useLoader(THREE.TextureLoader, url);
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
  }, [texture]);
  return (
    <mesh position={[0, 0, 0.003]}>
      <ringGeometry args={[0.24, 1.02, 96]} />
      <meshStandardMaterial
        map={texture}
        metalness={0.5}
        roughness={0.35}
        transparent
        opacity={dimmed ? 0.4 : 0.92}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ---------------------------------- */
/*  内部托盘：深色塑料底托 + 中心转轴    */
/* ---------------------------------- */
function Tray() {
  return (
    <group position={[0, 0, -0.06]}>
      {/* 托盘底 */}
      <mesh>
        <circleGeometry args={[1.1, 96]} />
        <meshStandardMaterial color="#1a1a1e" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* 托盘外缘凹槽 */}
      <mesh position={[0, 0, 0.005]}>
        <ringGeometry args={[1.06, 1.1, 96]} />
        <meshStandardMaterial color="#0e0e11" roughness={0.7} />
      </mesh>
      {/* 中心转轴（卡光盘圆孔的塑料轴） */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.03]}>
        <cylinderGeometry args={[0.1, 0.12, 0.08, 48]} />
        <meshStandardMaterial color="#2c2c31" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

/* ---------------------------------- */
/*  透明亚克力外壳 + 边缘结构            */
/*  稳定方案：不用 transmission 折射，    */
/*  改用低透明度 + clearcoat 清漆反光，   */
/*  depthWrite: false 杜绝与光盘穿模     */
/* ---------------------------------- */
function useCaseMaterial(tint: string, active: boolean, dimmed: boolean) {
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: tint, // 亚克力着色（Clear/Smoke/Ice…）
        metalness: 0.8,
        roughness: 0.1,
        transparent: true,
        opacity: dimmed ? 0.1 : 0.22, // 编辑内部层时外壳进一步隐去
        clearcoat: 0.7, // 清漆层反光 → 塑料高光
        clearcoatRoughness: 0.15,
        envMapIntensity: active ? 1.6 : 1.1,
        depthWrite: false, // 关键：外壳不写深度，永不遮挡光盘
        side: THREE.DoubleSide,
      }),
    [tint, active, dimmed]
  );
  useEffect(() => () => material.dispose(), [material]);
  return material;
}

/* 盒盖铰链：轴心在左缘，开盒绕 Y 轴阻尼旋转 ~120° */
function LidPivot({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const target = open ? -Math.PI * 0.66 : 0;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, target, 5, delta);
  });
  return <group ref={ref}>{children}</group>;
}

function JewelCase({
  tint,
  active,
  dimmed,
  open,
  lidChildren,
}: {
  tint: string;
  active: boolean;
  dimmed: boolean;
  open: boolean;
  lidChildren?: React.ReactNode; // 随盖开合的内容：封面卡 / 内页
}) {
  const material = useCaseMaterial(tint, active, dimmed);
  return (
    /* 外壳整体放大 4%：与光盘之间留出真实物理间隙 */
    <group scale={1.04}>
      {/* ===== 底盒 Base：背板 + 背缘框 + 铰链（固定不动） ===== */}
      <group>
        {/* 底板（盒体后 2/3 厚度） */}
        <RoundedBox
          args={[2.4, 2.4, 0.23]}
          radius={0.04}
          smoothness={8}
          material={material}
          renderOrder={2}
          position={[0, 0, -0.0575]}
        />
        {/* 背缘框 */}
        {[
          { pos: [0, 1.17, -0.13] as const, size: [2.3, 0.06, 0.05] as const },
          { pos: [0, -1.17, -0.13] as const, size: [2.3, 0.06, 0.05] as const },
          { pos: [1.17, 0, -0.13] as const, size: [0.06, 2.3, 0.05] as const },
          { pos: [-1.17, 0, -0.13] as const, size: [0.06, 2.3, 0.05] as const },
        ].map((e, i) => (
          <mesh key={i} position={[...e.pos]} material={material} renderOrder={2}>
            <boxGeometry args={[...e.size]} />
          </mesh>
        ))}
        {/* 左侧铰链（三段式，固定在底盒上；与书脊同侧） */}
        {[-0.75, 0, 0.75].map((y) => (
          <mesh
            key={y}
            position={[-1.22, y, 0]}
            material={material}
            renderOrder={2}
          >
            <boxGeometry args={[0.09, 0.32, 0.3]} />
          </mesh>
        ))}
      </group>
      {/* ===== 盒盖 Lid：铰链轴心在左缘 x=-1.2，开盒向左翻转 120° =====
          （真实 CD 盒布局，与 2D 一致：左页 = 盒盖内侧小册子，右页 = 托盘底板） */}
      <group position={[-1.2, 0, 0]}>
        <LidPivot open={open}>
          <group position={[1.2, 0, 0]}>
            {/* 前盖板（盒体前 1/3 厚度） */}
            <RoundedBox
              args={[2.4, 2.4, 0.12]}
              radius={0.04}
              smoothness={8}
              material={material}
              renderOrder={2}
              position={[0, 0, 0.115]}
            />
            {/* 前缘框 */}
            {[
              { pos: [0, 1.17, 0.17] as const, size: [2.3, 0.06, 0.05] as const },
              { pos: [0, -1.17, 0.17] as const, size: [2.3, 0.06, 0.05] as const },
              { pos: [1.17, 0, 0.17] as const, size: [0.06, 2.3, 0.05] as const },
              { pos: [-1.17, 0, 0.17] as const, size: [0.06, 2.3, 0.05] as const },
            ].map((e, i) => (
              <mesh
                key={i}
                position={[...e.pos]}
                material={material}
                renderOrder={2}
              >
                <boxGeometry args={[...e.size]} />
              </mesh>
            ))}
            {/* 右侧卡扣（随盖开合，位于铰链对侧的开合边） */}
            {[-0.55, 0.55].map((y) => (
              <mesh
                key={y}
                position={[1.22, y, 0]}
                material={material}
                renderOrder={2}
              >
                <boxGeometry args={[0.09, 0.16, 0.24]} />
              </mesh>
            ))}
            {lidChildren}
          </group>
        </LidPivot>
      </group>
    </group>
  );
}

/* ---------------------------------- */
/*  封面卡：贴在前盖内侧，透过透明盖可见  */
/* ---------------------------------- */
function CaseCover({
  url,
  dimmed,
  highlight = false,
}: {
  url: string;
  dimmed: boolean;
  highlight?: boolean;
}) {
  const texture = useLoader(THREE.TextureLoader, url);
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
  }, [texture]);
  return (
    <mesh position={[0, 0, 0.145]}>
      <planeGeometry args={[2.3, 2.3]} />
      <meshStandardMaterial
        map={texture}
        roughness={0.55}
        metalness={0}
        transparent
        opacity={dimmed ? 0.22 : 0.97} // 编辑盘面时封面隐去，盘清晰可见
        emissive="#ffffff"
        emissiveMap={texture}
        emissiveIntensity={highlight ? 0.16 : 0}
      />
    </mesh>
  );
}

/* ---------------------------------- */
/*  印刷内页贴图（inner / back 共用）：   */
/*  120% 放大 + offset 取景，与 2D 拖拽同步 */
/* ---------------------------------- */
function PrintInsertMesh({
  url,
  pos,
  size,
  z,
  mirrored = false, // 背面：透过盒底观看需水平镜像补偿
  highlight = false,
}: {
  url: string;
  pos: { x: number; y: number };
  size: number;
  z: number;
  mirrored?: boolean;
  highlight?: boolean;
}) {
  const texture = useLoader(THREE.TextureLoader, url);
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    /* 120% 放大：可视窗口 = 1/1.2；背面水平镜像 */
    texture.repeat.set(mirrored ? -1 / 1.2 : 1 / 1.2, 1 / 1.2);
    texture.wrapS = THREE.RepeatWrapping; // 镜像需要 repeat 包裹
  }, [texture, mirrored]);
  /* 2D 拖拽偏移 → UV offset（pos 单位 = 容器宽度的分数） */
  useMemo(() => {
    texture.offset.set(
      mirrored ? (1.1 - pos.x) / 1.2 : (0.1 - pos.x) / 1.2,
      (0.1 - pos.y) / 1.2
    );
  }, [texture, pos, mirrored]);
  return (
    <mesh position={[0, 0, z]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        map={texture}
        side={mirrored ? THREE.DoubleSide : THREE.FrontSide}
        roughness={0.75}
        metalness={0}
        emissive="#ffffff"
        emissiveMap={texture}
        emissiveIntensity={highlight ? 0.18 : 0}
      />
    </mesh>
  );
}

/* ---------------------------------- */
/*  腰封（Obi）：贴在正面的宽纸带         */
/*  宽约正面 1/4，文字/底色/字色独立于脊背 */
/* ---------------------------------- */
const OBI_W = 0.58; // ≈ 正面宽度 2.4 的 24%
const OBI_H = 2.3;

function useObiTextTexture(
  text: string,
  bg: string,
  fg: string,
  fontFamily: string,
  glass: boolean
) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    /* 透明底：保留透明通道，不铺底色 */
    if (!glass) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    /* 上下装饰细线 */
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(48, 44);
    ctx.lineTo(canvas.width - 48, 44);
    ctx.moveTo(48, canvas.height - 44);
    ctx.lineTo(canvas.width - 48, canvas.height - 44);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const label = text.trim();
    if (!label) {
      const blank = new THREE.CanvasTexture(canvas);
      blank.colorSpace = THREE.SRGBColorSpace;
      blank.anisotropy = 8;
      return blank;
    }

    /* 逐字竖排：每个字正立，沿 Y 轴向下依次绘制（与脊背同一套逻辑） */
    const chars = Array.from(label);
    const maxTextH = canvas.height - 170;

    let size = 96;
    let lineH = Math.round(size * 1.16);
    if (chars.length * lineH > maxTextH) {
      size = Math.max(24, Math.floor(maxTextH / (chars.length * 1.16)));
      lineH = Math.round(size * 1.16);
    }

    /* 宽字符横向超宽时再缩一档 */
    ctx.font = `600 ${size}px ${fontFamily}`;
    const maxTextW = canvas.width - 48;
    const widest = Math.max(
      ...chars.map((c) => ctx.measureText(c).width || 0)
    );
    if (widest > maxTextW) {
      size = Math.max(20, Math.floor(size * (maxTextW / widest)));
      lineH = Math.round(size * 1.16);
      ctx.font = `600 ${size}px ${fontFamily}`;
    }

    /* 超出上下边界则截断并补省略号 */
    const capacity = Math.max(1, Math.floor(maxTextH / lineH));
    const shown =
      chars.length > capacity
        ? [...chars.slice(0, Math.max(1, capacity - 1)), "…"]
        : chars;

    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const totalH = shown.length * lineH;
    let y = (canvas.height - totalH) / 2 + lineH / 2;
    for (const ch of shown) {
      ctx.fillText(ch, canvas.width / 2, y);
      y += lineH;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [text, bg, fg, fontFamily, glass]);

  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

function ObiStrip({
  image,
  text,
  bg,
  fg,
  fontFamily,
  active,
}: {
  image?: string | null;
  text: string;
  bg: string;
  fg: string;
  fontFamily: string;
  active: boolean;
}) {
  const glass = bg === "transparent";
  const texture = useObiTextTexture(text, bg, fg, fontFamily, glass);
  return (
    /* 位置：正面左侧（盒盖局部坐标），z 在前盖面 0.175 之上 */
    <mesh position={[-0.91, 0, 0.21]} scale={active ? 1.03 : 1} renderOrder={3}>
      <planeGeometry args={[OBI_W, OBI_H]} />
      {image ? (
        <ObiTexture url={image} active={active} />
      ) : (
        <meshStandardMaterial
          map={texture ?? undefined}
          transparent={glass}
          depthWrite={!glass}
          side={THREE.DoubleSide}
          roughness={0.92}
          metalness={0}
          emissive="#E65100"
          emissiveIntensity={active ? 0.15 : 0}
        />
      )}
    </mesh>
  );
}

function ObiTexture({ url, active }: { url: string; active: boolean }) {
  const texture = useLoader(THREE.TextureLoader, url);
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
  }, [texture]);
  return (
    <meshStandardMaterial
      map={texture}
      roughness={0.95}
      emissive="#E65100"
      emissiveIntensity={active ? 0.15 : 0}
    />
  );
}

/* ---------------------------------- */
/*  侧边脊背（Spine）：垂直于外壳的细长平面 */
/*  默认黑色/米白底色 + Canvas 文字贴图；     */
/*  上传图片时优先使用图片贴图。             */
/* ---------------------------------- */
const SPINE_TEXTURE_W = 256;
const SPINE_TEXTURE_H = 1536;

function useSpineTextTexture(
  text: string,
  bg: string,
  fg: string,
  fontFamily: string,
  glass: boolean
) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = SPINE_TEXTURE_W;
    canvas.height = SPINE_TEXTURE_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    /* 底色：透明磨砂时保留透明通道，由玻璃底板提供质感 */
    if (!glass) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    /* 上下细装饰线 */
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(28, 34);
    ctx.lineTo(canvas.width - 28, 34);
    ctx.moveTo(28, canvas.height - 34);
    ctx.lineTo(canvas.width - 28, canvas.height - 34);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const label = text.trim();
    if (!label) {
      const blank = new THREE.CanvasTexture(canvas);
      blank.colorSpace = THREE.SRGBColorSpace;
      blank.anisotropy = 8;
      return blank;
    }

    /* 逐字竖排：每个字正立，沿 Y 轴向下依次绘制（不旋转整块画布） */
    const chars = Array.from(label);
    const maxTextH = canvas.height - 170;

    let size = 88;
    let lineH = Math.round(size * 1.16);
    if (chars.length * lineH > maxTextH) {
      size = Math.max(22, Math.floor(maxTextH / (chars.length * 1.16)));
      lineH = Math.round(size * 1.16);
    }

    /* 宽字符（如英文 W）横向超宽时再缩一档 */
    ctx.font = `600 ${size}px ${fontFamily}`;
    const maxTextW = canvas.width - 44;
    const widest = Math.max(
      ...chars.map((c) => ctx.measureText(c).width || 0)
    );
    if (widest > maxTextW) {
      size = Math.max(18, Math.floor(size * (maxTextW / widest)));
      lineH = Math.round(size * 1.16);
      ctx.font = `600 ${size}px ${fontFamily}`;
    }

    /* 放不下则截断并加省略号 */
    const capacity = Math.max(1, Math.floor(maxTextH / lineH));
    const shown =
      chars.length > capacity
        ? [...chars.slice(0, Math.max(1, capacity - 1)), "…"]
        : chars;

    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const totalH = shown.length * lineH;
    let y = (canvas.height - totalH) / 2 + lineH / 2;
    for (const ch of shown) {
      ctx.fillText(ch, canvas.width / 2, y);
      y += lineH;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, [text, bg, fg, fontFamily, glass]);

  useEffect(() => () => texture?.dispose(), [texture]);
  return texture;
}

/* 脊背印刷平面的宽高比（宽 = 盒厚 0.35×0.96，高 = 盒高 2.4×0.97） */
const SPINE_LABEL_ASPECT = (0.35 * 0.96) / (2.4 * 0.97);

function SpineImageMaterial({
  url,
  active,
}: {
  url: string;
  active: boolean;
}) {
  const texture = useLoader(THREE.TextureLoader, url);
  useMemo(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    /* 与 2D 脊背的 object-cover 保持一致：按原图比例裁切，而不是拉伸变形 */
    const img = texture.image as { width?: number; height?: number } | undefined;
    const aspect = img?.width && img?.height ? img.width / img.height : 1;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    if (aspect > SPINE_LABEL_ASPECT) {
      const rx = SPINE_LABEL_ASPECT / aspect; // 图片更宽 → 裁掉左右
      texture.repeat.set(rx, 1);
      texture.offset.set((1 - rx) / 2, 0);
    } else {
      const ry = aspect / SPINE_LABEL_ASPECT; // 图片更高 → 裁掉上下
      texture.repeat.set(1, ry);
      texture.offset.set(0, (1 - ry) / 2);
    }
  }, [texture]);
  return (
    <meshStandardMaterial
      map={texture}
      roughness={0.7}
      metalness={0}
      side={THREE.DoubleSide}
      emissive="#ffffff"
      emissiveMap={texture}
      emissiveIntensity={active ? 0.16 : 0}
    />
  );
}

function SpineMesh({
  text,
  image,
  bg,
  fg,
  fontFamily,
  glass,
  active,
}: {
  text: string;
  image?: string | null;
  bg: string;
  fg: string;
  fontFamily: string;
  glass: boolean;
  active: boolean;
}) {
  const texture = useSpineTextTexture(text, bg, fg, fontFamily, glass);
  /* 盒体尺寸（与 JewelCase 完全一致，外层统一 1.04 缩放）
     横向 2.4 / 竖向 2.4 / 厚度 0.35 → 脊背 = 厚度 × 盒高 的窄竖面 */
  const CASE_W = 2.4;
  const CASE_H = 2.4;
  const CASE_D = 0.35;
  const EDGE_X = -CASE_W / 2; // 盒子最左缘 x = -1.2
  return (
    <group scale={1.04}>
      {/* ① 侧壁实体：位于最左缘，Z 居中于盒厚（-0.175 ~ +0.175），
            连接正面与背面，是盒子本身的侧面，不是正面封面 */}
      <mesh position={[EDGE_X + 0.016, 0, 0]} renderOrder={2}>
        <boxGeometry args={[0.032, CASE_H, CASE_D]} />
        <meshPhysicalMaterial
          color={glass ? "#F2EDE4" : bg}
          transparent={glass}
          opacity={glass ? 0.34 : 1}
          roughness={glass ? 0.4 : 0.7}
          metalness={0.04}
          clearcoat={glass ? 1 : 0}
          clearcoatRoughness={0.28}
          emissive="#ffffff"
          emissiveIntensity={active ? 0.14 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* ② 印刷层：紧贴侧壁外表面，法线朝 -X（绕 Y 轴 -90°），
            平面宽度 = 盒子厚度，高度 = 盒高 → 真正的侧面竖长条 */}
      <mesh
        position={[EDGE_X - 0.006, 0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        scale={active ? 1.02 : 1}
        renderOrder={4}
      >
        <planeGeometry args={[CASE_D * 0.96, CASE_H * 0.97]} />
        {image ? (
          <SpineImageMaterial url={image} active={active} />
        ) : (
          <meshStandardMaterial
            map={texture ?? undefined}
            transparent={glass}
            depthWrite={!glass}
            roughness={0.75}
            metalness={0}
            side={THREE.DoubleSide}
            emissive="#ffffff"
            emissiveMap={texture ?? undefined}
            emissiveIntensity={active ? 0.16 : 0}
          />
        )}
      </mesh>
    </group>
  );
}

/* ---------------------------------- */
/*  正/背面翻转组：阻尼插值平滑转 180°   */
/* ---------------------------------- */
/* ---------------------------------- */
/*  相机配合：开盒时缓慢拉远（zoom 插值， */
/*  不与 OrbitControls 的位置管理冲突）   */
/* ---------------------------------- */
function CameraRig({ open }: { open: boolean }) {
  const camera = useThree((s) => s.camera);
  useFrame((_, delta) => {
    const pc = camera as THREE.PerspectiveCamera;
    const target = open ? 0.82 : 1; // zoom < 1 = 视野拉远
    const z = THREE.MathUtils.damp(pc.zoom, target, 4, delta);
    if (Math.abs(z - pc.zoom) > 1e-4) {
      pc.zoom = z;
      pc.updateProjectionMatrix();
    }
  });
  return null;
}

const BASE_Y = 0; // 初始零旋转：正正方平对相机

function FlipGroup({
  face,
  focusTilt = 0,
  children,
}: {
  face: "front" | "back";
  focusTilt?: number; // 编辑侧边脊背时把盒体侧转，露出左侧窄面
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const targetY =
    (face === "back" ? BASE_Y + Math.PI : BASE_Y) + focusTilt;
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, targetY, 5, delta);
  });
  return (
    <group ref={ref} rotation={[0, BASE_Y, 0]} position={[0, 0, 0]}>
      {children}
    </group>
  );
}

/* ---------------------------------- */
/*  独立光碟模式：光盘组阻尼放大          */
/* ---------------------------------- */
function DiscSoloGroup({
  solo,
  children,
}: {
  solo: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const target = solo ? 1.35 : 1; // 独立模式放大填充视觉中心
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, target, 5, delta));
  });
  return <group ref={ref}>{children}</group>;
}

/* ---------------------------------- */
/*  3D 预览器主体                       */
/* ---------------------------------- */
export default function CD3DViewer({
  discColor = "#E0E0E0",
  discArt = null,
  caseCover = null,
  caseTint = "#ffffff",
  showObi = false,
  obiImage = null,
  obiText = "Hallo CD",
  obiBg = "#FAF6EE",
  obiFg = "#1C2329",
  obiFontFamily = 'Georgia, "Times New Roman", serif',
  activeLayer = "disc",
  face = "front",
  autoRotate = false,
  viewMode = "full",
  innerLeftUrl = null,
  innerLeftPos = { x: 0, y: 0 },
  innerRightUrl = null,
  innerRightPos = { x: 0, y: 0 },
  backCoverUrl = null,
  backPos = { x: 0, y: 0 },
  isCaseOpen = false,
  spineText = "Hallo CD",
  spineImage = null,
  spineBg = "#1C2329",
  spineFg = "#F8F4EC",
  spineGlass = false,
  spineFontFamily = "Georgia, serif",
}: CD3DViewerProps) {
  const solo = viewMode === "disc";
  const caseOnly = viewMode === "case-only"; // 仅看外壳：隐藏光盘，保留外壳/托盘/贴图
  const discActive = activeLayer === "disc";
  const caseActive = activeLayer === "front";
  const obiActive = activeLayer === "obi"; // 腰封是独立层级，不再与正面共用高亮
  const innerLeftActive = activeLayer === "innerLeft";
  const innerRightActive = activeLayer === "innerRight";
  const spineActive = activeLayer === "spine";
  const backActive = activeLayer === "back";

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 5.5], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent", touchAction: "none" }}
    >
      {/* 场景底色与页面米色一致：透射材质采样到暖白而非黑色 */}
      <color attach="background" args={["#F8F4EC"]} />

      {/* 基础光（即使环境贴图未就绪也保证材质有照明） */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 5]} intensity={1} />

      {/* 开盒时相机缓慢拉远，看清内侧排版 */}
      <CameraRig open={isCaseOpen} />
      <Suspense fallback={null}>
        {/* 室内摄影棚环境反射（本地生成） */}
        <LocalStudioEnv />

        {/* CD 盒组合：随 face 平滑翻转；编辑脊背时轻微侧转露出左侧窄面 */}
        <FlipGroup face={face} focusTilt={spineActive ? 0.34 : 0}>
          {/* 光盘：独立模式下阻尼放大、加发光；仅看外壳模式下不渲染 */}
          {!caseOnly && (
            <DiscSoloGroup solo={solo}>
              <Disc
                color={discColor}
                art={discArt}
                active={discActive}
                dimmed={!solo && caseActive}
                solo={solo}
              />
            </DiscSoloGroup>
          )}

          {/* 包装组件：独立光碟模式下整体隐藏（保留状态不卸载） */}
          <group visible={!solo}>
            <Tray />
            {/* 右内页：印在托盘底板之上（光盘之下），不遮挡转轴 */}
            {innerRightUrl && (
              <PrintInsertMesh
                url={innerRightUrl}
                pos={innerRightPos}
                size={2.24}
                z={-0.045}
                highlight={innerRightActive}
              />
            )}
            {/* 背面封面：印在盒底内侧，透过透明背盖可见（镜像补偿） */}
            {backCoverUrl && (
              <PrintInsertMesh
                url={backCoverUrl}
                pos={backPos}
                size={2.36}
                z={-0.176}
                mirrored
                highlight={backActive}
              />
            )}
            <JewelCase
              tint={caseTint}
              active={caseActive}
              dimmed={!caseActive}
              open={isCaseOpen}
              lidChildren={
                <>
                  {/* 封面卡：随盖开合 */}
                  {caseCover && (
                    <CaseCover
                      url={caseCover}
                      dimmed={discActive}
                      highlight={caseActive}
                    />
                  )}
                  {/* 盒盖内侧（小册子插页）：开盒时展示左内页 */}
                  {isCaseOpen && innerLeftUrl && (
                    <PrintInsertMesh
                      url={innerLeftUrl}
                      pos={innerLeftPos}
                      size={2.24}
                      z={0.05}
                      mirrored
                      highlight={innerLeftActive}
                    />
                  )}
                  {/* 腰封纸带：贴在正面左侧，随盒盖一起开合 */}
                  {showObi && (
                    <ObiStrip
                      image={obiImage}
                      text={obiText}
                      bg={obiBg}
                      fg={obiFg}
                      fontFamily={obiFontFamily}
                      active={obiActive}
                    />
                  )}
                </>
              }
            />
            {/* 侧边脊背：盒体最左侧的竖直平面 */}
            <SpineMesh
              text={spineText}
              image={spineImage}
              bg={spineBg}
              fg={spineFg}
              fontFamily={spineFontFamily}
              glass={spineGlass}
              active={spineActive}
            />
          </group>
        </FlipGroup>
      </Suspense>

      {/* 落地接触阴影 */}
      <ContactShadows
        position={[0, -1.55, 0]}
        opacity={0.25}
        scale={8}
        blur={2.6}
        far={3}
        color="#1C2329"
      />

      {/* 交互：拖拽旋转 + 缩放；自动旋转可控；禁用平移防拖出屏幕 */}
      <OrbitControls
        makeDefault
        target={[0, 0, 0]} // 直视模型中心
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={0.8}
        enablePan={false}
        enableZoom={true}
        minDistance={3}
        maxDistance={7}
        minPolarAngle={Math.PI * 0.25} // 限制俯仰：不飞到正上方
        maxPolarAngle={Math.PI * 0.65} // 不钻到地底
      />
    </Canvas>
  );
}
