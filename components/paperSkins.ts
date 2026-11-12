/* 信纸皮肤共享配置：RecordStudio（编辑）与 NFCExperiencePreview（预览）
   共用同一份宽高比与书写区，避免两处渲染不一致。 */
export type PaperSkin = {
  id: string;
  name: string;
  src: string;
  ratio: number; // 原图宽高比（width / height），保证整张信纸完整展示
  area: string; // 书写区（相对整图的内缩，顺序：上 右 下 左）
  panel?: string; // 花纹较密时，书写区内的白色衬底
  /* 书写区底色：light = 浅底（配深墨），dark = 深底（配米白墨）。
     p01–p11 逐张采样过书写区平均色，全部是浅底（米白 / 淡紫 / 淡黄纸面），
     米白墨对比度只有 1.01–1.21 —— 白字写白纸，整段隐形。
     以后真要加深色纸，给这一项标 "dark" 即可。 */
  paper?: "light" | "dark";
};

export const PAPER_SKINS: PaperSkin[] = [
  { id: "p01", name: "草莓蛋糕", src: "/papers/paper-01.jpg", ratio: 1000 / 1005, area: "33% 9% 12% 9%", paper: "light" },
  { id: "p02", name: "剪贴手账", src: "/papers/paper-02.jpg", ratio: 1000 / 1338, area: "30% 13% 14% 16%", paper: "light" },
  { id: "p03", name: "粉色蛋糕", src: "/papers/paper-03.jpg", ratio: 1000 / 1307, area: "23% 13% 11% 15%", paper: "light" },
  { id: "p04", name: "打字机", src: "/papers/paper-04.jpg", ratio: 649 / 715, area: "6% 7% 6% 7%", paper: "light" },
  { id: "p05", name: "牛皮胶带", src: "/papers/paper-05.jpg", ratio: 1000 / 1408, area: "18% 14% 21% 15%", paper: "light" },
  {
    id: "p06",
    name: "字体拼贴",
    src: "/papers/paper-06.jpg",
    ratio: 1000 / 1439,
    area: "8% 8% 8% 8%",
    panel: "bg-white/80",
    paper: "light",
  },
  { id: "p07", name: "星星笺", src: "/papers/paper-07.jpg", ratio: 709 / 721, area: "5% 8% 24% 8%", paper: "light" },
  { id: "p08", name: "格纹波点", src: "/papers/paper-08.jpg", ratio: 1000 / 710, area: "12% 9% 14% 9%", paper: "light" },
  { id: "p09", name: "布丁便签", src: "/papers/paper-09.jpg", ratio: 1000 / 1005, area: "9% 9% 24% 9%", paper: "light" },
  { id: "p10", name: "甜点清单", src: "/papers/paper-10.jpg", ratio: 1000 / 1005, area: "18% 10% 26% 10%", paper: "light" },
  { id: "p11", name: "刺绣布纹", src: "/papers/paper-11.jpg", ratio: 1000 / 1330, area: "20% 18% 20% 18%", paper: "light" },
];

/* 依据 paperSrc 找到对应皮肤；找不到（默认米色信纸）返回 null */
export function findPaperSkin(src: string | null): PaperSkin | null {
  if (!src) return null;
  return PAPER_SKINS.find((skin) => skin.src === src) ?? null;
}
