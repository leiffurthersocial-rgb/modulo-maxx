// Fetch one free-licensed portrait per celeb from Wikipedia / Wikimedia Commons.
//
//   npm run images                       # fetch everything missing (idempotent)
//   npm run images -- --only "Ryan Gosling"   # (re)fetch specific celebs, comma-separated
//   npm run images -- --force            # refetch everyone
//
// Writes public/celebs/<slug>.jpg (600px wide), data/celeb-images.json (credits),
// scripts/out/image-report.{json,md} (failures + alternatives), then regenerates
// scripts/contact-sheet.html. Pin or reject specific files in data/image-overrides.json.

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
  type Candidate,
  type Override,
  type Rejection,
} from "./image-utils";
import { writeContactSheet } from "./contact-sheet";

const ROOT = path.resolve(import.meta.dirname, "..");
const CELEBS = path.join(ROOT, "data/celebs.json");
const IMAGES = path.join(ROOT, "data/celeb-images.json");
const OVERRIDES = path.join(ROOT, "data/image-overrides.json");
const OUT_DIR = path.join(ROOT, "public/celebs");
const REPORT_DIR = path.join(ROOT, "scripts/out");

const WIDTH = 600;
const THUMB_WIDTH = 960;
const USER_AGENT = "ModuloMaxx/0.1 (non-commercial hobby project; image credits fetcher)";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const NOW_YEAR = new Date().getFullYear();

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

async function fetchWithRetry(url: string, tries = 5): Promise<Response> {
  let wait = 1000;
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT } });
    if (res.ok) return res;
    if (i >= tries - 1 || (res.status !== 429 && res.status < 500)) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : wait);
    wait *= 2;
  }
}

async function api(base: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const res = await fetchWithRetry(`${base}?${qs}`);
  await sleep(args.delayMs);
  return res.json();
}

/** Candidate file titles from the Wikipedia article, Commons search and the Commons category. */
async function candidateTitles(name: string): Promise<{ titles: string[]; pageImage?: string }> {
  const titles = new Set<string>();
  let pageImage: string | undefined;

  const wiki = await api(WIKI_API, {
    action: "query",
    titles: name,
    redirects: "1",
    prop: "pageimages|images",
    piprop: "name",
    imlimit: "50",
  });
  const page = wiki?.query?.pages?.[0];
  if (page && !page.missing) {
    if (page.pageimage) {
      pageImage = withFilePrefix(page.pageimage);
      titles.add(pageImage);
    }
    for (const im of page.images ?? []) titles.add(withFilePrefix(im.title));
  }
  const articleTitle: string = page?.title ?? name;

  const search = await api(COMMONS_API, {
    action: "query",
    list: "search",
    srsearch: `"${articleTitle}" filetype:bitmap`,
    srnamespace: "6",
    srlimit: "25",
  });
  for (const r of search?.query?.search ?? []) titles.add(withFilePrefix(r.title));

  const cat = await api(COMMONS_API, {
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:${articleTitle}`,
    cmtype: "file",
    cmlimit: "50",
  });
  for (const m of cat?.query?.categorymembers ?? []) titles.add(withFilePrefix(m.title));

  return { titles: [...titles].filter((t) => /\.(jpe?g|png|webp)$/i.test(t)), pageImage };
}

async function imageInfo(titles: string[], pageImage?: string): Promise<Candidate[]> {
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
        "LicenseShortName|License|LicenseUrl|Artist|Credit|DateTimeOriginal|DateTime|ImageDescription|Categories",
    });
    for (const p of data?.query?.pages ?? []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue; // missing on Commons (e.g. local non-free enwiki files)
      const m = ii.extmetadata ?? {};
      const taken = parseYear(m.DateTimeOriginal?.value);
      const uploaded = parseYear(ii.timestamp);
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
        year: taken ?? uploaded,
        yearSource: taken ? "taken" : uploaded ? "uploaded" : "unknown",
        description: stripHtml(m.ImageDescription?.value),
        categories: stripHtml(m.Categories?.value),
        fromPageImage: p.title === pageImage,
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
    .resize({ width: WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(dest);
  return { width: info.width, height: info.height };
}

async function processCeleb(name: string, override: Override | undefined): Promise<{ entry?: ImageEntry; report: ReportEntry }> {
  const slug = slugify(name);
  const ov = normalizeOverride(override);
  const report: ReportEntry = { name, slug, status: "failed", alternatives: [], rejected: {} };
  if (ov.drop) return { report: { ...report, status: "dropped", reason: "dropped in image-overrides.json" } };

  let candidates: Candidate[];
  if (ov.file) {
    candidates = await imageInfo([ov.file]);
    const reason = candidates[0] ? rejectReason(candidates[0], NOW_YEAR, { ignoreAge: true }) : "missing";
    if (!candidates[0] || reason) return { report: { ...report, reason: `override ${ov.file}: ${reason}` } };
  } else {
    const { titles, pageImage } = await candidateTitles(name);
    const all = (await imageInfo(titles, pageImage)).filter((c) => !ov.reject.includes(c.title));
    candidates = [];
    for (const c of all) {
      const reason = rejectReason(c, NOW_YEAR);
      if (reason) report.rejected[reason] = (report.rejected[reason] ?? 0) + 1;
      else candidates.push(c);
    }
    candidates.sort((a, b) => scoreCandidate(b, name, NOW_YEAR) - scoreCandidate(a, name, NOW_YEAR));
  }

  report.alternatives = candidates.slice(0, 6).map((c) => ({
    title: c.title,
    thumbUrl: c.thumbUrl ?? c.url,
    score: Math.round(scoreCandidate(c, name, NOW_YEAR) * 10) / 10,
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
  const celebs: { name: string }[] = readJson<{ celebs: { name: string }[] }>(CELEBS, { celebs: [] }).celebs;
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

  for (const [i, { name }] of targets.entries()) {
    const slug = slugify(name);
    const have = images[slug] && fs.existsSync(path.join(OUT_DIR, images[slug].file));
    if (have && !args.force && !only.size) {
      const prev = reportBySlug.get(slug);
      reportBySlug.set(slug, { ...(prev ?? { alternatives: [], rejected: {} }), name, slug, status: "skipped" });
      continue;
    }
    process.stdout.write(`[${i + 1}/${targets.length}] ${name} ... `);
    try {
      const { entry, report } = await processCeleb(name, overrides[name]);
      reportBySlug.set(slug, report);
      if (entry) {
        images[slug] = entry;
        console.log(`ok (${entry.title}, ${entry.license})`);
      } else {
        // Drop from the bank: no entry means the app leaves this celeb out.
        delete images[slug];
        fs.rmSync(path.join(OUT_DIR, `${slug}.jpg`), { force: true });
        console.log(`FAILED: ${report.reason}`);
      }
    } catch (err) {
      reportBySlug.set(slug, { name, slug, status: "failed", reason: String(err), alternatives: [], rejected: {} });
      console.log(`ERROR: ${err}`);
    }
    // Save as we go so an interrupted run keeps its progress.
    fs.writeFileSync(IMAGES, JSON.stringify(sortKeys(images), null, 1) + "\n");
  }

  // Forget images for celebs that are no longer in the bank.
  const slugs = new Set(celebs.map((c) => slugify(c.name)));
  for (const s of Object.keys(images)) if (!slugs.has(s)) delete images[s];
  fs.writeFileSync(IMAGES, JSON.stringify(sortKeys(images), null, 1) + "\n");

  const report = celebs.map((c) => reportBySlug.get(slugify(c.name))).filter((r): r is ReportEntry => !!r);
  fs.writeFileSync(path.join(REPORT_DIR, "image-report.json"), JSON.stringify(report, null, 1) + "\n");
  const failures = report.filter((r) => r.status === "failed" || r.status === "dropped");
  const md = [
    "# Image report",
    "",
    `${Object.keys(images).length} of ${celebs.length} celebs have an image. ${failures.length} without.`,
    "",
    ...failures.map((r) => `- **${r.name}**: ${r.reason}`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(REPORT_DIR, "image-report.md"), md);
  writeContactSheet();
  console.log(`\n${Object.keys(images).length}/${celebs.length} images. ${failures.length} failures, see scripts/out/image-report.md`);
}

function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
