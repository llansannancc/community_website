// Moderator sign-in with GitHub.
//
// How it works:
//  - A moderator clicks "Sign in with GitHub" and approves the request on GitHub.
//  - GitHub tells us the verified email addresses on their account.
//  - If one of them belongs to an active moderator on our list, they're signed in on that device for 30 days.
//  - We don't keep anything from GitHub except the fact they signed in (no tokens are stored).
//  - Removing a moderator from the list signs them out everywhere straight away.

export const SESSION_COOKIE = "llan_session";
const STATE_COOKIE = "llan_oauth_state";
const SESSION_DAYS = 30;

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(text) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readCookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}
const secureFlag = (request) => (new URL(request.url).protocol === "https:" ? "; Secure" : "");
const cookie = (request, name, value, maxAge) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag(request)}`;

// GitHub addresses (can be pointed at a pretend GitHub for local testing)
const githubWeb = (env) => env.GITHUB_WEB_URL || "https://github.com";
const githubApi = (env) => env.GITHUB_API_URL || "https://api.github.com";
const callbackUrl = (request) => `${new URL(request.url).origin}/api/auth/github/callback`;

/** Returns the signed-in moderator for this request, or null. */
export async function currentModerator(request, env) {
  // Local testing only: pretend to be someone (never works on the live site).
  if (env.ENVIRONMENT === "development") {
    const as = request.headers.get("x-dev-user");
    if (as) {
      return await env.DB.prepare("SELECT id, email, name, role, active FROM moderators WHERE email = ? AND active = 1")
        .bind(as.toLowerCase()).first();
    }
  }
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT m.id, m.email, m.name, m.role, m.active
     FROM sessions s JOIN moderators m ON m.id = s.moderator_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND m.active = 1`
  ).bind(await sha256(token), new Date().toISOString()).first();
}

/** Step 1: send the moderator to GitHub. */
export function startGithubSignIn(request, env) {
  if (!env.GITHUB_CLIENT_ID) {
    return Response.redirect(`${new URL(request.url).origin}/admin/?error=not-set-up`, 302);
  }
  const state = randomToken();
  const url = new URL("/login/oauth/authorize", githubWeb(env));
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", callbackUrl(request));
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "true");
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), "Set-Cookie": cookie(request, STATE_COOKIE, state, 600) },
  });
}

/**
 * Step 2: GitHub sends them back here.
 * Returns { moderator, login, sessionCookie } on success, or { error } (a short code shown on the sign-in page).
 */
export async function finishGithubSignIn(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = readCookie(request, STATE_COOKIE);
  if (url.searchParams.get("error")) return { error: "cancelled" };
  if (!code || !state || !expected || state !== expected) return { error: "expired" };

  // Swap the one-time code for a short-lived GitHub token
  const tokenRes = await fetch(`${githubWeb(env)}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: callbackUrl(request) }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenData.access_token) return { error: "github" };
  const gh = { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "llansannan-community-website" };

  const [userRes, emailsRes] = await Promise.all([
    fetch(`${githubApi(env)}/user`, { headers: gh }),
    fetch(`${githubApi(env)}/user/emails`, { headers: gh }),
  ]);
  if (!userRes.ok || !emailsRes.ok) return { error: "github" };
  const user = await userRes.json();
  const emails = (await emailsRes.json())
    .filter((e) => e.verified && e.email)
    .map((e) => e.email.toLowerCase());
  if (!emails.length) return { error: "no-email", login: user.login };

  // Match a verified GitHub email to an active moderator
  const placeholders = emails.map(() => "?").join(", ");
  const mod = await env.DB.prepare(
    `SELECT id, email, name, role FROM moderators WHERE active = 1 AND email IN (${placeholders}) LIMIT 1`
  ).bind(...emails).first();
  if (!mod) return { error: "not-moderator", login: user.login };

  // Start a session on this device
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const device = (request.headers.get("User-Agent") || "").slice(0, 200);
  await env.DB.prepare("INSERT INTO sessions (token_hash, moderator_id, expires_at, device) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), mod.id, expires, device).run();

  return { moderator: mod, login: user.login, sessionCookie: cookie(request, SESSION_COOKIE, token, SESSION_DAYS * 86400) };
}

export const clearStateCookie = (request) => cookie(request, STATE_COOKIE, "", 0);
export const clearSessionCookie = (request) => cookie(request, SESSION_COOKIE, "", 0);

export async function endSession(env, request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function endAllSessions(env, moderatorId) {
  await env.DB.prepare("DELETE FROM sessions WHERE moderator_id = ?").bind(moderatorId).run();
}
