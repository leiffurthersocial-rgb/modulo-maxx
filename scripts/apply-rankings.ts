// Fold Celebrity ranker exports into data/celebs.json.
//
//   npm run rankings              # preview the changes from new files in data/rankings/
//   npm run rankings -- --apply   # write them to data/celebs.json, move the files to data/rankings/applied/
//   npm run rankings -- --prior 0.6
//
// Ratings in data/rating-locks.json are set by hand and never moved by picks.
//
// Each export (the JSON from "Download results file" or "Copy results") goes in data/rankings/.
// Only files not yet applied are fitted, against the current ratings, so repeated sessions add up
// without counting the same picks twice. The prior is tighter than in the app's live view
// (default 0.7 rating points), because one person's taste over a few picks per celeb shouldn't move
// a rating by more than a point or so; more people and more picks move it further.

import fs from "node:fs";
import path from "node:path";
import { fit, type RankVote } from "../src/lib/ranker";
import { slugify } from "../src/lib/slug";
import type { BankCeleb } from "../src/lib/bank";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIR = path.join(ROOT, "data/rankings");
const APPLIED = path.join(DIR, "applied");
const CELEBS = path.join(ROOT, "data/celebs.json");

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const prior = Number(argv[argv.indexOf("--prior") + 1]) || 0.7;
/** Changes smaller than this are left alone (noise). */
const MIN_CHANGE = 0.2;

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")) : [];
if (!files.length) {
  console.log("No new exports in data/rankings/.");
  process.exit(0);
}
const votes: RankVote[] = files.flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).votes ?? []);
const raters = new Set(votes.map((v) => v.rater));

const data = JSON.parse(fs.readFileSync(CELEBS, "utf8")) as { celebs: { name: string; rating: number; category: string }[] };
const pool: BankCeleb[] = data.celebs.map((c) => ({ ...c, id: slugify(c.name) }));
const known = new Set(pool.map((c) => c.id));
const unknown = [...new Set(votes.flatMap((v) => [v.a, v.b]).filter((id) => !known.has(id)))];
if (unknown.length) console.log(`Ignoring picks for unknown ids: ${unknown.join(", ")}`);

// Hand-set ratings (data/rating-locks.json) are applied as-is and never moved by picks.
const LOCKS = path.join(ROOT, "data/rating-locks.json");
const locks: Record<string, number> = fs.existsSync(LOCKS) ? JSON.parse(fs.readFileSync(LOCKS, "utf8")).locks ?? {} : {};

const changes = fit(votes, pool, prior)
  .filter((f) => f.comparisons > 0 && !(f.celeb.name in locks) && Math.abs(f.rating - f.old) >= MIN_CHANGE - 1e-9)
  .sort((a, b) => b.rating - b.old - (a.rating - a.old));

console.log(`${votes.length} picks by ${raters.size} ${raters.size === 1 ? "person" : "people"} from ${files.length} file(s), prior ±${prior}`);
console.log(`${changes.length} ratings change by ${MIN_CHANGE} or more:\n`);
for (const c of changes) {
  const d = c.rating - c.old;
  console.log(`  ${(d > 0 ? "+" : "") + d.toFixed(1)}  ${c.old.toFixed(1)} → ${c.rating.toFixed(1)}  ${c.celeb.name} (${c.comparisons} picks)`);
}

if (apply) {
  const next = new Map(changes.map((c) => [c.celeb.name, c.rating]));
  for (const c of data.celebs) if (next.has(c.name)) c.rating = next.get(c.name)!;
  for (const c of data.celebs) if (c.name in locks) c.rating = locks[c.name];
  data.celebs.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  fs.writeFileSync(CELEBS, JSON.stringify(data, null, 1) + "\n");
  fs.mkdirSync(APPLIED, { recursive: true });
  for (const f of files) fs.renameSync(path.join(DIR, f), path.join(APPLIED, f));
  console.log(`\nApplied to data/celebs.json; moved ${files.length} file(s) to data/rankings/applied/.`);
} else {
  console.log("\nPreview only. Run with --apply to write data/celebs.json.");
}
