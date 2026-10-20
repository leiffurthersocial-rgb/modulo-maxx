import type { Metadata } from "next";
import { ArchetypesApp } from "@/components/ArchetypesApp";

export const metadata: Metadata = { title: "Archetypes · Modulo Maxx" };

export default function Archetypes() {
  return <ArchetypesApp />;
}
