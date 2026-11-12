/**
 * halloCD · 模版包生成
 * ==================================================================
 * 一个模版 zip 里放四样东西，给人和给 agent 各留一半：
 *   template.svg  空白模版（命名图层，agent 直接改）
 *   example.svg   填好的示例（人一眼看懂每层放什么）
 *   spec.json     机器可读规格（画布 / 图层 / 可用色 / 字体）
 *   README.md     给 coding agent 的说明书
 */

import type { TemplateDef } from "@/lib/templates/catalog";
import { createZip } from "@/lib/templates/zip";

function buildSpec(template: TemplateDef) {
  return {
    id: template.id,
    name: template.name,
    nameEn: template.nameEn,
    kind: template.kind,
    description: template.description,
    descriptionEn: template.descriptionEn,
    canvas: template.canvas,
    units: "px",
    layers: template.layers,
    palette: template.palette,
    fonts: template.fonts.map((f) => ({
      id: f,
      css: {
        serif: "Georgia, 'Songti SC', serif",
        sans: "Helvetica, Arial, sans-serif",
        mono: "'JetBrains Mono', Consolas, monospace",
        song: "'Songti SC', 'STSong', serif",
      }[f],
    })),
    output: {
      format: "svg",
      width: template.canvas.width,
      height: template.canvas.height,
      note:
        "保持 viewBox 与画布尺寸一致；改 <g id=\"...\"> 内的内容即可，勿改 id。",
    },
    upload: {
      endpoint: "POST /api/uploads",
      note:
        "把生成的 SVG/PNG 提交到上传端点，拿到 url 后填进订单的 design 字段。",
    },
  };
}

function buildReadme(template: TemplateDef): string {
  const layerTable = template.layers
    .map(
      (l) =>
        `| \`${l.id}\` | ${l.label} | ${l.type} | ${
          l.required ? "必填" : "选填"
        } | ${l.maxLength ?? "—"} | ${l.hint ?? ""} |`,
    )
    .join("\n");

  return `# ${template.name}（${template.nameEn}）

${template.description}

## 画布

- 尺寸：**${template.canvas.width} × ${template.canvas.height} px**
- 格式：SVG（\`viewBox="0 0 ${template.canvas.width} ${template.canvas.height}"\`）

## 图层

| id | 含义 | 类型 | 必填 | 长度上限 | 备注 |
|---|---|---|---|---|---|
${layerTable}

## 怎么用（给 coding agent）

1. 读 \`spec.json\` —— 画布尺寸、图层语义、可用色、可用字体都在里面。
2. 打开 \`template.svg\`。
3. **只改** \`<g id="...">\` 里的内容，**不要改 id**（平台按 id 定位图层）。
4. 文字层改成你的内容；图片层用 \`<image href="data:image/png;base64,...">\` 嵌进去。
5. 导出为 \`${template.id}.svg\` 或转成 PNG。

## 参考

- \`template.svg\` —— 空白模版
- \`example.svg\` —— 填好的示例，照着看每一层该放什么
- \`spec.json\` —— 机器可读规格

## 交回平台

把生成好的文件提交到 \`POST /api/uploads\`（\`multipart/form-data\`，字段名 \`file\`），
拿到返回的 \`url\` 后，在 Agent API 的 \`design\` 里引用它即可。

## 调色

${template.palette.map((c) => `- \`${c}\``).join("\n")}

字体可选：${template.fonts.map((f) => `\`${f}\``).join(" / ")}
`;
}

export function buildTemplateZip(template: TemplateDef): Buffer {
  const spec = JSON.stringify(buildSpec(template), null, 2);

  return createZip([
    { name: `${template.id}/template.svg`, data: template.build(false) },
    { name: `${template.id}/example.svg`, data: template.build(true) },
    { name: `${template.id}/spec.json`, data: spec },
    { name: `${template.id}/README.md`, data: buildReadme(template) },
  ]);
}

export { buildSpec, buildReadme };
