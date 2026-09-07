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
  const recent = history.filter(p => p.date < date &&
    (Date.parse(date) - Date.parse(p.date)) / 86400000 < 30 && p.status !== "skipped");
  if (key === "testimonial") {
    const unused = reviews.filter(eligibleReview).filter(r => !recent.some(p => p.review?.id === r.id));
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
  const choices = concepts.filter(c => c.pillar === key && (!c.availableFrom || c.availableFrom <= date) &&
    (!c.expiresOn || c.expiresOn >= date))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  if (!choices.length) return null; // Existing MoeGo/photo pillars still work.
  const selected = choices.find(c => !recent.some(p => p.conceptId === c.id));
  // Avoid exhausting the library by repeating the same finished ad every week.
  if (!selected) return null;
  return { conceptId: selected.id, objective: selected.objective,
    caption: selected.caption, graphicText: selected.headline,
    creativeAsset: selected.asset || null, forceGraphic: !selected.asset,
    illustration: !!selected.asset };
}
