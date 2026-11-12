"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

/* 跨界面共享的「用户作品」状态：DIY 定制 → NFC 预览，保证同一张 CD */
type DesignSnapshot = {
  discColor: string; // 光盘底色（DIYStudio 调色盘）
  discArtUrl: string | null; // 盘面图（DIYStudio 上传）
  caseCoverUrl: string | null; // 外壳正面封面图（DIYStudio 上传）
  innerLeftUrl: string | null; // 内侧左页（盒盖内侧小册子插页）
  innerRightUrl: string | null; // 内侧右页（托盘底板）
  spineText: string; // 侧边脊背文字
  spineFont: string; // 侧边字体预设 id
  spineTheme: string; // 侧边背景材质 id（glass / dark / light）
  spineTextColor: string; // 侧边文字颜色
  spineImageUrl: string | null; // 侧边图片（手写或上传，优先于文字）
  /* 背面封面 */
  backCoverUrl: string | null;
  /* 腰封纸带（独立于脊背的另一套数据） */
  showObi: boolean;
  obiText: string;
  obiFont: string;
  obiTheme: string;
  obiTextColor: string;
  obiImageUrl: string | null;
  /* 信纸编辑器（RecordStudio → NFC 预览） */
  paperSrc: string | null; // 选中的信纸皮肤图片（null 则用默认米色信纸）
  paperName: string | null; // 信纸名称
  inputMode: "type" | "handwrite"; // 打字 / 手写
  letterText: string; // 信纸正文
  letterFontSize: number; // 正文字号（px）
  letterColor: string; // 正文墨色
  signatureText: string; // 落款
  handwrittenImage: string | null; // 手写笔迹（透明 PNG Base64）
};

type ExperienceState = DesignSnapshot & {
  setDesign: (d: DesignSnapshot) => void;
  updateDesign: (patch: Partial<DesignSnapshot>) => void;
};

const ExperienceContext = createContext<ExperienceState | null>(null);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const [design, setDesignState] = useState<DesignSnapshot>({
    discColor: "#E0E0E0",
    discArtUrl: null,
    caseCoverUrl: null,
    innerLeftUrl: null,
    innerRightUrl: null,
    spineText: "Hallo CD",
    spineFont: "serif",
    spineTheme: "glass",
    spineTextColor: "#1C2329",
    spineImageUrl: null,
    backCoverUrl: null,
    showObi: false,
    obiText: "Hallo CD",
    obiFont: "serif",
    obiTheme: "light",
    obiTextColor: "#1C2329",
    obiImageUrl: null,
    paperSrc: null,
    paperName: null,
    inputMode: "type",
    letterText: "",
    letterFontSize: 14,
    letterColor: "#333333",
    signatureText: "",
    handwrittenImage: null,
  });

  const setDesign = useCallback(
    (d: DesignSnapshot) => setDesignState(d),
    []
  );

  /* 局部更新：信纸编辑器只改自己的字段，不影响 DIY 端的定制数据 */
  const updateDesign = useCallback(
    (patch: Partial<DesignSnapshot>) =>
      setDesignState((prev) => ({ ...prev, ...patch })),
    []
  );

  return (
    <ExperienceContext.Provider value={{ ...design, setDesign, updateDesign }}>
      {children}
    </ExperienceContext.Provider>
  );
}

export function useExperience() {
  const ctx = useContext(ExperienceContext);
  if (!ctx)
    throw new Error("useExperience must be used within ExperienceProvider");
  return ctx;
}
