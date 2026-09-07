// Manual JSON import, or read-only Google Business Profile OAuth sync.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./lib/util.mjs";
import { readContent } from "./lib/campaigns.mjs";

const stars = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
export function normalizeReview(r, sourceUrl, api = false) {
  const id = r.reviewId || r.id;
  const text = r.comment ?? r.text;
  const author = r.reviewer?.displayName || r.author;
  const rating = stars[r.starRating] || r.rating;
  const url = r.sourceUrl || sourceUrl;
  if (!id || !author || typeof text !== "string" || !text.trim() ||
      !Number.isInteger(rating) || rating < 1 || rating > 5 || !/^https:\/\//.test(url || "")) {
    throw new Error("Each review needs id, exact text, author, rating (1–5), and an HTTPS sourceUrl.");
  }
  return { id: String(id), text: text.trim(), author, rating, sourceUrl: url,
    reviewerProfile: r.reviewerProfile || null,
    sourceMethod: api ? "google-business-profile-api" : r.sourceMethod || "manual",
    observedAt: r.observedAt || new Date().toISOString(),
    verified: api || r.verified === true, enabled: r.enabled !== false,
    updatedAt: r.updateTime || r.updatedAt || null };
}

export async function googleReviews() {
  const env = process.env;
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_BUSINESS_LOCATION", "GOOGLE_REVIEWS_URL"]) {
    if (!env[key]) throw new Error(`Missing ${key}; see docs/marketing-upgrade.md. No reviews changed.`);
  }
  const parent = env.GOOGLE_BUSINESS_LOCATION;
  if (!/^accounts\/[a-zA-Z0-9_-]+\/locations\/[a-zA-Z0-9_-]+$/.test(parent)) throw new Error("Invalid Google location resource.");
  const auth = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", signal: AbortSignal.timeout(30000),
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN, grant_type: "refresh_token" }),
  });
  if (!auth.ok) throw new Error(`Google OAuth failed (${auth.status}); reconnect the account.`);
  const token = (await auth.json()).access_token;
  if (!token) throw new Error("Google returned no access token.");
  const result = []; let pageToken = ""; const seen = new Set();
  do {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${parent}/reviews`);
    url.searchParams.set("pageSize", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Google reviews fetch failed (${response.status}); no partial import saved.`);
    const body = await response.json();
    for (const r of body.reviews || []) {
      if (r.comment?.trim()) result.push(normalizeReview(r, env.GOOGLE_REVIEWS_URL, true));
    }
    pageToken = body.nextPageToken || "";
    if (pageToken && seen.has(pageToken)) throw new Error("Google repeated a page token.");
    seen.add(pageToken);
  } while (pageToken);
  return result;
}

export async function main() {
  const index = process.argv.indexOf("--file");
  const api = index === -1;
  let incoming;
  if (api) incoming = await googleReviews();
  else {
    if (!process.argv[index + 1]) throw new Error("--file requires a JSON path.");
    const input = JSON.parse(await readFile(process.argv[index + 1], "utf8"));
    incoming = (Array.isArray(input) ? input : input.reviews).map(r => normalizeReview(r));
  }
  const existing = (await readContent("reviews.json", { reviews: [] })).reviews;
  const byId = new Map(existing.map(r => [r.id, r]));
  for (const r of incoming) byId.set(r.id, { ...r, enabled: byId.get(r.id)?.enabled === false ? false : r.enabled });
  // A successful full API refresh retires removed reviews; manual imports merge.
  if (api) for (const [id, r] of byId) if (!incoming.some(n => n.id === id)) byId.set(id, { ...r, enabled: false });
  await writeFile(join(ROOT, "content", "reviews.json"), JSON.stringify({ syncedAt: new Date().toISOString(), reviews: [...byId.values()] }, null, 2) + "\n");
  console.log(`Imported ${incoming.length} sourced reviews. Publication still requires approval.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
