"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Upload } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { useLang } from "@/lib/i18n";

/* ---------------------------------- */
/*  分层定义：六个印刷区域               */
/* ---------------------------------- */
export type LayerId =
  | "disc"
  | "front"
  | "innerLeft"
  | "innerRight"
  | "spine"
  | "obi"
  | "back";

const LAYERS: { id: LayerId; label: string }[] = [
  { id: "disc", label: "CD 盘面" },
  { id: "front", label: "正面外壳" },
  { id: "innerLeft", label: "内侧左页" },
  { id: "innerRight", label: "内侧右页" },
  { id: "spine", label: "侧边脊背" },
  { id: "obi", label: "腰封纸带" },
  { id: "back", label: "背面封面" },
];

/* 侧边脊背：字体预设（css 用于 2D，canvas 用于 3D 贴图） */
export const SPINE_FONTS = [
  {
    id: "serif",
    label: "衬线",
    css: 'var(--font-serif), "Songti SC", serif',
    canvas: 'Georgia, "Times New Roman", serif',
  },
  {
    id: "sans",
    label: "无衬线",
    css: "var(--font-sans), system-ui, sans-serif",
    canvas: "Arial, Helvetica, sans-serif",
  },
  {
    id: "mono",
    label: "等宽",
    css: "var(--font-mono), monospace",
    canvas: "Consolas, monospace",
  },
  {
    id: "song",
    label: "宋体",
    css: '"Songti SC", "STSong", "SimSun", serif',
    canvas: '"Songti SC", "SimSun", serif',
  },
] as const;

export type SpineFontId = (typeof SPINE_FONTS)[number]["id"];

/* 侧边脊背：背景材质预设（默认透明磨砂玻璃） */
export const SPINE_THEMES = [
  {
    id: "glass",
    label: "透明磨砂",
    bg: "transparent",
    swatch: "rgba(255,255,255,0.35)",
  },
  { id: "dark", label: "黑底", bg: "#1C2329", swatch: "#1C2329" },
  { id: "light", label: "白底", bg: "#FAF6EE", swatch: "#FAF6EE" },
] as const;

export type SpineThemeId = (typeof SPINE_THEMES)[number]["id"];

/* 侧边脊背：文字颜色圆点 */
export const SPINE_TEXT_COLORS = [
  { id: "ink", label: "墨黑", value: "#1C2329" },
  { id: "paper", label: "米白", value: "#F8F4EC" },
  { id: "orange", label: "赤橘", value: "#E65100" },
  { id: "silver", label: "银灰", value: "#9AA3A8" },
] as const;

/* 侧边脊背：一键排版模板 */
export const SPINE_TEMPLATES = [
  {
    id: "love",
    label: "To My Love",
    text: "To My Love",
    font: "serif",
    theme: "glass",
    color: "#1C2329",
  },
  {
    id: "birthday",
    label: "Happy Birthday",
    text: "Happy Birthday",
    font: "sans",
    theme: "glass",
    color: "#E65100",
  },
  {
    id: "date",
    label: "2026.11.07",
    text: "2026.11.07",
    font: "mono",
    theme: "glass",
    color: "#1C2329",
  },
  {
    id: "letter",
    label: "致最爱的你",
    text: "致最爱的你",
    font: "song",
    theme: "light",
    color: "#9AA3A8",
  },
] as const;

export type SpineTemplate = (typeof SPINE_TEMPLATES)[number];

/* 腰封纸带：一键排版模板（竖排，独立于脊背） */
export const OBI_TEMPLATES = [
  {
    id: "obiLove",
    label: "To My Love",
    text: "To My Love",
    font: "serif",
    theme: "light",
    color: "#1C2329",
  },
  {
    id: "obiBirthday",
    label: "Happy Birthday",
    text: "Happy Birthday",
    font: "sans",
    theme: "dark",
    color: "#F8F4EC",
  },
  {
    id: "obiDate",
    label: "2026.11.07",
    text: "2026.11.07",
    font: "mono",
    theme: "glass",
    color: "#1C2329",
  },
  {
    id: "obiLetter",
    label: "致最爱的你",
    text: "致最爱的你",
    font: "song",
    theme: "light",
    color: "#E65100",
  },
] as const;

export type ObiTemplate = (typeof OBI_TEMPLATES)[number];

/* ---------------------------------- */
/*  受控 Props                          */
/* ---------------------------------- */
export type CustomizationPanelProps = {
  activeLayer: LayerId;
  onLayerChange: (layer: LayerId) => void;
  /* disc 层 */
  discColor: string;
  onColorChange: (hex: string) => void;
  discArtName: string | null;
  onDiscArtUpload: (file: File) => void;
  onDiscArtClear: () => void;
  /* front 层（外壳 + 正面封面 + 腰封） */
  caseTint: string;
  onCaseTintChange: (hex: string) => void;
  caseCoverName: string | null;
  onCaseCoverUpload: (file: File) => void;
  onCaseCoverClear: () => void;
  /* inner 层（内侧内页，左右两块独立区域） */
  innerLeftName: string | null;
  onInnerLeftUpload: (file: File) => void;
  onInnerLeftClear: () => void;
  innerRightName: string | null;
  onInnerRightUpload: (file: File) => void;
  onInnerRightClear: () => void;
  /* back 层（背面封面） */
  backCoverName: string | null;
  onBackCoverUpload: (file: File) => void;
  onBackCoverClear: () => void;
  /* spine 层（侧边脊背） */
  spineText: string;
  onSpineTextChange: (value: string) => void;
  spineFont: SpineFontId;
  onSpineFontChange: (value: SpineFontId) => void;
  spineTheme: SpineThemeId;
  onSpineThemeChange: (value: SpineThemeId) => void;
  spineTextColor: string;
  onSpineTextColorChange: (value: string) => void;
  onSpineTemplateApply: (template: SpineTemplate) => void;
  spineImageName: string | null;
  onSpineImageUpload: (file: File) => void;
  onSpineImageClear: () => void;
  /* 腰封（独立 Tab） */
  showObi: boolean;
  onObiToggle: (value: boolean) => void;
  obiText: string;
  onObiTextChange: (value: string) => void;
  obiTheme: SpineThemeId;
  onObiThemeChange: (value: SpineThemeId) => void;
  obiTextColor: string;
  onObiTextColorChange: (value: string) => void;
  obiFont: SpineFontId;
  onObiFontChange: (value: SpineFontId) => void;
  onObiTemplateApply: (template: ObiTemplate) => void;
  obiName: string | null;
  onObiUpload: (file: File) => void;
  onObiClear: () => void;
};

/* ---------------------------------- */
/*  共享：虚线上传框                     */
/* ---------------------------------- */
function UploadBox({
  name,
  placeholder,
  hint,
  onUpload,
}: {
  name: string | null;
  placeholder: string;
  hint: string;
  onUpload: (file: File) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#1C2329]/25 px-6 py-6 text-center transition-colors hover:border-[#E65100]/60 hover:bg-white/50">
      <Upload className="h-4 w-4 text-[#1C2329]/50" strokeWidth={1.5} />
      <span className="text-xs font-medium tracking-wide text-[#1C2329]/60">
        {name ?? placeholder}
      </span>
      <span className="text-[10px] text-[#1C2329]/35">{hint}</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/* 共享：恢复默认（清除图片，回到透明/纯色） */
function ResetButton({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`mt-3 w-full rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.08em] transition ${
        disabled
          ? "cursor-not-allowed bg-black/[0.03] text-[#1C2329]/25"
          : "bg-black/5 text-[#1C2329]/60 hover:bg-black/10 hover:text-[#1C2329]"
      }`}
    >
      {label}
    </button>
  );
}

/* ---------------------------------- */
/*  定制控制面板（四层 DIY）             */
/* ---------------------------------- */
export default function CustomizationPanel({
  activeLayer,
  onLayerChange,
  discColor,
  onColorChange,
  discArtName,
  onDiscArtUpload,
  onDiscArtClear,
  caseTint,
  onCaseTintChange,
  caseCoverName,
  onCaseCoverUpload,
  onCaseCoverClear,
  innerLeftName,
  onInnerLeftUpload,
  onInnerLeftClear,
  innerRightName,
  onInnerRightUpload,
  onInnerRightClear,
  backCoverName,
  onBackCoverUpload,
  onBackCoverClear,
  spineText,
  onSpineTextChange,
  spineFont,
  onSpineFontChange,
  spineTheme,
  onSpineThemeChange,
  spineTextColor,
  onSpineTextColorChange,
  onSpineTemplateApply,
  spineImageName,
  onSpineImageUpload,
  onSpineImageClear,
  showObi,
  onObiToggle,
  obiText,
  onObiTextChange,
  obiTheme,
  onObiThemeChange,
  obiTextColor,
  onObiTextColorChange,
  obiFont,
  onObiFontChange,
  onObiTemplateApply,
  obiName,
  onObiUpload,
  onObiClear,
}: CustomizationPanelProps) {
  const { t } = useLang();
  const st = t.studio;

  return (
    <div className="rounded-2xl border border-black/5 bg-white/50 p-5 shadow-[0_10px_40px_-15px_rgba(28,35,41,0.12)] backdrop-blur-sm sm:p-6">
      {/* 层级切换：七个编辑区域（4 + 3 网格） */}
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-black/5 p-1">
        {LAYERS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => onLayerChange(l.id)}
            className={`relative rounded-lg px-1.5 py-1.5 text-[10px] font-semibold tracking-[0.02em] transition-colors ${
              activeLayer === l.id
                ? "text-[#1C2329]"
                : "text-[#1C2329]/40 hover:text-[#1C2329]/70"
            }`}
          >
            {activeLayer === l.id && (
              <motion.span
                layoutId="panel-layer-pill"
                className="absolute inset-0 rounded-lg bg-white shadow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">{st.tabs[l.id]}</span>
          </button>
        ))}
      </div>

      {/* 面板内容 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeLayer}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="pt-6"
        >
          {/* ======== CD 盘面 ======== */}
          {activeLayer === "disc" && (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  Disc Color
                </p>
                <div className="mt-4 flex items-start gap-4">
                  <HexColorPicker
                    color={discColor}
                    onChange={onColorChange}
                    style={{ width: "100%", maxWidth: 200, height: 160 }}
                  />
                  <div className="flex flex-col items-center gap-2 pt-1">
                    <span
                      className="h-9 w-9 rounded-full ring-1 ring-black/10"
                      style={{ background: discColor }}
                    />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#1C2329]/50">
                      {discColor}
                    </span>
                  </div>
                </div>
                <p className="mt-3 text-[10px] text-[#1C2329]/35">
                  {st.discHint}
                </p>
              </div>

              <div>
                <UploadBox
                  name={discArtName}
                  placeholder="Upload Disc Art"
                  hint={st.discUploadHint}
                  onUpload={onDiscArtUpload}
                />
                <ResetButton
                  disabled={!discArtName}
                  label={st.resetDisc}
                  onClick={onDiscArtClear}
                />
              </div>
            </div>
          )}

          {/* ======== 正面外壳 ======== */}
          {activeLayer === "front" && (
            <div className="space-y-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  Case Tint
                </p>
                <div className="mt-4 flex items-start gap-4">
                  <HexColorPicker
                    color={caseTint}
                    onChange={onCaseTintChange}
                    style={{ width: "100%", maxWidth: 200, height: 160 }}
                  />
                  <div className="flex flex-col items-center gap-2 pt-1">
                    <span
                      className="h-9 w-9 rounded-full ring-1 ring-black/10"
                      style={{ background: caseTint }}
                    />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#1C2329]/50">
                      {caseTint}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onCaseTintChange("#ffffff")}
                  className={`mt-4 rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.1em] transition ${
                    caseTint === "#ffffff"
                      ? "bg-[#1C2329] text-[#F8F4EC]"
                      : "bg-black/5 text-[#1C2329]/60 hover:bg-black/10 hover:text-[#1C2329]"
                  }`}
                >
                  {st.tintNone}
                </button>
                <p className="mt-3 text-[10px] text-[#1C2329]/35">
                  {st.caseHint}
                </p>
              </div>

              <div>
                <UploadBox
                  name={caseCoverName}
                  placeholder="Upload Front Cover"
                  hint={st.caseUploadHint}
                  onUpload={onCaseCoverUpload}
                />
                <ResetButton
                  disabled={!caseCoverName}
                  label={st.resetCase}
                  onClick={onCaseCoverClear}
                />
              </div>

              {/* 腰封已拆分为独立 Tab，这里只做提示 */}
              <div className="rounded-xl border border-black/10 bg-white/60 px-4 py-3">
                <p className="text-xs font-medium text-[#1C2329]/70">
                  {st.obiSplitTitle}
                </p>
                <p className="mt-1 text-[10px] text-[#1C2329]/40">
                  {st.obiSplitBody}
                </p>
              </div>
            </div>
          )}

          {/* ======== 内侧左页：盒盖内侧小册子插页 ======== */}
          {activeLayer === "innerLeft" && (
            <div className="space-y-6">
              <p className="text-xs leading-relaxed text-[#1C2329]/50">
                {st.innerLeftIntro}
              </p>
              <div className="rounded-xl border border-black/10 bg-white/60 p-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-[#1C2329]/50">
                  {st.innerLeftTitle}
                </p>
                <UploadBox
                  name={innerLeftName}
                  placeholder="Upload Left Art"
                  hint={st.innerLeftUploadHint}
                  onUpload={onInnerLeftUpload}
                />
                <ResetButton
                  disabled={!innerLeftName}
                  label={st.resetInnerLeft}
                  onClick={onInnerLeftClear}
                />
              </div>
              <p className="text-[10px] text-[#1C2329]/35">
                {st.innerDragHint}
              </p>
            </div>
          )}

          {/* ======== 内侧右页：光盘托盘底板 ======== */}
          {activeLayer === "innerRight" && (
            <div className="space-y-6">
              <p className="text-xs leading-relaxed text-[#1C2329]/50">
                {st.innerRightIntro}
              </p>
              <div className="rounded-xl border border-black/10 bg-white/60 p-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-[#1C2329]/50">
                  {st.innerRightTitle}
                </p>
                <UploadBox
                  name={innerRightName}
                  placeholder="Upload Right Art"
                  hint={st.innerRightUploadHint}
                  onUpload={onInnerRightUpload}
                />
                <ResetButton
                  disabled={!innerRightName}
                  label={st.resetInnerRight}
                  onClick={onInnerRightClear}
                />
              </div>
              <p className="text-[10px] text-[#1C2329]/35">
                {st.innerDragHint}
              </p>
            </div>
          )}

          {/* ======== 侧边脊背：文字 / 字体 / 配色 / 图片 ======== */}
          {activeLayer === "spine" && (
            <div className="space-y-6">
              <p className="text-xs leading-relaxed text-[#1C2329]/50">
                {st.spineIntro}
              </p>

              {/* 方式一：打字输入 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  {st.spineTextLabel}
                </p>
                <input
                  value={spineText}
                  maxLength={24}
                  onChange={(e) => onSpineTextChange(e.target.value)}
                  placeholder={st.spinePlaceholder}
                  className="mt-3 w-full rounded-lg border border-black/10 bg-white/70 px-3 py-2.5 text-sm tracking-wide outline-none transition focus:border-[#E65100]/60 focus:bg-white"
                />
                <p className="mt-2 text-[10px] text-[#1C2329]/35">
                  {spineText.length}/24 · {st.spineCount}
                </p>
              </div>

              {/* 预设排版模板 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  {st.presetsLabel}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {SPINE_TEMPLATES.map((tpl) => {
                    const font =
                      SPINE_FONTS.find((f) => f.id === tpl.font) ??
                      SPINE_FONTS[0];
                    const theme =
                      SPINE_THEMES.find((t) => t.id === tpl.theme) ??
                      SPINE_THEMES[0];
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => onSpineTemplateApply(tpl)}
                        className="group flex items-center gap-2.5 rounded-xl border border-black/10 bg-white/50 p-2.5 text-left transition hover:border-[#E65100]/40 hover:bg-white"
                      >
                        {/* 迷你脊背预览 */}
                        <span
                          className="flex h-12 w-5 shrink-0 items-center justify-center overflow-hidden rounded-[3px] ring-1 ring-black/10"
                          style={{ background: theme.swatch }}
                        >
                          <span
                            className="whitespace-nowrap text-[7px] font-semibold tracking-[0.1em] [writing-mode:vertical-rl] [text-orientation:upright]"
                            style={{
                              color: tpl.color,
                              fontFamily: font.css,
                            }}
                          >
                            {tpl.text}
                          </span>
                        </span>
                        <span className="truncate text-[11px] font-medium text-[#1C2329]/70 transition group-hover:text-[#1C2329]">
                          {st.spineTemplateLabels[tpl.id] ?? tpl.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 字体 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  Font
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {SPINE_FONTS.map((f) => {
                    const active = spineFont === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onSpineFontChange(f.id)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs transition ${
                          active
                            ? "border-[#E65100] bg-white text-[#1C2329] ring-1 ring-[#E65100]/40"
                            : "border-black/10 bg-white/50 text-[#1C2329]/60 hover:border-[#E65100]/40 hover:bg-white"
                        }`}
                      >
                        <span style={{ fontFamily: f.css }}>{st.fontLabels[f.id] ?? f.label}</span>
                        <span
                          className="text-[15px] leading-none"
                          style={{ fontFamily: f.css }}
                        >
                          Aa
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 背景材质 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  {st.bgLabel}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {SPINE_THEMES.map((theme) => {
                    const active = spineTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => onSpineThemeChange(theme.id)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-[10px] transition ${
                          active
                            ? "border-[#E65100] ring-1 ring-[#E65100]/40"
                            : "border-black/10 hover:border-[#E65100]/40"
                        }`}
                      >
                        <span
                          className="h-6 w-6 rounded-full ring-1 ring-black/10"
                          style={{
                            background: theme.swatch,
                            backdropFilter:
                              theme.id === "glass" ? "blur(2px)" : undefined,
                          }}
                        />
                        <span className="text-[#1C2329]/70">
                          {st.themeLabels[theme.id] ?? theme.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 文字颜色 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  {st.textColorLabel}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  {SPINE_TEXT_COLORS.map((c) => {
                    const active =
                      spineTextColor.toLowerCase() === c.value.toLowerCase();
                    return (
                      <button
                        key={c.id}
                        type="button"
                        title={st.colorLabels[c.id] ?? c.label}
                        aria-label={st.colorLabels[c.id] ?? c.label}
                        onClick={() => onSpineTextColorChange(c.value)}
                        className={`relative h-8 w-8 rounded-full ring-1 ring-black/15 transition ${
                          active
                            ? "scale-110 ring-2 ring-[#E65100] ring-offset-2 ring-offset-[#FAF6EE]"
                            : "hover:scale-105"
                        }`}
                        style={{ background: c.value }}
                      />
                    );
                  })}
                  <span className="ml-1 text-[10px] text-[#1C2329]/35">
                    {st.textColorHint}
                  </span>
                </div>
              </div>

              {/* 方式三：上传图片（手写板将复用该状态） */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  {st.imageLabel}
                </p>
                <div className="mt-3">
                  <UploadBox
                    name={spineImageName}
                    placeholder="Upload Spine Art"
                    hint={st.spineUploadHint}
                    onUpload={onSpineImageUpload}
                  />
                  <ResetButton
                    disabled={!spineImageName}
                    label={st.removeImage}
                    onClick={onSpineImageClear}
                  />
                </div>
                <p className="mt-2 text-[10px] text-[#1C2329]/35">
                  {st.spineImageNote}
                </p>
              </div>
            </div>
          )}

          {/* ======== 腰封纸带（独立 Tab） ======== */}
          {activeLayer === "obi" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[#E65100]/20 bg-[#E65100]/[0.04] px-4 py-3">
                <p className="text-xs font-medium text-[#E65100]">
                  {st.obiTitle}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-[#1C2329]/45">
                  {st.obiIntro}
                </p>
              </div>

              {/* 显示开关 */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{st.showObi}</p>
                  <p className="mt-1 text-xs text-[#1C2329]/45">
                    {st.showObiHint}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showObi}
                  onClick={() => onObiToggle(!showObi)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
                    showObi ? "bg-[#E65100]" : "bg-black/15"
                  }`}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${
                      showObi ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>

              {/* 文字输入 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  Obi Text
                </p>
                <input
                  value={obiText}
                  onChange={(e) => onObiTextChange(e.target.value)}
                  maxLength={40}
                  placeholder={st.obiTextPlaceholder}
                  className="mt-3 w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2.5 text-sm text-[#1C2329] outline-none transition-colors placeholder:text-[#1C2329]/30 focus:border-[#E65100]/50"
                />
              </div>

              {/* 字体 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  Font
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {SPINE_FONTS.map((f) => {
                    const active = obiFont === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => onObiFontChange(f.id)}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs transition ${
                          active
                            ? "border-[#E65100] bg-white text-[#1C2329] ring-1 ring-[#E65100]/40"
                            : "border-black/10 bg-white/50 text-[#1C2329]/60 hover:border-[#E65100]/40 hover:bg-white"
                        }`}
                      >
                        <span style={{ fontFamily: f.css }}>{st.fontLabels[f.id] ?? f.label}</span>
                        <span
                          className="text-[15px] leading-none"
                          style={{ fontFamily: f.css }}
                        >
                          Aa
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 排版模板 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  Presets
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {OBI_TEMPLATES.map((tpl) => {
                    const preset =
                      SPINE_THEMES.find((t) => t.id === tpl.theme) ??
                      SPINE_THEMES[0];
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => onObiTemplateApply(tpl)}
                        className="group flex items-center gap-3 rounded-xl border border-black/10 bg-white/60 p-2.5 text-left transition hover:border-[#E65100]/50 hover:bg-white"
                      >
                        <span
                          className="flex h-14 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[3px] ring-1 ring-black/10"
                          style={{
                            background:
                              preset.id === "glass"
                                ? "rgba(255,255,255,0.35)"
                                : preset.bg,
                            backdropFilter: "blur(4px)",
                          }}
                        >
                          <span
                            className="text-[7px] font-semibold leading-tight [writing-mode:vertical-rl] [text-orientation:upright]"
                            style={{
                              color: tpl.color,
                            }}
                          >
                            {tpl.text}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold text-[#1C2329]/80">
                            {st.obiTemplateLabels[tpl.id] ?? tpl.label}
                          </span>
                          <span className="mt-0.5 block text-[9px] text-[#1C2329]/35">
                            {st.themeLabels[preset.id] ?? preset.label} ·{" "}
                            {st.applyPreset}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 背景材质 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  Background
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {SPINE_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => onObiThemeChange(theme.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-3 transition ${
                        obiTheme === theme.id
                          ? "border-[#E65100] bg-[#E65100]/[0.06]"
                          : "border-black/10 bg-white/50 hover:border-black/25"
                      }`}
                    >
                      <span
                        className="h-7 w-7 rounded-full ring-1 ring-black/10"
                        style={{
                          background:
                            theme.id === "glass" ? theme.swatch : theme.bg,
                          backdropFilter: "blur(4px)",
                        }}
                      />
                      <span className="text-[10px] font-medium text-[#1C2329]/60">
                        {st.themeLabels[theme.id] ?? theme.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 文字颜色 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  Text Color
                </p>
                <div className="mt-3 flex items-center gap-3">
                  {SPINE_TEXT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={st.colorLabels[c.id] ?? c.label}
                      onClick={() => onObiTextColorChange(c.value)}
                      className={`h-8 w-8 rounded-full transition ${
                        obiTextColor === c.value
                          ? "ring-2 ring-[#E65100] ring-offset-2 ring-offset-white"
                          : "ring-1 ring-black/15 hover:scale-110"
                      }`}
                      style={{ background: c.value }}
                    />
                  ))}
                </div>
              </div>

              {/* 图片上传 */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#1C2329]/40">
                  Artwork
                </p>
                <div className="mt-3">
                  <UploadBox
                    name={obiName}
                    placeholder={st.obiUploadPlaceholder}
                    hint={st.obiUploadHint}
                    onUpload={onObiUpload}
                  />
                  <ResetButton
                    disabled={!obiName}
                    label={st.removeImage}
                    onClick={onObiClear}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ======== 背面封面 ======== */}
          {activeLayer === "back" && (
            <div className="space-y-6">
              <p className="text-xs leading-relaxed text-[#1C2329]/50">
                {st.backIntro}
              </p>
              <div>
                <UploadBox
                  name={backCoverName}
                  placeholder="Upload Back Cover"
                  hint={st.backUploadHint}
                  onUpload={onBackCoverUpload}
                />
                <ResetButton
                  disabled={!backCoverName}
                  label={st.resetBack}
                  onClick={onBackCoverClear}
                />
              </div>
              <p className="text-[10px] text-[#1C2329]/35">
                {st.backDragHint}
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
