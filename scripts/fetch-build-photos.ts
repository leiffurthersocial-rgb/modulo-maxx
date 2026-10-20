// Fetch the body-type photos listed in data/build-photos.json from Wikimedia Commons.
//
//   npm run build-photos
//
// Each entry is a Commons file plus a crop box (fractions of the image), cropped neck-down so
// nobody is identifiable. Writes public/builds/<id>.jpg and data/build-photo-credits.json.
// Body types without an entry keep their drawn figure in the app.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { isFreeLicense, stripHtml, type Crop } from "./image-utils";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public/builds");
const USER_AGENT = "ModuloMaxx/1.0 (personal non-commercial project)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One request at a time with a pause after each, retrying 429/5xx with backoff. */
async function get(url: string): Promise<Response> {
  let wait = 5000;
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Api-User-Agent": USER_AGENT } }).catch(() => undefined);
    await sleep(800);
    if (res?.ok) return res;
    if ((res && res.status < 500 && res.status !== 429) || i >= 6) throw new Error(`${res?.status ?? "network error"} for ${url}`);
    await sleep(wait);
    wait *= 2;
  }
}

async function main() {
  const entries = JSON.parse(fs.readFileSync(path.join(ROOT, "data/build-photos.json"), "utf8")) as Record<string, { file: string; crop: Crop }>;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const credits: Record<string, unknown> = {};
  for (const [id, { file, crop }] of Object.entries(entries)) {
    const qs = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", titles: file, prop: "imageinfo",
      iiprop: "url|size|extmetadata", iiurlwidth: "1280",
      iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Credit|NonFree",
    });
    const page = (await (await get(`https://commons.wikimedia.org/w/api.php?${qs}`)).json()).query.pages[0];
    const ii = page?.imageinfo?.[0];
    if (!ii) throw new Error(`${id}: ${file} not found on Commons`);
    const m = ii.extmetadata ?? {};
    const license = stripHtml(m.LicenseShortName?.value);
    if (/true/i.test(m.NonFree?.value ?? "") || !isFreeLicense(license)) throw new Error(`${id}: ${file} is not freely licensed (${license})`);

    const buf = Buffer.from(await (await get(ii.width > 1280 ? ii.thumburl : ii.url)).arrayBuffer());
    const img = sharp(buf).rotate().flatten({ background: "#ffffff" });
    const { width = 0, height = 0 } = await sharp(await img.toBuffer()).metadata();
    await sharp(await img.toBuffer())
      .extract({ left: Math.round(crop.x * width), top: Math.round(crop.y * height), width: Math.round(crop.w * width), height: Math.round(crop.h * height) })
      .resize(240, 300, { fit: "cover", position: "top" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(OUT_DIR, `${id}.jpg`));
    credits[id] = {
      file: `${id}.jpg`,
      title: page.title,
      author: stripHtml(m.Artist?.value) || stripHtml(m.Credit?.value) || "Unknown author",
      license,
      licenseUrl: stripHtml(m.LicenseUrl?.value) || undefined,
      sourceUrl: ii.descriptionurl,
    };
    console.log(`${id}: ${page.title} (${license})`);
  }
  // Drop photos for body types no longer listed.
  for (const f of fs.readdirSync(OUT_DIR)) if (!entries[f.replace(/\.jpg$/, "")]) fs.rmSync(path.join(OUT_DIR, f));
  fs.writeFileSync(path.join(ROOT, "data/build-photo-credits.json"), JSON.stringify(credits, null, 1) + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
