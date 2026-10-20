import type { BankCeleb } from "@/lib/bank";
import type { Answer } from "@/lib/engine";
import { CelebPhoto } from "../CelebPhoto";
import { Bar, Button, Screen } from "../ui";

export function Rating({
  celeb,
  who,
  answered,
  progress,
  onAnswer,
  onUndo,
  top,
}: {
  celeb: BankCeleb;
  who: string;
  answered: number;
  progress: number;
  onAnswer: (a: Answer) => void;
  onUndo?: () => void;
  top: React.ReactNode;
}) {
  return (
    <Screen top={top}>
      <Bar value={progress} label="Confidence" />
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>Question {answered + 1}</span>
      </div>

      {/* Key on the celeb so each new photo fades in. */}
      <div key={celeb.id} className="fade-in mt-4">
        <CelebPhoto celeb={celeb} className="max-h-[46dvh]" />
        {celeb.image && <p className="mt-2 text-center text-sm text-muted">{celeb.name}</p>}
      </div>

      <p className="mt-5 text-xl leading-snug">
        Compared to this person, is {who} more or less attractive? <span className="text-muted">Judge the face only.</span>
      </p>

      <div className="mt-auto grid gap-3 pt-6">
        <Button variant="outline" onClick={() => onAnswer("more")}>
          More
        </Button>
        <Button variant="outline" onClick={() => onAnswer("equal")}>
          About equal
        </Button>
        <Button variant="outline" onClick={() => onAnswer("less")}>
          Less
        </Button>
        <Button variant="text" onClick={onUndo} disabled={!onUndo} className="disabled:opacity-30">
          ← Back (undo last answer)
        </Button>
      </div>
    </Screen>
  );
}
