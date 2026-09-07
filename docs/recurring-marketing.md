# Recurring marketing operations

## Runtime

A Codex task in this conversation runs daily at 6:30 AM America/Los_Angeles. It reads Google reviews through the signed-in Chrome browser, inspects MoeGo through the existing authorized browser UI, and refreshes AI artwork when the latest completed batch is at least seven days old. This path requires the computer on, Codex running, browser access available, and sufficient account usage. It does not require a separate image API key or MoeGo API plan. GitHub Actions continues preparing approval issues and publishing approved posts independently.

Google API OAuth remains an optional alternative, not the active syncing method. Leave `GOOGLE_REVIEWS_ENABLED` unset/false for browser syncing.

## Google review procedure

Open https://www.google.com/search?q=mobile+pet+works in Chrome. Verify the listing is Mobile Pet Works in the Tri-Cities, phone (509) 591-5913. Open Read reviews and keep Newest selected. Read up to ten newest reviews, expanding full text. Reviewer names may appear in screenshots but not accessibility text: inspect the screenshot when needed. Do not confuse owner replies with reviews, or price labels with review text. Skip any record whose author, rating, or full text cannot be read.

Stage observed records in an ignored `output/` JSON file. Use the public profile ID as the stable ID, prefixed `google-profile-`, until Google supplies an actual review ID. Preserve exact text, displayed author, numeric rating, public source URL, reviewerProfile URL, sourceMethod `google-business-profile-browser`, observedAt (ISO timestamp), and verified true. Here verified means checked against the source, not that Google verified the transaction. Import via `node scripts/import-reviews.mjs --file output/FILE.json`. Check existing records first; skip unchanged records so observation timestamps do not create daily commits. Do not disable old reviews simply because they aren't among the newest ten. Never reply to or report reviews.

Known listing: https://www.google.com/maps/place/Mobile+Pet+Works/data=!4m2!3m1!1s0x0:0x987ac2118047f288

## MoeGo procedure (no API)

Open https://go.moego.pet/calendar/grooming in the authorized browser, verify Mobile Petworks. Use Day view with All staff, inspect the next seven dates. Read the appointment blocks and working-hour shading. Do not call private APIs, extract cookies, change appointments or business settings, or run the legacy photo puller for this task. If signed out, ask for sign-in; do not guess credentials.

Distinguish off-duty grey/hatched time from potential free time. Pending and unconfirmed appointments still occupy time. Take breaks, travel, service duration, dog size/coat, and groomer eligibility into account where visible. A gap is a candidate for dispatcher review, not a guaranteed appointment. Do not assume city from the preceding appointment if the next appointment is in another city. Do not convert a number of pets into a number of appointments.

Save only a summary in ignored `output/moego-availability-latest.md`; no customer names, street addresses, contact information, screenshots, or raw schedule data in the public repository. Highlight significant new candidate gaps to the owner. Never advertise exact availability automatically from this observation. The present poster uses evergreen booking requests; a dispatcher must verify any specific availability claim.

## Weekly creative procedure

Read `content/creative-batches.json`. If a completed batch is less than seven days old, do nothing. Otherwise use the imagegen skill and built-in image tool to make exactly two new finished square campaign ads: one booking and one recruiting. Use fresh hooks and compositions informed by `content/campaigns.json`; maintain brand blue, navy, cream, gold and coral. Vary backgrounds; keep legible high-contrast typography. Use `images/creative/booking-van-v2.png` as visual reference for the white shuttle van with blue paw/lettering when including a van. Inspect reference files before editing. No fabricated before/after photos, employee portraits, reviews, pay, perks, scarcity, or guaranteed availability. Include mobilepetworks.com or (509) 591-5913 accurately.

Inspect each generated image for text and visual quality. Save final files under `images/creative/YYYY-MM-DD-booking.png` and `YYYY-MM-DD-hiring.png`; do not overwrite the previous assets. Add paired concepts to `content/campaigns.json` with unique id, pillar, objective, headline, caption, asset, createdAt, availableFrom, and expiresOn 60 days later. New dated concepts get selection priority and retain the 30-day cooldown. Never label illustration as a real groom or actual employee. Record the exact prompts and batch date in `content/creative-batches.json` only after both assets and concepts are ready. If one succeeds, record it as a partial batch and resume only the missing item next time.

## Deliver to the autoposter

Run `npm test`. When review or campaign content changes, use `scripts/push-marketing.ps1` to commit only marketing inputs and assets to jdcalaway/mpw-autoposter/main. Do not stage the operational calendar, customer data, credentials, or unrelated work. The daily GitHub prepare workflow rebuilds future planned entries from these inputs while preserving in-flight approvals. If the branch diverges or unrelated tracked changes are present, stop and report the conflict instead of force-pushing or discarding work.

Never approve a post or invoke the social publisher. Stay quiet when nothing meaningful changed. Notify for newly imported reviews, a completed creative batch, meaningful new schedule opportunities, or a blocker requiring user action.
