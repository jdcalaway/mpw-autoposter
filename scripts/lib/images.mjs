// Hybrid image resolution. For a given post: if you've dropped real photos into
// images/photos/<pillar>/, use one (rotated deterministically by date). Otherwise
// generate an on-brand graphic. Returns a repo-relative path.

import { readdir, copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadPillars } from "./util.mjs";
import { renderGraphic } from "../make-graphic.mjs";

const PHOTO_EXT = /\.(jpe?g|png|webp)$/i;

async function listPhotos(pillarKey) {
  const dir = join(ROOT, "images", "photos", pillarKey);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files.filter((f) => PHOTO_EXT.test(f)).sort();
}

// Deterministic index from the date so re-runs pick the same photo.
function pick(list, seedStr) {
  let h = 0;
  for (const c of seedStr) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/** Resolves the image for a post, materializing it under images/generated when needed.
 *  Returns { relPath, source: "photo" | "graphic" }. */
export async function resolveImage({ cfg, post }) {
  const pillars = await loadPillars();
  const pillar = pillars.pillars[post.pillar];
  const genDir = join(ROOT, "images", "generated");
  await mkdir(genDir, { recursive: true });

  const photos = await listPhotos(post.pillar);
  if (photos.length) {
    const chosen = pick(photos, post.date);
    const ext = chosen.match(PHOTO_EXT)[0].toLowerCase();
    const rel = join("images", "generated", `${post.date}-${post.pillar}${ext}`);
    await copyFile(join(ROOT, "images", "photos", post.pillar, chosen), join(ROOT, rel));
    return { relPath: rel.replace(/\\/g, "/"), source: "photo", sourceName: chosen };
  }

  const lines = pillar.graphicLines && pillar.graphicLines.length ? pillar.graphicLines : [post.caption];
  const bodyText = pick(lines, post.date);
  const rel = join("images", "generated", `${post.date}-${post.pillar}.jpg`);
  await renderGraphic({
    cfg,
    pillar,
    pillarKey: post.pillar,
    bodyText,
    outPath: join(ROOT, rel),
  });
  return { relPath: rel.replace(/\\/g, "/"), source: "graphic" };
}
