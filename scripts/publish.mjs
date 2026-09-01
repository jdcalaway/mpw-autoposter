// Runs hourly. For every post that is due (scheduled time has passed) and still
// awaiting a decision, it reads the approval issue and acts:
//   👍 approver reaction -> publish to Facebook + Instagram, close the issue
//   👎 approver reaction -> mark skipped, close the issue
//   no reaction past the grace window -> mark skipped (held; never auto-posts)

import { loadConfig, loadCalendar, saveCalendar, nowLocalString, log } from "./lib/util.mjs";
import { approvalDecision, commentIssue, closeIssue } from "./lib/github.mjs";
import { postToFacebook, postToInstagram } from "./lib/meta.mjs";

function hoursBetween(aLocal, bLocal) {
  return (new Date(bLocal + "Z") - new Date(aLocal + "Z")) / 3.6e6;
}

async function main() {
  const cfg = await loadConfig();
  const cal = await loadCalendar();
  const now = nowLocalString(cfg.timezone);

  if (cfg.approverLogin.startsWith("REPLACE_")) {
    throw new Error('Set "approverLogin" in config.json to your GitHub username first.');
  }

  let changed = false;
  for (const post of cal.posts) {
    if (post.status !== "pending_approval") continue;
    if (now < post.datetimeLocal) continue; // not due yet

    const decision = await approvalDecision(post.issueNumber, cfg.approverLogin);

    if (decision === "pending") {
      if (hoursBetween(post.datetimeLocal, now) > (cfg.approvalGraceHours || 12)) {
        post.status = "skipped";
        changed = true;
        await commentIssue(post.issueNumber, "⏰ No approval within the grace window — held and skipped. Nothing was posted.");
        await closeIssue(post.issueNumber);
        log(`Skipped ${post.date} (no approval in time).`);
      }
      continue;
    }

    if (decision === "skipped") {
      post.status = "skipped";
      changed = true;
      await commentIssue(post.issueNumber, "👎 Skipped by you. Nothing was posted.");
      await closeIssue(post.issueNumber);
      log(`Skipped ${post.date} (thumbs-down).`);
      continue;
    }

    // Approved — publish.
    const message = `${post.caption}\n\n${post.hashtags}`;
    try {
      const fb = await postToFacebook({ cfg, imageUrl: post.imageUrl, message });
      const ig = await postToInstagram({ cfg, imageUrl: post.imageUrl, caption: message });
      post.status = "posted";
      post.postedAt = now;
      post.results = { facebook: fb.post_id || fb.id, instagram: ig.id };
      changed = true;
      await commentIssue(
        post.issueNumber,
        `✅ Published.\n- Facebook: \`${post.results.facebook}\`\n- Instagram: \`${post.results.instagram}\``
      );
      await closeIssue(post.issueNumber);
      log(`Published ${post.date} to FB + IG.`);
    } catch (err) {
      // Leave status at pending_approval and the issue open so the next hourly
      // run retries (the approval still stands).
      post.error = String(err.message || err);
      changed = true;
      await commentIssue(post.issueNumber, `❌ Publish failed — will retry next run.\n\n\`\`\`\n${post.error}\n\`\`\``);
      log(`FAILED ${post.date}: ${post.error}`);
    }
  }

  if (changed) {
    await saveCalendar(cal);
    log("Calendar updated.");
  } else {
    log("Nothing due.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
