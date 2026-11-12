import GalleryView from "@/components/GalleryView";

/**
 * 队友画廊的嵌入壳。
 * - 首页与 /gallery 复用同一份内容
 * - bare 模式：隐藏画廊自带的顶部导航，只保留纯内容，避免第二屏重复入口
 * - 无额外上留白，背景沿用 body 的 #F8F4EC，与首屏无缝衔接
 */
export default function GallerySection() {
  return (
    <section id="gallery-section" aria-label="CD Gallery">
      <GalleryView bare />
    </section>
  );
}
