// Pure helpers for fetch-images.ts (kept separate so they can be unit-tested offline).

export interface Candidate {
  title: string; // "File:Foo.jpg"
  width: number;
  height: number;
  mime: string;
  url: string; // original
  thumbUrl?: string; // ~960px thumbnail
  descriptionUrl: string;
  license: string; // short name, e.g. "CC BY-SA 4.0"
  licenseUrl?: string;
  author: string;
  year?: number;
  yearSource: "taken" | "uploaded" | "unknown";
  description: string;
  categories: string;
  fromPageImage: boolean;
}

export const MIN_SIZE = 400;
export const RECENT_YEARS = 10;
const OK_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function stripHtml(html: string | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** First plausible 4-digit year (1900-2099) in a date string. */
export function parseYear(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = stripHtml(s).match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : undefined;
}

/** Free licenses only: CC0, CC BY, CC BY-SA, public domain. No NC/ND, no fair use. */
export function isFreeLicense(shortName: string, licenseCode = ""): boolean {
  const s = `${shortName} ${licenseCode}`.toLowerCase();
  if (/fair use|non-free|\bnc\b|-nc|noncommercial|\bnd\b|-nd|noderiv/.test(s)) return false;
  return /\bcc0\b|cc[- ]?by|public domain|\bpd\b|^pd|pd-/.test(s);
}

const BAD_WORDS =
  /\b(and|with|family|team|cast|group|crowd|statue|wax|tussauds|mural|graffiti|caricature|signature|autograph|logo|poster|cartoon|drawing|painting|sketch|banner|fans?|parade|trophy|car|house|grave|memorial)\b|&/i;
const ACTION_WORDS = /\b(concert|performing|performs|live|stage|match|game|vs\.?|playing|race|fight|training|celebrat\w*|goal)\b/i;
const PORTRAIT_WORDS = /\b(portrait|headshot|head shot|close-?up|face|cropped|crop)\b/i;

export function surname(name: string): string {
  const parts = name.replace(/[,.]/g, " ").trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export type Rejection = "license" | "lowres" | "old" | "mime" | "art";

/** Hard filters. Returns a reason when the candidate is unusable. */
export function rejectReason(c: Candidate, nowYear: number, opts: { ignoreAge?: boolean } = {}): Rejection | null {
  if (!OK_MIME.has(c.mime)) return "mime";
  if (!isFreeLicense(c.license)) return "license";
  if (c.width < MIN_SIZE || c.height < MIN_SIZE) return "lowres";
  if (/caricature|in art|drawings|paintings|wax figures|statues/i.test(c.categories)) return "art";
  if (!opts.ignoreAge && c.year !== undefined && c.year < nowYear - RECENT_YEARS) return "old";
  return null;
}

/**
 * Heuristic score for "recent, front-facing, close-up, single-person portrait".
 * Front-facing and neutral expression can't be checked from metadata, so the
 * contact sheet exists for the manual pass.
 */
export function scoreCandidate(c: Candidate, celebName: string, nowYear: number): number {
  const title = normalize(c.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/[_()]/g, " "));
  const text = `${title} ${normalize(c.description)}`;
  let score = 0;
  if (c.fromPageImage) score += 6;
  if (title.includes(normalize(surname(celebName)))) score += 2;
  if (title.includes(normalize(celebName))) score += 1;
  if (/\bcropped\b/.test(title)) score += 3;
  if (PORTRAIT_WORDS.test(text)) score += 1.5;
  // Other people's names or group shots in the title.
  if (BAD_WORDS.test(title.replace(normalize(celebName), ""))) score -= 4;
  if (ACTION_WORDS.test(text)) score -= 2;
  const ratio = c.height / c.width;
  if (ratio >= 1 && ratio <= 1.6) score += 2;
  else if (ratio < 0.8) score -= 2;
  if (c.year !== undefined) score += Math.max(0, Math.min(2, (c.year - (nowYear - RECENT_YEARS)) * 0.25));
  else score -= 1;
  if (c.yearSource === "uploaded") score -= 0.5;
  // Bigger source images make cleaner 600px crops, up to a point.
  score += Math.min(1, Math.min(c.width, c.height) / 1200);
  return score;
}

export interface CliArgs {
  only: string[];
  force: boolean;
  delayMs: number;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { only: [], force: false, delayMs: 250 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only") args.only.push(...(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    else if (a.startsWith("--only=")) args.only.push(...a.slice(7).split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--force") args.force = true;
    else if (a === "--delay") args.delayMs = Number(argv[++i] ?? 250);
  }
  return args;
}

export type Override = string | { file?: string; reject?: string[]; drop?: boolean };

export function normalizeOverride(o: Override | undefined): { file?: string; reject: string[]; drop: boolean } {
  if (!o) return { reject: [], drop: false };
  if (typeof o === "string") return { file: withFilePrefix(o), reject: [], drop: false };
  return { file: o.file ? withFilePrefix(o.file) : undefined, reject: (o.reject ?? []).map(withFilePrefix), drop: !!o.drop };
}

export function withFilePrefix(t: string): string {
  const s = t.replace(/_/g, " ").trim();
  return /^file:/i.test(s) ? `File:${s.slice(5)}` : `File:${s}`;
}
