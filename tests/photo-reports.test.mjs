// Checks reporting an unsuitable photo: the photo is deleted, a record of the sender is kept for leads, and the same photo can't be sent again.
import { readFileSync } from "node:fs";
const BASE = "http://127.0.0.1:8787";
let pass = 0, fails = 0;
const ok = (c, m) => { c ? pass++ : fails++; console.log(c ? "  ✓" : "  ✗", m); };
const photo = readFileSync(new URL("./fixtures/with-location.jpg", import.meta.url));
const FROM = { "CF-Connecting-IP": "198.51.100.23", "User-Agent": "TestPhone/1.0" };
const call = (path, body, as, extra = {}) => fetch(BASE + path, {
  method: body ? "POST" : "GET",
  headers: { "content-type": "application/json", ...(as ? { "x-dev-user": as } : {}), ...extra },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
const upload = () => fetch(BASE + "/api/photo", { method: "POST", headers: { "content-type": "image/jpeg", ...FROM }, body: photo }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

const up = await upload();
ok(up.status === 200, "a member of the public uploads a photo");
const story = { title_en: "Dodgy story", story_en: "Something.", contact_name: "A Person", contact_email: "someone@example.com", contact_phone: "07000 000000", consent: true, image_id: up.data.id };
ok((await call("/api/news/submit", story, null, FROM)).status === 200, "…and sends it with a news story");
let q = await call("/api/admin/news?status=pending", null, "mod1@example.com");
const item = q.data.items.find((n) => n.title_en === "Dodgy story");
ok(item && !("ip" in item), "the moderator queue doesn't show internet addresses");

ok((await call(`/api/admin/news/${item.id}/report`, { reason: "Offensive image" }, "mod1@example.com")).status === 200, "any moderator can report the photo");
q = await call("/api/admin/news?status=rejected", null, "lead1@example.com");
const after = q.data.items.find((n) => n.id === item.id);
ok(after && after.status === "rejected" && !after.image_id, "the story is rejected and the photo removed from it");
ok((await fetch(BASE + "/img/" + up.data.id, { headers: { "x-dev-user": "lead1@example.com" } })).status === 404, "the photo itself is deleted");

const r = await call("/api/admin/reports", null, "lead1@example.com");
const rec = r.data.reports && r.data.reports.find((x) => x.item_id === item.id);
ok(rec && rec.ip === "198.51.100.23", "leads can see the internet address it came from");
ok(rec && rec.contact_email === "someone@example.com" && rec.contact_phone === "07000 000000", "…and the contact details the sender gave");
ok(rec && rec.device === "TestPhone/1.0" && rec.reason === "Offensive image" && rec.reported_by_name, "…and their device, the reason, and who reported it");
ok(rec && new Date(rec.expires_at) - Date.now() > 89 * 86400000, "the record is kept for 90 days");
ok((await call("/api/admin/reports", null, "mod1@example.com")).status === 403, "ordinary moderators can't see the reports");

ok((await upload()).status === 403, "the same photo can't be sent again");

const log = await call("/api/admin/activity?type=news", null, "lead1@example.com");
ok(log.data.activity.some((a) => a.action === "photo_reported" && !a.summary.includes("198.51.100.23")), "the activity log records the report, without the internet address");

console.log(`\n${pass} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
