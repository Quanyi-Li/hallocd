/**
 * halloCD · 存储入口
 * ==================================================================
 * 选哪个后端只看一个环境变量：
 *
 *   DATABASE_URL=postgresql://...   → Postgres（生产）
 *   不设                            → 文件存储（本地 / 离线演示）
 *
 * 切换只在这一处发生，业务代码永远只认 DataStore 接口。
 *
 * Postgres 用 @neondatabase/serverless 的 HTTP 驱动（纯 fetch，无原生二进制），
 * Vercel 上零配置；Neon / Vercel Postgres / Supabase 都兼容。
 */

import type { DataStore } from "@/lib/db/types";

let storePromise: Promise<DataStore> | null = null;

export function hasDatabase(): boolean {
  return Boolean((process.env.DATABASE_URL || "").trim());
}

/**
 * 存储不可用时给的一句人话。
 *
 * 典型触发场景：部署到 Vercel 却忘了配 DATABASE_URL。
 * Vercel 的容器文件系统是**只读**的（只有 /tmp 可写），
 * 文件后端写不进去 —— 而且不报错的话会表现为
 * 「订单查不到 / 注册成功但登不进去」，是最难查的一类线上问题。
 */
function storageUnavailable(detail: string): Error {
  return new Error(
    `halloCD 存储不可用：${detail}\n` +
      `请在环境变量里配置 DATABASE_URL —— 需要 **Neon 兼容的 HTTP /sql 端点**。\n` +
      `  ✅ Neon、Vercel Postgres\n` +
      `  ❌ Supabase、RDS（只有 TCP:5432，这个驱动是纯 HTTP，连不上）\n` +
      `参考：docs/backend-README.md §4 数据层选型。`,
    { cause: new Error(detail) },
  );
}

export async function getStore(): Promise<DataStore> {
  if (!storePromise) {
    storePromise = (async () => {
      const url = (process.env.DATABASE_URL || "").trim();
      if (url) {
        const { createPostgresStore } = await import("@/lib/db/postgres");
        return createPostgresStore(url);
      }
      const { createFileStore, probeWritable } = await import("@/lib/db/file");
      /* 文件后端只在「本地可写」时才是合法回退 —— 提前探一次，
         比等到用户注册时才发现落不了盘要好得多。 */
      const probe = await probeWritable();
      if (!probe.ok) {
        throw storageUnavailable(
          `未配置 DATABASE_URL，且本地数据目录不可写（${probe.dir}）：${probe.error ?? "未知原因"}`,
        );
      }
      return createFileStore();
    })();
  }
  return storePromise;
}

/**
 * 调用侧的统一入口。方法全部是异步的 —— 即使文件后端也是同步落盘，
 * 对外一律 Promise，调用方不需要关心后端差异。
 */
export const db: DataStore = new Proxy({} as DataStore, {
  get(_target, prop: string) {
    if (prop === "kind") {
      return hasDatabase() ? "postgres" : "file";
    }
    return async (...args: unknown[]) => {
      const store = await getStore();
      const fn = (store as unknown as Record<string, unknown>)[prop];
      if (typeof fn !== "function") {
        throw new Error(`db.${prop} is not a storage method`);
      }
      return (fn as (...a: unknown[]) => unknown).apply(store, args);
    };
  },
}) as DataStore;

/**
 * 探一次库 —— 给部署就绪自检用。
 *
 * 「配了 DATABASE_URL」≠「连得上」。最常见的翻车是：
 *   · URL 指向 Supabase / RDS（只有 TCP:5432，这个驱动走 HTTP /sql）
 *   · host 写成 IPv4 字面量（驱动会改写成 api.x.x.x）
 *   · 出网被防火墙拦 / DNS 解析不了 / 证书链不对
 *
 * 结果缓存 30 秒 —— health 端点可能被 agent 高频调用，
 * 但没必要为了一次探活每次都真打一趟库。
 */
const PROBE_TTL_MS = 30_000;
let probeCache: { at: number; result: Promise<ProbeResult> } | null = null;

export type ProbeResult = { ok: boolean; error?: string; ms?: number };

export async function probeDatabase(): Promise<ProbeResult> {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) return { ok: false, error: "未配置 DATABASE_URL" };

  const now = Date.now();
  if (probeCache && now - probeCache.at < PROBE_TTL_MS) {
    return probeCache.result;
  }
  const { probePostgres } = await import("@/lib/db/postgres");
  const result = probePostgres(url).then((r) => ({
    ok: r.ok,
    error: r.error,
    ms: r.ms,
  }));
  probeCache = { at: now, result };
  return result;
}

/** 诊断信息（health / 日志用） */
export function describeStore(): {
  kind: "postgres" | "file";
  databaseUrl: string;
  note: string;
  /** 是否达到「可上生产」标准 —— 只有 Postgres 算 */
  productionReady: boolean;
  /** 部署前的必读项（空数组 = 一切就绪） */
  warnings: string[];
} {
  const kind = hasDatabase() ? "postgres" : "file";
  const warnings: string[] = [];
  if (kind === "file") {
    warnings.push(
      "未检测到 DATABASE_URL —— 当前是本地文件存储：订单与账号不持久，不能上生产。" +
        "生产必须配 Neon 兼容的 HTTP /sql 端点（Neon / Vercel Postgres 可用；Supabase / RDS 不可用）。",
    );
  }
  return {
    kind,
    databaseUrl: hasDatabase()
      ? "configured"
      : "not-configured (使用本地文件存储)",
    note:
      kind === "file"
        ? "未检测到 DATABASE_URL —— 当前是本地文件存储，不能上生产。"
        : "Postgres 已配置，订单与账号持久化在数据库中。",
    productionReady: kind === "postgres",
    warnings,
  };
}

export type { DataStore } from "@/lib/db/types";
export type {
  DbAgentActivity,
  DbAgentKey,
  DbOrder,
  DbSession,
  DbTemplate,
  DbUser,
  DbUserWithSecret,
} from "@/lib/db/types";
