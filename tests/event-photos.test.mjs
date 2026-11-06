// Checks photos on events, including photos sent in by the public. Run with the local server going.
import { readFileSync } from "node:fs";
const BASE = "http://127.0.0.1:8787";
let pass = 0, fails = 0;
const ok = (c, m) => { c ? pass++ : fails++; console.log(c ? "  ✓" : "  ✗", m); };
const withLocation = readFileSync(new URL("./fixtures/with-location.jpg", import.meta.url));
const small = readFileSync(new URL("./fixtures/small.jpg", import.meta.url));
const publicUpload = (body, type = "image/jpeg") => fetch(BASE + "/api/events/photo", { method: "POST", headers: { "content-type": type }, body });
const json = (path, body, as) => fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(as ? { "x-dev-user": as } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

let r = await publicUpload(withLocation);
const { id } = await r.json();
ok(r.status === 200 && /^[a-f0-9]{32}$/.test(id), "the public can upload a photo with their event");
const stored = new Uint8Array(await (await fetch(BASE + "/img/" + id)).arrayBuffer());
const text = Buffer.from(stored).toString("latin1");
ok(!text.includes("Exif") && !text.includes("PhoneMaker"), "hidden details (camera, GPS location) are removed from the photo");
ok(stored[0] === 0xff && stored[1] === 0xd8 && stored.length > 500, "…and the picture itself is still intact");
r = await publicUpload(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "image/png");
ok(r.status === 400, "the public form only accepts JPEG (which the form always sends)");
r = await publicUpload(new TextEncoder().encode("not really a jpeg"));
ok(r.status === 400, "a file pretending to be a JPEG is refused");

const ev = { title_en: "Scarecrow trail", location_en: "Around the village", start_at: "2026-12-12T10:00", end_at: "2026-12-12T15:00",
  contact_name: "Gwen", contact_email: "gwen@example.com", consent: true, image_id: id, image_alt: "A scarecrow in a hat" };
r = await json("/api/events/submit", ev);
ok(r.status === 200, "an event is submitted with the photo");
let pub = await json("/api/events");
ok(!pub.data.events.some((e) => e.title_en === "Scarecrow trail"), "the event and photo aren't public until approved");
let q = await json("/api/admin/events?status=pending", null, "mod1@example.com");
const sub = q.data.items.find((e) => e.title_en === "Scarecrow trail");
ok(sub?.image_id === id && sub.image_alt === "A scarecrow in a hat", "moderators see the photo when reviewing");
await json(`/api/admin/events/${sub.id}/approve`, {}, "mod1@example.com");
pub = await json("/api/events");
ok(pub.data.events.find((e) => e.title_en === "Scarecrow trail")?.image_id === id, "once approved, the photo appears with the event");

// A moderator-only photo id can't be borrowed through the public form
const modUp = await fetch(BASE + "/api/admin/images", { method: "POST", headers: { "content-type": "image/jpeg", "x-dev-user": "lead1@example.com" }, body: small });
const modId = (await modUp.json()).id;
r = await json("/api/events/submit", { ...ev, title_en: "Borrowed photo", image_id: modId });
q = await json("/api/admin/events?status=pending", null, "lead1@example.com");
ok(q.data.items.find((e) => e.title_en === "Borrowed photo")?.image_id === null, "the public form can't attach a photo that wasn't sent through it");

// Moderators can add a photo to an event themselves
r = await json("/api/admin/events", { title_en: "Carol concert", location_en: "Church", start_at: "2026-12-20T18:00", image_id: modId, image_alt: "The choir" }, "lead1@example.com");
pub = await json("/api/events");
ok(pub.data.events.find((e) => e.title_en === "Carol concert")?.image_id === modId, "a moderator adds a photo to an event");

// Rate limit (6 per hour from one connection; 1 used above)
let codes = [];
for (let i = 0; i < 6; i++) codes.push((await publicUpload(small)).status);
ok(codes.slice(0, 5).every((c) => c === 200) && codes[5] === 429, `uploads from one connection are limited per hour (${codes.join(",")})`);
console.log(`\n${pass} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
