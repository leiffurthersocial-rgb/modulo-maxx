import type { Metadata } from "next";
import { MogApp } from "@/components/MogApp";

export const metadata: Metadata = { title: "Mog battle · Modulo Maxx" };

export default function Mog() {
  return <MogApp />;
}
