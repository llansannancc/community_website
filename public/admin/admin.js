// Moderator area for the Llansannan Community website.
// All the rules (who may approve what) are enforced by the server; this page just shows the options.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let me = null;

// Local testing only: /admin/?as=mod1@example.com pretends to be that person (ignored on the live site).
const devAs = new URLSearchParams(location.search).get("as");

async function api(path, opts = {}) {
  const headers = { "content-type": "application/json", ...(devAs ? { "x-dev-user": devAs } : {}) };
  const res = await fetch("/api/admin" + path, { ...opts, headers });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(out.error || "Something went wrong"); e.status = res.status; throw e; }
  return out;
}
const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body || {}) });
const put = (path, body) => api(path, { method: "PUT", body: JSON.stringify(body || {}) });

function toast(text) {
  const t = $("toast"); t.textContent = text; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 3500);
}
function when(start, end) {
  const [d, t] = start.split("T"); const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  const endT = end && end !== start ? `–${end.split("T")[1]}` : "";
  return `${DAYS[dt.getDay()]} ${day} ${MONTHS[m - 1]} ${y}, ${t}${endT}`;
}
function ago(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const statusLabel = { pending: "Waiting", approved: "Live", rejected: "Rejected" };

// Two-click confirm for anything destructive (no pop-ups)
function armed(btn, fn) {
  btn.addEventListener("click", async () => {
    if (!btn.classList.contains("armed")) {
      btn.dataset.label = btn.textContent; btn.textContent = "Click again to confirm"; btn.classList.add("armed");
      setTimeout(() => { if (btn.isConnected) { btn.classList.remove("armed"); btn.textContent = btn.dataset.label; } }, 4000);
      return;
    }
    btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message); btn.disabled = false; }
  });
}

// ---------- cards ----------
function cardHTML(kind, it) {
  const isEvent = kind === "events";
  const lead = me.role === "lead";
  const mine = it.submitted_by === me.id || it.needs_other_than === me.id;
  let byline;
  if (isEvent && it.source === "public") byline = `Submitted by the public on ${ago(it.created_at)}`;
  else byline = `Added by ${esc(it.submitted_by_name || "a moderator")} on ${ago(it.created_at)}`;
  if (it.last_edited_by_name && it.last_edited_by !== it.submitted_by) byline += ` · last edited by ${esc(it.last_edited_by_name)}`;
  if (it.reviewed_by_name && it.status !== "pending") byline += ` · ${it.status === "approved" ? "approved" : "rejected"} by ${esc(it.reviewed_by_name)}`;

  const contact = isEvent && (it.contact_name || it.contact_email || it.contact_phone)
    ? `<div class="contact"><strong>Contact (private):</strong> ${esc(it.contact_name || "")}
       ${it.contact_email ? ` · <a href="mailto:${esc(it.contact_email)}?subject=${encodeURIComponent("Your event: " + it.title_en)}">${esc(it.contact_email)}</a>` : ""}
       ${it.contact_phone ? ` · <a href="tel:${esc(it.contact_phone)}">${esc(it.contact_phone)}</a>` : ""}</div>` : "";

  let note = "";
  if (it.status === "pending" && mine && !lead) note = `<div class="note">You added or changed this, so it's waiting for a different moderator to approve it.</div>`;
  else if (it.status === "pending" && it.needs_other_than) note = `<div class="note info">Needs a second approval: added or changed by another moderator.</div>`;
  if (it.status === "rejected" && it.reject_reason) note += `<div class="note">Reason: ${esc(it.reject_reason)}</div>`;

  const canApprove = it.status === "pending" && (lead || !mine);
  const btns = [];
  if (canApprove) btns.push(`<button class="btn ok" data-do="approve">Approve</button>`);
  if (it.status !== "rejected" || lead) btns.push(`<a class="btn" href="#edit-${isEvent ? "event" : "news"}-${it.id}">Edit</a>`);
  if (it.status === "pending") btns.push(`<button class="btn danger" data-do="reject-open">${mine ? "Withdraw" : "Reject"}</button>`);
  if (it.status === "approved" && lead) btns.push(`<button class="btn danger" data-do="reject-open">Take down</button>`);
  if (it.status === "rejected" && lead) btns.push(`<button class="btn" data-do="restore">Move back to waiting</button>`);
  if (lead) btns.push(`<button class="btn danger" data-do="delete">Delete</button>`);

  const body = isEvent
    ? `<div class="when">${when(it.start_at, it.end_at)}</div><div class="meta">📍 ${esc(it.location_en)}${it.organiser ? ` · Organised by ${esc(it.organiser)}` : ""}</div>
       ${it.description_en ? `<div class="desc">${esc(it.description_en)}</div>` : ""}`
    : `<div class="meta">${esc(it.category_en)}${it.published_at ? ` · published ${ago(it.published_at)}` : ""}</div>
       <div class="desc"><strong>${esc(it.summary_en)}</strong>${it.body_en ? "\n\n" + esc(it.body_en) : ""}</div>`;

  return `<div class="card ${it.status}" data-kind="${kind}" data-id="${it.id}">
    <div class="card-top"><h4>${esc(it.title_en)}</h4><span class="pill ${it.status}">${statusLabel[it.status]}</span></div>
    ${body}
    <div class="meta">${byline}</div>
    ${contact}${note}
    <div class="actions">${btns.join("")}</div>
    <div class="reject-box"><div class="field"><label>Reason <span class="hint">(optional, kept in the log)</span></label><textarea maxlength="500" style="min-height:70px"></textarea></div>
      <div class="actions"><button class="btn danger" data-do="reject">Confirm</button><button class="btn" data-do="reject-cancel">Cancel</button></div></div>
  </div>`;
}

function wireCards(container, reload) {
  container.querySelectorAll(".card").forEach((card) => {
    const kind = card.dataset.kind, id = card.dataset.id;
    const act = async (action, body) => {
      const r = await post(`/${kind}/${id}/${action}`, body);
      toast({ approve: "Approved: it's now live.", reject: r.status === "rejected" ? "Done." : "Done.", restore: "Moved back to waiting.", delete: "Deleted." }[action] || "Done.");
      await reload(); refreshCount();
    };
    card.querySelectorAll("[data-do]").forEach((b) => {
      const d = b.dataset.do;
      if (d === "approve" || d === "restore") b.onclick = async () => { b.disabled = true; try { await act(d); } catch (e) { toast(e.message); b.disabled = false; } };
      if (d === "reject-open") b.onclick = () => card.querySelector(".reject-box").classList.add("show");
      if (d === "reject-cancel") b.onclick = () => card.querySelector(".reject-box").classList.remove("show");
      if (d === "reject") b.onclick = async () => { b.disabled = true; try { await act("reject", { reason: card.querySelector(".reject-box textarea").value }); } catch (e) { toast(e.message); b.disabled = false; } };
      if (d === "delete") armed(b, () => act("delete"));
    });
  });
}

// ---------- views ----------
async function loadQueue() {
  const [ev, nw] = await Promise.all([api("/events?status=pending"), api("/news?status=pending")]);
  for (const [kind, out, el] of [["events", ev, $("q-events")], ["news", nw, $("q-news")]]) {
    el.innerHTML = out.items.length ? out.items.map((it) => cardHTML(kind, it)).join("") : `<p class="empty">Nothing waiting.</p>`;
    wireCards(el, loadQueue);
  }
  setCount(ev.items, nw.items);
}
function setCount(evs, nws) {
  const lead = me.role === "lead";
  const n = [...evs, ...nws].filter((it) => lead || (it.submitted_by !== me.id && it.needs_other_than !== me.id)).length;
  $("c-queue").textContent = n || "";
}
async function refreshCount() {
  const [ev, nw] = await Promise.all([api("/events?status=pending"), api("/news?status=pending")]);
  setCount(ev.items, nw.items);
}

const listState = { events: "approved", news: "approved" };
async function loadList(kind) {
  const out = await api(`/${kind}?status=${listState[kind]}`);
  const el = $(kind === "events" ? "l-events" : "l-news");
  el.innerHTML = out.items.length ? out.items.map((it) => cardHTML(kind, it)).join("") : `<p class="empty">Nothing here.</p>`;
  wireCards(el, () => loadList(kind));
}
document.querySelectorAll(".filters[data-for]").forEach((f) => f.querySelectorAll("button").forEach((b) => b.onclick = () => {
  f.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
  listState[f.dataset.for] = b.dataset.s; loadList(f.dataset.for);
}));

// ---------- add / edit forms ----------
function fillForm(form, data) { [...form.elements].forEach((el) => { if (el.name && el.name in data) el.value = data[el.name] ?? ""; }); }
function formData(form) { const o = {}; [...form.elements].forEach((el) => { if (el.name) o[el.name] = el.value.trim(); }); return o; }

async function openEventForm(id) {
  const f = $("ev-form"); f.reset(); f.elements.id.value = ""; $("ev-msg").textContent = "";
  const lead = me.role === "lead";
  if (id) {
    const { items } = await api("/events?status=all");
    const it = items.find((x) => x.id === id);
    if (!it) { toast("That event couldn't be found."); location.hash = "#events"; return; }
    fillForm(f, it);
    f.elements.id.value = it.id;
    f.elements.date.value = it.start_at.slice(0, 10); f.elements.start.value = it.start_at.slice(11); f.elements.end.value = it.end_at.slice(11);
    $("ev-form-title").textContent = "Edit event";
    $("ev-form-intro").textContent = it.status === "approved" && !lead ? "This event is live. If you save changes, it will come off the website until another moderator approves it." : "";
    $("ev-contact").open = !!(it.contact_email || it.contact_name);
  } else {
    $("ev-form-title").textContent = "Add an event";
    $("ev-form-intro").textContent = lead ? "As a lead moderator, your event goes live as soon as you save it." : "Once saved, another moderator needs to approve your event before it goes live.";
    $("ev-contact").open = false;
  }
}
$("ev-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, d = formData(f), msg = $("ev-msg");
  const body = { ...d, start_at: `${d.date}T${d.start}`, end_at: d.end ? `${d.date}T${d.end}` : `${d.date}T${d.start}` };
  ["date", "start", "end", "id"].forEach((k) => delete body[k]);
  msg.className = "msg"; msg.textContent = "Saving…";
  try {
    const r = d.id ? await put(`/events/${d.id}`, body) : await post("/events", body);
    toast(r.unchanged ? "No changes to save." : r.status === "approved" ? "Saved: it's live on the website." : "Saved: waiting for another moderator to approve it.");
    location.hash = r.status === "approved" ? "#events" : "#queue";
  } catch (err) { msg.className = "msg bad"; msg.textContent = err.message; }
});

async function openNewsForm(id) {
  const f = $("nw-form"); f.reset(); f.elements.id.value = ""; $("nw-msg").textContent = "";
  const lead = me.role === "lead";
  if (id) {
    const { items } = await api("/news?status=all");
    const it = items.find((x) => x.id === id);
    if (!it) { toast("That post couldn't be found."); location.hash = "#news"; return; }
    fillForm(f, it); f.elements.id.value = it.id;
    $("nw-form-title").textContent = "Edit news post";
    $("nw-form-intro").textContent = it.status === "approved" && !lead ? "This post is live. If you save changes, it will come off the website until another moderator approves it." : "";
  } else {
    $("nw-form-title").textContent = "Add a news post";
    $("nw-form-intro").textContent = lead ? "As a lead moderator, your post goes live as soon as you save it." : "Once saved, another moderator needs to approve your post before it goes live.";
  }
}
$("nw-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = formData(e.target), msg = $("nw-msg");
  const id = d.id; delete d.id;
  msg.className = "msg"; msg.textContent = "Saving…";
  try {
    const r = id ? await put(`/news/${id}`, d) : await post("/news", d);
    toast(r.unchanged ? "No changes to save." : r.status === "approved" ? "Saved: it's live on the website." : "Saved: waiting for another moderator to approve it.");
    location.hash = r.status === "approved" ? "#news" : "#queue";
  } catch (err) { msg.className = "msg bad"; msg.textContent = err.message; }
});

// ---------- moderators (leads) ----------
async function loadModerators() {
  const { moderators } = await api("/moderators");
  const rows = moderators.map((m) => `<tr data-id="${m.id}">
    <td><strong>${esc(m.name)}</strong>${m.id === me.id ? " (you)" : ""}<br><span class="meta">${esc(m.email)}</span></td>
    <td>${m.active ? (m.role === "lead" ? "Lead moderator" : "Moderator") : "<em>Removed</em>"}</td>
    <td><div class="actions" style="margin:0">
      ${m.active ? `<button class="btn" data-do="role">${m.role === "lead" ? "Make moderator" : "Make lead"}</button>
                    <button class="btn danger" data-do="remove">Remove</button>`
                 : `<button class="btn" data-do="reinstate">Reinstate</button>`}
    </div></td></tr>`).join("");
  $("mod-list").innerHTML = `<table class="list resp"><thead><tr><th>Name</th><th>Role</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  $("mod-list").querySelectorAll("tr[data-id]").forEach((tr) => {
    const id = tr.dataset.id, m = moderators.find((x) => String(x.id) === id);
    const run = async (body, text) => { await put(`/moderators/${id}`, body); toast(text); loadModerators(); };
    tr.querySelectorAll("[data-do]").forEach((b) => {
      if (b.dataset.do === "role") b.onclick = () => run({ role: m.role === "lead" ? "moderator" : "lead" }, "Role changed.").catch((e) => toast(e.message));
      if (b.dataset.do === "reinstate") b.onclick = () => run({ active: true }, "Reinstated.").catch((e) => toast(e.message));
      if (b.dataset.do === "remove") armed(b, () => run({ active: false }, "Removed."));
    });
  });
  // Fill the activity log's person filter too
  const sel = $("log-actor"), cur = sel.value;
  sel.innerHTML = `<option value="">Everyone</option>` + moderators.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("");
  sel.value = cur;
}
$("mod-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = formData(e.target), msg = $("mod-msg");
  try {
    await post("/moderators", d);
    e.target.reset(); msg.className = "msg ok";
    msg.textContent = `${d.name} has been appointed. They can now sign in here with ${d.email}.`;
    loadModerators();
  } catch (err) { msg.className = "msg bad"; msg.textContent = err.message; }
});

// ---------- activity log (leads) ----------
const ACTION_LABEL = { submitted: "Submitted", created: "Added", edited: "Edited", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrew",
  taken_down: "Took down", restored: "Restored", deleted: "Deleted", moderator_added: "Appointed", moderator_changed: "Changed moderator",
  moderator_removed: "Removed moderator", privacy_cleanup: "Privacy clean-up" };
let logOldest = null;
async function loadLog(more = false) {
  const p = new URLSearchParams();
  if ($("log-actor").value) p.set("actor", $("log-actor").value);
  if ($("log-type").value) p.set("type", $("log-type").value);
  if ($("log-q").value.trim()) p.set("q", $("log-q").value.trim());
  if (more && logOldest) p.set("before", logOldest);
  const { activity } = await api("/activity?" + p);
  const rows = activity.map((a) => `<tr>
    <td class="log-time">${ago(a.at)}</td>
    <td><span class="log-action">${esc(ACTION_LABEL[a.action] || a.action)}</span><br><span class="meta">${esc(a.actor_label)}</span></td>
    <td>${esc(a.summary)}${a.details ? `<details class="changes"><summary>What changed</summary><pre>${esc(JSON.stringify(JSON.parse(a.details), null, 2))}</pre></details>` : ""}</td></tr>`).join("");
  const tbody = $("log-list").querySelector("tbody");
  if (more && tbody) tbody.insertAdjacentHTML("beforeend", rows);
  else $("log-list").innerHTML = activity.length
    ? `<table class="list resp"><thead><tr><th>When</th><th>Who</th><th>What happened</th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="empty">No entries match.</p>`;
  if (activity.length) logOldest = activity[activity.length - 1].id;
  $("log-more").hidden = activity.length < 100;
}
["log-actor", "log-type"].forEach((id) => $(id).addEventListener("change", () => loadLog()));
let qTimer; $("log-q").addEventListener("input", () => { clearTimeout(qTimer); qTimer = setTimeout(() => loadLog(), 300); });
$("log-more").onclick = () => loadLog(true);

// ---------- routing ----------
async function route() {
  if (!me) return;
  let h = (location.hash || "#queue").slice(1), v = h, id = null, m;
  if ((m = h.match(/^edit-(event|news)-(\d+)$/))) { v = m[1] === "event" ? "add-event" : "add-news"; id = Number(m[2]); }
  if (!$("v-" + v) || ((v === "moderators" || v === "activity") && me.role !== "lead")) v = "queue";
  document.querySelectorAll(".view").forEach((x) => x.classList.toggle("show", x.id === "v-" + v));
  document.querySelectorAll("nav.tabs a").forEach((a) => a.classList.toggle("on", a.dataset.v === (id ? (v === "add-event" ? "events" : "news") : v)));
  window.scrollTo(0, 0);
  try {
    if (v === "queue") await loadQueue();
    if (v === "events" || v === "news") await loadList(v);
    if (v === "add-event") await openEventForm(id);
    if (v === "add-news") await openNewsForm(id);
    if (v === "moderators") await loadModerators();
    if (v === "activity") { if ($("log-actor").options.length < 2) await loadModerators(); await loadLog(); }
  } catch (e) { toast(e.message); }
}
window.addEventListener("hashchange", route);

(async function start() {
  try {
    ({ me } = await api("/me"));
  } catch (e) {
    $("who").innerHTML = `<a href="/">Back to the website</a>`;
    $("denied").hidden = false;
    return;
  }
  $("who").innerHTML = `Signed in as <strong>${esc(me.name)}</strong><span class="role-badge">${me.role === "lead" ? "Lead" : "Moderator"}</span><br>
    <a href="/">View website</a> · <a href="/cdn-cgi/access/logout">Sign out</a>`;
  $("tabs").hidden = false;
  if (me.role === "lead") document.querySelectorAll(".lead-only").forEach((x) => (x.hidden = false));
  route();
})();
