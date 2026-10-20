// Build data/bank.json, the rating bank the app reads: every celeb in data/celebs.json that has
// a usable photo in data/celeb-images.json. data/celebs.json itself is never edited, so a celeb
// that later gets a photo comes back on the next build.
//
//   npm run bank
//
// Prints the bank's size, mean, SD and a histogram per integer rating bucket, and warns when
// dropping celebs thinned out the low end or any bucket from 3 to 8 too much.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { slugify } from "../src/lib/slug";

const ROOT = path.resolve(import.meta.dirname, "..");

export interface SourceCeleb {
  name: string;
  rating: number;
  category: string;
}

export interface BankStats {
  size: number;
  mean: number;
  sd: number;
  histogram: Record<number, number>;
}

export function stats(celebs: { rating: number }[]): BankStats {
  const n = celebs.length;
  const mean = n ? celebs.reduce((s, c) => s + c.rating, 0) / n : 0;
  const sd = n ? Math.sqrt(celebs.reduce((s, c) => s + (c.rating - mean) ** 2, 0) / n) : 0;
  const histogram: Record<number, number> = {};
  for (let b = 0; b <= 9; b++) histogram[b] = 0;
  for (const c of celebs) histogram[Math.min(9, Math.floor(c.rating))]++;
  return { size: n, mean, sd, histogram };
}

/** Celebs to include: those with an image, or everyone before any images have been fetched. */
export function selectBank<T extends SourceCeleb>(celebs: T[], images: Record<string, unknown>): T[] {
  if (Object.keys(images).length === 0) return celebs;
  return celebs.filter((c) => images[slugify(c.name)]);
}

export interface ShapeWarning {
  bucket: string;
  before: number;
  after: number;
  missing: string[];
}

/** Low end (< 4) under 25 people, or a 3..8 bucket that lost more than 30% of its people. */
export function shapeWarnings(all: SourceCeleb[], bank: SourceCeleb[]): ShapeWarning[] {
  const kept = new Set(bank.map((c) => c.name));
  const out: ShapeWarning[] = [];
  const check = (label: string, inBucket: (r: number) => boolean, bad: (before: number, after: number) => boolean) => {
    const before = all.filter((c) => inBucket(c.rating));
    const after = before.filter((c) => kept.has(c.name));
    if (bad(before.length, after.length)) {
      out.push({ bucket: label, before: before.length, after: after.length, missing: before.filter((c) => !kept.has(c.name)).map((c) => c.name) });
    }
  };
  check("< 4", (r) => r < 4, (_, a) => a < 25);
  for (let b = 3; b <= 8; b++) check(`${b}.x`, (r) => Math.floor(r) === b, (bf, a) => bf > 0 && (bf - a) / bf > 0.3);
  return out;
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeBank({ quiet = false } = {}): { all: SourceCeleb[]; bank: SourceCeleb[] } {
  const all = readJson<{ celebs: SourceCeleb[] }>("data/celebs.json", { celebs: [] }).celebs;
  const images = readJson<Record<string, unknown>>("data/celeb-images.json", {});
  const bank = selectBank(all, images).map((c) => ({ name: c.name, rating: c.rating, category: c.category }));
  fs.writeFileSync(
    path.join(ROOT, "data/bank.json"),
    JSON.stringify(
      {
        note: "GENERATED, do not edit: change ratings in data/celebs.json instead. Rebuilt automatically before every build and test.",
        celebs: bank,
      },
      null,
      1,
    ) + "\n",
  );
  if (!quiet) printStats(all, bank);
  return { all, bank };
}

function printStats(all: SourceCeleb[], bank: SourceCeleb[]) {
  const a = stats(all);
  const b = stats(bank);
  console.log(`\nBank: ${b.size} of ${a.size} celebs`);
  console.log(`Mean ${b.mean.toFixed(2)} (was ${a.mean.toFixed(2)}), SD ${b.sd.toFixed(2)} (was ${a.sd.toFixed(2)})`);
  for (let k = 0; k <= 9; k++) {
    if (!a.histogram[k]) continue;
    console.log(`  ${k}.x ${String(b.histogram[k]).padStart(3)} / ${String(a.histogram[k]).padEnd(3)} ${"#".repeat(b.histogram[k])}`);
  }
  const warnings = shapeWarnings(all, bank);
  for (const w of warnings) {
    console.log(`WARNING: bucket ${w.bucket} has ${w.after} (was ${w.before}). Missing: ${w.missing.join(", ")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeBank();
}
