// Checks every moderation rule. Run with the local server going: npm run db:local, npm run dev, then npm test
// End-to-end checks of the moderation rules against the local server.
const BASE = "http://127.0.0.1:8787";
let pass = 0, failN = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log("  ✓", msg); } else { failN++; console.log("  ✗", msg); } };
async function call(path, { as, method = "GET", body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(as ? { "x-dev-user": as } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const L1 = "lead1@example.com", L2 = "lead2@example.com", M1 = "mod1@example.com", M2 = "mod2@example.com";
const ev = (t) => ({ title_en: t, location_en: "Village Hall", start_at: "2026-12-05T18:00", end_at: "2026-12-05T20:00", description_en: "Test" });

console.log("Public submission");
let r = await call("/api/events/submit", { method: "POST", body: { ...ev("Carol Singing"), contact_name: "Ann Jones", contact_email: "ann@example.com", consent: true } });
ok(r.status === 200, "public can submit an event");
r = await call("/api/events/submit", { method: "POST", body: { ...ev("No email"), contact_name: "Bob", consent: true } });
ok(r.status === 400 && /email/i.test(r.data.error), "email is required: " + r.data.error);
r = await call("/api/events/submit", { method: "POST", body: { ...ev("No consent"), contact_name: "Bob", contact_email: "b@example.com" } });
ok(r.status === 400, "privacy consent is required");
r = await call("/api/events");
ok(!r.data.events.some((e) => e.title_en === "Carol Singing"), "submitted event is NOT public until approved");
ok(!JSON.stringify(r.data).includes("ann@example.com"), "public API never exposes contact email");

console.log("Access");
r = await call("/api/admin/me", { as: "stranger@example.com" });
ok(r.status === 401, "non-moderator is refused");
r = await call("/api/admin/activity", { as: M1 });
ok(r.status === 403, "moderator cannot see the activity log");
r = await call("/api/admin/moderators", { as: M1 });
ok(r.status === 403, "moderator cannot manage moderators");

console.log("Approving a public submission");
r = await call("/api/admin/events?status=pending", { as: M1 });
const carol = r.data.items.find((e) => e.title_en === "Carol Singing");
ok(carol && carol.contact_email === "ann@example.com", "moderators can see the submitter's contact details");
r = await call(`/api/admin/events/${carol.id}/approve`, { as: M1, method: "POST" });
ok(r.status === 200, "moderator approves a public submission");
r = await call("/api/events");
ok(r.data.events.some((e) => e.title_en === "Carol Singing"), "approved event is now public");

console.log("Moderator's own event needs a second approval");
r = await call("/api/admin/events", { as: M1, method: "POST", body: ev("Mod1 Bake Sale") });
ok(r.data.status === "pending", "moderator's own event starts as pending");
const bake = r.data.id;
r = await call(`/api/admin/events/${bake}/approve`, { as: M1, method: "POST" });
ok(r.status === 403, "moderator CANNOT approve their own event: " + r.data.error);
r = await call(`/api/admin/events/${bake}/approve`, { as: M2, method: "POST" });
ok(r.status === 200, "a different moderator can approve it");

console.log("Moderator's own news needs a second approval");
r = await call("/api/admin/news", { as: M2, method: "POST", body: { title_en: "Mod2 News", summary_en: "Something happened" } });
const n1 = r.data.id;
ok(r.data.status === "pending", "moderator's news starts as pending");
r = await call(`/api/admin/news/${n1}/approve`, { as: M2, method: "POST" });
ok(r.status === 403, "moderator cannot approve own news");
r = await call(`/api/admin/news/${n1}/approve`, { as: L2, method: "POST" });
ok(r.status === 200, "lead can approve it");
r = await call("/api/news");
ok(r.data.news[0]?.title_en === "Mod2 News", "approved news is public, newest first");

console.log("Leads don't need a second approval");
r = await call("/api/admin/events", { as: L1, method: "POST", body: ev("Lead Concert") });
ok(r.data.status === "approved", "lead's own event goes live immediately");
r = await call("/api/admin/news", { as: L1, method: "POST", body: { title_en: "Lead News", summary_en: "Hello" } });
ok(r.data.status === "approved", "lead's own news goes live immediately");

console.log("Loophole: editing a live item");
r = await call(`/api/admin/events/${carol.id}`, { as: M2, method: "PUT", body: { title_en: "Carol Singing (updated)" } });
ok(r.data.status === "pending", "moderator editing a live event sends it back for approval");
r = await call("/api/events");
ok(!r.data.events.some((e) => e.id === carol.id), "edited event is off the site until re-approved");
r = await call(`/api/admin/events/${carol.id}/approve`, { as: M2, method: "POST" });
ok(r.status === 403, "the editor cannot re-approve their own change");
r = await call(`/api/admin/events/${carol.id}/approve`, { as: M1, method: "POST" });
ok(r.status === 200, "another moderator can re-approve");
r = await call(`/api/admin/events/${carol.id}`, { as: L1, method: "PUT", body: { description_en: "Lead tweak" } });
ok(r.data.status === "approved", "lead editing a live event keeps it live");

console.log("Take down / delete");
r = await call(`/api/admin/events/${bake}/reject`, { as: M1, method: "POST", body: { reason: "x" } });
ok(r.status === 403, "moderator cannot take down a live event");
r = await call(`/api/admin/events/${bake}/reject`, { as: L1, method: "POST", body: { reason: "Cancelled by organiser" } });
ok(r.status === 200, "lead can take down a live event");
r = await call(`/api/admin/events/${bake}/delete`, { as: M1, method: "POST" });
ok(r.status === 403, "moderator cannot delete");

console.log("Managing moderators");
r = await call("/api/admin/moderators", { as: L1, method: "POST", body: { name: "New Volunteer", email: "Vol@Example.com", role: "moderator" } });
ok(r.status === 200, "lead appoints a moderator");
r = await call("/api/admin/me", { as: "vol@example.com" });
ok(r.status === 200 && r.data.me.role === "moderator", "new moderator can sign in (email case ignored)");
r = await call(`/api/admin/moderators/${r.data.me.id}`, { as: L1, method: "PUT", body: { active: false } });
r = await call("/api/admin/me", { as: "vol@example.com" });
ok(r.status === 401, "removed moderator is locked out");
await call("/api/admin/moderators/2", { as: L1, method: "PUT", body: { role: "moderator" } });
r = await call("/api/admin/moderators/1", { as: L1, method: "PUT", body: { active: false } });
ok(r.status === 409, "cannot remove the last lead: " + r.data.error);
await call("/api/admin/moderators/2", { as: L1, method: "PUT", body: { role: "lead" } });

console.log("Activity log");
r = await call("/api/admin/activity", { as: L1 });
const acts = r.data.activity.map((a) => a.action);
for (const a of ["submitted", "approved", "created", "edited", "taken_down", "moderator_added", "moderator_removed", "moderator_changed"])
  ok(acts.includes(a), `log records "${a}"`);
ok(!JSON.stringify(r.data).includes("ann@example.com") || r.data.activity.find(a=>a.action==="submitted").actor_label.includes("ann@"), "contact email appears only as the submitter's own label");
const edit = r.data.activity.find((a) => a.action === "edited" && a.details && JSON.parse(a.details).title_en);
ok(edit && JSON.parse(edit.details).title_en?.to === "Carol Singing (updated)", "log keeps before/after of edits");
r = await call("/api/admin/activity?actor=3", { as: L1 });
ok(r.data.activity.length > 0 && r.data.activity.every((a) => a.actor_id === 3), "log can be filtered by person");

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
