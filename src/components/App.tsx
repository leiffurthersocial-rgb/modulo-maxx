"use client";

import { useEffect, useMemo, useState } from "react";
import { BANK, getCeleb } from "@/lib/bank";
import { progress, type Answer } from "@/lib/engine";
import { computeResults, faceState, isDone, limitsFor, pickNext } from "@/lib/results";
import { clearState, initialState, loadState, saveState, subjectRef, type AppState, type RaterState } from "@/lib/state";
import { Handoff } from "./screens/Handoff";
import { Landing } from "./screens/Landing";
import { Rating } from "./screens/Rating";
import { Results } from "./screens/Results";
import { SubjectForm } from "./screens/SubjectForm";
import { Button } from "./ui";

/** Set the active rater's next question, or move to results when the engine says stop. */
function advance(state: AppState): AppState {
  const fs = faceState(state);
  const i = state.activeRater;
  if (isDone(state, fs.face)) {
    return { ...state, screen: "results", raters: updateRater(state.raters, i, { current: undefined }) };
  }
  const next = pickNext(state, fs.post);
  if (!next) return { ...state, screen: "results", raters: updateRater(state.raters, i, { current: undefined }) };
  return { ...state, screen: "rating", raters: updateRater(state.raters, i, { current: next.id }) };
}

function updateRater(raters: RaterState[], i: number, patch: Partial<RaterState>): RaterState[] {
  return raters.map((r, j) => (j === i ? { ...r, ...patch } : r));
}

export function App() {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    const saved = loadState();
    // Drop a stale on-screen celeb (e.g. the bank changed since the last visit).
    if (saved?.screen === "rating") {
      const r = saved.raters[saved.activeRater];
      setState(r?.current && getCeleb(r.current) ? saved : advance(saved));
    } else {
      setState(saved ?? initialState());
    }
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [state?.screen]);

  const rater = state?.raters[state.activeRater];
  const fs = useMemo(() => (state ? faceState(state) : null), [state?.raters]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(
    () => (state?.screen === "results" && fs ? computeResults(state, fs) : null),
    [state?.screen, fs, state?.subject], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (!state || !rater || !fs) return null;

  const set = (patch: Partial<AppState>) => setState({ ...state, ...patch });
  const startOver = () => {
    clearState();
    setState(initialState());
  };
  const top = (
    <>
      <span className="text-sm font-medium">Modulo Maxx</span>
      <Button variant="text" onClick={startOver}>
        Start over
      </Button>
    </>
  );

  function answer(a: Answer) {
    if (!state || !rater?.current) return;
    const celeb = getCeleb(rater.current);
    if (!celeb) return;
    const votes = [...rater.votes, { celebId: celeb.id, rating: celeb.rating, category: celeb.category, answer: a }];
    setState(advance({ ...state, raters: updateRater(state.raters, state.activeRater, { votes, current: undefined }) }));
  }

  function undo() {
    if (!state || !rater || rater.votes.length === 0) return;
    const last = rater.votes[rater.votes.length - 1];
    set({ raters: updateRater(state.raters, state.activeRater, { votes: rater.votes.slice(0, -1), current: last.celebId }) });
  }

  function keepGoing() {
    if (!state || !rater) return;
    const raters = updateRater(state.raters, state.activeRater, {
      extensions: rater.extensions + 1,
      extendedAt: rater.votes.length,
    });
    setState(advance({ ...state, raters }));
  }

  switch (state.screen) {
    case "landing":
      return <Landing key="landing" onStart={() => set({ screen: "subject" })} />;
    case "subject":
      return <SubjectForm key="subject" top={top} subject={state.subject} onDone={(subject) => set({ subject, screen: "handoff" })} />;
    case "handoff":
      return (
        <Handoff
          key="handoff"
          top={top}
          onReady={() => setState(rater.votes.length > 0 && isDone(state, fs.face) ? { ...state, screen: "results" } : advance(state))}
        />
      );
    case "rating": {
      const celeb = rater.current ? getCeleb(rater.current) : undefined;
      if (!celeb) return null;
      return (
        <Rating
          key="rating"
          top={top}
          celeb={celeb}
          who={subjectRef(state.subject)}
          answered={rater.votes.length}
          progress={progress(rater.votes.length, fs.face, limitsFor(rater))}
          onAnswer={answer}
          onUndo={rater.votes.length > 0 ? undo : undefined}
        />
      );
    }
    case "results":
      if (!results) return null;
      return (
        <Results
          key="results"
          res={results}
          name={state.subject.name}
          canKeepGoing={rater.votes.length < BANK.length}
          onKeepGoing={keepGoing}
          onStartOver={startOver}
        />
      );
  }
}
