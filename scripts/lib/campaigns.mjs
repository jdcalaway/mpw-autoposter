import { contentHoldReason } from "./content-policy.mjs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT } from "./util.mjs";

export async function readContent(name, fallback) {
  try { return JSON.parse(await readFile(join(ROOT, "content", name), "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}

export function eligibleReview(r) {
  return r.verified === true && r.enabled !== false && r.rating >= 4 && r.rating <= 5 &&
    typeof r.text === "string" && r.text.trim().length > 0 && r.text.length <= 1500 &&
    typeof r.author === "string" && r.author.trim().length > 0 &&
    typeof r.sourceUrl === "string" && /^https:\/\//.test(r.sourceUrl) && !!r.id;
}

// Select whole concepts together; never select a caption independently of its artwork.
export function chooseConcept({ key, date, concepts, reviews, history = [] }) {
  if (key === "testimonial") {
    const unused = reviews.filter(eligibleReview).filter(r => !history.some(p => p.date !== date && (p.review?.id === r.id || p.review?.text === r.text)));
    if (unused.length) {
      const r = unused[0];
      return {
        conceptId: `review-${r.id}`, objective: "booking", review: r,
        caption: `“${r.text}”\n— ${r.author}, Google review (${r.rating}/5)\n\nThank you for trusting Mobile Pet Works. Ask about your dog's next appointment at mobilepetworks.com.`,
        graphicText: r.text, forceGraphic: true,
      };
    }
    key = "booking";
  }
  const choices = concepts.filter(c => c.pillar === key && c.asset && (!c.targetDate || c.targetDate === date) && (!c.availableFrom || c.availableFrom <= date) &&
    (!c.expiresOn || c.expiresOn >= date))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (!["booking", "hiring"].includes(key)) return null; // Photo pillars stay unchanged.
  const selected = choices.find(c => !contentHoldReason({id:date,date,caption:c.caption,graphicText:c.headline}, history) && !history.some(p => p.date !== date &&
    (p.conceptId === c.id || (p.creativeAsset && p.creativeAsset === c.asset))));
  // Avoid exhausting the library by repeating the same finished ad every week.
  if (!selected) return { awaitingCreative: true, creativeAsset: null, illustration: true };
  return { conceptId: selected.id, objective: selected.objective,
    caption: selected.caption, graphicText: selected.headline,
    creativeAsset: selected.asset || null, forceGraphic: !selected.asset,
    illustration: !!selected.asset };
}
