// Checks that the public can send in news, and that it stays hidden until a moderator approves it. Run with the local server going.
import { readFileSync } from "node:fs";
const BASE = "http://127.0.0.1:8787";
let pass = 0, fails = 0;
const ok = (c, m) => { c ? pass++ : fails++; console.log(c ? "  ✓" : "  ✗", m); };
const small = readFileSync(new URL("./fixtures/small.jpg", import.meta.url));
const json = (path, body, as) => fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(as ? { "x-dev-user": as } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

// The sample news from the seed survives the one-off table update
let pub = await json("/api/news");
const seeded = pub.data.news.length;
ok(pub.status === 200 && seeded > 0, "the existing news stories are still there after the news table was updated");

const up = await fetch(BASE + "/api/photo", { method: "POST", headers: { "content-type": "image/jpeg", "CF-Connecting-IP": "203.0.113.50" }, body: small });
const photo = (await up.json()).id;
ok(up.status === 200 && /^[a-f0-9]{32}$/.test(photo), "the public can upload a photo for their news");

const story = {
  title_en: "Thank you from the Harvest Supper",
  story_en: "A huge thank you to everyone who came to the Harvest Supper. We raised £640 for the church roof.\n\nSpecial thanks to the kitchen team, who served over 90 meals.",
  contact_name: "Elin", contact_email: "elin@example.com", contact_phone: "01745 000000", consent: true,
  image_id: photo, image_alt: "Tables laid out in the hall",
};
let r = await json("/api/news/submit", { ...story, consent: false });
ok(r.status === 400, "news without ticking the privacy box is refused");
r = await json("/api/news/submit", { ...story, contact_email: "" });
ok(r.status === 400, "news without an email is refused");
r = await json("/api/news/submit", { ...story, story_en: "" });
ok(r.status === 400, "news with no story is refused");
r = await json("/api/news/submit", { ...story, website: "http://spam.example" });
pub = await json("/api/news");
ok(r.status === 200, "a bot filling in the hidden field is quietly ignored");

r = await json("/api/news/submit", story);
ok(r.status === 200, "the public can send in a news story");
pub = await json("/api/news");
ok(!pub.data.news.some((n) => n.title_en === story.title_en), "it doesn't appear on the website until approved");
ok((await fetch(BASE + "/img/" + photo)).status === 404, "…and neither does its photo");

let q = await json("/api/admin/news?status=pending", null, "mod1@example.com");
const item = q.data.items.find((n) => n.title_en === story.title_en);
ok(item && item.source === "public" && item.contact_email === "elin@example.com", "moderators see it in the queue with the sender's details");
ok(item.summary_en === "A huge thank you to everyone who came to the Harvest Supper. We raised £640 for the church roof.", "the first paragraph becomes the summary");
ok(item.body_en === "Special thanks to the kitchen team, who served over 90 meals.", "…and the rest becomes the full story");
ok(item.image_id === photo, "the photo is attached");

r = await json(`/api/admin/news/${item.id}/approve`, {}, "mod1@example.com");
ok(r.status === 200, "any moderator can approve news sent in by the public");
pub = await json("/api/news");
const live = pub.data.news.find((n) => n.title_en === story.title_en);
ok(live && live.published_at && live.image_id === photo, "once approved it's on the website, with its photo");
ok(live && !("contact_email" in live) && !("contact_name" in live) && !JSON.stringify(pub.data).includes("elin@example.com"), "the sender's details are never shown publicly");
ok((await fetch(BASE + "/img/" + photo)).status === 200, "the photo can now be viewed");
ok(pub.data.news.length === seeded + 1, "only the one story was added (the bot's was ignored)");

// Rejecting news deletes its photo straight away
const up2 = await (await fetch(BASE + "/api/photo", { method: "POST", headers: { "content-type": "image/jpeg", "CF-Connecting-IP": "203.0.113.50" }, body: small })).json();
await json("/api/news/submit", { ...story, title_en: "Unsuitable news", image_id: up2.id });
q = await json("/api/admin/news?status=pending", null, "mod2@example.com");
const bad = q.data.items.find((n) => n.title_en === "Unsuitable news");
r = await json(`/api/admin/news/${bad.id}/reject`, { reason: "Not suitable" }, "mod2@example.com");
ok(r.status === 200, "a moderator can reject news sent in by the public");
ok((await fetch(BASE + "/img/" + up2.id, { headers: { "x-dev-user": "lead1@example.com" } })).status === 404, "the rejected story's photo is deleted immediately");

// Short news with no paragraph break
r = await json("/api/news/submit", { ...story, title_en: "Lost cat", story_en: "Black cat lost near the school. Answers to Mot.", image_id: "" });
q = await json("/api/admin/news?status=pending", null, "lead1@example.com");
const cat = q.data.items.find((n) => n.title_en === "Lost cat");
ok(cat && cat.summary_en === "Black cat lost near the school. Answers to Mot." && !cat.body_en, "a short story is used whole as the summary");

const log = await json("/api/admin/activity?type=news", null, "lead1@example.com");
ok(log.data.activity.some((a) => a.summary.includes("News sent in by the public")), "the activity log records news sent in by the public");

console.log(`\n${pass} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
