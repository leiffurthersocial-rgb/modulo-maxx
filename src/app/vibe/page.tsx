import type { Metadata } from "next";
import { VibeApp } from "@/components/VibeApp";

export const metadata: Metadata = { title: "Vibe check · Modulo Maxx" };

export default function Vibe() {
  return <VibeApp />;
}
