// MoeGo puller — runs on YOUR machine (Claude's browser tools are blocked from
// MoeGo's domain, so this does the work locally with your own login).
//
// Setup (one time):
//   cd moego && npm install && npx playwright install chromium
//
// Step 1 — sign in once so we have a session (saved to .auth.json):
//   npm run discover     (log into MoeGo in the window that opens)
//
// Step 2 — pull the last N days of grooming reports into the poster's library:
//   npm run pull                 (default: last 7 days)
//   node pull.mjs --pull --days 14
//
// Reads report photos from MoeGo's fulfillmentReport API (cookie auth) and
// builds a branded before/after image per report in images/photos/transformation/.
// .auth.json / discovery.json / pulled.json are git-ignored.

import { chromium } from "playwright";
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

const ymd = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const cleanName = (s) => (s || "pup").replace(/[^A-Za-z0-9' ]+/g, "").trim() || "pup";
const slugify = (s) => cleanName(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const escapeXml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
      if (!/moego\.pet|amazonaws|cloudfront|imgix|\.(jpg|jpeg|png|webp)/i.test(url)) return;
      const ct = res.headers()["content-type"] || "";
      const rec = { method: req.method(), status: res.status(), type: req.resourceType(), url, contentType: ct };
      if (req.method() === "POST") rec.reqBody = (req.postData() || "").slice(0, 4000);
      if (ct.includes("application/json") && req.resourceType() !== "document") {
        rec.body = (await res.text().catch(() => "")).slice(0, 8000);
      }
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

// ---------- PULL (download reports -> branded before/after images) ----------
async function fetchImage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`image ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function makeBeforeAfter(sharp, { photos, pet }) {
  const W = 1080, H = 1350;
  const slotW = 452, slotH = 604, gap = 24, py = 372;
  const leftX = Math.round((W - (slotW * 2 + gap)) / 2);
  const rightX = leftX + slotW + gap;
  const both = photos.length >= 2;
  const imgs = await Promise.all(
    (both ? [photos[0], photos[1]] : [photos[0]]).map(async (u) =>
      sharp(await fetchImage(u)).resize(both ? slotW : slotW * 2 + gap, slotH, { fit: "cover" }).jpeg().toBuffer()
    )
  );

  const font = "Quicksand, 'Segoe UI', Arial, sans-serif";
  const blue = "#0146A3", gold = "#FFD25A", navy = "#172E4D", muted = "#6B7A8F";
  const headline = `${cleanName(pet)}'s Spa Day`;
  const labels = both
    ? `<text x="${leftX + slotW / 2}" y="${py - 22}" text-anchor="middle" font-family="${font}" font-size="30" font-weight="700" fill="${gold}">BEFORE</text>
       <text x="${rightX + slotW / 2}" y="${py - 22}" text-anchor="middle" font-family="${font}" font-size="30" font-weight="700" fill="${gold}">AFTER</text>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${blue}"/>
    <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="44" fill="#FFFFFF"/>
    <rect x="40" y="40" width="${W - 80}" height="18" rx="9" fill="${gold}"/>
    <text x="${W / 2}" y="150" text-anchor="middle" font-family="${font}" font-size="32" font-weight="700" letter-spacing="6" fill="${gold}">TRANSFORMATION</text>
    <text x="${W / 2}" y="232" text-anchor="middle" font-family="${font}" font-size="60" font-weight="700" fill="${navy}">${escapeXml(headline)}</text>
    ${labels}
    <text x="${W / 2}" y="${py + slotH + 66}" text-anchor="middle" font-family="${font}" font-size="30" font-weight="500" fill="${muted}">Groomed at home in the Tri-Cities</text>
    <text x="${W / 2}" y="${H - 150}" text-anchor="middle" font-family="${font}" font-size="46" font-weight="700" fill="${blue}">Mobile Pet Works</text>
    <text x="${W / 2}" y="${H - 104}" text-anchor="middle" font-family="${font}" font-size="30" font-weight="500" fill="${muted}">mobilepetworks.com  ·  (509) 591-5913</text>
  </svg>`;

  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  const layers = both
    ? [{ input: imgs[0], left: leftX, top: py }, { input: imgs[1], left: rightX, top: py }]
    : [{ input: imgs[0], left: leftX, top: py }];
  return sharp(base).composite(layers).jpeg({ quality: 88 }).toBuffer();
}

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

  const sharp = (await import("sharp")).default;
  const outDir = join(ROOT, "images", "photos", "transformation");
  await mkdir(outDir, { recursive: true });
  const manifest = [];

  for (const c of cards) {
    const sc = c.sendRecord && c.sendRecord[0] && c.sendRecord[0].sendContent;
    const photos = ((sc && sc.photos) || []).filter(Boolean);
    if (!photos.length) continue;
    const pet = cleanName(c.pet && c.pet.petName);
    const file = join(outDir, `${slugify(pet)}-${c.serviceDate}.jpg`);
    try {
      const img = await makeBeforeAfter(sharp, { photos, pet });
      await writeFile(file, img);
      const note = (sc.feedbacks || []).find((f) => f.key === "additional_note");
      manifest.push({
        pet, date: c.serviceDate, photos: photos.length,
        file: file.replace(ROOT + "\\", "").replace(/\\/g, "/"),
        note: (note && note.inputText) || "",
        frequency: (sc.recommendation && sc.recommendation.frequencyText) || "",
      });
      console.log(`  ✓ ${pet} (${photos.length === 2 ? "before/after" : "single"}) -> ${file.split(/[\\/]/).pop()}`);
    } catch (e) {
      console.log(`  ✗ ${pet}: ${e.message}`);
    }
  }
  await writeFile(join(HERE, "pulled.json"), JSON.stringify(manifest, null, 2));
  console.log(`\nDone: ${manifest.length} before/after images in images/photos/transformation/.`);
}

(MODE === "pull" ? pull() : discover()).catch((e) => {
  console.error(e);
  process.exit(1);
});
