"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearMog,
  downscale,
  fitRanking,
  initialMog,
  loadMog,
  ownFace,
  pairsForRater,
  saveMog,
  type MogState,
  type Player,
  voterName,
} from "@/lib/mog";
import { Button, Screen } from "./ui";

const MIN_PLAYERS = 3;
const inputCls =
  "h-12 w-full rounded-xl border border-line bg-transparent px-4 text-lg outline-none focus:border-accent placeholder:text-muted/60";

function Face({ src, className = "" }: { src: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={`aspect-[4/5] w-full rounded-xl bg-line object-cover object-[50%_25%] ${className}`} />
  );
}

export function MogApp() {
  const [state, setState] = useState<MogState | null>(null);
  const [stored, setStored] = useState(true);

  useEffect(() => setState(loadMog() ?? initialMog()), []);
  useEffect(() => {
    if (state) setStored(saveMog(state));
  }, [state]);

  if (!state) return null;

  const set = (patch: Partial<MogState>) => setState({ ...state, ...patch });
  const reset = () => {
    if (!confirm("Delete all photos and votes?")) return;
    clearMog();
    setState(initialMog());
  };
  const top = (
    <>
      <Link href="/" className="text-sm font-medium">
        Modulo Maxx
      </Link>
      <Button variant="text" onClick={reset}>
        New battle
      </Button>
    </>
  );
  const startRater = (s: MogState): MogState => ({
    ...s,
    screen: "vote",
    queue: pairsForRater(s.players, s.votes, Math.random, ownFace(s, s.rater)),
  });
  const ratersDone = new Set(state.votes.map((v) => v.rater)).size;
  const current = voterName(state.players, state.rater);
  const upNext = voterName(state.players, state.rater + 1);
  const allPlayersVoted = state.rater + 1 >= state.players.length;

  switch (state.screen) {
    case "setup":
      return <Setup state={state} top={top} stored={stored} onChange={setState} />;

    case "handoff":
      return (
        <Screen top={top}>
          <div className="flex flex-1 flex-col justify-center">
            <p className="text-sm text-muted">Voter {state.rater + 1}</p>
            <p className="mt-2 text-5xl font-semibold leading-tight tracking-tight">{current}&apos;s turn</p>
            <p className="mt-4 text-xl">Pass the phone to {current}.</p>
            <p className="mt-4 text-muted">
              You&apos;ll see two faces at a time. Tap the better-looking face.
              {ownFace(state, state.rater) ? " Your own face won't come up." : ""} Votes are anonymous and nobody
              sees results until the reveal.
            </p>
            <p className="mt-6 text-sm text-muted">Up next: {upNext}</p>
          </div>
          <Button onClick={() => setState(startRater(state))}>I&apos;m {current}, start</Button>
        </Screen>
      );

    case "vote":
      return <Vote state={state} top={top} onChange={setState} />;

    case "between":
      return (
        <Screen top={top}>
          <div className="flex flex-1 flex-col justify-center">
            <p className="text-4xl font-semibold leading-tight tracking-tight">Thanks, {current}!</p>
            <p className="mt-4 text-muted">
              {ratersDone} {ratersDone === 1 ? "person has" : "people have"} voted.
              {allPlayersVoted
                ? " Everyone in the battle has voted. Reveal the ranking, or let a guest vote too."
                : " Hand the phone on."}
            </p>
            <p className="mt-8 text-sm text-muted">Up next</p>
            <p className="text-3xl font-semibold">{upNext}</p>
          </div>
          <div className="grid gap-3">
            <Button onClick={() => set({ screen: "handoff", rater: state.rater + 1 })}>Pass to {upNext}</Button>
            <Button
              variant="outline"
              onClick={() => confirm("Reveal the ranking to everyone?") && set({ screen: "reveal" })}
            >
              Reveal ranking
            </Button>
          </div>
        </Screen>
      );

    case "reveal":
      return (
        <Reveal
          state={state}
          top={top}
          nextVoter={upNext}
          onMoreVotes={() => set({ screen: "handoff", rater: state.rater + 1 })}
          onRematch={() => setState({ ...state, screen: "handoff", votes: [], rater: 0, queue: [] })}
        />
      );
  }
}

function Setup({
  state,
  top,
  stored,
  onChange,
}: {
  state: MogState;
  top: React.ReactNode;
  stored: boolean;
  onChange: (s: MogState) => void;
}) {
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      setPhoto(await downscale(file));
    } catch {
      setError("Couldn't read that image. Try another one.");
    }
  }

  function add() {
    if (!photo || !name.trim()) return;
    const player: Player = { id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, name: name.trim(), photo };
    onChange({ ...state, players: [...state.players, player] });
    setName("");
    setPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const enough = state.players.length >= MIN_PLAYERS;
  return (
    <Screen top={top}>
      <h1 className="text-4xl font-semibold tracking-tight">Mog battle</h1>
      <p className="mt-3 text-muted">
        Add everyone&apos;s photo, then pass the phone around. Each person votes on head-to-head matchups anonymously.
        The last one reveals the ranking.
      </p>

      <div className="mt-8 rounded-xl border border-line p-4">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-24 shrink-0 overflow-hidden rounded-xl border border-dashed border-line text-sm text-muted"
            aria-label="Choose photo"
          >
            {photo ? <Face src={photo} /> : <div className="flex aspect-[4/5] items-center justify-center">+ Photo</div>}
          </button>
          <div className="flex flex-1 flex-col justify-between gap-3">
            <input
              className={inputCls}
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoComplete="off"
              aria-label="Name"
            />
            <Button onClick={add} disabled={!photo || !name.trim()} className="!h-12">
              Add person
            </Button>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <p className="mt-3 text-xs text-muted">
          Use a clear, front-facing photo for everyone. Photos stay on this device.
        </p>
        {error && <p className="mt-2 text-sm text-accent">{error}</p>}
      </div>

      {state.players.length > 0 && (
        <ul className="mt-6 grid grid-cols-3 gap-3">
          {state.players.map((p) => (
            <li key={p.id} className="relative">
              <Face src={p.photo} />
              <p className="mt-1 truncate text-center text-sm">{p.name}</p>
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                onClick={() => onChange({ ...state, players: state.players.filter((x) => x.id !== p.id) })}
                className="absolute right-1 top-1 h-7 w-7 rounded-full bg-bg/80 text-sm"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="mt-6 flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 accent-[var(--accent)]"
          checked={!!state.hideOwn}
          onChange={(e) => onChange({ ...state, hideOwn: e.target.checked })}
        />
        <span>
          <span className="block font-medium">Hide each voter&apos;s own face</span>
          <span className="block text-sm text-muted">
            Nobody judges themselves. Voters take turns in the order above, then guests can vote too.
          </span>
        </span>
      </label>

      {!stored && (
        <p className="mt-4 text-sm text-accent">
          The browser&apos;s storage is full, so this battle won&apos;t survive a reload. It still works if you keep this
          tab open.
        </p>
      )}

      <div className="mt-auto pt-10">
        <Button disabled={!enough} onClick={() => onChange({ ...state, screen: "handoff", rater: 0 })}>
          {enough ? `Start with ${state.players.length} people` : `Add at least ${MIN_PLAYERS} people`}
        </Button>
      </div>
    </Screen>
  );
}

function Vote({ state, top, onChange }: { state: MogState; top: React.ReactNode; onChange: (s: MogState) => void }) {
  const byId = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);
  const mine = state.votes.filter((v) => v.rater === state.rater);
  const total = mine.length + state.queue.length;
  const [pair] = state.queue;
  if (!pair) return null;
  const [a, b] = pair.map((id) => byId.get(id)!);

  function choose(winner: "a" | "b" | "tie") {
    const vote = { a: a.id, b: b.id, winner, rater: state.rater };
    const queue = state.queue.slice(1);
    onChange({ ...state, votes: [...state.votes, vote], queue, screen: queue.length ? "vote" : "between" });
  }

  function undo() {
    const last = mine[mine.length - 1];
    if (!last) return;
    const idx = state.votes.lastIndexOf(last);
    onChange({ ...state, votes: state.votes.filter((_, i) => i !== idx), queue: [[last.a, last.b], ...state.queue] });
  }

  return (
    <Screen top={top}>
      <div className="flex justify-between text-xs text-muted">
        <span>
          {voterName(state.players, state.rater)} voting · {mine.length + 1} of {total}
        </span>
        <span>Next: {voterName(state.players, state.rater + 1)}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold leading-tight">Who has the better face?</p>
      <div key={`${a.id}-${b.id}`} className="fade-in mt-6 grid grid-cols-2 gap-3">
        {[a, b].map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => choose(i === 0 ? "a" : "b")}
            className="rounded-xl outline-none ring-accent transition active:scale-[0.98] focus-visible:ring-2"
            aria-label={i === 0 ? "Left face" : "Right face"}
          >
            <Face src={p.photo} />
          </button>
        ))}
      </div>
      <div className="mt-auto grid gap-3 pt-6">
        <Button variant="outline" onClick={() => choose("tie")}>
          Too close to call
        </Button>
        <Button variant="text" onClick={undo} disabled={mine.length === 0} className="disabled:opacity-30">
          ← Back (undo last answer)
        </Button>
      </div>
    </Screen>
  );
}

function Reveal({
  state,
  top,
  nextVoter,
  onMoreVotes,
  onRematch,
}: {
  state: MogState;
  top: React.ReactNode;
  nextVoter: string;
  onMoreVotes: () => void;
  onRematch: () => void;
}) {
  const standings = useMemo(() => fitRanking(state.players, state.votes), [state.players, state.votes]);
  const raters = new Set(state.votes.map((v) => v.rater)).size;
  return (
    <Screen top={top}>
      <p className="text-sm text-muted">
        {raters} {raters === 1 ? "voter" : "voters"} · {state.votes.length} matchups
      </p>
      <h1 className="mt-1 text-5xl font-semibold tracking-tight">The ranking</h1>
      <ol className="mt-8 flex flex-col gap-4">
        {standings.map((s, i) => (
          <li key={s.player.id} className={`fade-in flex items-center gap-4 ${i === 0 ? "rounded-xl border border-accent p-3" : ""}`}>
            <span className="w-8 shrink-0 text-center text-2xl font-semibold tabular-nums">{i + 1}</span>
            <div className={i === 0 ? "w-24 shrink-0" : "w-16 shrink-0"}>
              <Face src={s.player.photo} />
            </div>
            <div className="min-w-0 flex-1">
              <p className={`truncate font-semibold ${i === 0 ? "text-2xl" : "text-lg"}`}>{s.player.name}</p>
              <p className="text-sm text-muted tabular-nums">
                {s.wins}W · {s.losses}L{s.ties ? ` · ${s.ties}T` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className={`font-semibold tabular-nums ${i === 0 ? "text-3xl text-accent" : "text-xl"}`}>{s.elo}</p>
              <p className="text-xs text-muted tabular-nums">± {s.err}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-xs text-muted">
        Scores are Elo-style: 1500 is the group average, and 400 points apart means the higher face wins about 10 of 11
        matchups. More voters shrink the ± range.
      </p>
      <div className="mt-10 grid gap-3">
        <Button onClick={onMoreVotes}>Add another voter ({nextVoter})</Button>
        <Button variant="outline" onClick={() => confirm("Clear all votes and start again with the same faces?") && onRematch()}>
          Rematch (same faces)
        </Button>
      </div>
      <p className="mt-8 text-center text-xs text-muted">For fun, not science.</p>
    </Screen>
  );
}
