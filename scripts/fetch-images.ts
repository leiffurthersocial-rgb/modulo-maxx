// Fetch one free-licensed portrait per celeb from Wikipedia / Wikimedia Commons / Wikidata.
// Prefers a close-up, front-facing, single-person photo from the last 10 years. Celebs with an
// era pinned via "years" in data/image-overrides.json get a photo from that era instead.
//
//   npm run images                            # fetch everything missing (idempotent)
//   npm run images -- --only "Ryan Gosling"   # (re)fetch specific celebs, comma-separated
//   npm run images -- --force                 # refetch everyone
//
// Writes public/celebs/<slug>.jpg (600px wide), data/celeb-images.json (credits),
// scripts/fetch-report.md (failures), scripts/out/image-report.json (alternatives for the
// contact sheet), then rebuilds data/bank.json and scripts/contact-sheet.html.
// Pin, reject or drop specific files in data/image-overrides.json.
//
// Etiquette: every request sends a descriptive User-Agent, requests run one at a time with a
// ~300ms pause, and 429/5xx/network errors are retried with exponential backoff.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { slugify } from "../src/lib/slug";
import {
  normalizeOverride,
  parseArgs,
  parseYear,
  rejectReason,
  scoreCandidate,
  stripHtml,
  withFilePrefix,
  yearFromTitle,
  type Candidate,
  type Era,
  type Override,
  type Rejection,
} from "./image-utils";
import { writeContactSheet } from "./contact-sheet";
import { writeBank } from "./build-bank";

const ROOT = path.resolve(import.meta.dirname, "..");
const CELEBS = path.join(ROOT, "data/celebs.json");
const IMAGES = path.join(ROOT, "data/celeb-images.json");
const OVERRIDES = path.join(ROOT, "data/image-overrides.json");
const OUT_DIR = path.join(ROOT, "public/celebs");
const REPORT_DIR = path.join(ROOT, "scripts/out");
const REPORT_MD = path.join(ROOT, "scripts/fetch-report.md");

const WIDTH = 600;
const THUMB_WIDTH = 960;
const USER_AGENT = "ModuloMaxx/1.0 (personal non-commercial project)";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const RECENT_YEARS = 10;

// Disambiguators to try when a name lands on a disambiguation page, by bank category.
const QUALIFIERS: Record<string, string[]> = {
  actor: ["actor", "American actor", "British actor", "English actor"],
  musician: ["musician", "rapper", "singer"],
  comedian: ["comedian", "actor"],
  athlete: ["footballer", "basketball", "American football"],
  coach: ["football manager", "footballer"],
  chef: ["chef"],
  creator: ["YouTuber"],
};

interface ImageEntry {
  name: string;
  file: string;
  title: string;
  author: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  width: number;
  height: number;
  year?: number;
}

export interface ReportEntry {
  name: string;
  slug: string;
  status: "ok" | "skipped" | "failed" | "dropped";
  reason?: string;
  chosen?: string;
  article?: string;
  alternatives: { title: string; thumbUrl: string; score: number; license: string; year?: number }[];
  rejected: Partial<Record<Rejection, number>>;
}

const args = parseArgs(process.argv.slice(2));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

/** Every request goes through here: one at a time, with a pause after each, retrying 429/5xx/network errors. */
async function fetchWithRetry(url: string, tries = 6): Promise<Response> {
  let wait = 2000;
  for (let i = 0; ; i++) {
    let res: Response | undefined;
    let error: unknown;
    try {
      res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT } });
    } catch (err) {
      error = err;
    }
    await sleep(args.delayMs);
    if (res?.ok) return res;
    const retryable = !res || res.status === 429 || res.status >= 500;
    if (i >= tries - 1 || !retryable) {
      throw new Error(res ? `HTTP ${res.status} for ${url}` : `${error} for ${url}`);
    }
    const retryAfter = Number(res?.headers.get("retry-after"));
    const delay = retryAfter > 0 ? retryAfter * 1000 : wait;
    console.log(`\n  ${res ? `HTTP ${res.status}` : "network error"}, retrying in ${Math.round(delay / 1000)}s`);
    await sleep(delay);
    wait *= 2;
  }
}

async function api(base: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const res = await fetchWithRetry(`${base}?${qs}`);
  return res.json();
}

interface Article {
  title: string;
  pageImage?: string;
  images: string[];
  wikidataId?: string;
}

async function getArticle(title: string): Promise<(Article & { disambiguation: boolean }) | undefined> {
  const wiki = await api(WIKI_API, {
    action: "query",
    titles: title,
    redirects: "1",
    prop: "pageimages|images|pageprops",
    piprop: "name",
    ppprop: "disambiguation|wikibase_item",
    imlimit: "50",
  });
  const page = wiki?.query?.pages?.[0];
  if (!page || page.missing) return undefined;
  return {
    title: page.title,
    pageImage: page.pageimage ? withFilePrefix(page.pageimage) : undefined,
    images: (page.images ?? []).map((im: { title: string }) => withFilePrefix(im.title)),
    wikidataId: page.pageprops?.wikibase_item,
    disambiguation: page.pageprops?.disambiguation !== undefined,
  };
}

/** The person's English Wikipedia article, stepping past disambiguation pages. */
async function resolveArticle(name: string, category: string, wikiOverride?: string): Promise<Article | undefined> {
  const direct = await getArticle(wikiOverride ?? name);
  if (direct && !direct.disambiguation) return direct;
  for (const q of QUALIFIERS[category] ?? []) {
    const a = await getArticle(`${name} (${q})`);
    if (a && !a.disambiguation) return a;
  }
  // Fall back to a search restricted to "Name (...)" titles.
  const search = await api(WIKI_API, { action: "query", list: "search", srsearch: `intitle:"${name}" ${category}`, srlimit: "10" });
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(`, "i");
  for (const r of search?.query?.search ?? []) {
    if (!re.test(r.title)) continue;
    const a = await getArticle(r.title);
    if (a && !a.disambiguation) return a;
  }
  return undefined;
}

/** Wikidata's image (P18) and Commons category (P373). */
async function wikidata(id: string | undefined): Promise<{ image?: string; commonsCat?: string }> {
  if (!id) return {};
  const data = await api(WIKIDATA_API, { action: "wbgetentities", ids: id, props: "claims" });
  const claims = data?.entities?.[id]?.claims ?? {};
  const value = (p: string): string | undefined => claims[p]?.[0]?.mainsnak?.datavalue?.value;
  const image = value("P18");
  return { image: image ? withFilePrefix(image) : undefined, commonsCat: value("P373") };
}

async function categoryFiles(cat: string, limit = 50): Promise<string[]> {
  const data = await api(COMMONS_API, {
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:${cat}`,
    cmtype: "file",
    cmlimit: String(limit),
  });
  return (data?.query?.categorymembers ?? []).map((m: { title: string }) => withFilePrefix(m.title));
}

/**
 * Year subcategories such as "Ryan Gosling in 2023", inside the pinned era or else from the last
 * RECENT_YEARS years, newest first.
 */
async function yearCategories(cat: string, era?: Era): Promise<string[]> {
  const data = await api(COMMONS_API, {
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:${cat}`,
    cmtype: "subcat",
    cmlimit: "200",
  });
  const [from, to] = era ?? [new Date().getFullYear() - RECENT_YEARS, Infinity];
  return (data?.query?.categorymembers ?? [])
    .map((m: { title: string }) => m.title.replace(/^Category:/, ""))
    .map((t: string) => ({ t, y: Number(t.match(/\b(?:in|at|during)\s+((?:19|20)\d{2})$/)?.[1]) }))
    .filter((x: { y: number }) => x.y >= from && x.y <= to)
    .sort((a: { y: number }, b: { y: number }) => b.y - a.y)
    .map((x: { t: string }) => x.t);
}

interface Sources {
  titles: string[];
  article?: Article;
  pageImage?: string;
  wikidataImage?: string;
  commonsCat?: string;
  searchOnly: Set<string>;
}

/** Candidate file titles: the article's images, Wikidata's image, the Commons category (plus recent year subcategories) and a Commons search. */
async function candidateTitles(name: string, category: string, wikiOverride?: string, era?: Era): Promise<Sources> {
  const titles = new Set<string>();
  const article = await resolveArticle(name, category, wikiOverride);
  if (article?.pageImage) titles.add(article.pageImage);
  for (const t of article?.images ?? []) titles.add(t);

  const wd = await wikidata(article?.wikidataId);
  if (wd.image) titles.add(wd.image);
  // Only trust a bare-name category when the article title is the bare name too.
  const commonsCat = wd.commonsCat ?? (article && article.title === name ? name : undefined);

  if (commonsCat) {
    for (const t of await categoryFiles(commonsCat)) titles.add(t);
    for (const sub of (await yearCategories(commonsCat, era)).slice(0, 6)) {
      for (const t of await categoryFiles(sub, 20)) titles.add(t);
    }
  }

  const searchOnly = new Set<string>();
  const search = await api(COMMONS_API, {
    action: "query",
    list: "search",
    srsearch: `"${name}" filetype:bitmap`,
    srnamespace: "6",
    srlimit: "25",
  });
  for (const r of search?.query?.search ?? []) {
    const t = withFilePrefix(r.title);
    if (!titles.has(t)) searchOnly.add(t);
    titles.add(t);
  }

  return {
    titles: [...titles].filter((t) => /\.(jpe?g|png|webp)$/i.test(t)),
    article,
    pageImage: article?.pageImage,
    wikidataImage: wd.image,
    commonsCat,
    searchOnly,
  };
}

async function imageInfo(titles: string[], src?: Partial<Sources>): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await api(COMMONS_API, {
      action: "query",
      titles: batch.join("|"),
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata|timestamp",
      iiurlwidth: String(THUMB_WIDTH),
      iiextmetadatafilter:
        "LicenseShortName|License|LicenseUrl|Artist|Credit|DateTimeOriginal|DateTime|ImageDescription|Categories|NonFree",
    });
    for (const p of data?.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue; // not on Commons (e.g. local non-free enwiki files)
      const m = ii.extmetadata ?? {};
      if (/true/i.test(m.NonFree?.value ?? "")) continue;
      const taken = parseYear(m.DateTimeOriginal?.value);
      const titled = yearFromTitle(p.title);
      const uploaded = parseYear(ii.timestamp);
      const categories = stripHtml(m.Categories?.value);
      const inPersonCat =
        !!src?.commonsCat && categories.split("|").some((c) => c.startsWith(src.commonsCat!));
      out.push({
        title: p.title,
        width: ii.width,
        height: ii.height,
        mime: ii.mime,
        url: ii.url,
        thumbUrl: ii.width > THUMB_WIDTH ? ii.thumburl : ii.url,
        descriptionUrl: ii.descriptionurl,
        license: stripHtml(m.LicenseShortName?.value) || stripHtml(m.License?.value),
        licenseUrl: stripHtml(m.LicenseUrl?.value) || undefined,
        author: stripHtml(m.Artist?.value) || stripHtml(m.Credit?.value) || "Unknown author",
        year: taken ?? titled ?? uploaded,
        yearSource: taken ? "taken" : titled ? "title" : uploaded ? "uploaded" : "unknown",
        description: stripHtml(m.ImageDescription?.value).slice(0, 500),
        categories,
        fromPageImage: p.title === src?.pageImage,
        fromWikidata: p.title === src?.wikidataImage,
        offCategory: !!src?.searchOnly?.has(p.title) && !inPersonCat,
      });
    }
  }
  return out;
}

async function download(c: Candidate, dest: string): Promise<{ width: number; height: number }> {
  const res = await fetchWithRetry(c.thumbUrl ?? c.url);
  const buf = Buffer.from(await res.arrayBuffer());
  const info = await sharp(buf)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(dest);
  return { width: info.width, height: info.height };
}

async function processCeleb(
  name: string,
  category: string,
  override: Override | undefined,
): Promise<{ entry?: ImageEntry; report: ReportEntry }> {
  const slug = slugify(name);
  const ov = normalizeOverride(override);
  const report: ReportEntry = { name, slug, status: "failed", alternatives: [], rejected: {} };
  if (ov.drop) return { report: { ...report, status: "dropped", reason: "dropped in image-overrides.json" } };

  let candidates: Candidate[];
  if (ov.file) {
    candidates = await imageInfo([ov.file]);
    const reason = candidates[0] ? rejectReason(candidates[0]) : "missing on Commons";
    if (!candidates[0] || reason) return { report: { ...report, reason: `override ${ov.file}: ${reason}` } };
  } else {
    const src = await candidateTitles(name, category, ov.wiki, ov.years);
    report.article = src.article?.title;
    // With an ambiguous name (article title isn't the bare name), search hits outside the
    // person's Commons category are too likely to be someone else.
    const ambiguous = !src.article || src.article.title !== name;
    const all = (await imageInfo(src.titles, src)).filter(
      (c) => !ov.reject.includes(c.title) && !(ambiguous && c.offCategory),
    );
    candidates = [];
    for (const c of all) {
      const reason = rejectReason(c);
      if (reason) report.rejected[reason] = (report.rejected[reason] ?? 0) + 1;
      else candidates.push(c);
    }
    candidates.sort((a, b) => scoreCandidate(b, name, ov.years) - scoreCandidate(a, name, ov.years));
    if (!src.article && candidates.length === 0) {
      return { report: { ...report, reason: "no English Wikipedia article found (set \"wiki\" in image-overrides.json)" } };
    }
  }

  report.alternatives = candidates.slice(0, 6).map((c) => ({
    title: c.title,
    thumbUrl: c.thumbUrl ?? c.url,
    score: Math.round(scoreCandidate(c, name, ov.years) * 10) / 10,
    license: c.license,
    year: c.year,
  }));

  if (candidates.length === 0) {
    const counts = Object.entries(report.rejected).map(([k, v]) => `${k}: ${v}`).join(", ");
    return { report: { ...report, reason: `no usable image${counts ? ` (rejected ${counts})` : ""}` } };
  }

  const best = candidates[0];
  const file = `${slug}.jpg`;
  const size = await download(best, path.join(OUT_DIR, file));
  const entry: ImageEntry = {
    name,
    file,
    title: best.title,
    author: best.author,
    license: best.license,
    licenseUrl: best.licenseUrl,
    sourceUrl: best.descriptionUrl,
    width: size.width,
    height: size.height,
    year: best.year,
  };
  return { entry, report: { ...report, status: "ok", chosen: best.title } };
}

async function main() {
  const celebs = readJson<{ celebs: { name: string; category: string }[] }>(CELEBS, { celebs: [] }).celebs;
  const images = readJson<Record<string, ImageEntry>>(IMAGES, {});
  const overrides = readJson<Record<string, Override>>(OVERRIDES, {});
  const previousReport = readJson<ReportEntry[]>(path.join(REPORT_DIR, "image-report.json"), []);
  const reportBySlug = new Map(previousReport.map((r) => [r.slug, r]));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const unknown = args.only.filter((n) => !celebs.some((c) => c.name.toLowerCase() === n.toLowerCase()));
  if (unknown.length) throw new Error(`Not in data/celebs.json: ${unknown.join(", ")}`);
  const only = new Set(args.only.map((n) => n.toLowerCase()));
  const targets = only.size ? celebs.filter((c) => only.has(c.name.toLowerCase())) : celebs;

  for (const [i, { name, category }] of targets.entries()) {
    const slug = slugify(name);
    const have = images[slug] && fs.existsSync(path.join(OUT_DIR, images[slug].file));
    if (have && !args.force && !only.size) {
      const prev = reportBySlug.get(slug);
      reportBySlug.set(slug, { ...(prev ?? { alternatives: [], rejected: {} }), name, slug, status: "ok" });
      continue;
    }
    process.stdout.write(`[${i + 1}/${targets.length}] ${name} ... `);
    try {
      const { entry, report } = await processCeleb(name, category, overrides[name]);
      reportBySlug.set(slug, report);
      if (entry) {
        images[slug] = entry;
        console.log(`ok (${entry.title}, ${entry.license}, ${entry.year ?? "year?"})`);
      } else {
        // No entry means the bank build leaves this celeb out.
        delete images[slug];
        fs.rmSync(path.join(OUT_DIR, `${slug}.jpg`), { force: true });
        console.log(`FAILED: ${report.reason}`);
      }
    } catch (err) {
      // Keep any image we already had; a transient error shouldn't drop someone from the bank.
      const prev = reportBySlug.get(slug);
      reportBySlug.set(slug, {
        ...(prev ?? { alternatives: [], rejected: {} }),
        name,
        slug,
        status: images[slug] ? "ok" : "failed",
        reason: `error: ${err}`,
      });
      console.log(`ERROR: ${err}`);
    }
    // Save as we go so an interrupted run keeps its progress.
    fs.writeFileSync(IMAGES, JSON.stringify(sortKeys(images), null, 1) + "\n");
  }

  // Forget images for celebs that are no longer in the bank.
  const slugs = new Set(celebs.map((c) => slugify(c.name)));
  for (const s of Object.keys(images)) {
    if (slugs.has(s)) continue;
    fs.rmSync(path.join(OUT_DIR, images[s].file), { force: true });
    delete images[s];
  }
  fs.writeFileSync(IMAGES, JSON.stringify(sortKeys(images), null, 1) + "\n");

  const report = celebs.map((c) => reportBySlug.get(slugify(c.name))).filter((r): r is ReportEntry => !!r);
  fs.writeFileSync(path.join(REPORT_DIR, "image-report.json"), JSON.stringify(report, null, 1) + "\n");
  const failures = celebs
    .filter((c) => !images[slugify(c.name)])
    .map((c) => reportBySlug.get(slugify(c.name)) ?? { name: c.name, reason: "not fetched yet" });
  const md = [
    "# Image fetch report",
    "",
    `${Object.keys(images).length} of ${celebs.length} celebs have an image. ${failures.length} without (left out of data/bank.json).`,
    "",
    ...(failures.length ? ["| Celeb | Reason |", "|---|---|", ...failures.map((r) => `| ${r.name} | ${r.reason ?? "unknown"} |`)] : []),
    "",
  ].join("\n");
  fs.writeFileSync(REPORT_MD, md);
  writeBank({ quiet: false });
  writeContactSheet();
  console.log(`\n${Object.keys(images).length}/${celebs.length} images. ${failures.length} failures, see scripts/fetch-report.md`);
}

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
