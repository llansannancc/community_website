// Checks "Share a photo": the public sends a photo, it stays hidden until a moderator approves it, then it's in the gallery.
import { readFileSync } from "node:fs";
const BASE = "http://127.0.0.1:8787";
let pass = 0, fails = 0;
const ok = (c, m) => { c ? pass++ : fails++; console.log(c ? "  ✓" : "  ✗", m); };
const photo = readFileSync(new URL("./fixtures/small.jpg", import.meta.url));
const FROM = { "CF-Connecting-IP": "203.0.113.120" };
const call = (method, path, body, as, extra = {}) => fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(as ? { "x-dev-user": as } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined })
  .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
const upload = (ip = FROM) => fetch(BASE + "/api/photo", { method: "POST", headers: { "content-type": "image/jpeg", ...ip }, body: photo }).then((r) => r.json());

const up = await upload();
ok(/^[a-f0-9]{32}$/.test(up.id || ""), "the public can upload a photo");
const thumbRes = await fetch(`${BASE}/api/photo/${up.id}/thumb`, { method: "POST", headers: { "content-type": "image/jpeg", ...FROM }, body: photo });
ok(thumbRes.status === 200, "…and a small preview of it");
ok((await fetch(`${BASE}/api/photo/${up.id}/thumb`, { method: "POST", headers: { "content-type": "image/jpeg", ...FROM }, body: photo })).status === 409, "the preview can't be replaced afterwards");
ok((await fetch(`${BASE}/api/photo/${up.id}/thumb`, { method: "POST", headers: { "content-type": "image/jpeg", "CF-Connecting-IP": "198.51.100.1" }, body: photo })).status !== 200, "someone else can't add a preview to it");

const share = { image_id: up.id, title_en: "Snow on Mynydd Hiraethog", title_cy: "Eira ar Fynydd Hiraethog", place: "Bylchau", taken_on: "2026-11-19", credit: "Siân",
  contact_name: "Siân Jones", contact_email: "sian@example.com", consent: true };
ok((await call("POST", "/api/photos/submit", { ...share, consent: false }, null, FROM)).status === 400, "a photo without the boxes ticked is refused");
ok((await call("POST", "/api/photos/submit", { ...share, image_id: "" }, null, FROM)).status === 400, "sending without a photo is refused");
ok((await call("POST", "/api/photos/submit", { ...share, title_en: "" }, null, FROM)).status === 400, "a photo without a caption is refused");
ok((await call("POST", "/api/photos/submit", { ...share, taken_on: "yesterday" }, null, FROM)).status === 400, "a made-up date is refused");
ok((await call("POST", "/api/photos/submit", share, null, FROM)).status === 200, "the public can share a photo");
ok((await call("POST", "/api/photos/submit", share, null, FROM)).status === 400, "the same upload can't be sent twice");

let pub = await call("GET", "/api/photos");
ok(!pub.data.photos.some((p) => p.image_id === up.id), "it isn't in the gallery until approved");
ok((await fetch(`${BASE}/img/${up.id}`)).status === 404 && (await fetch(`${BASE}/img/${up.id}?s=t`)).status === 404, "…and neither the photo nor its preview can be opened");

let q = await call("GET", "/api/admin/photos?status=pending", null, "mod1@example.com");
const item = q.data.items.find((p) => p.image_id === up.id);
ok(item && item.source === "public" && item.contact_email === "sian@example.com", "moderators see it waiting, with the sender's details");
ok((await call("POST", `/api/admin/photos/${item.id}/approve`, {}, "mod1@example.com")).status === 200, "any moderator can approve it");

pub = await call("GET", "/api/photos");
const live = pub.data.photos.find((p) => p.image_id === up.id);
ok(live && live.title_cy === "Eira ar Fynydd Hiraethog" && live.place === "Bylchau" && live.credit === "Siân" && live.taken_on === "2026-11-19", "once approved it's in the gallery with its caption, place, date and name");
ok(live && !("contact_email" in live) && !JSON.stringify(pub.data).includes("sian@example.com"), "the sender's details are never shown publicly");
const full = await fetch(`${BASE}/img/${up.id}`), small = await fetch(`${BASE}/img/${up.id}?s=t`);
ok(full.status === 200 && small.status === 200 && small.headers.get("content-type") === "image/jpeg", "the photo and its preview can now be opened");

// Rejecting deletes the photo
const up2 = await upload();
await call("POST", "/api/photos/submit", { ...share, image_id: up2.id, title_en: "Not suitable" }, null, FROM);
q = await call("GET", "/api/admin/photos?status=pending", null, "mod2@example.com");
const bad = q.data.items.find((p) => p.title_en === "Not suitable");
await call("POST", `/api/admin/photos/${bad.id}/reject`, { reason: "Blurry" }, "mod2@example.com");
ok((await fetch(`${BASE}/img/${up2.id}`, { headers: { "x-dev-user": "lead1@example.com" } })).status === 404, "rejecting a shared photo deletes it straight away");

// Reporting works for shared photos too
const up3 = await upload();
await call("POST", "/api/photos/submit", { ...share, image_id: up3.id, title_en: "Offensive" }, null, FROM);
q = await call("GET", "/api/admin/photos?status=pending", null, "mod1@example.com");
const off = q.data.items.find((p) => p.title_en === "Offensive");
ok((await call("POST", `/api/admin/photos/${off.id}/report`, { reason: "Offensive" }, "mod1@example.com")).status === 200, "an unsuitable shared photo can be reported");
const reps = await call("GET", "/api/admin/reports", null, "lead1@example.com");
ok(reps.data.reports.some((r) => r.kind === "photo" && r.item_title === "Offensive" && r.ip === "203.0.113.120"), "…and the sender's record is kept for leads");

// Moderators can add photos too, with the usual approval rules
const mup = await fetch(BASE + "/api/admin/images", { method: "POST", headers: { "content-type": "image/jpeg", "x-dev-user": "mod1@example.com" }, body: photo }).then((r) => r.json());
let r = await call("POST", "/api/admin/photos", { image_id: mup.id, title_en: "Rainbow over the church" }, "mod1@example.com");
ok(r.data.status === "pending", "a moderator's own photo waits for a second approval");
ok((await call("POST", `/api/admin/photos/${r.data.id}/approve`, {}, "mod1@example.com")).status === 403, "…which they can't give themselves");
r = await call("POST", "/api/admin/photos", { image_id: mup.id, title_en: "Rainbow (lead)" }, "lead1@example.com");
ok(r.data.status === "approved", "a lead's photo goes live straight away");

console.log(`\n${pass} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
