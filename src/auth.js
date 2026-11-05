// Who is logged in?
// Cloudflare Access handles the login (an emailed one-time code) in front of /admin and /api/admin.
// Access then sends a signed token with every request. We check that signature ourselves,
// so nobody can pretend to be a moderator by faking a header.
// After that, the email must belong to an active moderator in our own database.

let certCache = { at: 0, keys: null };

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function accessKeys(teamDomain) {
  if (certCache.keys && Date.now() - certCache.at < 60 * 60 * 1000) return certCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("Could not fetch Access signing keys");
  const { keys } = await res.json();
  certCache = { at: Date.now(), keys };
  return keys;
}

const teamHost = (env) => String(env.ACCESS_TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

async function verifyAccessJwt(token, env) {
  const [h, p, sig] = token.split(".");
  if (!h || !p || !sig) return null;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));

  const keys = await accessKeys(teamHost(env));
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;
  // ACCESS_AUD can hold more than one tag, separated by commas
  // (e.g. the temporary workers.dev address and the final domain while switching over).
  const allowed = String(env.ACCESS_AUD || "").split(",").map((x) => x.trim()).filter(Boolean);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a) => allowed.includes(a))) return null;
  if (payload.iss && payload.iss !== `https://${teamHost(env)}`) return null;
  return payload.email ? String(payload.email).toLowerCase() : null;
}

/** Returns the moderator record for this request, or null. */
export async function currentModerator(request, env) {
  let email = null;

  if (env.ENVIRONMENT === "development" && env.DEV_USER_EMAIL) {
    // Local testing only: pretend to be this person (can be switched with a ?as= header in tests).
    email = (request.headers.get("x-dev-user") || env.DEV_USER_EMAIL).toLowerCase();
  } else {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;
    try {
      email = await verifyAccessJwt(token, env);
    } catch (e) {
      console.error("Access token check failed", e);
      return null;
    }
  }
  if (!email) return null;

  return await env.DB.prepare(
    "SELECT id, email, name, role, active FROM moderators WHERE email = ? AND active = 1"
  ).bind(email).first();
}
