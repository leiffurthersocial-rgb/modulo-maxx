# Modulo Maxx

A for-fun, non-commercial attractiveness calculator for guys. A friend compares the subject's face to
celebrity photos (More / About equal / Less), and the app combines that with height and build into an
overall score. It's a static site with no backend, no accounts and no analytics. For fun, not science

## Setup

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest: engine simulations, scoring, image helpers
npm run typecheck
npm run build        # static export to out/
```

**Deploying on Vercel:** import the repo and keep the defaults. `next.config.ts` sets `output: 'export'`, and
Vercel serves `out/`. Any static host works the same way (`npx serve out`).

## Celeb photos

```bash
npm run images                          # fetch every missing image (idempotent, safe to re-run)
npm run images -- --only "Ryan Gosling" # (re)fetch one or more celebs, comma-separated
npm run images -- --force               # refetch everyone
npm run contact-sheet                   # rebuild scripts/contact-sheet.html
```

`scripts/fetch-images.ts` looks up each celeb's Wikipedia article image, the files used on the article,
a Commons search, and the Commons category. It keeps only candidates that are:

- under a free license (CC0, CC BY, CC BY-SA, public domain; no NC, ND or fair use)
- at least 400 px on both sides
- not drawings, caricatures or statues

It then ranks them with heuristics: the article's lead image, "cropped" in the title, portrait aspect
ratio, and no other names or "and"/"with" in the title.

Photos don't need to be recent. They should show the celeb **the way their rating assumes**, which for
older celebs usually means their prime. Set an era per celeb with `"years"` in
`data/image-overrides.json`; photos taken in that range win. Eras are pre-filled for older celebs. The winner is resized to 600 px wide and
saved as `public/celebs/<slug>.jpg`. Its author, license and source go into `data/celeb-images.json`,
which feeds `/credits`.

Celebs with no usable image are left out of `celeb-images.json`, and the app drops them from the bank.
`data/celebs.json` itself is never edited, so a later run can pick them up. Failures are listed in
`scripts/out/image-report.md`.

**Spot-checking.** Open `scripts/contact-sheet.html` in a browser. Each card shows the chosen photo next to
the celeb's rating and era, plus the next-best candidates. Check that the photo looks like the rating. "Use this" or "Reject current" copies a line for `data/image-overrides.json`:

```json
{
  "Ryan Gosling": "File:Ryan Gosling in 2018.jpg",
  "Drake": { "reject": ["File:Drake at some event.jpg"] },
  "George Clooney": { "years": [2005, 2014] },
  "Someone": { "drop": true }
}
```

Then run `npm run images -- --only "Ryan Gosling"`. A pinned file still has to have a free license
and be at least 400 px.

Until images are fetched (`celeb-images.json` is `{}`), the app uses the whole bank and shows a name card
in place of each photo.

## Tuning

| What | Where |
|---|---|
| Celeb ratings and categories | `data/celebs.json` (0-10, population mean 5.5, SD 1.5) |
| Weights (face 0.6, height 0.2, body 0.2), flaw penalty, height curve, body/BMI curve, population for percentiles | `SCORING` in `src/lib/scoring.ts` |
| Build steps (labels, muscularity `value`) | `BUILDS` in `src/lib/builds.ts`. Swap labels for pictures without touching the logic. |
| Prior, noise grid, "about equal" band, stopping rule, probe spacing, question cap | `ENGINE` in `src/lib/engine.ts` |
| Result copy per score range | `verdict()` in `src/lib/results.ts` |

**Editing ratings by hand:** change the `rating` in `data/celebs.json` (on GitHub's web editor is fine) and
commit. Don't edit `data/bank.json`: it's regenerated from `celebs.json` + `celeb-images.json` before every
build and test (`prebuild` / `pretest`), so Vercel picks up your edit automatically.

To add celebs, append `{name, rating, category}` to `data/celebs.json` and run `npm run images`.

## How it works

**Face engine** (`src/lib/engine.ts`): a grid posterior over theta in [0, 10] (step 0.05) with a
Normal(5.5, 1.5) prior. Each rater's noise s is on the grid {0.3, 0.5, 0.8, 1.2} and is inferred jointly
with theta. Answers follow an ordered logit:

- P(more) = sigmoid((theta - r - 0.45)/s)
- P(less) = sigmoid((r - theta - 0.45)/s)
- "about equal" gets the rest, so it peaks at theta = r

A 3% lapse rate absorbs mis-taps.

- The next celeb is the one with the highest expected information gain about theta. Repeated categories
  get a small penalty, and the pick is random among near-ties.
- Every 4th question is a probe 1.5-2 posterior SDs from the estimate. Contradictions push s up, so the
  posterior stays wide and the engine keeps asking.
- It stops when SD < 0.3 after at least 12 questions, or at 30. "Keep going" adds 8 more.
- If most of the posterior sits beyond the bank's lowest or highest celeb, the result says "below/above
  the bank" with a 1.5-point-wide interval, rather than the falsely narrow prior tail.
- Votes come in per rater (`Vote[][]`), and each rater's noise is marginalised separately, so adding
  raters only needs UI work.

**Scores** (`src/lib/scoring.ts`):

- **Height** = 5.5 + 1.5z (176 cm mean, 7 cm SD, z clamped to [-3, 2.5]).
- **Body** = BMI baseline (flat 21-25), minus weight credited to muscle, plus a tone bonus from the
  build slider. The formula is in a comment above `bodyScore`.
- **Overall** = weighted mean - 0.35 * sum(w * max(0, 5 - a)^2), with the range from Monte Carlo over the
  face posterior.
- **Percentile** compares against a simulated reference population scored the same way.
