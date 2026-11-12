"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus, Pencil } from "lucide-react";
import NFCExperiencePreview from "./NFCExperiencePreview";
import { useExperience } from "./ExperienceContext";
import { useRoom } from "./RoomProvider";
import { LETTER_DEFAULTS, useLang } from "@/lib/i18n";

/* ============================================================
   文案（中英双份，内联在此 —— 受保护的 lib/i18n.tsx 不动）
   ============================================================ */
const COPY = {
  zh: {
    closeRoom: "关闭 My Room",
    tabCreations: "My Creations · 我制作的",
    tabReceived: "Received · 我收到的",
    currentWork: "当前作品",
    emptyShelf: "这个书架还是空的",
    emptyCds: "还没有 CD —— 去做一张吧",
    editCard: "编辑名片",
    close: "关闭",
    uploadAvatar: "上传头像",
    orPasteUrl: "或粘贴图片 URL",
    name: "名字",
    signature: "个性签名",
    deleteNote: "删除便签",
    notePlaceholder: "写下你的留言...",
  },
  en: {
    closeRoom: "Close My Room",
    tabCreations: "My Creations",
    tabReceived: "Received",
    currentWork: "Current work",
    emptyShelf: "This shelf is still empty",
    emptyCds: "No CDs yet — go make one",
    editCard: "Edit profile card",
    close: "Close",
    uploadAvatar: "Upload avatar",
    orPasteUrl: "or paste an image URL",
    name: "Name",
    signature: "Signature",
    deleteNote: "Delete note",
    notePlaceholder: "Write your note...",
  },
} as const;

/* ============================================================
   CD 数据
   ============================================================ */
type RoomCD = {
  id: string;
  title: string;
  artist: string;
  spineColor: string;
  coverArt: string | null;
  letter: string;
  signature: string;
};

/* ---- 真实订单（GET /api/my/orders 返回的形状） ---- */
type MyCd = {
  orderId: string;
  productId: string;
  theme: string;
  themeEn: string;
  discColor: string;
  coverArt: string | null;
  letter: string;
  signature: string;
  peer: string;
  peerHandle: string | null;
  status: string;
  giftUrl: string;
  createdAt: string;
};

/** 真实订单 → 书架上的一张 CD */
function toRoomCD(c: MyCd, lang: "zh" | "en"): RoomCD {
  return {
    id: c.orderId,
    /* 主题文案中英都有 —— 跟着当前语言走，别在英文界面里露出中文场景名 */
    title: (lang === "en" ? c.themeEn || c.productId : c.theme) || c.productId,
    artist: c.peer,
    spineColor: c.discColor || "#E9DFD2",
    /* discArtUrl 恒为自家上传端点的路径（normalizeAssetRef 保证），可直接当 URL 用 */
    coverArt: c.coverArt || null,
    letter: c.letter || "",
    signature: c.signature || "",
  };
}

const MY_CREATIONS: RoomCD[] = [
  { id: "c-a1", title: "初见", artist: "那年夏天", spineColor: "#AD1457", coverArt: null,
    letter: "第一次见面的那天，\n连风都是甜的。", signature: "—— 初恋" },
  { id: "c-a2", title: "旅行笔记", artist: "背包客", spineColor: "#00897B", coverArt: null,
    letter: "走过很多路，\n最想念的还是出发时的心情。", signature: "—— 在路上" },
  { id: "c-a3", title: "旧磁带", artist: "Walkman", spineColor: "#37474F", coverArt: null,
    letter: "翻出一盘旧磁带，\n里面藏着整个 90 年代的夏天。", signature: "—— 怀旧的人" },
  { id: "c1", title: "夏日晚风", artist: "我 & 你", spineColor: "#E65100", coverArt: "/images/couple-1.jpg",
    letter: "听到这首歌的时候，我刚好在想你。\n那天阳光很好，风把窗帘吹得鼓起来。\n往后的日子，也要一起听很多很多的歌。", signature: "—— 想你的我" },
  { id: "c2", title: "猫咪沙发夜", artist: "My Cat", spineColor: "#6B5236", coverArt: "/images/my-cat.jpg",
    letter: "灯亮着，沙发归它，夜晚归我。\n它的小呼噜，是这个家最暖的白噪音。", signature: "—— 沙发分享者" },
  { id: "c3", title: "Golden Hour", artist: "田野 & 我", spineColor: "#1B3A6B", coverArt: "/images/my-dog.jpg",
    letter: "夕阳追不上它，风也追不上。\n但我记得它朝我跑来的那一刻，全世界都在发光。", signature: "—— 追光的人" },
  { id: "c4", title: "未命名 Demo", artist: "Hallo CD", spineColor: "#2A2A2A", coverArt: null,
    letter: "一段等待被填满的空白。\n也许下一首歌，就是为你写的。", signature: "—— Hallo CD" },
  { id: "c5", title: "Rainy Day", artist: "窗边", spineColor: "#455A64", coverArt: null,
    letter: "窗外的雨下了一整夜。\n我把雨声录下来，寄给远方的你。", signature: "—— 听雨的人" },
  { id: "c6", title: "City Pop", artist: "霓虹", spineColor: "#C2185B", coverArt: null,
    letter: "城市的夜晚从不睡觉。\n这首歌，写给每一个晚归的灵魂。", signature: "—— 夜行者" },
  { id: "c7", title: "海边的卡夫卡", artist: "浪", spineColor: "#00695C", coverArt: null,
    letter: "海浪一遍一遍拍打着礁石。\n像在重复同一句话，又像每次都不一样。", signature: "—— 看海的人" },
  { id: "c8", title: "深夜电台", artist: "陌生人", spineColor: "#5E35B1", coverArt: null,
    letter: "不知道你是谁，但这首歌想送给你。\n愿你在每个深夜都有人陪。", signature: "—— 电台 DJ" },
  { id: "c-z1", title: "晚安曲", artist: "夜", spineColor: "#1A237E", coverArt: null,
    letter: "把这首歌设成晚安铃声，\n就像有人在替你关灯。", signature: "—— 守夜人" },
  { id: "c-z2", title: "春之祭", artist: "四月", spineColor: "#6D4C41", coverArt: null,
    letter: "第一朵花开的时候，\n我想起了你笑起来的样子。", signature: "—— 春日" },
];

const RECEIVED: RoomCD[] = [
  { id: "r1", title: "To: 最好的你", artist: "匿名好友", spineColor: "#7B4B94", coverArt: null,
    letter: "谢谢你一直都在。\n这张 CD 里的每一首歌，都是我想对你说却没说出口的话。", signature: "—— 一个默默关心你的人" },
  { id: "r2", title: "生日快乐", artist: "Mom", spineColor: "#C2185B", coverArt: null,
    letter: "又长大了一岁。\n不管你走多远，家里永远留着一盏灯等你。", signature: "—— 妈妈" },
  { id: "r3", title: "毕业快乐", artist: "大学室友", spineColor: "#2E7D32", coverArt: null,
    letter: "四年前我们拖着行李走进同一间宿舍，\n四年后我们拖着各自的梦想各奔东西。\n但这首歌，我们要一起唱到老。", signature: "—— 睡在我上铺的兄弟" },
  { id: "r4", title: "旧时光", artist: "发小", spineColor: "#EF6C00", coverArt: null,
    letter: "翻到老照片，突然就想起了你。\n那时候我们以为永远不会分开。", signature: "—— 老朋友" },
  { id: "r5", title: "给未来的我", artist: "过去的我", spineColor: "#00838F", coverArt: null,
    letter: "希望你还在听喜欢的歌，\n还在为喜欢的人心动。", signature: "—— 曾经的你" },
];

/* 毛毡板照片 */
type BoardPhoto = {
  id: string;
  src: string;
  x: number;
  y: number;
  rotate: number;
};

const INITIAL_BOARD_PHOTOS: BoardPhoto[] = [
  { id: "b1", src: "/images/couple-1.jpg", x: 48, y: 56, rotate: -4 },
  { id: "b2", src: "/images/my-dog.jpg", x: 230, y: 72, rotate: 5 },
];

/* 便签 */
type NoteColor = "yellow" | "pink" | "green" | "cream";

/* 便签皮肤：纯色 + 插画图片 */
type NoteSkin =
  | { id: NoteColor; type: "color"; bg: string; label: string; labelEn: string }
  | { id: string; type: "image"; bg: string; label: string; labelEn: string };

const NOTE_SKINS: NoteSkin[] = [
  { id: "yellow", type: "color", bg: "#FFF3B0", label: "复古黄", labelEn: "Retro yellow" },
  { id: "pink", type: "color", bg: "#FFD6DC", label: "浅粉", labelEn: "Soft pink" },
  { id: "green", type: "color", bg: "#D4EAC8", label: "淡绿", labelEn: "Pale green" },
  { id: "img-1", type: "image", bg: "/notes/note-1.png", label: "便签 · 01", labelEn: "Note · 01" },
  { id: "img-2", type: "image", bg: "/notes/note-2.png", label: "便签 · 02", labelEn: "Note · 02" },
  { id: "img-3", type: "image", bg: "/notes/note-3.png", label: "便签 · 03", labelEn: "Note · 03" },
  { id: "img-4", type: "image", bg: "/notes/note-4.png", label: "便签 · 04", labelEn: "Note · 04" },
  { id: "img-5", type: "image", bg: "/notes/note-5.png", label: "便签 · 05", labelEn: "Note · 05" },
  { id: "img-6", type: "image", bg: "/notes/note-6.png", label: "便签 · 06", labelEn: "Note · 06" },
];
const NOTE_IMAGE_SKINS = NOTE_SKINS.filter((s) => s.type === "image") as
  Extract<NoteSkin, { type: "image" }>[];
const NOTE_BG: Record<NoteColor, string> = {
  yellow: "#FFF3B0",
  pink: "#FFD6DC",
  green: "#D4EAC8",
  cream: "#F5EFE0",
};

type StickyNote = {
  id: string;
  text: string;
  color: NoteColor;
  backgroundImage?: string;
  x: number;
  y: number;
  rotate: number;
};

const INITIAL_NOTES: StickyNote[] = [
  { id: "n1", text: "Make a wish...", color: "yellow", x: 200, y: 120, rotate: -3 },
];

/* ============================================================
   木纹质感
   ============================================================ */
function woodStyle(dark = false) {
  const base = dark ? "#6B4F30" : "#A17E52";
  const edge = dark ? "#4A3420" : "#7E5E38";
  return {
    background: `
      repeating-linear-gradient(92deg,
        rgba(0,0,0,0.08) 0px, rgba(0,0,0,0.08) 1px,
        transparent 1px, transparent 8px),
      repeating-linear-gradient(89deg,
        rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 2px,
        transparent 2px, transparent 14px),
      linear-gradient(180deg, ${base} 0%, ${edge} 100%)
    `,
  } as const;
}

function shade(hex: string, percent: number) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export default function MyRoom() {
  /* 全屏层的开关由全局导航 SiteNav 控制（两者不在同一层组件树） */
  const { open, closeRoom } = useRoom();
  const { lang } = useLang();
  const copy = COPY[lang];
  const [tab, setTab] = useState<"creations" | "received">("creations");
  /* 场景切换：minimal = 现有极简墙，cozy = 复古深绿角落 */
  const [scene, setScene] = useState<"minimal" | "cozy">("minimal");
  const [activeCD, setActiveCD] = useState<RoomCD | null>(null);
  const [boardPhotos, setBoardPhotos] = useState<BoardPhoto[]>(INITIAL_BOARD_PHOTOS);
  const [notes, setNotes] = useState<StickyNote[]>(INITIAL_NOTES);
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  const [editingSkin, setEditingSkin] = useState<NoteSkin | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const corkboardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- 个人资料（localStorage 持久化） ---- */
  type RoomProfile = { avatar: string; name: string; bio: string };
  const [profile, setProfile] = useState<RoomProfile>(() => {
    if (typeof window === "undefined")
      return { avatar: "", name: "Alex's Room", bio: "Collecting memories, one disc at a time." };
    try {
      const saved = localStorage.getItem("hellocd_profile");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<RoomProfile>;
        return {
          avatar: String(parsed.avatar ?? ""),
          name: String(parsed.name ?? "Alex's Room"),
          bio: String(parsed.bio ?? "Collecting memories, one disc at a time."),
        };
      }
    } catch {}
    return { avatar: "", name: "Alex's Room", bio: "Collecting memories, one disc at a time." };
  });
  const [editOpen, setEditOpen] = useState(false);

  const handleSaveProfile = (p: RoomProfile) => {
    setProfile(p);
    try {
      localStorage.setItem("hellocd_profile", JSON.stringify(p));
    } catch {}
    setEditOpen(false);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      const rotate = Math.round((Math.random() * 10 - 5) * 10) / 10; // -5 ~ 5 deg
      setBoardPhotos((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          src,
          x: 60 + Math.random() * 80,
          y: 40 + Math.random() * 90,
          rotate,
        },
      ]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  /* ---- 便签 ---- */
  const openNoteEditor = (skin: NoteSkin) => {
    setEditingSkin(skin);
    setNoteDraft("");
    setNoteMenuOpen(false);
  };
  const pinNote = () => {
    if (!editingSkin || !noteDraft.trim()) {
      setEditingSkin(null);
      return;
    }
    const rotate = Math.round((Math.random() * 8 - 4) * 10) / 10; // -4 ~ 4 deg
    setNotes((prev) => [
      ...prev,
      {
        id: `n-${Date.now()}`,
        text: noteDraft.trim(),
        color: editingSkin.type === "color" ? editingSkin.id : "cream",
        backgroundImage: editingSkin.type === "image" ? editingSkin.bg : undefined,
        x: 80 + Math.random() * 160,
        y: 60 + Math.random() * 100,
        rotate,
      },
    ]);
    setEditingSkin(null);
    setNoteDraft("");
  };
  const deleteNote = (id: string) => setNotes((prev) => prev.filter((n) => n.id !== id));

  const { caseCoverUrl, discColor, letterText, signatureText } = useExperience();
  const currentCreation: RoomCD = {
    id: "current",
    title: copy.currentWork,
    artist: "Hallo CD Studio",
    spineColor: discColor,
    coverArt: caseCoverUrl,
    /* 用户没写过就退回到产品默认信 —— 默认信本身有中英两份，
       别拿演示数据（中文）来兜底，否则英文界面里会漏出中文。 */
    letter: letterText?.trim() || LETTER_DEFAULTS[lang].text,
    signature: signatureText?.trim() || LETTER_DEFAULTS[lang].sign,
  };

  /* ---- 我的订单：登录后读真实数据 ----
   *
   * 规则很简单：**登录了就只显示真实订单，没登录才显示演示数据**。
   *
   * 以前这个房间里永远摆着 11 张「我制作的」+ 5 张「我收到的」假 CD，
   * 登录与否都一样 —— 那等于往用户的私人空间里塞虚构的作品。
   * 现在：登录用户看到的是自己真实送出 / 收到的 CD（没有就是没有），
   * 未登录访客看到的仍是演示房间（那是给访客看的样板，不是冒充谁的作品）。
   */
  const [room, setRoom] = useState<{
    authed: boolean;
    sent: RoomCD[];
    received: RoomCD[];
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/my/orders", { credentials: "same-origin" });
        if (cancelled) return;
        if (res.status === 401) {
          setRoom({ authed: false, sent: [], received: [] });
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as {
          success?: boolean;
          handle?: string;
          displayName?: string;
          sent?: MyCd[];
          received?: MyCd[];
        };
        if (cancelled || !data?.success) return;
        setRoom({
          authed: true,
          sent: (data.sent ?? []).map((c) => toRoomCD(c, lang)),
          received: (data.received ?? []).map((c) => toRoomCD(c, lang)),
        });
        /* 房间名片没自定义过的话，用账号昵称 —— 别让登录用户看到
           别人的样板名字「Alex's Room」。 */
        try {
          if (!localStorage.getItem("hellocd_profile")) {
            setProfile((p) => ({
              ...p,
              name: data.displayName || data.handle || p.name,
            }));
          }
        } catch {}
      } catch {
        /* 网络失败就保持现状，不打断界面 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, lang]);

  const authed = room?.authed === true;
  const list = authed
    ? tab === "creations"
      ? [currentCreation, ...room!.sent]
      : room!.received
    : tab === "creations"
      ? [currentCreation, ...MY_CREATIONS]
      : RECEIVED;

  return (
    <>
      {/* 右上角入口 + 语言切换已移到全局导航 SiteNav（app/layout.tsx），
          这里只保留全屏覆盖层本体 */}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[100] overflow-hidden transition-colors duration-500"
            style={{ backgroundColor: "#F8F4EC" }}
          >
            {/* 关闭 */}
            <button
              type="button"
              onClick={closeRoom}
              aria-label={copy.closeRoom}
              className="fixed right-6 top-6 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-[#1C2329]/5 text-[#1C2329]/60 transition hover:bg-[#1C2329]/10 hover:text-[#1C2329]"
            >
              <X className="h-5 w-5" strokeWidth={1.5} />
            </button>

            {/* Tab */}
            <div className="fixed left-1/2 top-6 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-black/10 bg-white/60 p-1 backdrop-blur">
              {([
                { key: "creations", label: copy.tabCreations },
                { key: "received", label: copy.tabReceived },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-wide transition ${
                    tab === t.key
                      ? "bg-[#1C2329] text-[#F8F4EC] shadow"
                      : "text-[#1C2329]/55 hover:text-[#1C2329]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <span className="mx-1 h-4 w-px bg-black/15" />
              {([
                { key: "minimal", label: "Minimalist" },
                { key: "cozy", label: "Cozy Corner" },
              ] as const).map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setScene(s.key)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wide transition ${
                    scene === s.key
                      ? "bg-[#B5713F] text-[#FFF7EA] shadow"
                      : "text-[#1C2329]/55 hover:text-[#1C2329]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* ============================================================
                居中容器（flex-col：墙面 flex-1 占大头，书柜贴底；毛毡板右侧对齐）
                ============================================================ */}
            {scene === "cozy" ? (
              <CozyCornerScene
                cds={list}
                onPick={setActiveCD}
                photos={boardPhotos}
                notes={notes}
                onDeleteNote={deleteNote}
                boardRef={corkboardRef}
                fileInputRef={fileInputRef}
                onUpload={handleUpload}
                noteMenuOpen={noteMenuOpen}
                onToggleNoteMenu={() => setNoteMenuOpen((v) => !v)}
                onPickNoteSkin={openNoteEditor}
              />
            ) : (
            <div className="relative mx-auto flex h-full max-w-6xl flex-col px-8">
              {/* ---------- 墙面（上方，flex-1，极简留白） ---------- */}
              <div className="relative flex w-full flex-1 items-end justify-center pb-2">
                {/* 顶部暖光射灯 */}
                <div
                  className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2"
                  style={{
                    background:
                      "radial-gradient(circle at top, rgba(255,230,180,0.45) 0%, rgba(255,230,180,0.12) 35%, transparent 65%)",
                  }}
                />
              </div>

              {/* ---------- 底部书柜（压缩到 ~22%，贴底） ---------- */}
              <div className="relative h-[22%] w-full shrink-0">
                {/* CD 收纳柜：严丝合缝放在书柜顶板上，带投影 */}
                <div
                  className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2"
                  style={{ bottom: "calc(100% - 1.5rem)" }}
                >
                  <div className="pointer-events-auto">
                    <CDStorageBox cds={list} onPick={setActiveCD} />
                  </div>
                </div>

                {/* 第一层：书柜顶板（极窄 h-6，体现木板厚度） */}
                <div
                  className="absolute top-0 z-10 h-6 w-full"
                  style={{
                    ...woodStyle(true),
                    boxShadow:
                      "0 5px 12px -4px rgba(0,0,0,0.5), inset 0 1.5px 0 rgba(255,255,255,0.2), inset 0 -2px 5px rgba(0,0,0,0.4)",
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-b from-white/30 to-transparent" />
                </div>

                {/* 第二层：书柜立面（玻璃门 + 内部书籍） */}
                <div
                  className="absolute bottom-0 top-6 w-full overflow-hidden"
                  style={{
                    background:
                      "linear-gradient(180deg, #1A130D 0%, #0E0A07 100%)",
                    boxShadow: "inset 0 8px 18px rgba(0,0,0,0.7)",
                  }}
                >
                  {/* 内部顶部射灯高光 */}
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-12"
                    style={{
                      background:
                        "radial-gradient(ellipse at 50% 0%, rgba(255,220,160,0.18) 0%, transparent 70%)",
                    }}
                  />

                  {/* 玻璃柜门：极淡底色 + 对角线反光（内部已清空） */}
                  <div
                    className="absolute inset-0 bg-white/5"
                    style={{
                      backdropFilter: "blur(1px)",
                      WebkitBackdropFilter: "blur(1px)",
                    }}
                  >
                    {/* 对角线白色反光渐变 */}
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(115deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.08) 100%)",
                      }}
                    />
                    {/* 细高光条 */}
                    <div className="absolute left-3 top-2 h-2/3 w-6 -rotate-6 rounded-full bg-white/12 blur-[1.5px]" />
                  </div>

                  {/* 金属边框 + 柜门分割 */}
                  <div className="pointer-events-none absolute inset-0 flex">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="relative flex-1 border-r border-white/10 last:border-r-0"
                      >
                        {/* 金属把手 */}
                        <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#C9A96A] to-[#8B6F47] shadow-[0_0_4px_rgba(0,0,0,0.6)] ring-1 ring-black/40" />
                      </div>
                    ))}
                  </div>

                  {/* 玻璃外框金属细线 */}
                  <div className="pointer-events-none absolute inset-0 rounded-sm ring-1 ring-inset ring-white/15" />
                </div>
              </div>

              {/* ============ 左侧个人名片（与毛毡板呼应） ============ */}
              <ProfileCard
                profile={profile}
                onEdit={() => setEditOpen(true)}
                cdCount={authed ? room!.sent.length : MY_CREATIONS.length + 1}
                memoryCount={authed ? room!.received.length : RECEIVED.length}
              />

              {/* ============ 横向毛毡板（顶部对齐名片，左侧对齐 CD 柜） ============ */}
              <div
                ref={corkboardRef}
                className="absolute top-20 z-10 rounded-lg p-3"
              style={{
                // left = 容器中线 - CD 柜半宽（与 CD 柜 width: min(44vw,340px) 同源），左边缘严格对齐
                left: "calc(50% - min(22vw, 170px))",
                width: "60%",
                maxWidth: "714px",
                height: "44vh",
                background:
                  "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.06) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(0,0,0,0.06) 0%, transparent 50%), #C69C6D",
                boxShadow:
                  "0 18px 40px -12px rgba(0,0,0,0.45), inset 0 2px 4px rgba(0,0,0,0.15)",
                border: "6px solid #4A3420",
                borderRadius: "8px",
              }}
            >
              {/* 细微颗粒噪点（SVG 噪点叠加） */}
              <div
                className="pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
              />

              {/* 毛毡板上的拍立得照片 */}
              {boardPhotos.map((p) => (
                <BoardPolaroid
                  key={p.id}
                  photo={p}
                  constraintsRef={corkboardRef}
                />
              ))}

              {/* 毛毡板上的便签 */}
              {notes.map((n) => (
                <StickyNoteCard
                  key={n.id}
                  note={n}
                  constraintsRef={corkboardRef}
                  onDelete={() => deleteNote(n.id)}
                />
              ))}

              {/* 上传按钮 */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUpload}
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-md border-2 border-dashed border-[#4A3420]/40 bg-white/20 px-3 py-1.5 text-xs font-semibold text-[#3A2A1A] transition hover:bg-white/35"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Photo
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNoteMenuOpen((v) => !v)}
                    className="flex items-center gap-1.5 rounded-md border-2 border-dashed border-[#4A3420]/40 bg-white/20 px-3 py-1.5 text-xs font-semibold text-[#3A2A1A] transition hover:bg-white/35"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Note
                  </button>
                  {/* 皮肤选择菜单：3 纯色 + 3 图片 */}
                  {noteMenuOpen && (
                    <div className="absolute bottom-full right-0 mb-2 rounded-lg bg-white/95 p-2 shadow-lg backdrop-blur">
                      <NoteSkinPicker onPick={openNoteEditor} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            </div>
            )}

            {/* ============ 便签编辑弹窗 ============ */}
            <AnimatePresence>
              {editingSkin && (
                <NoteEditModal
                  skin={editingSkin}
                  draft={noteDraft}
                  onDraftChange={setNoteDraft}
                  onSkinChange={setEditingSkin}
                  onCancel={() => {
                    setEditingSkin(null);
                    setNoteDraft("");
                  }}
                  onPin={pinNote}
                />
              )}
            </AnimatePresence>

            {/* ============ CD 播放弹窗 ============ */}
            <AnimatePresence>
              {activeCD && (
                <NFCExperiencePreview
                  audioUrl={null}
                  mediaFile={null}
                  letterText={activeCD.letter}
                  signature={activeCD.signature}
                  onClose={() => setActiveCD(null)}
                />
              )}
            </AnimatePresence>

            {/* ============ 编辑名片弹窗 ============ */}
            <AnimatePresence>
              {editOpen && (
                <EditProfileModal
                  profile={profile}
                  onClose={() => setEditOpen(false)}
                  onSave={handleSaveProfile}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ============================================================
   场景 2：Cozy Corner（温暖明亮的午后角落，纯 CSS 微缩立体房间）
   ------------------------------------------------------------
   构图：
   · 左：米白单人沙发（前景，四条木腿踩在地板上）
   · 中：通顶原木书柜（靠墙，位于沙发之后）
   · 右：横向木质 CD 收纳盒（可点击）
   ============================================================ */
/* CD 盒内的低饱和度复古色系（莫兰迪调），浅底用深灰字、深底用米白字 */
const RETRO_SPINE_COLORS: { bg: string; text: string }[] = [
  { bg: "#D4B5B0", text: "#333333" }, // 灰粉
  { bg: "#A3B19B", text: "#333333" }, // 鼠尾草绿
  { bg: "#A0B2C6", text: "#333333" }, // 灰蓝
  { bg: "#E3D8C8", text: "#333333" }, // 燕麦色
  { bg: "#5E6165", text: "#F8F4EC" }, // 炭灰
  { bg: "#C08B79", text: "#333333" }, // 复古砖红
  { bg: "#495A6E", text: "#F8F4EC" }, // 深藏青
  { bg: "#C2B29F", text: "#333333" }, // 暖卡其
];

/** 书柜单层：留白陈列格 + 底部木层板 */
function CozyShelfCell() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 格内背板阴影 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(120,88,56,0.16) 0%, rgba(120,88,56,0.04) 100%)",
        }}
      />
      {/* 木层板：上缘高光 + 下方投影，体现厚度 */}
      <div
        className="absolute inset-x-0 bottom-0 h-[6px]"
        style={{
          background: "linear-gradient(180deg, #E1C79B 0%, #C0A06A 60%, #A9854F 100%)",
          boxShadow:
            "inset 0 -4px 6px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 6px rgba(0,0,0,0.10)",
        }}
      />
    </div>
  );
}

function CozyCornerScene({
  cds,
  onPick,
  photos,
  notes,
  onDeleteNote,
  boardRef,
  fileInputRef,
  onUpload,
  noteMenuOpen,
  onToggleNoteMenu,
  onPickNoteSkin,
}: {
  cds: RoomCD[];
  onPick: (cd: RoomCD) => void;
  photos: BoardPhoto[];
  notes: StickyNote[];
  onDeleteNote: (id: string) => void;
  boardRef: React.RefObject<HTMLDivElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  noteMenuOpen: boolean;
  onToggleNoteMenu: () => void;
  onPickNoteSkin: (skin: NoteSkin) => void;
}) {
  const { lang } = useLang();
  const copy = COPY[lang];
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* ---------- 墙面：温暖米色 ---------- */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(180deg, #FBF8F2 0%, #F8F4EC 58%, #F2EADA 100%)",
        }}
      />

      {/* ---------- 左上：暖黄阳光（径向渐变） ---------- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(58% 62% at 17% 24%, rgba(255,214,150,0.55) 0%, rgba(255,214,150,0.22) 38%, transparent 72%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(42% 40% at 68% 18%, rgba(255,232,196,0.30) 0%, transparent 70%)",
        }}
      />

      {/* ---------- 地面：浅木色地板（屏高 15%） ---------- */}
      <div className="absolute inset-x-0 bottom-0" style={{ height: "15%" }}>
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(150,110,70,0.10) 0px, rgba(150,110,70,0.10) 1px, transparent 1px, transparent 76px), repeating-linear-gradient(0deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.10) 1px, transparent 1px, transparent 52px), linear-gradient(180deg, #EADAC1 0%, #DDC8A9 100%)",
            boxShadow: "inset 0 20px 36px rgba(120,90,55,0.14)",
          }}
        />
        {/* 踢脚线 */}
        <div
          className="absolute inset-x-0 top-0 h-[10px]"
          style={{
            background: "linear-gradient(180deg, #F4ECDC 0%, #E9DDC8 100%)",
            boxShadow:
              "0 2px 4px rgba(120,90,55,0.18), inset 0 -1px 0 rgba(255,255,255,0.6)",
          }}
        />
        {/* 家具前的暖光落影 */}
        <div
          className="pointer-events-none absolute left-[4%] top-[30%] h-[62%] w-[48%]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255,224,170,0.42) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* ---------- 左：沙发 + 中：书柜（同一 flex 组，沙发略靠前） ---------- */}
      <div
        className="absolute flex items-end"
        style={{ left: "20.5%", bottom: "15%", width: "36%", height: "53vh", zIndex: 1 }}
      >
        {/* 沙发：底部中心为原点缩放，四腿踩在 15% 地板线上 */}
        <div
          className="relative w-[54%] shrink-0"
          style={{
            height: "31vh",
            zIndex: 3,
            transform: "translateY(7.5vh) scale(0.85)",
            transformOrigin: "bottom center",
          }}
        >
          {/* 地面投影 */}
          <div
            className="pointer-events-none absolute -bottom-3 left-[3%] right-[3%] h-9"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(90,64,40,0.34) 0%, rgba(90,64,40,0.12) 46%, transparent 76%)",
              filter: "blur(5px)",
            }}
          />

          {/* 靠背：外投影 + 顶部内高光 + 底部内阴影 */}
          <div
            className="absolute left-[7%] right-[7%] top-0 h-[56%]"
            style={{
              background: "linear-gradient(180deg, #F7F0E3 0%, #E7DCC9 100%)",
              borderRadius: "26px 26px 12px 12px",
              boxShadow:
                "inset 0 10px 18px rgba(255,255,255,0.8), inset 0 -16px 24px rgba(120,94,64,0.16), 0 10px 26px -16px rgba(90,64,40,0.32)",
            }}
          />

          {/* 左扶手 */}
          <div
            className="absolute left-0 top-[24%] h-[50%] w-[13%]"
            style={{
              background: "linear-gradient(90deg, #EFE5D3 0%, #F8F2E6 55%, #E2D6C1 100%)",
              borderRadius: "16px 10px 10px 14px",
              boxShadow:
                "inset 0 4px 8px rgba(255,255,255,0.6), 0 8px 18px -12px rgba(90,64,40,0.3)",
            }}
          />
          {/* 右扶手 */}
          <div
            className="absolute right-0 top-[24%] h-[50%] w-[13%]"
            style={{
              background: "linear-gradient(90deg, #E2D6C1 0%, #F8F2E6 45%, #EFE5D3 100%)",
              borderRadius: "10px 16px 14px 10px",
              boxShadow:
                "inset 0 4px 8px rgba(255,255,255,0.6), 0 8px 18px -12px rgba(90,64,40,0.3)",
            }}
          />

          {/* 坐垫：顶部内高光 + 底部内阴影 + 外投影 */}
          <div
            className="absolute left-[6%] right-[6%] bottom-[17%] h-[27%]"
            style={{
              background: "linear-gradient(180deg, #F9F3E8 0%, #EADFCD 100%)",
              borderRadius: 16,
              boxShadow:
                "inset 0 8px 14px rgba(255,255,255,0.8), inset 0 -12px 18px rgba(120,94,64,0.20), 0 16px 28px -18px rgba(90,64,40,0.36)",
            }}
          />

          {/* 四条外八字浅木腿 */}
          <div
            className="absolute bottom-[1%] left-[14%] h-[12%] w-[5px]"
            style={{ background: "linear-gradient(90deg, #CBA87C 0%, #A07B54 100%)", transform: "rotate(15deg)", transformOrigin: "top center" }}
          />
          <div
            className="absolute bottom-[1%] right-[14%] h-[12%] w-[5px]"
            style={{ background: "linear-gradient(90deg, #CBA87C 0%, #A07B54 100%)", transform: "rotate(-15deg)", transformOrigin: "top center" }}
          />
          <div
            className="absolute bottom-[2%] left-[30%] h-[9%] w-[4px]"
            style={{ background: "linear-gradient(90deg, #BF9C70 0%, #96704A 100%)", transform: "rotate(9deg)", transformOrigin: "top center" }}
          />
          <div
            className="absolute bottom-[2%] right-[30%] h-[9%] w-[4px]"
            style={{ background: "linear-gradient(90deg, #BF9C70 0%, #96704A 100%)", transform: "rotate(-9deg)", transformOrigin: "top center" }}
          />
        </div>

        {/* 书柜：位于沙发之后，左移使左缘落在沙发右侧 1/3 处 */}
        <div
          className="relative w-[50%] shrink-0"
          style={{
            height: "100%",
            marginLeft: "-18%",
            zIndex: 1,
          }}
        >
          <div
            className="relative flex h-full w-full flex-col"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 16%, rgba(90,64,40,0.12) 100%), linear-gradient(90deg, #D2B283 0%, #C4A06E 12%, #B28C5D 86%, #A07946 100%)",
              padding: "10px 10px 12px",
              borderRadius: 4,
              border: "1px solid rgba(120,86,53,0.32)",
              boxShadow:
                "inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 1px 0 rgba(255,255,255,0.55), 0 26px 52px -22px rgba(90,64,40,0.48), 0 8px 16px -10px rgba(90,64,40,0.35)",
            }}
          >
            {/* 顶板 */}
            <div
              className="h-[8px] w-full shrink-0 rounded-[2px]"
              style={{
                background: "linear-gradient(180deg, #DABD92 0%, #B79660 100%)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 4px rgba(90,64,40,0.22)",
              }}
            />
            {/* 5 层横向层板：干净留白的陈列格 */}
            <div className="mt-[6px] flex min-h-0 flex-1 flex-col gap-[6px]">
              {[0, 1, 2, 3, 4].map((s) => (
                <div key={s} className="min-h-0 flex-1">
                  <CozyShelfCell />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 右：横向 CD 收纳盒（薄木框 + 玻璃反光 + 落地阴影） ---------- */}
      <div
        className="absolute"
        style={{
          left: "51.9%",
          width: "24%",
          bottom: "15%",
          height: "12vh",
          zIndex: 2,
        }}
      >
        {/* 落地阴影：柔和扩散 + 紧贴底部的接触阴影 */}
        <div
          className="pointer-events-none absolute -bottom-2 left-[5%] right-[5%] h-6"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(120,95,65,0.24) 0%, rgba(120,95,65,0.08) 48%, transparent 78%)",
            filter: "blur(3px)",
          }}
        />
        {/* ---------- 浅橡木外框：清新木色 + 顶部高光 + 底部厚度内阴影 ---------- */}
        <div
          className="relative h-full w-full rounded-[5px]"
          style={{
            background: `
              repeating-linear-gradient(91deg, rgba(255,255,255,0.30) 0px, rgba(255,255,255,0.30) 1px, transparent 1px, transparent 11px),
              repeating-linear-gradient(89deg, rgba(160,120,80,0.10) 0px, rgba(160,120,80,0.10) 1px, transparent 1px, transparent 19px),
              linear-gradient(180deg, #F2E4CB 0%, #E6D3B3 46%, #D8C09C 100%)
            `,
            padding: "5px 6px 6px",
            borderTop: "1px solid rgba(255,255,255,0.70)",
            borderLeft: "1px solid rgba(255,255,255,0.50)",
            borderRight: "1px solid rgba(255,255,255,0.35)",
            borderBottom: "1px solid rgba(150,110,70,0.38)",
            boxShadow:
              "inset 0 -6px 10px rgba(150,110,70,0.20), inset 0 2px 0 rgba(255,255,255,0.55), 0 10px 20px -12px rgba(120,90,55,0.35), 0 2px 5px -2px rgba(120,90,55,0.25)",
          }}
        >
          {/* 内侧陈列槽：奶油白 + 微弱玻璃反光 */}
          <div
            className="relative flex h-full w-full flex-col rounded-[3px]"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,252,247,0.94) 0%, rgba(247,238,224,0.96) 100%)",
              padding: "4px 5px 5px",
              boxShadow:
                "inset 0 2px 6px rgba(150,110,70,0.20), inset 0 -1px 0 rgba(255,255,255,0.9), 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            {/* 斜向玻璃反光 */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[3px]"
              style={{
                background:
                  "linear-gradient(115deg, rgba(255,255,255,0.55) 0%, rgba(226,243,250,0.28) 30%, rgba(255,255,255,0) 58%, rgba(255,255,255,0.18) 100%)",
              }}
            />
            {/* 亚克力顶部折射线（极细） */}
            <div
              className="mb-[3px] h-[2px] w-full shrink-0"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(196,225,240,0.55) 20%, rgba(228,246,252,0.85) 50%, rgba(196,225,240,0.55) 80%, transparent 100%)",
                opacity: 0.9,
              }}
            />
            {/* 紧凑卡槽：细长 CD，hover 抽出 / 点击播放 */}
            <div
              className="relative flex min-h-0 flex-1 items-end justify-between gap-0 rounded-[2px] px-2 pb-[2px]"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(232,221,203,0.95) 0%, rgba(211,196,172,0.95) 100%)",
                boxShadow:
                  "inset 0 2px 5px rgba(150,110,70,0.22), inset 0 1px 0 rgba(255,255,255,0.75)",
              }}
            >
              {cds.length === 0 ? (
                <span className="self-center px-2 text-[10px] italic text-[#1C2329]/30">
                  {copy.emptyShelf}
                </span>
              ) : (
                cds.slice(0, 12).map((cd, i) => (
                  <CDItem key={cd.id} cd={cd} index={i} onClick={() => onPick(cd)} compact />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 毛毡板：挂在 CD 盒正上方 ----------
          水平中心线与 CD 盒一致（同为 left 51.9% / width 24%）；
          整体上移 90px，使板体视觉中心落在书柜上半部分（约第 2-3 格之间） */}
      <div
        className="absolute"
        style={{
          left: "51.9%",
          width: "24%",
          top: "calc(42.6vh - 72px)",
          height: "calc(28vh - 16px)",
          zIndex: 2,
        }}
      >
        {/* 深色木框（挂墙） */}
        <div
          className="h-full w-full rounded-[7px]"
          style={{
            background: "linear-gradient(135deg, #7E5732 0%, #5C3A21 55%, #4A2C16 100%)",
            padding: "5px",
            boxShadow:
              "0 18px 34px -16px rgba(40,26,12,0.55), 0 4px 10px -6px rgba(40,26,12,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
          }}
        >
          {/* 软木面：可拖拽照片 / 便签 */}
          <div
            ref={boardRef}
            className="relative h-full w-full overflow-hidden rounded-[3px] p-2"
            style={{
              background:
                "radial-gradient(circle at 30% 18%, rgba(255,255,255,0.07) 0%, transparent 52%), radial-gradient(circle at 74% 82%, rgba(0,0,0,0.07) 0%, transparent 55%), #C69C6D",
              boxShadow:
                "inset 0 2px 5px rgba(60,38,18,0.35), inset 0 -1px 0 rgba(255,255,255,0.12)",
            }}
          >
            {/* 软木颗粒噪点 */}
            <div
              className="pointer-events-none absolute inset-0 opacity-20 mix-blend-overlay"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              }}
            />

            {/* 拍立得照片 */}
            {photos.map((p) => (
              <BoardPolaroid
                key={p.id}
                photo={p}
                constraintsRef={boardRef}
                compact
              />
            ))}

            {/* 便签 */}
            {notes.map((n) => (
              <StickyNoteCard
                key={n.id}
                note={n}
                constraintsRef={boardRef}
                onDelete={() => onDeleteNote(n.id)}
                compact
              />
            ))}

            {/* 上传 / 便签按钮 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onUpload}
            />
            <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded border border-dashed border-[#4A3420]/45 bg-white/25 px-2 py-1 text-[10px] font-semibold text-[#3A2A1A] transition hover:bg-white/40"
              >
                <Plus className="h-3 w-3" />
                Add Photo
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={onToggleNoteMenu}
                  className="flex items-center gap-1 rounded border border-dashed border-[#4A3420]/45 bg-white/25 px-2 py-1 text-[10px] font-semibold text-[#3A2A1A] transition hover:bg-white/40"
                >
                  <Plus className="h-3 w-3" />
                  Add Note
                </button>
                {noteMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-2 rounded-lg bg-white/95 p-1.5 shadow-lg backdrop-blur">
                    <NoteSkinPicker onPick={onPickNoteSkin} small />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- 整体柔和暗角 ---------- */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 95% at 50% 32%, transparent 66%, rgba(120,96,64,0.10) 100%)",
        }}
      />
    </div>
  );
}

function CDStorageBox({
  cds,
  onPick,
}: {
  cds: RoomCD[];
  onPick: (cd: RoomCD) => void;
}) {
  const { lang } = useLang();
  const copy = COPY[lang];
  return (
    <div
      className="relative rounded-md"
      style={{
        ...woodStyle(true),
        width: "min(44vw, 340px)",
        padding: "6px 8px 8px",
        border: "1px solid rgba(255,255,255,0.18)",
        boxShadow:
          "0 10px 24px -10px rgba(0,0,0,0.4), 0 2px 6px -2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
      }}
    >
      {/* 顶部：极薄木纹线 */}
      <div
        className="mb-1.5 h-1 w-full"
        style={{
          background:
            "repeating-linear-gradient(90deg, rgba(0,0,0,0.2) 0px, rgba(0,0,0,0.2) 1px, transparent 1px, transparent 7px)",
          opacity: 0.5,
        }}
      />

      {/* CD 竖向陈列区（紧凑整齐） */}
      <div className="flex h-28 items-end gap-[2px] overflow-hidden rounded-sm bg-black/20 px-2 py-1">
        {cds.length === 0 ? (
          <span className="self-center px-1 text-[10px] italic text-white/40">
            {copy.emptyCds}
          </span>
        ) : (
          cds.map((cd, i) => (
            <CDItem key={cd.id} cd={cd} index={i} onClick={() => onPick(cd)} />
          ))
        )}
      </div>
    </div>
  );
}

/* 单张 CD：hover 向上抽出 */
function CDItem({
  cd,
  index,
  onClick,
  compact = false,
}: {
  cd: RoomCD;
  index: number;
  onClick: () => void;
  compact?: boolean;
}) {
  /* 嵌入场景时使用低饱和复古色，其他场景沿用原始配色 */
  const retro = RETRO_SPINE_COLORS[index % RETRO_SPINE_COLORS.length];
  const spineColor = compact ? retro.bg : cd.spineColor;
  const spineText = compact ? retro.text : "rgba(255,255,255,0.95)";
  return (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -34 }}
      transition={{ type: "spring", stiffness: 320, damping: 22 }}
      className={`group relative h-full cursor-pointer ${
        compact ? "min-w-0 flex-1" : "w-[20px] shrink-0"
      }`}
      style={{
        zIndex: 1,
        ...(compact ? { borderRight: "1px solid rgba(35,30,26,0.35)" } : {}),
      }}
    >
      {/* 脊背主体 */}
      <div
        className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[1.5px]"
        style={{
          background: !compact && cd.coverArt
            ? `url(${cd.coverArt}) center/cover`
            : `linear-gradient(180deg, ${spineColor}, ${shade(spineColor, compact ? -10 : -32)})`,
          boxShadow: compact
            ? "inset 0 0 4px rgba(0,0,0,0.10), inset 1px 0 0 rgba(255,255,255,0.50), inset -1px 0 0 rgba(120,100,80,0.16), 0 1px 2px rgba(120,90,55,0.16)"
            : "inset 1px 0 0 rgba(255,255,255,0.22), inset -1px 0 0 rgba(0,0,0,0.28), 0 1px 3px rgba(0,0,0,0.3)",
        }}
      >
        <div className={`absolute inset-0 ${compact ? "bg-white/10" : "bg-black/30"}`} />
        {/* 塑料光盘斜向反光（左上 → 右下） */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 34%, rgba(255,255,255,0) 58%)",
          }}
        />
        {/* 竖排标题 */}
        <span
          className="relative z-10 px-px text-center text-[6.5px] font-bold leading-tight [writing-mode:vertical-rl] [text-orientation:upright]"
          style={{ letterSpacing: "0.05em", color: spineText }}
        >
          {cd.title}
        </span>
        {/* 塑料膜高光 */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/35 to-transparent" />
      </div>

      {/* hover 时顶部露出的封面 */}
      <motion.div
        className="absolute left-1/2 top-0 h-12 w-12 -translate-x-1/2 -translate-y-full overflow-hidden rounded-sm shadow-md"
        style={{
          background: !compact && cd.coverArt
            ? `url(${cd.coverArt}) center/cover`
            : `linear-gradient(135deg, ${spineColor}, ${shade(spineColor, -42)})`,
        }}
        initial={{ opacity: 0, scale: 0.8, y: 6 }}
        whileHover={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      />
    </motion.div>
  );
}

/* ============================================================
   左侧个人名片（Profile Card）—— 与右侧毛毡板呼应
   ============================================================ */
function ProfileCard({
  profile,
  onEdit,
  cdCount,
  memoryCount,
}: {
  profile: { avatar: string; name: string; bio: string };
  onEdit: () => void;
  /** 书架上的 CD 数（登录后是真实订单数，访客是演示数据的条数） */
  cdCount: number;
  /** 收到的 CD 数（同上） */
  memoryCount: number;
}) {
  const { lang } = useLang();
  const copy = COPY[lang];
  return (
    <div
      className="absolute left-4 top-20 z-10 w-56 rounded-lg p-5"
      style={{
        background: "#FDFBF7",
        boxShadow:
          "0 16px 36px -14px rgba(28,35,41,0.4), 0 4px 10px -4px rgba(28,35,41,0.15)",
        border: "1px solid rgba(180,160,130,0.35)",
      }}
    >
      {/* 左上角纸胶带 */}
      <div className="absolute -top-2.5 left-6 h-5 w-14 rotate-[-6deg] bg-[#f5e6a8]/65 shadow-sm" />
      {/* 右上角图钉 */}
      <div className="absolute -top-1.5 right-5 h-3 w-3 rounded-full bg-gradient-to-br from-[#E53935] to-[#B71C1C] shadow ring-1 ring-black/20" />

      {/* 编辑铅笔图标（右上角） */}
      <button
        type="button"
        onClick={onEdit}
        aria-label={copy.editCard}
        className="group absolute right-2 top-2 rounded-full p-1.5 text-[#8A7A66] transition hover:scale-110 hover:bg-[#2B2118] hover:text-white"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {/* 头像（圆形 + 白色粗边） */}
      <div className="mx-auto mb-3 h-16 w-16 overflow-hidden rounded-full border-[3px] border-white shadow-md bg-[#E8E0D2]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {profile.avatar ? (
          <img
            src={profile.avatar}
            alt="avatar"
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <img
            src="https://picsum.photos/seed/alexroom/100"
            alt="avatar"
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
      </div>

      {/* 名字（衬线体） */}
      <h3
        className="px-4 text-center text-xl font-bold leading-tight text-[#2B2118]"
        style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}
      >
        {profile.name}
      </h3>

      {/* 个性签名 */}
      <p className="mt-1.5 text-center text-[11px] leading-relaxed text-[#7A6B5A] italic">
        {profile.bio}
      </p>

      {/* 数据小标签 —— 真实计数，不是写死的数字 */}
      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-medium text-[#8A7A66]">
        <span>
          {cdCount} CD{cdCount === 1 ? "" : "s"}
        </span>
        <span className="text-[#C4B8A4]">|</span>
        <span>
          {memoryCount} {memoryCount === 1 ? "Memory" : "Memories"}
        </span>
      </div>
    </div>
  );
}

/* ============================================================
   编辑名片弹窗（毛玻璃极简风）
   ============================================================ */
function EditProfileModal({
  profile,
  onClose,
  onSave,
}: {
  profile: { avatar: string; name: string; bio: string };
  onClose: () => void;
  onSave: (p: { avatar: string; name: string; bio: string }) => void;
}) {
  const [avatar, setAvatar] = useState(profile.avatar);
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { lang } = useLang();
  const copy = COPY[lang];

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="relative w-[360px] rounded-2xl p-6"
        style={{
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 24px 60px -16px rgba(0,0,0,0.35)",
          border: "1px solid rgba(255,255,255,0.6)",
        }}
        initial={{ scale: 0.9, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 关闭按钮 */}
        <button
          type="button"
          onClick={onClose}
          aria-label={copy.close}
          className="absolute right-3 top-3 rounded-full p-1 text-[#8A7A66] transition hover:bg-black/5 hover:text-[#2B2118]"
        >
          <X className="h-4 w-4" />
        </button>

        <h3
          className="mb-5 text-center text-lg font-bold text-[#2B2118]"
          style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}
        >
          Edit Profile
        </h3>

        {/* 头像 */}
        <div className="mb-4 flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-white shadow bg-[#E8E0D2]">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="https://picsum.photos/seed/alexroom/100"
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              className="rounded-md bg-[#2B2118] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#3d3023]"
            >
              {copy.uploadAvatar}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <input
              type="text"
              value={avatar.startsWith("data:") ? "" : avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder={copy.orPasteUrl}
              className="w-44 rounded-md border border-[#D8CDBA] bg-white/70 px-2 py-1 text-xs text-[#2B2118] outline-none focus:border-[#8A7A66]"
            />
          </div>
        </div>

        {/* 名字 */}
        <label className="mb-1 block text-xs font-semibold text-[#6B5D4D]">{copy.name}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-4 w-full rounded-md border border-[#D8CDBA] bg-white/70 px-3 py-2 text-sm text-[#2B2118] outline-none focus:border-[#8A7A66]"
        />

        {/* 签名 */}
        <label className="mb-1 block text-xs font-semibold text-[#6B5D4D]">{copy.signature}</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="mb-5 w-full resize-none rounded-md border border-[#D8CDBA] bg-white/70 px-3 py-2 text-sm text-[#2B2118] outline-none focus:border-[#8A7A66]"
        />

        {/* 保存按钮 */}
        <button
          type="button"
          onClick={() => onSave({ avatar, name, bio })}
          className="w-full rounded-md bg-[#1C1C1C] py-2.5 text-sm font-semibold text-white transition hover:bg-[#333]"
        >
          保存 Save
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ============================================================
   便签皮肤选择器（3 纯色 + 3 图片）
   ============================================================ */
function NoteSkinPicker({
  onPick,
  small = false,
}: {
  onPick: (skin: NoteSkin) => void;
  small?: boolean;
}) {
  const { lang } = useLang();
  return (
    <div className="flex max-w-[190px] flex-wrap items-center gap-1.5">
      {NOTE_SKINS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onPick(s)}
          title={lang === "zh" ? s.label : s.labelEn}
          className={`${small ? "h-6 w-6" : "h-7 w-7"} overflow-hidden border border-black/10 transition hover:scale-110 ${
            s.type === "image" ? "rounded-[3px] bg-transparent" : "rounded-full"
          }`}
          style={
            s.type === "image"
              ? {
                  backgroundImage: `url(${s.bg})`,
                  backgroundSize: "contain",
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                }
              : { background: s.bg }
          }
        />
      ))}
    </div>
  );
}

/* ============================================================
   便签卡片（可拖拽，带胶带，hover 显示删除）
   ============================================================ */
function StickyNoteCard({
  note,
  constraintsRef,
  onDelete,
  compact = false,
}: {
  note: StickyNote;
  constraintsRef: React.RefObject<HTMLDivElement | null>;
  onDelete: () => void;
  compact?: boolean;
}) {
  const { lang } = useLang();
  const copy = COPY[lang];
  return (
    <motion.div
      drag
      dragConstraints={constraintsRef}
      dragElastic={0.08}
      whileDrag={{ scale: 1.05, zIndex: 60 }}
      initial={{ x: note.x, y: note.y, rotate: note.rotate }}
      className={`group absolute left-0 top-0 flex cursor-grab flex-col rounded-sm active:cursor-grabbing ${
        note.backgroundImage
          ? "drop-shadow-[0_8px_14px_rgba(0,0,0,0.32)]"
          : "shadow-[0_10px_22px_-8px_rgba(0,0,0,0.5)]"
      } ${compact ? "h-[76px] w-[76px] p-2" : "h-28 w-28 p-3"}`}
      style={{
        ...(note.backgroundImage
          ? {
              backgroundImage: `url(${note.backgroundImage})`,
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }
          : { background: NOTE_BG[note.color] }),
        touchAction: "none",
      }}
    >
      {/* 顶部红色图钉（与拍立得统一） */}
      <div className="absolute -top-1.5 left-1/2 z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-gradient-to-br from-[#E53935] to-[#B71C1C] shadow ring-1 ring-black/20" />
      {/* hover 删除按钮 */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={copy.deleteNote}
        className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#3A2A1A] text-white opacity-0 shadow transition group-hover:opacity-100 hover:bg-[#E53935]"
      >
        <X className="h-3 w-3" />
      </button>
      <p
        className="note-scroll relative flex-1 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[#3A2A1A]"
        style={{
          fontFamily: "'Comic Sans MS', 'Marker Felt', cursive",
          textShadow: note.backgroundImage
            ? "0 1px 2px rgba(255,255,255,0.75), 0 0 3px rgba(255,255,255,0.5)"
            : undefined,
        }}
      >
        {note.text}
      </p>
    </motion.div>
  );
}

/* ============================================================
   便签编辑弹窗（便签纸 + textarea）
   ============================================================ */
function NoteEditModal({
  skin,
  draft,
  onDraftChange,
  onSkinChange,
  onCancel,
  onPin,
}: {
  skin: NoteSkin;
  draft: string;
  onDraftChange: (v: string) => void;
  onSkinChange: (skin: NoteSkin) => void;
  onCancel: () => void;
  onPin: () => void;
}) {
  const { lang } = useLang();
  const copy = COPY[lang];
  return (
    <motion.div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-center"
      >
        {/* 便签本体：完全透明底，尺寸贴合素材本身 */}
        <div className="relative h-[320px] w-[320px]">
          {skin.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={skin.bg}
              alt=""
              draggable={false}
              className="pointer-events-none h-full w-full object-contain"
            />
          ) : (
            <div className="h-full w-full rounded-sm" style={{ background: skin.bg }} />
          )}
          {/* 文字区：绝对定位在便签中心偏上，无底色无边框 */}
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={4}
            autoFocus
            placeholder={copy.notePlaceholder}
            className="absolute left-1/2 top-[37%] h-24 w-[60%] -translate-x-1/2 resize-none border-0 bg-transparent text-center text-sm leading-relaxed text-[#3A2A1A] outline-none focus:ring-0 focus:outline-none placeholder:text-[#3A2A1A]/40"
            style={{
              fontFamily: "'Comic Sans MS', 'Marker Felt', cursive",
              textShadow:
                "0 1px 2px rgba(255,255,255,0.80), 0 0 4px rgba(255,255,255,0.55)",
            }}
          />
        </div>
        {/* 6 张透明素材的横向切换器 */}
        <div className="mt-3 flex items-center gap-1.5 rounded-full bg-white/15 p-1.5 backdrop-blur">
          {NOTE_IMAGE_SKINS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSkinChange(s)}
              title={s.label}
              className={`h-9 w-9 rounded-md border bg-transparent transition hover:scale-105 ${
                skin.id === s.id
                  ? "border-[#2B2118] ring-2 ring-[#2B2118]/25"
                  : "border-black/10"
              }`}
              style={{
                backgroundImage: `url(${s.bg})`,
                backgroundSize: "contain",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "center",
              }}
            />
          ))}
        </div>
        {/* 操作按钮 */}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-black/15 bg-white/80 px-5 py-2 text-xs font-medium text-[#3A2A1A] transition hover:bg-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onPin}
            className="rounded-md bg-[#2B2118] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#3d3023]"
          >
            贴上墙 Pin it
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ============================================================
   毛毡板上的拍立得（可拖拽，带图钉，限制在板内）
   ============================================================ */
function BoardPolaroid({
  photo,
  constraintsRef,
  compact = false,
}: {
  photo: BoardPhoto;
  constraintsRef: React.RefObject<HTMLDivElement | null>;
  compact?: boolean;
}) {
  return (
    <motion.div
      drag
      dragConstraints={constraintsRef}
      dragElastic={0.08}
      whileDrag={{ scale: 1.06, zIndex: 50 }}
      initial={{ x: photo.x, y: photo.y, rotate: photo.rotate }}
      className={`absolute left-0 top-0 cursor-grab rounded-sm bg-white shadow-[0_10px_22px_-8px_rgba(0,0,0,0.5)] active:cursor-grabbing ${
        compact ? "w-16 p-1 pb-5" : "w-24 p-1.5 pb-8"
      }`}
      style={{ touchAction: "none" }}
    >
      {/* 图钉（顶部正中，红色） */}
      <div className="absolute -top-1.5 left-1/2 z-10 h-3 w-3 -translate-x-1/2 rounded-full bg-gradient-to-br from-[#E53935] to-[#B71C1C] shadow-[0_1px_2px_rgba(0,0,0,0.5)] ring-1 ring-black/20" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.src}
        alt=""
        className="aspect-square w-full object-cover"
        draggable={false}
      />
    </motion.div>
  );
}

/* ============================================================
   拍立得（可拖拽，带胶带）
   ============================================================ */
function Polaroid({
  src,
  initial,
}: {
  src: string;
  initial: { x: number; y: number; rotate: number };
}) {
  return (
    <motion.div
      drag
      dragElastic={0.12}
      whileDrag={{ scale: 1.06, zIndex: 40 }}
      initial={initial}
      className="relative w-20 cursor-grab rounded-sm bg-white p-1.5 pb-6 shadow-[0_14px_30px_-10px_rgba(28,35,41,0.5)] active:cursor-grabbing"
    >
      {/* 顶部胶带 */}
      <div className="absolute -top-2 left-1/2 h-4 w-10 -translate-x-1/2 rotate-[-3deg] bg-[#f5e6a8]/70 shadow-sm" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="aspect-[3/4] w-full object-cover" draggable={false} />
    </motion.div>
  );
}
