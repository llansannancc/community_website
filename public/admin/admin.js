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
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEK_NAMES = { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", "-1": "Last" };
function howOften(it) {
  const day = DAY_NAMES[it.day];
  const t = it.start_time + (it.end_time ? `–${it.end_time}` : "");
  const base = it.week_of_month == null ? `Every ${day}` : `${WEEK_NAMES[it.week_of_month]} ${day} of the month`;
  const fmt = (d) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
  const range = it.starts_on && it.ends_on ? ` · ${fmt(it.starts_on)} to ${fmt(it.ends_on)}` : it.starts_on ? ` · from ${fmt(it.starts_on)}` : it.ends_on ? ` · until ${fmt(it.ends_on)}` : "";
  return `${base}, ${t}${range}`;
}
const EDIT_SLUG = { events: "event", news: "news", weekly: "weekly" };

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
function photoHTML(it) {
  if (!it.image_id) return "";
  if (it.source === "public" && it.status === "pending") {
    return `<div class="photo-check"><img class="card-photo blurred" src="/img/${esc(it.image_id)}" alt="${esc(it.image_alt || "")}">
        <button class="btn" type="button" data-do="reveal">Show photo</button></div>
      <div class="note info">Photo sent in by the public. It's blurred until you choose to look. Check it's suitable before approving. If it's offensive, use <strong>Report photo</strong>: the photo is deleted straight away and a private record of who sent it, and where from, is kept for 90 days.</div>`;
  }
  return `<img class="card-photo" src="/img/${esc(it.image_id)}" alt="${esc(it.image_alt || "")}" loading="lazy">`;
}
function cardHTML(kind, it) {
  const isEvent = kind === "events";
  const lead = me.role === "lead";
  const mine = it.submitted_by === me.id || it.needs_other_than === me.id;
  let byline;
  if (it.source === "public") byline = `Sent in by the public on ${ago(it.created_at)}`;
  else byline = `Added by ${esc(it.submitted_by_name || "a moderator")} on ${ago(it.created_at)}`;
  if (it.last_edited_by_name && it.last_edited_by !== it.submitted_by) byline += ` · last edited by ${esc(it.last_edited_by_name)}`;
  if (it.reviewed_by_name && it.status !== "pending") byline += ` · ${it.status === "approved" ? "approved" : "rejected"} by ${esc(it.reviewed_by_name)}`;

  const contact = (it.contact_name || it.contact_email || it.contact_phone)
    ? `<div class="contact"><strong>Contact (private):</strong> ${esc(it.contact_name || "")}
       ${it.contact_email ? ` · <a href="mailto:${esc(it.contact_email)}?subject=${encodeURIComponent((isEvent ? "Your event: " : "Your news: ") + it.title_en)}">${esc(it.contact_email)}</a>` : ""}
       ${it.contact_phone ? ` · <a href="tel:${esc(it.contact_phone)}">${esc(it.contact_phone)}</a>` : ""}</div>` : "";

  let note = "";
  if (it.status === "pending" && mine && !lead) note = `<div class="note">You added or changed this, so it's waiting for a different moderator to approve it.</div>`;
  else if (it.status === "pending" && it.needs_other_than) note = `<div class="note info">Needs a second approval: added or changed by another moderator.</div>`;
  if (it.status === "rejected" && it.reject_reason) note += `<div class="note">Reason: ${esc(it.reject_reason)}</div>`;

  const canApprove = it.status === "pending" && (lead || !mine);
  const btns = [];
  if (canApprove) btns.push(`<button class="btn ok" data-do="approve">Approve</button>`);
  if (it.status !== "rejected" || lead) btns.push(`<a class="btn" href="#edit-${EDIT_SLUG[kind]}-${it.id}">Edit</a>`);
  if (it.status === "pending") btns.push(`<button class="btn danger" data-do="reject-open">${mine ? "Withdraw" : "Reject"}</button>`);
  if (it.status === "approved" && lead) btns.push(`<button class="btn danger" data-do="reject-open">Take down</button>`);
  if (it.status === "rejected" && lead) btns.push(`<button class="btn" data-do="restore">Move back to waiting</button>`);
  if (it.image_id && it.source === "public" && (it.status === "pending" || (it.status === "approved" && lead))) btns.push(`<button class="btn danger" data-do="report-open">Report photo</button>`);
  if (lead) btns.push(`<button class="btn danger" data-do="delete">Delete</button>`);

  const body = kind === "weekly"
    ? `<div class="when">${howOften(it)}</div><div class="meta">📍 ${esc(it.location_en)}${it.organiser ? ` · Run by ${esc(it.organiser)}` : ""}</div>
       ${it.description_en ? `<div class="desc">${esc(it.description_en)}</div>` : ""}`
    : isEvent
    ? `<div class="when">${when(it.start_at, it.end_at)}</div><div class="meta">📍 ${esc(it.location_en)}${it.organiser ? ` · Organised by ${esc(it.organiser)}` : ""}</div>
       ${photoHTML(it)}
       ${it.description_en ? `<div class="desc">${esc(it.description_en)}</div>` : ""}`
    : `<div class="meta">${esc(it.category_en)}${it.published_at ? ` · published ${ago(it.published_at)}` : ""}</div>
       ${photoHTML(it)}
       ${it.source === "public" && it.status === "pending" ? `<div class="note info">The first part of their story is used as the summary on the homepage. Use <strong>Edit</strong> to tidy the wording or add a Welsh version before approving.</div>` : ""}
       <div class="desc"><strong>${esc(it.summary_en)}</strong>${it.body_en ? "\n\n" + esc(it.body_en) : ""}</div>`;

  return `<div class="card ${it.status}" data-kind="${kind}" data-id="${it.id}">
    <div class="card-top"><h4>${esc(it.title_en)}</h4><span class="pill ${it.status}">${statusLabel[it.status]}</span></div>
    ${body}
    <div class="meta">${byline}</div>
    ${contact}${note}
    <div class="actions">${btns.join("")}</div>
    <div class="reject-box"><div class="field"><label>Reason <span class="hint">(optional, kept in the log)</span></label><textarea maxlength="500" style="min-height:70px"></textarea></div>
      <div class="actions"><button class="btn danger" data-do="reject">Confirm</button><button class="btn" data-do="reject-cancel">Cancel</button></div></div>
    <div class="reject-box report-box"><p><strong>Report this photo?</strong> It will be deleted and this ${isEvent ? "event" : "story"} rejected. The sender's details, internet address and rough location are kept privately for 90 days, for lead moderators or the police. The same photo can't be sent again.</p>
      <div class="field"><label>What's wrong with it? <span class="hint">(kept with the record)</span></label><textarea maxlength="500" style="min-height:70px" placeholder="For example: offensive image"></textarea></div>
      <div class="actions"><button class="btn danger" data-do="report">Report and delete photo</button><button class="btn" data-do="report-cancel">Cancel</button></div></div>
  </div>`;
}

function wireCards(container, reload) {
  container.querySelectorAll(".card").forEach((card) => {
    const kind = card.dataset.kind, id = card.dataset.id;
    const act = async (action, body) => {
      const r = await post(`/${kind}/${id}/${action}`, body);
      toast({ report: "Photo deleted and reported. A record of the sender is kept for 90 days.", approve: "Approved: it's now live.", reject: r.status === "rejected" ? "Done." : "Done.", restore: "Moved back to waiting.", delete: "Deleted." }[action] || "Done.");
      await reload(); refreshCount();
    };
    card.querySelectorAll("[data-do]").forEach((b) => {
      const d = b.dataset.do;
      if (d === "approve" || d === "restore") b.onclick = async () => { b.disabled = true; try { await act(d); } catch (e) { toast(e.message); b.disabled = false; } };
      if (d === "reveal") b.onclick = () => { const img = card.querySelector(".blurred"); img.classList.remove("blurred"); img.style.transform = "none"; b.remove(); };
      if (d === "reject-open") b.onclick = () => card.querySelector(".reject-box").classList.add("show");
      if (d === "reject-cancel") b.onclick = () => card.querySelector(".reject-box").classList.remove("show");
      if (d === "reject") b.onclick = async () => { b.disabled = true; try { await act("reject", { reason: card.querySelector(".reject-box textarea").value }); } catch (e) { toast(e.message); b.disabled = false; } };
      if (d === "delete") armed(b, () => act("delete"));
      if (d === "report-open") b.onclick = () => card.querySelector(".report-box").classList.add("show");
      if (d === "report-cancel") b.onclick = () => card.querySelector(".report-box").classList.remove("show");
      if (d === "report") b.onclick = async () => { b.disabled = true; try { await act("report", { reason: card.querySelector(".report-box textarea").value }); } catch (e) { toast(e.message); b.disabled = false; } };
    });
  });
}

// ---------- views ----------
async function loadQueue() {
  const [ev, nw, wk] = await Promise.all([api("/events?status=pending"), api("/news?status=pending"), api("/weekly?status=pending")]);
  for (const [kind, out, el] of [["events", ev, $("q-events")], ["news", nw, $("q-news")], ["weekly", wk, $("q-weekly")]]) {
    el.innerHTML = out.items.length ? out.items.map((it) => cardHTML(kind, it)).join("") : `<p class="empty">Nothing waiting.</p>`;
    wireCards(el, loadQueue);
  }
  setCount(ev.items, nw.items, wk.items);
}
function setCount(evs, nws, wks = []) {
  const lead = me.role === "lead";
  const n = [...evs, ...nws, ...wks].filter((it) => lead || (it.submitted_by !== me.id && it.needs_other_than !== me.id)).length;
  $("c-queue").textContent = n || "";
}
async function refreshCount() {
  const [ev, nw, wk] = await Promise.all([api("/events?status=pending"), api("/news?status=pending"), api("/weekly?status=pending")]);
  setCount(ev.items, nw.items, wk.items);
}

const listState = { events: "approved", news: "approved", weekly: "approved" };
async function loadList(kind) {
  const out = await api(`/${kind}?status=${listState[kind]}`);
  const el = $({ events: "l-events", news: "l-news", weekly: "l-weekly" }[kind]);
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
    showPhoto("ev", it.image_id, it.image_alt);
    $("ev-form-title").textContent = "Edit event";
    $("ev-form-intro").textContent = it.status === "approved" && !lead ? "This event is live. If you save changes, it will come off the website until another moderator approves it." : "";
    $("ev-contact").open = !!(it.contact_email || it.contact_name);
  } else {
    showPhoto("ev", "", "");
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

// ---------- photos (news and events) ----------
// Shrinks the photo in the browser (max 1600px wide/high, JPEG) so it uploads quickly and fits the database.
async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("That file couldn't be opened as a photo. Please choose a JPEG or PNG.")); i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.75, 0.65, 0.5]) {
      const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
      if (blob && blob.size <= 900_000) return blob;
    }
    throw new Error("That photo is too large even after shrinking. Please try another.");
  } finally { URL.revokeObjectURL(url); }
}
// A photo field: prefix "nw" (news form) or "ev" (event form)
function showPhoto(prefix, id, alt) {
  const f = $(`${prefix}-form`);
  f.elements.image_id.value = id || "";
  $(`${prefix}-photo-preview`).hidden = !id;
  if (id) $(`${prefix}-photo-preview`).src = `/img/${id}`;
  $(`${prefix}-photo-remove`).hidden = !id;
  $(`${prefix}-alt-field`).hidden = !id;
  $(`${prefix}-photo-pick`).textContent = id ? "Change photo" : "Choose a photo";
  if (alt !== undefined) f.elements.image_alt.value = alt || "";
  $(`${prefix}-photo-status`).textContent = "";
}
for (const prefix of ["nw", "ev"]) {
  $(`${prefix}-photo-file`).addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    const status = $(`${prefix}-photo-status`);
    status.textContent = "Preparing photo…";
    try {
      const blob = await shrinkPhoto(file);
      status.textContent = "Uploading…";
      const res = await fetch("/api/admin/images", { method: "POST", headers: { "content-type": "image/jpeg", ...(devAs ? { "x-dev-user": devAs } : {}) }, body: blob });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Upload failed");
      showPhoto(prefix, out.id);
      $(`${prefix}-form`).elements.image_alt.focus();
    } catch (err) { status.textContent = err.message; }
  });
  $(`${prefix}-photo-remove`).onclick = () => showPhoto(prefix, "", "");
}

async function openNewsForm(id) {
  const f = $("nw-form"); f.reset(); f.elements.id.value = ""; $("nw-msg").textContent = "";
  const lead = me.role === "lead";
  if (id) {
    const { items } = await api("/news?status=all");
    const it = items.find((x) => x.id === id);
    if (!it) { toast("That post couldn't be found."); location.hash = "#news"; return; }
    fillForm(f, it); f.elements.id.value = it.id;
    showPhoto("nw", it.image_id, it.image_alt);
    $("nw-form-title").textContent = "Edit news post";
    $("nw-form-intro").textContent = it.status === "approved" && !lead ? "This post is live. If you save changes, it will come off the website until another moderator approves it." : "";
  } else {
    showPhoto("nw", "", "");
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

// ---------- regular activities form ----------
async function openWeeklyForm(id) {
  const f = $("wk-form"); f.reset(); f.elements.id.value = ""; $("wk-msg").textContent = "";
  const lead = me.role === "lead";
  if (id) {
    const { items } = await api("/weekly?status=all");
    const it = items.find((x) => x.id === id);
    if (!it) { toast("That activity couldn't be found."); location.hash = "#weekly"; return; }
    fillForm(f, { ...it, week_of_month: it.week_of_month == null ? "" : String(it.week_of_month), day: String(it.day) });
    f.elements.id.value = it.id;
    $("wk-form-title").textContent = "Edit regular activity";
    $("wk-form-intro").textContent = it.status === "approved" && !lead ? "This is live. If you save changes, it will come off the website until another moderator approves it." : "";
  } else {
    $("wk-form-title").textContent = "Add a regular activity";
    $("wk-form-intro").textContent = (lead ? "As a lead moderator, it goes live as soon as you save it." : "Once saved, another moderator needs to approve it before it goes live.")
      + " Use this for things that happen every week (or once a month), such as a Welsh class, choir practice or coffee morning.";
  }
}
$("wk-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = formData(e.target), msg = $("wk-msg");
  const id = d.id; delete d.id;
  msg.className = "msg"; msg.textContent = "Saving…";
  try {
    const r = id ? await put(`/weekly/${id}`, d) : await post("/weekly", d);
    toast(r.unchanged ? "No changes to save." : r.status === "approved" ? "Saved: it's live on the website." : "Saved: waiting for another moderator to approve it.");
    location.hash = r.status === "approved" ? "#weekly" : "#queue";
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
    msg.textContent = `${d.name} has been appointed. Ask them to go to ${location.origin}/admin/ and click "Sign in with GitHub", using the GitHub account with ${d.email}.`;
    loadModerators();
  } catch (err) { msg.className = "msg bad"; msg.textContent = err.message; }
});

// ---------- reported photos (leads) ----------
async function loadReports() {
  const { reports } = await api("/reports");
  $("report-list").innerHTML = reports.length ? reports.map((r) => `<div class="card rejected">
    <div class="card-top"><h4>${esc(r.item_title || "(untitled)")}</h4><span class="pill rejected">Reported</span></div>
    <div class="meta">${r.kind === "event" ? "Event" : "News"} · reported by ${esc(r.reported_by_name || "a moderator")} on ${ago(r.created_at)} · record deleted automatically ${ago(r.expires_at)}</div>
    <div class="note">Reason: ${esc(r.reason || "")}</div>
    <table class="trail"><tbody>
      <tr><th>Name they gave</th><td>${esc(r.contact_name || "—")}</td></tr>
      <tr><th>Email they gave</th><td>${esc(r.contact_email || "—")}</td></tr>
      <tr><th>Phone they gave</th><td>${esc(r.contact_phone || "—")}</td></tr>
      <tr><th>Photo sent</th><td>${r.sent_at ? new Date(r.sent_at).toLocaleString("en-GB", { timeZone: "Europe/London" }) + " (UK time)" : "—"}</td></tr>
      <tr><th>Internet address (IP)</th><td>${esc(r.ip || "—")}</td></tr>
      <tr><th>Rough location</th><td>${esc(r.place || "—")}</td></tr>
      <tr><th>Internet provider</th><td>${esc(r.network || "—")}</td></tr>
      <tr><th>Device / browser</th><td class="small">${esc(r.device || "—")}</td></tr>
    </tbody></table></div>`).join("") : `<p class="empty">No reported photos.</p>`;
}

// ---------- activity log (leads) ----------
const ACTION_LABEL = { signed_in: "Signed in", sign_in_refused: "Sign-in refused", submitted: "Submitted", created: "Added", edited: "Edited", approved: "Approved", rejected: "Rejected", withdrawn: "Withdrew",
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
  if ((m = h.match(/^edit-(event|news|weekly)-(\d+)$/))) { v = { event: "add-event", news: "add-news", weekly: "add-weekly" }[m[1]]; id = Number(m[2]); }
  if (!$("v-" + v) || ((v === "moderators" || v === "activity" || v === "reports") && me.role !== "lead")) v = "queue";
  document.querySelectorAll(".view").forEach((x) => x.classList.toggle("show", x.id === "v-" + v));
  document.querySelectorAll("nav.tabs a").forEach((a) => a.classList.toggle("on", a.dataset.v === (id ? { "add-event": "events", "add-news": "news", "add-weekly": "weekly" }[v] : v)));
  window.scrollTo(0, 0);
  try {
    if (v === "queue") await loadQueue();
    if (v === "events" || v === "news" || v === "weekly") await loadList(v);
    if (v === "add-weekly") await openWeeklyForm(id);
    if (v === "add-event") await openEventForm(id);
    if (v === "add-news") await openNewsForm(id);
    if (v === "moderators") await loadModerators();
    if (v === "reports") await loadReports();
    if (v === "activity") { if ($("log-actor").options.length < 2) await loadModerators(); await loadLog(); }
  } catch (e) { toast(e.message); }
}
window.addEventListener("hashchange", route);

const SIGNIN_ERRORS = {
  "not-moderator": "That GitHub account isn't on the moderator list. Choose the GitHub account that has the email address the lead moderators added you with.",
  "no-email": "Your GitHub account doesn't have a verified email address. Verify your email on GitHub, then try again.",
  "cancelled": "Sign-in was cancelled.",
  "expired": "That sign-in took too long or was interrupted. Please try again.",
  "github": "GitHub didn't respond properly. Please try again in a minute.",
  "not-set-up": "GitHub sign-in hasn't been set up yet. See SETUP.md.",
  "server": "Something went wrong while signing you in. Please try again. If it keeps happening, tell the website administrator.",
};
function showSignIn() {
  $("who").innerHTML = `<a href="/">Back to the website</a>`;
  $("signin").hidden = false;
  const params = new URLSearchParams(location.search);
  const err = params.get("error");
  if (err) {
    const gh = params.get("gh");
    $("signin-error").textContent = (gh ? `You signed in to GitHub as @${gh}. ` : "") + (SIGNIN_ERRORS[err] || "Sign-in didn't work. Please try again.");
    $("signin-error").hidden = false;
    $("gh-btn-label").textContent = "Try a different GitHub account";
    $("gh-help").hidden = false;
  }
}

async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  location.replace("/admin/");
}

(async function start() {
  try {
    ({ me } = await api("/me"));
  } catch (e) {
    return showSignIn();
  }
  if (location.search) history.replaceState(null, "", "/admin/" + location.hash);
  $("who").innerHTML = `Signed in as <strong>${esc(me.name)}</strong><span class="role-badge">${me.role === "lead" ? "Lead" : "Moderator"}</span><br>
    <a href="/">View website</a> · <a href="#" id="sign-out">Sign out</a>`;
  $("sign-out").onclick = (ev) => { ev.preventDefault(); signOut(); };
  $("tabs").hidden = false;
  if (me.role === "lead") document.querySelectorAll(".lead-only").forEach((x) => (x.hidden = false));
  route();
})();
