// Checks news posts with several photos (each with a caption) and links in the story. Run with the local server going.
import { readFileSync } from "node:fs";
const BASE = "http://127.0.0.1:8787";
let pass = 0, fails = 0;
const ok = (c, m) => { c ? pass++ : fails++; console.log(c ? "  ✓" : "  ✗", m); };
const small = readFileSync(new URL("./fixtures/small.jpg", import.meta.url));
const call = (method, path, body, as) => fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(as ? { "x-dev-user": as } : {}) }, body: body ? JSON.stringify(body) : undefined })
  .then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
const upload = (as) => fetch(BASE + "/api/admin/images", { method: "POST", headers: { "content-type": "image/jpeg", "x-dev-user": as }, body: small }).then((r) => r.json());

const photos = [];
for (let i = 0; i < 3; i++) photos.push((await upload("lead1@example.com")).id);
ok(photos.every((p) => /^[a-f0-9]{32}$/.test(p)), "a moderator can upload several photos");

const post = {
  title_en: "Remembrance Sunday 2026", summary_en: "A big turnout at the Cenotaph.",
  body_en: "Thank you to everyone who came.\n\nMore about the Legion at https://www.britishlegion.org.uk and the [Council's website](https://llansannan-cc.gov.wales/).",
  gallery: photos.map((id, i) => ({ id, cap_en: `Photo ${i + 1}`, cap_cy: `Llun ${i + 1}` })),
};
let r = await call("POST", "/api/admin/news", post, "lead1@example.com");
ok(r.status === 200 && r.data.status === "approved", "a lead can publish a post with three photos and captions");
const id = r.data.id;
let pub = await call("GET", "/api/news");
let live = pub.data.news.find((n) => n.id === id);
const g = live && JSON.parse(live.gallery || "[]");
ok(g && g.length === 3 && g[0].id === photos[0] && g[2].cap_cy === "Llun 3", "the photos, their order and captions are on the website");
ok(live && live.body_en.includes("[Council's website](https://llansannan-cc.gov.wales/)"), "the story keeps its links");
ok((await fetch(BASE + "/img/" + photos[1])).status === 200, "the photos can be viewed by anyone");

// Re-order and remove a photo by editing
r = await call("PUT", `/api/admin/news/${id}`, { ...post, gallery: [post.gallery[2], post.gallery[0]] }, "lead1@example.com");
pub = await call("GET", "/api/news");
const g2 = JSON.parse(pub.data.news.find((n) => n.id === id).gallery);
ok(g2.length === 2 && g2[0].id === photos[2] && g2[1].id === photos[0], "editing can re-order and remove photos");
r = await call("PUT", `/api/admin/news/${id}`, { ...post, gallery: JSON.stringify([post.gallery[2], post.gallery[0]]) }, "lead1@example.com");
ok(r.data.unchanged === true, "saving without changes is recognised as no change");

// Mistakes are refused
r = await call("POST", "/api/admin/news", { ...post, gallery: [{ id: "not-a-photo" }] }, "lead1@example.com");
ok(r.status === 400, "a made-up photo is refused");
r = await call("POST", "/api/admin/news", { ...post, gallery: Array.from({ length: 41 }, () => ({ id: photos[0] })) }, "lead1@example.com");
ok(r.status === 400, "more than 40 photos is refused");
r = await call("POST", "/api/admin/news", { ...post, body_en: "x".repeat(20001) }, "lead1@example.com");
ok(r.status === 400, "a story over 20,000 characters is refused");
r = await call("POST", "/api/admin/news", { ...post, title_en: "Long story", body_en: "word ".repeat(3000) }, "lead1@example.com");
ok(r.status === 200, "long stories (like the old llansannan.org posts) are fine");

// An ordinary moderator's post with photos still needs a second approval
r = await call("POST", "/api/admin/news", { ...post, title_en: "From a moderator" }, "mod1@example.com");
ok(r.data.status === "pending", "an ordinary moderator's post with photos waits for approval");
pub = await call("GET", "/api/news");
ok(!pub.data.news.some((n) => n.title_en === "From a moderator"), "…and isn't on the website yet");

console.log(`\n${pass} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
