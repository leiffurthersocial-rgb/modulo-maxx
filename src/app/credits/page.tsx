import type { Metadata } from "next";
import Link from "next/link";
import { imageCredits } from "@/lib/bank";
import { BUILD_PHOTOS, BUILDS } from "@/lib/builds";

export const metadata: Metadata = { title: "Photo credits · Modulo Maxx" };

export default function Credits() {
  const credits = imageCredits();
  const bodyCredits = BUILDS.flatMap((b) => (BUILD_PHOTOS[b.id] ? [{ ...BUILD_PHOTOS[b.id], name: `Body type: ${b.label}` }] : []));
  return (
    <div className="fade-in">
      <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">
        Back
      </Link>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">Photo credits</h1>
      <p className="mt-4 text-muted">
        All celebrity photos come from Wikimedia Commons under free licenses. They were resized and cropped for display.
        Ratings are rough, made-up estimates for a game and say nothing about these people.
      </p>
      {credits.length === 0 ? (
        <p className="mt-10">No photos yet.</p>
      ) : (
        <ul className="mt-10 flex flex-col gap-5">
          {[...credits, ...bodyCredits].map((c) => (
            <li key={c.sourceUrl} className="border-t border-line pt-4">
              <p className="font-medium">{c.name}</p>
              <p className="text-sm text-muted">
                <a href={c.sourceUrl} className="underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                  {c.title.replace(/^File:/, "")}
                </a>
                {" · "}
                {c.author}
                {" · "}
                {c.licenseUrl ? (
                  <a href={c.licenseUrl} className="underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
                    {c.license}
                  </a>
                ) : (
                  c.license
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
