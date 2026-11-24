"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "zh" | "en";

export type Dict = {
  brand: { eyebrow: string; studio: string; vol: string; est: string };
  hero: { title: string; lead: string };
  gallery: {
    eyebrow: string;
    title: string;
    lead: string;
    headlinePre: string; // 大标题前半句
    headlineMark: string; // 黄色高亮块里的词
    headlinePost: string; // 大标题后半句
    ctaPre: string; // 底部 CTA 前缀
    ctaLink: string; // 底部 CTA 链接文字
    ctaPost: string; // 底部 CTA 后缀
    shelfLabel: string; // 盒脊架的无障碍标签
  };
  showcase: { hint: string; reel: string; open: string; close: string };
  room: { label: string };
  scenes: Record<string, string>;
  studio: {
    eyebrow: string;
    title: string;
    lead: string;
    view2d: string;
    view3d: string;
    front: string;
    back: string;
    viewFront: string;
    viewBack: string;
    modeFull: string;
    modeDisc: string;
    modeCase: string;
    openCase: string;
    closeCase: string;
    emptyBack: string;
    emptyLeft: string;
    tabs: {
      disc: string;
      front: string;
      innerLeft: string;
      innerRight: string;
      spine: string;
      obi: string;
      back: string;
    };
    discHint: string;
    discUploadHint: string;
    resetDisc: string;
    tintNone: string;
    caseHint: string;
    caseUploadHint: string;
    resetCase: string;
    obiSplitTitle: string;
    obiSplitBody: string;
    innerLeftIntro: string;
    innerLeftTitle: string;
    innerLeftUploadHint: string;
    resetInnerLeft: string;
    innerDragHint: string;
    innerRightIntro: string;
    innerRightTitle: string;
    innerRightUploadHint: string;
    resetInnerRight: string;
    spineIntro: string;
    spineTextLabel: string;
    spinePlaceholder: string;
    spineCount: string;
    presetsLabel: string;
    fontLabel: string;
    bgLabel: string;
    textColorLabel: string;
    textColorHint: string;
    imageLabel: string;
    spineUploadHint: string;
    removeImage: string;
    spineImageNote: string;
    obiTitle: string;
    obiIntro: string;
    showObi: string;
    showObiHint: string;
    obiTextPlaceholder: string;
    applyPreset: string;
    obiUploadPlaceholder: string;
    obiUploadHint: string;
    backIntro: string;
    backUploadHint: string;
    resetBack: string;
    backDragHint: string;
    fontLabels: Record<string, string>;
    themeLabels: Record<string, string>;
    colorLabels: Record<string, string>;
    spineTemplateLabels: Record<string, string>;
    obiTemplateLabels: Record<string, string>;
    /* 草稿（v2.8 / G5） */
    draftSaved: string;
    draftAutoSave: string;
    draftDiscard: string;
    draftRestored: string;
  };
  record: {
    eyebrow: string;
    title: string;
    lead: string;
    memoryTitle: string;
    memoryNote: string;
    letterTitle: string;
    letterNote: string;
    paperNames: Record<string, string>;
    typeMode: string;
    handwriteMode: string;
    clearStrokes: string;
    signatureLabel: string;
    signaturePlaceholder: string;
    reRecord: string;
    confirm: string;
    confirmed: string;
    micUnsupported: string;
    micDenied: string;
    startRec: string;
    stopRec: string;
    playRec: string;
    pauseRec: string;
    playPauseTitle: string;
    smaller: string;
    bigger: string;
    penWidth: string;
    textColorPrefix: string;
    removeTitle: string;
    colorNames: Record<string, string>;
    defaultLetter: string;
    defaultSignature: string;
    dragHintNote: string;
    tapHintNote: string;
    opening: string;
    closePreview: string;
    handwrittenEmpty: string;
    replyLinkLine1: string;
    replyLinkLine2: string;
  };
};

/* 信纸默认内容：切换语言时在未改动的情况下自动替换 */
export const LETTER_DEFAULTS: Record<Lang, { text: string; sign: string }> = {
  zh: {
    text: `听到这首歌的时候，我刚好在想你。
那天阳光很好，风把窗帘吹得鼓起来，像一封还没写字的信。
Some things are better said in music —— 慢慢听，别急。
往后的日子，也要一起听很多很多的歌。`,
    sign: "—— 想你的我",
  },
  en: {
    text: `When this song came on, I was thinking of you.
The sun was warm, the wind pushed the curtains out like an unwritten letter.
Some things are better said in music — take your time, no rush.
In the days ahead, let's listen to many, many more songs together.`,
    sign: "— Yours, thinking of you",
  },
};

const zh: Dict = {
  brand: {
    eyebrow: "halloCD · STUDIO",
    studio: "halloCD® Studio",
    vol: "Vol. 01",
    est: "EST. 2026",
  },
  hero: {
    title: "Design Your Moment.",
    lead: "每一张 halloCD，都装着一段时刻。拖动、点选，滑向下一幕。",
  },
  gallery: {
    eyebrow: "EXPLORE HALLOCD VIBES",
    title: "Find Your Vibe",
    lead: "每一种心情，都值得被刻成一张 halloCD。",
    headlinePre: "我们的",
    headlineMark: "Top 6",
    headlinePost: "个时刻，\n都刻成 CD",
    ctaPre: "在 ",
    ctaLink: "hallocd.vercel.app",
    ctaPost: " 刻一张属于你的 CD",
    shelfLabel: "halloCD 盒脊架",
  },
  showcase: {
    hint: "DRAG THE DISC OUT · PUT IT BACK",
    reel: "Reply with a CD",
    open: "打开盒盖",
    close: "合上盒盖",
  },
  room: { label: "My Room" },
  scenes: {
    birthday: "Birthday · 生日",
    anniversary: "Anniversary · 恋爱纪念日",
    wedding: "Wedding · 婚礼",
    graduation: "Graduation · 毕业",
    christmas: "Holiday · 圣诞节",
    everyday: "Everyday · 日常",
  },
  studio: {
    eyebrow: "DIY Studio",
    title: "Craft your own disc.",
    lead: "按住拖拽 360° 转动它，滚轮放大看质感；换一种颜色，贴上腰封——一张只属于你的 CD，从这里开始。",
    view2d: "2D View",
    view3d: "3D View",
    front: "正面",
    back: "背面",
    viewFront: "正面视图",
    viewBack: "背面视图",
    modeFull: "完整包装",
    modeDisc: "独立光碟",
    modeCase: "仅看外壳",
    openCase: "开启盒子",
    closeCase: "关闭盒子",
    emptyBack: "在右侧面板上传背面封面",
    emptyLeft: "在右侧面板上传左内页图",
    tabs: {
      disc: "CD 盘面",
      front: "正面外壳",
      innerLeft: "内侧左页",
      innerRight: "内侧右页",
      spine: "侧边脊背",
      obi: "腰封纸带",
      back: "背面封面",
    },
    discHint: "拖动取色，实时映射到光盘金属底色。",
    discUploadHint: "JPG / PNG · 即时预览到盘面",
    resetDisc: "恢复默认（纯色盘面）",
    tintNone: "无色透明",
    caseHint: "拖动取色为外壳着色，或一键回到无色玻璃。",
    caseUploadHint: "JPG / PNG · 贴到盒子正面（透过前盖可见）",
    resetCase: "恢复默认（透明正面）",
    obiSplitTitle: "腰封纸带已拆分为独立 Tab",
    obiSplitBody: "正面左侧那条宽纸带（约正面 1/4 宽）请到「腰封纸带」里单独定制，与侧边脊背互不影响。",
    innerLeftIntro: "打开盒盖后，左页是盒盖内侧的小册子插页；2D 视图会自动展开为双页布局。",
    innerLeftTitle: "左侧内页 · Left Inner",
    innerLeftUploadHint: "JPG / PNG · 印在小册子插页（盒盖内侧）",
    resetInnerLeft: "恢复默认（空白插页）",
    innerDragHint: "上传后可在 2D 视图拖拽调整构图，位置同步到 3D。",
    innerRightIntro: "打开盒盖后，右页是光盘托盘底板；2D 视图会自动展开为双页布局。",
    innerRightTitle: "右侧内页 · Right Inner",
    innerRightUploadHint: "JPG / PNG · 印在托盘底板（光盘之下）",
    resetInnerRight: "恢复默认（深色托盘）",
    spineIntro: "侧边脊背是 CD 盒最左侧的细长条，也是放在架子上唯一露出的部分。",
    spineTextLabel: "Spine Text · 打字",
    spinePlaceholder: "输入名字或短句",
    spineCount: "实时渲染到 3D 与 2D 侧边",
    presetsLabel: "Presets · 模板",
    fontLabel: "Font",
    bgLabel: "Background · 背景",
    textColorLabel: "Text Color · 字色",
    textColorHint: "黑 / 白 / 橘 / 银灰",
    imageLabel: "Image · 上传",
    spineUploadHint: "JPG / PNG · Logo 或签名图（优先于文字）",
    removeImage: "移除图片（回到文字）",
    spineImageNote: "图片会覆盖文字显示；手写板功能将在下一步接入同一状态。",
    obiTitle: "腰封纸带 · Obi Strip",
    obiIntro: "贴在正面左侧的宽纸带（约正面 1/4 宽），独立于侧边脊背：颜色、文字、图片互不影响。",
    showObi: "显示腰封",
    showObiHint: "关闭后 3D 与 2D 都会隐藏这条纸带。",
    obiTextPlaceholder: "输入腰封文字",
    applyPreset: "一键应用",
    obiUploadPlaceholder: "上传腰封图片（Logo / 签名）",
    obiUploadHint: "PNG / JPG · 覆盖文字显示",
    backIntro: "背面封面印在盒底外侧，翻到背面即可看到。",
    backUploadHint: "JPG / PNG · 贴到盒子背面",
    resetBack: "恢复默认（透明背面）",
    backDragHint: "上传后可在 2D 视图中拖拽调整构图，3D 会自动翻到背面。",
    fontLabels: { serif: "衬线", sans: "无衬线", mono: "等宽", song: "宋体" },
    themeLabels: { glass: "透明磨砂", dark: "黑底", light: "白底" },
    colorLabels: { ink: "墨黑", paper: "米白", orange: "赤橘", silver: "银灰" },
    spineTemplateLabels: {
      love: "To My Love",
      birthday: "Happy Birthday",
      date: "2026.11.07",
      letter: "致最爱的你",
    },
    obiTemplateLabels: {
      obiLove: "To My Love",
      obiBirthday: "Happy Birthday",
      obiDate: "2026.11.07",
      obiLetter: "致最爱的你",
    },
    draftSaved: "草稿已保存",
    draftAutoSave: "改动会自动存成草稿（只存在这台设备上）",
    draftDiscard: "清除草稿",
    draftRestored: "已恢复上次的草稿",
  },
  record: {
    eyebrow: "Record Studio",
    title: "Give it a voice.",
    lead: "录一段话、一首歌，或任何想随 CD 一起寄出的声音。",
    memoryTitle: "Add a visual memory to your CD",
    memoryNote: "（为你的 CD 添加视觉回忆）",
    letterTitle: "Write the letter they'll read",
    letterNote: "（自定义信纸文案，将以打字机效果呈现）",
    paperNames: {
      p01: "草莓蛋糕",
      p02: "剪贴手账",
      p03: "粉色蛋糕",
      p04: "打字机",
      p05: "牛皮胶带",
      p06: "字体拼贴",
      p07: "星星笺",
      p08: "格纹波点",
      p09: "布丁便签",
      p10: "甜点清单",
      p11: "刺绣布纹",
    },
    typeMode: "打字 Type",
    handwriteMode: "手写 Handwrite",
    clearStrokes: "清除笔迹",
    signatureLabel: "落款",
    signaturePlaceholder: "—— 想你的我",
    reRecord: "重新录制",
    confirm: "确认使用",
    confirmed: "已确认使用",
    micUnsupported: "当前浏览器不支持录音，请使用最新版 Chrome / Edge。",
    micDenied: "无法访问麦克风：请在浏览器地址栏允许麦克风权限后重试。",
    startRec: "开始录音",
    stopRec: "停止录音",
    playRec: "播放录音",
    pauseRec: "暂停播放",
    playPauseTitle: "点击播放 / 暂停",
    smaller: "缩小字号",
    bigger: "放大字号",
    penWidth: "笔触粗细",
    textColorPrefix: "文字颜色",
    removeTitle: "移除这张图片",
    colorNames: { ink: "深灰", white: "白", orange: "橘", navy: "深蓝" },
    defaultLetter: LETTER_DEFAULTS.zh.text,
    defaultSignature: LETTER_DEFAULTS.zh.sign,
    dragHintNote: "（拖出光盘，松手放回）",
    tapHintNote: "（点击开启回忆）",
    opening: "Tap · 正在开启…",
    closePreview: "关闭预览",
    handwrittenEmpty: "手写信纸（暂无笔迹）",
    replyLinkLine1: "已生成回信链接（模拟）：hallo.cd/r/7f3a2c ——",
    replyLinkLine2: "分享它，让 TA 也为你刻一张 CD",
  },
};

const en: Dict = {
  brand: {
    eyebrow: "halloCD · STUDIO",
    studio: "halloCD® Studio",
    vol: "Vol. 01",
    est: "EST. 2026",
  },
  hero: {
    title: "Design Your Moment.",
    lead: "Every halloCD holds a moment. Drag, pick, drift to the next scene.",
  },
  gallery: {
    eyebrow: "EXPLORE HALLOCD VIBES",
    title: "Find Your Vibe",
    lead: "Every mood deserves a disc of its own.",
    headlinePre: "Our",
    headlineMark: "Top 6",
    headlinePost: "moments,\npressed to CD",
    ctaPre: "Make yours at ",
    ctaLink: "hallocd.vercel.app",
    ctaPost: "",
    shelfLabel: "halloCD shelf",
  },
  showcase: {
    hint: "DRAG THE DISC OUT · PUT IT BACK",
    reel: "Reply with a CD",
    open: "open the case",
    close: "close the case",
  },
  room: { label: "My Room" },
  scenes: {
    birthday: "Birthday",
    anniversary: "Anniversary",
    wedding: "Wedding",
    graduation: "Graduation",
    christmas: "Holiday",
    everyday: "Everyday",
  },
  studio: {
    eyebrow: "DIY Studio",
    title: "Craft your own disc.",
    lead: "Drag to rotate 360°, scroll to zoom in on the texture. Pick a color, add a belly band — your one-of-a-kind CD starts here.",
    view2d: "2D View",
    view3d: "3D View",
    front: "Front",
    back: "Back",
    viewFront: "Front View",
    viewBack: "Back View",
    modeFull: "Full Package",
    modeDisc: "Disc Only",
    modeCase: "Case Only",
    openCase: "Open Case",
    closeCase: "Close Case",
    emptyBack: "Upload a back cover in the panel on the right",
    emptyLeft: "Upload left inner art in the panel on the right",
    tabs: {
      disc: "Disc Face",
      front: "Front Case",
      innerLeft: "Inner Left",
      innerRight: "Inner Right",
      spine: "Spine",
      obi: "Belly Band",
      back: "Back Cover",
    },
    discHint: "Drag to pick a color, live-mapped onto the disc's metallic sheen.",
    discUploadHint: "JPG / PNG · Preview instantly on the disc",
    resetDisc: "Reset to Default (Solid Disc)",
    tintNone: "Clear",
    caseHint: "Drag to tint the case, or go back to clear glass in one click.",
    caseUploadHint:
      "JPG / PNG · Applied to the front of the case (visible through the lid)",
    resetCase: "Reset to Default (Clear Front)",
    obiSplitTitle: "The belly band has its own tab",
    obiSplitBody:
      "The wide strip on the left of the front (about 1/4 of the width) is customized in “Belly Band”, independently of the spine.",
    innerLeftIntro:
      "Once the case is open, the left page is the booklet tucked inside the lid. 2D view expands into a two-page spread automatically.",
    innerLeftTitle: "Left Inner",
    innerLeftUploadHint: "JPG / PNG · Printed on the booklet (inside the lid)",
    resetInnerLeft: "Reset to Default (Blank Insert)",
    innerDragHint:
      "After uploading, drag in 2D view to reframe — the position syncs to 3D.",
    innerRightIntro:
      "Once the case is open, the right page is the disc tray. 2D view expands into a two-page spread automatically.",
    innerRightTitle: "Right Inner",
    innerRightUploadHint: "JPG / PNG · Printed on the tray (under the disc)",
    resetInnerRight: "Reset to Default (Dark Tray)",
    spineIntro:
      "The spine is the thin strip on the far left of the CD case — the only part visible when it sits on a shelf.",
    spineTextLabel: "Spine Text",
    spinePlaceholder: "Type a name or short line",
    spineCount: "Live on the 3D and 2D spine",
    presetsLabel: "Presets",
    fontLabel: "Font",
    bgLabel: "Background",
    textColorLabel: "Text Color",
    textColorHint: "Ink / White / Orange / Silver",
    imageLabel: "Image",
    spineUploadHint: "JPG / PNG · Logo or signature (overrides text)",
    removeImage: "Remove Image (Back to Text)",
    spineImageNote:
      "The image covers the text; the handwriting pad will plug into the same slot later.",
    obiTitle: "Belly Band · Obi Strip",
    obiIntro:
      "The wide strip on the left of the front (about 1/4 of the width), independent of the spine: color, text and image don't affect each other.",
    showObi: "Show Belly Band",
    showObiHint: "Hides the strip in both 3D and 2D when off.",
    obiTextPlaceholder: "Type belly band text",
    applyPreset: "Apply",
    obiUploadPlaceholder: "Upload belly band art (Logo / signature)",
    obiUploadHint: "PNG / JPG · Overrides text",
    backIntro:
      "The back cover is printed on the outside of the case base — flip to the back to see it.",
    backUploadHint: "JPG / PNG · Applied to the back of the case",
    resetBack: "Reset to Default (Clear Back)",
    backDragHint:
      "After uploading, drag in 2D view to reframe — 3D flips to the back automatically.",
    fontLabels: { serif: "Serif", sans: "Sans", mono: "Mono", song: "Song" },
    themeLabels: { glass: "Frosted", dark: "Black", light: "White" },
    colorLabels: {
      ink: "Ink",
      paper: "Ivory",
      orange: "Orange",
      silver: "Silver",
    },
    spineTemplateLabels: {
      love: "To My Love",
      birthday: "Happy Birthday",
      date: "2026.11.07",
      letter: "To My Dearest",
    },
    obiTemplateLabels: {
      obiLove: "To My Love",
      obiBirthday: "Happy Birthday",
      obiDate: "2026.11.07",
      obiLetter: "To My Dearest",
    },
    draftSaved: "Draft saved",
    draftAutoSave: "Changes are saved as a draft (on this device only)",
    draftDiscard: "Discard draft",
    draftRestored: "Your last draft was restored",
  },
  record: {
    eyebrow: "Record Studio",
    title: "Give it a voice.",
    lead: "Record a message, a song, or any sound you want to send along with the CD.",
    memoryTitle: "Add a visual memory to your CD",
    memoryNote: "",
    letterTitle: "Write the letter they'll read",
    letterNote: "",
    paperNames: {
      p01: "Strawberry Cake",
      p02: "Scrapbook",
      p03: "Pink Cake",
      p04: "Typewriter",
      p05: "Kraft Tape",
      p06: "Font Collage",
      p07: "Star Note",
      p08: "Gingham Dots",
      p09: "Pudding Sticky",
      p10: "Dessert Menu",
      p11: "Embroidered Cloth",
    },
    typeMode: "Type",
    handwriteMode: "Handwrite",
    clearStrokes: "Clear Strokes",
    signatureLabel: "Signed",
    signaturePlaceholder: "— Yours, thinking of you",
    reRecord: "Re-record",
    confirm: "Use This Recording",
    confirmed: "Confirmed",
    micUnsupported:
      "Recording isn't supported in this browser. Please use the latest Chrome / Edge.",
    micDenied:
      "Can't access the microphone. Allow microphone access in the address bar and try again.",
    startRec: "Start recording",
    stopRec: "Stop recording",
    playRec: "Play recording",
    pauseRec: "Pause playback",
    playPauseTitle: "Click to play / pause",
    smaller: "Decrease font size",
    bigger: "Increase font size",
    penWidth: "Stroke width",
    textColorPrefix: "Text color",
    removeTitle: "Remove this image",
    colorNames: { ink: "Ink", white: "White", orange: "Orange", navy: "Navy" },
    defaultLetter: LETTER_DEFAULTS.en.text,
    defaultSignature: LETTER_DEFAULTS.en.sign,
    dragHintNote: "",
    tapHintNote: "",
    opening: "Tap · Opening…",
    closePreview: "Close preview",
    handwrittenEmpty: "Handwritten letter (no strokes yet)",
    replyLinkLine1: "Reply link generated (mock): hallo.cd/r/7f3a2c —",
    replyLinkLine2: "Share it so they can cut a CD for you too",
  },
};

const dict: Record<Lang, Dict> = { zh, en };

const STORAGE_KEY = "hallocd-lang";

type LangContextValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  toggleLang: () => void;
  t: Dict;
};

const LangContext = createContext<LangContextValue>({
  lang: "zh",
  setLang: () => {},
  toggleLang: () => {},
  t: zh,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh");

  // 首帧与 SSR 一致（中文），挂载后再恢复本地选择，避免 hydration 不一致
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") setLangState(saved);
  }, []);

  const setLang = (next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const toggleLang = () => setLang(lang === "zh" ? "en" : "zh");

  return (
    <LangContext.Provider value={{ lang, setLang, toggleLang, t: dict[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
