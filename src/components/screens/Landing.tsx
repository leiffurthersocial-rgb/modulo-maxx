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
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link
          href="/mog/"
          className="flex h-14 items-center justify-center rounded-xl border border-fg/80 text-lg font-medium active:bg-fg active:text-bg"
        >
          Mog battle
        </Link>
        <Link
          href="/vibe/"
          className="flex h-14 items-center justify-center rounded-xl border border-fg/80 text-lg font-medium active:bg-fg active:text-bg"
        >
          Vibe check
        </Link>
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        Mog battle: rank your group&apos;s faces head-to-head. Vibe check: find his archetype.
      </p>
      <Link href="/credits/" className="mt-6 self-center text-sm text-muted underline-offset-4 hover:underline">
        Photo credits
      </Link>
    </Screen>
  );
}
