"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCeleb } from "@/lib/bank";
import {
  BANDS,
  clearRanker,
  exportResults,
  fit,
  FOCUS_PICKS,
  initialRanker,
  loadRanker,
  nextPair,
  saveRanker,
  type Band,
  type Margin,
  type RankerState,
} from "@/lib/ranker";
import { CelebPhoto } from "./CelebPhoto";
import { Bar, Button, Screen, SegmentedToggle } from "./ui";

type View = "who" | "vote" | "list";

function withPair(s: RankerState): RankerState {
  if (s.focus && s.votes.length >= s.focus.until) return { ...s, current: undefined };
  const pair = nextPair(s.votes, s.band, Math.random, undefined, s.focus?.id);
  return { ...s, current: pair ? [pair[0].id, pair[1].id] : undefined };
}

const fmt = (d: number) => (Math.abs(d) < 0.05 ? "±0" : `${d > 0 ? "+" : ""}${d.toFixed(1)}`);

export function RankerApp() {
  const [state, setState] = useState<RankerState | null>(null);
  const [view, setView] = useState<View>("who");
  const [name, setName] = useState("");
  const [flash, setFlash] = useState("");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  // Keyboard shortcuts call whatever the current screen's handlers are.
  const keys = useRef<((e: KeyboardEvent) => void) | null>(null);
  useEffect(() => {
    const on = (e: KeyboardEvent) => keys.current?.(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  useEffect(() => setState(loadRanker() ?? initialRanker()), []);
  useEffect(() => {
    if (state) saveRanker(state);
  }, [state]);

  const votes = state?.votes;
  const fitted = useMemo(() => (votes && (view === "list" || state?.focus) ? fit(votes) : []), [view, votes, state?.focus]);

  if (!state) return null;
  keys.current = null;

  function focusOn(id: string) {
    if (!state) return;
    const n = state.votes.length;
    const next = { ...state, focus: { id, from: n, until: n + FOCUS_PICKS } };
    if (state.rater) {
      setState(withPair(next));
      setView("vote");
    } else {
      setState(next);
      setView("who");
    }
  }
  const focusCeleb = state.focus ? getCeleb(state.focus.id) : undefined;
  const focusFit = state.focus ? fitted.find((f) => f.celeb.id === state.focus!.id) : undefined;

  const top = (
    <>
      <Link href="/" className="text-sm font-medium">
        Modulo Maxx
      </Link>
      <Button variant="text" onClick={() => setView("list")}>
        See ranking
      </Button>
    </>
  );
  const mine = state.votes.filter((v) => v.rater === state.rater).length;

  if (view === "who") {
    const start = (who: string) => {
      const rater = who.trim();
      if (!rater) return;
      setState(withPair({ ...state, rater, raters: state.raters.includes(rater) ? state.raters : [...state.raters, rater] }));
      setName("");
      setView("vote");
    };
    return (
      <Screen top={top}>
        <h1 className="text-4xl font-semibold tracking-tight">Celebrity ranker</h1>
        <p className="mt-3 text-muted">
          Pick the better face, again and again. Every pick sharpens the celeb ratings the face test compares against.
          Stop whenever you like. Pass the phone around for more accuracy.
        </p>
        <p className="mt-2 text-sm text-muted">
          {state.votes.length} picks so far{state.raters.length ? ` by ${state.raters.join(", ")}` : ""}.
        </p>
        {focusCeleb && (
          <p className="mt-3 text-sm">
            Up next: {FOCUS_PICKS} picks with just <span className="font-medium">{focusCeleb.name}</span>.{" "}
            <button type="button" className="text-muted underline" onClick={() => setState({ ...state, focus: undefined })}>
              Cancel
            </button>
          </p>
        )}

        <div className="mt-8">
          <p className="mb-2 text-sm text-muted">Who&apos;s picking?</p>
          {state.raters.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {state.raters.map((r) => (
                <button key={r} type="button" onClick={() => start(r)} className="rounded-full border border-line px-4 py-2">
                  {r}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <input
              className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-transparent px-4 text-lg outline-none focus:border-accent"
              placeholder="New name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && start(name)}
              maxLength={24}
              aria-label="Your name"
            />
            <Button className="!h-12 !w-auto shrink-0 px-6" onClick={() => start(name)} disabled={!name.trim()}>
              Go
            </Button>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5 border-t border-line pt-6">
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">Which celebs (by current rating)</span>
            <SegmentedToggle
              label="Rating band"
              value={state.band}
              onChange={(band: Band) => setState({ ...state, band })}
              options={(Object.keys(BANDS) as Band[]).map((b) => ({ value: b, label: BANDS[b].label }))}
            />
          </div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-[var(--accent)]"
              checked={state.showNames}
              onChange={(e) => setState({ ...state, showNames: e.target.checked })}
            />
            <span>
              <span className="block font-medium">Show names</span>
              <span className="block text-sm text-muted">Off is better: judge the face, not the fame.</span>
            </span>
          </label>
        </div>
      </Screen>
    );
  }

  if (view === "vote") {
    const pair = state.current?.map((id) => getCeleb(id));
    const focus = state.focus;
    const focusDone = !!focus && state.votes.length >= focus.until;
    function pick(margin: Margin | "skip") {
      if (!state?.current) return;
      const [a, b] = state.current;
      const votes = margin === "skip" ? state.votes : [...state.votes, { a, b, margin, rater: state.rater }];
      setState(withPair({ ...state, votes }));
    }
    // A celeb seen in the last pick is back for another round to pin down where he belongs.
    const prev = state.votes[state.votes.length - 1];
    const again = focus ? -1 : (pair?.findIndex((c) => c && prev && (prev.a === c.id || prev.b === c.id)) ?? -1);
    function undo() {
      if (!state) return;
      const i = state.votes.map((v) => v.rater).lastIndexOf(state.rater);
      if (i < 0) return;
      const last = state.votes[i];
      setState({ ...state, votes: state.votes.filter((_, k) => k !== i), current: [last.a, last.b] });
    }
    const endFocus = () => setState(withPair({ ...state, focus: undefined }));
    keys.current = (e) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, () => void> = {
        ArrowLeft: () => pick(e.shiftKey ? 2 : 1),
        ArrowRight: () => pick(e.shiftKey ? -2 : -1),
        ArrowDown: () => pick(0),
        " ": () => pick(0),
        ArrowUp: () => pick("skip"),
        Backspace: undo,
        z: undo,
      };
      const run = focusDone ? (e.key === "Backspace" || e.key === "z" ? undo : undefined) : map[e.key];
      if (run) {
        e.preventDefault();
        run();
      }
    };
    return (
      <Screen top={top}>
        <div className="flex justify-between text-xs text-muted">
          <span>
            {state.rater} · {mine} picks
          </span>
          <span>{state.votes.length} total</span>
        </div>
        {focus && focusCeleb && (
          <div className="mt-3 rounded-xl border border-line px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate font-medium">{focusCeleb.name}</span>
              {focusFit && (
                <span className="shrink-0 text-sm tabular-nums">
                  <span className="font-semibold">{focusFit.rating.toFixed(1)}</span>
                  <span className="text-muted"> ±{focusFit.sd.toFixed(1)} · was {focusFit.old.toFixed(1)}</span>
                </span>
              )}
            </div>
            <div className="mt-2">
              <Bar value={(state.votes.length - focus.from) / (focus.until - focus.from)} label="Focus round" />
            </div>
          </div>
        )}
        {focusDone && focusCeleb && focusFit ? (
          <div className="fade-in mt-6 flex flex-col items-center text-center">
            <div className="w-40">
              <CelebPhoto celeb={focusCeleb} />
            </div>
            <p className="mt-4 text-5xl font-semibold tabular-nums">{focusFit.rating.toFixed(1)}</p>
            <p className="mt-1 text-sm text-muted">
              was {focusFit.old.toFixed(1)} ({fmt(focusFit.rating - focusFit.old)}) · ±{focusFit.sd.toFixed(1)} ·{" "}
              {focusFit.comparisons} picks in all
            </p>
            <div className="mt-8 grid w-full gap-3">
              <Button
                onClick={() =>
                  setState(withPair({ ...state, focus: { ...focus, until: state.votes.length + 5 } }))
                }
              >
                5 more with {focusCeleb.name.split(" ")[0]}
              </Button>
              <Button variant="outline" onClick={() => setView("list")}>
                Pick someone else
              </Button>
              <Button variant="outline" onClick={endFocus}>
                Back to mixed picks
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-3 text-2xl font-semibold leading-tight">Who has the better face?</p>
            <p className="mt-1 text-sm text-muted">Tap a face, or &quot;Much better&quot; if it&apos;s not close.</p>
            {pair && pair[0] && pair[1] ? (
              <div key={state.current!.join()} className="fade-in mt-6 grid grid-cols-2 gap-3">
                {pair.map((c, i) => (
                  <div key={c!.id} className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => pick(i === 0 ? 1 : -1)}
                      className="relative rounded-xl text-left outline-none ring-accent transition active:scale-[0.98] focus-visible:ring-2"
                      aria-label={i === 0 ? "Left celeb" : "Right celeb"}
                    >
                      <CelebPhoto celeb={c!} />
                      {i === again && (
                        <span className="absolute left-2 top-2 rounded-full bg-bg/85 px-2 py-0.5 text-xs">again</span>
                      )}
                    </button>
                    {(state.showNames || focus) && (
                      <p className="mt-1 truncate text-center text-sm text-muted">
                        {state.showNames || c!.id === focus?.id ? c!.name : "\u00a0"}
                      </p>
                    )}
                    <Button variant="outline" className="mt-2 !h-11 !text-base" onClick={() => pick(i === 0 ? 2 : -2)}>
                      Much better
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-muted">Not enough celebs in this band.</p>
            )}
          </>
        )}
        <div className="mt-auto grid gap-3 pt-6">
          {!focusDone && (
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => pick(0)}>
                Too close
              </Button>
              <Button variant="outline" onClick={() => pick("skip")}>
                Skip
              </Button>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="text" onClick={undo} disabled={mine === 0} className="disabled:opacity-30">
              ← Undo
            </Button>
            {focus && !focusDone ? (
              <Button variant="text" onClick={endFocus}>
                Stop focus
              </Button>
            ) : (
              <Button variant="text" onClick={() => setView("who")}>
                Switch person
              </Button>
            )}
          </div>
          <p className="hidden text-center text-xs text-muted sm:block">
            Keys: ← → pick · shift + ← → much better · ↓ too close · ↑ skip · z undo
          </p>
        </div>
      </Screen>
    );
  }

  // Ranking
  const changed = fitted.filter((f) => f.comparisons > 0);
  const q = query.trim().toLowerCase();
  // Rank among the whole bank, so the numbers mean the same with or without the filter.
  const ranked = [...fitted].filter((f) => f.celeb.image).sort((a, b) => b.rating - a.rating);
  const place = new Map(ranked.map((f, i) => [f.celeb.id, i + 1]));
  const sorted = ranked.filter((f) => (q ? f.celeb.name.toLowerCase().includes(q) : showAll || f.comparisons > 0));
  async function copy() {
    try {
      await navigator.clipboard.writeText(exportResults(state!.votes));
      setFlash("Copied. Paste it to Claude.");
    } catch {
      setFlash("Copy didn't work here. Use Download instead.");
    }
    setTimeout(() => setFlash(""), 2500);
  }
  function download() {
    const blob = new Blob([exportResults(state!.votes)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `celebrity-ranker-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Screen
      top={
        <>
          <Link href="/" className="text-sm font-medium">
            Modulo Maxx
          </Link>
          <Button variant="text" onClick={() => setView(state.rater ? "vote" : "who")}>
            Keep picking
          </Button>
        </>
      }
    >
      <h1 className="text-4xl font-semibold tracking-tight">The ranking</h1>
      <p className="mt-2 text-sm text-muted">
        {state.votes.length} picks by {state.raters.length} {state.raters.length === 1 ? "person" : "people"} ·{" "}
        {changed.length} celebs compared. Ratings start from the current ones and move with your picks.
      </p>
      <div className="mt-6 grid gap-3">
        <Button onClick={copy} disabled={!state.votes.length}>
          {flash || "Copy results for Claude"}
        </Button>
        <Button variant="outline" onClick={download} disabled={!state.votes.length}>
          Download results file
        </Button>
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <input
          className="h-12 rounded-xl border border-line bg-transparent px-4 text-lg outline-none focus:border-accent"
          placeholder="Find a celeb"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find a celeb"
        />
        <div className="flex items-center justify-between gap-3">
          <SegmentedToggle
            label="Which celebs"
            value={showAll ? "all" : "picked"}
            onChange={(v) => setShowAll(v === "all")}
            options={[
              { value: "picked", label: "Picked" },
              { value: "all", label: "Everyone" },
            ]}
          />
          <span className="text-xs text-muted">Tap a celeb to do {FOCUS_PICKS} picks with just them</span>
        </div>
      </div>
      <ol className="mt-4 flex flex-col gap-2">
        {sorted.map((f) => {
          const d = Math.round((f.rating - f.old) * 10) / 10;
          return (
            <li key={f.celeb.id} className="border-b border-line pb-2">
              <button
                type="button"
                onClick={() => focusOn(f.celeb.id)}
                className="flex w-full items-center gap-3 text-left active:opacity-60"
                aria-label={`Do picks with ${f.celeb.name}`}
              >
                <span className="w-8 text-right text-sm tabular-nums text-muted">{place.get(f.celeb.id)}</span>
                <div className="w-10 shrink-0">
                  <CelebPhoto celeb={f.celeb} className="rounded-md" />
                </div>
                <span className="min-w-0 flex-1 truncate">{f.celeb.name}</span>
                <span className="text-right text-sm tabular-nums">
                  <span className="font-semibold">{f.rating.toFixed(1)}</span>
                  {f.comparisons > 0 && <span className={d > 0 ? " text-accent" : " text-muted"}> {fmt(d)}</span>}
                  <span className="block text-xs text-muted">
                    {f.comparisons > 0 ? `${f.comparisons} picks · ±${f.sd.toFixed(1)}` : "no picks"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {sorted.length === 0 && <p className="mt-8 text-muted">{q ? "Nobody by that name." : "No picks yet."}</p>}
      <div className="mt-10 flex justify-center">
        <Button
          variant="text"
          onClick={() => {
            if (!confirm("Delete all picks from everyone?")) return;
            clearRanker();
            setState(initialRanker());
            setView("who");
          }}
        >
          Delete all picks
        </Button>
      </div>
    </Screen>
  );
}
