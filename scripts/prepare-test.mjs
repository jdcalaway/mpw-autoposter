// Creates one separately approved smoke-test post per local day. Never publishes.
import { loadConfig, loadCalendar, saveCalendar, nowLocalString, rawUrl } from "./lib/util.mjs";
import { readContent } from "./lib/campaigns.mjs";
import { resolveImage } from "./lib/images.mjs";

const cfg = await loadConfig();
const cal = await loadCalendar();
const now = nowLocalString(cfg.timezone);
const date = now.slice(0, 10);
const id = `test-${date}`;
if (cal.posts.some(p => p.id === id)) {
  console.log(`Test ${id} already exists; no duplicate created.`);
} else {
  const concept = (await readContent("campaigns.json", [])).find(c => c.id === "booking-car");
  if (!concept?.asset) throw new Error("Booking test creative is missing.");
  const media = await resolveImage({ cfg, post: { date: id, pillar: "booking", creativeAsset: concept.asset } });
  const post = { id, date, isTest: true, time: now.slice(11, 16), datetimeLocal: now,
    pillar: "booking", pillarLabel: "Test — new van artwork", conceptId: concept.id,
    caption: concept.caption, hashtags: "#MobilePetWorks #TriCities #MobileDogGrooming",
    objective: "booking", illustration: true, creativeAsset: concept.asset,
    image: media.relPath, imageUrl: rawUrl(media.relPath), imageSource: media.source,
    issueNumber: null, status: "planned" };
  cal.posts.push(post);
  await saveCalendar(cal);
  console.log(`Created ${id}; owner approval is required before publishing.`);
}
