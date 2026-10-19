// Dev-only contact sheet for spot-checking celeb photos.
//
//   npm run contact-sheet   ->  scripts/contact-sheet.html (open it in a browser)
//
// Each card shows the chosen photo plus the next-best candidates from the last
// fetch run. "Use this" / "Reject" copy an entry for data/image-overrides.json;
// then run `npm run images -- --only "Name"` to apply it.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { slugify } from "../src/lib/slug";

const ROOT = path.resolve(import.meta.dirname, "..");

interface Alt {
  title: string;
  thumbUrl: string;
  score: number;
  license: string;
  year?: number;
}

interface Report {
  slug: string;
  status: string;
  reason?: string;
  alternatives: Alt[];
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeContactSheet(): string {
  const celebs = readJson<{ celebs: { name: string; rating: number; category: string }[] }>("data/celebs.json", { celebs: [] }).celebs;
  const images = readJson<Record<string, { file: string; title: string; license: string; author: string; year?: number; sourceUrl: string }>>(
    "data/celeb-images.json",
    {},
  );
  const overrides = readJson<Record<string, string | { years?: [number, number] }>>("data/image-overrides.json", {});
  const report = new Map(readJson<Report[]>("scripts/out/image-report.json", []).map((r) => [r.slug, r]));

  const cards = celebs
    .map((c) => {
      const slug = slugify(c.name);
      const img = images[slug];
      const rep = report.get(slug);
      const ov = overrides[c.name];
      const era = typeof ov === "object" && ov.years ? `${ov.years[0]}-${ov.years[1]}` : "";
      const alts = (rep?.alternatives ?? []).filter((a) => a.title !== img?.title).slice(0, 5);
      const main = img
        ? `<a href="${esc(img.sourceUrl)}" target="_blank"><img class="main" src="../public/celebs/${esc(img.file)}" loading="lazy"></a>`
        : `<div class="main missing">no image${rep?.reason ? `<small>${esc(rep.reason)}</small>` : ""}</div>`;
      const altHtml = alts
        .map(
          (a) => `<figure>
  <a href="https://commons.wikimedia.org/wiki/${esc(encodeURIComponent(a.title.replace(/ /g, "_")))}" target="_blank"><img src="${esc(a.thumbUrl)}" loading="lazy" title="${esc(a.title)}"></a>
  <figcaption>${esc(a.year ?? "?")} · ${esc(a.score)}</figcaption>
  <button data-copy='${esc(JSON.stringify({ [c.name]: a.title }).slice(1, -1))}'>Use this</button>
</figure>`,
        )
        .join("");
      return `<section class="card${img ? "" : " bad"}" data-name="${esc(c.name.toLowerCase())}">
  ${main}
  <h2>${esc(c.name)} <span>${c.rating.toFixed(1)} · ${esc(c.category)}${era ? ` · era ${esc(era)}` : ""}</span></h2>
  ${img ? `<p>${esc(img.year ?? "year?")} · ${esc(img.license)} · ${esc(img.author)}</p><p class="t">${esc(img.title)}</p>` : ""}
  ${img ? `<button data-copy='${esc(JSON.stringify({ [c.name]: { reject: [img.title] } }).slice(1, -1))}'>Reject current</button>` : ""}
  ${altHtml ? `<div class="alts">${altHtml}</div>` : ""}
</section>`;
    })
    .join("\n");

  const have = celebs.filter((c) => images[slugify(c.name)]).length;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Contact sheet</title>
<style>
  :root { --bg:#f7f6f2; --fg:#111; --muted:#777; --line:#ddd; --accent:#2b4eff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111; --fg:#eee; --muted:#999; --line:#333; --accent:#7d93ff; } }
  body { margin:0; padding:24px 16px; background:var(--bg); color:var(--fg); font:14px/1.4 Inter, system-ui, sans-serif; }
  header { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:20px; }
  h1 { font-size:22px; margin:0 12px 0 0; }
  input { font:inherit; padding:8px 10px; border:1px solid var(--line); background:transparent; color:inherit; border-radius:6px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:20px; }
  .card { border-top:1px solid var(--line); padding-top:10px; }
  .card.bad h2 { color:#d33; }
  .main { width:100%; aspect-ratio:4/5; object-fit:cover; object-position:50% 25%; display:block; background:var(--line); }
  .missing { display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--muted); text-align:center; padding:12px; box-sizing:border-box; }
  .missing small { display:block; margin-top:6px; }
  h2 { font-size:15px; margin:8px 0 2px; } h2 span { color:var(--muted); font-weight:400; }
  p { margin:0; color:var(--muted); font-size:12px; } .t { word-break:break-all; }
  button { font:inherit; font-size:12px; margin-top:6px; padding:4px 8px; border:1px solid var(--line); background:transparent; color:inherit; border-radius:4px; cursor:pointer; }
  button:hover { border-color:var(--accent); color:var(--accent); }
  .alts { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-top:8px; }
  figure { margin:0; } figure img { width:100%; aspect-ratio:4/5; object-fit:cover; display:block; }
  figcaption { font-size:11px; color:var(--muted); }
  #toast { position:fixed; bottom:16px; left:50%; transform:translateX(-50%); background:var(--fg); color:var(--bg); padding:8px 12px; border-radius:6px; opacity:0; transition:opacity .2s; }
</style></head><body>
<header><h1>Contact sheet</h1><span>${have}/${celebs.length} with images</span>
<input id="q" placeholder="Filter by name"><label><input type="checkbox" id="bad"> Missing only</label></header>
<p style="margin-bottom:8px">Check that each photo looks like its rating (the number next to the name). Set an era with <code>"Name": { "years": [2005, 2014] }</code> to steer the pick.</p>
<p style="margin-bottom:16px">"Use this" / "Reject current" copies a line for <code>data/image-overrides.json</code>. Then run <code>npm run images -- --only "Name"</code>.</p>
<div class="grid">${cards}</div>
<div id="toast">Copied</div>
<script>
  const q = document.getElementById('q'), bad = document.getElementById('bad');
  function filter() {
    const s = q.value.toLowerCase();
    document.querySelectorAll('.card').forEach(c => {
      c.style.display = (!s || c.dataset.name.includes(s)) && (!bad.checked || c.classList.contains('bad')) ? '' : 'none';
    });
  }
  q.oninput = filter; bad.onchange = filter;
  document.addEventListener('click', e => {
    const b = e.target.closest('button[data-copy]'); if (!b) return;
    navigator.clipboard.writeText(b.dataset.copy + ',').then(() => {
      const t = document.getElementById('toast'); t.style.opacity = 1; setTimeout(() => t.style.opacity = 0, 1200);
    });
  });
</script>
</body></html>
`;
  const out = path.join(ROOT, "scripts/contact-sheet.html");
  fs.writeFileSync(out, html);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`Wrote ${path.relative(ROOT, writeContactSheet())}`);
}
