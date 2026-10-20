"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCeleb } from "@/lib/bank";
import {
  clearVibe,
  loadVibe,
  nextVibeCeleb,
  saveVibe,
  scoreVibe,
  vibeExamples,
  ARCHETYPES,
  VIBE_QUESTIONS,
  type VibeAnswer,
  type VibeState,
  type VibeVote,
} from "@/lib/archetypes";
import { CelebPhoto } from "./CelebPhoto";
import { Bar, Button, Screen } from "./ui";

const fresh = (): VibeState => ({ version: 1, name: "", votes: [], done: false });

/** Pick the next celeb, or finish when the quiz is complete. */
function advance(s: VibeState): VibeState {
  const next = nextVibeCeleb(s.votes);
  return next ? { ...s, current: next.id, done: false } : { ...s, current: undefined, done: true };
}

export function ArchetypesApp() {
  const [state, setState] = useState<VibeState | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const saved = loadVibe();
    setState(saved ?? fresh());
    setStarted(!!saved && (saved.votes.length > 0 || saved.done));
  }, []);

  useEffect(() => {
    if (state) saveVibe(state);
  }, [state]);

  const scores = useMemo(() => (state ? scoreVibe(state.votes) : []), [state]);

  if (!state) return null;

  const who = state.name.trim() || "he";
  const restart = () => {
    clearVibe();
    setState(fresh());
    setStarted(false);
  };
  const top = (
    <>
      <Link href="/" className="text-sm font-medium">
        Modulo Maxx
      </Link>
      <Button variant="text" onClick={restart}>
        Start over
      </Button>
    </>
  );

  if (!started) {
    return (
      <Screen top={top}>
        <div className="flex flex-1 flex-col justify-center">
          <h1 className="text-5xl font-semibold leading-none tracking-tight">Archetypes</h1>
          <p className="mt-6 text-xl leading-snug">
            Hero or villain? Vampire or surfer? Find out which character he&apos;d be cast as. {VIBE_QUESTIONS} quick
            questions about who he gives off a similar vibe to.
          </p>
          <p className="mt-4 text-muted">
            {ARCHETYPES.length} archetypes, from prince charming to e-boy. Not about how good-looking he is, just the vibe.
          </p>
          <label className="mt-8 block">
            <span className="mb-2 block text-sm text-muted">His name (optional)</span>
            <input
              className="h-14 w-full rounded-xl border border-line bg-transparent px-4 text-xl outline-none focus:border-accent"
              value={state.name}
              onChange={(e) => setState({ ...state, name: e.target.value })}
              maxLength={40}
              autoComplete="off"
            />
          </label>
        </div>
        <Button
          onClick={() => {
            setStarted(true);
            setState(advance({ ...state, votes: [], done: false }));
          }}
        >
          Start
        </Button>
      </Screen>
    );
  }

  function answer(a: VibeAnswer) {
    if (!state?.current) return;
    setState(advance({ ...state, votes: [...state.votes, { celebId: state.current, answer: a }] }));
  }

  function undo() {
    if (!state || state.votes.length === 0) return;
    const last = state.votes[state.votes.length - 1];
    setState({ ...state, votes: state.votes.slice(0, -1), current: last.celebId, done: false });
  }

  if (state.done) {
    const [best, second, third, ...rest] = scores;
    // A clear second archetype makes a combo ("Hero × Golden retriever").
    const combo = second && second.match >= best.match - 0.12 && second.match >= 0.5;
    return (
      <Screen top={top}>
        <p className="text-sm text-muted">{state.name.trim() ? `${state.name.trim()} is` : "He's"} the</p>
        <h1 className="mt-1 text-6xl font-semibold leading-none tracking-tight">{best.archetype.label}</h1>
        {combo && <p className="mt-2 text-2xl font-medium text-muted">× {second.archetype.label}</p>}
        <p className="mt-4 text-2xl font-medium text-accent">{Math.round(best.match * 100)}% match</p>
        <p className="mt-3 text-lg leading-snug">{best.archetype.blurb}</p>

        <ArchetypeCard label={`Who else is ${best.archetype.label.toLowerCase()}`} id={best.archetype.id} votes={state.votes} />

        <div className="mt-8 grid grid-cols-2 gap-4 border-t border-line pt-6">
          {[second, third].filter(Boolean).map((s) => (
            <div key={s.archetype.id}>
              <p className="text-sm text-muted">{Math.round(s.match * 100)}% match</p>
              <p className="text-xl font-semibold">{s.archetype.label}</p>
              <p className="mt-1 text-sm leading-snug text-muted">{s.archetype.blurb}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6">
          <p className="text-sm text-muted">Everything else</p>
          {rest.slice(0, 6).map((s) => (
            <div key={s.archetype.id}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{s.archetype.label}</span>
                <span className="tabular-nums text-muted">{Math.round(s.match * 100)}%</span>
              </div>
              <Bar value={s.match} label={s.archetype.label} />
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-3">
          <Button onClick={restart}>Try someone else</Button>
          <Button variant="outline" onClick={undo}>
            ← Undo last answer
          </Button>
        </div>
        <Link href="/" className="mt-8 self-center text-sm text-muted underline-offset-4 hover:underline">
          Back to start
        </Link>
      </Screen>
    );

  }

  const celeb = state.current ? getCeleb(state.current) : undefined;
  if (!celeb) return null;
  return (
    <Screen top={top}>
      <Bar value={state.votes.length / VIBE_QUESTIONS} label="Progress" />
      <p className="mt-2 text-xs text-muted">
        Question {state.votes.length + 1} of {VIBE_QUESTIONS}
      </p>
      <div key={celeb.id} className="fade-in mt-4">
        <CelebPhoto celeb={celeb} className="max-h-[46dvh]" />
        <p className="mt-2 text-center text-sm text-muted">{celeb.name}</p>
      </div>
      <p className="mt-5 text-xl leading-snug">Does {who} give off a similar vibe to this person?</p>
      <div className="mt-auto grid gap-3 pt-6">
        <Button variant="outline" onClick={() => answer("very")}>
          Very similar
        </Button>
        <Button variant="outline" onClick={() => answer("bit")}>
          A bit
        </Button>
        <Button variant="outline" onClick={() => answer("not")}>
          Not really
        </Button>
        <Button variant="text" onClick={undo} disabled={state.votes.length === 0} className="disabled:opacity-30">
          ← Back (undo last answer)
        </Button>
      </div>
    </Screen>
  );
}

function ArchetypeCard({ label, id, votes }: { label: string; id: string; votes: VibeVote[] }) {
  const examples = vibeExamples(id, votes);
  if (!examples.length) return null;
  return (
    <div className="mt-8">
      <p className="mb-2 text-sm text-muted">{label}</p>
      <div className="grid grid-cols-3 gap-3">
        {examples.map((c) => (
          <div key={c.id}>
            <CelebPhoto celeb={c} />
            <p className="mt-1 text-center text-xs text-muted">{c.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
