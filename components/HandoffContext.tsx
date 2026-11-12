"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * 交接给用户自己的 agent —— 制作页攒下的素材放在这里。
 * ==================================================================
 * 为什么单独开一个 provider，而不是往 ExperienceContext 里加字段：
 *   ExperienceContext 是本项目的**受保护文件**（v2.2 起逐字节冻结），
 *   动它会牵连 DIY 工作台 → NFC 预览那条链路。
 *   而交接只需要三样东西 —— 录音、随信照片、信纸皮肤 id ——
 *   都是「制作页产生、接入台消费」的一次性素材，单独放更干净。
 *
 * 为什么需要共享（而不是各页各拿）：
 *   交接发生在 /agents，而素材产生在 /make。
 *   两个页面之间是同一个 layout 下的客户端路由 —— blob URL 在
 *   同一个文档生命周期里是有效的，所以录音/照片可以直接跨页传。
 *   （硬刷新会失效：blob URL 本来就只在当前文档有效，这一点
 *     与改造前完全一致，不是新引入的限制。）
 */

/** 随信照片 / 视频 —— 与 RecordStudio 里的 MediaFile 同形 */
export type MemoryMedia = {
  url: string;
  name: string;
  kind: "image" | "video";
  /** 视频抽出来的封面帧（data URL）—— CD 盘面只能印图片 */
  coverUrl?: string | null;
};

type HandoffState = {
  /** 录音的 blob URL —— 交接时必须先传成 /api/uploads/<id> */
  recordingUrl: string | null;
  /** 随信照片 / 视频 */
  memoryMedia: MemoryMedia | null;
  /** 信纸皮肤 id（p01…p11）—— 技能包收的是 id，不是图片路径 */
  paperSkinId: string;

  setRecordingUrl: (v: string | null) => void;
  setMemoryMedia: (v: MemoryMedia | null) => void;
  setPaperSkinId: (v: string) => void;

  /**
   * 能不能交接了 —— 录音与照片都得在。
   * 少录音那张 CD 就没意义，少照片就只是一张空碟。
   */
  ready: boolean;
};

const HandoffContext = createContext<HandoffState | null>(null);

export function HandoffProvider({ children }: { children: ReactNode }) {
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [memoryMedia, setMemoryMedia] = useState<MemoryMedia | null>(null);
  const [paperSkinId, setPaperSkinId] = useState<string>("p01");

  const value = useMemo<HandoffState>(
    () => ({
      recordingUrl,
      memoryMedia,
      paperSkinId,
      setRecordingUrl,
      setMemoryMedia,
      setPaperSkinId,
      ready: Boolean(recordingUrl) && Boolean(memoryMedia),
    }),
    [recordingUrl, memoryMedia, paperSkinId],
  );

  return (
    <HandoffContext.Provider value={value}>{children}</HandoffContext.Provider>
  );
}

export function useHandoff(): HandoffState {
  const ctx = useContext(HandoffContext);
  if (!ctx) throw new Error("useHandoff must be used within HandoffProvider");
  return ctx;
}
