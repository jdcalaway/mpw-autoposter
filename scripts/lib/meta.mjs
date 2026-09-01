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
  const body = new URLSearchParams(params);
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
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

/** Post a photo with caption to the Facebook Page. Returns { post_id } or { id }. */
export async function postToFacebook({ cfg, imageUrl, message }) {
  const v = apiVersion(cfg);
  return graph(v, `${env("META_PAGE_ID")}/photos`, {
    url: imageUrl,
    caption: message,
    access_token: env("META_PAGE_TOKEN"),
  });
}

/** Publish a photo with caption to Instagram (create container -> wait -> publish). */
export async function postToInstagram({ cfg, imageUrl, caption }) {
  const v = apiVersion(cfg);
  const ig = env("META_IG_USER_ID");
  const token = env("META_PAGE_TOKEN");

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
