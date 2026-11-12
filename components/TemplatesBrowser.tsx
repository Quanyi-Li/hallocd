"use client";

import Link from "next/link";

import { useLang } from "@/lib/i18n";
import { listTemplates, paperSkinOptions } from "@/lib/templates/catalog";

/**
 * DIY 模版库 · /templates 的主体
 * ==================================================================
 * 平台提供模版，**用户用自己的 coding agent 去做**。
 *
 * 所以这一页的核心不是「预览」，而是「下载 + 喂给 agent」：
 *   每个模版是一个 zip，里面有 spec.json（机器可读规格）+ 空白 SVG + 示例 SVG。
 *   用户的 agent 读 spec.json → 生成成品 → 上传回来。
 *
 * 为什么主体是客户端组件：
 *   语言状态只存在 localStorage（受保护的 lib/i18n.tsx 不动），
 *   服务端组件读不到它 —— 这一页的文案必须跟着语言走，就只能在客户端挑。
 *   页面本身是静态内容，客户端组件照样会被 SSR 出首屏 HTML。
 */

type Copy = {
  title1: string;
  title2: string;
  leadBefore: string;
  leadMid: string;
  leadAfter: string;
  /** 四步用法：[标题, 说明] */
  steps: readonly (readonly [string, string])[];
  allTemplates: string;
  downloadZip: string;
  skinsTitle: string;
  skinsLeadBefore: string;
  skinsLeadAfter: string;
  apiTitle: string;
  apiList: readonly string[];
  apiFootBefore: string;
  apiFootAfter: string;
  toMake: string;
  backHome: string;
};

/* 模版种类标签 */
const KIND_LABEL: Record<"zh" | "en", Record<string, string>> = {
  zh: {
    disc: "碟面",
    cover: "外壳封面",
    obi: "腰封",
    paper: "信纸",
    inner: "内页底板",
  },
  en: {
    disc: "Disc",
    cover: "Case cover",
    obi: "Belly band",
    paper: "Letter paper",
    inner: "Inner tray",
  },
};

const COPY: Record<"zh" | "en", Copy> = {
  zh: {
    title1: "模版给平台，",
    title2: "创作留给你自己的 agent。",
    leadBefore: "每个模版都是一个 zip：里面有 ",
    leadMid:
      "（画布尺寸、图层语义、可用色与字体）、空白 SVG 与填好的示例。把 ",
    leadAfter:
      "喂给你的 coding agent，它就能产出一张完全合规的图 —— 你只负责说想要什么。",
    steps: [
      ["下载模版", "拿到 spec.json 与空白 SVG"],
      ["交给 agent", "把 spec.json 喂给你的 coding agent"],
      ["agent 产出", "它按图层填好一张 SVG / PNG"],
      ["上传回来", "POST /api/uploads，拿到 url 下单"],
    ],
    allTemplates: "全部模版",
    downloadZip: "下载 zip",
    skinsTitle: "平台现成的信纸皮肤",
    skinsLeadBefore: "除了可下载的模版，平台还有 11 款现成信纸 —— 下单时用",
    skinsLeadAfter: "指定即可，不需要自己画。",
    apiTitle: "给你的 agent 用的接口",
    apiList: [
      "模版清单（含 spec 摘要）",
      "下载 zip",
      "上传成品（multipart，字段 file）",
    ],
    apiFootBefore: "完整的 Agent API 说明在",
    apiFootAfter:
      "里 —— 把它装进你的 coding agent，它就会自己来读目录、下单、付款。",
    toMake: "去制作",
    backHome: "回首页",
  },
  en: {
    title1: "Templates for the platform,",
    title2: "the making is your agent's job.",
    leadBefore: "Every template is a zip holding ",
    leadMid:
      " (canvas size, layer semantics, palette and fonts), a blank SVG and a filled example. Feed ",
    leadAfter:
      "to your coding agent and it produces a fully compliant image — you just say what you want.",
    steps: [
      ["Download the template", "Get spec.json and the blank SVG"],
      ["Hand it to your agent", "Feed spec.json to your coding agent"],
      ["Your agent produces", "It fills the layers into one SVG / PNG"],
      ["Upload it back", "POST /api/uploads, then order with the url"],
    ],
    allTemplates: "All templates",
    downloadZip: "Download zip",
    skinsTitle: "Ready-made paper skins",
    skinsLeadBefore:
      "Besides the downloadable templates, the platform ships 11 ready-made papers — pick one with",
    skinsLeadAfter: "when you order. No drawing required.",
    apiTitle: "The endpoints for your agent",
    apiList: [
      "template list (with spec summary)",
      "download the zip",
      "upload the finished file (multipart, field file)",
    ],
    apiFootBefore: "The full Agent API reference lives in",
    apiFootAfter:
      "— install it into your coding agent and it will read the catalog, order and pay on its own.",
    toMake: "Go make",
    backHome: "Back home",
  },
};

export default function TemplatesBrowser() {
  const { lang, t } = useLang();
  const copy = COPY[lang];

  const templates = listTemplates();
  const skins = paperSkinOptions();

  return (
    <main className="relative min-h-screen bg-[#F8F4EC] px-6 pb-28 pt-[96px] text-[#1C2329] sm:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#E65100]">
          Hallo CD · DIY Templates
        </p>
        <h1 className="mt-3 max-w-3xl font-serif text-4xl italic leading-tight sm:text-5xl">
          {copy.title1}
          <br className="hidden sm:block" />
          {copy.title2}
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-[#1C2329]/60">
          {copy.leadBefore}
          <code className="font-mono text-[13px]">spec.json</code>
          {copy.leadMid}
          <code className="font-mono text-[13px]">spec.json</code>
          {copy.leadAfter}
        </p>

        {/* ---- 怎么用 ---- */}
        <ol className="mt-8 grid gap-3 sm:grid-cols-4">
          {copy.steps.map(([title, desc], i) => (
            <li
              key={i}
              className="rounded-xl border border-[#1C2329]/10 bg-white/60 p-4"
            >
              <span className="font-mono text-[10px] tracking-[0.16em] text-[#E65100]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-1.5 text-[13.5px] font-semibold">{title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#1C2329]/50">
                {desc}
              </p>
            </li>
          ))}
        </ol>

        {/* ---- 模版网格 ---- */}
        <section className="mt-14">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1C2329]/45">
              {copy.allTemplates}
            </h2>
            <span className="font-mono text-[11px] text-[#1C2329]/35">
              {templates.length}
            </span>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <article
                key={t.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-[#1C2329]/10 bg-white/70 transition hover:border-[#1C2329]/25 hover:bg-white"
              >
                {/* 预览 */}
                <div className="relative flex h-48 items-center justify-center overflow-hidden bg-[#F8F4EC]">
                  <div
                    className="flex max-h-[190px] max-w-[190px] items-center justify-center"
                    // 这段 SVG 由本仓库自己生成（lib/templates/catalog.ts），不是外部输入
                    dangerouslySetInnerHTML={{ __html: t.build(true) }}
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-[#1C2329]/85 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#F8F4EC]">
                    {KIND_LABEL[lang][t.kind] ?? t.kind}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-serif text-[17px] italic">
                    {lang === "zh" ? t.name : t.nameEn}
                  </h3>
                  <p className="mt-0.5 font-mono text-[10.5px] text-[#1C2329]/35">
                    {t.id} · {t.canvas.width}×{t.canvas.height}
                  </p>
                  <p className="mt-2.5 flex-1 text-[12.5px] leading-relaxed text-[#1C2329]/55">
                    {lang === "zh" ? t.description : t.descriptionEn}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {t.layers.slice(0, 3).map((l) => (
                      <span
                        key={l.id}
                        className="rounded-md bg-[#1C2329]/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] text-[#1C2329]/55"
                      >
                        {l.id}
                      </span>
                    ))}
                    {t.layers.length > 3 ? (
                      <span className="px-1 font-mono text-[9.5px] text-[#1C2329]/35">
                        +{t.layers.length - 3}
                      </span>
                    ) : null}
                  </div>

                  <a
                    href={`/api/templates/${t.id}/download`}
                    className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-[#1C2329] px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#F8F4EC] transition hover:bg-[#2C3640]"
                  >
                    {copy.downloadZip}
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3 stroke-current"
                      strokeWidth={2}
                      fill="none"
                    >
                      <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M4 20h16" />
                    </svg>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ---- 信纸皮肤 ---- */}
        <section className="mt-16">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#1C2329]/45">
            {copy.skinsTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#1C2329]/55">
            {copy.skinsLeadBefore}{" "}
            <code className="font-mono text-[12px]">design.paperSkin</code>{" "}
            {copy.skinsLeadAfter}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {skins.map((s) => (
              <div
                key={s.id}
                className="overflow-hidden rounded-xl border border-[#1C2329]/10 bg-white/70"
              >
                <div className="aspect-[4/5] w-full overflow-hidden bg-[#F8F4EC]">
                  {/* alt 留空：名字就在图下方，交给紧邻的说明文字更准 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="px-3 py-2">
                  <p className="text-[12px] font-medium">
                    {lang === "zh" ? s.name : (t.record.paperNames[s.id] ?? s.name)}
                  </p>
                  <p className="font-mono text-[9.5px] text-[#1C2329]/35">
                    {s.id}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- API ---- */}
        <section className="mt-16 rounded-2xl border border-[#1C2329]/10 bg-white/70 p-6">
          <h2 className="font-serif text-xl italic">{copy.apiTitle}</h2>
          <div className="mt-4 space-y-2 font-mono text-[12px]">
            <p className="text-[#1C2329]/70">
              <span className="text-[#E65100]">GET</span> /api/templates —{" "}
              {copy.apiList[0]}
            </p>
            <p className="text-[#1C2329]/70">
              <span className="text-[#E65100]">GET</span> /api/templates/
              {"<id>"}/download — {copy.apiList[1]}
            </p>
            <p className="text-[#1C2329]/70">
              <span className="text-[#E65100]">POST</span> /api/uploads —{" "}
              {copy.apiList[2]}
            </p>
          </div>
          <p className="mt-4 text-[12.5px] leading-relaxed text-[#1C2329]/50">
            {copy.apiFootBefore} <code className="font-mono">skill/halloCD/</code>{" "}
            {copy.apiFootAfter}
          </p>
        </section>

        <footer className="mt-12 flex flex-wrap gap-3 border-t border-[#1C2329]/10 pt-6">
          <Link
            href="/make"
            className="rounded-full border border-[#1C2329]/15 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition hover:border-[#1C2329]/35 hover:bg-white/60"
          >
            {copy.toMake}
          </Link>
          <Link
            href="/"
            className="rounded-full border border-[#1C2329]/15 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition hover:border-[#1C2329]/35 hover:bg-white/60"
          >
            {copy.backHome}
          </Link>
        </footer>
      </div>
    </main>
  );
}
