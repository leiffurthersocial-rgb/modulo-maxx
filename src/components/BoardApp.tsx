"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BANK } from "@/lib/bank";
import { BOARD_NAME_MAX, NAME_MAX, SCORE_MAX, SCORE_MIN, SCORE_STEP, stats, type BoardPost, type BoardView } from "@/lib/board";
import {
  api,
  ApiError,
  forgetBoard,
  loadLocal,
  parseCode,
  photoUrl,
  rememberBoard,
  saveLocal,
  type BoardLocal,
} from "@/lib/board-client";
import { downscale } from "@/lib/mog";
import { CelebPhoto } from "./CelebPhoto";
import { Button, Screen, SegmentedToggle } from "./ui";

const inputCls =
  "h-12 w-full rounded-xl border border-line bg-transparent px-4 text-lg outline-none focus:border-accent placeholder:text-muted/60";
const fmt = (x: number) => x.toFixed(1);

/** Celebs with photos, for "about like …" next to a score. */
const ANCHORS = BANK.filter((c) => c.image).sort((a, b) => a.rating - b.rating);
function anchorFor(score: number) {
  let best = ANCHORS[0];
  for (const c of ANCHORS) if (Math.abs(c.rating - score) < Math.abs(best.rating - score)) best = c;
  return best;
}

function Face({ board, post, className = "" }: { board: string; post: BoardPost; className?: string }) {
  if (post.hasPhoto)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl(board, post.id)}
        alt={post.name}
        className={`aspect-[4/5] w-full rounded-xl bg-line object-cover object-[50%_25%] ${className}`}
      />
    );
  return (
    <div className={`flex aspect-[4/5] w-full items-center justify-center rounded-xl bg-line text-4xl font-semibold ${className}`}>
      {post.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()}
    </div>
  );
}

/** 1-10 slider in half points, with −/+ and a celeb at about that rating. */
function ScorePicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const v = value ?? 5.5;
  const step = (d: number) => onChange(Math.min(SCORE_MAX, Math.max(SCORE_MIN, v + d)));
  const anchor = value === null ? null : anchorFor(value);
  return (
    <div>
      <div className="flex items-end justify-between">
        <span className="text-6xl font-semibold tabular-nums leading-none">{value === null ? "–" : fmt(value)}</span>
        {anchor && (
          <span className="flex items-center gap-2 text-right text-sm text-muted">
            <span>
              about like
              <br />
              <span className="text-fg">{anchor.name}</span>
            </span>
            <span className="w-10 shrink-0">
              <CelebPhoto celeb={anchor} className="rounded-md" />
            </span>
          </span>
        )}
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button type="button" onClick={() => step(-SCORE_STEP)} className="h-11 w-11 shrink-0 rounded-full border border-line text-xl" aria-label="Lower">
          −
        </button>
        <input
          type="range"
          min={SCORE_MIN}
          max={SCORE_MAX}
          step={SCORE_STEP}
          value={v}
          onPointerDown={() => value === null && onChange(v)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-11 min-w-0 flex-1 accent-[var(--accent)]"
          aria-label="Rating"
        />
        <button type="button" onClick={() => step(SCORE_STEP)} className="h-11 w-11 shrink-0 rounded-full border border-line text-xl" aria-label="Higher">
          +
        </button>
      </div>
      <div className="mt-1 flex justify-between px-14 text-xs text-muted">
        <span>1</span>
        <span>10</span>
      </div>
    </div>
  );
}

function Histogram({ hist }: { hist: number[] }) {
  const max = Math.max(1, ...hist);
  return (
    <div className="flex h-16 items-end gap-1" aria-label="How the ratings spread">
      {hist.map((n, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-sm bg-accent" style={{ height: `${(n / max) * 44}px`, opacity: n ? 1 : 0.15 }} />
          <span className="text-[10px] text-muted">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}

type View = { kind: "board" } | { kind: "post" } | { kind: "round"; queue: string[]; i: number } | { kind: "detail"; id: string } | { kind: "settings" };

export function BoardApp() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("g");
  const [local, setLocalState] = useState<BoardLocal | null>(null);
  const [board, setBoard] = useState<BoardView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>({ kind: "board" });

  useEffect(() => setLocalState(loadLocal()), []);
  const setLocal = useCallback((f: (s: BoardLocal) => BoardLocal) => {
    setLocalState((s) => {
      if (!s) return s;
      const next = f(s);
      saveLocal(next);
      return next;
    });
  }, []);

  const voter = local?.voter;
  const refresh = useCallback(async () => {
    if (!code || !voter) return;
    try {
      const b = await api.get(code, voter);
      setBoard(b);
      setError(null);
      setLocal((s) => rememberBoard(s, b));
    } catch (e) {
      setError(e as ApiError);
    }
  }, [code, voter, setLocal]);

  useEffect(() => {
    setBoard(null);
    setError(null);
    setView({ kind: "board" });
    void refresh();
  }, [code, refresh]);

  // Keep the board live while it's on screen (not mid-round, so the queue doesn't shift).
  useEffect(() => {
    if (!code || view.kind === "round" || view.kind === "post") return;
    const t = setInterval(() => document.visibilityState === "visible" && void refresh(), 8000);
    return () => clearInterval(t);
  }, [code, view.kind, refresh]);

  // A post can vanish (deleted elsewhere) while it's open or queued: move on.
  useEffect(() => {
    if (!board) return;
    const exists = (id: string) => board.posts.some((p) => p.id === id);
    if (view.kind === "detail" && !exists(view.id)) setView({ kind: "board" });
    if (view.kind === "round" && !exists(view.queue[view.i])) {
      const i = view.queue.findIndex((id, k) => k > view.i && exists(id));
      setView(i < 0 ? { kind: "board" } : { ...view, i });
    }
  }, [board, view]);

  async function run(f: () => Promise<unknown>) {
    setBusy(true);
    try {
      await f();
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  if (!local) return null;
  const top = (
    <>
      <Link href="/" className="text-sm font-medium">
        Modulo Maxx
      </Link>
      {code && (
        <Link href="/board/" className="text-sm text-muted">
          All boards
        </Link>
      )}
    </>
  );
  const errorBox = error && (
    <div className="mt-4 rounded-xl border border-line px-4 py-3 text-sm">
      {error.setup ? (
        <>
          <p className="font-medium">The database isn&apos;t connected yet.</p>
          <p className="mt-1 text-muted">
            In Vercel: project → Storage → Create database → Upstash for Redis → connect it to this project, then redeploy.
          </p>
        </>
      ) : (
        error.message
      )}
    </div>
  );

  if (!code) return <Home local={local} setLocal={setLocal} top={top} errorBox={errorBox} run={run} busy={busy} go={(id) => router.push(`/board/?g=${id}`)} />;

  if (!board)
    return (
      <Screen top={top}>
        {errorBox ?? <p className="text-muted">Loading board…</p>}
        {error?.status === 404 && (
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setLocal((s) => forgetBoard(s, code));
              router.push("/board/");
            }}
          >
            Remove from my boards
          </Button>
        )}
      </Screen>
    );

  const admin = local.boards.find((b) => b.id === board.id)?.adminToken;
  const canDelete = (p: BoardPost) => local.owned[p.id] ?? admin;
  const mineRating = (p: BoardPost) => p.ratings.find((r) => r.mine);
  const canSee = (p: BoardPost) => p.mine || !!mineRating(p);
  const toRate = board.posts.filter((p) => !p.mine && !mineRating(p));
  const needName = !board.anon && !local.name.trim();

  if (view.kind === "post")
    return (
      <PostForm
        top={top}
        errorBox={errorBox}
        busy={busy}
        defaultName={local.name}
        onCancel={() => setView({ kind: "board" })}
        onPost={(name, photo) =>
          run(async () => {
            const { postId, ownerToken } = await api.post(board.id, name, photo, local.voter);
            setLocal((s) => ({ ...s, name: s.name || name, owned: { ...s.owned, [postId]: ownerToken } }));
            await refresh();
            setView({ kind: "board" });
          })
        }
      />
    );

  if (view.kind === "round") {
    const p = board.posts.find((x) => x.id === view.queue[view.i]);
    const next = () => {
      if (view.i + 1 < view.queue.length) return setView({ ...view, i: view.i + 1 });
      void refresh();
      setView({ kind: "board" });
    };
    if (!p) return null;
    return (
      <RateScreen
        key={p.id}
        top={top}
        errorBox={errorBox}
        board={board}
        post={p}
        progress={`${view.i + 1} of ${view.queue.length}`}
        busy={busy}
        onSkip={next}
        onStop={() => {
          void refresh();
          setView({ kind: "board" });
        }}
        onRate={(score) =>
          run(async () => {
            await api.rate(board.id, p.id, local.voter, score, board.anon ? undefined : local.name);
            next();
          })
        }
      />
    );
  }

  if (view.kind === "detail") {
    const p = board.posts.find((x) => x.id === view.id);
    if (!p) return null;
    return (
      <Detail
        top={top}
        errorBox={errorBox}
        board={board}
        post={p}
        busy={busy}
        visible={canSee(p)}
        needName={needName}
        deleteToken={canDelete(p)}
        onBack={() => setView({ kind: "board" })}
        onRate={(score) =>
          run(async () => {
            await api.rate(board.id, p.id, local.voter, score, board.anon ? undefined : local.name);
            await refresh();
          })
        }
        onUnrate={() =>
          run(async () => {
            await api.unrate(board.id, p.id, local.voter);
            await refresh();
          })
        }
        onDelete={(token) =>
          run(async () => {
            if (!confirm(`Delete ${p.name}'s post and all its ratings?`)) return;
            await api.removePost(board.id, p.id, token);
            setLocal((s) => {
              const owned = { ...s.owned };
              delete owned[p.id];
              return { ...s, owned };
            });
            await refresh();
            setView({ kind: "board" });
          })
        }
        nameField={<NameField local={local} setLocal={setLocal} />}
      />
    );
  }

  if (view.kind === "settings")
    return (
      <Screen top={top}>
        <h1 className="text-3xl font-semibold tracking-tight">Board settings</h1>
        {errorBox}
        {admin ? (
          <div className="mt-6 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted">Who rated</span>
              <SegmentedToggle
                label="Who rated"
                value={board.anon ? "anon" : "named"}
                onChange={(v) =>
                  run(async () => {
                    await api.update(board.id, admin, { anon: v === "anon" });
                    await refresh();
                  })
                }
                options={[
                  { value: "named", label: "Show names" },
                  { value: "anon", label: "Anonymous" },
                ]}
              />
              <span className="text-sm text-muted">
                {board.anon
                  ? "Nobody enters a name to rate, and no names are shown."
                  : "Raters enter their name once, and everyone sees who gave which rating."}
              </span>
            </div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (!confirm(`Delete "${board.name}" with every post, photo and rating? This can't be undone.`)) return;
                  await api.remove(board.id, admin);
                  setLocal((s) => forgetBoard(s, board.id));
                  router.push("/board/");
                })
              }
            >
              Delete board for everyone
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-muted">Only the person who made this board can change its settings.</p>
        )}
        <Button
          variant="text"
          className="mt-8 self-start"
          onClick={() => {
            setLocal((s) => forgetBoard(s, board.id));
            router.push("/board/");
          }}
        >
          Remove from my boards (this phone only)
        </Button>
        <Button variant="text" className="mt-4 self-start" onClick={() => setView({ kind: "board" })}>
          ← Back
        </Button>
      </Screen>
    );

  // Board
  const ranked = board.posts
    .map((p) => ({ p, s: stats(p.ratings), see: canSee(p) }))
    .sort((a, b) => Number(b.see) - Number(a.see) || b.s.mean - a.s.mean || a.p.createdAt - b.p.createdAt);
  const posted = board.posts.some((p) => p.mine);
  return (
    <Screen
      top={
        <>
          <Link href="/" className="text-sm font-medium">
            Modulo Maxx
          </Link>
          <div className="flex gap-4">
            <Button variant="text" onClick={() => setView({ kind: "settings" })}>
              Settings
            </Button>
            <Link href="/board/" className="text-sm text-muted">
              All boards
            </Link>
          </div>
        </>
      }
    >
      <h1 className="text-4xl font-semibold tracking-tight">{board.name}</h1>
      <p className="mt-2 text-sm text-muted">
        {board.posts.length} {board.posts.length === 1 ? "person" : "people"} · {board.anon ? "anonymous ratings" : "ratings show names"} ·
        code <span className="font-mono text-fg">{board.id}</span>
      </p>
      <Invite board={board} />
      {errorBox}

      <div className="mt-6 grid gap-3">
        {toRate.length > 0 && (
          <div className="grid gap-3">
            {needName && <NameField local={local} setLocal={setLocal} />}
            <Button disabled={needName} onClick={() => setView({ kind: "round", queue: toRate.map((p) => p.id), i: 0 })}>
              Rate {toRate.length === 1 ? "1 person" : `${toRate.length} people`}
            </Button>
          </div>
        )}
        <Button variant={toRate.length ? "outline" : "primary"} onClick={() => setView({ kind: "post" })}>
          {posted ? "Post someone else" : "Post yourself"}
        </Button>
      </div>

      {board.posts.length === 0 ? (
        <p className="mt-8 text-muted">Nobody here yet. Post yourself, then send the invite link to your friends.</p>
      ) : (
        <ol className="mt-8 flex flex-col gap-2">
          {ranked.map(({ p, s, see }) => (
            <li key={p.id} className="border-b border-line pb-2">
              <button type="button" onClick={() => setView({ kind: "detail", id: p.id })} className="flex w-full items-center gap-3 text-left active:opacity-60">
                <div className="w-12 shrink-0">
                  <Face board={board.id} post={p} className="rounded-lg !text-base" />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block text-xs text-muted">
                    {p.mine ? "your post · " : ""}
                    {s.n} {s.n === 1 ? "rating" : "ratings"}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {see ? (
                    <span className="text-2xl font-semibold">{s.n ? fmt(s.mean) : "–"}</span>
                  ) : (
                    <span className="text-sm text-muted">rate to see</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-6 text-xs text-muted">
        Scores are 1 to 10 on the same scale as the celeb ratings. You see someone&apos;s score once you&apos;ve rated them, so
        nobody just copies the crowd.
      </p>
    </Screen>
  );
}

function NameField({ local, setLocal }: { local: BoardLocal; setLocal: (f: (s: BoardLocal) => BoardLocal) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-muted">Your name (shown next to your ratings)</span>
      <input
        className={inputCls}
        value={local.name}
        maxLength={NAME_MAX}
        placeholder="Your name"
        onChange={(e) => setLocal((s) => ({ ...s, name: e.target.value }))}
      />
    </label>
  );
}

function Invite({ board }: { board: BoardView }) {
  const [msg, setMsg] = useState("");
  async function share() {
    const url = `${window.location.origin}/board/?g=${board.id}`;
    try {
      if (navigator.share) await navigator.share({ title: board.name, text: `Rate us on "${board.name}"`, url });
      else {
        await navigator.clipboard.writeText(url);
        setMsg("Link copied");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setMsg("Link copied");
      } catch {
        setMsg(url);
      }
    }
    setTimeout(() => setMsg(""), 3000);
  }
  return (
    <button type="button" onClick={share} className="mt-3 text-sm text-accent underline-offset-4 hover:underline">
      {msg || "Invite friends →"}
    </button>
  );
}

function Home({
  local,
  setLocal,
  top,
  errorBox,
  run,
  busy,
  go,
}: {
  local: BoardLocal;
  setLocal: (f: (s: BoardLocal) => BoardLocal) => void;
  top: ReactNode;
  errorBox: ReactNode;
  run: (f: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
  go: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [anon, setAnon] = useState(false);
  const [join, setJoin] = useState("");
  const joinCode = parseCode(join);
  return (
    <Screen top={top}>
      <h1 className="text-4xl font-semibold tracking-tight">Group board</h1>
      <p className="mt-3 text-muted">
        Make a board for your group. Everyone posts themselves, with a photo if they like, and rates the others from 1 to 10. Scores are
        public to the group.
      </p>
      {errorBox}

      {local.boards.length > 0 && (
        <div className="mt-8">
          <p className="mb-2 text-sm text-muted">Your boards</p>
          <div className="flex flex-col gap-2">
            {local.boards.map((b) => (
              <button key={b.id} type="button" onClick={() => go(b.id)} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-left">
                <span className="font-medium">{b.name}</span>
                <span className="text-xs text-muted">{b.adminToken ? "yours" : b.id}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6">
        <p className="font-medium">New board</p>
        <input className={inputCls} placeholder="Name, e.g. The boys" value={name} maxLength={BOARD_NAME_MAX} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--accent)]" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
          <span>
            <span className="block font-medium">Anonymous ratings</span>
            <span className="block text-sm text-muted">Nobody enters a name to rate. You can change this later.</span>
          </span>
        </label>
        <Button
          disabled={!name.trim() || busy}
          onClick={() =>
            run(async () => {
              const { id, adminToken } = await api.create(name, anon);
              setLocal((s) => rememberBoard(s, { id, name: name.trim(), adminToken }));
              go(id);
            })
          }
        >
          Make board
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6">
        <p className="font-medium">Join a board</p>
        <div className="flex gap-3">
          <input className={inputCls} placeholder="Code or link" value={join} onChange={(e) => setJoin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && joinCode && go(joinCode)} />
          <Button className="!h-12 !w-auto shrink-0 px-6" disabled={!joinCode} onClick={() => joinCode && go(joinCode)}>
            Open
          </Button>
        </div>
      </div>
    </Screen>
  );
}

function PostForm({
  top,
  errorBox,
  busy,
  defaultName,
  onCancel,
  onPost,
}: {
  top: ReactNode;
  errorBox: ReactNode;
  busy: boolean;
  defaultName: string;
  onCancel: () => void;
  onPost: (name: string, photo: string | null) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  async function pick(file?: File) {
    if (!file) return;
    try {
      setPhoto(await downscale(file, 560, 0.82));
      setPhotoError("");
    } catch {
      setPhotoError("Couldn't read that image. Try another one.");
    }
  }
  return (
    <Screen top={top}>
      <h1 className="text-3xl font-semibold tracking-tight">Post</h1>
      <p className="mt-2 text-muted">Only post yourself, or someone who&apos;s fine with it. You can delete the post any time.</p>
      {errorBox}
      <div className="mt-6 flex flex-col gap-4">
        <input className={inputCls} placeholder="Name" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
        <button type="button" onClick={() => fileRef.current?.click()} className="mx-auto w-48">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="aspect-[4/5] w-full rounded-xl object-cover object-[50%_25%]" />
          ) : (
            <span className="flex aspect-[4/5] w-full items-center justify-center rounded-xl border border-dashed border-line px-4 text-center text-muted">
              Add a photo (optional)
            </span>
          )}
        </button>
        {photo && (
          <Button variant="text" className="self-center" onClick={() => setPhoto(null)}>
            Remove photo
          </Button>
        )}
        {photoError && <p className="text-center text-sm">{photoError}</p>}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <p className="text-center text-xs text-muted">A clear, front-on photo of the face rates fairest. It&apos;s shrunk on your phone before upload.</p>
      </div>
      <div className="mt-auto grid gap-3 pt-6">
        <Button disabled={!name.trim() || busy} onClick={() => onPost(name.trim(), photo)}>
          {busy ? "Posting…" : "Post"}
        </Button>
        <Button variant="text" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Screen>
  );
}

function RateScreen({
  top,
  errorBox,
  board,
  post,
  progress,
  busy,
  onRate,
  onSkip,
  onStop,
}: {
  top: ReactNode;
  errorBox: ReactNode;
  board: BoardView;
  post: BoardPost;
  progress: string;
  busy: boolean;
  onRate: (score: number) => void;
  onSkip: () => void;
  onStop: () => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  return (
    <Screen top={top}>
      <div className="flex justify-between text-xs text-muted">
        <span>{board.name}</span>
        <span>{progress}</span>
      </div>
      <div className="fade-in mx-auto mt-4 w-full max-w-[18rem]">
        <Face board={board.id} post={post} />
      </div>
      <p className="mt-3 text-center text-2xl font-semibold">{post.name}</p>
      {errorBox}
      <div className="mt-6">
        <ScorePicker value={score} onChange={setScore} />
      </div>
      <div className="mt-auto grid gap-3 pt-6">
        <Button disabled={score === null || busy} onClick={() => score !== null && onRate(score)}>
          {score === null ? "Slide to rate" : `Rate ${fmt(score)}`}
        </Button>
        <div className="flex justify-between">
          <Button variant="text" onClick={onStop}>
            Stop
          </Button>
          <Button variant="text" onClick={onSkip}>
            Skip →
          </Button>
        </div>
      </div>
    </Screen>
  );
}

function Detail({
  top,
  errorBox,
  board,
  post,
  busy,
  visible,
  needName,
  deleteToken,
  nameField,
  onBack,
  onRate,
  onUnrate,
  onDelete,
}: {
  top: ReactNode;
  errorBox: ReactNode;
  board: BoardView;
  post: BoardPost;
  busy: boolean;
  visible: boolean;
  needName: boolean;
  deleteToken?: string;
  nameField: ReactNode;
  onBack: () => void;
  onRate: (score: number) => void;
  onUnrate: () => void;
  onDelete: (token: string) => void;
}) {
  const mine = post.ratings.find((r) => r.mine);
  const [score, setScore] = useState<number | null>(mine?.score ?? null);
  const [editing, setEditing] = useState(!mine && !post.mine);
  const s = useMemo(() => stats(post.ratings), [post.ratings]);
  useEffect(() => {
    if (mine) setEditing(false);
  }, [mine]);
  return (
    <Screen top={top}>
      <Button variant="text" className="self-start" onClick={onBack}>
        ← {board.name}
      </Button>
      <div className="mx-auto mt-4 w-full max-w-[16rem]">
        <Face board={board.id} post={post} />
      </div>
      <p className="mt-3 text-center text-2xl font-semibold">{post.name}</p>
      {errorBox}

      {visible ? (
        <div className="mt-6">
          <div className="flex items-end justify-between">
            <span className="text-6xl font-semibold tabular-nums leading-none">{s.n ? fmt(s.mean) : "–"}</span>
            <span className="text-right text-sm text-muted">
              {s.n} {s.n === 1 ? "rating" : "ratings"}
              {s.n > 1 && (
                <>
                  <br />
                  median {fmt(s.median)}
                </>
              )}
            </span>
          </div>
          {s.n > 0 && (
            <>
              <p className="mt-2 text-sm text-muted">about like {anchorFor(s.mean).name}</p>
              <div className="mt-4">
                <Histogram hist={s.hist} />
              </div>
              <ul className="mt-4 flex flex-col gap-1 text-sm">
                {[...post.ratings].reverse().map((r, i) => (
                  <li key={i} className="flex justify-between border-b border-line py-1">
                    <span className={r.mine ? "font-medium" : "text-muted"}>{r.mine ? "You" : (r.name ?? "Anonymous")}</span>
                    <span className="tabular-nums">{fmt(r.score)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <p className="mt-6 text-center text-muted">Rate {post.name} to see what everyone else gave.</p>
      )}

      {!post.mine && (
        <div className="mt-8 border-t border-line pt-6">
          {editing ? (
            <div className="grid gap-4">
              {needName && nameField}
              <ScorePicker value={score} onChange={setScore} />
              <Button disabled={score === null || busy || needName} onClick={() => score !== null && onRate(score)}>
                {score === null ? "Slide to rate" : `Rate ${fmt(score)}`}
              </Button>
              {mine && (
                <Button variant="text" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          ) : (
            mine && (
              <div className="flex items-center justify-between">
                <span>
                  You gave <span className="font-semibold">{fmt(mine.score)}</span>
                </span>
                <span className="flex gap-4">
                  <Button variant="text" onClick={() => setEditing(true)}>
                    Change
                  </Button>
                  <Button variant="text" disabled={busy} onClick={onUnrate}>
                    Remove
                  </Button>
                </span>
              </div>
            )
          )}
        </div>
      )}

      {deleteToken && (
        <Button variant="text" className="mt-10 self-center" disabled={busy} onClick={() => onDelete(deleteToken)}>
          Delete this post
        </Button>
      )}
    </Screen>
  );
}
