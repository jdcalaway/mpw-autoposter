// Builds a rolling content calendar from the pillar engine and writes
// content/calendar.json. Preserves any status/image/issue data for dates that
// already exist, so re-running never clobbers posts already in flight.
//
// Usage:  node scripts/generate-calendar.mjs [--days 30] [--start YYYY-MM-DD] [--shuffle N]

import { loadConfig, loadPillars, loadCalendar, saveCalendar, todayLocal, addDays } from "./lib/util.mjs";
import { chooseConcept, readContent } from "./lib/campaigns.mjs";
import { writeFile } from "node:fs/promises";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function buildHashtags(pillars, key, area) {
  const p = pillars.pillars[key];
  let tags = pillars.baseTags.concat(p.tags);
  if (area) {
    const clean = area.replace(/[^a-zA-Z0-9]/g, "");
    if (clean) tags.push("#" + clean, "#" + clean + "Dogs");
  }
  return tags.join(" ");
}

async function main() {
  const cfg = await loadConfig();
  const pillars = await loadPillars();
  const days = parseInt(arg("days", "30"), 10);
  const start = arg("start", todayLocal(cfg.timezone));
  const shuffle = parseInt(arg("shuffle", "0"), 10);
  const area = cfg.business.serviceArea || "";

  const existing = await loadCalendar();
  const concepts = await readContent("campaigns.json", []);
  const { reviews } = await readContent("reviews.json", { reviews: [] });
  const byDate = new Map(existing.posts.filter(p => !p.isTest).map((p) => [p.date, p]));
  const counters = {};
  const posts = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    let key = pillars.weekdayMap[dow];
    const history = [...existing.posts.filter(p => p.date < start || p.isTest), ...posts];
    const concept = chooseConcept({ key, date, concepts, reviews, history });
    if (key === "testimonial" && !concept?.review) key = "booking";
    const p = pillars.pillars[key];
    counters[key] = (counters[key] || 0) + 1;
    const idx = (counters[key] - 1 + shuffle) % p.captions.length;
    const caption = p.captions[idx].replace(/\{area\}/g, area || "your area");

    const prior = byDate.get(date);
    if (prior && prior.status && prior.status !== "planned") {
      // A post already in flight (approved/posted/skipped/pending) — leave it be.
      posts.push(prior);
      continue;
    }

    posts.push({
      id: date,
      date,
      time: p.time,
      datetimeLocal: `${date}T${p.time}:00`,
      pillar: key,
      pillarLabel: p.label,
      caption,
      hashtags: buildHashtags(pillars, key, area),
      imageIdea: p.imageIdea,
      prefersPhoto: !!p.prefersPhoto,
      graphicText: p.graphicLines?.[idx % p.graphicLines.length],
      ...(concept || {}),
      image: null,
      imageUrl: null,
      issueNumber: null,
      status: "planned",
    });
  }

  const result = { generatedAt: new Date().toISOString(), timezone: cfg.timezone,
    posts: [...existing.posts.filter(p => p.isTest || p.date < start || p.date >= addDays(start, days)), ...posts]
      .sort((a,b) => a.date.localeCompare(b.date)) };
  const output = arg("output", "");
  if (output) await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  else await saveCalendar(result);
  console.log(`Wrote ${posts.length} posts, ${start} → ${addDays(start, days - 1)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
