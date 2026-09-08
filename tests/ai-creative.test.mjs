import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../scripts/lib/util.mjs";
import { planBatch, requestBlock, headlineLines, generateArtwork, ImageRequestError, renderCampaign } from "../scripts/lib/ai-creative.mjs";
import { runGeneration } from "../scripts/generate-ai-creatives.mjs";

const settings = JSON.parse(await readFile(join(ROOT, "content/ai-creative.json"), "utf8"));
const campaigns = JSON.parse(await readFile(join(ROOT, "content/campaigns.json"), "utf8"));
const fresh = () => ({ batches: [{ date: "2026-09-07", status: "complete", assets: ["old.png"] }] });
const plan = (ledger = fresh(), today = "2026-09-07") => planBatch({ ledger, campaigns, settings, today });
const copy = obj => structuredClone(obj);

test("first cloud batch is due immediately; subsequent batches wait seven days after completion", () => {
  const ledger = fresh();
  const { batch } = plan(ledger);
  assert.deepEqual(batch.items.map(i => i.pillar), ["booking", "hiring"]);
  batch.status = "complete"; batch.completedOn = "2026-09-09";
  ledger.batches.push(batch);
  assert.equal(plan(ledger, "2026-09-15").nextDate, "2026-09-16");
  const next = plan(ledger, "2026-09-16").batch;
  assert.notEqual(next.items[0].sourceTemplateId, batch.items[0].sourceTemplateId);
  assert.notEqual(next.items[0].style.name, batch.items[0].style.name);
});

test("unfinished batches resume their original prompts and captions; headlines fit without truncation", () => {
  const ledger = fresh();
  const first = plan(ledger).batch;
  ledger.batches.push(first);
  assert.equal(plan(ledger, "2026-10-01").batch, first);
  for (const c of campaigns.filter(c => ["booking", "hiring"].includes(c.pillar))) {
    assert.equal(headlineLines(c.headline).join(" "), c.headline);
  }
});

test("request limits cover reruns, uncertain outcomes, attempts, and monthly totals", () => {
  const ledger = fresh();
  const batch = plan(ledger).batch;
  ledger.batches.push(batch);
  const item = batch.items[0];
  const block = (today = "2026-09-07", runRequests = 0) => requestBlock({ ledger, item, settings, today, runRequests });
  assert.equal(block(), null);
  assert.match(block(undefined, 2), /Per-run/);
  item.status = "requesting";
  assert.match(block(), /uncertain/);
  item.status = "failed"; item.attempts.push({ date: "2026-09-07" });
  assert.match(block(), /already attempted/);
  assert.equal(block("2026-09-08"), null);
  item.attempts.push({ date: "2026-09-08" });
  assert.match(block("2026-09-09"), /Per-image/);
  item.attempts = [];
  batch.items[1].attempts = Array.from({ length: 12 }, () => ({ date: "2026-09-01" }));
  assert.match(block(), /Monthly/);
  assert.equal(block("2026-10-01"), null);
});

test("image request sends the photo, exact settings and one output; no retries or leaked API error body", async () => {
  const batch = plan().batch;
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/images/edits");
    assert.equal(options.body.get("model"), "gpt-image-2");
    assert.equal(options.body.get("n"), "1");
    assert.equal(options.body.get("quality"), "high");
    assert.equal(options.body.get("size"), "1536x1024");
    assert.equal(options.body.has("input_fidelity"), false);
    assert.equal(await options.body.get("image[]").text(), "reference-fixture");
    return new Response("secret-key-fragment", { status: 401 });
  };
  await assert.rejects(generateArtwork({ batch, item: batch.items[0], reference: Buffer.from("reference-fixture"), apiKey: "fixture-key", fetchImpl }), e => {
    assert.equal(e.disposition, "blocked"); assert.ok(!e.message.includes("secret-key")); return true;
  });
  assert.equal(calls, 1);
  await assert.rejects(generateArtwork({ batch, item: batch.items[0], reference: Buffer.from("fixture"), apiKey: "fixture",
    fetchImpl: async () => { throw new Error("network failed"); } }), e => e.disposition === "uncertain");
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mpw-ai-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "content"), { recursive: true });
  await mkdir(join(root, "images/creative"), { recursive: true });
  for (const [file, value] of Object.entries({ "content/ai-creative.json": settings, "content/campaigns.json": campaigns,
    "content/creative-batches.json": fresh(), "config.json": { timezone: "America/Los_Angeles", business: { name: "Mobile Pet Works", phone: "(509) 591-5913", website: "mobilepetworks.com" } } })) {
    await writeFile(join(root, file), JSON.stringify(value));
  }
  await writeFile(join(root, settings.reference), "fixture-only");
  const ledger = async () => JSON.parse(await readFile(join(root, "content/creative-batches.json"), "utf8"));
  return { root, ledger };
}
const fakeResult = () => ({ buffer: Buffer.from("source-fixture"), requestId: "test-request", usage: { total_tokens: 1 } });
const fakeRender = async () => Buffer.from("rendered-fixture");
const common = { today: "2026-09-07", preview: false, apiKey: "fixture", checkpoint: async () => {}, render: fakeRender };

test("preview and missing-key runs make no requests or content changes", async t => {
  const { root, ledger } = await fixture(t);
  const before = await ledger();
  const generate = async () => assert.fail("Must not call OpenAI");
  assert.equal((await runGeneration({ root, today: common.today, preview: true, generate })).status, "preview");
  await assert.rejects(runGeneration({ ...common, root, apiKey: "", generate }), /OPENAI_API_KEY/);
  assert.deepEqual(await ledger(), before);
});

test("failed durable reservation prevents the paid call and blocks an uncertain rerun", async t => {
  const { root, ledger } = await fixture(t);
  let calls = 0;
  const generate = async () => { calls++; return fakeResult(); };
  await assert.rejects(runGeneration({ ...common, root, generate, checkpoint: async () => { throw new Error("push failed"); } }), /push failed/);
  assert.equal(calls, 0);
  assert.equal((await ledger()).batches.at(-1).items[0].status, "requesting");
  await assert.rejects(runGeneration({ ...common, root, generate }), /uncertain/);
  assert.equal(calls, 0);
});

test("partial batches retain the first image and resume only the failed item the next day", async t => {
  const { root, ledger } = await fixture(t);
  let calls = 0;
  const generate = async () => {
    calls++;
    const saved = (await ledger()).batches.at(-1);
    assert.ok(saved.items.some(i => i.status === "requesting"));
    if (calls === 2) throw new ImageRequestError("Rate limited", "failed");
    return fakeResult();
  };
  await assert.rejects(runGeneration({ ...common, root, generate }), /Rate limited/);
  assert.equal((await ledger()).batches.at(-1).items[0].status, "complete");
  await assert.rejects(runGeneration({ ...common, root, generate }), /already attempted/);
  assert.equal(calls, 2);
  const result = await runGeneration({ ...common, root, today: "2026-09-08", generate });
  assert.equal(result.status, "complete"); assert.equal(calls, 3);
  const savedCampaigns = JSON.parse(await readFile(join(root, "content/campaigns.json"), "utf8"));
  assert.equal(savedCampaigns.filter(c => c.generator === "github-openai").length, 2);
  assert.equal((await runGeneration({ ...common, root, today: "2026-09-08", generate })).status, "not-due");
  assert.equal(calls, 3);
});

test("render failure keeps the paid source so rerendering does not buy it again", async t => {
  const { root, ledger } = await fixture(t);
  let calls = 0;
  const generate = async () => { calls++; return fakeResult(); };
  await assert.rejects(runGeneration({ ...common, root, generate, render: async () => { throw new Error("font/layout failed"); } }), /font\/layout/);
  assert.equal((await ledger()).batches.at(-1).items[0].status, "received");
  const result = await runGeneration({ ...common, root, generate });
  assert.equal(result.status, "complete"); assert.equal(calls, 2);
});

test("real renderer rejects invalid sources and makes platform-ready images for every base headline", async () => {
  const sharp = (await import("sharp")).default;
  const source = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#AACCEE" } }).png().toBuffer();
  for (const template of campaigns.filter(c => ["booking", "hiring"].includes(c.pillar) && !c.generator)) {
    const buffer = await renderCampaign({ source, item: { ...template, style: settings.styles[0] },
      business: { name: "Mobile Pet Works", phone: "(509) 591-5913", website: "mobilepetworks.com" } });
    const meta = await sharp(buffer).metadata();
    assert.equal(meta.width, 1080); assert.equal(meta.height, 1080); assert.equal(meta.format, "jpeg");
  }
  await assert.rejects(renderCampaign({ source: Buffer.from("invalid"), item: plan().batch.items[0], business: {} }));
});
