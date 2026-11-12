# halloCD Agent API · 完整参考

Base URL：`https://<域名>`（本地 `http://localhost:3000`）

所有端点（`/health` 除外）需要：

```
Authorization: Bearer <API_KEY>
```

所有响应体都带 `success: boolean`。失败时带 `error`（机器可读错误码）与 `message`（人类可读说明），部分错误额外带 `field`（指出是哪个字段不对）。

---

## GET /api/agent/v1/health

免鉴权。探活 + 能力声明。

```json
{
  "ok": true,
  "service": "halloCD Agent API",
  "version": "v1",
  "capabilities": ["catalog.read", "orders.create", "orders.read", "orders.pay", "orders.shipment", "templates.read", "templates.download", "uploads.create"],
  "paypal": { "configured": true, "environment": "sandbox", "mode": "card" },
  "auth": {
    "methods": ["session", "github"],
    "github": { "enabled": true, "stateSecretWeak": false }
  },
  "notify": {
    "mail": { "enabled": true, "from": "halloCD <hello@example.com>" }
  },
  "docs": "/api/agent/v1/catalog"
}
```

> `auth.github.enabled` —— 站点方是否启用了 GitHub 登录（用户侧）。
> `notify.mail.enabled` —— 站点方是否配了发信服务。
> **两者都是 false 都不影响 agent 的流程** —— 只是用户少一条登录路、没有发货邮件。

---

## GET /api/agent/v1/catalog

读目录。**每次开工都先调这个** —— 场景、价格、取值域都在里面。

顶层字段：

| 字段 | 说明 |
|---|---|
| `summary` | 一句话讲清平台能干什么 |
| `capabilities` | 能力清单 |
| `scenes[]` | 可选场景（见下） |
| `designOptions` | 设计词汇表：碟面色、脊背字体/材质/字色/模板、腰封模板、信纸皮肤 |
| `designSchema` | `design` 对象每个字段的类型与取值域 |
| `endpoints` | 自描述端点表（方法 + 路径 + 是否鉴权） |
| `workflow` | 推荐调用顺序 |
| `currency` / `shippingFlat` | 币种与固定运费 |

### `scenes[]` 单项

```json
{
  "id": "birthday",
  "label": "Birthday",
  "labelZh": "生日",
  "theme": "生日 · 定制蛋糕盘面",
  "unitPrice": 49.9,
  "currency": "USD",
  "description": "把生日那天的烛光刻进碟面。…",
  "art": "rings",
  "baseColor": "#EFE3D3",
  "obi": { "text": "MAKE A WISH", "bg": "#A0573A" },
  "note": {
    "text": "Every candle deserves a song. …",
    "textZh": "每一根蜡烛都值得一首歌。…",
    "cta": "Reply with a CD",
    "ctaZh": "回一张 CD"
  },
  "paperTemplate": "p01",
  "assets": { "cover": "/images/birthday-cover.jpg", "back": "…", "disc": "…" }
}
```

`art` 是纯 SVG 封面变体（`rings` / `ribbon` / `star` / `null`）。`assets` 是参考素材路径，**不会自动套用到订单**。

---

## POST /api/agent/v1/orders

建单 + 报价。**不扣款。**

### 请求体

```jsonc
{
  "productId": "birthday",         // 必填，scenes[].id 之一
  "quantity": 1,                   // 1–99，默认 = 收件人数量
  "deliveryDate": "2026-12-20",    // YYYY-MM-DD，非法则回落「今天 + 7 天」
  "receiver": {                    // 也接受纯字符串
    "name": "妈妈",
    "note": "大学宿舍楼 3 号"      // 可选
  },
  "design": { /* 见下 */ },
  "letter": { /* 见下 */ }
}
```

### `design` 字段

| 字段 | 类型 | 取值域 | 说明 |
|---|---|---|---|
| `discColor` | string | `#RRGGBB` | 碟面底色。缺省用场景 `baseColor` |
| `caseTint` | string | `#RRGGBB` | 外壳着色。**留空 = 透明亚克力** |
| `spineText` | string | ≤60 字 | 脊背文字 |
| `spineFont` | enum | `serif` \| `sans` \| `mono` \| `song` | |
| `spineTheme` | enum | `glass` \| `dark` \| `light` | 脊背背景材质 |
| `spineTextColor` | enum \| hex | `ink` \| `paper` \| `orange` \| `silver`，或 `#RRGGBB` | |
| `showObi` | boolean | | 是否贴腰封，缺省 true |
| `obiText` | string | ≤60 字 | 腰封文字（竖排） |
| `obiFont` | enum | 同 `spineFont` | |
| `obiTheme` | enum | 同 `spineTheme` | |
| `obiTextColor` | enum \| hex | 同 `spineTextColor` | |
| `paperSkin` | enum | `p01` … `p11` | 信纸皮肤，缺省用场景 `paperTemplate` |
| `discArtUrl` | string | `/api/uploads/<id>` | 盘面图 |
| `caseCoverUrl` | string | `/api/uploads/<id>` | 外壳正面封面 |
| `backCoverUrl` | string | `/api/uploads/<id>` | 外壳背面封面 |
| `innerLeftUrl` | string | `/api/uploads/<id>` | 盒盖内侧插页 |
| `innerRightUrl` | string | `/api/uploads/<id>` | 托盘底板 |
| `spineImageUrl` | string | `/api/uploads/<id>` | 脊背图（优先于 `spineText`） |
| `obiImageUrl` | string | `/api/uploads/<id>` | 腰封图 |
| `audioUrl` | string | `/api/uploads/<id>` | 碟面上的录音 |
| `mediaUrl` | string | `/api/uploads/<id>` | 随信照片（传视频时填**封面帧**） |
| `mediaVideoUrl` | string | `/api/uploads/<id>` | 随信视频的原文件（不转码） |

> 素材字段的值只能是自家上传端点的引用。外部 URL 与 `javascript:` 会被 400 拒掉。

### `letter` 字段

| 字段 | 类型 | 取值域 |
|---|---|---|
| `text` | string | ≤2000 字，信纸正文 |
| `fontSize` | number | 10–28（px） |
| `color` | string | `#RRGGBB` 墨色 |
| `signature` | string | ≤60 字，落款 |
| `inputMode` | enum | `"type"` 或 `"handwrite"` |
| `handwritingUrl` | string | `/api/uploads/<id>` | 手写笔迹图 |

> `"handwrite"` 必须同时给 `handwritingUrl`，否则报 `HANDWRITE_UNSUPPORTED`。

### 响应 `201`

```json
{
  "success": true,
  "orderId": "ord_1a2b3c4d5e6f7a8b",
  "status": "quoted",
  "quote": { "unitPrice": "49.90", "shipping": "6.00", "total": "55.90", "currency": "USD" },
  "summary": "订单 ord_…（quoted）\n场景：Birthday · …",
  "design": { /* 已补齐默认值的完整 design */ },
  "letter": { /* 规范化后的 letter */ },
  "shipment": { "trackingNumber": "TRACK-20261220", "eta": "2026-12-20", "carrier": "halloCD Express" },
  "pay": { "method": "POST", "path": "/api/agent/v1/orders/ord_…/pay", "description": "…" },
  "next": "把 quote.total 告知用户并取得确认，然后调用 pay 端点。"
}
```

> `shipment` 在**报价阶段**就已生成（运单号由送达日期推导），真正发货发生在 pay 之后。别在报价阶段就告诉用户「已发货」。

---

## POST /api/agent/v1/orders/{orderId}/pay

扣款 + 生成寄送任务。**幂等**：重复调用不会重复扣款。

无请求体。

### 响应 `200`

```json
{
  "success": true,
  "alreadyPaid": false,
  "orderId": "ord_…",
  "status": "paid",
  "payment": {
    "paypalOrderId": "97G00372RE8500836",
    "captureId": "…",
    "status": "COMPLETED",
    "amount": "55.90",
    "currency": "USD"
  },
  "shipment": { "trackingNumber": "TRACK-20261220", "eta": "2026-12-20", "carrier": "halloCD Express", "status": "shipped", "shippedAt": "2026-11-13T10:00:00.000Z" },
  "quote": { "…": "…" },
  "steps": [
    { "key": "quote",     "title": "报价确认",   "status": "done", "detail": "…", "detailEn": "…" },
    { "key": "customize", "title": "定制参数",   "status": "done", "detail": "…", "detailEn": "…" },
    { "key": "pay",       "title": "PayPal 支付完成", "status": "done", "detail": "…", "detailEn": "…" },
    { "key": "ship",      "title": "安排寄送",   "status": "done", "detail": "…", "detailEn": "…" }
  ],
  "notification": { "sent": true, "skipped": null },
  "summary": "订单 ord_…（paid）…运单号：TRACK-20261220（halloCD Express）",
  "summaryEn": "Order ord_… (paid) … tracking number: TRACK-20261220 (halloCD Express)",
  "message": "支付完成，寄送任务已创建。",
  "messageEn": "Payment completed, shipping task created."
}
```

> **`notification` 说的是「这次有没有把发货通知发出去」** ——
> `sent: true` = 下单人和站内收件人都收到了「已发货」邮件；
> `skipped: "not_configured"` = 站点方没配发信服务（订单照常完成，只是没人收到邮件）。
> **把这件事如实转述给用户**，别自己猜。
>
> **`steps` 的第一步是「报价确认」而不是「解析需求」** —— 解析是你的活，平台不替你看懂用户。

> **英文字段是可选的**：服务端同时给出中英两版，**缺 `*En` 时回退到中文字段**。
> 你的 agent 若面向英文用户，展示时优先取 `detailEn` / `summaryEn` / `messageEn`，取不到就用中文版。
> 注意：**收件人姓名、留言、落款这些是用户数据，不翻译** —— 服务端只翻译自己写的文案。

---

## POST /api/agent/v1/orders/{orderId}/shipment

推进物流状态。**幂等**：同一个状态重复推不会重复发信。

### 请求体

```json
{ "status": "delivered", "trackingNumber": "TRACK-20261220", "eta": "2026-12-20", "carrier": "halloCD Express" }
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `status` | 否 | `pending` / `shipped` / `delivered`。不传则沿用订单当前状态 |
| `trackingNumber` | 否 | 不传则沿用订单里的运单号 |
| `eta` | 否 | 不传则沿用订单里的预计送达 |
| `carrier` | 否 | 不传则沿用订单里的承运商 |

### 响应 `200`

```json
{
  "success": true,
  "orderId": "ord_…",
  "status": "delivered",
  "shipment": { "trackingNumber": "TRACK-20261220", "eta": "2026-12-20", "carrier": "halloCD Express", "status": "delivered", "shippedAt": "…", "deliveredAt": "…" },
  "notification": { "sent": true, "skipped": null }
}
```

`notification.skipped` 的取值：

| 值 | 含义 |
|---|---|
| `null` | 通知已发出（`sent: true`）或不需要发 |
| `"not_configured"` | 站点方没配发信服务 —— **不是错误**，订单照常 |
| `"already_notified"` | 这个状态之前已经通知过了（幂等） |
| `"no_recipient"` | 订单没有任何可发信的收件人（下单人也没有邮箱） |

### 错误

| HTTP | `error` | 场景 |
|---|---|---|
| 400 | `INVALID_JSON` | 请求体不是合法 JSON |
| 400 | `INVALID_STATUS` | `status` 不是 `pending` / `shipped` / `delivered` |
| 401 | `INVALID_API_KEY` | key 无效 / 被吊销 |
| 404 | `ORDER_NOT_FOUND` | 订单不存在 |

> **付款完成时平台已经自动发过一封「已发货」邮件** —— 所以这个端点通常只用来推进到 `delivered`。

---

## GET /api/agent/v1/orders/{orderId}

查单。返回订单全量状态 + `summary`。

---

## GET /api/agent/v1/orders?limit=50

列订单。**只返回调用方这把 key 名下的订单。**

```json
{
  "success": true,
  "count": 3,
  "orders": [
    { "orderId": "ord_…", "status": "paid", "productId": "birthday", "quantity": 1,
      "total": "55.90", "currency": "USD", "deliveryDate": "2026-12-20",
      "trackingNumber": "TRACK-20261220", "createdAt": "2026-11-11T00:00:00.000Z" }
  ]
}
```

---

## POST /api/agent/v1/keys （管理员）

自助签发一枚 API key。需要管理员密钥（`HALLO_AGENT_ADMIN_KEY`）。

> **用户不需要管理员密钥** —— 用户在站点的「Agent 接入台」（`/agents`）登录后
> 自助签发，key 直接绑在他的用户名下。用那把 key 下的单会出现在他的个人主页。
> 管理员密钥只是给站点方自己用的。

```json
// 请求
{ "label": "Kok 的 MacBook" }

// 响应 201
{
  "success": true,
  "key": "hcd_…",
  "label": "Kok 的 MacBook",
  "createdAt": "2026-11-11T00:00:00.000Z",
  "usage": { "header": "Authorization: Bearer hcd_…", "baseUrl": "https://…" },
  "note": "请立刻保存 —— 这枚 key 只在本次响应里出现一次。"
}
```

## DELETE /api/agent/v1/keys （管理员）

```json
{ "key": "hcd_…" }
```

---

## GET /api/agent/v1/activity

看这把 key 名下的活动流水 —— 调用次数、建单数、已付金额、最近活跃时间，
以及每次调用干了什么。

**用户在站点「Agent 接入台」看到的就是这份数据**，所以它是双向的：
你可以查自己的轨迹，用户也可以查你的。

### 响应 `200`

```json
{
  "success": true,
  "summary": {
    "totalCalls": 12,
    "lastActiveAt": "2026-11-11T09:20:00.000Z",
    "ordersCreated": 2,
    "ordersPaid": 1,
    "failed": 0,
    "spentAmount": "55.90",
    "currency": "USD",
    "inFlight": 1
  },
  "keys": [
    { "label": "我的 agent", "createdAt": "2026-11-01T…", "lastActiveAt": "2026-11-11T09:20:00.000Z" }
  ],
  "activity": [
    {
      "id": "…",
      "action": "order.pay",
      "method": "POST",
      "path": "/api/agent/v1/orders/ord_…/pay",
      "orderId": "ord_…",
      "statusCode": 200,
      "ok": true,
      "detail": "",
      "durationMs": 812,
      "createdAt": "2026-11-11T09:20:00.000Z",
      "keyLabel": "我的 agent"
    }
  ]
}
```

`action` 的取值：`catalog.read` / `order.create` / `order.list` / `order.read` /
`order.pay` / `shipment.update` / `key.manage` / `other`。

> **流水里不会出现 key 本身**，只有它的标签 —— 日志不该变成密钥泄露面。

---

## 错误码全表

| HTTP | error | 说明 |
|---|---|---|
| 400 | `INVALID_JSON` | 请求体不是合法 JSON |
| 400 | `INVALID_BODY` | 请求体不是对象 |
| 400 | `MISSING_PRODUCT_ID` | 缺 `productId` |
| 400 | `UNKNOWN_PRODUCT` | 场景 id 不存在 |
| 400 | `INVALID_DESIGN` | design 字段非法（带 `field`） |
| 400 | `INVALID_LETTER` | letter 字段非法（带 `field`） |
| 400 | `HANDWRITE_UNSUPPORTED` | API 不支持手写 |
| 401 | `MISSING_AUTHORIZATION` | 没带 Authorization |
| 401 | `INVALID_AUTHORIZATION` | 头格式不对 |
| 401 | `INVALID_API_KEY` | key 无效或已吊销 |
| 401 | `INVALID_ADMIN_KEY` | 管理员密钥不对 |
| 404 | `ORDER_NOT_FOUND` | 订单不存在 |
| 404 | `KEY_NOT_FOUND` | key 不存在 |
| 402 | `PAYMENT_NOT_COMPLETED` | PayPal 订单未完成支付 |
| 502 | `PAYPAL_REQUEST_FAILED` | PayPal 请求失败 |
| 503 | `MISSING_CREDENTIALS` | 服务端缺 PayPal 凭据 |
| 503 | `AGENT_API_NOT_CONFIGURED` | 服务端未配置任何 API key |
| 503 | `ADMIN_KEY_NOT_CONFIGURED` | 服务端未配置管理员密钥 |
