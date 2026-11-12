/**
 * GET /api/agent/v1/catalog
 * ------------------------------------------------------------------
 * 外部 coding agent 的「读世界」入口。
 *
 * 返回：可用的场景与价格、可定制项的取值域、设计对象的字段 schema、
 *      以及下一步该调哪个端点的自描述说明。
 *
 * 设计意图：agent 不需要打开网页、不需要猜字段名，读完这一份就能
 * 直接构造合法的下单请求。
 */

import { connection, NextResponse } from "next/server";

import { guardAgent, withAgentActivity } from "@/lib/agent/apiGuard";
import { buildCatalog } from "@/lib/agent/catalog";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedGET(request: Request) {
  await connection();

  const guard = await guardAgent(request);
  if (!guard.ok) return guard.response;

  return NextResponse.json({
    success: true,
    apiKey: {
      label: guard.identity.label,
      origin: guard.identity.origin,
      handle: guard.identity.handle,
    },
    catalog: buildCatalog(),
  });
}

export const GET = withStorageGuard(withAgentActivity(__guardedGET));
