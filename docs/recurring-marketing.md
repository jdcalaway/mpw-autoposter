# Recurring marketing operations

## Runtime

A Codex task in this conversation runs daily at 6:30 AM America/Los_Angeles. It reads Google reviews through the signed-in Chrome browser and inspects MoeGo through the existing authorized browser UI. Those two tasks require the computer on, Codex running, browser access available, and sufficient account usage. GitHub Actions owns weekly AI artwork as described in `docs/cloud-ai-images.md`, using the OPENAI_API_KEY repository secret. Do not generate weekly artwork in this local task, even if the cloud key is missing; report the setup blocker instead of creating a duplicate batch. GitHub Actions continues preparing approval issues and publishing approved posts independently.

Google API OAuth remains an optional alternative, not the active syncing method. Leave `GOOGLE_REVIEWS_ENABLED` unset/false for browser syncing.

## Google review procedure

Open https://www.google.com/search?q=mobile+pet+works in Chrome. Verify the listing is Mobile Pet Works in the Tri-Cities, phone (509) 591-5913. Open Read reviews and keep Newest selected. Read up to ten newest reviews, expanding full text. Reviewer names may appear in screenshots but not accessibility text: inspect the screenshot when needed. Do not confuse owner replies with reviews, or price labels with review text. Skip any record whose author, rating, or full text cannot be read.

Stage observed records in an ignored `output/` JSON file. Use the public profile ID as the stable ID, prefixed `google-profile-`, until Google supplies an actual review ID. Preserve exact text, displayed author, numeric rating, public source URL, reviewerProfile URL, sourceMethod `google-business-profile-browser`, observedAt (ISO timestamp), and verified true. Here verified means checked against the source, not that Google verified the transaction. Import via `node scripts/import-reviews.mjs --file output/FILE.json`. Check existing records first; skip unchanged records so observation timestamps do not create daily commits. Do not disable old reviews simply because they aren't among the newest ten. Never reply to or report reviews.

Known listing: https://www.google.com/maps/place/Mobile+Pet+Works/data=!4m2!3m1!1s0x0:0x987ac2118047f288

## MoeGo procedure (no API)

Open https://go.moego.pet/calendar/grooming in the authorized browser, verify Mobile Petworks. Use Day view with All staff, inspect the next seven dates. Read the appointment blocks and working-hour shading. Do not call private APIs, extract cookies, change appointments or business settings, or run the legacy photo puller for this task. If signed out, ask for sign-in; do not guess credentials.

Distinguish off-duty grey/hatched time from potential free time. Pending and unconfirmed appointments still occupy time. Take breaks, travel, service duration, dog size/coat, and groomer eligibility into account where visible. A gap is a candidate for dispatcher review, not a guaranteed appointment. Do not assume city from the preceding appointment if the next appointment is in another city. Do not convert a number of pets into a number of appointments.

Save only a summary in ignored `output/moego-availability-latest.md`; no customer names, street addresses, contact information, screenshots, or raw schedule data in the public repository. Highlight significant new candidate gaps to the owner. Never advertise exact availability automatically from this observation. The present poster uses evergreen booking requests; a dispatcher must verify any specific availability claim.

## Weekly creative procedure (moved to GitHub)

The `.github/workflows/generate-ai-creatives.yml` workflow is the sole owner of recurring artwork. It creates a booking/hiring pair, records paid attempts durably, rotates art direction and uses the real white shuttle-van photo. See `docs/cloud-ai-images.md` for activation and recovery. The local task must not make additional image batches or reset cloud attempt records.

The owner checks visual quality in the normal post approval issue. No fabricated before/afters, employee portraits, reviews, pay, perks, scarcity or guaranteed availability. Any requested one-off creative work is separate from this recurring task.

## Deliver to the autoposter

Run `npm test`. When review or campaign content changes, use `scripts/push-marketing.ps1` to commit only marketing inputs and assets to jdcalaway/mpw-autoposter/main. Do not stage the operational calendar, customer data, credentials, or unrelated work. The daily GitHub prepare workflow rebuilds future planned entries from these inputs while preserving in-flight approvals. If the branch diverges or unrelated tracked changes are present, stop and report the conflict instead of force-pushing or discarding work.

Never approve a post or invoke the social publisher. Stay quiet when nothing meaningful changed. Notify for newly imported reviews, a completed creative batch, meaningful new schedule opportunities, or a blocker requiring user action.
