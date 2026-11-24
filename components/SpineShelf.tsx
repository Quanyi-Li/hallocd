"use client";

import { motion } from "framer-motion";
import { PRODUCTS, type Product } from "@/lib/products";
import { useLang } from "@/lib/i18n";

/*
 * CD 墙 —— 横排盒脊架。
 *
 * 形态参考 taylor.fyi/top：一排竖立的专辑盒脊（jewel case spine），
 * 竖排文字从上往下读，圆角 + 塑料边高光 + 软投影，悬浮在米白底上，
 * 脚下没有架子；最右边的先落下，依次向左错峰弹入。
 *
 * ── v2.24：脊背改成「冰透透明塑料 + 内页纸上印字」 ──
 * 之前的画法是「一块实心色板 + 白字直接压在最上层」：
 *   · 浅色场景（THE VOW 的米白）整根脊背读起来就是**一块死白的实心板**；
 *   · 文字贴在透明外壳的表面上，外壳的高光/折射直接压在字上，容易糊。
 * 现在拆成三层（从里到外），和真实宝石盒的结构一一对应：
 *   ① 内页纸   —— 专辑底色（透过外壳能看见）
 *   ② 文字     —— **印在纸上**（所以在外壳之下），锐利、清晰，不被塑料高光糊掉
 *   ③ 透明外壳 —— 冰透亚克力：锐利的白色边缘高光 + 上下左右四条厚度线（倒角）
 *     + 一道窄镜面高光；左右两条「厚度面」是**半透明**的，
 *     内页纸的颜色能透过来，而不是一条死白的实边。
 *
 * 印在纸上的排版跟封面同一套语言：
 *   标题最后一个词压在品牌黄的圆角徽标里（封面上的 THE·VOW 就是这么排的），
 *   场景名用同列的次级油墨竖排跟在后面。
 *
 * ── v2.25：比例返工，恢复「标准 CD 盒的纤薄感」 ──
 * v2.24 的盒脊宽 82px、宽高比 1:5.5，一排并排宽 512px ——
 * 远看像**一排书本 / 档案盒**，而且第 1 根（陶土棕）和第 2 根（玫瑰粉）
 * 颜色又接近，挤在一起会被读成「一个胖盒子」，6 根看着只有 5 根。
 * 现在：
 *   · 宽度 82px → 32px（≈1/2.6），高度基本不动（446px）→ 比例 1:14
 *   · 间距 4px → 3px（更紧凑，缝隙均匀）
 *   · 文字等比缩小（标题 13→10px、场景名 9→6.5px、徽标内边距 0.22→0.16em）
 *   · 外壳厚度面 4px → 2px、竖直镜面光晕 7px → 4px（窄盒子上不能再占 1/4）
 *   · 竖直镜面高光从「外壳层的百分比定位」搬进「文字层两列之间的 1px 槽」——
 *     百分比位置在窄盒子上必然横穿标题的字（实测切在 "MAKE A" 中间），
 *     槽位由 flex 布局算出，任何断点都落在两列空档里。
 *
 * ── v2.25 第二轮：墨层重排 ──
 * 第一轮缩窄后实测发现三处硬伤：
 *   ① 竖排行盒在块方向（向右）还会溢出列框约 2px —— 徽标压到场景名、场景名贴到右缘；
 *   ② 中间那根高光线（哪怕搬进 flex 槽）还是会蹭到标题的字；
 *   ③ 移动端 20px 的盒子里两列文字根本排不开（16.2px > 16px 可用墨区）。
 * 现在：
 *   · 两列都显式定宽（1.45em / 1.5em），并用 padding-right 补偿竖排行盒的右溢出；
 *   · 场景名靠 ml-auto 贴右，标题列靠左，两列之间留出均匀空档；
 *   · 中部高光线整个撤掉（32px 装不下），圆柱体积感交给左右沿的锐边 + 倒角 + 右下暗面；
 *   · 最小宽度 20px → 26px，高度 180px → 210px（移动端 1:8.1，桌面仍是 1:14）。
 *
 * 点某一根盒脊 -> 交给上层开 3D 开盒弹层（和原来的卡片一样）。
 */

/* 相对亮度（sRGB → WCAG 近似），用来决定纸上的油墨用深还是浅 */
function isLightPaper(hex: string) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55;
}

export default function SpineShelf({
  onSelect,
}: {
  onSelect: (item: Product) => void;
}) {
  const { t } = useLang();

  return (
    <div
      className="mt-12 flex items-end justify-center gap-[2px] sm:mt-16 sm:gap-[3px]"
      role="list"
      aria-label={t.gallery.shelfLabel}
    >
      {PRODUCTS.map((item, index) => {
        const scene = t.scenes[item.id] ?? item.scene;
        /* 最右边先进（从右往左错峰），和视频里的落位顺序一致 */
        const delay = (PRODUCTS.length - 1 - index) * 0.055;

        /* 浅色纸用深油墨，深色纸用白油墨 */
        const light = isLightPaper(item.base);
        const ink = light ? "#1C2329" : "#FFFFFF";
        const inkSoft = light ? "rgba(28,35,41,0.58)" : "rgba(255,255,255,0.70)";
        /* 油墨只要一层 1px 的硬偏移做对比，不要糊的阴影 */
        const inkLift = light ? "0 1px 0 rgba(255,255,255,0.45)" : "0 1px 0 rgba(0,0,0,0.38)";

        /* 标题最后一个词压在黄色徽标里（和封面同一套排版） */
        const words = item.name.split(" ");
        const last = words.pop() ?? item.name;
        const head = words.join(" ");

        return (
          <motion.button
            key={item.id}
            type="button"
            role="listitem"
            onClick={() => onSelect(item)}
            aria-label={`${item.name} · ${scene}`}
            className="group relative shrink-0 cursor-pointer rounded-[4px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE500] focus-visible:ring-offset-[3px] focus-visible:ring-offset-[#F7F5EF]"
            style={{
              /*
               * v2.25 · 比例返工：把「盒脊」从书本 / 档案盒的胖比例压回标准 CD 盒的纤薄感。
               *
               * 之前：宽 clamp(30px, 8.5vw, 82px) + aspectRatio 1/5.5 —— 82px 宽 × 451px 高，
               * 一排 6 根并排宽 512px，第一根（陶土棕）和第二根（玫瑰粉）颜色又接近，
               * 远看会**并成一坨**，读起来像 5 个、甚至像「一个胖盒子」。
               *
               * 现在：宽收到 32px（≈原来的 1/2.6，落在用户要的 1/2 ~ 1/3 区间），
               * 高度基本不动（446px，页面节奏不变）→ 比例变成 1:14，比真盒（1:11.8）更纤薄。
               * 真 CD 盒的侧边本来就只有 10~12mm 厚。
               *
               * 最小宽度定 26px 而不是 20px：两列竖排文字（标题 8.7px + 场景名 7.5px）
               * 在 20px 的盒子里根本排不开（实测 16.2px > 16px 可用墨区，必然溢出）。
               * 26px 时可用墨区 22px，留白 5.8px，比例 1:8.1（移动端）。
               */
              width: "clamp(26px, 2.4vw, 32px)",
              height: "clamp(210px, 31vw, 452px)",
              /* 投影只负责「它站在桌面上」；轮廓交给最上层的亚克力外壳 */
              boxShadow:
                "0 24px 30px -20px rgba(28,35,41,0.55), 0 7px 12px -7px rgba(28,35,41,0.30)",
            }}
            initial={{ y: -46, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            whileHover={{ y: -10 }}
            transition={{
              delay,
              type: "spring",
              stiffness: 260,
              damping: 20,
            }}
          >
            {/* ① 内页纸（最里层）—— 专辑底色 */}
            <span
              data-testid="spine-shelf-paper"
              className="absolute inset-0 overflow-hidden rounded-[4px]"
              style={{ backgroundColor: item.base }}
            >
              {/* 纸面本身的极淡不匀（纸是平的，只有一点点） */}
              <span
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(118% 62% at 26% 14%, rgba(255,255,255,0.10), rgba(255,255,255,0) 62%)",
                }}
              />
            </span>

            {/* ② 文字：印在内页纸上（在透明外壳之下，所以塑料的高光糊不到它） */}
            <span
              data-testid="spine-shelf-ink"
              /*
               * v2.25 · 第二轮：盒脊窄到 32px 之后，文字层重排。
               *
               * ── 坑 1：竖排文字的列框 ≠ 文字实际占的宽度 ──
               * `writing-mode: vertical-rl` 的列框宽 = 字体的 ascent+descent，
               * 但浏览器算 flex 内在宽度时只按 em 算，
               * 于是「末词黄色徽标」（多 0.04em 内边距）会**溢出列框**。
               * 而且实测：竖排行盒在**块方向（向右）还会再溢出约 2px** ——
               * 行盒贴着内容框的右边排，字往右溢出。
               * 实测（桌面 32px）：列框 14px，徽标实际 13.8px 且右缘超出列框 2px。
               * → 解决办法：两列都**显式定宽**，并用 `padding-right` 把这段溢出补偿回来
               *   （padding-right 在竖排里是块起始方向的内边距，正好把行盒往左推）。
               *
               * ── 坑 2：32px 装不下「两列文字 + 中间一根高光线」 ──
               * 桌面实测可用墨区 28px，标题墨 13.8px + 场景墨 9px = 22.8px，
               * 只剩 5.2px 要分给「左留白 + 列间距 + 右留白」。
               * 塞一根 1px 高光线 + 光晕（≥3px）会把字挤到壳边上（实测场景名压住青色折射线）。
               * → 解决办法：**中部高光线整个撤掉**，
               *   圆柱体积感改由「左沿 1px 纯白锐边 + 右沿白边/青色折射 + 上下倒角 + 右下暗面」承担，
               *   那是真实亚克力侧面的光路，不会糊字。
               *
               * ── 坑 3：中间那道白色高光线原来写死在百分比位置 ──
               * v2.24 是 left-[24%]，盒脊一窄就正好横穿标题的字（实测切在 "MAKE A" 中间）。
               * 百分比和文字排版各算各的，改一个字号就又穿帮 —— 所以这次不再用百分比定位。
               */
              className="pointer-events-none absolute inset-0 flex items-start px-[2px] pt-[clamp(4px,0.7vw,9px)]"
            >
              {/* 标题列：靠左。列宽按 1.45em 定死，徽标（含 0.04em 内边距）刚好兜住 */}
              <span
                className="shrink-0 text-[clamp(6px,0.74vw,10px)] font-black uppercase leading-none tracking-[0.08em]"
                style={{
                  writingMode: "vertical-rl",
                  width: "1.45em",
                  /* 补偿竖排行盒向右溢出的那 2px */
                  paddingRight: "0.12em",
                  color: ink,
                  textShadow: inkLift,
                }}
              >
                {head}
                {head ? " " : ""}
                {/*
                  黄色徽标：封面上的 THE·VOW 就是把最后一个词压在品牌黄里，
                  这里照搬 —— 竖排时徽标自然变成一条竖着的黄底油墨。
                  内边距只给顺流方向 0.12em、横向只留 0.04em ——
                  横向那一丁点就是「词在黄块里」的呼吸感，再多就会撑破列宽。
                */}
                <span
                  data-testid="spine-shelf-badge"
                  className="rounded-[2px]"
                  style={{
                    background: item.accent,
                    color: "#1C2329",
                    padding: "0.12em 0.04em",
                    textShadow: "none",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.30)",
                  }}
                >
                  {last}
                </span>
              </span>

              {/* 场景名列：靠右（ml-auto 把余量全推到它前面），与标题列之间留出均匀空档 */}
              <span
                className="ml-auto shrink-0 text-[clamp(5px,0.58vw,6.5px)] font-semibold uppercase leading-none tracking-[0.26em]"
                style={{
                  writingMode: "vertical-rl",
                  width: "1.5em",
                  /* 同样补偿竖排行盒向右的溢出：让墨迹停在青色折射线内侧 */
                  paddingRight: "0.57em",
                  color: inkSoft,
                  textShadow: inkLift,
                }}
              >
                {scene}
              </span>
            </span>

            {/* ③ 透明外壳（最前层）—— 冰透亚克力 */}
            <span
              data-testid="spine-shelf-shell"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-[4px]"
            >
              {/*
                漫透射：亚克力把纸面往「玻璃后面」推一层 —— 极淡的白 + 冷色。
                压在文字之上但透明度很低，所以字还是锐利的，只是像隔了一层塑料。
              */}
              <span
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(158deg," +
                    "rgba(255,255,255,0.12) 0%," +
                    "rgba(206,236,252,0.055) 42%," +
                    "rgba(255,255,255,0.015) 72%," +
                    "rgba(255,255,255,0.08) 100%)",
                }}
              />
              {/* 圆柱面的暗面（右下）：给盒子一点体积，不然像一张平色板 */}
              <span
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(120% 88% at 108% 104%, rgba(28,35,41,0.20), rgba(28,35,41,0) 58%)",
                }}
              />

              {/* ---------- 左沿：亚克力的「厚度那一面」（受光面） ---------- */}
              {/*
                半透明：内页纸的颜色能透过来（这是「冰透」的关键），
                只在最外缘留一条 1px 的锐利白高光交代厚度。
                v2.25：盒脊窄了，厚度面从 4px 收到 2px —— 否则 32px 的盒子上
                左右各 4px 就是 8px，占掉 1/4，文字会挤在中间读不出来。
              */}
              <span
                className="absolute inset-y-0 left-0 w-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg," +
                    "rgba(255,255,255,0.82) 0%," +
                    "rgba(255,255,255,0.42) 36%," +
                    "rgba(198,230,248,0.30) 72%," +
                    "rgba(255,255,255,0) 100%)",
                }}
              />
              <span
                className="absolute inset-y-0 left-0 w-px"
                style={{
                  background: "rgba(255,255,255,0.99)",
                  boxShadow: "0 0 3px rgba(255,255,255,0.55)",
                }}
              />

              {/* ---------- 右沿：亚克力的「厚度那一面」（背光面） ---------- */}
              {/*
                背光的那一侧更冷更暗，但还是半透明 —— 纸色照样透得过来。
                外缘留一条细白线 + 一道青色折射边（亚克力的色散）。
              */}
              <span
                className="absolute inset-y-0 right-0 w-[2px]"
                style={{
                  background:
                    "linear-gradient(270deg," +
                    "rgba(255,255,255,0.54) 0%," +
                    "rgba(255,255,255,0.20) 34%," +
                    "rgba(176,214,238,0.26) 74%," +
                    "rgba(255,255,255,0) 100%)",
                }}
              />
              <span
                className="absolute inset-y-0 right-0 w-px"
                style={{
                  background: "rgba(255,255,255,0.88)",
                  boxShadow: "0 0 3px rgba(255,255,255,0.45)",
                }}
              />
              <span
                className="absolute inset-y-0 right-[2px] w-px"
                style={{ background: "rgba(150,208,240,0.50)" }}
              />

              {/* ---------- 上沿的厚度线（倒角） ---------- */}
              <span
                className="absolute inset-x-0 top-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.34) 40%, rgba(255,255,255,0) 76%)",
                }}
              />
              <span
                className="absolute inset-x-0 top-px h-px"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(28,35,41,0.30) 0%, rgba(28,35,41,0.08) 46%, rgba(28,35,41,0) 82%)",
                }}
              />

              {/* ---------- 下沿的厚度线 ---------- */}
              <span
                className="absolute inset-x-0 bottom-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.16) 46%, rgba(255,255,255,0) 80%)",
                }}
              />

              {/*
                ---------- 圆柱面上那道竖直镜面高光 ----------
                v2.25：这里**不再**画高光。
                原来它写死在 left-[24%] / left-[50%] 这种百分比位置，可盒脊一窄
                （82px → 32px）百分比位置就会横穿标题的字（实测切在 "MAKE A" 中间），
                而且百分比和文字排版是各算各的 —— 一改字号就又穿帮。
                现在这道高光搬进**文字层**（见上面两列之间的 1px 槽）：
                槽的位置由 flex 布局算出来，永远落在标题列和场景名列的空档里。
                高光画在墨层（半透明壳之下）依然成立：塑料把纸往玻璃后面推一层，
                压在字上方的半透明白面不会把它糊掉。
                这里只保留「上下左右的厚度线」，那是边缘倒角，跟文字无关。
              */}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
