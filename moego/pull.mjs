// MoeGo puller — runs on YOUR machine (Claude's browser tools are blocked from
// MoeGo's domain, so this does the work locally with your own login).
//
// Setup (one time):
//   cd moego && npm install && npx playwright install chromium
// Sign in once (session saved to .auth.json):
//   npm run discover
// Pull the last N days of grooming reports into the poster's library:
//   npm run pull                 (default: last 7 days)
//   node pull.mjs --pull --days 14
//
// Before/after images are rendered with a real headless-browser HTML/CSS
// template (Quicksand web font, gradients, shadows, emoji) for a polished look.
// .auth.json / discovery.json / pulled.json are git-ignored.

import { chromium } from "playwright";
import sharp from "sharp";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const AUTH = join(HERE, ".auth.json");
const CALENDAR_URL = "https://go.moego.pet/calendar/grooming";
const REPORT_API = "https://go.moego.pet/moego.bff/fulfillment/listFulfillmentReport";
const TZ = "America/Los_Angeles";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MODE = process.argv.includes("--pull") ? "pull" : "discover";
const argVal = (name, def) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const cleanName = (s) => (s || "pup").replace(/[^A-Za-z0-9' ]+/g, "").trim() || "pup";
const slugify = (s) => cleanName(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- DISCOVERY (one-time login + API recording) ----------
async function discover() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext(existsSync(AUTH) ? { storageState: AUTH } : {});
  const page = await context.newPage();
  const captured = [];
  page.on("response", async (res) => {
    try {
      const req = res.request();
      const url = res.url();
      if (!/moego\.pet|amazonaws|cloudfront|\.(jpg|jpeg|png|webp)/i.test(url)) return;
      const ct = res.headers()["content-type"] || "";
      const rec = { method: req.method(), status: res.status(), url, contentType: ct };
      if (req.method() === "POST") rec.reqBody = (req.postData() || "").slice(0, 4000);
      if (ct.includes("application/json")) rec.body = (await res.text().catch(() => "")).slice(0, 8000);
      captured.push(rec);
    } catch { /* ignore */ }
  });
  console.log("\n=== MoeGo — DISCOVERY (log in if prompted) ===");
  await page.goto(CALENDAR_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline && !/\/calendar\//.test(page.url())) await sleep(1500);
  await context.storageState({ path: AUTH });
  console.log("✓ Session saved to .auth.json.");
  await sleep(4000);
  console.log(">>> Open one finished appointment's grooming report; recording 90s...");
  await sleep(90000);
  await writeFile(join(HERE, "discovery.json"), JSON.stringify(captured, null, 2));
  console.log(`✓ Captured ${captured.length} requests -> discovery.json. Done.`);
  await browser.close();
}

// ---------- HTML template for a before/after card ----------
function cardHtml({ photos, pet, note }) {
  const both = photos.length >= 2;
  const quote = note ? `“${esc(note)}”` : "Groomed with love, right at home 🐾";
  const pics = both
    ? `<div class="pair">
         <figure><span class="badge">BEFORE</span><img src="${esc(photos[0])}"></figure>
         <div class="arrow">→</div>
         <figure><span class="badge">AFTER</span><img src="${esc(photos[1])}"></figure>
       </div>`
    : `<div class="pair"><figure class="single"><img src="${esc(photos[0])}"></figure></div>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  :root{--blue:#0146A3;--blue2:#012c6b;--gold:#FFD25A;--navy:#172E4D;--muted:#6B7A8F;--cream:#FFFDF9;}
  *{margin:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;}
  body{width:1080px;height:1350px;font-family:'Quicksand',sans-serif;background:linear-gradient(155deg,var(--blue),var(--blue2));display:flex;align-items:center;justify-content:center;}
  .card{position:relative;width:1012px;height:1282px;background:var(--cream);border-radius:54px;box-shadow:0 26px 70px rgba(0,0,0,.30);overflow:hidden;padding:60px 54px 0;text-align:center;}
  .card::before{content:'';position:absolute;top:0;left:0;right:0;height:20px;background:linear-gradient(90deg,var(--gold),#ffc42d);}
  .paw{position:absolute;font-size:130px;opacity:.06;user-select:none;}
  .tag{display:inline-block;background:var(--gold);color:var(--navy);font-weight:700;letter-spacing:3px;font-size:23px;padding:9px 24px;border-radius:30px;margin-top:6px;}
  h1{font-size:92px;font-weight:700;color:var(--navy);line-height:1;margin:16px 0 4px;}
  .swash{width:130px;height:7px;background:var(--gold);border-radius:4px;margin:0 auto 10px;}
  .sub{color:var(--muted);font-size:30px;font-weight:500;margin-bottom:34px;}
  .pair{display:flex;align-items:center;justify-content:center;}
  figure{position:relative;width:430px;height:566px;border-radius:28px;overflow:hidden;border:6px solid var(--gold);box-shadow:0 14px 32px rgba(1,44,107,.28);}
  figure.single{width:892px;}
  figure img{width:100%;height:100%;object-fit:cover;display:block;}
  .badge{position:absolute;top:18px;left:18px;background:var(--blue);color:#fff;font-weight:700;font-size:23px;letter-spacing:2px;padding:7px 18px;border-radius:22px;z-index:2;}
  .arrow{flex:0 0 auto;width:78px;height:78px;margin:0 -22px;z-index:3;background:var(--gold);color:var(--navy);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:700;box-shadow:0 8px 18px rgba(0,0,0,.22);}
  .quote{font-style:italic;color:var(--navy);font-size:35px;font-weight:500;line-height:1.35;margin:40px 34px 0;}
  .footer{position:absolute;left:0;right:0;bottom:52px;}
  .brand{color:var(--blue);font-weight:700;font-size:50px;}
  .contact{color:var(--muted);font-weight:500;font-size:30px;margin-top:6px;}
</style></head>
<body><div class="card">
  <div class="paw" style="top:118px;left:34px;transform:rotate(-18deg)">🐾</div>
  <div class="paw" style="bottom:196px;right:34px;transform:rotate(14deg)">🐾</div>
  <div class="tag">✨ TRANSFORMATION</div>
  <h1>${esc(cleanName(pet))}</h1>
  <div class="swash"></div>
  <div class="sub">fresh from the grooming van 🚐</div>
  ${pics}
  <div class="quote">${quote}</div>
  <div class="footer"><div class="brand">Mobile Pet Works</div><div class="contact">mobilepetworks.com &nbsp;·&nbsp; (509) 591-5913</div></div>
</div></body></html>`;
}

// ---------- PULL ----------
async function pull() {
  const days = parseInt(argVal("--days", "7"), 10);
  if (!existsSync(AUTH)) return console.log("No session — run `npm run discover` first.");
  const auth = JSON.parse(await readFile(AUTH, "utf8"));
  const cookies = auth.cookies.filter((c) => /moego/.test(c.domain)).map((c) => `${c.name}=${c.value}`).join("; ");
  const now = new Date();
  const end = ymd(now), start = ymd(new Date(now.getTime() - (days - 1) * 86400000));

  const res = await fetch(REPORT_API, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookies },
    body: JSON.stringify({ filter: { reportIds: [], appointmentIds: [], careTypes: [], startDate: start, endDate: end }, pagination: { offset: 0, limit: 1000 } }),
  });
  if (res.status === 401 || res.status === 403) return console.log("Session expired — re-run `npm run discover`.");
  const j = await res.json();
  const cards = j.fulfillmentReportCards || [];
  console.log(`${start} → ${end}: ${cards.length} reports.`);

  const outDir = join(ROOT, "images", "photos", "transformation");
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
  const manifest = [];

  for (const c of cards) {
    const sc = c.sendRecord && c.sendRecord[0] && c.sendRecord[0].sendContent;
    const photos = ((sc && sc.photos) || []).filter(Boolean);
    if (!photos.length) continue;
    const pet = cleanName(c.pet && c.pet.petName);
    const noteF = (sc.feedbacks || []).find((f) => f.key === "additional_note");
    const noteText = (noteF && noteF.inputText) || "";
    const file = join(outDir, `${slugify(pet)}-${c.serviceDate}.jpg`);
    if (existsSync(file) && !process.argv.includes("--force")) {
      console.log(`  · ${pet} (already have it)`);
      continue;
    }
    try {
      await page.setContent(cardHtml({ photos, pet, note: noteText }), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const shot = await page.screenshot({ type: "png" });
      await writeFile(file, await sharp(shot).resize(1080, 1350).jpeg({ quality: 90 }).toBuffer());
      manifest.push({ pet, date: c.serviceDate, photos: photos.length, file: file.replace(ROOT + "\\", "").replace(/\\/g, "/"), note: noteText, frequency: (sc.recommendation && sc.recommendation.frequencyText) || "" });
      console.log(`  ✓ ${pet} (${photos.length === 2 ? "before/after" : "single"})`);
    } catch (e) {
      console.log(`  ✗ ${pet}: ${e.message}`);
    }
  }
  await browser.close();
  await writeFile(join(HERE, "pulled.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nDone: ${manifest.length} before/after images in images/photos/transformation/.`);
}

(MODE === "pull" ? pull() : discover()).catch((e) => { console.error(e); process.exit(1); });
