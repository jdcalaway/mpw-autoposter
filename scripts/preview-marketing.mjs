import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, loadConfig, loadPillars } from "./lib/util.mjs";
import { renderGraphic } from "./make-graphic.mjs";
import { resolveImage } from "./lib/images.mjs";

const cfg = await loadConfig();
const { pillars } = await loadPillars();
await mkdir(join(ROOT, "output"), { recursive: true });
for (let n = 0; n < 4; n++) {
  await renderGraphic({ cfg, pillar: pillars.booking, pillarKey: "booking",
    bodyText: "One less errand. One freshly groomed dog.", variantSeed: String(n),
    outPath: join(ROOT, "output", `background-${n}.jpg`) });
}
await renderGraphic({ cfg, pillar: pillars.testimonial, pillarKey: "testimonial",
  bodyText: "Layout preview only. An imported customer's exact review will appear here, with their name and rating.",
  review: {author: "DEMO — not a real review", rating: 5}, variantSeed: "2",
  outPath: join(ROOT, "output", "review-layout-demo.jpg") });
// Real media conversion path, but no calendar changes or network calls.
for (const [pillar, asset] of [["booking", "booking-van-v2.png"], ["hiring", "hiring-illustration.png"]]) {
  await resolveImage({ cfg, post: { date: `preview-${pillar}`, pillar,
    creativeAsset: `images/creative/${asset}` } });
}
