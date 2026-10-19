import type { BankCeleb } from "@/lib/bank";

export function CelebPhoto({ celeb, className = "" }: { celeb: BankCeleb; className?: string }) {
  if (celeb.image) {
    return (
      // Static export: plain <img>, the files are already resized to 600px.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/celebs/${celeb.image.file}`}
        alt={celeb.name}
        className={`aspect-[4/5] w-full rounded-xl bg-line object-cover object-[50%_25%] ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex aspect-[4/5] w-full items-center justify-center rounded-xl bg-line p-6 text-center text-3xl font-semibold ${className}`}
    >
      {celeb.name}
    </div>
  );
}
