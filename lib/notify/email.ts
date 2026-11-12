/**
 * halloCD · 发信（服务端专用，零依赖）
 * ==================================================================
 * 发货通知要能真的把邮件送出去，所以这里接一个 HTTP 发信服务。
 *
 * 为什么是 Resend 形状的 API：
 *   · 零依赖 —— 原生 fetch 就够，不为一个 POST 请求装一个 SDK
 *   · 免费额度 3000 封/月 + 100 封/天（Resend 自有额度，2026 年官网价）
 *   · 国内可直连，不像某些国际邮件服务那样要在墙外发请求
 *
 * 为什么不用「只要邮箱的登录」（magic link）那一套：
 *   那是另一个额度池子。两边都发信的话，额度要分两份 ——
 *   而 GitHub OAuth 方案本身**一封都不用发**。
 *
 * ------------------------------------------------------------------
 * 环境变量
 * ------------------------------------------------------------------
 *   MAIL_API_KEY      发信服务的 API key（也认 RESEND_API_KEY）
 *   MAIL_FROM         发件人（默认 halloCD <onboarding@resend.dev>）
 *   MAIL_API_BASE     API 前缀（默认 https://api.resend.com）
 *                     —— 覆盖它就能用本地 mock 邮件服务器离线验证
 *
 * 没配 key 时：所有发信调用都**安静跳过**，绝不影响下单主流程。
 */

/** 单封邮件的发送结果 */
export type MailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type MailConfig = {
  apiKey: string;
  from: string;
  apiBase: string;
};

export function readMailConfig(): MailConfig {
  const apiKey = (
    process.env.MAIL_API_KEY ??
    process.env.RESEND_API_KEY ??
    ""
  ).trim();
  const from = (
    process.env.MAIL_FROM ??
    "halloCD <onboarding@resend.dev>"
  ).trim();
  const apiBase = (
    process.env.MAIL_API_BASE ??
    "https://api.resend.com"
  )
    .trim()
    .replace(/\/+$/, "");

  return { apiKey, from: from || "halloCD <onboarding@resend.dev>", apiBase };
}

/** 没配 key → 本部署不发信（通知会被跳过，订单照常走完） */
export function mailConfigured(config = readMailConfig()): boolean {
  return Boolean(config.apiKey);
}

/** 基础邮箱格式校验 —— 别把明显错的地址送出去浪费额度 */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const email = value.trim();
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 发一封邮件。
 *
 * 关键设计：**永不抛异常**。
 * 发信失败不能把「订单已发货」这件事搞失败 ——
 * 调用方拿到 { ok: false, error } 自己决定要不要记一笔。
 */
export async function sendMail(
  options: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  },
  config = readMailConfig(),
): Promise<MailResult> {
  if (!config.apiKey) {
    return { ok: false, error: "MAIL_NOT_CONFIGURED" };
  }
  if (!isValidEmail(options.to)) {
    return { ok: false, error: "INVALID_RECIPIENT" };
  }

  try {
    const res = await fetch(`${config.apiBase}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        ...(options.text ? { text: options.text } : {}),
      }),
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      return {
        ok: false,
        error: `MAIL_HTTP_${res.status}: ${text.slice(0, 200)}`,
      };
    }

    let id = "";
    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      id = String(payload.id ?? "");
    } catch {
      /* mock 服务器可能回非 JSON —— 不影响「已送达」这个结论 */
    }

    return { ok: true, id: id || `sent_${Date.now()}` };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * HTML 邮件里最容易被忽略的一个坑：换行不生效。
 * 邮件客户端把 \n 当普通空白，所以正文必须用 <br> 或 <p>。
 */
export function htmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function htmlParagraphs(lines: string[]): string {
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="margin:0 0 12px;line-height:1.7">${htmlEscape(line)}</p>`)
    .join("");
}
