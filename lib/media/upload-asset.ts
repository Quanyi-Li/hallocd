"use client";

/**
 * halloCD · 浏览器端的素材上传（交接面板与结账面板共用）
 * ==================================================================
 * 为什么抽出来：
 *   网页端有**两条**并行的下单路径 —— 自己付款（/make 的结账面板）
 *   与交给自己的 agent（/agents 的交接面板）。两条路都要先把
 *   blob: 素材传上去换成 /api/uploads/<id>，规则一模一样。
 *
 *   规矩要是一份：贴图传不上去、录音传不上去，两条路都得说同样的话。
 *   各写一份的话，早晚会对不上 —— 表现就是「交接能传、结账传不上去」。
 *
 * 这个模块**只在客户端用**（它 import 了 @vercel/blob/client）。
 */

import { upload } from "@vercel/blob/client";

import {
  SERVER_UPLOAD_MAX_BYTES,
  blobPathname,
  directMimeAllowed,
  normalizeMime,
  randomUploadId,
} from "./upload-client";

/**
 * 客户端直传：文件从浏览器直接 PUT 到对象存储，**不经过我们的函数**。
 *
 * 为什么必须有这条通道：
 *   Vercel 函数的请求体硬上限是 4.5MB，超过直接 413 FUNCTION_PAYLOAD_TOO_LARGE。
 *   一条 8MB 的视频根本到不了服务端 —— 只能让浏览器自己把文件送出去。
 *
 * 三步（与 app/api/uploads/direct/route.ts 的注释一一对应）：
 *   ① POST /api/uploads/direct          换一张 client token（限类型/限大小/限时效）
 *   ② PUT 到 Blob                        由 @vercel/blob/client 的 upload() 完成
 *   ③ POST /api/uploads/direct/commit    回查对象存储 → 落库 → 拿到 /api/uploads/<id>
 */
export async function uploadDirect(
  blob: Blob,
  baseName: string,
): Promise<string | null> {
  try {
    const id = randomUploadId();
    const mime = normalizeMime(blob.type);
    const ext = (mime.split("/")[1] || "bin").split("+")[0];
    const name = `${baseName}.${ext}`;
    const pathname = blobPathname(id, name);

    const res = await upload(pathname, blob, {
      handleUploadUrl: "/api/uploads/direct",
      access: "public",
      contentType: mime,
      clientPayload: { uploadId: id, name },
    });

    const commit = await fetch("/api/uploads/direct/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname: res.pathname || pathname, name }),
    });
    if (!commit.ok) return null;
    const data = await commit.json().catch(() => ({}));
    return typeof data?.url === "string" ? data.url : null;
  } catch {
    return null;
  }
}

/**
 * 把一个 blob:/data: URL 传到 /api/uploads，返回 /api/uploads/<id>。
 *
 * 为什么必须先上传：录音与贴图都是本地 Blob URL，
 * 离开页面就 revoke。而订单要靠这些引用才能真的产出那张 CD ——
 * 只存一个 blob: 字符串等于什么都没存。
 *
 * 走哪条通道由大小决定（阈值与服务端一致，两边都从 upload-client.ts 取）：
 *   · ≤ 4MB → 服务端中转 POST /api/uploads
 *   · > 4MB → 客户端直传（函数的 4.5MB 请求体硬限挡住了大文件）
 */
export async function uploadAsset(
  src: string,
  baseName: string,
): Promise<string | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    const mime = normalizeMime(blob.type);

    /* 超过中转上限 → 客户端直传 */
    if (blob.size > SERVER_UPLOAD_MAX_BYTES) {
      if (!directMimeAllowed(mime)) return null;
      return await uploadDirect(blob, baseName);
    }

    const form = new FormData();
    form.append("file", blob, `${baseName}.${mime.split("/")[1] || "bin"}`);
    const up = await fetch("/api/uploads", { method: "POST", body: form });
    if (!up.ok) return null;
    const data = await up.json().catch(() => ({}));
    return typeof data?.url === "string" ? data.url : null;
  } catch {
    return null;
  }
}

/**
 * 复制文本到剪贴板。
 *
 * 为什么要有兜底：clipboard API 在非安全上下文（http 局域网调试）
 * 和部分老浏览器里根本不存在 —— 直接 navigator.clipboard.writeText
 * 会抛异常，把整个流程打断。
 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    /* 落到兜底 */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } catch {
    /* 复制不了就算了 —— 下面会把内容原样显示出来，用户可以手动选中 */
  }
  document.body.removeChild(area);
}

/* ------------------------------------------------------------------ */
/*  一整套素材：网页端结账与 agent 交接共用同一条上传通道                */
/* ------------------------------------------------------------------ */

export type MemoryMedia = {
  url: string;
  name: string;
  kind: string;
  coverUrl?: string | null;
};

export type AssetPlanInput = {
  /** 录音（blob URL） */
  recordingUrl: string | null;
  /** 随信照片 / 视频 */
  memoryMedia: MemoryMedia | null;
  /** DIY 贴图 —— 键名与订单 design 字段同名 */
  design: Record<string, string | null | undefined>;
  /** 手写笔迹（data URL） */
  handwrittenImage?: string | null;
};

export type AssetUploadResult = {
  /** design 里要带的素材引用（形如 { audioUrl: "/api/uploads/up_xxx" }） */
  assetRefs: Record<string, string>;
  /** 手写笔迹的引用 —— 放在 letter 里，不在 design 里 */
  handwritingUrl: string | null;
  /** 哪一类素材没传上去：null = 都传上去了 */
  failed: null | "audio" | "media";
};

/**
 * 把做好的 CD 用到的**全部**素材传上去，换成 /api/uploads/<id>。
 *
 * 为什么要单独抽出来：
 *   网页端有两条并行的下单路径（自己付款 / 交给 agent），
 *   两者都要先把 blob: 素材换成可访问的引用。规则必须一致 ——
 *   「交接能传、结账传不上去」是最难查的那类不一致。
 *
 * 失败怎么算：
 *   · 录音传不上去 → failed = "audio"。那张 CD 没有声音就没有意义，必须中止。
 *   · 照片 / 视频都传不上去 → failed = "media"。同样不许闷声丢掉。
 *   · DIY 贴图传不上去 → 降级成场景默认值，不阻断下单（用户已经做完设计了，
 *     为了一张贴图让他付不了款不值当）。
 */
export async function uploadAllAssets(
  input: AssetPlanInput,
): Promise<AssetUploadResult> {
  const d = input.design;

  const assetPlan: { key: string; src: string | null; name: string }[] = [
    { key: "audioUrl", src: input.recordingUrl, name: "recording" },
    { key: "discArtUrl", src: d.discArtUrl ?? null, name: "disc-art" },
    { key: "caseCoverUrl", src: d.caseCoverUrl ?? null, name: "case-cover" },
    { key: "backCoverUrl", src: d.backCoverUrl ?? null, name: "back-cover" },
    { key: "innerLeftUrl", src: d.innerLeftUrl ?? null, name: "inner-left" },
    { key: "innerRightUrl", src: d.innerRightUrl ?? null, name: "inner-right" },
    { key: "spineImageUrl", src: d.spineImageUrl ?? null, name: "spine" },
    { key: "obiImageUrl", src: d.obiImageUrl ?? null, name: "obi" },
    {
      key: "mediaUrl",
      /* 照片就是它自己；视频用抽出来的封面帧（CD 上只能印图片） */
      src:
        input.memoryMedia?.kind === "image"
          ? input.memoryMedia.url
          : (input.memoryMedia?.coverUrl ?? null),
      name: "memory-photo",
    },
    {
      /* 视频原文件：照存不误，不转码 */
      key: "mediaVideoUrl",
      src: input.memoryMedia?.kind === "video" ? input.memoryMedia.url : null,
      name: "memory-video",
    },
  ];

  const assetRefs: Record<string, string> = {};
  let failed: AssetUploadResult["failed"] = null;

  for (const item of assetPlan) {
    if (!item.src) continue;
    const ref = await uploadAsset(item.src, item.name);
    if (ref) {
      assetRefs[item.key] = ref;
    } else if (item.key === "audioUrl") {
      failed = "audio";
    }
  }

  /* 用户明确传了视频，但封面和原文件都没传上去 —— 别闷声丢掉 */
  if (
    input.memoryMedia?.kind === "video" &&
    !assetRefs.mediaUrl &&
    !assetRefs.mediaVideoUrl
  ) {
    failed = failed ?? "media";
  }

  /* 手写笔迹是 data URL，单独传 */
  let handwritingUrl: string | null = null;
  if (input.handwrittenImage) {
    handwritingUrl = await uploadAsset(input.handwrittenImage, "handwriting");
  }

  return { assetRefs, handwritingUrl, failed };
}
