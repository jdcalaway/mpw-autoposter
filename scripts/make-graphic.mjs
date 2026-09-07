// Generates an on-brand 1080x1080 JPEG for posts that don't use a real photo.
// Brand pulled from mobilepetworks.com: royal blue #0146A3, gold #FFD25A,
// coral #D54B5D, navy ink, Quicksand type. librsvg has no emoji font, so we
// strip emoji and render short typographic cards; the full caption (with emoji)
// still goes in the post text.

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { ROOT, loadConfig, loadPillars } from "./lib/util.mjs";

// Point fontconfig at the bundled Quicksand font BEFORE sharp/libvips loads
// (libvips reads these on init, so they must be set before the import runs).
process.env.FONTCONFIG_PATH = join(ROOT, "assets", "fonts");
process.env.FONTCONFIG_FILE = join(ROOT, "assets", "fonts", "fonts.conf");
const sharp = (await import("sharp")).default;

// Customer-facing kicker (internal pillar labels are for us, not the feed).
const KICKER = {
  engagement: "Paws & Chat",
  tip: "Grooming Tip",
  transformation: "Before & After",
  bts: "Inside the Van",
  featured: "Featured Pup",
  booking: "Book Now",
  testimonial: "5-Star Review",
  hiring: "We're Hiring Groomers",
};

// Accent per pillar, drawn from the brand palette (the field is brand blue, so
// the accent is gold or coral for contrast).
const ACCENT = {
  engagement: "coral", tip: "gold", transformation: "gold", bts: "gold",
  featured: "coral", booking: "gold", testimonial: "coral",
};

const stripEmoji = (s) =>
  s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️‍]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const escapeXml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Greedy word-wrap into at most `maxLines` lines of ~`maxChars` each. */
function wrap(text, maxChars, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  let overflow = false;
  for (const w of words) {
    const next = (cur + " " + w).trim();
    if (next.length > maxChars && cur) {
      if (lines.length === maxLines - 1) { overflow = true; break; }
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (overflow) lines[lines.length - 1] = lines[lines.length - 1].replace(/[.,;:]?$/, "…");
  return lines;
}

export async function renderGraphic({ cfg, pillar, pillarKey, bodyText, outPath, variantSeed = "0", review }) {
  const palettes = [
    { field: "#0146A3", card: "#FFFFFF", ink: "#172E4D", accent: "#0146A3" },
    { field: "#FFD25A", card: "#FFF8EB", ink: "#172E4D", accent: "#0146A3" },
    { field: "#172E4D", card: "#014078", ink: "#FFFFFF", accent: "#FFD25A" },
    { field: "#D54B5D", card: "#FFF8F3", ink: "#172E4D", accent: "#973345" },
  ];
  const seed = [...variantSeed].reduce((n, c) => n + c.charCodeAt(0), 0);
  const palette = palettes[seed % palettes.length];
  const g = { ...cfg.graphic, card: palette.card, ink: palette.ink,
    brandBlue: palette.accent, muted: palette.ink };
  const W = g.width, H = g.height;
  const font = g.font;
  const accent = palette.accent;

  const kicker = (review ? `${review.rating}/5 · GOOGLE REVIEW` : pillarKey === "testimonial" ? "OUR CUSTOMERS" : KICKER[pillarKey] || pillar.label).toUpperCase();
  const body = wrap(stripEmoji(bodyText), review ? 34 : 22, review ? 6 : 4);
  const step = review ? 60 : 82;
  const bodyStartY = H / 2 - ((body.length - 1) * step) / 2 - 10;
  const bodyTspans = body
    .map((line, i) => `<tspan x="${W / 2}" y="${bodyStartY + i * step}">${escapeXml(line)}</tspan>`)
    .join("");

  const m = 56;               // outer margin (brand-blue border)
  const cardR = 44;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${palette.field}"/>
    <circle cx="20" cy="10" r="210" fill="${palette.accent}" opacity="0.25"/>
    <circle cx="${W}" cy="${H}" r="280" fill="#FFFFFF" opacity="0.12"/>
    <rect x="${m}" y="${m}" width="${W - 2 * m}" height="${H - 2 * m}" rx="${cardR}" fill="${g.card}"/>
    <rect x="${m}" y="${m}" width="${W - 2 * m}" height="18" rx="9" fill="${accent}"/>
    <circle cx="${W / 2}" cy="${m + 96}" r="30" fill="${accent}"/>
    <text x="${W / 2}" y="${m + 106}" text-anchor="middle" font-family="${font}" font-size="22" font-weight="700" fill="${palette.card}">MPW</text>
    <text x="${W / 2}" y="248" text-anchor="middle" font-family="${font}"
          font-size="30" font-weight="700" letter-spacing="3" fill="${accent}">${escapeXml(kicker)}</text>
    <text text-anchor="middle" font-family="${font}" font-size="${review ? 46 : 70}" font-weight="700" fill="${g.ink}">${bodyTspans}</text>
    ${review ? `<text x="${W / 2}" y="790" text-anchor="middle" font-family="${font}" font-size="27" fill="${g.ink}">${escapeXml(stripEmoji(review.author).slice(0, 45))} · Review excerpt</text>` : ""}
    <text x="${W / 2}" y="${H - 172}" text-anchor="middle" font-family="${font}"
          font-size="44" font-weight="700" fill="${g.brandBlue}">${escapeXml(cfg.business.name)}</text>
    <text x="${W / 2}" y="${H - 122}" text-anchor="middle" font-family="${font}"
          font-size="30" font-weight="500" fill="${g.muted}">${escapeXml(cfg.business.website + "  ·  " + cfg.business.phone)}</text>
    <text x="${W / 2}" y="${H - 80}" text-anchor="middle" font-family="${font}"
          font-size="27" font-weight="500" font-style="italic" fill="${g.muted}">We come to you — mobile dog grooming</text>
  </svg>`;

  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  return outPath;
}

// Standalone sample: `npm run sample`
if (process.argv.includes("--sample")) {
  const cfg = await loadConfig();
  const { pillars } = await loadPillars();
  const outDir = join(ROOT, "images", "generated");
  for (const [key, pillar] of Object.entries(pillars)) {
    const body = (pillar.graphicLines && pillar.graphicLines[0]) || pillar.captions[0];
    const out = join(outDir, `sample-${key}.jpg`);
    await renderGraphic({ cfg, pillar, pillarKey: key, bodyText: body, outPath: out });
    console.log("wrote", out);
  }
  console.log("Done. Open images/generated/sample-*.jpg to preview.");
}
