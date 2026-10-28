import Link from "next/link";
import { Button, Screen } from "../ui";

export function Landing({ onStart }: { onStart: () => void }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-6xl font-semibold leading-none tracking-tight">Modulo Maxx</h1>
        <p className="mt-6 text-xl leading-snug">
          Find out how a guy stacks up, by comparing his face to famous ones, plus height and build.
        </p>
        <p className="mt-4 text-muted">For fun, not science.</p>
      </div>
      <Button onClick={onStart}>Rate a face</Button>
      <Link
        href="/mog/"
        className="mt-3 flex h-14 items-center justify-center rounded-xl border border-fg/80 text-lg font-medium active:bg-fg active:text-bg"
      >
        Mog battle
      </Link>
      <Link
        href="/board/"
        className="mt-3 flex h-14 items-center justify-center rounded-xl border border-fg/80 text-lg font-medium active:bg-fg active:text-bg"
      >
        Group board
      </Link>
      <Link
        href="/ranker/"
        className="mt-3 flex h-14 items-center justify-center rounded-xl border border-line text-lg font-medium active:bg-fg active:text-bg"
      >
        Celebrity ranker
      </Link>
      <p className="mt-3 text-center text-xs text-muted">
        Mog battle: rank your group&apos;s faces head-to-head. Group board: friends post themselves and rate each other
        online. Celebrity ranker: pick between celebs to sharpen the ratings.
      </p>
      <Link href="/credits/" className="mt-6 self-center text-sm text-muted underline-offset-4 hover:underline">
        Photo credits
      </Link>
    </Screen>
  );
}
