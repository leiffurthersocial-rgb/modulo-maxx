"use client";

import { useState } from "react";
import { fmt, fmtFace, shareText, type Results as ResultsData } from "@/lib/results";
import { renderResultImage } from "@/lib/share-image";
import { CelebPhoto } from "../CelebPhoto";
import { Bar, Button, Screen } from "../ui";

function slug(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "result";
}

export function Results({
  res,
  name,
  canKeepGoing,
  onKeepGoing,
  onAddRater,
  onUndo,
  onStartOver,
}: {
  res: ResultsData;
  name: string;
  canKeepGoing: boolean;
  onKeepGoing: () => void;
  onAddRater: () => void;
  onUndo?: () => void;
  onStartOver: () => void;
}) {
  const [copied, setCopied] = useState<"" | "text" | "image" | "error">("");
  const flash = (s: typeof copied) => {
    setCopied(s);
    setTimeout(() => setCopied(""), 1800);
  };

  async function copyText() {
    try {
      await navigator.clipboard.writeText(shareText(res, name));
      flash("text");
    } catch {
      flash("error");
    }
  }

  async function saveImage() {
    try {
      const blob = await renderResultImage(res, name);
      const file = new File([blob], `modulo-maxx-${slug(name)}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] }).catch(() => {});
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash("image");
    } catch {
      flash("error");
    }
  }

  const confidence = res.face.sd < 0.3 ? "High" : res.face.sd < 0.5 ? "Medium" : "Low";

  return (
    <Screen>
      <p className="text-sm text-muted">{name.trim() ? `${name.trim()}, face` : "Face"}</p>
      <div className="mt-1 flex items-baseline gap-3">
        {res.face.outOfBank ? (
          <span className="text-5xl font-semibold leading-tight tracking-tight">{fmtFace(res.face)}</span>
        ) : (
          <>
            <span className="text-8xl font-semibold leading-none tracking-tight">{fmt(res.face.mean)}</span>
            <span className="text-2xl text-muted">± {fmt(Math.max(0.1, res.face.sd))}</span>
          </>
        )}
      </div>
      <p className="mt-3 text-2xl font-medium text-accent">Top {res.faceTop}% of guys for face</p>
      <p className="mt-2 text-xs text-muted">
        {res.face.outOfBank
          ? "Outside the range of the celebrity bank, so the range is wide."
          : `${confidence} confidence, from ${res.answered} answers${res.raters.length > 1 ? ` by ${res.raters.length} people` : ""}.`}
      </p>
      {res.raters.length > 1 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {res.raters.map((r) => (
            <li key={r.label} className="flex justify-between text-muted">
              <span>{r.label}</span>
              <span className="tabular-nums">
                {fmtFace(r.face)} · {r.answered} answers
              </span>
            </li>
          ))}
        </ul>
      )}

      {res.match && (
        <div className="mt-8 flex items-center gap-5 border-t border-line pt-6">
          <div className="w-28 shrink-0">
            <CelebPhoto celeb={res.match} className="text-sm" />
          </div>
          <div>
            <p className="text-sm text-muted">{res.face.outOfBank === "above" ? "Face above even" : "Face around the level of"}</p>
            <p className="text-2xl font-semibold leading-tight">{res.match.name}</p>
          </div>
        </div>
      )}

      <div className="mt-10 flex flex-col gap-6 border-t border-line pt-6">
        {res.attributes
          .filter((a) => a.key !== "face")
          .map((a) => (
            <div key={a.key}>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-medium">{a.label}</span>
                <span className="tabular-nums">{fmt(a.value)}</span>
              </div>
              <Bar value={a.value / 10} label={a.label} />
            </div>
          ))}
        {res.height === undefined && <p className="text-xs text-muted">No height given, so it isn't counted.</p>}
      </div>

      <div className="mt-8 border-t border-line pt-6">
        <p className="text-sm text-muted">Overall (face, height and body)</p>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-5xl font-semibold leading-none tracking-tight">{fmt(res.overall.mean)}</span>
          <span className="text-xl text-muted">± {fmt(Math.max(0.1, res.overall.sd))}</span>
        </div>
        <p className="mt-2 text-lg font-medium text-accent">Top {res.top}% of guys overall</p>
        <p className="mt-3 leading-snug">{res.verdict}</p>
      </div>

      {(res.strongest || res.weakest) && (
        <div className="mt-8 grid grid-cols-2 gap-4 border-t border-line pt-6">
          <div>
            <p className="text-sm text-muted">Strongest</p>
            <p className="text-xl font-medium">{res.strongest?.label}</p>
          </div>
          <div>
            <p className="text-sm text-muted">Weakest</p>
            <p className="text-xl font-medium">{res.weakest?.label}</p>
          </div>
        </div>
      )}

      <div className="mt-10 grid gap-3">
        <Button onClick={copyText}>{copied === "text" ? "Copied" : "Copy result"}</Button>
        <Button variant="outline" onClick={saveImage}>
          {copied === "image" ? "Saved" : "Save as image"}
        </Button>
        {copied === "error" && <p className="text-center text-sm text-muted">That didn&apos;t work in this browser.</p>}
        <Button variant="outline" onClick={onAddRater}>
          Add another person&apos;s rating
        </Button>
        {canKeepGoing && (
          <Button variant="outline" onClick={onKeepGoing}>
            Keep going for more accuracy
          </Button>
        )}
      </div>
      <div className="mt-8 flex justify-center gap-6">
        {onUndo && (
          <Button variant="text" onClick={onUndo}>
            ← Undo last answer
          </Button>
        )}
        <Button variant="text" onClick={onStartOver}>
          Start over
        </Button>
      </div>
      <p className="mt-8 text-center text-xs text-muted">For fun, not science.</p>
    </Screen>
  );
}
