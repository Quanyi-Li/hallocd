/**
 * GET /api/templates
 * ------------------------------------------------------------------
 * 模版清单（公开，不需要鉴权）。
 * agent 想知道「平台上有哪些模版可下载」就打这个。
 */

import { connection, NextResponse } from "next/server";

import { listTemplates, paperSkinOptions } from "@/lib/templates/catalog";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedGET() {
  await connection();

  const templates = listTemplates().map((t) => ({
    id: t.id,
    name: t.name,
    nameEn: t.nameEn,
    kind: t.kind,
    description: t.description,
    descriptionEn: t.descriptionEn,
    canvas: t.canvas,
    layers: t.layers,
    palette: t.palette,
    fonts: t.fonts,
    download: `/api/templates/${t.id}/download`,
  }));

  return NextResponse.json({
    success: true,
    count: templates.length,
    templates,
    /** 平台现成的信纸皮肤 —— 也是模版 */
    paperSkins: paperSkinOptions(),
    howTo:
      "1. GET /api/templates 拿到清单 → 2. GET /api/templates/{id}/download 拿到 zip → " +
      "3. 把 zip 里的 spec.json 喂给你的 agent → 4. agent 产出 SVG/PNG → " +
      "5. POST /api/uploads 上传 → 6. 下单时把返回的 url 放进 design 字段。",
  });
}

export const GET = withStorageGuard(__guardedGET);
