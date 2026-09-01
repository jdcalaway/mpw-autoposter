// GitHub REST client for the approval queue. Uses the built-in GITHUB_TOKEN
// that Actions injects, so no extra secret is needed.
//
// Approval model: prepare.mjs opens one Issue per upcoming post. You react 👍
// (approve) or 👎 (skip) from the GitHub mobile app or the email notification.
// publish.mjs reads the reactions and only counts one from `approverLogin`.

const API = "https://api.github.com";

function repo() {
  const r = process.env.GITHUB_REPOSITORY;
  if (!r) throw new Error("GITHUB_REPOSITORY not set (are we running in Actions?)");
  return r;
}

async function gh(path, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`GitHub ${method} ${path} failed (${res.status}): ${json.message || ""}`);
  }
  return json;
}

export async function createIssue({ title, body, labels = [] }) {
  return gh(`/repos/${repo()}/issues`, { method: "POST", body: { title, body, labels } });
}

export async function commentIssue(number, body) {
  return gh(`/repos/${repo()}/issues/${number}/comments`, { method: "POST", body: { body } });
}

export async function closeIssue(number) {
  return gh(`/repos/${repo()}/issues/${number}`, { method: "PATCH", body: { state: "closed" } });
}

/** Returns "approved" | "skipped" | "pending" based on the approver's reaction. */
export async function approvalDecision(number, approverLogin) {
  const reactions = await gh(`/repos/${repo()}/issues/${number}/reactions`);
  const byApprover = reactions.filter(
    (r) => r.user && r.user.login.toLowerCase() === approverLogin.toLowerCase()
  );
  if (byApprover.some((r) => r.content === "+1")) return "approved";
  if (byApprover.some((r) => r.content === "-1")) return "skipped";
  return "pending";
}

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
