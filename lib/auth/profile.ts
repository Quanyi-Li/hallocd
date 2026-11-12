/**
 * halloCD · 用户资料小工具
 * ==================================================================
 * 头像色盘只有一处定义 —— 注册和 OAuth 建号用的是同一套颜色，
 * 不然同一个人从两条路进来会拿到两个不同的颜色。
 */

/** 头像底色盘（米色背景上的六种低饱和色） */
export const AVATAR_COLORS = [
  "#E65100",
  "#8B5852",
  "#2E3A31",
  "#1B3A6B",
  "#AF8E5C",
  "#C2185B",
];

export function pickAvatarColor(seed?: string): string {
  if (seed) {
    /* 用 id / 登录名做种子 —— 同一个 GitHub 账号永远拿到同一个颜色 */
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length];
  }
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}
