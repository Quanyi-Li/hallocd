import type { Metadata } from "next";

import TemplatesBrowser from "@/components/TemplatesBrowser";

/**
 * DIY 模版库 · /templates
 * ------------------------------------------------------------------
 * 平台提供模版，**用户用自己的 coding agent 去做**。
 *
 * 所以这一页的核心不是「预览」，而是「下载 + 喂给 agent」：
 *   每个模版是一个 zip，里面有 spec.json（机器可读规格）+ 空白 SVG + 示例 SVG。
 *   用户的 agent 读 spec.json → 生成成品 → 上传回来。
 *
 * 页面主体是客户端组件（TemplatesBrowser）——
 * 语言状态只存在 localStorage，服务端读不到，中英文案得由客户端挑。
 * 这一层只留 metadata：它必须待在服务端组件里。
 */

export const metadata: Metadata = {
  title: "DIY Templates — Hallo CD",
  description:
    "halloCD DIY 模版：下载 zip，喂给你自己的 coding agent，让它替你做那张 CD 的盘面、封面、腰封与信纸。 / Download the zip and let your own coding agent build the disc, cover, belly band and letter paper.",
};

export default function TemplatesPage() {
  return <TemplatesBrowser />;
}
