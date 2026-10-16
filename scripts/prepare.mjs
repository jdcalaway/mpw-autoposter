import { contentHoldReason, fingerprint } from "./lib/content-policy.mjs";
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
  loadConfig, loadCalendar, saveCalendar, todayLocal, addDays, rawUrl, log,
} from "./lib/util.mjs";
import { creativeHoldReason } from "./lib/creative-policy.mjs";
import { resolveImage } from "./lib/images.mjs";
import { createIssue } from "./lib/github.mjs";

const IMAGES_ONLY = process.argv.includes("--images-only");
const ISSUES_ONLY = process.argv.includes("--issues-only");

function inHorizon(cfg, post) {
  const today = todayLocal(cfg.timezone);
  return post.date === today || post.date === addDays(today, 1);
}

async function resolveImages(cfg, cal) {
  let changed = false;
  for (const post of cal.posts) {
    if (post.status !== "planned" || post.image || !inHorizon(cfg, post)) continue;
    const hold = creativeHoldReason(post, cal.posts);
    if (hold) { log(`${post.date}: ${hold}`); continue; }
    const { relPath, source, sourceName, videoRelPath, mediaSource } = await resolveImage({ cfg, post, posts: cal.posts });
    post.mediaSource = mediaSource;
    post.videoRelPath = videoRelPath;
    post.image = relPath;
    post.imageUrl = rawUrl(relPath);
    post.imageSource = source;
    if (source === "reel") {
      post.mediaType = "reel";
      post.videoUrl = rawUrl(videoRelPath);
    } else {
      delete post.mediaType;
      delete post.videoUrl;
    }
    await fingerprint(post);
    post.contentHold = contentHoldReason(post, cal.posts);
    changed = true;
    log(`Resolved image for ${post.date} (${post.pillar}, ${source}).`);
  }
  return changed;
}

async function openIssues(cfg, cal) {
  let changed = false;
  for (const post of cal.posts) {
    if (post.status !== "planned" || !post.image || post.issueNumber || !inHorizon(cfg, post)) continue;

    const hold = creativeHoldReason(post, cal.posts) || contentHoldReason(post, cal.posts);
    if (hold) { log(`${post.date}: ${hold}`); continue; }
    const title = `📅 Approve ${post.date} — ${post.pillarLabel} (${post.time})`;
    const body = [
      `**Scheduled:** ${post.datetimeLocal.replace("T", " ")} (${cfg.timezone})`,
      post.illustration ? "**Creative:** AI illustration — not an actual client pet or employee photograph. Check the van branding, animal/groomer details, headline and contact information before approving." : "",
      post.review ? `**Review source:** ${post.review.sourceUrl}\n**Reviewer:** ${post.review.author} · ${post.review.rating}/5\nVerify the quote and attribution before approving.` : "",
      `**Pillar:** ${post.pillarLabel}${post.imageSource === "reel" ? " · 🎬 Reel (video)" : post.imageSource === "graphic" ? " · auto-generated graphic" : post.imageSource === "illustration" ? " · AI campaign artwork" : " · your photo"}`,
      "",
      `![preview](${post.imageUrl})`,
      post.mediaType === "reel" ? `\n▶️ **[Watch the Reel](${post.videoUrl})** before approving` : "",
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
  for (const post of cal.posts) await fingerprint(post);

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
