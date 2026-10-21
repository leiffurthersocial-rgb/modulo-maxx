import type { Metadata } from "next";
import { RankerApp } from "@/components/RankerApp";

export const metadata: Metadata = { title: "Celebrity ranker · Modulo Maxx" };

export default function Ranker() {
  return <RankerApp />;
}
