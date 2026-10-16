import {logoLayer} from './branding.mjs';
import { contentHoldReason } from "./content-policy.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, addDays } from "./util.mjs";

// Fontconfig must be configured before libvips/sharp is loaded, including when
// this module is imported by the test runner or a local preview.
process.env.FONTCONFIG_PATH = join(ROOT, "assets", "fonts");
process.env.FONTCONFIG_FILE = join(ROOT, "assets", "fonts", "fonts.conf");
const sharp = (await import("sharp")).default;

export const PROVIDER = "github-openai";
export const SETTINGS_PATH = "content/ai-creative.json";
export const LEDGER_PATH = "content/creative-batches.json";

export function validateSettings(c) {
  if (c.provider !== PROVIDER || c.model !== "gpt-image-2" || c.size !== "1536x1024" || c.quality !== "high") {
    throw new Error("Unexpected image model/output settings; review the cost limits before changing them.");
  }
  for (const [key, min, max] of [["intervalDays", 7, 365], ["maxRequestsPerRun", 1, 2],
    ["maxAttemptsPerImage", 1, 2], ["maxRequestsPerMonth", 1, 12]]) {
    if (!Number.isInteger(c[key]) || c[key] < min || c[key] > max) throw new Error(`Invalid ${key}.`);
  }
  if (c.reference !== "images/creative/van-reference.jpg") throw new Error("Unexpected reference path.");
  for (const key of ["styles", "bookingScenes", "hiringScenes"]) {
    if (!Array.isArray(c[key]) || !c[key].length) throw new Error(`Missing ${key}.`);
  }
  for (const style of c.styles) {
    for (const key of ["background", "ink", "accent"]) {
      if (!/^#[0-9a-f]{6}$/i.test(style[key])) throw new Error("Invalid palette color.");
    }
  }
}

export function planBatch({ ledger, campaigns, settings, today, posts }) {
  validateSettings(settings);
  const cloud = ledger.batches.filter(b => b.provider === PROVIDER);
  const pending = cloud.filter(b => b.status !== "complete");
  if (pending.length > 1) throw new Error("Multiple unfinished cloud batches; resolve before generating.");
  if (pending.length) return { batch: pending[0], isNew: false };
  const latest = cloud.filter(b => b.status === "complete").sort((a,b) => b.date.localeCompare(a.date))[0];
  const nextDate = latest && addDays(latest.completedOn || latest.date, settings.intervalDays);
  const perPost = settings.generationMode === "per-post";
  if (perPost && !Array.isArray(posts)) throw new Error("Per-post generation requires the calendar.");
  const targets = perPost ? posts.filter(p => p.status === "planned" && p.awaitingCreative && !p.awaitingCopy &&
    ["booking", "hiring"].includes(p.pillar) && p.date >= today && p.date <= addDays(today, 1))
    .sort((a,b) => a.date.localeCompare(b.date)).slice(0, settings.maxRequestsPerRun) : null;
  if (perPost && !targets.length) return { nextDate: addDays(today, 1) };
  if (!perPost && nextDate && today < nextDate) return { nextDate };
  const index = cloud.length;
  const items = (targets || [{pillar:"booking"}, {pillar:"hiring"}]).map((target, offset) => {
    const pillar = target.pillar;
    const previous = cloud.flatMap(b => b.items || []).filter(i => i.pillar === pillar);
    const candidates = campaigns.filter(c => c.pillar === pillar && !c.generator && !c.createdAt &&
      !contentHoldReason({id:target.date || today,date:target.date || today,caption:c.caption,graphicText:c.headline}, posts || []) &&
      !previous.some(i => i.caption === c.caption || i.headline === c.headline));
    const usage = c => previous.filter(i => i.sourceTemplateId === c.id).length;
    candidates.sort((a,b) => usage(a) - usage(b) || Number(!!a.asset) - Number(!!b.asset));
    const template = perPost ? (target.freshCopy ? {id:`fresh-copy-${target.date}`, headline:target.graphicText, caption:target.caption, objective:target.pillar === 'hiring' ? 'hiring' : 'booking'} : null) : candidates[0];
    if (!template?.headline || !template.caption) throw new Error(`No unused ${pillar} campaign copy; add fresh content before buying artwork.`);
    const style = settings.styles[(index + offset) % settings.styles.length];
    const scenes = settings[`${pillar}Scenes`];
    const scene = target.freshScene || scenes[index % scenes.length];
    const id = `ai-${target.date || today}-${pillar}`;
    if (cloud.some(b => b.items?.some(i => i.id === id))) throw new Error(`Existing artwork record for ${id}; inspect before buying again.`);
    const prompt = [
      "Create new premium landscape social advertising artwork for Mobile Pet Works, mobile dog grooming in Tri-Cities, Washington.",
      "The uploaded photo is ONLY a vehicle design reference. Invent a fresh illustration, composition, dog and environment; do not reproduce the photograph or its neighborhood.",
      "When the van is shown, preserve its distinctive elongated white shuttle-bus body, long dark tinted window band, white cab facing right, front passenger doors, blue lower stripe and large blue paw near the rear.",
      "The side brand name, if visible, must read MOBILE PET WORKS. Omit the old website and phone lettering from the reference. Do not invent a different logo or vehicle.",
      `Art direction: ${style.direction}`,
      `Scene: ${scene}`,
      `The separately typeset ad headline will be: ${template.headline}`,
      "Create illustration only: no headline, contact details, captions, watermarks, badges, prices or extra text in the artwork. The ad typography is added separately below the illustration.",
      "Use the entire 3:2 landscape canvas. Keep all important subjects within a generous 8% safe margin. Expressive beautiful dogs, correct anatomy and gentle, credible grooming handling.",
      "Clearly crafted illustration, not a documentary photograph or a real employee/customer portrait. No before-and-after comparison, fabricated review, pay/benefit claim, scarcity, guaranteed results or availability. No scissors near faces."
    ].join("\n");
    return { id, freshCopy: !!target.freshCopy, ...(target.date ? {targetDate: target.date} : {}), pillar, objective: template.objective, sourceTemplateId: template.id,
      headline: template.headline, caption: template.caption, style, prompt,
      sourceAsset: `images/creative/cloud/${id}-source.png`,
      asset: `images/creative/cloud/${id}.jpg`, status: "planned", attempts: [] };
  });
  return { isNew: true, batch: { id: targets ? `post-${targets.map(t => t.date).join("-")}` : `cloud-${today}`, date: today, provider: PROVIDER, status: "partial",
    model: settings.model, size: settings.size, quality: settings.quality,
    reference: settings.reference, items, assets: [] } };
}

export function requestBlock({ ledger, item, settings, today, runRequests }) {
  if (item.status === "requesting" || item.status === "uncertain") return "An earlier request has an uncertain outcome; inspect it before retrying.";
  if (item.status === "blocked") return "This image needs attention before generation can continue.";
  if (item.attempts.length >= settings.maxAttemptsPerImage) return "Per-image attempt limit reached.";
  if (runRequests >= settings.maxRequestsPerRun) return "Per-run request limit reached.";
  const attempts = ledger.batches.filter(b => b.provider === PROVIDER).flatMap(b => b.items || []).flatMap(i => i.attempts || []);
  if (attempts.filter(a => a.date.slice(0,7) === today.slice(0,7)).length >= settings.maxRequestsPerMonth) return "Monthly request limit reached.";
  if (item.attempts.some(a => a.date === today)) return "A request was already attempted for this image today; retry no earlier than tomorrow.";
  return null;
}

export class ImageRequestError extends Error {
  constructor(message, disposition) { super(message); this.disposition = disposition; }
}

export async function generateArtwork({ batch, item, reference, apiKey, fetchImpl = fetch }) {
  const body = new FormData();
  for (const [key, value] of Object.entries({ model: batch.model, prompt: item.prompt, n: "1",
    size: batch.size, quality: batch.quality, output_format: "png" })) body.append(key, value);
  body.append("image[]", new Blob([reference], { type: "image/jpeg" }), "van-reference.jpg");
  let response;
  try {
    response = await fetchImpl("https://api.openai.com/v1/images/edits", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body,
      signal: AbortSignal.timeout(600000), redirect: "error"
    });
  } catch {
    throw new ImageRequestError("Image request interrupted; outcome unknown. No automatic retry.", "uncertain");
  }
  const requestId = response.headers.get("x-request-id");
  if (!response.ok) {
    // Never print the raw API response: authentication errors may contain key fragments.
    const disposition = response.status === 429 ? "failed" : response.status >= 500 ? "uncertain" : "blocked";
    const error = new ImageRequestError(`OpenAI image request returned HTTP ${response.status}. Check API billing, model access and limits.`, disposition);
    error.requestId = requestId;
    throw error;
  }
  let result;
  try { result = await response.json(); }
  catch { throw new ImageRequestError("Image response could not be read; no automatic retry.", "uncertain"); }
  const data = result.data?.[0]?.b64_json;
  if (result.data?.length !== 1 || typeof data !== "string" || !data.length || data.length > 50_000_000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(data)) {
    throw new ImageRequestError("Unexpected image payload; no automatic retry.", "uncertain");
  }
  return { buffer: Buffer.from(data, "base64"), requestId,
    usage: result.usage ? { total_tokens: result.usage.total_tokens, input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens } : null };
}

export async function loadReference(root, batch) {
  const reference = await readFile(join(root, batch.reference));
  const hash = createHash("sha256").update(reference).digest("hex");
  if (batch.referenceSha256 && batch.referenceSha256 !== hash) throw new Error("Van reference changed during this batch.");
  batch.referenceSha256 = hash;
  return reference;
}

const xml = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

export function headlineLines(text) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (word.length > 30) throw new Error("Headline word is too long for this layout.");
    if (line && `${line} ${word}`.length > 30) { lines.push(line); line = word; }
    else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  if (!lines.length || lines.length > 3) throw new Error("Headline does not fit; shorten it before rendering.");
  return lines;
}

export async function renderCampaign({ source, item, business }) {
  const metadata = await sharp(source, { limitInputPixels: 20_000_000 }).metadata();
  if (metadata.width !== 1536 || metadata.height !== 1024 || metadata.format !== "png") throw new Error("Expected a 1536x1024 PNG from the image API.");
  const art = await sharp(source).resize(1080,720).png().toBuffer();
  const { background, ink, accent } = item.style;
  const lines = headlineLines(item.headline);
  const hiring = item.pillar === "hiring";
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
    <rect y="720" width="1080" height="360" fill="${background}"/>
    <rect y="720" width="1080" height="8" fill="${accent}"/>
  </svg>`);
  // Explicit fontfile avoids silent SVG font substitution on Windows/runners.
  const textLayer = async (text, size, color, top, left = 56) => {
    const { data, info } = await sharp({ text: {
      text: `<span foreground="${color}">${xml(text)}</span>`,
      font: `Quicksand Bold ${size}`, fontfile: join(ROOT, "assets/fonts/Quicksand.ttf"),
      rgba: true, dpi: 72
    } }).png().toBuffer({ resolveWithObject: true });
    if (left + info.width > 1024 || top + info.height > 1060) throw new Error("Ad text exceeds its safe area; shorten the copy before rendering.");
    return { input: data, left, top };
  };
  const typography = await Promise.all([
    textLayer(hiring ? "WE’RE HIRING GROOMERS" : "MOBILE DOG GROOMING · TRI-CITIES", 22, accent, 747),
    ...lines.map((line, i) => textLayer(line, 52, ink, 788 + (3 - lines.length) * 29 + i * 58)),
    textLayer(business.name, 30, ink, 973, 170),
    textLayer(hiring ? `Let’s talk: ${business.phone}` : `Ask about availability: ${business.website}`, 26, accent, 1016, 170)
  ]);
  return sharp({ create: { width: 1080, height: 1080, channels: 3, background } })
    .composite([{ input: art, top: 0, left: 0 }, { input: overlay }, ...typography, await logoLayer(sharp,{left:56,top:966,size:94})]).jpeg({ quality: 93 }).toBuffer();
}

export function campaignFromItem(batch, item, today) {
  return { id: item.id, freshCopy: !!item.freshCopy, ...(item.targetDate ? {targetDate: item.targetDate} : {}), pillar: item.pillar, objective: item.objective, headline: item.headline,
    caption: item.caption, asset: item.asset, generator: PROVIDER, sourceTemplateId: item.sourceTemplateId,
    createdAt: today, availableFrom: today, expiresOn: addDays(today, 60), batchId: batch.id };
}
