# halloCD · Postgres 运行时验证工具链

> 为什么需要这套东西：文件后端跑绿**不等于** Postgres 路径能跑。
> 那套 SQL 此前从未真正执行过 —— 而生产环境走的正是它。

## 它是什么

用 **PGlite**（Postgres 的 WASM 构建，**真内核**）垫底，实现 **Neon HTTP `/sql` 契约**，
让**未经修改的生产代码**（`lib/db/postgres.ts` 里的 `neon()`）连上去。

真实的部分：
- 驱动是项目里真的 `@neondatabase/serverless`
- SQL 是项目里真的 `SCHEMA_SQL` 与业务 SQL
- 内核是真的 Postgres（PGlite = Postgres 17 编译到 WASM）
- 只有「Neon 那台服务器」被换成了本地 shim

唯一被替换的是**服务端**，所以这套验证能抓到的都是真问题：
SQL 语法错、列名对不上、参数绑定不对、类型往返错、并发建表竞态……

## 准备

本目录自带 `package.json`，两个**可选**依赖装在这里（**不进应用的 package.json**）：

```bash
cd scripts/pg-harness
npm install
```

> 为什么要单独一个 `package.json`：没有它的话，npm 会往上找到应用的根 `package.json`，
> 把 pglite / node-forge 装进应用的 `node_modules` —— 验证工具污染生产依赖树。

## 跑法

### 1. 生成证书（shim 用 HTTPS 监听 443）

```bash
cd scripts/pg-harness
node gen-cert.mjs
```

> 为什么是 443：驱动的默认 endpoint 是 `https://<host>/sql`（不带端口）。
> Windows 没有 Linux 的特权端口限制，所以本地监听 443 就能让
> **生产代码一行不改**地连上来 —— 这比注入 `fetchEndpoint` 更接近真实部署。

### 2. 起 shim

```bash
cd scripts/pg-harness
node shim.mjs
```

环境变量：

| 变量 | 作用 |
|---|---|
| `FAULT_INJECT=N` | 前 N 次建表请求故意返回 Postgres 并发建表冲突错误（用来验证重试逻辑） |

### 3. 起应用（指向 shim）

```powershell
$env:DATABASE_URL='postgresql://postgres:pw@localhost:443/hallocd'
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'   # shim 用的是自签名证书
$env:PORT='3001'
node node_modules\next\dist\bin\next start
```

### 4. 验证

```bash
# 契约层：真实驱动 ↔ Postgres 内核（18 项）
node scripts/pg-harness/driver-contract.mjs

# 冷启动并发：空库 + 27 个并发首请求，期望零 5xx
node scripts/pg-harness/cold-start-concurrency.mjs http://localhost:3001

# A/B 证明竞态重试（需先带 FAULT_INJECT=3 重启 shim 与应用）
node scripts/pg-harness/ab-proof.mjs http://localhost:3001
```

跑完之后把应用指向真正的 Postgres 跑一遍业务流：

```bash
node scripts/e2e-business-flow.mjs http://localhost:3001     # 60/60
node scripts/agent-platform-test.mjs http://localhost:3001   # 48/48
node scripts/agent-connect-test.mjs http://localhost:3001   # 33/33
```

> `agent-connect-test.mjs` 走的是**用户的真实接入路径**（注册 → 自助签发 key →
> agent 用自己的 key 调接口 → 活动流水被记下来 → 吊销后旧 key 立刻失效）。
> 它顺带验证了 `agent_activity` 这张新表在 Postgres 上真的能写能读 ——
> 而这张表**只在 Postgres 路径上才会暴露问题**（文件后端走的是 JSON 文件，
> 写坏了顶多是一份坏 JSON）。

## 一个容易骗过人的坑：PGlite 的 bool 参数

契约测试第一次跑挂在 `Invalid input for boolean type`。**这不是生产代码的问题**
—— 查下来是 PGlite 与真实 Neon 的行为差异：

| | 驱动发出的参数 | 谁来解析 |
|---|---|---|
| 真实 Neon | `42` → `"42"`、`true` → `"true"`（**全是文本**） | **Postgres 服务端**推断类型并解析 |
| PGlite（WASM 客户端） | 同上 | 客户端按服务端推断的类型挑 JS 序列化器，而 bool 的序列化器**只吃原生 boolean** |

所以同样的请求，真实 Neon 正常，PGlite 炸。

修法在 `shim.mjs`：先用 PGlite 的 `describeQuery()` 问 Postgres「这几个参数分别是什么类型」，
再把文本还原成对应类型的原生值 —— **等价于把 Postgres 服务端那次解析搬到本地做**，
结果与真实 Neon 完全一致（bool 的规范文本就是 `t`/`f`）。

> 反过来印证：驱动把参数全序列化成文本是**设计如此**，
> Neon 侧必然是服务端解析 —— 否则所有数字参数都会失效。

## 文件

| 文件 | 作用 |
|---|---|
| `shim.mjs` | Neon HTTP `/sql` 兼容服务 + 故障注入 + SQL 日志 |
| `gen-cert.mjs` | 生成自签名证书（node-forge） |
| `driver-contract.mjs` | 驱动 ↔ Postgres 契约的 18 项断言 |
| `cold-start-concurrency.mjs` | 冷库并发首请求压测 |
| `ab-proof.mjs` | 并发建表竞态的 A/B 证明 |
| `package.json` | 验证工具自己的依赖（与应用的 package.json 隔离） |

## 产物

跑完会留下（都在本目录，可随时删）：

| 文件 | 说明 |
|---|---|
| `server.key` / `server.crt` | 自签名证书 |
| `pgdata/` | PGlite 数据目录 —— **删掉它就是「全新空库」** |
| `sql-log.txt` | 真实执行过的 SQL（可直接核对生产代码发了什么） |
