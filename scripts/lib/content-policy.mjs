import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT } from './util.mjs';

export const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function sameCopy(a, b) {
  const x = normalize(a), y = normalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const words = s => new Set(s.split(' '));
  const A = words(x), B = words(y);
  if (Math.min(A.size, B.size) < 12) return false;
  const common = [...A].filter(w => B.has(w)).length;
  return common / new Set([...A, ...B]).size >= 0.88;
}
export function priorContent(post, posts) {
  return posts.filter(p => p.id !== post.id && (p.date < post.date || p.status === 'posted' || p.status === 'pending_approval') &&
    (p.status !== 'planned' || p.image || p.date < post.date));
}
export function contentHoldReason(post, posts) {
  for (const p of priorContent(post, posts)) {
    if (sameCopy(post.caption, p.caption)) return `Caption already used on ${p.date}.`;
    if (post.review && (post.review.id === p.review?.id || sameCopy(post.review.text, p.review?.text))) return `Review already used on ${p.date}.`;
    if (post.graphicText && sameCopy(post.graphicText, p.graphicText)) return `Graphic wording already used on ${p.date}.`;
    if (post.mediaHashes?.some(h => p.mediaHashes?.includes(h))) return `Media already used on ${p.date}.`;
    if (post.mediaSource && post.mediaSource === p.mediaSource) return `Photo/video already used on ${p.date}.`;
  }
  return null;
}
export async function fileHash(path) {
  return createHash('sha256').update(await readFile(join(ROOT, path))).digest('hex');
}
export async function fingerprint(post) {
  const paths = [post.image, post.creativeAsset, post.videoRelPath, post.mediaSource];
  if (post.videoUrl?.includes('/main/')) paths.push(post.videoUrl.split('/main/')[1]);
  const hashes = new Set(post.mediaHashes || []);
  for (const path of paths.filter(Boolean)) {
    try { hashes.add(await fileHash(path)); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  post.mediaHashes = [...hashes];
}
export async function unusedMedia(paths, post, posts) {
  const used = new Set(priorContent(post, posts).flatMap(p => p.mediaHashes || []));
  const available = [];
  for (const path of paths) if (!used.has(await fileHash(path))) available.push(path);
  return available;
}
