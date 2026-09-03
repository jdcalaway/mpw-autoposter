// Meta Graph API client — publishes a photo post to a Facebook Page and to an
// Instagram Business account. One Page access token drives both.
//
// Required env:
//   META_PAGE_TOKEN   long-lived (ideally non-expiring System User) Page token
//   META_PAGE_ID      the Facebook Page's numeric ID
//   META_IG_USER_ID   the linked Instagram Business account's user ID
//
// Instagram publishing is a two-step flow: create a media *container* that
// points at a PUBLIC image URL, then publish that container.

const GRAPH = "https://graph.facebook.com";

function apiVersion(cfg) {
  return (cfg && cfg.graph && cfg.graph.apiVersion) || "v21.0";
}

async function graph(version, path, params, method = "POST") {
  const url = new URL(`${GRAPH}/${version}/${path}`);
  const opts = { method, headers: {} };
  if (method === "GET" || method === "HEAD") {
    // GET requests carry params in the query string — a body is illegal.
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
    opts.body = new URLSearchParams(params);
  }
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(
      `Graph ${method} ${path} failed (${res.status}): ${e.message || JSON.stringify(json)}` +
        (e.error_user_msg ? ` — ${e.error_user_msg}` : "")
    );
  }
  return json;
}

// Publishing to a Page (and its linked IG account) requires a *Page* access
// token. META_PAGE_TOKEN may be a Page token already, or a System User token —
// in the latter case we exchange it for the Page token via /me/accounts. Either
// way works, and the derived token is cached for the run.
let cachedPageToken;
async function pageToken(cfg) {
  if (cachedPageToken) return cachedPageToken;
  const configured = env("META_PAGE_TOKEN");
  try {
    const r = await graph(apiVersion(cfg), "me/accounts", { fields: "id,access_token", access_token: configured }, "GET");
    const pg = (r.data || []).find((p) => p.id === env("META_PAGE_ID"));
    if (pg && pg.access_token) return (cachedPageToken = pg.access_token);
  } catch { /* fall through — treat the configured token as a Page token */ }
  return (cachedPageToken = configured);
}

/** Post a photo with caption to the Facebook Page. Returns { post_id } or { id }. */
export async function postToFacebook({ cfg, imageUrl, message }) {
  const v = apiVersion(cfg);
  return graph(v, `${env("META_PAGE_ID")}/photos`, {
    url: imageUrl,
    caption: message,
    access_token: await pageToken(cfg),
  });
}

/** Publish a photo with caption to Instagram (create container -> wait -> publish). */
export async function postToInstagram({ cfg, imageUrl, caption }) {
  const v = apiVersion(cfg);
  const ig = env("META_IG_USER_ID");
  const token = await pageToken(cfg);

  const container = await graph(v, `${ig}/media`, {
    image_url: imageUrl,
    caption,
    access_token: token,
  });

  await waitForContainer(v, container.id, token);

  return graph(v, `${ig}/media_publish`, {
    creation_id: container.id,
    access_token: token,
  });
}

/** Publish a Reel to Instagram (video). Container -> wait (video processing) -> publish. */
export async function postReelToInstagram({ cfg, videoUrl, caption }) {
  const v = apiVersion(cfg);
  const ig = env("META_IG_USER_ID");
  const token = await pageToken(cfg);
  const container = await graph(v, `${ig}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    access_token: token,
  });
  await waitForContainer(v, container.id, token, 50, 6000); // video processing is slower
  return graph(v, `${ig}/media_publish`, { creation_id: container.id, access_token: token });
}

/** Post a video to the Facebook Page (from a public URL). */
export async function postVideoToFacebook({ cfg, videoUrl, message }) {
  const v = apiVersion(cfg);
  return graph(v, `${env("META_PAGE_ID")}/videos`, {
    file_url: videoUrl,
    description: message,
    access_token: await pageToken(cfg),
  });
}

async function waitForContainer(v, creationId, token, tries = 10, delayMs = 3000) {
  for (let i = 0; i < tries; i++) {
    const status = await graph(
      v,
      creationId,
      { fields: "status_code,status", access_token: token },
      "GET"
    );
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new Error(`IG media container ${status.status_code}: ${status.status || ""}`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error("IG media container never reached FINISHED");
}

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
