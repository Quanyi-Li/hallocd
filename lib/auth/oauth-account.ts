/**
 * halloCD · GitHub 账号与站内账号的绑定
 * ==================================================================
 * OAuth 回调拿到的是「一个 GitHub 身份」，但平台里认的是「站内账号」。
 * 中间这一步就是：**这个 GitHub 身份对应哪个站内账号？**
 *
 * 判定顺序（先到先得，命中即停）：
 *   ① 已经绑过这个 GitHub id      → 直接登录（老用户复登）
 *   ② 邮箱和站内已有账号一样      → 挂到那个账号上（避免同一��出现两个号）
 *   ③ 用户名和站内已有账号一样    → 挂到那个账号上
 *   ④ 都没有                      → 建一个新账号
 *
 * 为什么 ② 要放在 ③ 前面：邮箱是强标识，用户名可以改。
 *
 * ------------------------------------------------------------------
 * 一个刻意的取舍：OAuth 建出来的账号**没有密码**。
 *
 * 密码列是 NOT NULL，所以得存点什么 —— 存一个 `oauth:<随机串>`。
 * 它不是 scrypt 哈希，verifyPassword() 认不出来（只认 scrypt$salt$hash），
 * 于是这个账号只能通过 GitHub 登录 —— 这是对的：
 * 一个用户从没设过密码，就不该有人能猜出密码登进去。
 */

import { randomUUID } from "node:crypto";

import { db, type DbUser } from "@/lib/db";
import { checkHandle, normalizeHandle } from "@/lib/auth/session";
import { pickAvatarColor } from "@/lib/auth/profile";
import type { GitHubProfile } from "@/lib/auth/github";

export type GithubLinkResult = {
  user: DbUser;
  /** 这次是新建的账号 */
  created: boolean;
  /** 这次是把已有账号绑上了 GitHub */
  linked: boolean;
};

/**
 * 造一个没被占用的用户名。
 *
 * GitHub 登录名已经被别人在站内用掉了是常事（"kok" 这种用户名很抢手）。
 * 这时不能报错让用户没法登录 —— 退一步加后缀就行。
 *
 * 同时要避开**保留字**（/api、/make、/login 这些路径是站内路由），
 * 以及长度下限 —— checkHandle() 把这两条规则都定好了，直接用它。
 */
async function uniqueHandle(base: string): Promise<string> {
  const normalized = normalizeHandle(base);
  const fallback = "hallocd-user";
  const seed = checkHandle(normalized).ok ? normalized : fallback;

  if (!(await db.findUserByHandle(seed))) return seed;

  for (let i = 0; i < 50; i += 1) {
    const suffix = `-${i + 1}`;
    const next = `${seed.slice(0, 24 - suffix.length)}${suffix}`;
    if (!(await db.findUserByHandle(next))) return next;
  }

  /* 极端情况下（有人把 1~50 号全占了）—— 退回随机串 */
  return `gh-${randomUUID().slice(0, 8)}`;
}

/**
 * GitHub 邮箱是私有的时会拿不到。
 * 站内 users.email 是 UNIQUE NOT NULL，所以要造一个**保证不冲突**的占位地址。
 *
 * GitHub 自己就有 noreply 邮箱，形如 {id}+{login}@users.noreply.github.com，
 * 格式跟真邮箱一致、全球唯一、也不会误投给真人 —— 直接用它。
 */
function fallbackEmail(profile: GitHubProfile): string {
  const login = profile.login.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `${profile.id}+${login || "user"}@users.noreply.github.com`;
}

export async function linkGithubProfile(
  profile: GitHubProfile,
): Promise<GithubLinkResult> {
  /* ① 已经绑过 */
  const bound = await db.findUserByGithubId(profile.id);
  if (bound) {
    /* 登录名 / 头像可能变了 —— 顺手同步一下 */
    const updated = await db.updateUser(bound.id, {
      githubLogin: profile.login,
      githubAvatarUrl: profile.avatarUrl,
    });
    return { user: updated ?? bound, created: false, linked: false };
  }

  const email = (profile.email ?? "").trim().toLowerCase();

  /* ② 邮箱对上了已有账号 —— 挂上去 */
  if (email) {
    const byEmail = await db.findUserByEmail(email);
    if (byEmail) {
      const updated = await db.updateUser(byEmail.id, {
        githubId: profile.id,
        githubLogin: profile.login,
        githubAvatarUrl: profile.avatarUrl,
      });
      return { user: updated ?? byEmail, created: false, linked: true };
    }
  }

  /* ③ 用户名对上了已有账号 —— 也挂上去（只在对方还没绑 GitHub 时） */
  const rawHandle = normalizeHandle(profile.login);
  if (rawHandle) {
    const byHandle = await db.findUserByHandle(rawHandle);
    if (byHandle && !byHandle.githubId) {
      const updated = await db.updateUser(byHandle.id, {
        githubId: profile.id,
        githubLogin: profile.login,
        githubAvatarUrl: profile.avatarUrl,
      });
      return { user: updated ?? byHandle, created: false, linked: true };
    }
  }

  /* ④ 建新号 —— 用户名被占了就加后缀 */
  const handle = await uniqueHandle(profile.login);
  const user = await db.createUser({
    id: randomUUID(),
    handle,
    email: email || fallbackEmail(profile),
    displayName: (profile.name || profile.login).slice(0, 40),
    bio: "",
    avatarColor: pickAvatarColor(profile.id),
    agentNote: "",
    /* 不是 scrypt 哈希 → 这个账号没法用密码登录（见文件头说明） */
    passwordHash: `oauth:${randomUUID()}`,
    githubId: profile.id,
    githubLogin: profile.login,
    githubAvatarUrl: profile.avatarUrl,
    createdAt: new Date().toISOString(),
  });

  return { user, created: true, linked: false };
}
