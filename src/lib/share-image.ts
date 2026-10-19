import { fmt, fmtFace, type Results } from "./results";

const W = 1080;
const H = 1350;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Draw the results card on a canvas (no external libraries) and return a PNG blob. */
export async function renderResultImage(res: Results, name: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const bg = cssVar("--bg", "#f7f6f2");
  const fg = cssVar("--fg", "#111111");
  const muted = cssVar("--muted", "#6b6b6b");
  const line = cssVar("--line", "#dcdad3");
  const accent = cssVar("--accent", "#2b4eff");
  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const pad = 96;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = muted;
  ctx.font = `500 40px ${font}`;
  ctx.fillText(name.trim() ? `Modulo Maxx · ${name.trim()}` : "Modulo Maxx", pad, pad + 40);

  ctx.fillStyle = fg;
  ctx.font = `600 200px ${font}`;
  ctx.fillText(fmt(res.overall.mean), pad - 8, pad + 300);
  const w = ctx.measureText(fmt(res.overall.mean)).width;
  ctx.fillStyle = muted;
  ctx.font = `400 64px ${font}`;
  ctx.fillText(`± ${fmt(Math.max(0.1, res.overall.sd))}`, pad + w + 16, pad + 300);

  ctx.fillStyle = accent;
  ctx.font = `500 52px ${font}`;
  ctx.fillText(`Top ${res.top}% of guys`, pad, pad + 390);

  let y = pad + 500;
  const barW = W - pad * 2;
  for (const a of res.attributes) {
    ctx.fillStyle = fg;
    ctx.font = `500 40px ${font}`;
    ctx.fillText(a.label, pad, y);
    const label = a.key === "face" ? fmtFace(res.face) : fmt(a.value);
    ctx.font = `400 40px ${font}`;
    const lw = ctx.measureText(label).width;
    ctx.fillText(label, W - pad - lw, y);
    ctx.fillStyle = line;
    ctx.fillRect(pad, y + 22, barW, 8);
    ctx.fillStyle = accent;
    ctx.fillRect(pad, y + 22, (barW * Math.min(10, Math.max(0, a.value))) / 10, 8);
    y += 120;
  }

  if (res.match) {
    const photo = res.match.image ? await loadImage(`/celebs/${res.match.image.file}`) : null;
    const size = 200;
    y += 20;
    if (photo) {
      const sw = photo.width;
      const sh = Math.min(photo.height, sw);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(pad, y, size, size, 24);
      ctx.clip();
      ctx.drawImage(photo, 0, Math.max(0, (photo.height - sh) * 0.25), sw, sh, pad, y, size, size);
      ctx.restore();
    }
    const tx = photo ? pad + size + 40 : pad;
    ctx.fillStyle = muted;
    ctx.font = `400 36px ${font}`;
    ctx.fillText("Face around the level of", tx, y + 80);
    ctx.fillStyle = fg;
    ctx.font = `600 52px ${font}`;
    ctx.fillText(res.match.name, tx, y + 145);
  }

  ctx.fillStyle = muted;
  ctx.font = `400 32px ${font}`;
  ctx.fillText("For fun, not science.", pad, H - pad + 20);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}
