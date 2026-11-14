# halloCD

> 把一句话刻成一张 CD，寄给一个具体的人。
> 平台不跑 AI —— 理解与排程住在**你自己的** agent 里（BYOA, Bring Your Own Agent）。

一个可自部署的完整产品：**DIY 定制 → 下单付款 → 发货通知 → 回礼闭环 → Agent 接入台**。

线上演示：<https://hallocd.vercel.app>

---

## 特性

| 能力 | 说明 |
|---|---|
| **CD 墙 / 画廊** | 六个场景（生日 / 纪念日 / 婚礼 / 毕业 / 圣诞 / 日常），每个场景有自己的碟面、封套、便签信纸 |
| **DIY 定制** | 碟色、腰封文字、脊背文字、盘面图、封套、手写信、照片、录音 —— 实时 3D 预览 |
| **NFC 开箱** | 扫码开盒动画，碟面会从盒子里"弹"出来（`components/CD3DViewer`） |
| **下单付款** | PayPal 收银台，报价 → 付款 → 发货 → 回礼链接 |
| **回礼闭环** | 收件人可以在 `/r/<token>` 回一张 CD，形成来回 |
| **Agent 接入台** | `/agents` —— 你的 agent 用 API key 自助签发订单、查订单、看活动流水 |
| **中英双语** | 语言状态在 localStorage，界面零中文残留 |
| **双存储** | 有 `DATABASE_URL` 走 Postgres（Neon HTTP `/sql` 契约），没有就落本地文件 |

---

## 快速开始

```bash
git clone <repo-url>
cd "hallo cd merged"          # 仓库根目录就是这一层
npm install
cp .env.example .env.local    # 按注释逐条填；本地开发可以先不填
npm run dev                   # http://localhost:3000
```

**不填 `.env.local` 也能跑** —— 平台会自动回落到本地文件存储（`./data`），
数据目录首次写入时自动创建。要接 PayPal 沙盒再填 `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`。

### 关于素材：图就在仓库里，clone 完就是完整站点

`public/` 下的碟面、封套、信纸、便签与生活照**随仓库一起分发**（共 45 个文件 / 5.70 MB）——
所以 `git clone` 完直接 `npm install && npm run dev`，页面上就是真图，不用先拉任何东西。

这些都是 **AI 生成的示意图与空白信纸模板**，不含任何人的真实照片或私人信件。

仓库里另有一份**规格清单** `scripts/asset-manifest.json`（路径 + 精确像素尺寸 + 色调），
它有两个用处：

- **校验**：清单里的尺寸与实际文件一一对应，谁改坏了能看出来。
- **兜底**：万一某个文件漏了或被删了，按清单补一张同尺寸的占位图，布局不会变形。

```bash
npm run assets:placeholder     # 按清单补齐缺失的占位图（已存在的跳过）
```

占位图只画几何图形、不画文字（文字依赖系统字体，跨平台渲染不一致）。

> **要更新素材**时用同步脚本（默认跳过已存在的文件，所以构建机上跑它会秒退，不发网络请求）：
> ```bash
> npm run assets:fetch -- --force                    # 从 https://hallocd.vercel.app 重新拉一遍
> node scripts/fetch-assets.mjs --source https://你的源站   # 换一个源站
> node scripts/fetch-assets.mjs --source a,b          # 多个源站，前一个挂了自动用后一个
> ```
> 每个请求默认 20 秒超时，`--timeout 8` 可调 —— 构建机上卡住的请求会把整次构建拖死。
> 国内网络需要代理时设好 `HTTP_PROXY` / `HTTPS_PROXY` 和 `NODE_USE_ENV_PROXY=1`
> （Node 的 fetch 不读系统代理设置）。

`npm run build:skill-zip` 会把 `skill/halloCD/` 打成 `public/halloCD-agent-skill.zip`
（接入台页面的下载按钮指向它；打包器自己写的，因为 `Compress-Archive` 会把条目名写成反斜杠，
macOS / Linux 上解不开）。这个 zip 是构建产物，不入库。

### 造一份演示数据

```bash
node scripts/seed-demo.mjs http://localhost:3000
```

会造出 `kok`（送礼人，已绑 agent）和 `mom`（收件人）两个账号、一笔已付款订单、
一条可打开的回礼链接 —— 用来走通全流程。**会真的向 PayPal 沙盒发一笔订单**（测试卡，不扣真钱）。

---

## 环境变量

完整清单和每一项怎么拿，见 [`.env.example`](./.env.example)。要点：

| 变量 | 必需 | 用途 |
|---|---|---|
| `DATABASE_URL` | 生产必需 | Neon 兼容的 HTTP `/sql` 端点；不配则落本地文件 |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | 付款必需 | PayPal 沙盒或 live |
| `PAYPAL_API_BASE` / `PAYPAL_ENV` | 可选 | 默认沙盒；live 要改成 `https://api-m.paypal.com` |
| `HALLO_AGENT_API_KEY` | Agent 必需 | 站点主 key |
| `HALLO_AGENT_ADMIN_KEY` | 可选 | 管理员密钥，用于自助签发 / 吊销 key |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 可选 | GitHub OAuth 登录；不配则退回「邮箱 + 密码」 |
| `MAIL_API_KEY` / `MAIL_FROM` | 可选 | 发货通知邮件；不配则安静跳过，订单照常完成 |
| `BLOB_READ_WRITE_TOKEN` | 建议 | Vercel Blob，挂上项目后自动注入 |

---

## 部署到 Vercel

素材已经随仓库分发，所以部署不用额外准备素材 —— clone 下来直接构建就行。

```bash
npm install
npm run build:skill-zip     # Agent 技能包（接入台下载按钮指向它）
vercel link
vercel --prod
```

**用 Vercel 的 Git 自动部署**：Build Command 保持默认的 `npm run build` 即可。

> 想更保险一点，也可以写成
> `npm run assets:fetch || npm run assets:placeholder && npm run build` ——
> 素材齐全时 `assets:fetch` 会直接秒退（已存在的文件跳过，不发网络请求）；
> 万一有文件缺失，它会自动从源站补齐，再不行就退成同尺寸占位图，页面不会破图。

1. 新建 **Neon** 数据库，把连接串填进 Vercel 的 `DATABASE_URL`
2. 新建 **Vercel Blob** store（Public），挂到项目上 —— 媒体不再 base64 塞库
3. 逐条添加 `.env.local` 里的变量
4. 平台首次访问数据库时自动建表；也可以手动 `node scripts/db-init.mjs`

部署前的自检：

```bash
node scripts/preflight.mjs          # 真去连一次库 + 校验 PayPal 凭据
node scripts/audit-open-source.js    # 确认没有凭据被带进仓库
```

---

## 部署到 EdgeOne Pages（腾讯云）

仓库自带 `edgeone.json`，EdgeOne 会自动读它 —— **控制台里基本不用改构建配置**：

```json
{
  "installCommand": "npm ci",
  "buildCommand": "npm run assets:fetch || npm run assets:placeholder && npm run build",
  "outputDirectory": ".next",
  "nodeVersion": "22.11.0",
  "cloudFunctions": { "nodejs": { "maxDuration": 60 } }
}
```

控制台里要填的：

| 项目 | 填什么 |
|---|---|
| 代码源 | GitHub → `Quanyi-Li/hallocd`（或你的 fork） |
| 框架预设 | **Next.js 全栈** —— 不是「静态导出」 |
| 根目录 | `./` |
| 构建命令 / 输出目录 / Node 版本 | 已被 `edgeone.json` 声明，控制台里填一样的即可 |
| 生产分支 | `main` |

> ⚠️ **必须用国内站**（腾讯云控制台 / pages.edgeone.ai）。
> 国际站 edgeone.ai 的 EdgeOne Pages 只做静态托管，Next.js 必须 `output: 'export'` ——
> 而本项目有 API 路由、数据库和 SSR，**静态导出不了**。

### 素材：clone 下来就有，构建机上也有

素材随仓库分发，所以 EdgeOne 的构建机上 `git clone` 完就是完整站点 —— **不需要联网拉素材**。

`edgeone.json` 里的构建命令保留了一层保险：

```
npm run assets:fetch || npm run assets:placeholder && npm run build
```

素材齐全时 `assets:fetch` 直接秒退（已存在的文件跳过，一个网络请求都不发）；
万一有文件缺失，它会从源站补齐；再不行就退成同尺寸占位图 —— **页面不破图，构建也不挂**。

> 境内访问 `vercel.app` 时好时坏，但这只影响「补齐缺失文件」这一步，不影响正常部署。
> 想换成自己的源站：
> `npm run assets:fetch -- --source https://a.example.com,https://hallocd.vercel.app`
> （逗号分隔多个源站，前一个挂了自动用后一个；每个请求默认 20 秒超时，`--timeout` 可调）

### 环境变量

在 EdgeOne 控制台「项目设置 → 环境变量」里逐条加（**不要**写成 `.env` 提交进仓库）：

| 变量 | 必需 | 说明 |
|---|---|---|
| `DATABASE_URL` | 建议 | Neon 连接串；不填会回落到本地文件存储 `./data`（容器重启即丢） |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | 支付必需 | PayPal 凭据 |
| `PAYPAL_ENV` | 支付必需 | `sandbox` / `live` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | 可选 | GitHub OAuth 登录；不配就退回「邮箱 + 密码」 |
| `BLOB_READ_WRITE_TOKEN` | 可选 | Vercel Blob —— EdgeOne 上一般拿不到，见下 |
| `HALLO_AGENT_API_KEY` | 可选 | Agent 接入台 |

### EdgeOne 上的已知差异

| 事项 | 情况 | 影响 |
|---|---|---|
| 贴图 / 录音 ≤ 4MB | ✅ 正常 | 走服务端中转；没有 Blob 时 base64 存库 |
| 贴图 / 录音 > 4MB | ❌ 不可用 | 直传要签 Vercel Blob 的静态 token，EdgeOne 拿不到 |
| `/u/:handle`、`/r/:token` 的 404 状态码 | ⚠️ 可能退化 | `proxy.ts`（Next 16 的 middleware）不一定被 EdgeOne 适配；退化后页面内容仍是 404 页，只是状态码变 200 |
| `cacheComponents`（PPR） | ⚠️ 未实测 | 若构建或渲染报错，先把 `next.config.ts` 里的 `cacheComponents` 关掉再试 |
| `vercel.json` | 不被读取 | 里面的 `regions` 是 Vercel 专属；`buildCommand` / `installCommand` 已由 `edgeone.json` 覆盖 |

> EdgeOne Pages 的中国大陆加速区域要求自定义域名完成 **ICP 备案**；用默认域名或境外区域可以先跑起来。
> EdgeOne 的 Next.js 适配仍在演进，上面标「未实测」的两项请以构建日志为准。

---

## 目录结构

```
app/                 路由与 API（Next.js App Router）
  api/agent/v1/      Agent 接入台 API（API key 鉴权）
components/          UI 组件（DiscArtwork / GalleryView / CheckoutPanel / CD3DViewer …）
lib/
  agent/             Agent 平台：鉴权、目录、订单、PayPal、发货计划
  db/                存储抽象：postgres.ts（Neon HTTP）与 file.ts（本地文件）
  draft/             浏览器端草稿（保住未下单的录音与照片）
lib/products.ts      六个场景的产品定义
components/paperSkins.ts  信纸皮肤（比例 / 书写区 / 底色明暗）
skill/halloCD/       给 Agent 用的技能包（OpenAPI + 创作指南）
scripts/             建表、种子、测试、自检脚本
  ├ asset-manifest.json       ★ 45 个素材的规格清单（路径 / 像素尺寸 / 色调）
  ├ fetch-assets.mjs          ★ 从源站同步素材（多源站 + 超时）
  └ make-placeholder-assets.mjs ★ 同尺寸占位图（兜底）
public/              ★ 素材随仓库分发（45 个文件 / 5.70 MB）—— clone 下来就有图
docs/                ★ 不随仓库分发 —— 内部产品与后端文档
edgeone.json         ★ EdgeOne Pages 的构建配置（构建命令 / 输出目录 / Node 版本）
```

---

## 自检与测试

```bash
# 静态
node scripts/check-schema-consistency.mjs   # INSERT/UPDATE 引用的列都在 schema 里
node scripts/check-sql-batch.mjs            # 多语句批次顺序正确
node scripts/check-design-vocab.mjs         # 两份设计词汇表一致（31 项断言）
node scripts/audit-assets.mjs               # 被渲染消费的素材都在 public/ 下（需先有素材）
node scripts/audit-open-source.js           # 确认没有凭据被带进仓库

# 接口（需要先 npm run start）
node scripts/web-checkout-test.mjs    http://localhost:3000   # 43 项
node scripts/agent-platform-test.mjs  http://localhost:3000   # 48 项
node scripts/e2e-business-flow.mjs    http://localhost:3000   # 60 项
node scripts/agent-connect-test.mjs   http://localhost:3000   # 33 项
node scripts/blob-upload-test.mjs     http://localhost:3000   # 34 项
node scripts/v28-features-test.mjs    http://localhost:3000   # 40 项
```

---

## 文档

内部产品与后端文档（产品规格、存储契约、Agent 接入指南）**不随仓库分发**。
想了解设计意图，看仓库里的 `docs/` 说明与代码注释，或直接联系维护者。

代码本身带了不少说明性注释 —— `lib/db/postgres.ts`（为什么走 HTTP `/sql`）、
`lib/agent/paypal.ts`（capture 流程）、`components/DiscArtwork.tsx`（透明盒镂空比例）
都写清楚了「为什么这么写」，而不只是「怎么写」。

技能包文档是公开的：[`skill/halloCD/`](./skill/halloCD) —— `SKILL.md` + `openapi.json` + 创作参考。

---

## 开源边界

**不会进仓库**（`.gitignore` 已覆盖）：

| 路径 | 原因 |
|---|---|
| `.env*` | 真实凭据 —— 只保留 `.env.example`（全占位符） |
| `data/` | 运行时数据：用户、订单、会话、API key 哈希 |
| `public/` | **素材随仓库分发** —— AI 生成的示意图与空白信纸模板，无私人内容 |
| `docs/` | 内部产品与后端文档 |
| `.vercel/` | Vercel 项目绑定 |
| `scripts/pg-harness/pgdata/`、`sql-log.txt`、`server.key`、`server.crt` | 本地 Postgres 数据目录、SQL 日志、自签证书（用 `gen-cert.mjs` 随时重签） |
| `*.log`、`*.key`、`*.crt` | 运行日志与私钥 |

**素材**：随仓库分发（45 个文件 / 5.70 MB，全是 AI 生成的示意图与空白信纸模板）。
`scripts/asset-manifest.json` 记着每个文件的**精确像素尺寸与色调** ——
想换成自己的素材，按清单的路径放进 `public/` 就行，布局不会变形；
某个文件漏了也能用 `npm run assets:placeholder` 补一张同尺寸占位图。

`node scripts/audit-open-source.js` 会在提交前扫一遍并列出残留；
`node scripts/audit-assets.mjs` 校验素材引用与尺寸。


---

## License

[Apache License 2.0](./LICENSE) — Copyright 2026 Quanyi-Li
