/**
 * POST /api/auth/logout
 * ------------------------------------------------------------------
 * 登出：删 session + 清 cookie。
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, serializeClearedCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedPOST() {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (id) await db.deleteSession(id);

  const res = NextResponse.json({ success: true });
  res.headers.append("Set-Cookie", serializeClearedCookie());
  return res;
}

export const POST = withStorageGuard(__guardedPOST);
