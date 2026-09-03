// Runs daily (morning PT), in two phases so the approval issue never references
// an image that isn't public yet:
//
//   --images-only : resolve tomorrow's image (photo or generated graphic) and
//                   record its path. The workflow commits these first.
//   --issues-only : for posts whose image is now committed but have no issue,
//                   open a GitHub Issue with an inline preview to 👍 / 👎.
//
// It handles any planned post dated today or tomorrow, so a missed run self-heals.

import {
  loadConfig, loadPillars, loadCalendar, saveCalendar, todayLocal, addDays, rawUrl, log,
} from "./lib/util.mjs";
import { resolveImage } from "./lib/images.mjs";
import { createIssue } from "./lib/github.mjs";

const IMAGES_ONLY = process.argv.includes("--images-only");
const ISSUES_ONLY = process.argv.includes("--issues-only");

// A real photo named like "daisy-2026-08-27.jpg" (from the MoeGo puller) carries
// the pet's name — pull it out so the caption can use it.
function petFromFilename(name) {
  const m = String(name || "").match(/^(.+?)-\d{4}-\d{2}-\d{2}\.[^.]+$/);
  if (!m) return null;
  return m[1].split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
const PET_CAPTIONS = [
  "{pet} came in for a spa day and left looking like a whole new pup! ✨ Before ➡️ after, done right at home in the {area}. 🐾 Book yours at mobilepetworks.com",
  "Look at {pet}'s glow-up! 🐩 Fresh, clean, and stress-free — no cages, no car ride, just our van in your driveway. Book at mobilepetworks.com 🚐",
  "Another happy pup 💛 {pet} is looking fabulous after a mobile groom. Want this for your dog? mobilepetworks.com 🐕✨",
];
const hashDate = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

function inHorizon(cfg, post) {
  const today = todayLocal(cfg.timezone);
  return post.date === today || post.date === addDays(today, 1);
}

async function resolveImages(cfg, cal) {
  const pillars = await loadPillars();
  const area = cfg.business.serviceArea || "your area";
  let changed = false;
  for (const post of cal.posts) {
    if (post.status !== "planned" || post.image || !inHorizon(cfg, post)) continue;
    const { relPath, source, sourceName } = await resolveImage({ cfg, post });
    post.image = relPath;
    post.imageUrl = rawUrl(relPath);
    post.imageSource = source;
    const gc = pillars.pillars[post.pillar].graphicCaptions;
    const pet = source === "photo" ? petFromFilename(sourceName) : null;
    if (pet) {
      // Real before/after photo with the pet's name baked into the filename.
      post.caption = PET_CAPTIONS[hashDate(post.date) % PET_CAPTIONS.length]
        .replace(/\{pet\}/g, pet)
        .replace(/\{area\}/g, area);
      post.pet = pet;
    } else if (source === "graphic" && gc && gc.length) {
      // Photo-based pillar fell back to a generated graphic — use a caption
      // that doesn't promise a photo (no "swipe to see the before & after").
      post.caption = gc[hashDate(post.date) % gc.length].replace(/\{area\}/g, area);
    }
    changed = true;
    log(`Resolved image for ${post.date} (${post.pillar}, ${source}).`);
  }
  return changed;
}

async function openIssues(cfg, cal) {
  let changed = false;
  for (const post of cal.posts) {
    if (post.status !== "planned" || !post.image || post.issueNumber || !inHorizon(cfg, post)) continue;

    const title = `📅 Approve ${post.date} — ${post.pillarLabel} (${post.time})`;
    const body = [
      `**Scheduled:** ${post.datetimeLocal.replace("T", " ")} (${cfg.timezone})`,
      `**Pillar:** ${post.pillarLabel}${post.imageSource === "graphic" ? " · auto-generated graphic" : " · your photo"}`,
      "",
      `![preview](${post.imageUrl})`,
      "",
      "**Caption**",
      "",
      post.caption,
      "",
      post.hashtags,
      "",
      "---",
      "👍 **React with a thumbs-up on this issue to approve** — it posts to Facebook **and** Instagram at the scheduled time.",
      "👎 React with thumbs-down to skip it.",
      "_No reaction by post time = it holds and won't publish._",
    ].join("\n");

    const issue = await createIssue({ title, body, labels: ["approval-pending"], assignees: [cfg.approverLogin] });
    post.issueNumber = issue.number;
    post.status = "pending_approval";
    changed = true;
    log(`Opened approval issue #${issue.number} for ${post.date}.`);
  }
  return changed;
}

async function main() {
  const cfg = await loadConfig();
  const cal = await loadCalendar();

  let changed = false;
  if (IMAGES_ONLY || !ISSUES_ONLY) changed = (await resolveImages(cfg, cal)) || changed;
  if (ISSUES_ONLY || !IMAGES_ONLY) changed = (await openIssues(cfg, cal)) || changed;

  if (changed) {
    await saveCalendar(cal);
    log("Calendar updated.");
  } else {
    log("Nothing to do.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
