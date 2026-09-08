# Weekly AI campaign images

GitHub Actions owns new AI artwork. Your PC, Chrome and Codex do not need to be running for this part of the autoposter. Reviews and MoeGo collection still use their existing setup.

## One-time activation

1. Sign in at https://platform.openai.com/ and create an API project named **Mobile Pet Works**. Add API billing in the platform's billing settings. API usage is separate from ChatGPT/Codex subscription usage. Complete organization verification if the platform requests it for image access.
2. Create a project API key at https://platform.openai.com/api-keys. The key must be allowed to write to the Images endpoint and the project must allow `gpt-image-2`. Keep the key out of chat and repository files.
3. Open https://github.com/jdcalaway/mpw-autoposter/settings/secrets/actions/new . Name the repository secret **OPENAI_API_KEY**, paste its value directly into GitHub's secret field, and save.
4. Open https://github.com/jdcalaway/mpw-autoposter/actions/workflows/generate-ai-creatives.yml . Click **Run workflow**, select **main**, select mode **generate**, and run it. This starts the first two-image batch; preview mode is free and makes no API request.
5. Inspect both images in the successful run's summary. The daily **Prepare approval** workflow selects these campaigns for upcoming booking/hiring slots. Your existing thumbs-up approval remains mandatory before any social post. If you want to refresh upcoming approvals immediately, run **Prepare approval** manually; it preserves existing approvals.

Adding the key also enables scheduled generation. Until it is present, due scheduled runs report the missing secret and make no API call. Set repository variable **AI_IMAGES_PAUSED** to **true** to pause image generation; remove it or set it to false to resume.

## Operation and limits

- Checks daily at 13:17 UTC (6:17 AM Pacific daylight time; 5:17 AM standard time). GitHub may delay scheduled starts. Generates a new pair only after seven days have passed since the last cloud batch completed; no catch-up backlog.
- One booking image and one hiring image. Uses `gpt-image-2`, high quality, a 1536×1024 illustration, and the real van photo at `images/creative/van-reference.jpg`. The original photo is sent to OpenAI as a reference. Final ads are 1080×1080 JPEGs with Quicksand typography, brand name and contact details rendered in code.
- Rotates through the base booking/hiring campaign hooks, six art directions/background palettes and four scenes per objective. Caption wording comes from the curated campaign library; images are freshly generated. Add more base campaigns/scenes in the repository to expand the rotation.
- At most **2 API requests per run, 2 attempts per image, and 12 requests per calendar month**. Normal operation is 8–10 images per month. Attempts, including failed or interrupted requests, count toward the cap. This is a request cap, not a guaranteed dollar cap. The model's input-image and prompt costs also apply. Check API usage/billing for actual spending; budget alerts are not a substitute for these application limits.
- No automatic HTTP retries. A 429 can retry on a later day within the attempt limit. Authentication/permission errors require attention. Network timeouts and HTTP 5xx responses are treated as uncertain and stop automatic retries.
- Every attempt is committed and pushed before the API call. The received source image is saved before rendering; finished images and their paired captions are checkpointed individually. Re-running resumes missing work without replacing finished images. A failed Git push stops further paid requests. All repo workflows share `mpw-write` concurrency.
- Source PNGs, final JPEGs, exact prompts, settings, reference SHA-256, request IDs and token counts are saved with the batch. API keys and raw HTTP errors are never logged or committed. Public images/campaigns contain no customer scheduling data.
- This workflow has no publishing credentials and never approves posts. Before-and-after photos, review graphics and other pillars continue through the existing workflow. Review the AI illustration, van details and copy in the approval issue before giving a thumbs-up.

## Recovery

Read the failing run's summary first. Do not delete batch/attempt records to force a retry; those records enforce the spending limits.

- **Missing key / HTTP 401 / 403:** fix the key, billing or model access. If an item was marked `blocked`, inspect the failed request before changing that item's status to `failed` in `content/creative-batches.json`. Preserve its attempts. The next permitted run can retry it.
- **HTTP 429:** check billing/rate limits. Wait until the next local day; two total attempts are allowed for that image.
- **`requesting` / `uncertain`:** inspect the Actions run and OpenAI request/usage records. The request might have been billed. Never automatically reset these. After the owner chooses to accept the possibility of an additional charge, change only the affected item's status to `failed`, preserving all attempts. The caps still apply.
- **`received`:** the source PNG has already been saved. Correct a rendering problem and rerun; it reuses that image without a new API request.
- **Git push conflict:** fetch and resolve the conflicting changes without discarding ledger entries. Recover any available image/checkpoint commits before rerunning. No force push is used.
- **Attempt cap:** inspect the failure and fix it before considering a reviewed limit change. Do not silently buy more images. A stopped batch blocks later batches until resolved, so failures remain visible.

For a free local check: `npm run preview-ai` and `npm test`. Paid generation is deliberately restricted to the main branch of this repository in GitHub Actions.

References: [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation), [API quickstart](https://developers.openai.com/api/docs/quickstart).
