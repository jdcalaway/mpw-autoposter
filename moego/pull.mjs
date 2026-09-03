// MoeGo puller — runs on YOUR machine (Claude's browser tools are blocked from
// MoeGo's domain, so this does the work locally with your own login).
//
// Setup (one time):
//   cd moego
//   npm install
//   npx playwright install chromium
//
// Step 1 — discover (log in once, record how MoeGo works):
//   npm run discover
//   A Chrome window opens. Log into MoeGo yourself. Then, when prompted, open
//   ONE finished appointment's grooming report (the one with Before/After
//   photos). The script saves your session to .auth.json and writes
//   discovery.json for Claude to read.
//
// Step 2 — pull (added after Claude reads discovery.json):
//   npm run pull
//
// Nothing here is committed with secrets: .auth.json / discovery.json are
// git-ignored.

import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTH = join(HERE, ".auth.json");
const CALENDAR_URL = "https://go.moego.pet/calendar/grooming";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODE = process.argv.includes("--pull") ? "pull" : "discover";

async function openContext() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext(existsSync(AUTH) ? { storageState: AUTH } : {});
  const page = await context.newPage();
  return { browser, context, page };
}

async function waitForCalendar(page) {
  console.log("\nWaiting for the grooming calendar to load — log in if MoeGo prompts you...");
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    if (/\/calendar\//.test(page.url())) return true;
    await sleep(1500);
  }
  return /\/calendar\//.test(page.url());
}

async function discover() {
  const { browser, context, page } = await openContext();

  const captured = [];
  page.on("response", async (res) => {
    try {
      const req = res.request();
      const url = res.url();
      if (!/moego\.pet|amazonaws|cloudfront|imgix|aliyun|\.jpg|\.jpeg|\.png|\.webp/i.test(url)) return;
      const ct = res.headers()["content-type"] || "";
      const rec = { method: req.method(), status: res.status(), type: req.resourceType(), url, contentType: ct };
      if (ct.includes("application/json") && req.resourceType() !== "document") {
        rec.body = (await res.text().catch(() => "")).slice(0, 8000);
      }
      captured.push(rec);
    } catch { /* ignore */ }
  });

  console.log("\n=== MoeGo puller — DISCOVERY ===");
  await page.goto(CALENDAR_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  const ok = await waitForCalendar(page);
  if (!ok) console.log("!! Didn't reach the calendar. Log in, then re-run `npm run discover`.");

  await context.storageState({ path: AUTH });
  console.log("✓ Session saved to .auth.json (no login needed next time).");

  await sleep(4000); // let the calendar's own API calls fire

  console.log("\n>>> NOW, in the MoeGo window:");
  console.log(">>> 1) Click a FINISHED appointment from the last few days.");
  console.log(">>> 2) Open its GROOMING REPORT (the one showing Before/After photos).");
  console.log(">>> Recording MoeGo's network calls for 90 seconds...\n");
  await sleep(90000);

  await writeFile(join(HERE, "discovery.json"), JSON.stringify(captured, null, 2));
  await page.screenshot({ path: join(HERE, "last-screen.png") }).catch(() => {});
  console.log(`\n✓ Captured ${captured.length} requests -> moego/discovery.json`);
  console.log("Done — you can close the window and tell Claude it finished.");
  await browser.close();
}

async function pull() {
  console.log("The pull step isn't built yet — run `npm run discover` first and let Claude read discovery.json.");
}

(MODE === "pull" ? pull() : discover()).catch((e) => {
  console.error(e);
  process.exit(1);
});
