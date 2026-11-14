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
npm run assets:fetch          # 拉回真素材（素材不随仓库分发，见下）
cp .env.example .env.local    # 按注释逐条填；本地开发可以先不填
npm run dev                   # http://localhost:3000
```

**不填 `.env.local` 也能跑** —— 平台会自动回落到本地文件存储（`./data`），
数据目录首次写入时自动创建。要接 PayPal 沙盒再填 `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`。

### 关于素材：仓库里没有图，但一条命令就能拉回来

**`public/` 下的碟面、封套、信纸、便签与生活照不随仓库分发**（不可再分发）。
仓库里只留一份**规格清单**（`scripts/asset-manifest.json`：路径 + 像素尺寸 + 色调）。

但线上演示站是公开的，所以：

```bash
npm run assets:fetch           # 从 https://hallocd.vercel.app 把 45 个真素材拉回 public/
```

拉回来的文件与原始素材**逐字节一致**（已用 SHA256 逐个核对过），尺寸与清单严丝合缝，
所以布局一点都不会变形。

拉不到（网络不通 / 源站挂了）时的兜底：

```bash
npm run assets:placeholder     # 按同一份清单生成同尺寸占位图
```

占位图只画几何图形、不画文字（文字依赖系统字体，跨平台渲染不一致），
页面结构完整可见，只是画面是色块。两条命令都不覆盖已存在的文件，加 `--force` 强制重建。

> 国内网络直连 GitHub / 拉素材可能不通 —— 需要代理时设好 `HTTP_PROXY` / `HTTPS_PROXY`
> 和 `NODE_USE_ENV_PROXY=1`（Node 的 fetch 不读系统代理设置）。
> 换源站用 `--source <基址>`，拉自己的部署用：
> `node scripts/fetch-assets.mjs --source https://你的域名`

`npm run build:skill-zip` 会把 `skill/halloCD/` 打成 `public/halloCD-agent-skill.zip`
（接入台页面的下载按钮指向它；打包器自己写的，因为 `Compress-Archive` 会把条目名写成反斜杠，
macOS / Linux 上解不开）。

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

**素材不随仓库分发**，所以部署第一步必须是先生成素材 —— 否则线上全是破图。

```bash
npm install
npm run assets:fetch        # ★ 拉回 45 个真素材（拉不到会提示改用占位图）
npm run build:skill-zip     # Agent 技能包（接入台下载按钮指向它）
vercel link
vercel --prod
```

拉取源站默认是演示站 `https://hallocd.vercel.app`。要用自己的站当源：

```bash
npm run assets:fetch -- --source https://你的域名
```

拉不下来（断网 / 内网）就直接生成同尺寸占位图，站点照样跑得起来：

```bash
npm run assets:placeholder
```

> 两条命令互不覆盖 —— 已经存在的文件会被跳过，谁先跑都行；想全部重来加 `--force`。

**用 Vercel 的 Git 自动部署**：把 Build Command 设成

```bash
npm run assets:fetch || npm run assets:placeholder && npm run build
```

Vercel 的构建机上 clone 不到 `public/`，不先拉就是破图；`||` 让拉取失败时自动退成占位图。

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
  ├ fetch-assets.mjs          ★ 一键拉回真素材
  └ make-placeholder-assets.mjs ★ 同尺寸占位图（断网兜底）
public/              ★ 不随仓库分发 —— 素材不可再分发（见「关于素材」）
docs/                ★ 不随仓库分发 —— 内部产品与后端文档
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
| `public/` | **素材不可再分发** —— 留规格清单 + 一键拉取脚本，或生成同尺寸占位图 |
| `docs/` | 内部产品与后端文档 |
| `.vercel/` | Vercel 项目绑定 |
| `scripts/pg-harness/pgdata/`、`sql-log.txt`、`server.key`、`server.crt` | 本地 Postgres 数据目录、SQL 日志、自签证书（用 `gen-cert.mjs` 随时重签） |
| `*.log`、`*.key`、`*.crt` | 运行日志与私钥 |

**素材怎么回来**：两条命令，都住在 `scripts/` 里，断网也能用。

```bash
npm run assets:fetch          # 从演示站拉回 45 个真素材（已逐个核对 SHA256 与原始素材一致）
npm run assets:placeholder     # 拉不到时生成同尺寸占位图
```

`scripts/asset-manifest.json` 里记着全部 45 个文件的**精确像素尺寸与色调**，
所以拉回来的图和占位图都不会让布局变形；想换成自己的素材，按清单的路径放进 `public/` 即可。

`node scripts/audit-open-source.js` 会在提交前扫一遍并列出残留；
`node scripts/audit-assets.mjs` 校验素材引用（需要先有素材，否则会报缺失）。


---

## License

[Apache License 2.0](./LICENSE) — Copyright 2026 Quanyi-Li
