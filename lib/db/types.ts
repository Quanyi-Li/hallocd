/**
 * halloCD · 数据层类型与存储接口
 * ==================================================================
 * 平台的持久化只有一张很薄的抽象：**DataStore**。
 * 两个实现共用同一组行类型：
 *   · lib/db/postgres.ts —— 生产（Neon / Vercel Postgres / 任何 Postgres）
 *   · lib/db/file.ts      —— 本地回退（无 DATABASE_URL 时自动接管）
 *
 * 复杂字段（design / letter / plan / quote）整体存 JSON 文本。
 * 好处：schema 极简、迁移成本低、前后端契约改动不用改表结构。
 */

export type DbUser = {
  id: string;
  handle: string;
  email: string;
  displayName: string;
  bio: string;
  avatarColor: string;
  /** 用户给自己的 agent 写的一句话介绍（展示在个人主页） */
  agentNote: string;
  /** GitHub OAuth 绑定（空串 / null = 没绑） */
  githubId: string | null;
  /** GitHub 登录名（展示用） */
  githubLogin: string | null;
  /** GitHub 头像 URL */
  githubAvatarUrl: string | null;
  createdAt: string;
};

export type DbUserWithSecret = DbUser & { passwordHash: string };

export type DbSession = {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

export type DbAgentKey = {
  key: string;
  label: string;
  /** 绑定的用户 —— 「agent 绑定在用户名下」的实现落点 */
  userId: string | null;
  createdAt: string;
  revoked: boolean;
};

/**
 * 用户自己的 agent 调平台接口时留下的活动记录。
 *
 * 这是「Agent 接入台」上「agent 的活动信息」的数据来源。
 *
 * 为什么只存 key 的标签不存 key 本身：
 *   活动日志会长期留在数据库里，而 key 是可以随时吊销的凭据。
 *   把凭据写进日志，等于给「日志文件」开了一个不受吊销控制的后门。
 */
export type DbAgentActivity = {
  id: string;
  /** 归属用户 —— 站点主 key 的调用没有归属（null） */
  userId: string | null;
  /** 用的是哪把 key 的标签 */
  keyLabel: string;
  /** 动作标识：catalog / order.create / order.read / order.pay / shipment.update */
  action: string;
  method: string;
  path: string;
  orderId: string | null;
  statusCode: number;
  ok: boolean;
  /** 一句话摘要 —— 列表里直接给人看 */
  detail: string;
  durationMs: number;
  createdAt: string;
};

export type DbOrderStatus = "quoted" | "paid" | "failed";

export type DbOrder = {
  id: string;
  /** 下单者（可能是 agent 代表用户下的） */
  userId: string | null;
  senderHandle: string | null;
  /** 收件人 —— 可以是站内 handle，也可以是自由文本 */
  receiverHandle: string | null;
  receiverName: string;
  /** 回礼跳转用的公开 token（便签 CTA「回一张 CD」的落点） */
  giftToken: string;
  status: DbOrderStatus;
  productId: string;
  quantity: number;
  deliveryDate: string;
  quote: Record<string, unknown>;
  plan: Record<string, unknown>;
  design: Record<string, unknown>;
  letter: Record<string, unknown>;
  payment: Record<string, unknown> | null;
  shipment: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type DbTemplate = {
  id: string;
  name: string;
  /** disc | cover | obi | paper | package —— 决定素材包的结构 */
  kind: string;
  description: string;
  /** 可下载素材清单 */
  assets: { name: string; path: string; note?: string }[];
  createdAt: string;
};

export type DbUpload = {
  id: string;
  name: string;
  mime: string;
  /** base64 文本（Postgres 里存 TEXT，避免 bytea 在 HTTP 驱动下的编码坑）。
   *  媒体搬到对象存储后这里是空串 —— 见 blobPath / blobUrl。 */
  data: string;
  size: number;
  userId: string | null;
  createdAt: string;
  /** 对象存储里的路径（空串 = 这条记录还在数据库里） */
  blobPath: string;
  /** 对象存储里的公开 URL（空串 = 这条记录还在数据库里） */
  blobUrl: string;
};

export interface DataStore {
  readonly kind: "postgres" | "file";
  /** 幂等建表（Postgres 走 CREATE TABLE IF NOT EXISTS） */
  init(): Promise<void>;

  /* ---- 用户 ---- */
  createUser(user: DbUserWithSecret): Promise<DbUser>;
  findUserById(id: string): Promise<DbUserWithSecret | null>;
  findUserByHandle(handle: string): Promise<DbUserWithSecret | null>;
  findUserByEmail(email: string): Promise<DbUserWithSecret | null>;
  /**
   * 按 GitHub 数字 id 查用户 —— OAuth 登录的身份锚点。
   *
   * 为什么不用登录名做锚点：GitHub 用户名可以改，改了旧名就再也对不上号了；
   * 数字 id 永久不变。
   */
  findUserByGithubId(githubId: string): Promise<DbUserWithSecret | null>;
  updateUser(
    id: string,
    patch: Partial<Omit<DbUser, "id" | "createdAt">>,
  ): Promise<DbUser | null>;
  listUsers(limit?: number): Promise<DbUser[]>;

  /* ---- 会话 ---- */
  createSession(session: DbSession): Promise<void>;
  findSession(id: string): Promise<DbSession | null>;
  deleteSession(id: string): Promise<void>;
  deleteExpiredSessions(): Promise<void>;

  /* ---- Agent key ---- */
  listAgentKeys(): Promise<DbAgentKey[]>;
  insertAgentKey(key: DbAgentKey): Promise<void>;
  revokeAgentKey(key: string): Promise<boolean>;

  /* ---- Agent 活动 ---- */
  insertAgentActivity(row: DbAgentActivity): Promise<void>;
  /** 按用户倒序取最近的活动 —— 「Agent 接入台」的活动流水 */
  listAgentActivityByUser(userId: string, limit?: number): Promise<DbAgentActivity[]>;

  /* ---- 订单 ---- */
  insertOrder(order: DbOrder): Promise<void>;
  updateOrder(id: string, patch: Partial<DbOrder>): Promise<DbOrder | null>;
  findOrderById(id: string): Promise<DbOrder | null>;
  findOrderByGiftToken(token: string): Promise<DbOrder | null>;
  listOrdersByUser(userId: string, limit?: number): Promise<DbOrder[]>;
  /**
   * 按收件人 handle 查订单 —— 「TA 收到的 CD」。
   *
   * 为什么按 handle 而不是 receiver_user_id：
   *   收件人未必注册了账号（很多礼物是送给站外的人的），
   *   所以订单里记的是「收件人写的名字或站内用户名」，
   *   只有当对方正好有同名账号时，TA 登录后才能在「我收到的」里看到这张 CD。
   */
  listOrdersByReceiverHandle(handle: string, limit?: number): Promise<DbOrder[]>;
  listOrders(limit?: number): Promise<DbOrder[]>;

  /* ---- 模板 ---- */
  listTemplates(): Promise<DbTemplate[]>;
  findTemplate(id: string): Promise<DbTemplate | null>;

  /* ---- 上传素材 ---- */
  insertUpload(upload: DbUpload): Promise<void>;
  findUpload(id: string): Promise<DbUpload | null>;
}
