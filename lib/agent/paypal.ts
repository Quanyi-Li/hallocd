/**
 * PayPal 服务端客户端（Sandbox / Live 通用）
 * ------------------------------------------------------------------
 * 设计取舍：不引入 @paypal/paypal-server-sdk，改为原生 fetch 直调
 * OAuth2 + Orders v2。原因有三：
 *   1. 零新增依赖 —— 交付包不必额外跑 npm install；
 *   2. SDK v2 的请求体字段是驼峰（purchaseUnits），与 REST 文档的
 *      snake_case（purchase_units）不一致，容易埋坑，直调 REST 更可控；
 *   3. 需要「带 payment_source 建单」这一条特定路径，裸 REST 更好调。
 *
 * 无感代付（Agent 代替用户付款）的两条支付源：
 *   A. vault  —— payment_source.paypal.vault_id
 *      生产形态：用户一次性授权后存进 vault，之后 Agent 可直接扣款，无需再次交互。
 *      需配置 PAYPAL_VAULT_ID。
 *   B. card   —— payment_source.card + 沙盒测试卡
 *      Sandbox 形态：沙盒测试卡可直接建单即完成扣款（status=COMPLETED），
 *      完全服务端、无浏览器依赖，可直接部署到 Vercel。默认走这条。
 *
 * 关键坑：带 payment_source 建单时 PayPal 强制要求 PayPal-Request-Id 幂等键，
 * 缺失会返回 400 PAYPAL_REQUEST_ID_REQUIRED。
 */

import { randomUUID } from "node:crypto";

export type BillingAddress = {
  address_line_1: string;
  address_line_2?: string;
  admin_area_2: string;
  admin_area_1: string;
  postal_code: string;
  country_code: string;
};

export type CardConfig = {
  number: string;
  expiry: string;
  brand: string;
  name: string;
  billingAddress: BillingAddress;
};

export type PayPalConfig = {
  clientId: string;
  clientSecret: string;
  apiBase: string;
  /** 生产形态：已授权的 vault_id（可选） */
  vaultId: string | null;
  /** 沙盒形态：测试卡（默认使用 PayPal Sandbox 通用 Visa 测试卡） */
  card: CardConfig;
  currency: string;
};

/** PayPal Sandbox 通用测试卡：4111 1111 1111 1111，任何未来有效期均可 */
const SANDBOX_TEST_CARD: CardConfig = {
  number: "4111111111111111",
  expiry: "2035-12",
  brand: "VISA",
  name: "John Doe",
  billingAddress: {
    address_line_1: "123 Main Street",
    admin_area_2: "Anytown",
    admin_area_1: "CA",
    postal_code: "94107",
    country_code: "US",
  },
};

export class PayPalError extends Error {
  status: number;
  issue: string;
  debugId: string | null;
  body: unknown;

  constructor(
    message: string,
    opts: { status?: number; issue?: string; debugId?: string | null; body?: unknown } = {},
  ) {
    super(message);
    this.name = "PayPalError";
    this.status = opts.status ?? 0;
    this.issue = opts.issue ?? "UNKNOWN";
    this.debugId = opts.debugId ?? null;
    this.body = opts.body;
  }
}

/** 读取并归一化 PayPal 配置（全部来自环境变量，密钥不落代码库） */
export function readPayPalConfig(): PayPalConfig {
  const env = process.env;
  const envLive = (env.PAYPAL_ENV || "sandbox").trim().toLowerCase() === "live";

  const apiBase =
    (env.PAYPAL_API_BASE || "").trim() ||
    (envLive ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

  const billingAddress: BillingAddress = {
    address_line_1: (env.PAYPAL_CARD_ADDRESS_LINE1 || SANDBOX_TEST_CARD.billingAddress.address_line_1).trim(),
    admin_area_2: (env.PAYPAL_CARD_CITY || SANDBOX_TEST_CARD.billingAddress.admin_area_2).trim(),
    admin_area_1: (env.PAYPAL_CARD_STATE || SANDBOX_TEST_CARD.billingAddress.admin_area_1).trim(),
    postal_code: (env.PAYPAL_CARD_POSTAL_CODE || SANDBOX_TEST_CARD.billingAddress.postal_code).trim(),
    country_code: (env.PAYPAL_CARD_COUNTRY || SANDBOX_TEST_CARD.billingAddress.country_code).trim(),
  };

  return {
    clientId: (env.PAYPAL_CLIENT_ID || "").trim(),
    clientSecret: (env.PAYPAL_CLIENT_SECRET || "").trim(),
    apiBase,
    vaultId: (env.PAYPAL_VAULT_ID || "").trim() || null,
    card: {
      number: (env.PAYPAL_CARD_NUMBER || SANDBOX_TEST_CARD.number).trim(),
      expiry: (env.PAYPAL_CARD_EXPIRY || SANDBOX_TEST_CARD.expiry).trim(),
      brand: (env.PAYPAL_CARD_BRAND || SANDBOX_TEST_CARD.brand).trim(),
      name: (env.PAYPAL_CARD_NAME || SANDBOX_TEST_CARD.name).trim(),
      billingAddress,
    },
    currency: (env.PAYPAL_CURRENCY || "USD").trim().toUpperCase(),
  };
}

/** 凭据是否齐备 */
export function hasCredentials(config: PayPalConfig): boolean {
  return Boolean(config.clientId && config.clientSecret);
}

/* ------------------------------------------------------------------ */
/*  Access Token（进程内缓存，接近过期时提前 60s 刷新）                  */
/* ------------------------------------------------------------------ */

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

async function fetchAccessToken(config: PayPalConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const res = await fetch(`${config.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    throw new PayPalError(
      `获取 PayPal access token 失败（HTTP ${res.status}）：${String(body.error_description ?? body.error ?? "unknown")}`,
      { status: res.status, issue: "TOKEN_FAILED", body },
    );
  }

  const token = String(body.access_token ?? "");
  const expiresIn = Number(body.expires_in ?? 0);
  tokenCache = { token, expiresAt: now + expiresIn * 1000 };
  return token;
}

/* ------------------------------------------------------------------ */
/*  Orders v2                                                          */
/* ------------------------------------------------------------------ */

export type OrderResult = {
  orderId: string;
  /** PayPal 订单最终状态：COMPLETED / APPROVED / CREATED / ... */
  status: string;
  captureId: string | null;
  captureStatus: string | null;
  amount: string | null;
  currency: string | null;
  /** 实际使用的支付源，便于排查 */
  paymentSource: "vault" | "card" | "paypal";
  raw: unknown;
};

function buildHeaders(token: string, requestId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    // 不带这个头只会返回精简资源（id/status/links），拿不到金额与扣款明细
    Prefer: "return=representation",
    // 带 payment_source 建单时 PayPal 强制要求的幂等键
    "PayPal-Request-Id": requestId,
  };
}

function extractIssue(body: unknown): string {
  if (!body || typeof body !== "object") return "UNKNOWN";
  const details = (body as { details?: unknown }).details;
  if (Array.isArray(details) && details.length > 0) {
    const first = details[0] as { issue?: string };
    if (first?.issue) return first.issue;
  }
  const name = (body as { name?: string }).name;
  return name || "UNKNOWN";
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** 从订单资源里抽出首条 capture 明细 */
function readCapture(order: unknown): { id: string | null; status: string | null; amount: string | null; currency: string | null } {
  const units = (order as { purchase_units?: unknown[] })?.purchase_units;
  const unit = Array.isArray(units) ? (units[0] as Record<string, unknown>) : undefined;
  const payments = unit?.payments as { captures?: unknown[] } | undefined;
  const capture = Array.isArray(payments?.captures)
    ? (payments.captures[0] as Record<string, unknown>)
    : undefined;
  const amount = capture?.amount as { value?: string; currency_code?: string } | undefined;
  return {
    id: capture?.id ? String(capture.id) : null,
    status: capture?.status ? String(capture.status) : null,
    amount: amount?.value ?? null,
    currency: amount?.currency_code ?? null,
  };
}

/**
 * 创建订单并完成扣款（无感代付核心）。
 *
 * 流程：
 *   1. POST /v2/checkout/orders （带 payment_source + PayPal-Request-Id）
 *      —— sandbox 测试卡路径会「建单即完成」，返回的订单 status 已经是 COMPLETED
 *   2. 若订单仍处于 CREATED/APPROVED，则调用 /capture 主动扣款
 *   3. 若 capture 返回 ORDER_ALREADY_CAPTURED，说明建单时已扣款，回查订单为准
 */
export async function createCapturedOrder(input: {
  amount: string;
  currency: string;
  description: string;
  referenceId?: string;
  customId?: string;
  /** 幂等键：同一 requestId 重复调用不会重复扣款 */
  requestId?: string;
  config?: PayPalConfig;
}): Promise<OrderResult> {
  const config = input.config ?? readPayPalConfig();
  if (!hasCredentials(config)) {
    throw new PayPalError(
      "缺少 PayPal 凭据：请在 .env.local 中配置 PAYPAL_CLIENT_ID 与 PAYPAL_CLIENT_SECRET",
      { issue: "MISSING_CREDENTIALS" },
    );
  }

  const token = await fetchAccessToken(config);
  const requestId = input.requestId || randomUUID();

  const purchaseUnit: Record<string, unknown> = {
    description: input.description.slice(0, 127),
    amount: {
      currency_code: input.currency,
      value: Number(input.amount).toFixed(2),
    },
  };
  if (input.referenceId) purchaseUnit.reference_id = input.referenceId;
  if (input.customId) purchaseUnit.custom_id = input.customId;

  const paymentSource =
    config.vaultId
      ? { paypal: { vault_id: config.vaultId } }
      : {
          card: {
            number: config.card.number,
            expiry: config.card.expiry,
            brand: config.card.brand,
            name: config.card.name,
            billing_address: config.card.billingAddress,
          },
        };
  const paymentSourceKind: OrderResult["paymentSource"] = config.vaultId ? "vault" : "card";

  /* --- 1. 建单 --- */
  const createRes = await fetch(`${config.apiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: buildHeaders(token, requestId),
    body: JSON.stringify({
      intent: "CAPTURE",
      payment_source: paymentSource,
      purchase_units: [purchaseUnit],
    }),
    cache: "no-store",
  });

  let order = await readJsonSafe(createRes);

  if (!createRes.ok) {
    throw new PayPalError(
      `PayPal 建单失败（HTTP ${createRes.status}）：${extractIssue(order)}`,
      {
        status: createRes.status,
        issue: extractIssue(order),
        debugId: (order as { debug_id?: string })?.debug_id ?? null,
        body: order,
      },
    );
  }

  let orderId = String((order as { id?: string })?.id ?? "");
  let status = String((order as { status?: string })?.status ?? "");

  /* --- 2. 需要时主动 capture（vault / 部分支付源） --- */
  if (status === "CREATED" || status === "APPROVED" || status === "PAYER_ACTION_REQUIRED") {
    const captureRes = await fetch(`${config.apiBase}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: buildHeaders(token, randomUUID()),
      body: "{}",
      cache: "no-store",
    });
    const captureBody = await readJsonSafe(captureRes);
    const issue = extractIssue(captureBody);

    if (!captureRes.ok && issue !== "ORDER_ALREADY_CAPTURED") {
      throw new PayPalError(
        `PayPal 扣款失败（HTTP ${captureRes.status}）：${issue}`,
        {
          status: captureRes.status,
          issue,
          debugId: (captureBody as { debug_id?: string })?.debug_id ?? null,
          body: captureBody,
        },
      );
    }

    // ORDER_ALREADY_CAPTURED / 成功，都以回查订单为准
    const getRes = await fetch(`${config.apiBase}/v2/checkout/orders/${orderId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      cache: "no-store",
    });
    order = await readJsonSafe(getRes);
    status = String((order as { status?: string })?.status ?? status);
  }

  const capture = readCapture(order);

  return {
    orderId,
    status,
    captureId: capture.id,
    captureStatus: capture.status,
    amount: capture.amount,
    currency: capture.currency,
    paymentSource: paymentSourceKind,
    raw: order,
  };
}

/* ------------------------------------------------------------------ */
/*  「用户自己去 PayPal 上付款」路径（网页端直付）                      */
/* ------------------------------------------------------------------ */

/**
 * 审批单（approval order）
 * ------------------------------------------------------------------
 * 与上面的 createCapturedOrder 是**两种完全不同的付款形态**：
 *
 *   createCapturedOrder（代付）
 *     → 带 payment_source（vault / 测试卡），服务端拿着凭据直接扣。
 *     → 用户全程不参与，钱从平台/agent 那一侧出去。
 *     → agent 路径必须用它：agent 没有浏览器，替用户付款是它的本职。
 *
 *   createApprovalOrder（直付）
 *     → 不带 payment_source，建单后 PayPal 只把单子停在 CREATED，
 *       交回一条 payer-action 链接（= PayPal 自己的收银台页面）。
 *     → 用户点「确认付款」→ 浏览器跳到 PayPal → **用户自己在 PayPal 上
 *       确认金额、登录账号或刷卡** → PayPal 跳回我们的 return_url。
 *     → 网页端该走这条：钱是从用户自己的 PayPal/卡里出的，
 *       平台只是搭了个架子，不该替人掏钱。
 *
 * 关键点：intent 仍然是 CAPTURE，但 capture 必须等用户批准之后由服务端调 ——
 * 用户没点确认之前，一分钱都不会动。
 */

export type ApprovalOrder = {
  orderId: string;
  /** 建单后的状态：CREATED（待用户批准） */
  status: string;
  /** PayPal 收银台链接 —— 让浏览器跳过去 */
  approveUrl: string | null;
  amount: string | null;
  currency: string | null;
  raw: unknown;
};

/** 从订单资源里找收银台链接（rel 叫 payer-action，个别接口叫 approve） */
function readApproveUrl(order: unknown): string | null {
  const links = (order as { links?: unknown[] })?.links;
  if (!Array.isArray(links)) return null;
  const hit = links.find((l) => {
    const rel = String((l as { rel?: string })?.rel ?? "");
    return rel === "payer-action" || rel === "approve";
  });
  const href = (hit as { href?: string })?.href;
  return typeof href === "string" && href ? href : null;
}

/** 建一张「等用户批准」的 PayPal 单，返回收银台链接 */
export async function createApprovalOrder(input: {
  amount: string;
  currency: string;
  description: string;
  referenceId?: string;
  customId?: string;
  /** 用户批准后 PayPal 跳回来的地址 */
  returnUrl: string;
  /** 用户在 PayPal 上点「取消」后回来的地址 */
  cancelUrl: string;
  /** 幂等键：同一个 requestId 重复建单不会多出一张 PayPal 单 */
  requestId?: string;
  config?: PayPalConfig;
}): Promise<ApprovalOrder> {
  const config = input.config ?? readPayPalConfig();
  if (!hasCredentials(config)) {
    throw new PayPalError(
      "缺少 PayPal 凭据：请在 .env.local 中配置 PAYPAL_CLIENT_ID 与 PAYPAL_CLIENT_SECRET",
      { issue: "MISSING_CREDENTIALS" },
    );
  }

  const token = await fetchAccessToken(config);
  const requestId = input.requestId || randomUUID();

  const purchaseUnit: Record<string, unknown> = {
    description: input.description.slice(0, 127),
    amount: {
      currency_code: input.currency,
      value: Number(input.amount).toFixed(2),
    },
  };
  if (input.referenceId) purchaseUnit.reference_id = input.referenceId;
  if (input.customId) purchaseUnit.custom_id = input.customId;

  const res = await fetch(`${config.apiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: buildHeaders(token, requestId),
    body: JSON.stringify({
      intent: "CAPTURE",
      /* 这里**不带** payment_source —— 正是这一点让 PayPal 把单子停在
         CREATED，等用户自己在收银台确认 */
      purchase_units: [purchaseUnit],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "halloCD",
            locale: "en-US",
            shipping_preference: "NO_SHIPPING",
            user_action: "PAY_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    }),
    cache: "no-store",
  });

  const order = await readJsonSafe(res);
  if (!res.ok) {
    throw new PayPalError(
      `PayPal 建单失败（HTTP ${res.status}）：${extractIssue(order)}`,
      {
        status: res.status,
        issue: extractIssue(order),
        debugId: (order as { debug_id?: string })?.debug_id ?? null,
        body: order,
      },
    );
  }

  const unit = (order as { purchase_units?: unknown[] })?.purchase_units?.[0] as
    | { amount?: { value?: string; currency_code?: string } }
    | undefined;

  return {
    orderId: String((order as { id?: string })?.id ?? ""),
    status: String((order as { status?: string })?.status ?? ""),
    approveUrl: readApproveUrl(order),
    amount: unit?.amount?.value ?? null,
    currency: unit?.amount?.currency_code ?? null,
    raw: order,
  };
}

/** 回读一张 PayPal 单 —— 用来复用已建好的审批单（用户多点了一次「确认付款」） */
export async function readPaypalOrder(input: {
  orderId: string;
  config?: PayPalConfig;
}): Promise<ApprovalOrder> {
  const config = input.config ?? readPayPalConfig();
  if (!hasCredentials(config)) {
    throw new PayPalError("缺少 PayPal 凭据", { issue: "MISSING_CREDENTIALS" });
  }
  const token = await fetchAccessToken(config);
  const res = await fetch(`${config.apiBase}/v2/checkout/orders/${input.orderId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    cache: "no-store",
  });
  const order = await readJsonSafe(res);
  if (!res.ok) {
    throw new PayPalError(
      `回读 PayPal 订单失败（HTTP ${res.status}）：${extractIssue(order)}`,
      { status: res.status, issue: extractIssue(order), body: order },
    );
  }
  const unit = (order as { purchase_units?: unknown[] })?.purchase_units?.[0] as
    | { amount?: { value?: string; currency_code?: string } }
    | undefined;
  return {
    orderId: String((order as { id?: string })?.id ?? ""),
    status: String((order as { status?: string })?.status ?? ""),
    approveUrl: readApproveUrl(order),
    amount: unit?.amount?.value ?? null,
    currency: unit?.amount?.currency_code ?? null,
    raw: order,
  };
}

/**
 * 用户已经在 PayPal 上点过「确认付款」之后，服务端把这一单扣下来。
 *
 * 幂等：PayPal 对同一张单重复 capture 会回 ORDER_ALREADY_CAPTURED，
 * 这种情况按「已扣成功」处理（回查订单为准），不会重复扣钱。
 */
export async function captureApprovedOrder(input: {
  orderId: string;
  config?: PayPalConfig;
}): Promise<OrderResult> {
  const config = input.config ?? readPayPalConfig();
  if (!hasCredentials(config)) {
    throw new PayPalError("缺少 PayPal 凭据", { issue: "MISSING_CREDENTIALS" });
  }
  const token = await fetchAccessToken(config);

  const captureRes = await fetch(`${config.apiBase}/v2/checkout/orders/${input.orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": randomUUID(),
    },
    body: "{}",
    cache: "no-store",
  });

  const captureBody = await readJsonSafe(captureRes);
  const issue = extractIssue(captureBody);

  if (!captureRes.ok && issue !== "ORDER_ALREADY_CAPTURED") {
    throw new PayPalError(
      `PayPal 扣款失败（HTTP ${captureRes.status}）：${issue}`,
      {
        status: captureRes.status,
        issue,
        debugId: (captureBody as { debug_id?: string })?.debug_id ?? null,
        body: captureBody,
      },
    );
  }

  /* 回查订单：capture 的返回体有时只给精简资源，
     这里统一以「回查到的订单」为准 —— 金额、capture id 都在里面。 */
  const getRes = await fetch(`${config.apiBase}/v2/checkout/orders/${input.orderId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    cache: "no-store",
  });
  const order = await readJsonSafe(getRes);
  const status = String((order as { status?: string })?.status ?? "");
  const capture = readCapture(order);

  return {
    orderId: input.orderId,
    status,
    captureId: capture.id,
    captureStatus: capture.status,
    amount: capture.amount,
    currency: capture.currency,
    paymentSource: "paypal",
    raw: order,
  };
}
