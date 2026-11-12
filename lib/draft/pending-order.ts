/**
 * 待下单草稿（浏览器侧）
 * ==================================================================
 * v2.13：网页端结账**强制先登录**。
 *
 * ------------------------------------------------------------------
 * 为什么需要这个模块
 * ------------------------------------------------------------------
 * 强制登录撞上了一个老问题：**录音是 blob URL，出了那个文档就失效**。
 *
 *   访客录了一段 → 走到结账 → 「请先登录」→ 跳去登录页 →
 *   登录完跳回制作页 → 录音的 blob URL 早就死了 → 用户白录一遍。
 *
 * 那不能接受。所以点「登录」的那一刻，我们**先把素材传上去**：
 * 录音、照片、手写笔迹统统换成 `/api/uploads/<id>` 这种**能活过跳转**的引用，
 * 再连同表单一起存进本模块，登录完原样恢复。
 *
 * 素材本体最终还是要传的 —— 早传一次和晚传一次，对服务器没有区别，
 * 但对用户是「白干一场」和「回来接着干」的区别。
 *
 * ------------------------------------------------------------------
 * 为什么放 localStorage 而不是 IndexedDB
 * ------------------------------------------------------------------
 * 这里存的是**引用**（`/api/uploads/<id>`）和几个字符串，不是二进制。
 * 引用已经在服务器上了，localStorage 存几十字节就够。
 * （真正的二进制在 IndexedDB 里，见 lib/draft/image-store.ts —— 那是 DIY 贴图的事。）
 *
 * 这个模块是**纯浏览器**的：不 import 任何服务端代码。
 */

export const PENDING_ORDER_STORAGE_KEY = "hallocd.pending-order.v1";
export const PENDING_ORDER_VERSION = 1;

/**
 * 草稿最多留多久。
 *
 * 6 小时足够覆盖「填表 → 去登录 → 注册完 → 回来」这一整段，
 * 又不会让三天前那半张草稿在用户毫无预期的情况下盖掉他现在的输入。
 */
export const PENDING_ORDER_MAX_AGE_MS = 6 * 3600 * 1000;

export type PendingMemoryMedia = {
  url: string;
  name: string;
  kind: "image" | "video";
};

export type PendingOrder = {
  version: number;
  savedAt: string;
  /** 已经传好的素材引用 —— 建单时直接用，不用再传一次 */
  assetRefs: Record<string, string>;
  /** 手写笔迹的引用（放在 letter 里，不在 design 里） */
  handwritingUrl: string | null;
  /** 录音的引用 —— 恢复到交接上下文里，NFC 预览还能播 */
  recordingUrl: string | null;
  /** 随信照片 / 视频 */
  memoryMedia: PendingMemoryMedia | null;
  /** 表单：收件人 / 场景 / 送达日期 */
  form: {
    receivers: string;
    scene: string;
    date: string;
  };
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function str(raw: unknown, max: number): string {
  return typeof raw === "string" && raw.length <= max ? raw : "";
}

/** localStorage 里的东西一律当不可信输入：逐字段校验，读坏了就当没有 */
function sanitize(raw: unknown): PendingOrder | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;

  const refs: Record<string, string> = {};
  const rawRefs = (src.assetRefs ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(rawRefs)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key)) continue;
    /* 引用只能是站内路径 —— 不能是任意外链 */
    if (typeof value !== "string" || !value.startsWith("/api/uploads/")) continue;
    refs[key] = value.slice(0, 200);
  }
  const rawForm = (src.form ?? {}) as Record<string, unknown>;
  const rawMedia = (src.memoryMedia ?? null) as Record<string, unknown> | null;
  const receivers = str(rawForm.receivers, 120);

  /* 素材和表单至少得有一项 —— 两样都空的草稿恢复出来也没意义 */
  if (!Object.keys(refs).length && !receivers) return null;

  return {
    version: PENDING_ORDER_VERSION,
    savedAt: str(src.savedAt, 40) || new Date().toISOString(),
    assetRefs: refs,
    handwritingUrl:
      typeof src.handwritingUrl === "string" &&
      src.handwritingUrl.startsWith("/api/uploads/")
        ? src.handwritingUrl
        : null,
    recordingUrl:
      typeof src.recordingUrl === "string" &&
      src.recordingUrl.startsWith("/api/uploads/")
        ? src.recordingUrl
        : null,
    memoryMedia: rawMedia
      ? {
          /* 同样是站内引用 —— 不接受任意外链 */
          url:
            typeof rawMedia.url === "string" &&
            rawMedia.url.startsWith("/api/uploads/")
              ? rawMedia.url.slice(0, 200)
              : "",
          name: str(rawMedia.name, 120),
          kind: rawMedia.kind === "video" ? "video" : "image",
        }
      : null,
    form: {
      receivers,
      scene: str(rawForm.scene, 40),
      date: str(rawForm.date, 20),
    },
  };
}

export function readPendingOrder(): PendingOrder | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(PENDING_ORDER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (Number(parsed?.version) !== PENDING_ORDER_VERSION) return null;
    /* 过期了就当没有 —— 别让一份陈年草稿盖掉用户现在正在填的东西 */
    const savedAt = Date.parse(String(parsed?.savedAt ?? ""));
    if (!Number.isFinite(savedAt)) return null;
    if (Date.now() - savedAt > PENDING_ORDER_MAX_AGE_MS) return null;
    return sanitize(parsed);
  } catch {
    return null;
  }
}

export function writePendingOrder(
  input: Omit<PendingOrder, "version" | "savedAt">,
): PendingOrder | null {
  if (!isBrowser()) return null;
  const draft: PendingOrder = {
    version: PENDING_ORDER_VERSION,
    savedAt: new Date().toISOString(),
    ...input,
  };
  try {
    window.localStorage.setItem(
      PENDING_ORDER_STORAGE_KEY,
      JSON.stringify(draft),
    );
    return draft;
  } catch {
    /* 配额满 / 隐私模式禁写 —— 存不下就算了，用户重录一次总比卡死强 */
    return null;
  }
}

/** 订单建成了（或用户主动放弃）就把这份草稿清掉 */
export function clearPendingOrder(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PENDING_ORDER_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
