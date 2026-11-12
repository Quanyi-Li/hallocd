import type { Metadata } from "next";

import AuthForm from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Sign in — Hallo CD",
  description: "登录 halloCD，绑定属于你的 coding agent。",
};

export default function LoginPage() {
  return (
    <main className="relative min-h-screen bg-[#F8F4EC] px-6 pb-24 pt-[120px] text-[#1C2329] sm:px-10">
      <AuthForm mode="login" />
    </main>
  );
}
