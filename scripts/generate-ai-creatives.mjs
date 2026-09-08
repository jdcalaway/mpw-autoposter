import { readFile, writeFile, mkdir, rename, appendFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { ROOT, todayLocal } from "./lib/util.mjs";
import { PROVIDER, SETTINGS_PATH, LEDGER_PATH, planBatch, requestBlock, generateArtwork,
  loadReference, renderCampaign, campaignFromItem, ImageRequestError } from "./lib/ai-creative.mjs";

const CAMPAIGNS_PATH = "content/campaigns.json";
const json = async path => JSON.parse(await readFile(path, "utf8"));
async function atomicWrite(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, data);
  await rename(`${path}.tmp`, path);
}

// Every paid attempt must reach origin/main first. A runner crash then leaves a
// durable "requesting" state, so a rerun cannot unknowingly buy the image again.
export function gitCheckpoint(root) {
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.GITHUB_REPOSITORY !== "jdcalaway/mpw-autoposter" || process.env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("Paid generation must run from this repository's main branch in GitHub Actions.");
  }
  if (git(["diff", "--cached", "--name-only"]).trim()) throw new Error("Unexpected staged changes.");
  return async () => {
    git(["add", "--", LEDGER_PATH, CAMPAIGNS_PATH, "images/creative/cloud"]);
    if (git(["diff", "--cached", "--name-only"]).trim()) {
      git(["commit", "-m", "Checkpoint weekly AI creatives [skip ci]"]);
    }
    // Shared mpw-write concurrency serializes the scheduled workflows. If a
    // human pushes meanwhile, fail without a force push or another API call.
    git(["push", "origin", "HEAD:main"]);
  };
}

export async function runGeneration({ root = ROOT, today, apiKey, preview = true,
  checkpoint, generate = generateArtwork, render = renderCampaign }) {
  const [settings, ledger, campaigns, cfg] = await Promise.all([
    json(join(root, SETTINGS_PATH)), json(join(root, LEDGER_PATH)),
    json(join(root, CAMPAIGNS_PATH)), json(join(root, "config.json"))
  ]);
  today ||= todayLocal(cfg.timezone);
  const plan = planBatch({ ledger, campaigns, settings, today });
  if (!plan.batch) return { status: "not-due", nextDate: plan.nextDate };
  const batch = plan.batch;
  if (preview) return { status: "preview", isNew: plan.isNew, batch };
  if (!apiKey) throw new Error("Add the OPENAI_API_KEY repository Actions secret to enable cloud images. No API requests made.");
  if (typeof checkpoint !== "function") throw new Error("A durable checkpoint is required before paid generation.");
  for (const item of batch.items) {
    if (!/^ai-\d{4}-\d{2}-\d{2}-(booking|hiring)$/.test(item.id) ||
      item.asset !== `images/creative/cloud/${item.id}.jpg` ||
      item.sourceAsset !== `images/creative/cloud/${item.id}-source.png`) throw new Error("Unexpected cloud asset path.");
  }
  if (batch.reference !== settings.reference) throw new Error("Unexpected reference file.");
  const reference = await loadReference(root, batch);
  if (plan.isNew) ledger.batches.push(batch);
  await mkdir(join(root, "images/creative/cloud"), { recursive: true });
  const persist = async () => {
    await atomicWrite(join(root, LEDGER_PATH), JSON.stringify(ledger, null, 2) + "\n");
    await atomicWrite(join(root, CAMPAIGNS_PATH), JSON.stringify(campaigns, null, 2) + "\n");
    await checkpoint();
  };
  let runRequests = 0;
  for (const item of batch.items) {
    if (item.status === "complete") continue;
    if (item.status !== "received") {
      const blocked = requestBlock({ ledger, item, settings, today, runRequests });
      if (blocked) throw new Error(`${item.id}: ${blocked}`);
      const attempt = { date: today, startedAt: new Date().toISOString(), status: "requesting" };
      item.attempts.push(attempt);
      item.status = "requesting";
      await persist(); // If this push fails, do not send the request.
      runRequests++;
      let result;
      try { result = await generate({ batch, item, reference, apiKey }); }
      catch (error) {
        item.status = error instanceof ImageRequestError ? error.disposition : "uncertain";
        attempt.status = item.status;
        attempt.message = error instanceof ImageRequestError ? error.message : "Image generation interrupted; inspect the run before retrying.";
        attempt.requestId = error.requestId || null;
        await persist();
        throw new Error(`${item.id}: ${attempt.message}`);
      }
      // Preserve the paid source separately: a rendering failure can be fixed
      // and resumed without generating (or charging for) the image again.
      await atomicWrite(join(root, item.sourceAsset), result.buffer);
      item.status = "received";
      attempt.status = "received";
      attempt.requestId = result.requestId;
      attempt.usage = result.usage;
      await persist();
    }
    const source = await readFile(join(root, item.sourceAsset));
    const finished = await render({ source, item, business: cfg.business });
    await atomicWrite(join(root, item.asset), finished);
    if (!campaigns.some(c => c.id === item.id)) campaigns.push(campaignFromItem(batch, item, today));
    item.status = "complete";
    if (!batch.assets.includes(item.asset)) batch.assets.push(item.asset);
    if (batch.items.every(i => i.status === "complete")) {
      batch.status = "complete";
      batch.completedOn = today;
    }
    await persist();
  }
  return { status: "complete", batch, requests: runRequests };
}

async function summary(result) {
  const lines = ["## Mobile Pet Works weekly AI artwork", ""];
  if (result.status === "not-due") lines.push(`Next batch is due ${result.nextDate}. No API request made.`);
  else if (result.status === "paused") lines.push("Cloud image generation is paused. No API request made.");
  else {
    lines.push(result.status === "preview" ? "Preview only: no API request, image generation or content change." : `Batch completed with ${result.requests} new API request(s).`, "");
    for (const item of result.batch.items) {
      lines.push(`### ${item.pillar}: ${item.headline}`, `Style: ${item.style.name}. Status: ${item.status}.`, "", item.caption, "");
      if (item.status === "complete") lines.push(`![${item.pillar} artwork](https://raw.githubusercontent.com/jdcalaway/mpw-autoposter/main/${item.asset})`, "");
    }
    lines.push("The daily Prepare approval workflow picks up these campaigns. Social posting still requires the owner's thumbs-up.");
  }
  const text = lines.join("\n") + "\n";
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => !["--generate", "--preview"].includes(a)) || args.length > 1) throw new Error("Use --preview (default) or --generate.");
  const preview = !args.includes("--generate");
  if (!preview && process.env.AI_IMAGES_PAUSED === "true") return summary({ status: "paused" });
  const result = await runGeneration({ preview, apiKey: process.env.OPENAI_API_KEY,
    checkpoint: preview ? undefined : gitCheckpoint(ROOT) });
  await summary(result);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(async error => {
    // Never log raw HTTP bodies, headers, environment, or API keys.
    const message = error.spawnargs || error.status !== undefined ? "Git checkpoint failed. No further API requests were made; inspect branch changes before retrying." : error.message;
    console.error(message);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\nCloud artwork stopped: ${message}\nSee docs/cloud-ai-images.md for recovery.\n`);
    process.exitCode = 1;
  });
}
