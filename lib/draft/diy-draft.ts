/**
 * halloCD · DIY 草稿（浏览器侧）
 * ==================================================================
 * 做一张 CD 要花不少时间：调盘面颜色、写腰封、排脊背、传封面图。
 * 刷新一下页面、误点一下导航，这些活儿全白干了 —— 那是很难受的产品。
 *
 * 所以 v2.8 / G5 加了「草稿」。
 *
 * ------------------------------------------------------------------
 * 草稿里到底存什么？
 *
 * 标量（颜色 / 文字 / 字体 / 主题）→ **localStorage**
 *   · 纯 JSON，几 KB，随手就能写
 *   · 读起来是同步的，页面第一帧就能拿到 → 不会闪一下默认值再跳回草稿
 *
 * 图片（盘面图 / 外壳封面 / 内页 / 脊背 / 腰封 / 背面）→ **IndexedDB**
 *   · 图片是 blob: URL，**存进 localStorage 等于没存**（刷新后必然失效）
 *   · 但图片本体也不小，塞进 localStorage 会直接撑爆 5MB 配额
 *   · IndexedDB 专门存二进制，几十 MB 起步
 *
 * 为什么不做「上传到服务器再存 URL」：
 *   那会让「选一张图」立刻产生一次网络请求，而用户十有八九会再换一张。
 *   草稿是**本地草稿** —— 它的生命周期应该跟浏览器走，不是跟账号走。
 *
 * ------------------------------------------------------------------
 * 这个模块是**纯浏览器**的：不 import 任何服务端代码。
 * 服务端组件 import 它会炸（window 不存在）。
 */

export const DIY_DRAFT_STORAGE_KEY = "hallocd.draft.diy.v1";
export const DIY_DRAFT_VERSION = 1;

/** 草稿里的标量部分 —— 与 DIYStudio 的本地 state 一一对应 */
export type DiyDraftScalars = {
  discColor: string;
  caseTint: string;
  spineText: string;
  spineFont: string;
  spineTheme: string;
  spineTextColor: string;
  showObi: boolean;
  obiText: string;
  obiFont: string;
  obiTheme: string;
  obiTextColor: string;
};

/** 图片槽位的元信息（图片本体在 IndexedDB，这里只留「这个槽位有图」） */
export type DiyDraftImageMeta = {
  name: string;
  type: string;
  size: number;
};

export type DiyDraft = {
  version: number;
  savedAt: string;
  scalars: DiyDraftScalars;
  images: Record<string, DiyDraftImageMeta>;
};

/** DIYStudio 的出厂默认值 —— 草稿里缺哪个字段就补哪个 */
export const DEFAULT_DIY_SCALARS: DiyDraftScalars = {
  discColor: "#E0E0E0",
  caseTint: "#ffffff",
  spineText: "Hallo CD",
  spineFont: "serif",
  spineTheme: "glass",
  spineTextColor: "#1C2329",
  showObi: false,
  obiText: "Hallo CD",
  obiFont: "serif",
  obiTheme: "light",
  obiTextColor: "#1C2329",
};

/* ------------------------------------------------------------------ */
/*  读取 / 写入                                                        */
/* ------------------------------------------------------------------ */

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/**
 * localStorage 里的内容是**不可信输入**：
 * 用户可能手改、可能从旧版本残留、也可能被别的脚本写过。
 * 所以这里逐字段校验 + 归一化，读坏了就当没有草稿。
 */
function sanitizeScalars(raw: unknown): DiyDraftScalars {
  const src = (raw ?? {}) as Record<string, unknown>;
  const str = (key: keyof DiyDraftScalars, fallback: string): string => {
    const v = src[key];
    return typeof v === "string" && v.length <= 200 ? v : fallback;
  };

  return {
    discColor: str("discColor", DEFAULT_DIY_SCALARS.discColor),
    caseTint: str("caseTint", DEFAULT_DIY_SCALARS.caseTint),
    spineText: str("spineText", DEFAULT_DIY_SCALARS.spineText),
    spineFont: str("spineFont", DEFAULT_DIY_SCALARS.spineFont),
    spineTheme: str("spineTheme", DEFAULT_DIY_SCALARS.spineTheme),
    spineTextColor: str(
      "spineTextColor",
      DEFAULT_DIY_SCALARS.spineTextColor,
    ),
    showObi:
      typeof src.showObi === "boolean"
        ? src.showObi
        : DEFAULT_DIY_SCALARS.showObi,
    obiText: str("obiText", DEFAULT_DIY_SCALARS.obiText),
    obiFont: str("obiFont", DEFAULT_DIY_SCALARS.obiFont),
    obiTheme: str("obiTheme", DEFAULT_DIY_SCALARS.obiTheme),
    obiTextColor: str("obiTextColor", DEFAULT_DIY_SCALARS.obiTextColor),
  };
}

function sanitizeImages(raw: unknown): Record<string, DiyDraftImageMeta> {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, DiyDraftImageMeta> = {};
  for (const [slot, value] of Object.entries(src)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(slot)) continue;
    const meta = (value ?? {}) as Record<string, unknown>;
    out[slot] = {
      name: typeof meta.name === "string" ? meta.name.slice(0, 120) : "",
      type: typeof meta.type === "string" ? meta.type.slice(0, 80) : "",
      size: Number(meta.size ?? 0) || 0,
    };
  }
  return out;
}

/** 读草稿；没有 / 坏了 / 版本对不上 → 返回 null（当作没有草稿） */
export function readDiyDraft(): DiyDraft | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(DIY_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    if (Number(parsed.version) !== DIY_DRAFT_VERSION) return null;
    return {
      version: DIY_DRAFT_VERSION,
      savedAt:
        typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      scalars: sanitizeScalars(parsed.scalars),
      images: sanitizeImages(parsed.images),
    };
  } catch {
    /* 解析失败 = 草稿坏了，丢掉它，别让整个工作台挂掉 */
    return null;
  }
}

export function writeDiyDraft(
  scalars: DiyDraftScalars,
  images: Record<string, DiyDraftImageMeta>,
): DiyDraft | null {
  if (!isBrowser()) return null;
  const draft: DiyDraft = {
    version: DIY_DRAFT_VERSION,
    savedAt: new Date().toISOString(),
    scalars: sanitizeScalars(scalars),
    images: sanitizeImages(images),
  };
  try {
    window.localStorage.setItem(DIY_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return draft;
  } catch {
    /* 配额满 / 隐私模式禁写 —— 草稿是加分项，失败了就失败 */
    return null;
  }
}

/** 清掉标量草稿（图片本体在 IndexedDB，由 image-store 清） */
export function clearDiyDraft(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(DIY_DRAFT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** 草稿存不存在（用来决定要不要显示「恢复草稿」提示） */
export function hasDiyDraft(): boolean {
  return readDiyDraft() !== null;
}
