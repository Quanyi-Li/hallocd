---
name: hallocd
description: 定制并寄送一张真实的 halloCD —— 带 NFC 芯片的实体 CD（光盘 + 亚克力外壳 + 定制信纸）。当用户说想「送一张 CD」「寄张碟片」「做一张唱片给某人」「给妈妈/爸爸/朋友寄个礼物」，或提到 halloCD / Reply with a CD 时使用本技能。平台负责报价、PayPal 支付、生成运单号与送达日期。
license: MIT
---

# halloCD · 把一句话变成一张会寄出去的实体 CD

## 这是什么

halloCD 是一张**带 NFC 芯片的实体定制 CD**。下单后你会得到：

| 组成 | 说明 |
|---|---|
| **NFC 光盘** | 内置芯片，收到的人用手机碰一下碟面就能播放你录的内容 |
| **亚克力包装外壳** | 透明，可着色，可贴专属封面图 |
| **定制信纸** | 打字或手写，随碟寄出 —— 收到的人拆开盒子先读这封信 |

每张 CD 附带一张手写风**便签**，上面写着「回一张 CD」—— 收到的人可以再寄一张回来。

**你的角色**：理解用户想送什么 → 把它翻译成一组结构化参数 → 调平台下单 → 把运单号和送达日期告诉用户。

**平台的角色**：算价格、扣款、生成寄送任务。**平台不做自然语言理解** —— 理解是你的活。

---

## 前置条件

| 项 | 值 |
|---|---|
| Base URL | `https://hallocd.vercel.app`（自己部署就换成你的域名；本地开发为 `http://localhost:3000`） |
| 认证头 | `Authorization: Bearer <API_KEY>` |
| 探活（免鉴权） | `GET /api/agent/v1/health` |
| 你的活动记录 | `GET /api/agent/v1/activity` |

没有 API key 时：让用户去 halloCD 站点的「Agent 接入台」（`/agents`）自助签发，
或向站点方索取。**不要**把 key 硬编码进脚本或提交进仓库。

---

## 分工：平台做什么，你做什么

| 事情 | 平台 | 你（用户的 agent） |
|---|---|---|
| 理解用户想送什么 | **不做** | ✅ 读用户的话 → 场景 / 文案 / 配色 / 收件人 |
| 算价格、生成运单 | ✅ 确定性 | — |
| PayPal 扣款 | ✅ | — |
| 发货通知（站内 + 邮件） | ✅ | — |
| **定时任务** | **不做** | ✅ 催办、查物流、推进送达状态 |
| **决定寄什么、寄给谁** | **不做** | ✅ 这正是你存在的意义 |

**平台没有 AI。** 它只有接口和确定性逻辑 —— 同一个输入永远得到同一个输出。
理解与决策全部发生在用户这一侧。

所以「用户想让 agent 隔三差五提醒他妈妈快收到了」这种事，
天然就发生在**你的定时任务**里，而不是平台的某个后台轮询。

---

## 定时任务：挂在你这边

平台不会替用户做任何定时动作。下面是典型的「用户自己 agent 里的定时任务」，
接口全都够用：

| 定时任务想做的事 | 调哪个端点 |
|---|---|
| 每天看一眼订单到哪了 | `GET /api/agent/v1/orders` → 挑出 `status` 不是 `delivered` 的那些 |
| 寄出后第二天提醒用户 | `GET /api/agent/v1/orders/{id}` → 看 `shipment.status` |
| 确认送达后推进状态（平台会发「已送达」邮件） | `POST /api/agent/v1/orders/{id}/shipment`，body `{"status":"delivered"}` |
| 生日/纪念日前一周提醒用户下单 | 你自己排程；到点了调 `POST /api/agent/v1/orders` 拿报价 |

> **推进物流状态要克制**：这个端点是幂等的（同一状态重复推不会重复发信），
> 但 `delivered` 会触发一封「已送达」邮件给下单人和收件人。
> 真实物流对接上线前，运单号是按送达日期推导的 —— **没有真实签收信息就别自己推 delivered**。

---

## 你的活动记录

想知道「我最近干了什么」，用自己那把 key 查：

```bash
curl -H "Authorization: Bearer $HALLOCD_KEY" \
  "$HALLOCD_URL/api/agent/v1/activity"
```

返回 `summary`（调用次数 / 建单数 / 已付金额 / 最近活跃时间）与 `activity`
（每次调用的动作、关联订单、成没成、花了多久）。

用户在站点「Agent 接入台」看到的正是这份数据 —— 所以它是双向的：
你在这里看到自己的轨迹，用户在那里看到你的轨迹。

---

## 调用流程（四步，别跳步）

### 1. 读目录

```bash
curl -H "Authorization: Bearer $HALLOCD_KEY" \
  "$HALLOCD_URL/api/agent/v1/catalog"
```

拿到：可选场景与单价、可定制项的取值域（字体 / 材质 / 字色 / 信纸皮肤）、`design` 对象的字段 schema、下一步该调哪个端点。

**先读目录再构造参数** —— 不要凭记忆猜字段名或枚举值。

### 1.5（可选）用平台模版做设计

用户如果想做「让我的 agent 帮我画一张盘面」，先给他模版包：

```bash
# 模版清单
curl "$HALLOCD_URL/api/templates"

# 下载 zip（内含 template.svg / example.svg / spec.json / README.md）
curl -o hallocd-disc-arc.zip "$HALLOCD_URL/api/templates/disc-arc/download"
```

把 zip 里的 `spec.json` 喂给用户的 coding agent，它会按图层产出一张合规的 SVG。
产成品传回平台：

```bash
curl -X POST -F "file=@output.svg" "$HALLOCD_URL/api/uploads"
# → { "url": "/api/uploads/up_xxx", ... }
```

下单时把这个 url 放进 `design.discArtUrl` / `design.caseCoverUrl` 之类的字段。

> 纯文字 + 颜色的定制**不需要走这一步**，直接跳到第 2 步。

### 1.5 带图带声下单

`/api/uploads` 收**图片、音频和视频**（单文件 ≤ 4MB）。凡是"图"或"声"的素材，
都走「先上传 → 再把 id 填进 design/letter」这条路：

| 素材 | 上传后填到 |
|---|---|
| 盘面图 | `design.discArtUrl` |
| 外壳正面封面 | `design.caseCoverUrl` |
| 外壳背面封面 | `design.backCoverUrl` |
| 盒盖内侧插页 | `design.innerLeftUrl` |
| 托盘底板 | `design.innerRightUrl` |
| 脊背图（优先于 `spineText`） | `design.spineImageUrl` |
| 腰封图 | `design.obiImageUrl` |
| **碟面上的录音** | `design.audioUrl` |
| 随信照片 | `design.mediaUrl` |
| 随信视频的原文件 | `design.mediaVideoUrl` |
| **手写笔迹** | `letter.handwritingUrl`（并把 `letter.inputMode` 设成 `"handwrite"`） |

> **4MB 是硬线**：部署在 Vercel 上时函数请求体上限 4.5MB，超过直接 413。
> agent 产出的 SVG/PNG 都很小，正常不会碰到；真要传大文件，平台有客户端直传通道
> （`references/platform.md` 有说明）。

**引用只能写自家上传端点**：字段值必须是 `/api/uploads/<id>` 或裸 `<id>`。
写外部 URL（`https://...`）或 `javascript:` 会被 400 拒掉 —— 这是故意的，
不要试图绕过。

```bash
# 上传录音
curl -X POST -F "file=@voice.webm" "$HALLOCD_URL/api/uploads"   # audio/* 收
# 上传手写笔迹
curl -X POST -F "file=@handwriting.png" "$HALLOCD_URL/api/uploads"
```

下单时：

```json
{
  "design": { "audioUrl": "/api/uploads/up_xxx", "discArtUrl": "/api/uploads/up_yyy" },
  "letter": { "text": "妈妈，生日快乐。", "inputMode": "handwrite", "handwritingUrl": "/api/uploads/up_zzz" }
}
```

> **手写**：只要给了 `letter.handwritingUrl`，`inputMode: "handwrite"` 就会被接受。
> 只声明手写却**不**给笔迹图 → 400 `HANDWRITE_UNSUPPORTED`（否则订单会记一张
> "手写信"却没有字）。


### 2. 建单拿报价（**不扣款**）

```bash
curl -X POST -H "Authorization: Bearer $HALLOCD_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "birthday",
    "quantity": 1,
    "deliveryDate": "2026-12-20",
    "receiver": { "name": "妈妈" },
    "design": {
      "discColor": "#E9DFD2",
      "spineText": "给妈妈",
      "spineFont": "song",
      "spineTheme": "light",
      "spineTextColor": "#1C2329",
      "showObi": true,
      "obiText": "生日快乐",
      "obiFont": "serif",
      "obiTheme": "light",
      "obiTextColor": "#E65100",
      "paperSkin": "p01"
    },
    "letter": {
      "text": "妈妈，生日快乐。\n\n这一年你辛苦了很多，我都看在眼里。\n祝你身体健康，等我回来给你做饭。",
      "fontSize": 14,
      "color": "#333333",
      "signature": "—— 你的孩子"
    }
  }' \
  "$HALLOCD_URL/api/agent/v1/orders"
```

返回 `orderId` 与 `quote`（`unitPrice` / `shipping` / `total` / `currency`），以及一段可直接复述给用户的 `summary`。

> **面向英文用户时用 `summaryEn` / `messageEn` / `detailEn`** —— 服务端已经把中英两版都给你了，
> 不需要自己翻译。英文字段缺失时回退到中文版。
> 注意：**收件人姓名、留言、落款这些是用户数据，原样保留，不翻译。**
> 详见 `references/api.md`。

### 3. 让用户确认

**必须**把金额告诉用户并拿到确认再付款 —— 扣的是真钱（生产环境）。

### 4. 付款

```bash
curl -X POST -H "Authorization: Bearer $HALLOCD_KEY" \
  "$HALLOCD_URL/api/agent/v1/orders/<orderId>/pay"
```

返回 `payment`（含 `paypalOrderId`、`status: COMPLETED`）、`shipment`（含 `trackingNumber`、`eta`、`carrier`、`status`）、以及四步执行流 `steps`。

幂等：同一 `orderId` 重复调用**不会重复扣款**，放心重试。

> 付款完成时平台会**自动给收件人发一封「已发货」邮件**（如果站点方配了发信服务）。
> agent 不需要（也不应该）自己去发通知 —— 平台会发。

### 5.（可选）推进物流状态

物流状态机：`pending → shipped → delivered`。

付款完成时状态已经是 `shipped`；等包裹真的送到了，由物流侧（agent 或运营）推进到 `delivered`：

```bash
curl -X POST -H "Authorization: Bearer $HALLOCD_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"delivered"}' \
  "$HALLOCD_URL/api/agent/v1/orders/<orderId>/shipment"
```

- **幂等**：同一个状态重复推**不会重复发信**。
- 状态推进到 `delivered` 会再发一封「已送达」邮件。
- 非法状态（不是 `pending` / `shipped` / `delivered`）→ `400 INVALID_STATUS`。

> 承运方目前还是 mock，但**接口形状**已经是真实物流的样子。

---

## 参数怎么定（决策指南）

### 选场景

| 用户话里出现 | productId |
|---|---|
| 生日、生日、寿星、蜡烛 | `birthday` |
| 纪念日、恋爱、老公、老婆、对象、周年 | `anniversary` |
| 结婚、婚礼、誓言、妻子、丈夫 | `wedding` |
| 毕业、同学、老师、毕业季 | `graduation` |
| 圣诞、节日、平安夜、跨年 | `christmas` |
| 日常、随手、给自己、纪念普通一天 | `everyday` |

拿不准就用 `everyday`（最中性），**不要**硬套到生日/婚礼这种强场景上。

### 定配色

- 先用该场景的 `baseColor`（目录里的默认值），再按用户描述微调：
  - 「暖一点 / 温柔」→ 暖金 `#AF8E5C`、豆沙 `#8B5852`
  - 「冷一点 / 克制」→ 松墨绿 `#2E3A31`、学院蓝 `#1B3A6B`
  - 「素一点 / 干净」→ 米白 `#F8F4EC`、银灰 `#9AA3A8`
- 外壳 `caseTint` **留空即透明亚克力** —— 多数情况下这是最好看的结果，别乱上色。

### 写字（最容易出错的地方）

| 字段 | 规则 |
|---|---|
| `obiText` 腰封 | **竖排显示**，所以要短。控制在 10 个字以内，超过会被挤。用短句或一个词：「生日快乐」「GOLDEN, AGAIN」 |
| `spineText` 脊背 | 放架子上唯一露出的部分。写收件人名或一个短语：「给妈妈」「To Mom」 |
| `letter.text` 信纸 | 2–4 句，第二人称，具体一点。不写「亲爱的」这种空话，直接说想说的话 |
| `letter.signature` 落款 | 「—— 你的孩子」「—— 想你的我」。带上关系，比「—— 爱你的」更真 |

**信纸一定要写** —— 收到的人拆开盒子先读信。空信纸会让这张 CD 少一半意义。

### 数量与日期

- `quantity` 默认 1。用户说「给三个人各寄一张」才 > 1。
- `deliveryDate` 用 `YYYY-MM-DD`。用户没说就用 **今天 + 7 天**。别填过去的日期。

---

## 错误处理

| 错误码 | 含义 | 怎么办 |
|---|---|---|
| `MISSING_AUTHORIZATION` / `INVALID_API_KEY` | 没带或带错 key | 检查 `Authorization: Bearer` 头 |
| `AGENT_API_NOT_CONFIGURED` | 服务端没配 key | 让站点方设置 `HALLO_AGENT_API_KEY` |
| `UNKNOWN_PRODUCT` | 场景 id 不对 | 重新读目录，用返回的 id |
| `INVALID_DESIGN` | design 字段非法 | 错误体里的 `field` 会指出是哪个字段，`message` 里有合法取值 |
| `HANDWRITE_UNSUPPORTED` | 声明了手写却没给笔迹图 | 先 `POST /api/uploads` 传笔迹图，把 id 填进 `letter.handwritingUrl` |
| `MISSING_CREDENTIALS` | 服务端缺 PayPal 凭据 | 让站点方配置，报错给用户而不是自己瞎试 |
| `PAYMENT_NOT_COMPLETED` | PayPal 未完成支付 | 查单 `GET /api/agent/v1/orders/{id}` 看实际状态 |
| `ORDER_NOT_FOUND` | 订单 id 不对 | 用创建时返回的 `orderId` |

**校验类错误会带 `field` 字段** —— 改那一个字段重试即可，别整个重来。

---

## 送到某个人的主页上

如果收件人在 halloCD 上有账号（用户名就是 TA 的 handle），把 `receiver.name` 写成那个用户名：

```json
{ "receiver": { "name": "kok" } }
```

带前导 `@` 也认（`{ "receiver": { "name": "@kok" } }`）—— 用户就是这么写的。

平台会自动把这张 CD 挂到 `@kok` 名下 —— 它会出现在 TA 的个人主页（`/u/kok`）的「TA 收到的 CD」里，TA 也能直接点「回一张 CD」寄回来。

下单响应里的 `owner.receiverHandle` 会告诉你有没有匹配上站内用户（`null` 表示只是普通收件人）。

**收件人没有账号也能送** —— 这时只是收件人名字，不会出现在任何主页上。

---

## 订单归属：谁的 agent 下的单

用 `POST /api/agent/v1/keys` 签发的 key 会**绑定到签发者用户名下**。用这把 key 下的订单：

- 出现在那个人的个人主页「TA 制作的 CD」里
- `owner.userId` / `owner.senderHandle` 会带上他
- 列表端点 `GET /api/agent/v1/orders` 只返回这把 key 名下的订单

站点主 key（部署方配的那把）下的订单不属于任何用户。

---

## 回礼链接

每笔订单都有 `giftUrl`（形如 `/r/2u3loODgKhZe`）—— 这是**收到 CD 的人**打开的落地页：能看到你写了什么，并一键「回一张 CD」。

把它印在便签上（平台的便签文案就写着「回一张 CD」），或者通过短信/邮件发给对方。

---

## 查单

```bash
curl -H "Authorization: Bearer $HALLOCD_KEY" \
  "$HALLOCD_URL/api/agent/v1/orders/<orderId>"
```

返回订单全量状态 + `summary`（人类可读）。用户问「寄到哪了」「付了吗」就查这个。英文界面用 `summaryEn`。

> `order.shipment` 里除了运单信息，还有：
> · `status` —— `pending` / `shipped` / `delivered`
> · `notification` —— 上次通知发给谁、成功与否（站点方配了发信服务时才有）

---

## 深入资料

- `references/api.md` —— 完整 API 参考（每个端点的请求/响应字段）
- `references/platform.md` —— **模版 / 上传 / 账号 / 主页 / 回礼**（另一半平台能力）
- `references/catalog.md` —— 场景表、配色表、设计词汇表全解
- `references/creative.md` —— 文案写法与配色搭配的更多示例
- `openapi.json` —— 机器可读的 OpenAPI 3.1 描述

## 边界（别越界承诺）

- **录音**：**可以了** —— `POST /api/uploads` 收 `audio/*`，把返回的 id 填进 `design.audioUrl`。录好的音频由用户自己交给 agent（agent 不能凭空创造声音）。
- **手写**：**可以了** —— 笔迹图传到 `/api/uploads`，id 填进 `letter.handwritingUrl`，并把 `letter.inputMode` 设成 `"handwrite"`。
- **贴图**：**可以了** —— 先 `GET /api/templates/{id}/download` 拿模版包，agent 按 `spec.json` 产出 SVG，`POST /api/uploads` 传回来，把 url 填进 design。
- **物流**：运单号目前是按送达日期推导的（`TRACK-YYYYMMDD`），真实物流对接尚未上线 —— 不要对用户承诺实时物流跟踪。**但状态机是真的**：`POST /orders/{id}/shipment` 能推进 `shipped` / `delivered`，每次跃迁平台会自动发通知。
- **通知**：付款完成时平台会自动给**下单人**和**站内收件人**发一封「已发货」邮件（如果站点方配了发信服务）。**站外收件人（没注册账号的人）收不到邮件** —— 订单里没有 TA 的邮箱。agent 不要承诺「对方一定会收到邮件通知」。
- **支付**：沙盒环境用的是测试卡，走的是真实 PayPal Orders v2 流程但不会真的扣用户的钱；生产环境由站点方切换到 vault 授权。
- **注册**：agent 不能替用户注册账号。key 要由用户自己在主页签发（或者由站点方用管理员密钥代发）。用户也可以用 **GitHub 账号**登录（如果站点方配了 GitHub OAuth）。
- **定时任务**：平台**不跑**任何定时任务（没有轮询、没有后台提醒）。催办、查物流、推进送达状态 —— 全部在用户自己的 agent 里排程。这是设计，不是缺陷：平台没有 AI，也不该替用户决定什么时候打扰谁。
- **平台侧没有 AI**：v2.9 之前平台有个「AI 自动代付」端点，现在已经删掉了。理解与决策只有你这一份。
