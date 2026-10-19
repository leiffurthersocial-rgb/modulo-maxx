# Modulo Maxx: build plan

A static Next.js app (TypeScript, Tailwind, `output: 'export'`). No backend, accounts or analytics.

## Steps (one commit each, roughly)

1. **Scaffold**: Next.js App Router, Tailwind, vitest, static export config, base theme
   (off-white/black, one accent, Inter/system font, dark mode via `prefers-color-scheme`).
2. **Data pass**: light edits to `data/celebs.json` (
   spread out the 7.0 clump, `coach` category).
3. **Engine** (`src/lib/engine.ts`): grid posterior over theta in [0,10] (step 0.05) and rater
   noise s in {0.3, 0.5, 0.8, 1.2}. Ordered-logit likelihood for More / About equal / Less.
   Next question by expected information gain, probes every 4th question, stopping rule,
   below/above-the-bank detection. Takes votes per rater, so more raters is a small change.
   Vitest simulations cover convergence and noisy raters.
4. **Scoring** (`src/lib/scoring.ts`, `src/lib/builds.ts`): height, body (BMI + build slider),
   overall with flaw penalty, Monte Carlo range, population percentile.
5. **Image pipeline**: `scripts/fetch-images.ts` (Wikipedia + Commons APIs, free licenses only,
   photo era matching the rating, >= 400px, idempotent, `--only`, overrides, failure report), and
   `scripts/contact-sheet.ts`, which generates `scripts/contact-sheet.html`.
6. **UI flow**: Landing, Subject, Handoff, Rating, Results. State in localStorage, Start over.
7. **Results extras**: celeb match, strongest and weakest attribute, copy text, save as PNG (canvas).
8. **/credits** page.
9. **README** and a final check (typecheck, tests, `next build`).

## Decisions

- If `data/celeb-images.json` is empty (images not fetched yet), the app uses the full bank and
  shows a name card instead of a photo. Once images exist, celebs without one are dropped.
- The 3-outcome likelihood is an ordered logit: P(more) = sigmoid((theta - r - d)/s),
  P(less) = sigmoid((r - theta - d)/s), and "about equal" gets the rest, so it peaks at theta = r.
  A small lapse rate absorbs accidental taps.
