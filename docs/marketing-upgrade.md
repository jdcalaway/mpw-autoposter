# Mobile Pet Works marketing upgrade

**Active setup, September 7, 2026:** A daily Codex automation now uses the signed-in browser to import Google reviews and inspect MoeGo, with two new AI campaign ads every seven days. Three source-checked reviews have been imported. See [recurring-marketing.md](recurring-marketing.md) for the active procedure and local-runtime requirements. The OAuth method below is an optional alternative and is not enabled.

## What is implemented

The weekly rotation is review / recruiting / transformation / tip / behind the scenes / booking / recruiting. Complete campaign concepts pair the headline, caption, and artwork. Concepts and reviews are not reused within 30 days; when the library is exhausted, the ordinary pillar fallback is used. This is a concept cooldown, not a claim of global semantic deduplication.

The two finished AI illustrations live in `images/creative/`. The booking image uses the user's historical white shuttle van as reference. These illustrations are advertising artwork, not records of real customer grooms or actual employees. The approval issue identifies them as AI artwork. The image resolver converts them to square JPEGs suitable for the existing publisher.

Generated cards rotate royal blue, warm cream/gold, navy, and coral backgrounds with consistent type. Reviews include the actual rating and attribution on the image; long reviews are excerpted on the card, with the original full text retained in the caption and source linked in the approval issue. Never make a review up or assign a real review to an invented dog.

Existing pending/approved/posted/skipped posts are preserved when regenerating. Old pending approval issues therefore keep their original copy and artwork; skip any old unsupported testimonial or availability post rather than approving it. Future planned posts are rebuilt. No social publishing happens without the existing approver reaction.

## Google reviews: connection still required

The initial web fetch could not retrieve reviews, but the authenticated Chrome view is now accessible. Three live reviews were imported after checking exact text, reviewer name, and rating. Browser syncing is active through the scheduled Codex task; review slots still fall back to booking content when no eligible unused review remains.

Automatic sync uses Google's official read-only reviews-list endpoint with OAuth. You need a verified Business Profile you manage, an eligible Google Cloud project with Business Profile API access, and an OAuth grant with `https://www.googleapis.com/auth/business.manage`. The grant must include offline access for a refresh token. Keep credentials in GitHub Actions secrets, not this repository or chat.

GitHub secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.

GitHub variables: `GOOGLE_BUSINESS_LOCATION` set to `accounts/ACCOUNT_ID/locations/LOCATION_ID`; `GOOGLE_REVIEWS_URL` set to the business's public Google Maps review link; `GOOGLE_REVIEWS_ENABLED` set to `true` only after connection. The daily prepare workflow then imports all review pages before rebuilding upcoming posts. A failed fetch stops preparation without saving a partial review set. Deleted reviews are disabled after a successful full sync. Already-issued approval previews remain snapshots.

References:
- https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
- https://developers.google.com/my-business/content/implement-oauth
- https://developers.google.com/my-business/content/prereqs

## Manual review import

Copy exact review text and reviewer display name from Google into a local JSON file, using this structure. Replace every placeholder; this example is documentation only and is not loaded by the poster.

```json
{"reviews":[{"id":"GOOGLE_REVIEW_ID_OR_UNIQUE_ID","author":"EXACT DISPLAY NAME","rating":5,"text":"EXACT REVIEW TEXT","sourceUrl":"https://LINK_TO_THE_REVIEW","verified":true}]}
```

Run `npm run import-reviews -- --file PATH_TO_JSON`, then `npm run build-calendar`. Only mark `verified: true` after checking the actual review. Imports merge by ID; set `enabled: false` to retire a review. Only verified text reviews rated 4 or 5 are considered for marketing; the rest are retained but not selected. There is no invented aggregate rating.

## MoeGo

The existing `moego/pull.mjs` imports completed grooming-report photos and builds media. It is preserved. The daily Codex task reads the actual schedule through the browser without paid API access and reports candidate gaps privately. It does not infer openings from completed reports or advertise unverified availability. Use the existing local MoeGo photo workflow when fresh photos become available; the new ads and cards work without it. Current ads direct people to the website/phone and make no claims about open slots, pay, or benefits.

## Preview and rollout

`npm test` runs offline integrity checks. `node scripts/generate-calendar.mjs --output output/calendar-preview.json` writes a preview without replacing the operational calendar (create output first). `npm run sample` renders card samples locally.

The scheduled task syncs approved-for-library marketing inputs and assets to GitHub using `scripts/push-marketing.ps1`. It never approves social posts: publication continues to require the owner's reaction. No Google credentials are needed for the active browser path. Add real employment details to `content/campaigns.json` once confirmed.
