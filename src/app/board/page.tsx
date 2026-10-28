import type { Metadata } from "next";
import { Suspense } from "react";
import { BoardApp } from "@/components/BoardApp";

export const metadata: Metadata = { title: "Group board · Modulo Maxx" };

export default function Board() {
  return (
    <Suspense>
      <BoardApp />
    </Suspense>
  );
}
