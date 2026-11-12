/**
 * halloCD · 发货通知
 * ==================================================================
 * 「CD 已经寄出去了」这件事，得有人告诉收件人 —— 否则 TA 只会一直等。
 *
 * ------------------------------------------------------------------
 * 收件人是谁？这是这个功能最难的一环：
 *
 *   订单里只记了 receiverHandle + receiverName。
 *   而**收件人很可能根本没注册账号**（礼物常常是送给站外的人的）。
 *   所以能发信的对象只有两类：
 *
 *     ① 下单人（order.userId）—— 一定有邮箱
 *     ② 收件人 —— 只有当 receiverHandle 正好对上一个站内用户时才有邮箱
 *
 *   这两类人共用同一个发信额度。所以：
 *     · 没配发信服务 → 全部安静跳过，订单照常完成
 *     · 发送失败 → 记一笔到 order.shipment.notification，绝不影响订单状态
 *     · 同一个状态只通知一次（幂等）—— agent 重试不会重复发信
 */

import { db, type DbOrder } from "@/lib/db";
import {
  htmlParagraphs,
  mailConfigured,
  readMailConfig,
  sendMail,
  type MailResult,
} from "@/lib/notify/email";

/** 物流状态机 */
export type ShipmentStatus = "pending" | "shipped" | "delivered";

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "pending",
  "shipped",
  "delivered",
];

export function isShipmentStatus(value: unknown): value is ShipmentStatus {
  return (
    typeof value === "string" &&
    (SHIPMENT_STATUSES as string[]).includes(value)
  );
}

/** 通知对象 */
export type ShipmentRecipient = {
  email: string;
  name: string;
  /** sender = 下单人；receiver = 收件人 */
  role: "sender" | "receiver";
};

export type ShipmentNotificationRecord = {
  status: ShipmentStatus;
  sentAt: string;
  recipients: {
    email: string;
    name: string;
    role: "sender" | "receiver";
    ok: boolean;
    id?: string;
    error?: string;
  }[];
};

type ShipmentBlob = {
  trackingNumber?: string;
  eta?: string;
  carrier?: string;
  status?: string;
  shippedAt?: string;
  deliveredAt?: string;
  notification?: ShipmentNotificationRecord;
};

function shipmentOf(order: DbOrder): ShipmentBlob {
  return ((order.shipment ?? {}) as ShipmentBlob) ?? {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * 算出这次通知该发给谁。
 *
 * 去重规则：下单人和收件人可能是同一个人（有人给自己做 CD），
 * 那就只发一封 —— 同一封信发两遍是在浪费额度。
 */
export async function resolveShipmentRecipients(
  order: DbOrder,
): Promise<ShipmentRecipient[]> {
  const out: ShipmentRecipient[] = [];
  const seen = new Set<string>();

  /* ① 下单人 */
  if (order.userId) {
    const owner = await db.findUserById(order.userId);
    if (owner?.email) {
      const email = owner.email.trim().toLowerCase();
      if (email && !seen.has(email)) {
        seen.add(email);
        out.push({
          email,
          name: owner.displayName || owner.handle,
          role: "sender",
        });
      }
    }
  }

  /* ② 收件人 —— 只有站内用户才有邮箱 */
  const handle = (order.receiverHandle ?? "").trim();
  if (handle) {
    const receiver = await db.findUserByHandle(handle);
    if (receiver?.email) {
      const email = receiver.email.trim().toLowerCase();
      if (email && !seen.has(email)) {
        seen.add(email);
        out.push({
          email,
          name: receiver.displayName || receiver.handle,
          role: "receiver",
        });
      }
    }
  }

  return out;
}

/** 订单里能给人看的那些事实 */
export function describeOrderForMail(order: DbOrder): {
  scene: string;
  theme: string;
  sender: string;
  receiver: string;
  trackingNumber: string;
  carrier: string;
  eta: string;
  quantity: number;
  giftUrl: string;
} {
  const plan = (order.plan ?? {}) as Record<string, unknown>;
  const shipment = shipmentOf(order);

  return {
    scene: str(plan.sceneLabel, order.productId),
    theme: str(plan.theme),
    sender: order.senderHandle ?? "",
    receiver: order.receiverName || order.receiverHandle || "",
    trackingNumber: str(shipment.trackingNumber),
    carrier: str(shipment.carrier, "halloCD Express"),
    eta: str(shipment.eta, order.deliveryDate),
    quantity: Number(order.quantity ?? 1),
    giftUrl: order.giftToken ? `/r/${order.giftToken}` : "",
  };
}

/**
 * 生成邮件正文。
 *
 * 为什么中英双语：
 *   订单里没有语言标记（语言偏好存在浏览器 localStorage 里，服务端读不到）。
 *   猜错语言的代价是「收件人看不懂」，而双语最多只是多一点字数。
 */
export function buildShipmentMail(
  order: DbOrder,
  status: ShipmentStatus,
  recipient: ShipmentRecipient,
): { subject: string; html: string; text: string } {
  const info = describeOrderForMail(order);
  const isReceiver = recipient.role === "receiver";

  const subjectZh =
    status === "delivered"
      ? "你的 halloCD 已送达"
      : "你的 halloCD 已发货";
  const subjectEn =
    status === "delivered"
      ? "Your halloCD has arrived"
      : "Your halloCD is on the way";
  const subject = `${subjectZh} · ${subjectEn}`;

  const zhLines: string[] = isReceiver
    ? [
        "有人给你寄了一张 halloCD —— 一张真的会寄到手上的实体 CD。",
        `TA 给你写了一段话，还有 ${info.quantity} 张 CD。`,
      ]
    : [
        "你做的 halloCD 已经寄出去了。",
        `收件人 ${info.receiver || "TA"} 会收到一封发货通知。`,
      ];

  const enLines: string[] = isReceiver
    ? [
        "Someone sent you a halloCD — a real, physical CD that will arrive at your door.",
        `It comes with a handwritten letter and ${info.quantity} disc(s).`,
      ]
    : [
        "Your halloCD is on its way.",
        `${info.receiver || "They"} will receive a shipping notice by email.`,
      ];

  const factsZh = [
    info.theme ? `主题：${info.theme}` : "",
    info.scene ? `场景：${info.scene}` : "",
    info.trackingNumber
      ? `运单号：${info.trackingNumber}（${info.carrier}）`
      : "",
    info.eta ? `预计送达：${info.eta}` : "",
    info.giftUrl ? `回礼链接：${info.giftUrl}` : "",
  ].filter(Boolean);

  const factsEn = [
    info.theme ? `Theme: ${info.theme}` : "",
    info.scene ? `Scene: ${info.scene}` : "",
    info.trackingNumber
      ? `Tracking number: ${info.trackingNumber} (${info.carrier})`
      : "",
    info.eta ? `Estimated delivery: ${info.eta}` : "",
    info.giftUrl ? `Send one back: ${info.giftUrl}` : "",
  ].filter(Boolean);

  const zh = [
    ...zhLines,
    ...factsZh,
    status === "delivered"
      ? "到了之后，回一张 CD 给 TA 吧。"
      : "包裹在路上，CD 到了就收好。",
  ];

  const en = [
    ...enLines,
    ...factsEn,
    status === "delivered"
      ? "Once it arrives, send one back."
      : "It's on the way — keep it somewhere safe when it lands.",
  ];

  const html = [
    '<div style="margin:0;padding:28px;background:#F8F4EC;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;color:#1C2329">',
    '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid rgba(28,35,41,0.10);border-radius:16px;padding:32px">',
    '<p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.3em;color:#E65100">HALLO CD</p>',
    `<h1 style="margin:0 0 20px;font-size:26px;font-style:italic">${subjectZh}</h1>`,
    htmlParagraphs(zh),
    '<hr style="border:none;border-top:1px solid rgba(28,35,41,0.10);margin:22px 0" />',
    `<h2 style="margin:0 0 12px;font-size:16px;font-style:italic">${subjectEn}</h2>`,
    htmlParagraphs(en),
    '<p style="margin:22px 0 0;font-size:12px;color:rgba(28,35,41,0.45)">halloCD · 一张真的能寄到手上的 CD</p>',
    "</div></div>",
  ].join("");

  const text = [...zh, "", "---", "", ...en].join("\n");

  return { subject, html, text };
}

export type ShipmentNotifyResult = {
  /** 本次是否真的发了信 */
  sent: boolean;
  /** 没发的原因 */
  skipped?: "not_configured" | "already_notified" | "no_recipient";
  status: ShipmentStatus;
  results: {
    email: string;
    role: "sender" | "receiver";
    ok: boolean;
    id?: string;
    error?: string;
  }[];
};

/**
 * 发货通知的主入口。
 *
 * 幂等：同一个 status 已经成功通知过 → 直接跳过。
 * 绝不抛异常 —— 通知失败不是订单失败。
 */
export async function notifyShipment(
  order: DbOrder,
  status: ShipmentStatus,
): Promise<ShipmentNotifyResult> {
  const config = readMailConfig();
  const shipment = shipmentOf(order);

  if (!mailConfigured(config)) {
    return { sent: false, skipped: "not_configured", status, results: [] };
  }

  const previous = shipment.notification;
  if (previous && previous.status === status) {
    return { sent: false, skipped: "already_notified", status, results: [] };
  }

  const recipients = await resolveShipmentRecipients(order);
  if (!recipients.length) {
    return { sent: false, skipped: "no_recipient", status, results: [] };
  }

  const results: ShipmentNotifyResult["results"] = [];

  for (const recipient of recipients) {
    const mail = buildShipmentMail(order, status, recipient);
    const result: MailResult = await sendMail(
      {
        to: recipient.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      },
      config,
    );
    results.push({
      email: recipient.email,
      role: recipient.role,
      ok: result.ok,
      ...(result.ok ? { id: result.id } : { error: result.error }),
    });
  }

  const sent = results.some((r) => r.ok);

  /* 记一笔 —— 让人能查到「到底有没有发出去、发给了谁」 */
  if (sent || previous) {
    const record: ShipmentNotificationRecord = {
      status,
      sentAt: new Date().toISOString(),
      recipients: results.map((r) => ({
        email: r.email,
        name: "",
        role: r.role,
        ok: r.ok,
        ...(r.id ? { id: r.id } : {}),
        ...(r.error ? { error: r.error } : {}),
      })),
    };
    try {
      await db.updateOrder(order.id, {
        shipment: {
          ...shipment,
          notification: record,
        } as unknown as Record<string, unknown>,
      });
    } catch (err) {
      console.error(
        "[notify/shipment] 写回通知记录失败：",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { sent, status, results };
}
