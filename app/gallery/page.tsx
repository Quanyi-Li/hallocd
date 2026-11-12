import type { Metadata } from "next";
import GalleryView from "@/components/GalleryView";

export const metadata: Metadata = {
  title: "Find Your Vibe — Hallo CD",
  description:
    "A curated shelf of moments. Browse birthday, anniversary and holiday CDs.",
};

export default function GalleryPage() {
  return (
    <main>
      <GalleryView />
    </main>
  );
}
