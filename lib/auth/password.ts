/**
 * halloCD · 密码哈希
 * ==================================================================
 * 用 Node 内置 crypto.scrypt —— 零新增依赖，且 scrypt 是内存硬函数，
 * 比 bcrypt 更抗 GPU 爆破。
 *
 * 存储格式：scrypt$<saltBase64>$<hashBase64>
 * 参数：N=16384, r=8, p=1, keylen=64
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function scrypt(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { N, r: R, p: P }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const salt = Buffer.from(parts[1], "base64");
  const expected = Buffer.from(parts[2], "base64");
  if (expected.length !== KEYLEN) return false;

  const actual = await scrypt(password, salt, KEYLEN);
  return timingSafeEqual(actual, expected);
}

/** 强度校验：太短的密码直接拒掉，不进哈希 */
export function checkPasswordStrength(password: string): {
  ok: boolean;
  message?: string;
} {
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, message: "密码至少 8 位。" };
  }
  if (password.length > 200) {
    return { ok: false, message: "密码太长了（上限 200 位）。" };
  }
  return { ok: true };
}
