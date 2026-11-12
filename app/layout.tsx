import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import { LangProvider } from "@/lib/i18n";
import "./globals.css";

import { ExperienceProvider } from "@/components/ExperienceContext";
import { HandoffProvider } from "@/components/HandoffContext";
import { RoomProvider } from "@/components/RoomProvider";
import SiteNav from "@/components/SiteNav";
import MyRoom from "@/components/MyRoom";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Hallo CD — Design Your Moment",
  description: "halloCD — 每一张 halloCD，都装着一段时刻。设计、录制、收藏属于你的音乐记忆。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LangProvider>
          {/* Provider 挂在 layout：跨路由导航不会卸载它，
              DIY 定制 → 录音 → 结账 的共享设计数据得以保留。
              HandoffProvider 同理 —— 制作页攒下的录音 / 照片要递到
              /agents 的接入台去交接，两页之间靠它传。 */}
          <ExperienceProvider>
            <HandoffProvider>
              <RoomProvider>
                <SiteNav />
                {children}
                {/* My Room 是全屏覆盖层，全站可用 */}
                <MyRoom />
              </RoomProvider>
            </HandoffProvider>
          </ExperienceProvider>
        </LangProvider>
      </body>
    </html>
  );
}
