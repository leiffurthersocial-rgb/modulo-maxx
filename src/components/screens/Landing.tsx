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
      <Button onClick={onStart}>Start</Button>
      <Link href="/credits/" className="mt-6 self-center text-sm text-muted underline-offset-4 hover:underline">
        Photo credits
      </Link>
    </Screen>
  );
}
