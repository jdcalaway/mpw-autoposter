import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function loadConfig() {
  return JSON.parse(await readFile(join(ROOT, "config.json"), "utf8"));
}

export async function loadPillars() {
  return JSON.parse(await readFile(join(ROOT, "content", "pillars.json"), "utf8"));
}

export const CALENDAR_PATH = join(ROOT, "content", "calendar.json");

export async function loadCalendar() {
  if (!existsSync(CALENDAR_PATH)) return { generatedAt: null, posts: [] };
  return JSON.parse(await readFile(CALENDAR_PATH, "utf8"));
}

export async function saveCalendar(cal) {
  await writeFile(CALENDAR_PATH, JSON.stringify(cal, null, 2) + "\n", "utf8");
}

/** Current wall-clock time in the given IANA timezone as "YYYY-MM-DDTHH:mm:ss".
 *  Returned as a lexicographically-comparable string, so we never juggle Date offsets. */
export function nowLocalString(timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  let hour = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}:${p.second}`;
}

/** Today's date ("YYYY-MM-DD") in the given timezone. */
export function todayLocal(timezone) {
  return nowLocalString(timezone).slice(0, 10);
}

/** Add `n` days to a "YYYY-MM-DD" string. Anchored at UTC noon to dodge DST edges. */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Public raw.githubusercontent URL for a repo-relative path (Actions sets GITHUB_REPOSITORY). */
export function rawUrl(relPath, branch = "main") {
  const repo = process.env.GITHUB_REPOSITORY || "OWNER/REPO";
  return `https://raw.githubusercontent.com/${repo}/${branch}/${relPath.replace(/\\/g, "/")}`;
}

export function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}
