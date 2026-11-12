/**
 * GET /api/agent/v1/health
 * ------------------------------------------------------------------
 * 公开端点（不需要鉴权）—— 用来让 agent 先探活、看平台支持哪些能力。
 */

import { connection, NextResponse } from "next/server";

import { CATALOG_VERSION } from "@/lib/agent/catalog";
import { hasCredentials, readPayPalConfig } from "@/lib/agent/paypal";
import { describeStore, probeDatabase } from "@/lib/db";
import { withStorageGuard } from "@/lib/api/storage-guard";
import {
  blobClientTokenCapable,
  blobConfigured,
  probeMedia,
} from "@/lib/media/blob";
import {
  CLIENT_UPLOAD_MAX_BYTES,
  SERVER_UPLOAD_MAX_BYTES,
} from "@/lib/media/upload-client";
import { githubConfigured } from "@/lib/auth/github";
import { oauthStateSecretIsWeak } from "@/lib/auth/oauth-state";
import { mailConfigured, readMailConfig } from "@/lib/notify/email";

async function __guardedGET() {
  await connection();

  const config = readPayPalConfig();
  const store = describeStore();
  /* 真的去连一次库 —— 「配了 DATABASE_URL」不等于「连得上」 */
  const probe = await probeDatabase();
  /* 媒体（录音 / 照片 / 视频）现在到底存在哪 */
  const media = await probeMedia();
  const githubEnabled = githubConfigured();
  const mailConfig = readMailConfig();
  const mailEnabled = mailConfigured(mailConfig);
  const mailFrom = mailConfig.from;

  const warnings = [...store.warnings];
  if (store.kind === "postgres" && !probe.ok) {
    warnings.push(
      `数据库连不上：${probe.error ?? "未知原因"}。` +
        "跑 node scripts/preflight.mjs 能直接看到是哪一环（URL 供应商 / host 写法 / 出网 / 证书）。",
    );
  }
  if (!media.ok) {
    warnings.push(
      `对象存储不可用：${media.error ?? "未知原因"}。` +
        "媒体会退回数据库 base64 存储（单文件 4MB 上限）；生产建议给项目接一个 Vercel Blob store。",
    );
  }
  if (!mailEnabled) {
    warnings.push(
      "发货通知未启用（缺 MAIL_API_KEY）—— 订单照常完成，但不会给收件人发邮件。" +
        "Resend 免费额度 3000 封/月，够用很久。",
    );
  }
  if (githubEnabled && oauthStateSecretIsWeak()) {
    warnings.push(
      "GitHub 登录已启用，但 state 签名用的是复用自 GITHUB_CLIENT_SECRET 的弱密钥 —— " +
        "建议显式配置 AUTH_STATE_SECRET。",
    );
  }

  return NextResponse.json({
    ok: true,
    service: "halloCD Agent API",
    version: CATALOG_VERSION,
    capabilities: [
      "catalog.read",
      "orders.create",
      "orders.read",
      "orders.pay",
      "orders.shipment",
      "templates.read",
      "templates.download",
      "uploads.create",
    ],
    paypal: {
      configured: hasCredentials(config),
      environment: config.apiBase.includes("sandbox") ? "sandbox" : "live",
      /** agent 路径的扣款方式：vault（已授权的代扣）或 card（沙盒测试卡） */
      mode: config.vaultId ? "vault" : "card",
      /**
       * 网页端走的是**另一种**付款形态（v2.11）：
       * 不代付 —— 跳到 PayPal 收银台，用户自己确认金额、自己付款，
       * 批准之后我们才 capture。agent 能力表里的 orders.pay 仍然是代付。
       */
      webMode: "approval",
    },
    storage: { ...store, probe },
    /**
     * 媒体存储现状 —— 录音 / 照片 / 视频搬去了对象存储之后加的。
     *
     * storage:
     *   blob     = 媒体在 Vercel Blob（数据库只留路径）
     *   database = 退回数据库 base64（受 4MB 上限约束）
     * directUpload:
     *   能不能签 client token（>4MB 的文件必须靠它）
     * transcoding:
     *   恒为 false —— 我们不转码，视频存原文件，封面帧在客户端抽
     */
    media: {
      storage: media.storage,
      configured: blobConfigured(),
      directUpload: blobClientTokenCapable(),
      transcoding: false,
      serverMaxBytes: SERVER_UPLOAD_MAX_BYTES,
      clientMaxBytes: CLIENT_UPLOAD_MAX_BYTES,
      probe: media,
    },
    /**
     * 登录方式（v2.8 / G18）—— agent 能据此决定要不要提示用户走 GitHub 登录。
     * github.enabled=false 不是错误：平台退回邮箱密码登录，功能不缺。
     */
    auth: {
      methods: githubEnabled ? ["session", "github"] : ["session"],
      github: {
        enabled: githubEnabled,
        stateSecretWeak: oauthStateSecretIsWeak(),
      },
    },
    /**
     * 发货通知（v2.8 / G17）——
     * mail.enabled=false 时订单照常完成，只是不会发出邮件。
     */
    notify: {
      mail: {
        enabled: mailEnabled,
        from: mailFrom || null,
      },
    },
    /**
     * 部署就绪度 —— 部署后 curl 这个端点就能看出「能不能上生产」。
     * ready=false 通常意味着漏配 DATABASE_URL，或者配了但连不上。
     */
    deployment: {
      ready: store.kind === "postgres" && probe.ok,
      warnings,
    },
    docs: "/api/agent/v1/catalog",
  });
}

export const GET = withStorageGuard(__guardedGET);
