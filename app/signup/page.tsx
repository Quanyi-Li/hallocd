import type { Metadata } from "next";

import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Create account — Hallo CD",
  description: "注册 halloCD —— 你的用户名就是你的个人主页地址。",
};

export default function SignupPage() {
  return (
    <main className="relative min-h-screen bg-[#F8F4EC] px-6 pb-24 pt-[120px] text-[#1C2329] sm:px-10">
      <AuthForm mode="signup" />
    </main>
  );
}
