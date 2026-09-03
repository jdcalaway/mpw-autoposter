// Builds a 1080x1920 before→after Reel (mp4) from two photos: renders a branded
// vertical frame for each with the headless browser, then ffmpeg wipes from
// BEFORE to AFTER. Silent AAC track so IG/FB accept it as a Reel/video.
//
// Used by the puller; also runnable standalone for testing:
//   node make-reel.mjs --pet tucker     (pulls that pet's photos from MoeGo)

import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { execFile } from "node:child_process";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const run = (bin, args) => new Promise((res, rej) => execFile(bin, args, (e, so, se) => (e ? rej(new Error(se || e.message)) : res(so))));

function frameHtml({ photo, label, pet }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  :root{--blue:#0146A3;--blue2:#012c6b;--gold:#FFD25A;--navy:#172E4D;--muted:#6B7A8F;--cream:#FFFDF9;}
  *{margin:0;box-sizing:border-box;-webkit-font-smoothing:antialiased;}
  body{width:1080px;height:1920px;font-family:'Quicksand',sans-serif;background:linear-gradient(155deg,var(--blue),var(--blue2));display:flex;align-items:center;justify-content:center;}
  .card{position:relative;width:1016px;height:1856px;background:var(--cream);border-radius:60px;overflow:hidden;padding:56px 48px 0;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.3);}
  .card::before{content:'';position:absolute;top:0;left:0;right:0;height:22px;background:linear-gradient(90deg,var(--gold),#ffc42d);}
  .paw{position:absolute;font-size:150px;opacity:.06;}
  .tag{display:inline-block;background:var(--gold);color:var(--navy);font-weight:700;letter-spacing:4px;font-size:28px;padding:11px 30px;border-radius:34px;margin-top:12px;}
  h1{font-size:118px;font-weight:700;color:var(--navy);line-height:1;margin:22px 0 8px;}
  .swash{width:170px;height:9px;background:var(--gold);border-radius:5px;margin:0 auto 14px;}
  .sub{color:var(--muted);font-size:38px;font-weight:500;margin-bottom:40px;}
  .photo{position:relative;width:900px;height:1080px;margin:0 auto;border-radius:36px;overflow:hidden;border:8px solid var(--gold);box-shadow:0 18px 40px rgba(1,44,107,.3);}
  .photo img{width:100%;height:100%;object-fit:cover;display:block;}
  .badge{position:absolute;top:26px;left:26px;background:var(--blue);color:#fff;font-weight:700;font-size:34px;letter-spacing:3px;padding:12px 30px;border-radius:30px;}
  .footer{position:absolute;left:0;right:0;bottom:60px;}
  .brand{color:var(--blue);font-weight:700;font-size:60px;}
  .cta{color:var(--navy);font-weight:600;font-size:36px;margin-top:12px;}
  .contact{color:var(--muted);font-weight:500;font-size:32px;margin-top:6px;}
</style></head>
<body><div class="card">
  <div class="paw" style="top:150px;left:30px;transform:rotate(-18deg)">🐾</div>
  <div class="paw" style="bottom:300px;right:30px;transform:rotate(14deg)">🐾</div>
  <div class="tag">✨ TRANSFORMATION</div>
  <h1>${esc(pet)}</h1>
  <div class="swash"></div>
  <div class="sub">fresh from the grooming van 🚐</div>
  <div class="photo"><span class="badge">${label}</span><img src="${esc(photo)}"></div>
  <div class="footer"><div class="brand">Mobile Pet Works</div><div class="cta">Book your pup’s spa day 🐾</div><div class="contact">mobilepetworks.com · (509) 591-5913</div></div>
</div></body></html>`;
}

async function renderFrame(page, opts, out) {
  await page.setContent(frameHtml(opts), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await writeFile(out, await page.screenshot({ type: "png" }));
}

/** Generate a before→after Reel mp4. Pass a shared Playwright `page` (1080x1920). */
export async function generateReel({ page, beforeUrl, afterUrl, pet, outPath }) {
  const tmpA = outPath + ".A.png", tmpB = outPath + ".B.png";
  await renderFrame(page, { photo: beforeUrl, label: "BEFORE", pet }, tmpA);
  await renderFrame(page, { photo: afterUrl, label: "AFTER", pet }, tmpB);
  await run(ffmpegPath, [
    "-y",
    "-loop", "1", "-t", "3", "-i", tmpA,
    "-loop", "1", "-t", "3.8", "-i", tmpB,
    "-f", "lavfi", "-t", "6", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex", "[0:v][1:v]xfade=transition=wiperight:duration=0.8:offset=2.2,format=yuv420p[v]",
    "-map", "[v]", "-map", "2:a",
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart",
    outPath,
  ]);
  await rm(tmpA, { force: true });
  await rm(tmpB, { force: true });
  return outPath;
}

// ---- standalone test: node make-reel.mjs --pet tucker ----
if (process.argv[1] && process.argv[1].endsWith("make-reel.mjs")) {
  const pi = process.argv.indexOf("--pet");
  const petArg = pi !== -1 ? (process.argv[pi + 1] || "").toLowerCase() : "";
  const auth = JSON.parse(await readFile(join(HERE, ".auth.json"), "utf8"));
  const cookies = auth.cookies.filter((c) => /moego/.test(c.domain)).map((c) => `${c.name}=${c.value}`).join("; ");
  const tz = "America/Los_Angeles";
  const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const now = new Date();
  const body = { filter: { reportIds: [], appointmentIds: [], careTypes: [], startDate: ymd(new Date(now - 13 * 864e5)), endDate: ymd(now) }, pagination: { offset: 0, limit: 1000 } };
  const j = await fetch("https://go.moego.pet/moego.bff/fulfillment/listFulfillmentReport", { method: "POST", headers: { "content-type": "application/json", cookie: cookies }, body: JSON.stringify(body) }).then((r) => r.json());
  const cards = (j.fulfillmentReportCards || []).map((c) => ({ pet: (c.pet && c.pet.petName) || "", photos: ((c.sendRecord?.[0]?.sendContent?.photos) || []).filter(Boolean) })).filter((c) => c.photos.length >= 2);
  const pick = petArg ? cards.find((c) => c.pet.toLowerCase().includes(petArg)) : cards[0];
  if (!pick) {
    console.log("No matching 2-photo report found. Available:", cards.map((c) => c.pet).join(", "));
    process.exitCode = 1;
  } else {
    const outDir = join(ROOT, "images", "reels");
    await mkdir(outDir, { recursive: true });
    const out = join(outDir, `${pick.pet.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp4`);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
    await generateReel({ page, beforeUrl: pick.photos[0], afterUrl: pick.photos[1], pet: pick.pet.replace(/[^A-Za-z0-9' ]+/g, "").trim(), outPath: out });
    await browser.close();
    console.log("Reel written:", out);
  }
}
