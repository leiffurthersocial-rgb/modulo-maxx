// Fold Celebrity ranker exports into data/celebs.json.
//
//   npm run rankings              # preview: what changes in data/celebs.json
//   npm run rankings -- --apply   # write data/celebs.json, move new files to data/rankings/applied/
//   npm run rankings -- --prior 0.6
//
// Each export (the JSON from "Download results file" or "Copy results") goes in data/rankings/.
// Every session (new and already applied) is fitted together against the starting ratings in
// data/ratings-baseline.json, so the prior counts once rather than once per session and ratings
// don't drift further than the picks support. The prior is tighter than in the app's live view
// (default 0.7 rating points): one person's taste shouldn't move a rating by more than a point
// or so; more people and more picks move it further.
//
// To set a rating by hand, change it in data/ratings-baseline.json; picks still move it from there.

import fs from "node:fs";
import path from "node:path";
import { fit, type RankVote } from "../src/lib/ranker";
import { slugify } from "../src/lib/slug";
import type { BankCeleb } from "../src/lib/bank";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIR = path.join(ROOT, "data/rankings");
const APPLIED = path.join(DIR, "applied");
const CELEBS = path.join(ROOT, "data/celebs.json");
const BASELINE = path.join(ROOT, "data/ratings-baseline.json");

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const prior = Number(argv[argv.indexOf("--prior") + 1]) || 0.7;
/** Changes from the baseline smaller than this are left out (noise). */
const MIN_CHANGE = 0.2;

const list = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : []);
const fresh = list(DIR);
const files = [...list(APPLIED).map((f) => path.join(APPLIED, f)), ...fresh.map((f) => path.join(DIR, f))];
const votes: RankVote[] = files.flatMap((f) => JSON.parse(fs.readFileSync(f, "utf8")).votes ?? []);
const raters = new Set(votes.map((v) => v.rater));

const data = JSON.parse(fs.readFileSync(CELEBS, "utf8")) as { celebs: { name: string; rating: number; category: string }[] };
const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8")) as { note: string; ratings: Record<string, number> };
// Celebs added since the baseline was made start from their current rating.
for (const c of data.celebs) baseline.ratings[c.name] ??= c.rating;
const pool: BankCeleb[] = data.celebs.map((c) => ({ ...c, rating: baseline.ratings[c.name], id: slugify(c.name) }));
const known = new Set(pool.map((c) => c.id));
const unknown = [...new Set(votes.flatMap((v) => [v.a, v.b]).filter((id) => !known.has(id)))];
if (unknown.length) console.log(`Ignoring picks for unknown ids: ${unknown.join(", ")}`);

const current = new Map(data.celebs.map((c) => [c.name, c.rating]));
const next = new Map<string, number>();
for (const f of fit(votes, pool, prior)) {
  const moved = f.comparisons > 0 && Math.abs(f.rating - f.old) >= MIN_CHANGE - 1e-9;
  next.set(f.celeb.name, moved ? f.rating : f.old);
}
const changes = [...next]
  .map(([name, rating]) => ({ name, rating, was: current.get(name)! }))
  .filter((c) => Math.abs(c.rating - c.was) > 1e-9)
  .sort((a, b) => b.rating - b.was - (a.rating - a.was));

console.log(`${votes.length} picks by ${raters.size} ${raters.size === 1 ? "person" : "people"} from ${files.length} file(s) (${fresh.length} new), prior ±${prior}`);
console.log(`${changes.length} ratings change from the current data/celebs.json:\n`);
for (const c of changes) {
  const d = c.rating - c.was;
  console.log(`  ${(d > 0 ? "+" : "") + d.toFixed(1)}  ${c.was.toFixed(1)} → ${c.rating.toFixed(1)}  ${c.name}`);
}

if (apply) {
  for (const c of data.celebs) c.rating = next.get(c.name)!;
  data.celebs.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
  fs.writeFileSync(CELEBS, JSON.stringify(data, null, 1) + "\n");
  fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 1) + "\n");
  fs.mkdirSync(APPLIED, { recursive: true });
  for (const f of fresh) fs.renameSync(path.join(DIR, f), path.join(APPLIED, f));
  console.log(`\nApplied to data/celebs.json; moved ${fresh.length} file(s) to data/rankings/applied/.`);
} else {
  console.log("\nPreview only. Run with --apply to write data/celebs.json.");
}
