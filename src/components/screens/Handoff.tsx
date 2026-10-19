import { Button, Screen } from "../ui";

export function Handoff({ onReady, top }: { onReady: () => void; top: React.ReactNode }) {
  return (
    <Screen top={top}>
      <div className="flex flex-1 flex-col justify-center">
        <p className="text-4xl font-semibold leading-tight tracking-tight">
          Hand the phone to someone who knows you, or have them look at you.
        </p>
      </div>
      <Button onClick={onReady}>Ready</Button>
    </Screen>
  );
}
