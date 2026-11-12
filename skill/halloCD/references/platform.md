# 平台侧接口：模版 · 上传 · 主页 · 回礼

Agent API（`/api/agent/v1/*`）管的是「选什么、多少钱、付掉、发货」。
这一页讲**另一半** —— 让 agent 能真正做出东西、并把它送到人手上。

---

## GET /api/templates

模版清单。**公开，不需要鉴权。**

```json
{
  "success": true,
  "count": 9,
  "templates": [
    {
      "id": "disc-arc",
      "name": "碟面 · 弧光",
      "nameEn": "Disc · Arc",
      "kind": "disc",
      "description": "圆盘镭射弧 + 细密刻纹 + 中心文字。…",
      "descriptionEn": "Laser arc across the disc, fine grooves and centred text. …",
      "canvas": { "width": 1000, "height": 1000 },
      "layers": [
        { "id": "headline", "label": "主标题", "type": "text", "required": true, "maxLength": 24 },
        { "id": "subtitle", "label": "副标题", "type": "text", "maxLength": 40 }
      ],
      "palette": ["#1C2329", "#F8F4EC", "#E65100"],
      "fonts": ["serif", "sans", "mono", "song"],
      "download": "/api/templates/disc-arc/download"
    }
  ],
  "paperSkins": [{ "id": "p01", "name": "草莓蛋糕", "src": "/papers/paper-01.jpg", "ratio": 0.995 }],
  "howTo": "1. GET /api/templates …"
}
```

`kind` 取值：`disc`（盘面）、`cover`（外壳正面）、`obi`（腰封）、`paper`（信纸）、`inner`（托盘底板）。

---

## GET /api/templates/{templateId}/download

下载模版包（zip）。**公开。**

响应头：`Content-Type: application/zip`

zip 里四样东西：

| 文件 | 给谁看 | 内容 |
|---|---|---|
| `template.svg` | agent | 空白模版，`<g id="...">` 图层命名清晰 |
| `example.svg` | 人 | 填好的示例，照着看每层放什么 |
| `spec.json` | agent | 机器可读规格（画布 / 图层 / 色板 / 字体 / 输出要求） |
| `README.md` | agent | 怎么改、怎么交回平台 |

**agent 的标准工作流：**

```
读 spec.json  →  改 template.svg 里的图层  →  导出 SVG/PNG  →  POST /api/uploads
```

改的时候**只改 `<g id="...">` 内的内容，不要改 id** —— 平台按 id 定位图层。

---

## POST /api/uploads

上传 agent 产出的成品。

```
Content-Type: multipart/form-data
字段名：file
```

限制：单文件 ≤ 4MB；只接受 `image/*`、`audio/*`、`video/*`（以及 `image/svg+xml`、`application/pdf`、`text/plain`）。

> **为什么是 4MB 而不是 8MB**：部署在 Vercel 上时，函数的请求体硬上限是 4.5MB，
> 超过会直接返回 413 `FUNCTION_PAYLOAD_TOO_LARGE` —— 连这段代码都到不了。
> 4MB 是留出 multipart 开销后的安全线。
> 更大的文件走**客户端直传**（见下），agent 一般用不着。

```json
{
  "success": true,
  "id": "up_9f3c1a7b2e4d6081",
  "name": "disc-arc.svg",
  "mime": "image/svg+xml",
  "size": 4821,
  "url": "/api/uploads/up_9f3c1a7b2e4d6081",
  "storage": "blob",
  "usage": "design 里填 \"up_…\" 或 \"/api/uploads/up_…\"。"
}
```

`storage` 说明这个文件最终存在哪：`blob` = 对象存储（Vercel Blob），`database` = 退回数据库 base64 存。
**对 agent 来说没有区别** —— 返回的 `url` 永远是 `/api/uploads/<id>`。

失败错误码：`MISSING_FILE` · `FILE_TOO_LARGE` · `UNSUPPORTED_TYPE` · `INVALID_FORM`

**不需要鉴权** —— 上传只是暂存素材。但登录用户的素材会记在他名下。

### 大文件：客户端直传（> 4MB）

Vercel 函数的请求体装不下大文件，所以超过 4MB 的素材要**绕过函数**，由客户端直接 PUT 到对象存储。
agent 端一般用不到（产出的 SVG/PNG 都很小），但知道有这条通道存在是有用的：

```
POST /api/uploads/direct
  { "type": "blob.generate-client-token",
    "payload": { "pathname": "uploads/up_xxx.mp4",
                 "clientPayload": { "uploadId": "up_xxx", "name": "clip.mp4" } } }
  → { "type": "blob.generate-client-token", "clientToken": "vercel_blob_client_…" }

（客户端拿 clientToken 直接 PUT 到对象存储）

POST /api/uploads/direct/commit
  { "pathname": "uploads/up_xxx.mp4", "name": "clip.mp4" }
  → 与 POST /api/uploads 完全一样的响应体
```

`commit` 会**回查对象存储**确认文件真的在那儿（不信客户端报的大小和类型），
然后才落库。同一个 pathname 重复 commit 是幂等的。

---

## GET /api/uploads/{id}

取回素材。公开。响应体是原始字节，`Content-Type` 与上传时一致。

> 素材存在对象存储里时，这里是 **302 重定向**到 CDN 地址 ——
> 文件不经过我们的函数，也就不消耗函数出网流量。旧的 base64 记录仍照常返回字节。

---

## 下单时引用上传的 url

```json
{
  "productId": "birthday",
  "design": {
    "discColor": "#E9DFD2",
    "discArtUrl": "/api/uploads/up_9f3c1a7b2e4d6081",
    "caseCoverUrl": "/api/uploads/up_5e2f8c1d9b0a4736",
    "obiText": "生日快乐"
  }
}
```

**全部可引用的字段：**

| 字段 | 放什么 |
|---|---|
| `design.discArtUrl` | 盘面图 |
| `design.caseCoverUrl` | 外壳正面封面 |
| `design.backCoverUrl` | 外壳背面封面 |
| `design.innerLeftUrl` | 盒盖内侧插页 |
| `design.innerRightUrl` | 托盘底板 |
| `design.spineImageUrl` | 脊背图（优先于 `spineText`） |
| `design.obiImageUrl` | 腰封图 |
| `design.audioUrl` | **碟面上的录音** |
| `design.mediaUrl` | 随信照片（传视频时填**封面帧**） |
| `design.mediaVideoUrl` | 随信视频的原文件（不转码，存的就是用户上传的那个文件） |
| `letter.handwritingUrl` | **手写笔迹图**（配合 `letter.inputMode: "handwrite"`） |

**值的写法只有两种**：`/api/uploads/<id>` 或裸 `<id>`。平台会把裸 id 归一成前者。

外部 URL（`https://…`）、`data:`、`javascript:` 一律 400 拒掉 ——
这不是限制，是防注入（这些值最终会渲染成 `<img src>` / `<audio src>`）。

手写笔迹：

```json
{
  "letter": {
    "text": "妈妈，生日快乐。",
    "inputMode": "handwrite",
    "handwritingUrl": "/api/uploads/up_zzz"
  }
}
```

只写 `"inputMode": "handwrite"` 却**不给** `handwritingUrl` → 400
`HANDWRITE_UNSUPPORTED`。

---

## 账号（用户侧）

| 方法 | 路径 | 鉴权 | 作用 |
|---|---|---|---|
| POST | `/api/auth/register` | — | 邮箱 + 密码 + 用户名 → 自动登录 |
| POST | `/api/auth/login` | — | 邮箱 + 密码 → session cookie |
| POST | `/api/auth/logout` | — | 登出 |
| GET | `/api/auth/me` | session | 读当前用户 |
| PATCH | `/api/auth/me` | session | 改昵称 / 简介 / agent 介绍 / 头像色 |
| GET | `/api/auth/providers` | — | 这个部署支持哪些登录方式 |
| GET | `/api/auth/github` | — | 发起 GitHub OAuth（302） |
| GET | `/api/auth/github/callback` | — | OAuth 回调（302 回站内） |

**agent 不能替用户注册账号。** 但用户登录后可以在自己的主页签发一把绑定到自己的 key。

### POST /api/auth/register

```json
{ "email": "you@example.com", "password": "至少 8 位", "handle": "kok" }
```

返回 `{ success, user, profileUrl: "/u/kok" }`，并下发 httpOnly session cookie。

错误码：`INVALID_EMAIL` · `WEAK_PASSWORD` · `INVALID_HANDLE` · `EMAIL_TAKEN` · `HANDLE_TAKEN`

### GET /api/auth/providers

免鉴权。告诉前端「这个部署能不能显示 GitHub 登录按钮」：

```json
{
  "success": true,
  "providers": {
    "github": { "enabled": true, "enabled_reason": "configured", "stateSecretWeak": false }
  }
}
```

`enabled: false` 时**前端不该显示 GitHub 按钮**（点了也只会得到 503）。

### GitHub 登录（用户侧，v2.8）

用户侧登录方式的补充 —— **agent 不参与这个流程**，只是可以告诉用户「你也可以用 GitHub 登录」。

| 步骤 | 谁做 | 说明 |
|---|---|---|
| ① | 浏览器 | 访问 `GET /api/auth/github` → 302 到 GitHub 授权页 |
| ② | 用户 | 在 GitHub 上点「授权」 |
| ③ | 浏览器 | GitHub 302 回 `GET /api/auth/github/callback?code=…&state=…` |
| ④ | 平台 | 换码 → 取档案 → 建号或绑号 → 建会话 → 302 到 `/u/<handle>` |

**账号判定顺序**：已绑过这个 GitHub id → 邮箱相同 → 用户名相同 → 建新号。
身份锚点是 GitHub **数字 id**（登录名可以改，数字 id 不会）。

> 没配凭据时平台退回「邮箱 + 密码」登录，**功能不缺**。
> OAuth 建出来的账号**没有密码** —— 只能通过 GitHub 登录。

### POST /api/agent/v1/keys（登录用户自助签发）

带上 session cookie 调用，签发的 key 自动绑定到当前用户名下：

```json
{ "label": "我的 agent" }
```

返回 `{ success, key, boundTo: { handle: "kok", profileUrl: "/u/kok" } }`。

**key 只在这一次响应里出现**。之后 `GET /api/agent/v1/keys` 只能看到掩码（`hcd_xxxxxxxxxxxx…`）。

---

## Agent 接入台（人类侧）

站点上有一个专门的页面 **`/agents`** —— 用户在这里完成接入、查看 agent 的活动：

| 用户在那里能做的事 | 对应的接口 |
|---|---|
| 下载技能包 | `GET /halloCD-agent-skill.zip`（静态文件） |
| 自助签发 / 吊销 key | `POST` / `DELETE /api/agent/v1/keys`（带 session cookie） |
| 看 agent 的活动流水 | `GET /api/agent/v1/activity`（带 session cookie 或你自己的 key） |
| 复制连接信息（URL + key + 提示词） | 前端拼好给你复制 |

**这个页面不替用户做任何事** —— 它不替用户下单、不替用户付款、不替用户排程。
它只做两件事：把接口讲清楚，以及把 agent 干过的活摊开给用户看。

> 站点上曾经有一个「AI 自动代付」端点（`/api/agent/auto-reply-pay`）——
> v2.9 删掉了。平台不再跑 AI，也不再替用户决定寄什么、寄给谁。

---

## 个人主页 `/u/{handle}`

用户在这个平台上的地址。聚合三样东西：

- TA 的 agent 介绍
- TA 制作的 CD（`senderHandle` = 该用户）
- TA 收到的 CD（`receiverHandle` = 该用户）

不存在的用户名返回 **404**（由 `proxy.ts` 在渲染前拦截，保证状态码正确）。

## 回礼落地页 `/r/{giftToken}`

收到 CD 的人打开的页面：碟面、信纸正文、落款、运单号，以及「回一张 CD」按钮（跳 `/make?reply={token}`）。

每笔订单的 `giftUrl` 就是这个地址。不存在的 token 返回 **404**。

**把回礼链接印在便签上** —— 这就是「回一张 CD」那句文案的落点。

---

## 一条完整链路（用户说「帮我给妈妈寄张生日 CD」）

```
1. GET  /api/agent/v1/catalog          读场景与价格
2. GET  /api/templates                  （可选）读模版
3. GET  /api/templates/{id}/download    （可选）拿 zip → 交给用户的 coding agent
4. POST /api/uploads                    （可选）传回成品
5. POST /api/agent/v1/orders            建单 + 报价（不扣款）
6. —— 告诉用户价格，等确认 ——
7. POST /api/agent/v1/orders/{id}/pay   扣款 → 拿到 trackingNumber / eta / giftUrl
8. 把运单号、送达日期、giftUrl 告诉用户
```
