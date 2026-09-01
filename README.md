# Mobile Pet Works — Auto-Poster

A hands-off social media system: it builds a rolling 30-day content calendar and
**auto-posts to Facebook and Instagram** — but every post waits for a one-tap
approval from you first. Runs entirely on free GitHub Actions. No server, no
monthly cost.

## How it works

```
 Build calendar        Prepare (daily, ~8am PT)         Publish (hourly)
 ─────────────         ────────────────────────         ────────────────
 30 posts from    ->   picks tomorrow's post,      ->   at the scheduled time,
 7 weekly pillars      makes the image (your photo      if you 👍'd it, posts to
 -> calendar.json      or an auto graphic), opens       Facebook + Instagram and
                       a GitHub Issue for you to        closes the issue. No 👍 =
                       approve                          it holds, never posts.
```

**Your daily interaction is one tap.** Each morning you get a GitHub notification
(email or the GitHub mobile app) with tomorrow's post — image preview, caption,
hashtags. React **👍 to approve** or **👎 to skip**. That's it.

The 7 content pillars (one per weekday) come straight from your existing post
generator: Sun = review, Mon = engagement, Tue = Transformation Tuesday,
Wed = tip, Thu = behind-the-scenes, Fri = Featured Pup, Sat = booking CTA.

---

## One-time setup (~30 min)

You do this once. There are three parts: **Instagram**, **Meta app/tokens**, and
**GitHub**. Your tokens live only in GitHub's encrypted secrets — never in the code.

### Part 1 — Instagram must be a Business account linked to your Page

1. In the Instagram app: **Settings → Account type and tools → Switch to
   professional account → Business.**
2. Link it to your Facebook Page: easiest via **Meta Business Suite**
   (business.facebook.com) → your Page → **Settings → Linked accounts →
   Instagram → Connect.** (Instagram's API can only post from a Business/Creator
   account that's tied to a Facebook Page.)

### Part 2 — Meta app + a non-expiring token + your two IDs

1. Go to **business.facebook.com → Business Settings.** Make sure your **Page**
   and **Instagram account** both appear under *Accounts* (add them if not).
2. Create an app: **developers.facebook.com → My Apps → Create App → "Business"**
   type. Give it any name (e.g. "MPW Auto-Poster").
3. Get a **non-expiring System User token** (the set-and-forget option):
   - Business Settings → **Users → System users → Add** → make an **Admin**
     system user.
   - Click **Add assets** → assign your **Page** and **Instagram account** with
     full control.
   - Click **Generate new token** → pick your app → select these permissions:
     `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`,
     `instagram_content_publish`, `business_management`.
   - **Copy the token** — this is your `META_PAGE_TOKEN`. (System-user tokens
     don't expire.)
4. Get your **Page ID** and **Instagram user ID**. Open the
   **Graph API Explorer** (developers.facebook.com/tools/explorer), paste your
   token, and run:
   - `GET /me/accounts` → your Page's `id` = **`META_PAGE_ID`**.
   - `GET /{PAGE_ID}?fields=instagram_business_account` → the returned
     `instagram_business_account.id` = **`META_IG_USER_ID`**.

> If Instagram publishing later returns a permissions error, request **Advanced
> Access** for `instagram_content_publish` in your app's App Review — approval is
> quick for your own owned account. Facebook posting works without review.

### Part 3 — GitHub

1. **Create a new PUBLIC repo** on github.com (e.g. `mpw-autoposter`). It must be
   public so Instagram can fetch post images from the repo's URLs. *Your tokens
   are not in the repo — they go in encrypted secrets below.*
2. Push this folder to it (commands at the bottom).
3. **Add your secrets:** repo **Settings → Secrets and variables → Actions →
   New repository secret.** Add three:
   - `META_PAGE_TOKEN`
   - `META_PAGE_ID`
   - `META_IG_USER_ID`
4. **Set yourself as approver:** edit `config.json`, set `"approverLogin"` to your
   **GitHub username**, commit and push. Only your 👍 counts as approval.
5. **Allow the workflows to write:** Settings → **Actions → General → Workflow
   permissions → "Read and write permissions" → Save.** (Lets the workflows open
   approval issues and record status.)
6. **Turn on notifications** so you actually see the approvals: click **Watch →
   All Activity** on the repo, and/or install the **GitHub mobile app** and enable
   push notifications.

### First run

In the **Actions** tab, run these manually (once) to prime the pump:

1. **Build calendar** → Run workflow. (Creates `content/calendar.json`.)
2. **Prepare approval** → Run workflow. (Opens your first approval issue.)
3. React **👍** on that issue.
4. **Publish due posts** → Run workflow. If that post's time has passed it posts
   immediately; otherwise it posts on the next hourly run at/after its scheduled
   time.

After that it's automatic: prepare runs every morning, publish runs hourly.

---

## Living with it

- **Approve/skip:** 👍 or 👎 the daily issue from your phone. No reaction by post
  time = it quietly holds and posts nothing (see `approvalGraceHours` in config).
- **Add real photos:** drop JPGs into `images/photos/<pillar>/` (see that folder's
  README). A real photo is always used when present; otherwise a branded graphic
  is generated. Commit the photos.
- **Edit captions/lines:** everything is in `content/pillars.json` — `captions`
  (the post text) and `graphicLines` (the short text on generated images).
- **Preview graphics locally:** `npm install` then `npm run sample`, look in
  `images/generated/`.
- **Regenerate the month:** Actions → **Build calendar → Run workflow.** Posts
  already approved/posted are preserved.
- **Times & timezone:** each pillar's post time lives in `pillars.json`; timezone
  is `config.json` (`America/Los_Angeles`). GitHub cron is UTC but the scripts
  compare against Pacific wall-clock, so posts fire at the right local time (±1hr).

## Cost & maintenance

- **Cost:** $0. Public repos get unlimited free Actions minutes.
- **Token:** the System User token doesn't expire — nothing to refresh. (If you
  used a regular token instead, refresh it every ~50 days.)
- **Keep it active:** GitHub pauses scheduled workflows after 60 days of no repo
  activity. The workflows commit status regularly, so this stays awake on its own.

## Troubleshooting

- **Nothing posts:** check the **Publish** run logs (Actions tab). Common causes:
  workflow permissions not set to read/write; `approverLogin` not your username;
  no 👍 reaction; token/IDs wrong.
- **IG fails but FB works:** almost always the image URL isn't public (repo must
  be public) or `instagram_content_publish` needs Advanced Access (Part 2 note).
- **Wrong time:** confirm `timezone` in config and the pillar `time` values.

## File map

```
config.json                  business info, timezone, approver, grace window
content/pillars.json         the 7 pillars: captions, graphic lines, hashtags, times
content/calendar.json        generated 30-day plan (status per post) — auto-managed
scripts/generate-calendar.mjs  builds calendar.json
scripts/prepare.mjs            daily: resolve image + open approval issue
scripts/publish.mjs            hourly: publish approved+due posts to FB + IG
scripts/make-graphic.mjs       SVG -> 1080x1080 JPEG branded graphics
scripts/lib/                   meta (Graph API), github (issues), images, util
images/photos/<pillar>/        drop your real photos here
.github/workflows/             the three schedules
```
