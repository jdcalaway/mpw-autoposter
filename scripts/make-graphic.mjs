// Generates a clean, on-brand 1080x1080 JPEG for posts that don't use a real
// photo (tips, questions, booking CTAs, testimonials). librsvg (used by sharp)
// has no emoji font, so we strip emoji and render short, punchy typographic cards.

import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, loadConfig, loadPillars } from "./lib/util.mjs";

// Customer-facing kicker text (the internal pillar labels are for us, not the feed).
const KICKER = {
  engagement: "Paws & Chat",
  tip: "Grooming Tip",
  transformation: "Before & After",
  bts: "Inside the Van",
  featured: "Featured Pup",
  booking: "Book Now",
  testimonial: "5-Star Review",
};

const stripEmoji = (s) =>
  s
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}️‍]/gu,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();

const escapeXml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Greedy word-wrap into at most `maxLines` lines of ~`maxChars` each.
 *  If the text overflows, the last kept line gets an ellipsis. */
function wrap(text, maxChars, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  let overflow = false;
  for (const w of words) {
    const next = (cur + " " + w).trim();
    if (next.length > maxChars && cur) {
      if (lines.length === maxLines - 1) {
        overflow = true;
        break;
      }
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

export async function renderGraphic({ cfg, pillar, pillarKey, bodyText, outPath }) {
  const W = cfg.graphic.width;
  const H = cfg.graphic.height;
  const accent = pillar.color;
  const soft = pillar.soft;
  const cream = cfg.graphic.cream;
  const ink = cfg.graphic.ink;
  const muted = cfg.graphic.muted;

  const kicker = (KICKER[pillarKey] || pillar.label).toUpperCase();
  const body = wrap(stripEmoji(bodyText), 24, 4);
  const bodyStartY = H / 2 - ((body.length - 1) * 78) / 2 - 20;
  const bodyTspans = body
    .map((line, i) => `<tspan x="${W / 2}" y="${bodyStartY + i * 78}">${escapeXml(line)}</tspan>`)
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${soft}"/>
    <rect x="48" y="48" width="${W - 96}" height="${H - 96}" rx="36" fill="${cream}"/>
    <rect x="48" y="48" width="${W - 96}" height="14" rx="7" fill="${accent}"/>
    <text x="${W / 2}" y="180" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
          font-size="34" font-weight="700" letter-spacing="6" fill="${accent}">${escapeXml(kicker)}</text>
    <text text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
          font-size="66" font-weight="700" fill="${ink}">${bodyTspans}</text>
    <text x="${W / 2}" y="${H - 168}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
          font-size="40" font-weight="700" fill="${accent}">${escapeXml(cfg.business.name)}</text>
    <text x="${W / 2}" y="${H - 116}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
          font-size="30" fill="${muted}">${escapeXml(cfg.business.website + "  ·  " + cfg.business.phone)}</text>
    <text x="${W / 2}" y="${H - 74}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif"
          font-size="26" font-style="italic" fill="${muted}">We come to you — mobile dog grooming</text>
  </svg>`;

  const buf = await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
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
