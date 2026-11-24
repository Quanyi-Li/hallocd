/* 画廊与成品详情页共用的商品数据 */

export type ArtVariant = "rings" | "ribbon" | "star";

export type Product = {
  id: string;
  name: string;
  scene: string; // 英文场景标签
  sceneZh: string; // 中文场景名
  description: string;
  price: number;
  coverImage: string; // 外壳封面图（长方形）
  backCoverImage: string; // 背面/内页底纸图（方形铺满，先用同场景的封面图，避免引入大图）
  discImage: string; // 光盘盘面图（圆形，中间带孔）
  image?: string; // 本地已有图片
  art?: ArtVariant; // 无图时使用纯 SVG 封面
  base: string; // SVG 封面底色
  accent: string; // 封面标题后那块强调色徽标（品牌黄）—— 脊背内页纸上印着的那一块
  obi: {
    text: string; // 腰封 / 脊背英文（全大写，竖排时整行旋转，不逐字母直立）
    bg: string; // 腰封底色（按场景与封面配色协调，油墨色按对比度自动选）
  };
  noteImage: string; // 便签底图（浅色纸纹，六款共用同一张，保证是同一套信纸）
  noteText: string; // 便签祝福语（英文，1–2 句，贴合场景）
  noteTextZh: string; // 便签祝福语（中文，与英文一一对应）
  noteCtaZh: string; // 便签底部按钮（中文）
  noteCtaEn: string; // 便签底部按钮（英文）
  noteTemplate: string; // 便签信纸模板 ID（复用 paperSkins 的 p01–p11）
};

export const PRODUCTS: Product[] = [
  {
    id: "birthday",
    name: "Make a Wish",
    scene: "Birthday",
    sceneZh: "生日",
    description:
      "把生日那天的烛光刻进碟面。内置 NFC 芯片，手机轻轻碰一下就能播放；亚克力包装外壳留住碟片的温度，也装得下你自己录下的那句生日快乐。随碟附赠定制信纸，写一封只属于寿星的信。",
    price: 49.9,
    coverImage: "/images/birthday-cover.jpg",
    backCoverImage: "/images/birthday-cover.jpg",
    discImage: "/images/birthday-disc.jpg",
    image: "/images/my-dog.jpg",
    base: "#AB6445",
    accent: "#FFE500",
    obi: { text: "MAKE A WISH", bg: "#A0573A" },
    noteImage: "/images/note-anniversary.png",
    noteText:
      "Every candle deserves a song. Put your wish on this disc and let it keep burning after the lights go out.",
    noteTextZh:
      "每一根蜡烛都值得一首歌。把你的愿望放进这张碟里，灯灭之后，它还在亮。",
    noteCtaZh: "回一张 CD",
    noteCtaEn: "Reply with a CD",
    noteTemplate: "p01",
  },
  {
    id: "anniversary",
    name: "Golden Hour, Again",
    scene: "Anniversary",
    sceneZh: "恋爱纪念日",
    description:
      "纪念日不该只停在相册里。NFC 芯片让这张碟变成一枚可以触碰的记忆，手机一碰就播放，碟面收着你们笑得最好的那刻。亚克力外壳通透轻巧，内附定制信纸，把没说完的话写下来。",
    price: 49.9,
    coverImage: "/images/anniversary-cover.jpg",
    backCoverImage: "/images/anniversary-cover.jpg",
    discImage: "/images/anniversary-disc.jpg",
    image: "/images/couple-1.jpg",
    base: "#AD6E69",
    accent: "#FFE500",
    obi: { text: "GOLDEN, AGAIN", bg: "#8B5852" },
    noteImage: "/images/note-birthday.png",
    noteText:
      "We hold the ordinary hours and turn them golden. Here is one of them, still happening.",
    noteTextZh: "我们把平凡的时刻收藏起来，让它们变成金色。这里就是其中一个，还在发生。",
    noteCtaZh: "回一张 CD",
    noteCtaEn: "Reply with a CD",
    noteTemplate: "p02",
  },
  {
    id: "wedding",
    name: "The Vow",
    scene: "Wedding",
    sceneZh: "婚礼",
    description:
      "把誓言做成一张可以收藏的碟。NFC 芯片碰一碰即播，你录下的誓词会随碟面一起被保存；亚克力包装外壳像婚礼当天的光一样透亮。附赠定制信纸，写给未来的彼此。",
    price: 49.9,
    coverImage: "/images/wedding-cover.jpg",
    backCoverImage: "/images/wedding-cover.jpg",
    discImage: "/images/wedding-disc.jpg",
    art: "rings",
    base: "#E0D7C2",
    accent: "#FFE500",
    obi: { text: "THE VOW", bg: "#E7DAC6" },
    noteImage: "/images/note-christmas.png",
    noteText:
      "The words you said out loud are here now, kept quiet and safe. Lean in whenever you want to hear them again.",
    noteTextZh:
      "你亲口说出的那些话，现在被安静地收在这里。想再听的时候，靠近一点就好。",
    noteCtaZh: "回一张 CD",
    noteCtaEn: "Reply with a CD",
    noteTemplate: "p05",
  },
  {
    id: "graduation",
    name: "Last Day, First Light",
    scene: "Graduation",
    sceneZh: "毕业",
    description:
      "毕业那天的风，值得被反复播放。内置 NFC 芯片，手机轻碰即可听见同学们的声音；亚克力外壳轻薄耐用，适合带去每一场重逢。随碟附赠定制信纸，让老师与朋友各写一句。",
    price: 49.9,
    coverImage: "/images/graduation-cover.jpg",
    backCoverImage: "/images/graduation-cover.jpg",
    discImage: "/images/graduation-disc.jpg",
    art: "ribbon",
    base: "#1A2A4A",
    accent: "#FFE500",
    obi: { text: "FIRST LIGHT", bg: "#AF8E5C" },
    noteImage: "/images/note-wedding.png",
    noteText:
      "You will not remember every hallway, but you will remember how that morning felt. Keep the first light close.",
    noteTextZh:
      "你不会记得每一条走廊，但会记得那个早晨的感觉。把第一缕光留在身边。",
    noteCtaZh: "回一张 CD",
    noteCtaEn: "Reply with a CD",
    noteTemplate: "p04",
  },
  {
    id: "christmas",
    name: "Merry & Bright",
    scene: "Holiday",
    sceneZh: "圣诞节",
    description:
      "圣诞的灯光，收进一张碟里。NFC 芯片让手机碰一碰就响起熟悉的旋律，也可以录下全家人的祝福；亚克力外壳像雪花玻璃球一样通透。随碟附赠定制信纸，寄给远方的想念。",
    price: 49.9,
    coverImage: "/images/christmas-cover.jpg",
    backCoverImage: "/images/christmas-cover.jpg",
    discImage: "/images/christmas-disc.jpg",
    art: "star",
    base: "#234937",
    accent: "#FFE500",
    obi: { text: "MERRY & BRIGHT", bg: "#5F7254" },
    noteImage: "/images/note-graduation.png",
    noteText:
      "A little brightness to unpack every year. Let the room fill up, and stay a while inside the glow.",
    noteTextZh:
      "一点点亮光，每年都可以重新拆开。让房间被填满，在光里多待一会儿。",
    noteCtaZh: "回一张 CD",
    noteCtaEn: "Reply with a CD",
    noteTemplate: "p07",
  },
  {
    id: "everyday",
    name: "Ordinary Tuesday",
    scene: "Everyday",
    sceneZh: "日常",
    description:
      "普通的一天，也值得被做成纪念。NFC 芯片轻轻一碰就播放，把猫的呼噜、窗外的雨声录进碟里；亚克力包装外壳温和不张扬，放在桌上就是一件小物。附赠定制信纸，写给日常的自己。",
    price: 49.9,
    coverImage: "/images/everyday-cover.jpg",
    backCoverImage: "/images/everyday-cover.jpg",
    discImage: "/images/everyday-disc.jpg",
    image: "/images/my-cat.jpg",
    base: "#CABB9A",
    accent: "#FFE500",
    obi: { text: "ORDINARY DAYS", bg: "#C4AD88" },
    noteImage: "/images/note-everyday.png",
    noteText:
      "Nothing special happened today, and that is the good part. Save it. These are the days a life is built from.",
    noteTextZh:
      "今天什么都没发生，这正是最好的部分。把它存下来吧，生活就是由这样的日子堆起来的。",
    noteCtaZh: "回一张 CD",
    noteCtaEn: "Reply with a CD",
    noteTemplate: "p08",
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((product) => product.id === id);
}
