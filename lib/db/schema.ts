/**
 * halloCD · Postgres 表结构
 * ==================================================================
 * 由 DataStore.init() 自动执行（全部 CREATE TABLE IF NOT EXISTS，幂等）。
 * 也可以手动执行 scripts/db-init.mjs 或直接贴进 Neon 控制台。
 *
 * 设计取舍：
 *   · 复杂对象（design / letter / plan / quote / payment / shipment）整体存 JSON 文本
 *   · 只为「会被查」和「有约束」的字段建独立列
 *   · agent_keys.user_id 是「agent 绑定在用户名下」的落点
 *   · orders.gift_token 是回礼跳转 /r/[token] 的公开凭据
 *
 * ------------------------------------------------------------------
 * 【语句顺序是有讲究的，别随手调】
 *
 * 这整段是**一次性发出去**的多语句批次，数据库按顺序逐句执行，
 * **任何一句报错，后面的语句就都不会执行了**。
 *
 * 所以顺序必须是：
 *   ① CREATE TABLE（带全最新列）  —— 新库一步到位
 *   ② ALTER TABLE ADD COLUMN       —— 补老库缺的列
 *   ③ CREATE INDEX                 —— 索引只能建在**已经存在**的列上
 *
 * v2.8 踩过的坑：users_github_idx 一开始写在 CREATE TABLE 后面，
 * 而 github_id 是靠后面的 ALTER 加的 —— 在**老库**上这句索引直接报
 * 「column github_id does not exist」，于是连它后面的 ALTER 都被带崩了，
 * 整张 users 表少三列，注册接口 500。
 * 索引挪到所有 ALTER 之后就没事了。
 */

export const SCHEMA_SQL = `
/* ---------- ① 建表 ---------- */
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  handle            TEXT UNIQUE NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  display_name      TEXT NOT NULL DEFAULT '',
  bio               TEXT NOT NULL DEFAULT '',
  avatar_color      TEXT NOT NULL DEFAULT '#E65100',
  agent_note        TEXT NOT NULL DEFAULT '',
  password_hash     TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  github_id         TEXT,
  github_login      TEXT,
  github_avatar_url TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_keys (
  key        TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE
);

-- 用户自己的 agent 每次调用平台接口都留一笔。
-- 表里只存 key 的**标签**，不存 key 本身 —— 活动日志不该变成密钥泄露面。
CREATE TABLE IF NOT EXISTS agent_activity (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
  key_label   TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  method      TEXT NOT NULL DEFAULT '',
  path        TEXT NOT NULL DEFAULT '',
  order_id    TEXT,
  status_code INTEGER NOT NULL DEFAULT 0,
  ok          BOOLEAN NOT NULL DEFAULT TRUE,
  detail      TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,
  user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
  sender_handle   TEXT,
  receiver_handle TEXT,
  receiver_name   TEXT NOT NULL DEFAULT '',
  gift_token      TEXT UNIQUE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'quoted',
  product_id      TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  delivery_date   TEXT NOT NULL,
  quote_json      TEXT NOT NULL DEFAULT '{}',
  plan_json       TEXT NOT NULL DEFAULT '{}',
  design_json     TEXT NOT NULL DEFAULT '{}',
  letter_json     TEXT NOT NULL DEFAULT '{}',
  payment_json    TEXT,
  shipment_json   TEXT,
  error_json      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  assets_json  TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uploads (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL,
  size       INTEGER NOT NULL DEFAULT 0,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  blob_path  TEXT,
  blob_url   TEXT
);

/* ---------- ② 补列（老库兼容）---------- */
/* CREATE TABLE IF NOT EXISTS 不会给**已存在**的表补列，所以这里要 ALTER。
   顺序很重要：必须排在所有依赖这些列的索引之前。 */
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS blob_path TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS blob_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_login TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_avatar_url TEXT;

/* ---------- ③ 建索引 ---------- */
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS agent_keys_user_idx ON agent_keys(user_id);
CREATE INDEX IF NOT EXISTS agent_activity_user_idx ON agent_activity(user_id);
CREATE INDEX IF NOT EXISTS agent_activity_order_idx ON agent_activity(order_id);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_gift_idx ON orders(gift_token);
CREATE INDEX IF NOT EXISTS orders_receiver_idx ON orders(receiver_handle);
CREATE INDEX IF NOT EXISTS uploads_user_idx ON uploads(user_id);
/* GitHub 身份锚点：一个 GitHub 账号只能对应一个站内账号 */
CREATE UNIQUE INDEX IF NOT EXISTS users_github_idx
  ON users(github_id) WHERE github_id IS NOT NULL;
`;
