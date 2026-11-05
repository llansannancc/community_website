// Checks the moderator sign-in: real, forged and expired tokens. Run: node tests/sign-in.test.mjs
import { currentModerator } from "../src/auth.js";
const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
async function keypair(kid) {
  const kp = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign","verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.publicKey); jwk.kid = kid; return { kp, jwk };
}
const real = await keypair("k1"), fake = await keypair("k1");
globalThis.fetch = async (url) => ({ ok: true, json: async () => ({ keys: [real.jwk] }) });
async function token(kp, payload, kid = "k1") {
  const h = enc({ alg: "RS256", kid }), p = enc(payload);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString("base64url")}`;
}
const env = { ENVIRONMENT: "production", ACCESS_TEAM_DOMAIN: "https://llansannan.cloudflareaccess.com", ACCESS_AUD: "aud-workersdev, aud-domain",
  DB: { prepare: () => ({ bind: (email) => ({ first: async () => (email === "mod@example.com" ? { id: 1, email, name: "Mod", role: "moderator", active: 1 } : null) }) }) } };
const req = (t, extra = {}) => new Request("https://x/api/admin/me", { headers: { ...(t ? { "Cf-Access-Jwt-Assertion": t } : {}), ...extra } });
const now = Math.floor(Date.now() / 1000);
const good = { email: "MOD@example.com", aud: ["aud-domain"], iss: "https://llansannan.cloudflareaccess.com", exp: now + 600 };
const cases = [
  ["valid token for a moderator", await token(real.kp, good), true],
  ["either AUD tag accepted", await token(real.kp, { ...good, aud: ["aud-workersdev"] }), true],
  ["token signed by an impostor key", await token(fake.kp, good), false],
  ["expired token", await token(real.kp, { ...good, exp: now - 10 }), false],
  ["wrong application (AUD)", await token(real.kp, { ...good, aud: ["other-app"] }), false],
  ["wrong issuer", await token(real.kp, { ...good, iss: "https://evil.cloudflareaccess.com" }), false],
  ["valid token but not a moderator", await token(real.kp, { ...good, email: "stranger@example.com" }), false],
  ["no token at all", null, false],
];
let fails = 0;
for (const [name, t, expect] of cases) {
  const me = await currentModerator(req(t), env);
  const okk = !!me === expect; if (!okk) fails++;
  console.log(okk ? "  ✓" : "  ✗", name);
}
const spoof = await currentModerator(req(null, { "x-dev-user": "mod@example.com" }), env);
console.log(!spoof ? "  ✓" : "  ✗", "dev shortcut header ignored on the live site"); if (spoof) fails++;
console.log(fails ? `${fails} failed` : "all passed");
