// Llansannan Community website: the server side (a Cloudflare Worker).
// It serves the website files from /public and answers the /api/... requests below.
//
// The rules in one place:
//  - Anyone can submit an event. It stays "pending" until a moderator approves it.
//  - Moderators can approve, reject and edit. Their OWN events and news need a different
//    moderator (or a lead) to approve them.
//  - Lead moderators' own events and news go live straight away.
//  - Only leads can manage moderators, delete items, take down live items and read the activity log.
//  - Every action is written to the activity log, which can't be edited or deleted.

import { currentModerator, startGithubSignIn, finishGithubSignIn, clearStateCookie, clearSessionCookie, endSession, endAllSessions } from "./auth.js";
import { notifyModerators } from "./email.js";

// ---------- small helpers ----------
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const fail = (status, message) => json({ error: message }, status);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const httpError = (status, msg) => { throw new HttpError(status, msg); };

/** Current UK local time as 'YYYY-MM-DDTHH:MM' (events are stored in UK local time). */
function ukNow(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}

const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v, max, { required = false, label = "This field" } = {}) {
  const s = v == null ? "" : String(v).trim();
  if (required && !s) httpError(400, `${label} is required.`);
  if (s.length > max) httpError(400, `${label} is too long (maximum ${max} characters).`);
  return s || null;
}

async function readJson(request) {
  try { return await request.json(); } catch { httpError(400, "Invalid request."); }
}

const who = (m) => `${m.name} <${m.email}>`;

async function log(env, actor, action, itemType, itemId, summary, details = null) {
  await env.DB.prepare(
    "INSERT INTO activity (actor_id, actor_label, action, item_type, item_id, summary, details) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(actor?.id ?? null, actor?.label ?? who(actor), action, itemType, itemId ?? null, summary, details ? JSON.stringify(details) : null).run();
}

function diff(before, after, fields) {
  const changes = {};
  for (const f of fields) if ((before[f] ?? null) !== (after[f] ?? null)) changes[f] = { from: before[f] ?? null, to: after[f] ?? null };
  return changes;
}

// ---------- field definitions ----------
const EVENT_FIELDS = ["title_en", "title_cy", "description_en", "description_cy", "location_en", "location_cy", "start_at", "end_at", "organiser", "contact_name", "contact_email", "contact_phone"];
const NEWS_FIELDS = ["title_en", "title_cy", "summary_en", "summary_cy", "body_en", "body_cy", "category_en", "category_cy"];

function eventInput(b, { isPublic }) {
  const e = {
    title_en: clean(b.title_en, 120, { required: true, label: "Event name" }),
    title_cy: clean(b.title_cy, 120, { label: "Welsh event name" }),
    description_en: clean(b.description_en, 2000, { label: "Description" }) || "",
    description_cy: clean(b.description_cy, 2000, { label: "Welsh description" }),
    location_en: clean(b.location_en, 120, { required: true, label: "Location" }),
    location_cy: clean(b.location_cy, 120, { label: "Welsh location" }),
    start_at: clean(b.start_at, 16, { required: true, label: "Start date and time" }),
    end_at: clean(b.end_at, 16, { label: "End time" }),
    organiser: clean(b.organiser, 120, { label: "Organiser" }),
    contact_name: clean(b.contact_name, 120, { required: isPublic, label: "Your name" }),
    contact_email: clean(b.contact_email, 200, { required: isPublic, label: "Your email" }),
    contact_phone: clean(b.contact_phone, 40, { label: "Phone" }),
  };
  if (!DT.test(e.start_at)) httpError(400, "Please give a valid start date and time.");
  if (!e.end_at) e.end_at = e.start_at;
  if (!DT.test(e.end_at)) httpError(400, "Please give a valid end time.");
  if (e.end_at < e.start_at) httpError(400, "The event can't finish before it starts.");
  if (e.contact_email && !EMAIL.test(e.contact_email)) httpError(400, "Please give a valid email address.");
  if (isPublic && e.start_at < ukNow().slice(0, 10)) httpError(400, "The event date is in the past.");
  return e;
}

function newsInput(b) {
  return {
    title_en: clean(b.title_en, 140, { required: true, label: "Headline" }),
    title_cy: clean(b.title_cy, 140, { label: "Welsh headline" }),
    summary_en: clean(b.summary_en, 300, { required: true, label: "Summary" }),
    summary_cy: clean(b.summary_cy, 300, { label: "Welsh summary" }),
    body_en: clean(b.body_en, 5000, { label: "Full story" }) || "",
    body_cy: clean(b.body_cy, 5000, { label: "Welsh full story" }),
    category_en: clean(b.category_en, 40, { label: "Category" }) || "Community",
    category_cy: clean(b.category_cy, 40, { label: "Welsh category" }),
  };
}

// ---------- Turnstile (spam protection on the public form) ----------
async function checkTurnstile(token, request, env) {
  if (env.ENVIRONMENT === "development") return true; // local testing
  if (!env.TURNSTILE_SECRET) return true;             // not set up yet
  if (!token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const out = await res.json();
  return !!out.success;
}

// ---------- public API ----------
const PUBLIC_EVENT_COLS = "id, title_en, title_cy, description_en, description_cy, location_en, location_cy, start_at, end_at, organiser";

async function publicEvents(env) {
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_EVENT_COLS} FROM events WHERE status = 'approved' AND end_at >= ? ORDER BY start_at LIMIT 300`
  ).bind(ukNow().slice(0, 10)).all();
  return json({ events: results });
}

async function publicNews(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, title_en, title_cy, summary_en, summary_cy, body_en, body_cy, category_en, category_cy, published_at FROM news WHERE status = 'approved' ORDER BY published_at DESC LIMIT 30"
  ).all();
  return json({ news: results });
}

async function submitEvent(request, env) {
  const b = await readJson(request);
  if (b.website) return json({ ok: true }); // hidden honeypot field: bots fill it in, people don't
  if (!(await checkTurnstile(b.turnstile, request, env))) httpError(400, "Please complete the spam check and try again.");
  if (!b.consent) httpError(400, "Please tick the box to agree to the privacy notice.");
  const e = eventInput(b, { isPublic: true });

  const r = await env.DB.prepare(
    `INSERT INTO events (${EVENT_FIELDS.join(", ")}, status, source) VALUES (${EVENT_FIELDS.map(() => "?").join(", ")}, 'pending', 'public')`
  ).bind(...EVENT_FIELDS.map((f) => e[f])).run();
  const id = r.meta.last_row_id;

  await log(env, { label: `Public: ${e.contact_name} <${e.contact_email}>` }, "submitted", "event", id, `Event submitted by the public: "${e.title_en}" on ${e.start_at.replace("T", " ")}`);
  await notifyModerators(env, {
    subject: `New event to approve: ${e.title_en}`,
    lines: [
      "A new event has been submitted and is waiting for approval.",
      `Event: ${e.title_en}`,
      `When: ${e.start_at.replace("T", " at ")}`,
      `Where: ${e.location_en}`,
      `Submitted by: ${e.contact_name} (${e.contact_email})`,
    ],
    link: "/admin/#queue",
  });
  return json({ ok: true });
}

// ---------- moderator API ----------
async function loadItem(env, table, id) {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!row || row.status === "deleted") httpError(404, "Not found.");
  return row;
}

async function listItems(env, table, url) {
  const status = url.searchParams.get("status") || "all";
  const where = status === "all" ? "t.status != 'deleted'" : "t.status = ?";
  const order = table === "events" ? "t.start_at" : "COALESCE(t.published_at, t.created_at) DESC";
  const stmt = env.DB.prepare(
    `SELECT t.*, s.name AS submitted_by_name, r.name AS reviewed_by_name, e.name AS last_edited_by_name
     FROM ${table} t
     LEFT JOIN moderators s ON s.id = t.submitted_by
     LEFT JOIN moderators r ON r.id = t.reviewed_by
     LEFT JOIN moderators e ON e.id = t.last_edited_by
     WHERE ${where} ORDER BY ${order} LIMIT 500`
  );
  const { results } = status === "all" ? await stmt.all() : await stmt.bind(status).all();
  return results;
}

async function createItem(env, me, kind, b) {
  const isEvent = kind === "event";
  const table = isEvent ? "events" : "news";
  const data = isEvent ? eventInput(b, { isPublic: false }) : newsInput(b);
  const fields = isEvent ? EVENT_FIELDS : NEWS_FIELDS;
  const lead = me.role === "lead";
  const status = lead ? "approved" : "pending";

  const cols = [...fields, "status", "submitted_by", "last_edited_by", "needs_other_than", "reviewed_by", "reviewed_at"];
  const vals = [...fields.map((f) => data[f]), status, me.id, me.id, lead ? null : me.id, lead ? me.id : null, lead ? new Date().toISOString() : null];
  if (isEvent) { cols.push("source"); vals.push("moderator"); }
  if (!isEvent) { cols.push("published_at"); vals.push(lead ? new Date().toISOString() : null); }

  const r = await env.DB.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...vals).run();
  const id = r.meta.last_row_id;
  const label = isEvent ? "event" : "news post";
  await log(env, me, "created", kind, id,
    lead ? `Added and published ${label} "${data.title_en}" (lead moderator, no second approval needed)`
         : `Added ${label} "${data.title_en}" (waiting for a second moderator to approve)`);

  if (!lead) {
    await notifyModerators(env, {
      subject: `Please approve: ${data.title_en}`,
      lines: [`${me.name} has added a ${label} that needs a second moderator to approve it.`, `${isEvent ? "Event" : "Headline"}: ${data.title_en}`],
      link: "/admin/#queue",
      excludeId: me.id,
    });
  }
  return { id, status };
}

async function editItem(env, me, kind, id, b) {
  const isEvent = kind === "event";
  const table = isEvent ? "events" : "news";
  const before = await loadItem(env, table, id);
  const lead = me.role === "lead";
  if (!lead && before.status === "rejected") httpError(403, "Only a lead moderator can edit a rejected item.");

  const data = isEvent ? eventInput({ ...before, ...b }, { isPublic: false }) : newsInput({ ...before, ...b });
  const fields = isEvent ? EVENT_FIELDS : NEWS_FIELDS;
  const changes = diff(before, data, fields);
  if (!Object.keys(changes).length) return { id, status: before.status, unchanged: true };

  // A moderator changing something that's already live sends it back for a second approval.
  let status = before.status;
  let note = "";
  if (before.status === "approved" && !lead) { status = "pending"; note = " (it was live, so it now needs approving again)"; }

  const sets = [...fields.map((f) => `${f} = ?`), "status = ?", "last_edited_by = ?", "updated_at = ?"];
  const vals = [...fields.map((f) => data[f]), status, me.id, new Date().toISOString()];
  if (status === "pending" && before.status === "approved") {
    sets.push("reviewed_by = NULL", "reviewed_at = NULL", "needs_other_than = ?");
    vals.push(me.id); // they changed a live item, so someone else must approve it
  }
  await env.DB.prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`).bind(...vals, id).run();

  // Don't copy private contact details into the log.
  const safe = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, k.startsWith("contact_") ? { changed: true } : v]));
  await log(env, me, "edited", kind, id, `Edited ${isEvent ? "event" : "news post"} "${data.title_en}"${note}. Changed: ${Object.keys(changes).join(", ")}`, safe);

  if (status === "pending" && before.status === "approved") {
    await notifyModerators(env, {
      subject: `Please re-approve: ${data.title_en}`,
      lines: [`${me.name} edited a live ${isEvent ? "event" : "news post"}, so it needs approving again.`, `Title: ${data.title_en}`],
      link: "/admin/#queue", excludeId: me.id,
    });
  }
  return { id, status };
}

async function reviewItem(env, me, kind, id, action, b) {
  const isEvent = kind === "event";
  const table = isEvent ? "events" : "news";
  const item = await loadItem(env, table, id);
  const lead = me.role === "lead";
  const label = isEvent ? "event" : "news post";
  const now = new Date().toISOString();

  if (action === "approve") {
    if (item.status !== "pending") httpError(409, "Only items waiting for approval can be approved.");
    if (!lead && (item.submitted_by === me.id || item.needs_other_than === me.id))
      httpError(403, "You added or changed this, so a different moderator needs to approve it.");
    const extra = isEvent ? "" : ", published_at = ?";
    const vals = isEvent ? [me.id, now, id] : [me.id, now, now, id];
    await env.DB.prepare(`UPDATE ${table} SET status = 'approved', reviewed_by = ?, reviewed_at = ?, reject_reason = NULL, needs_other_than = NULL${extra} WHERE id = ?`).bind(...vals).run();
    await log(env, me, "approved", kind, id, `Approved ${label} "${item.title_en}" — now live on the website`);
    return { id, status: "approved" };
  }

  if (action === "reject") {
    const reason = clean(b.reason, 500, { label: "Reason" });
    if (item.status === "approved" && !lead) httpError(403, "Only a lead moderator can take down something that's already live.");
    if (item.status === "rejected") httpError(409, "This item has already been rejected.");
    const wasLive = item.status === "approved";
    await env.DB.prepare(`UPDATE ${table} SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, reject_reason = ? WHERE id = ?`).bind(me.id, now, reason, id).run();
    const own = item.submitted_by === me.id;
    await log(env, me, wasLive ? "taken_down" : own ? "withdrawn" : "rejected", kind, id,
      `${wasLive ? "Took down" : own ? "Withdrew own" : "Rejected"} ${label} "${item.title_en}"${reason ? ` — reason: ${reason}` : ""}`);
    return { id, status: "rejected" };
  }

  if (action === "restore") {
    if (!lead) httpError(403, "Only a lead moderator can restore a rejected item.");
    if (item.status !== "rejected") httpError(409, "Only rejected items can be restored.");
    await env.DB.prepare(`UPDATE ${table} SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL, needs_other_than = NULL WHERE id = ?`).bind(id).run();
    await log(env, me, "restored", kind, id, `Moved ${label} "${item.title_en}" back to waiting for approval`);
    return { id, status: "pending" };
  }

  if (action === "delete") {
    if (!lead) httpError(403, "Only a lead moderator can delete items.");
    const sql = isEvent
      ? "UPDATE events SET status = 'deleted', contact_name = NULL, contact_email = NULL, contact_phone = NULL WHERE id = ?"
      : "UPDATE news SET status = 'deleted' WHERE id = ?";
    await env.DB.prepare(sql).bind(id).run();
    await log(env, me, "deleted", kind, id, `Deleted ${label} "${item.title_en}"`);
    return { id, status: "deleted" };
  }
  httpError(404, "Unknown action.");
}

// ----- moderators (leads only) -----
async function activeLeads(env, exceptId) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM moderators WHERE role = 'lead' AND active = 1 AND id != ?").bind(exceptId).first();
  return r.n;
}

async function addModerator(env, me, b) {
  const email = clean(b.email, 200, { required: true, label: "Email" }).toLowerCase();
  if (!EMAIL.test(email)) httpError(400, "Please give a valid email address.");
  const name = clean(b.name, 80, { required: true, label: "Name" });
  const role = b.role === "lead" ? "lead" : "moderator";
  const existing = await env.DB.prepare("SELECT * FROM moderators WHERE email = ?").bind(email).first();
  if (existing && existing.active) httpError(409, "That person is already a moderator.");
  let id;
  if (existing) {
    await env.DB.prepare("UPDATE moderators SET name = ?, role = ?, active = 1 WHERE id = ?").bind(name, role, existing.id).run();
    id = existing.id;
  } else {
    const r = await env.DB.prepare("INSERT INTO moderators (email, name, role, created_by) VALUES (?, ?, ?, ?)").bind(email, name, role, me.id).run();
    id = r.meta.last_row_id;
  }
  await log(env, me, "moderator_added", "moderator", id, `Appointed ${name} <${email}> as ${role === "lead" ? "a lead moderator" : "a moderator"}`);
  return { id, name };
}

async function updateModerator(env, me, id, b) {
  const m = await env.DB.prepare("SELECT * FROM moderators WHERE id = ?").bind(id).first();
  if (!m) httpError(404, "Not found.");
  const next = {
    name: b.name !== undefined ? clean(b.name, 80, { required: true, label: "Name" }) : m.name,
    role: b.role !== undefined ? (b.role === "lead" ? "lead" : "moderator") : m.role,
    active: b.active !== undefined ? (b.active ? 1 : 0) : m.active,
  };
  const losingLead = m.role === "lead" && m.active && (next.role !== "lead" || !next.active);
  if (losingLead && (await activeLeads(env, m.id)) < 1) httpError(409, "There must always be at least one lead moderator.");

  await env.DB.prepare("UPDATE moderators SET name = ?, role = ?, active = ? WHERE id = ?").bind(next.name, next.role, next.active, id).run();
  if (!next.active) await endAllSessions(env, id);
  const parts = [];
  if (next.name !== m.name) parts.push(`renamed from "${m.name}" to "${next.name}"`);
  if (next.role !== m.role) parts.push(`role changed from ${m.role} to ${next.role}`);
  if (next.active !== m.active) parts.push(next.active ? "reinstated" : "removed as a moderator");
  if (parts.length) {
    await log(env, me, next.active !== m.active && !next.active ? "moderator_removed" : "moderator_changed", "moderator", id, `${m.name} <${m.email}>: ${parts.join(", ")}`);
  }
  return { id };
}

async function activityLog(env, url) {
  const where = [], vals = [];
  const actor = url.searchParams.get("actor");
  const type = url.searchParams.get("type");
  const q = url.searchParams.get("q");
  const before = url.searchParams.get("before");
  if (actor) { where.push("actor_id = ?"); vals.push(Number(actor)); }
  if (type) { where.push("item_type = ?"); vals.push(type); }
  if (q) { where.push("summary LIKE ?"); vals.push(`%${q}%`); }
  if (before) { where.push("id < ?"); vals.push(Number(before)); }
  const sql = `SELECT * FROM activity ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 100`;
  const { results } = await env.DB.prepare(sql).bind(...vals).all();
  return results;
}

// ---------- router ----------
async function handleAdmin(request, env, url, me) {
  const path = url.pathname.replace(/^\/api\/admin/, "");
  const method = request.method;
  const lead = me.role === "lead";
  const requireLead = () => { if (!lead) httpError(403, "Only lead moderators can do this."); };
  let m;

  if (path === "/me" && method === "GET") return json({ me });

  // Events and news share the same routes
  if ((m = path.match(/^\/(events|news)$/))) {
    const kind = m[1] === "events" ? "event" : "news";
    if (method === "GET") {
      const items = await listItems(env, m[1], url);
      return json({ items });
    }
    if (method === "POST") return json(await createItem(env, me, kind, await readJson(request)));
  }
  if ((m = path.match(/^\/(events|news)\/(\d+)$/)) && method === "PUT") {
    return json(await editItem(env, me, m[1] === "events" ? "event" : "news", Number(m[2]), await readJson(request)));
  }
  if ((m = path.match(/^\/(events|news)\/(\d+)\/(approve|reject|restore|delete)$/)) && method === "POST") {
    const body = request.headers.get("content-length") === "0" ? {} : await request.json().catch(() => ({}));
    return json(await reviewItem(env, me, m[1] === "events" ? "event" : "news", Number(m[2]), m[3], body));
  }

  // Leads only
  if (path === "/moderators") {
    requireLead();
    if (method === "GET") {
      const { results } = await env.DB.prepare("SELECT id, email, name, role, active, created_at FROM moderators ORDER BY active DESC, role, name").all();
      return json({ moderators: results });
    }
    if (method === "POST") return json(await addModerator(env, me, await readJson(request)));
  }
  if ((m = path.match(/^\/moderators\/(\d+)$/)) && method === "PUT") {
    requireLead();
    return json(await updateModerator(env, me, Number(m[1]), await readJson(request)));
  }
  if (path === "/activity" && method === "GET") {
    requireLead();
    return json({ activity: await activityLog(env, url) });
  }
  return fail(404, "Not found.");
}

// ---------- signing in and out (GitHub) ----------
async function handleAuth(request, env, url) {
  const path = url.pathname.replace(/^\/api\/auth/, "");
  const origin = url.origin;

  if (path === "/github" && request.method === "GET") return startGithubSignIn(request, env);

  if (path === "/github/callback" && request.method === "GET") {
    const out = await finishGithubSignIn(request, env);
    const headers = new Headers();
    headers.append("Set-Cookie", clearStateCookie(request));
    if (out.error) {
      if (out.error === "not-moderator") {
        await log(env, { label: `GitHub user @${out.login}` }, "sign_in_refused", "moderator", null,
          `@${out.login} tried to sign in but none of their GitHub email addresses is on the moderator list`);
      }
      const who_ = out.login ? `&gh=${encodeURIComponent(out.login)}` : "";
      headers.set("Location", `${origin}/admin/?error=${out.error}${who_}`);
      return new Response(null, { status: 302, headers });
    }
    const m = out.moderator;
    await log(env, { ...m, label: who(m) }, "signed_in", "moderator", m.id, `${m.name} signed in with GitHub (@${out.login})`);
    headers.append("Set-Cookie", out.sessionCookie);
    headers.set("Location", `${origin}/admin/#queue`);
    return new Response(null, { status: 302, headers });
  }

  if (path === "/logout" && request.method === "POST") {
    await endSession(env, request);
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "Set-Cookie": clearSessionCookie(request) } });
  }
  return fail(404, "Not found.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/config") return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null });
      if (url.pathname === "/api/events" && request.method === "GET") return await publicEvents(env);
      if (url.pathname === "/api/news" && request.method === "GET") return await publicNews(env);
      if (url.pathname === "/api/events/submit" && request.method === "POST") return await submitEvent(request, env);

      if (url.pathname.startsWith("/api/auth/")) return await handleAuth(request, env, url);

      if (url.pathname.startsWith("/api/admin/")) {
        const me = await currentModerator(request, env);
        if (!me) return fail(401, "You're not signed in as a moderator.");
        return await handleAdmin(request, env, url, me);
      }
      if (url.pathname.startsWith("/api/")) return fail(404, "Not found.");

      const page = await env.ASSETS.fetch(request);
      // While on the temporary workers.dev address, ask search engines not to list the site.
      if (url.hostname.endsWith(".workers.dev")) {
        const res = new Response(page.body, page);
        res.headers.set("X-Robots-Tag", "noindex, nofollow");
        return res;
      }
      return page;
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      console.error(e);
      return fail(500, "Something went wrong. Please try again.");
    }
  },

  // Runs once a day: removes private contact details 30 days after an event has finished.
  async scheduled(controller, env) {
    const cutoff = ukNow(-30);
    const r = await env.DB.prepare(
      "UPDATE events SET contact_name = NULL, contact_email = NULL, contact_phone = NULL WHERE end_at < ? AND (contact_email IS NOT NULL OR contact_phone IS NOT NULL OR contact_name IS NOT NULL)"
    ).bind(cutoff).run();
    if (r.meta.changes) {
      await log(env, { label: "System" }, "privacy_cleanup", "system", null, `Removed contact details from ${r.meta.changes} past event(s), as promised in the privacy notice`);
    }
  },
};
