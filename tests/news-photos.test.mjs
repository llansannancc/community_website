// Checks photo upload for news stories. Run with the local server going.
import { readFileSync } from "node:fs";
const BASE = "http://127.0.0.1:8787";
const SMALL = process.argv[2] || new URL("./fixtures/small.jpg", import.meta.url);
let pass = 0, fails = 0;
const ok = (c, m) => { c ? pass++ : fails++; console.log(c ? "  ✓" : "  ✗", m); };
const up = (body, type, as) => fetch(BASE + "/api/admin/images", { method: "POST", headers: { "content-type": type, ...(as ? { "x-dev-user": as } : {}) }, body });
const jpeg = readFileSync(SMALL);

let r = await up(jpeg, "image/jpeg");
ok(r.status === 401, "the public can't upload photos");
r = await up(jpeg, "image/jpeg", "mod1@example.com");
const { id } = await r.json();
ok(r.status === 200 && /^[a-f0-9]{32}$/.test(id), "a moderator uploads a photo and gets a random id");
r = await fetch(BASE + "/img/" + id);
const back = new Uint8Array(await r.arrayBuffer());
ok(r.status === 200 && r.headers.get("content-type") === "image/jpeg" && back.length === jpeg.length, "the photo is served back unchanged");
ok(/immutable/.test(r.headers.get("cache-control")), "photos are cached by browsers");
r = await up(new TextEncoder().encode("<svg onload=alert(1)>"), "image/svg+xml", "mod1@example.com");
ok(r.status === 400, "other file types (e.g. SVG) are refused");
r = await up(new Uint8Array(1_200_000), "image/jpeg", "mod1@example.com");
ok(r.status === 400, "very large uploads are refused");
r = await fetch(BASE + "/img/notarealid");
ok(r.status === 404, "made-up photo addresses give 'not found'");

const post = (path, body, as) => fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", "x-dev-user": as }, body: JSON.stringify(body) }).then((x) => x.json());
let n = await post("/api/admin/news", { title_en: "Lights go up", summary_en: "Thanks to the volunteers.", image_id: id, image_alt: "Volunteers on ladders" }, "lead1@example.com");
ok(n.status === "approved", "a lead posts a story with a photo");
const pub = await fetch(BASE + "/api/news").then((x) => x.json());
const story = pub.news.find((x) => x.title_en === "Lights go up");
ok(story?.image_id === id && story.image_alt === "Volunteers on ladders", "the public news feed includes the photo and its description");
n = await fetch(BASE + "/api/admin/news", { method: "POST", headers: { "content-type": "application/json", "x-dev-user": "lead1@example.com" }, body: JSON.stringify({ title_en: "x", summary_en: "y", image_id: "../../etc" }) });
ok(n.status === 400, "a bad photo id is refused");
console.log(`\n${pass} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
