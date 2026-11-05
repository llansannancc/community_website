// Checks "Sign in with GitHub" end to end, using a pretend GitHub.
// Run: npm run db:local, then `node tests/mock-github.mjs` and `npm run dev` in two terminals, then this file.
const BASE = "http://127.0.0.1:8787";
let pass = 0, fails = 0;
const ok = (c, m) => { c ? pass++ : fails++; console.log(c ? "  ✓" : "  ✗", m); };
const cookieOf = (res, name) => (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).find((c) => c.startsWith(name + "="));

async function signIn(email, { tamperState = false } = {}) {
  const start = await fetch(BASE + "/api/auth/github", { redirect: "manual" });
  const state = cookieOf(start, "llan_oauth_state");
  const toGithub = new URL(start.headers.get("location"));
  toGithub.searchParams.set("as", email);
  const gh = await fetch(toGithub, { redirect: "manual" });
  const back = new URL(gh.headers.get("location"));
  if (tamperState) back.searchParams.set("state", "forged");
  const cb = await fetch(back, { redirect: "manual", headers: { cookie: state } });
  return { start, toGithub, cb, location: cb.headers.get("location"), session: cookieOf(cb, "llan_session"), stateCookie: state };
}
const me = (cookie) => fetch(BASE + "/api/admin/me", { headers: cookie ? { cookie } : {} }).then(async (r) => ({ status: r.status, data: await r.json() }));

let r = await me();
ok(r.status === 401, "not signed in → refused");

let s = await signIn("lead1@example.com");
ok(s.toGithub.searchParams.get("scope") === "user:email", "asks GitHub only for email addresses");
ok(s.stateCookie && /HttpOnly/i.test(s.start.headers.getSetCookie().join()), "sign-in is protected with a one-time state value");
ok(s.location.endsWith("/admin/#queue") && s.session, "a lead signs in with GitHub and lands on the moderator area");
const lead = s.session;
r = await me(lead);
ok(r.data.me?.email === "lead1@example.com" && r.data.me.role === "lead", "matched to the right moderator (by a verified, secondary GitHub email, any capitals)");

s = await signIn("stranger@example.com");
ok(s.location.includes("error=not-moderator") && !s.session, "a GitHub user who isn't a moderator is refused");
s = await signIn("unverified@example.com");
ok(s.location.includes("error=no-email") && !s.session, "unverified GitHub emails don't count");
s = await signIn("lead1@example.com", { tamperState: true });
ok(s.location.includes("error=expired") && !s.session, "a forged sign-in response is refused");

s = await signIn("mod1@example.com");
const mod = s.session;
r = await me(mod);
ok(r.data.me?.role === "moderator", "a moderator signs in as a moderator");

// Appoint by email, then they can sign in
let res = await fetch(BASE + "/api/admin/moderators", { method: "POST", headers: { "content-type": "application/json", cookie: lead }, body: JSON.stringify({ name: "New Helper", email: "helper@example.com", role: "moderator" }) });
const helperId = (await res.json()).id;
s = await signIn("helper@example.com");
ok(!!s.session, "someone just appointed by a lead can sign in straight away");
const helper = s.session;
await fetch(BASE + `/api/admin/moderators/${helperId}`, { method: "PUT", headers: { "content-type": "application/json", cookie: lead }, body: JSON.stringify({ active: false }) });
r = await me(helper);
ok(r.status === 401, "removing a moderator signs them out immediately");
s = await signIn("helper@example.com");
ok(s.location.includes("error=not-moderator"), "…and they can't sign back in");

await fetch(BASE + "/api/auth/logout", { method: "POST", headers: { cookie: mod } });
r = await me(mod);
ok(r.status === 401, "signing out ends the session");

r = await fetch(BASE + "/api/admin/activity", { headers: { cookie: lead } }).then((x) => x.json());
const acts = r.activity.map((a) => a.action);
ok(acts.includes("signed_in") && acts.includes("sign_in_refused"), "sign-ins and refused attempts are in the activity log");
ok(r.activity.some((a) => a.summary.includes("signed in with GitHub (@")), "the log records which GitHub account was used");
console.log(`\n${pass} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
