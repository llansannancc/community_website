// Checks regular (weekly/monthly) activities follow the same approval rules. Run with the local server going.
const BASE = "http://127.0.0.1:8787";
let pass = 0, fails = 0;
const ok = (c, m) => { c ? pass++ : fails++; console.log(c ? "  ✓" : "  ✗", m); };
async function call(path, { as, method = "GET", body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(as ? { "x-dev-user": as } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const L1 = "lead1@example.com", M1 = "mod1@example.com", M2 = "mod2@example.com";
const welsh = { title_en: "Welsh conversation group", title_cy: "Grŵp sgwrsio Cymraeg", day: 4, start_time: "18:30", end_time: "19:30", location_en: "Y Ddarllenfa", week_of_month: "" };

let r = await call("/api/weekly");
ok(r.status === 200 && r.data.weekly.length === 2, "public can see the live regular activities");
r = await call("/api/admin/weekly", { as: M1, method: "POST", body: welsh });
ok(r.data.status === "pending", "a moderator's new regular activity waits for approval");
const id = r.data.id;
r = await call("/api/weekly");
ok(!r.data.weekly.some((w) => w.id === id), "…and isn't on the website yet");
r = await call(`/api/admin/weekly/${id}/approve`, { as: M1, method: "POST" });
ok(r.status === 403, "they can't approve their own");
r = await call(`/api/admin/weekly/${id}/approve`, { as: M2, method: "POST" });
ok(r.status === 200, "another moderator approves it");
r = await call("/api/weekly");
ok(r.data.weekly.some((w) => w.id === id && w.week_of_month === null), "now it's on the website (every week)");

r = await call("/api/admin/weekly", { as: L1, method: "POST", body: { ...welsh, title_en: "Craft club", week_of_month: "-1", day: 6, start_time: "14:00", end_time: "" } });
ok(r.data.status === "approved", "a lead's regular activity goes live straight away");
r = await call("/api/weekly");
ok(r.data.weekly.some((w) => w.title_en === "Craft club" && w.week_of_month === -1), "monthly ('last Saturday') is saved");

r = await call(`/api/admin/weekly/${id}`, { as: M2, method: "PUT", body: { start_time: "19:00" } });
ok(r.data.status === "pending", "a moderator editing a live one sends it back for approval");
r = await call(`/api/admin/weekly/${id}/approve`, { as: M2, method: "POST" });
ok(r.status === 403, "the editor can't re-approve their own change");

r = await call("/api/admin/weekly", { as: L1, method: "POST", body: { ...welsh, day: 9 } });
ok(r.status === 400, "an invalid day is refused");
r = await call("/api/admin/weekly", { as: L1, method: "POST", body: { ...welsh, start_time: "20:00", end_time: "19:00" } });
ok(r.status === 400, "finishing before it starts is refused");
r = await call("/api/admin/weekly", { as: L1, method: "POST", body: { ...welsh, title_en: "Old term", ends_on: "2020-01-01" } });
r = await call("/api/weekly");
ok(!r.data.weekly.some((w) => w.title_en === "Old term"), "activities whose last date has passed drop off the website");

r = await call("/api/admin/activity?type=weekly", { as: L1 });
ok(r.data.activity.length >= 4, "regular activity changes are in the activity log");
console.log(`\n${pass} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
