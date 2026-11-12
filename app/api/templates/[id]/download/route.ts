/**
 * GET /api/templates/{id}/download
 * ------------------------------------------------------------------
 * 下载模版包（zip）。
 *
 * 里面四样东西：
 *   template.svg  空白模版（命名图层）
 *   example.svg   填好的示例
 *   spec.json     机器可读规格
 *   README.md     给 coding agent 的说明书
 */

import { connection, NextResponse } from "next/server";

import { getTemplate } from "@/lib/templates/catalog";
import { buildTemplateZip } from "@/lib/templates/package";
import { withStorageGuard } from "@/lib/api/storage-guard";

async function __guardedGET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();

  const { id } = await params;
  const template = getTemplate(id);
  if (!template) {
    return NextResponse.json(
      { success: false, error: "TEMPLATE_NOT_FOUND", message: `模版 ${id} 不存在。` },
      { status: 404 },
    );
  }

  const zip = buildTemplateZip(template);

  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="hallocd-${template.id}.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const GET = withStorageGuard(__guardedGET);
