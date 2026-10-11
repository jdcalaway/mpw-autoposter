// An AI asset is single-use, including rejected approval previews.
export function creativeHoldReason(post, posts) {
  if (post.awaitingCreative) return "Waiting for fresh AI artwork.";
  if (!post.illustration && !post.creativeAsset && post.imageSource !== "illustration") return null;
  if (!post.creativeAsset) return "AI artwork has no source asset.";
  const duplicate = posts.find(p => p.id !== post.id &&
    (p.date < post.date || p.status === "posted" || p.status === "pending_approval") &&
    ((p.creativeAsset && p.creativeAsset === post.creativeAsset) ||
     (p.conceptId && p.conceptId === post.conceptId)));
  return duplicate ? `AI artwork already used for ${duplicate.date}; fresh artwork required.` : null;
}
