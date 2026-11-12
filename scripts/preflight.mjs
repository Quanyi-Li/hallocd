#!/usr/bin/env node
/**
 * halloCD · 部署前自检（preflight）
 * ==================================================================
 * 回答一个问题：**现在这份环境变量，够不够把这套东西部署到 Vercel 上跑生产？**
 *
 * 用法：
 *   node scripts/preflight.mjs                 # 读当前进程的环境变量
 *   node scripts/preflight.mjs --json          # 机器可读输出
 *
 * 为什么要单独写这个脚本，而不是「部署完再看」：
 *   · Vercel 的容器文件系统是**只读**的（只有 /tmp 可写）。
 *     漏配 DATABASE_URL 时，文件后端根本落不了盘 ——
 *     而且不报错的话，线上表现是「订单查不到 / 注册成功但登不进去」，
 *     是最难查的一类问题。
 *   · 「配了 DATABASE_URL 但连不上」是另一类经典翻车：
 *     Supabase / RDS 只有 TCP:5432，而这个驱动走的是纯 HTTP /sql。
 *
 * 退出码：0 = 全部就绪；1 = 有 CRITICAL 项没过。
 */

import http from "node:http";
import https from "node:https";

// 顺序与 lib/db/schema.ts 的建表顺序一致；加表时这里必须同步，
// 否则新表没建出来 preflight 也不会报 —— 部署自检会漏掉真实故障。
const TABLES = [
  "users",
  "sessions",
  "agent_keys",
  "agent_activity",
  "orders",
  "templates",
  "uploads",
];

const args = process.argv.slice(2);
const AS_JSON = args.includes("--json");

/* ------------------------------------------------------------------ *
 * Neon HTTP /sql 契约（与 @neondatabase/serverless 驱动走的是同一套线协议）
 *
 * 为什么自己手写 fetch 而不直接用驱动：
 *   1. 驱动用的是带 keep-alive 的连接池，脚本退出时在 Windows 上会触发
 *      libuv 断言（Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)），
 *      退出码变成 0xC0000409 —— 一个「检查工具」自己崩掉，比没有还糟。
 *   2. agent: false 让 socket 用完即关，退出干净。
 *   3. 零依赖 —— 部署前在还没 npm ci 的机器上也能跑。
 * ------------------------------------------------------------------ */
function neonRequest(url, query, params = []) {
  const u = new URL(url);
  /* 驱动把 postgresql://host/db 映射成 https://host/sql —— 丢弃端口。 */
  const endpoint = `https://${u.hostname}/sql`;
  const payload = JSON.stringify({ query, params });

  return new Promise((resolve, reject) => {
    const req = https.request(
      endpoint,
      {
        method: "POST",
        agent: false,
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
        headers: {
          "Neon-Connection-String": url,
          "Neon-Raw-Text-Output": "true",
          "Neon-Array-Mode": "true",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`响应不是合法 JSON：${body.slice(0, 300)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

/* ------------------------------------------------------------------ *
 * 通用 HTTP(S) 探测（给对象存储用）
 *
 * 与 neonRequest 一样：手写 fetch、agent:false、零依赖 ——
 * 这个脚本得能在还没 npm ci 的机器上跑。
 * ------------------------------------------------------------------ */
function httpRequest(url, method, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request(
      u,
      {
        method,
        agent: false,
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
        headers,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
        });
        res.on("end", () => resolve({ status: res.statusCode || 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/* ------------------------------------------------------------------ */
const results = [];
function add(level, name, ok, detail, fix) {
  results.push({ level, name, ok, detail: detail ?? "", fix: fix ?? "" });
}
const CRIT = (name, ok, detail, fix) => add("critical", name, ok, detail, fix);
const WARN = (name, ok, detail, fix) => add("warn", name, ok, detail, fix);
const INFO = (name, ok, detail, fix) => add("info", name, ok, detail, fix);

/* ------------------------------------------------------------------ *
 * 1. DATABASE_URL
 * ------------------------------------------------------------------ */
const rawUrl = (process.env.DATABASE_URL || "").trim();

/**
 * 判断这个连接串是不是「Neon 兼容的 HTTP /sql 端点」。
 *
 * 判据（来自实际驱动行为，不是猜的）：
 *   · 驱动把 postgresql://host/db 映射成 https://host/sql —— **丢弃端口**。
 *     所以本地测试要用 443 端口。
 *   · Supabase / RDS 只有 TCP:5432，驱动连不上。
 */
function classify(url) {
  let host = "";
  let port = "";
  try {
    const u = new URL(url.replace(/^postgres(ql)?:\/\//, "https://"));
    host = u.hostname.toLowerCase();
    port = u.port || "";
  } catch {
    return { host: "", port: "", kind: "unparsable" };
  }
  const known = [
    ["neon.tech", "Neon"],
    ["neon.build", "Neon"],
    ["vercel-storage.com", "Vercel Postgres"],
    ["prisma.io", "Prisma Postgres"],
    ["supabase.co", "Supabase（仅 TCP，不兼容）"],
    ["amazonaws.com", "AWS RDS（仅 TCP，不兼容）"],
    ["rds.amazonaws.com", "AWS RDS（仅 TCP，不兼容）"],
  ];
  for (const [suffix, label] of known) {
    if (host.endsWith(suffix)) return { host, port, kind: label };
  }
  return { host, port, kind: "自定义 / 未知" };
}

let dbInfo = null;
if (!rawUrl) {
  CRIT(
    "DATABASE_URL",
    false,
    "未配置",
    "生产必须配置 DATABASE_URL。Vercel 的文件系统只读，文件后端落不了盘。" +
      "需要 Neon 兼容的 HTTP /sql 端点（Neon / Vercel Postgres ✅；Supabase / RDS ❌）",
  );
} else {
  dbInfo = classify(rawUrl);
  const looksTcpOnly = /不兼容/.test(dbInfo.kind);
  CRIT(
    "DATABASE_URL",
    !looksTcpOnly,
    `${dbInfo.kind}${dbInfo.host ? `（${dbInfo.host}${dbInfo.port ? ":" + dbInfo.port : ""}）` : ""}`,
    looksTcpOnly
      ? `${dbInfo.kind} 只有 TCP:5432，本项目的驱动走纯 HTTP /sql，连不上。请改用 Neon 或 Vercel Postgres。`
      : "",
  );
  if (!looksTcpOnly && dbInfo.port && dbInfo.port !== "443") {
    WARN(
      "DATABASE_URL 端口",
      false,
      `端口 ${dbInfo.port}`,
      "Neon 驱动会把连接串映射成 https://<host>/sql（丢弃端口），非 443 的端口不会被使用。",
    );
  }
}

/* ------------------------------------------------------------------ *
 * 2. 真连一次库 —— 「配了但连不上」比「没配」更难查
 * ------------------------------------------------------------------ */
if (rawUrl && dbInfo && !/不兼容/.test(dbInfo.kind)) {
  try {
    const probe = await neonRequest(rawUrl, "SELECT 1 AS ok");
    const rows = Array.isArray(probe?.rows) ? probe.rows : [];
    const ok = String(rows[0]?.[0] ?? "") === "1";
    CRIT("数据库连通性", ok, ok ? "SELECT 1 通过" : `返回异常：${JSON.stringify(probe)}`, "");

    const info = await neonRequest(
      rawUrl,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const found = new Set(
      (Array.isArray(info?.rows) ? info.rows : []).map((r) => String(r[0] ?? "")),
    );
    const missing = TABLES.filter((t) => !found.has(t));
    if (missing.length === 0) {
      CRIT("数据表", true, `${TABLES.length} 张表齐全（${TABLES.join(", ")}）`, "");
    } else {
      WARN(
        "数据表",
        false,
        `缺 ${missing.join(", ")}`,
        "schema 是自初始化的 —— 首次访问任意写接口会自动建表；也可手动跑 node scripts/db-init.mjs。",
      );
    }
  } catch (err) {
    CRIT(
      "数据库连通性",
      false,
      err instanceof Error ? err.message : String(err),
      "确认 URL 可用、IP 未被防火墙拦、且该端点支持 HTTP /sql（Neon / Vercel Postgres ✅）。",
    );
  }
}

/* ------------------------------------------------------------------ *
 * 3. PayPal
 * ------------------------------------------------------------------ */
const paypalId = (process.env.PAYPAL_CLIENT_ID || "").trim();
const paypalSecret = (process.env.PAYPAL_CLIENT_SECRET || "").trim();
const paypalBase = (
  process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com"
).trim();
const paypalVault = (process.env.PAYPAL_VAULT_ID || "").trim();
const isLive = !paypalBase.includes("sandbox");

if (!paypalId || !paypalSecret) {
  CRIT(
    "PayPal 凭据",
    false,
    !paypalId && !paypalSecret
      ? "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET 都未配置"
      : !paypalId
        ? "PAYPAL_CLIENT_ID 未配置"
        : "PAYPAL_CLIENT_SECRET 未配置",
    "AI 自动代付与网页端付款都依赖它。沙箱凭据见 paypal-sandbox-lab/。",
  );
} else {
  INFO("PayPal 凭据", true, "已配置", "");
}

if (isLive) {
  if (!paypalVault) {
    WARN(
      "PayPal 生产形态",
      false,
      "PAYPAL_API_BASE 指向 live，但没有 PAYPAL_VAULT_ID",
      "live 环境建议配 PAYPAL_VAULT_ID —— 配了自动切 vault_id 无感扣款；" +
        "不配则走 payment_source.card，需要真实卡号，且有 PCI 合规负担。",
    );
  } else {
    INFO("PayPal 生产形态", true, "vault_id 已配置（无感扣款）", "");
  }
} else {
  WARN(
    "PayPal 环境",
    false,
    `sandbox（${paypalBase}）`,
    "sandbox 能跑通全流程，但不能收真钱。切 live 需同时换 CLIENT_ID/SECRET 与 API_BASE。",
  );
}

/* ------------------------------------------------------------------ *
 * 4. Agent 接入
 * ------------------------------------------------------------------ */
const agentKey = (process.env.HALLO_AGENT_API_KEY || "").trim();
const adminKey = (process.env.HALLO_AGENT_ADMIN_KEY || "").trim();

if (!agentKey) {
  CRIT(
    "HALLO_AGENT_API_KEY",
    false,
    "未配置",
    "没有它，agent 侧所有接口都会 401 —— 「人人自己用 coding agent」这条线直接断掉。",
  );
} else {
  INFO("HALLO_AGENT_API_KEY", true, "已配置", "");
}
if (!adminKey) {
  WARN(
    "HALLO_AGENT_ADMIN_KEY",
    false,
    "未配置",
    "站点主 key 与「自助签发 key」都依赖它；没有它用户无法自助签发。",
  );
} else {
  INFO("HALLO_AGENT_ADMIN_KEY", true, "已配置", "");
}

/* ------------------------------------------------------------------ *
 * 5. 对象存储（Vercel Blob）
 * ------------------------------------------------------------------ *
 * 为什么单列一项：
 *   媒体（录音 / 照片 / 视频）以前是 base64 塞进数据库的 TEXT 列 ——
 *   搬进 Blob 之后数据库只留几十字节的路径。
 *   没配 Blob 不会让站点挂掉（媒体退回数据库），
 *   但那意味着 4MB 的硬上限，而且数据库会被媒体撑大、备份变慢。
 */
const blobToken = (process.env.BLOB_READ_WRITE_TOKEN || "").trim();
const blobStoreIdEnv = (process.env.BLOB_STORE_ID || "").trim();
const blobApiBase = (
  process.env.VERCEL_BLOB_API_URL || "https://vercel.com/api/blob"
).replace(/\/+$/, "");

/* SDK 的 parseStoreIdFromReadWriteToken 就是 token.split("_")[3]，
   对应令牌格式 vercel_blob_rw_<storeId>（四段）。 */
const blobStoreId = blobToken
  ? (blobToken.split("_")[3] || blobStoreIdEnv || "")
  : blobStoreIdEnv;

if (!blobToken) {
  WARN(
    "Vercel Blob",
    false,
    "未配置 BLOB_READ_WRITE_TOKEN",
    "媒体会退回数据库 base64 存储 —— 单文件上限 4MB，数据库还会被媒体撑大。" +
      "在 Vercel 上给项目接一个 Blob store（Store access 选 Public）即可自动注入；" +
      "本地调试可手动设 BLOB_READ_WRITE_TOKEN=vercel_blob_rw_<storeId>。",
  );
} else {
  if (!/^vercel_blob_rw_[A-Za-z0-9_-]+$/.test(blobToken)) {
    WARN(
      "Blob 令牌格式",
      false,
      "看起来不像 Vercel Blob 读写令牌",
      "格式应为 vercel_blob_rw_<storeId>（四段，下划线分隔）。",
    );
  }

  /* 真连一次 —— 「配了但连不上」比「没配」更难查。
     GET /?limit=1 是只读操作，不消耗上传配额。 */
  try {
    const res = await httpRequest(`${blobApiBase}/?limit=1`, "GET", {
      authorization: `Bearer ${blobToken}`,
      "x-vercel-blob-store-id": blobStoreId,
      "x-api-version": "13",
      "x-api-blob-request-id": `preflight:${Date.now()}`,
    });
    if (res.status === 200) {
      INFO(
        "Vercel Blob",
        true,
        `凭据可用（store ${blobStoreId || "未标注"}）`,
        "",
      );
    } else if (res.status === 401 || res.status === 403) {
      CRIT(
        "Vercel Blob",
        false,
        `凭据被拒（HTTP ${res.status}）`,
        "BLOB_READ_WRITE_TOKEN 无效或已失效 —— 去 Vercel 控制台重新复制。",
      );
    } else {
      WARN(
        "Vercel Blob",
        false,
        `探测返回 HTTP ${res.status}`,
        res.body.slice(0, 160) ||
          "非预期响应；媒体会退回数据库存储。",
      );
    }
  } catch (err) {
    WARN(
      "Vercel Blob",
      false,
      err instanceof Error ? err.message : String(err),
      "对象存储探测失败（网络不通）。媒体会退回数据库存储。",
    );
  }

  /* 直传要签 client token，SDK 只认静态读写令牌（OIDC 的短期凭据签不了） */
  INFO(
    "Blob 客户端直传",
    true,
    "可用（静态读写令牌已配置，>4MB 的文件能走直传）",
    "",
  );
}

/* 只有 OIDC 临时凭据时，直传这条路是关着的 —— 单独说清楚 */
if (!blobToken && process.env.VERCEL_OIDC_TOKEN && blobStoreIdEnv) {
  WARN(
    "Blob 客户端直传",
    false,
    "只有 OIDC 临时凭据，签不了 client token",
    "客户端直传需要静态 BLOB_READ_WRITE_TOKEN —— 超过 4MB 的文件将无法上传。",
  );
}

/* ------------------------------------------------------------------ *
 * 6. GitHub OAuth 登录（v2.8 / G18）
 * ------------------------------------------------------------------ *
 * 为什么没配只是 WARN：
 *   没配 GitHub 凭据，平台**照常可用** —— 退回邮箱密码登录。
 *   它只是少了一条更省事的登录路径。
 *   但「只配了一半」（有 client_id 没 client_secret）是个明显的部署事故：
 *   登录按钮会一直 503 —— 那种情况必须上 CRIT。
 */
const ghClientId = (process.env.GITHUB_CLIENT_ID || "").trim();
const ghClientSecret = (process.env.GITHUB_CLIENT_SECRET || "").trim();
const ghOauthBase = (
  process.env.GITHUB_OAUTH_BASE || "https://github.com"
).replace(/\/+$/, "");
const ghApiBase = (
  process.env.GITHUB_API_BASE || "https://api.github.com"
).replace(/\/+$/, "");
const ghRedirectUri = (process.env.GITHUB_REDIRECT_URI || "").trim();
const authStateSecret = (process.env.AUTH_STATE_SECRET || "").trim();

if (!ghClientId && !ghClientSecret) {
  INFO(
    "GitHub 登录",
    true,
    "未启用（平台退回邮箱密码登录，功能不缺）",
    "",
  );
} else if (!ghClientId || !ghClientSecret) {
  CRIT(
    "GitHub 登录",
    false,
    ghClientId
      ? "只配了 GITHUB_CLIENT_ID，缺 GITHUB_CLIENT_SECRET"
      : "只配了 GITHUB_CLIENT_SECRET，缺 GITHUB_CLIENT_ID",
    "两个必须成对配置 —— 缺一个登录按钮就会一直 503。" +
      "在 github.com/settings/developers 注册 OAuth App 后把两项都填上。",
  );
} else {
  INFO(
    "GitHub 登录",
    true,
    `已启用（授权端点 ${ghOauthBase} · API ${ghApiBase}）`,
    "",
  );

  if (!authStateSecret) {
    WARN(
      "OAuth state 签名密钥",
      false,
      "未配 AUTH_STATE_SECRET（会复用 GITHUB_CLIENT_SECRET 签名）",
      "复用也能用，但显式配一个独立的 AUTH_STATE_SECRET 更好 —— " +
        "换 GitHub 凭据时不会连带把正在生效的 state 签名换掉。",
    );
  }

  if (!ghRedirectUri) {
    WARN(
      "GitHub 回调地址",
      false,
      "未配 GITHUB_REDIRECT_URI（按访问域名推导）",
      "GitHub OAuth App 里的回调地址是**逐字匹配**的 —— " +
        "线上域名一旦有 www / 非 www 的差别就会 400。显式配一次最省事：" +
        "GITHUB_REDIRECT_URI=https://你的域名/api/auth/github/callback",
    );
  }
}

/* ------------------------------------------------------------------ *
 * 7. 发货通知（邮件，v2.8 / G17）
 * ------------------------------------------------------------------ *
 * 没配发信服务不会让站点挂掉 —— 通知安静跳过，订单照常完成。
 * 但那就等于没有「发货后通知」这个功能。
 */
const mailKey = (process.env.MAIL_API_KEY || process.env.RESEND_API_KEY || "").trim();
const mailFrom = (process.env.MAIL_FROM || "").trim();
const mailApiBase = (
  process.env.MAIL_API_BASE || "https://api.resend.com"
).replace(/\/+$/, "");

if (!mailKey) {
  WARN(
    "发货通知（邮件）",
    false,
    "未配置 MAIL_API_KEY",
    "发货后不会发通知 —— 收件人只能自己刷订单页。" +
      "Resend 免费额度 3000 封/月 + 100 封/天，够用很久；" +
      "配置：MAIL_API_KEY=re_xxx、MAIL_FROM=halloCD <hello@你的域名>。",
  );
} else {
  INFO(
    "发货通知（邮件）",
    true,
    `已配置（发信端点 ${mailApiBase}）`,
    "",
  );
  if (!mailFrom) {
    WARN(
      "邮件发件人",
      false,
      "未配 MAIL_FROM（会用 onboarding@resend.dev）",
      "onboarding@resend.dev 是 Resend 的测试地址 —— 只能发给自己注册时的邮箱。" +
        "正式发信必须配自己的域名：MAIL_FROM=halloCD <hello@你的域名>。",
    );
  }
}

/* ------------------------------------------------------------------ *
 * 8. 输出
 * ------------------------------------------------------------------ */
const criticalFailed = results.filter((r) => r.level === "critical" && !r.ok);
const warnFailed = results.filter((r) => r.level === "warn" && !r.ok);
const ready = criticalFailed.length === 0;

if (AS_JSON) {
  console.log(
    JSON.stringify(
      { ready, checks: results, failed: criticalFailed.length, warnings: warnFailed.length },
      null,
      2,
    ),
  );
  process.exitCode = ready ? 0 : 1;
} else {
  console.log("\n════════════════════════════════════════════════════════");
  console.log("  halloCD · 部署前自检");
  console.log("════════════════════════════════════════════════════════\n");

  for (const r of results) {
    /* 通过 = ✓；未通过按严重程度给 ✗（必须修）/ !（建议） */
    const mark = r.ok ? "✓" : r.level === "critical" ? "✗" : "!";
    console.log(`  ${mark}  ${r.name}`);
    if (r.detail) console.log(`      ${r.detail}`);
    if (!r.ok && r.fix) {
      console.log(`      → ${r.fix}`);
    }
  }

  console.log("\n────────────────────────────────────────────────────────");
  if (ready) {
    console.log("  ✓ 必需项全部就绪 —— 可以部署。");
    if (warnFailed.length) {
      console.log(`  （另有 ${warnFailed.length} 项建议项未满足，见上）`);
    }
  } else {
    console.log(`  ✗ 有 ${criticalFailed.length} 项必需项未满足 —— 现在部署会有问题。`);
  }
  console.log("────────────────────────────────────────────────────────\n");
  process.exitCode = ready ? 0 : 1;
}
