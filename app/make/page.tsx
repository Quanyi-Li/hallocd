import DIYStudio from "@/components/DIYStudio";
import RecordStudio from "@/components/RecordStudio";

/**
 * 制作页 · /make
 * ------------------------------------------------------------------
 * 完整的「定制一张 CD」流程都收在这里：
 *   ① DIY 定制   —— 盘面 / 外壳 / 内页 / 脊背 / 腰封 / 背面
 *   ② 录音 & 信纸 —— 录音 / 照片视频 / 手写或打字 / NFC 预览
 *   ③ 交接   —— 复制下单参数给你的 agent（网页端不付款）
 *
 * 两点说明：
 *   · 顶栏固定 60px，这里用 pt-[60px] 让开，避免第一个区块被压住
 *   · ExperienceProvider 挂在 app/layout.tsx，跨路由切换时设计数据不丢
 */
export default function MakePage() {
  return (
    <main className="relative pt-[60px]">
      {/* Section 1: 3D DIY 工作台（复古米色，平滑衔接） */}
      <DIYStudio />

      {/* Section 2: 录音与媒体上传 + 底部交接面板（交给用户自己的 agent） */}
      <RecordStudio />
    </main>
  );
}
