// Llansannan Community website: loads events, news and regular activities from the database and draws the pages.
// Everything is managed in the moderator area (/admin).

// Weekly and monthly activities are managed in the moderator area (/admin → Regular).
let regular = [];

// ---------- helpers ----------
const D = { en: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
            cy: ["Dydd Sul","Dydd Llun","Dydd Mawrth","Dydd Mercher","Dydd Iau","Dydd Gwener","Dydd Sadwrn"] };
const M = { en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
            cy: ["Ionawr","Chwefror","Mawrth","Ebrill","Mai","Mehefin","Gorffennaf","Awst","Medi","Hydref","Tachwedd","Rhagfyr"] };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const para = (s) => esc(s).replace(/\n/g, "<br>");
// Story text with links: web addresses become links, and [link text](https://…) shows the words as the link.
// Everything else is shown as plain text, so nothing typed can break the page.
function richText(raw) {
  const text = String(raw || "");
  const re = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
  let out = "", last = 0, m;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    const url = m[2] || m[3], label = m[1] || m[3].replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    out += `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
    last = re.lastIndex;
  }
  out += esc(text.slice(last));
  return out.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}
// A short preview of a description: one line of plain text, cut at a word, about 150 characters
const snip = (s) => { const t = String(s || "").replace(/\s+/g, " ").trim(); if (t.length <= 150) return esc(t); const c = t.slice(0, 150); return esc(c.slice(0, c.lastIndexOf(" ")) + "…"); };
const both = (a, b) => `<span class="en">${a}</span><span class="cy">${b}</span>`;
const pad = (n) => String(n).padStart(2, "0");
const stamp = (s) => s.replace(/[-:]/g, "") + "00";
const t12 = (d, l) => { let h = d.getHours(); const m = pad(d.getMinutes()), am = h < 12; h = h % 12 || 12;
  return h + (m === "00" ? "" : ":" + m) + (l === "cy" ? (am ? "yb" : "yh") : (am ? "am" : "pm")); };
const key = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const at = (d, hm) => { const x = new Date(d); const [h, m] = hm.split(":"); x.setHours(+h, +m, 0, 0); return x; };
const longDate = (d) => both(D.en[d.getDay()] + " " + d.getDate() + " " + M.en[d.getMonth()], D.cy[d.getDay()] + " " + d.getDate() + " " + M.cy[d.getMonth()]);
const $ = (id) => document.getElementById(id);

// ---------- Llansannan Community Council's own website ----------
// Put the Council's web address here once; every "Community Council" link on the site uses it.
// Until it's filled in, those links go to the Contact page instead.
const COUNCIL_SITE = "https://llansannan-cc.gov.wales/";
document.querySelectorAll("a.council-link").forEach((a) => {
  if (COUNCIL_SITE) a.href = COUNCIL_SITE;
  else { a.removeAttribute("target"); a.querySelectorAll(".ext").forEach((x) => x.remove()); }
});

const today = new Date(); today.setHours(0, 0, 0, 0);
let events = [], news = [], byDay = {}, pick = new Date(today);

// Database rows -> the shape the page uses. Welsh falls back to English if not given.
function toEvent(r) {
  return {
    id: r.id, start: r.start_at, end: r.end_at,
    en: { t: esc(r.title_en), d: para(r.description_en), s: snip(r.description_en), loc: esc(r.location_en), raw: r },
    cy: { t: esc(r.title_cy || r.title_en), d: para(r.description_cy || r.description_en), s: snip(r.description_cy || r.description_en), loc: esc(r.location_cy || r.location_en) },
    organiser: esc(r.organiser),
    image: r.image_id ? { src: "/img/" + encodeURIComponent(r.image_id), alt: esc(r.image_alt || "") } : null,
  };
}
function toNews(r) {
  return {
    id: r.id, date: r.published_at,
    cat: [esc(r.category_en), esc(r.category_cy || r.category_en)],
    image: r.image_id ? { src: "/img/" + encodeURIComponent(r.image_id), alt: esc(r.image_alt || "") } : null,
    gallery: (() => { try { return JSON.parse(r.gallery || "[]"); } catch { return []; } })()
      .map((g) => ({ src: "/img/" + encodeURIComponent(g.id), en: esc(g.cap_en || ""), cy: esc(g.cap_cy || g.cap_en || "") })),
    en: { t: esc(r.title_en), s: esc(r.summary_en), body: richText(r.body_en) },
    cy: { t: esc(r.title_cy || r.title_en), s: esc(r.summary_cy || r.summary_en), body: richText(r.body_cy || r.body_en) },
  };
}

// Calendar links use the plain (unescaped) English text
const gcal = (e) => { const r = e.en.raw; return "https://calendar.google.com/calendar/render?" + new URLSearchParams({ action: "TEMPLATE", text: r.title_en,
  dates: stamp(e.start) + "/" + stamp(e.end), details: r.description_en, location: r.location_en + ", Llansannan", ctz: "Europe/London" }); };
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);
const ics = (e) => { const r = e.en.raw; return "data:text/calendar;charset=utf-8," + encodeURIComponent(["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Llansannan//EN",
  "BEGIN:VEVENT","UID:event-" + e.id + "@llansannan","DTSTAMP:" + stamp(e.start),"DTSTART;TZID=Europe/London:" + stamp(e.start),
  "DTEND;TZID=Europe/London:" + stamp(e.end),"SUMMARY:" + icsText(r.title_en),"DESCRIPTION:" + icsText(r.description_en),"LOCATION:" + icsText(r.location_en + ", Llansannan"),
  "END:VEVENT","END:VCALENDAR"].join("\r\n")); };
const mapUrl = (e) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(e.en.raw.location_en + ", Llansannan");

function dateBox(s) {
  return `<div class="ev-date"><span class="m">${both(M.en[s.getMonth()].slice(0,3), M.cy[s.getMonth()].slice(0,4))}</span>
    <span class="d">${s.getDate()}</span><span class="w">${both(D.en[s.getDay()].slice(0,3), D.cy[s.getDay()].replace("Dydd ",""))}</span></div>`;
}
// One event in the What's on day list: the whole row is a link, with a short description and the photo if there is one
function rowHTML(it) {
  const tag = it.reg ? `<span class="tag-reg">${it.monthly ? both("Every month", "Bob mis") : both("Every week", "Bob wythnos")}</span>` : "";
  const desc = it.en.s ? `<p class="desc">${both(it.en.s, it.cy.s || it.en.s)}</p>` : "";
  return `<a class="row" href="${it.href}"><div class="time">${both(t12(it.s, "en"), t12(it.s, "cy"))}</div>
    <div class="what"><strong>${both(it.en.t, it.cy.t)}${tag}</strong>
    <small>📍 ${both(it.en.loc, it.cy.loc)}</small>${desc}
    <span class="go">${both("Details ›", "Manylion ›")}</span></div>
    ${it.image ? `<img class="row-thumb" src="${it.image.src}" alt="" loading="lazy">` : ""}</a>`;
}
const emptyMsg = (en, cy) => `<p class="empty">${both(en, cy)}</p>`;

// ---------- drawing ----------
function drawNextBox() {
  const e = events[0], box = $("next-box");
  if (!e) { box.innerHTML = `<span class="lbl">${both("Next event", "Y digwyddiad nesaf")}</span><h3>${both("Nothing listed yet", "Dim byd eto")}</h3><a href="#submit">${both("Submit an event ›", "Cyflwyno digwyddiad ›")}</a>`; return; }
  const s = new Date(e.start);
  box.innerHTML = `<span class="lbl">${both("Next event", "Y digwyddiad nesaf")}</span>
    <h3>${both(e.en.t, e.cy.t)}</h3>
    <dl><div><dt>${both("When", "Pryd")}</dt><dd>${longDate(s)}, ${both(t12(s, "en"), t12(s, "cy"))}</dd></div>
    <div><dt>${both("Where", "Lle")}</dt><dd>${both(e.en.loc, e.cy.loc)}</dd></div></dl>
    <a href="#event-${e.id}">${both("View details ›", "Gweld manylion ›")}</a>`;
}

function drawStrip() {
  $("strip").innerHTML = events.length ? events.map((e) => {
    const s = new Date(e.start);
    return `<a class="ev-card" href="#event-${e.id}">${dateBox(s)}<div class="ev-info">
      <h3>${both(e.en.t, e.cy.t)}</h3>
      <p>${both(t12(s,"en"), t12(s,"cy"))}<br>${both(e.en.loc, e.cy.loc)}</p></div></a>`;
  }).join("") : emptyMsg("No events listed yet. Know of one? Submit it!", "Dim digwyddiadau eto. Gwybod am un? Cyflwynwch o!");
}

// Database row -> regular activity
function toRegular(r) {
  return {
    id: r.id, day: r.day, start: r.start_time, end: r.end_time, every: r.week_of_month, from: r.starts_on, until: r.ends_on,
    en: { t: esc(r.title_en), loc: esc(r.location_en), d: para(r.description_en), s: snip(r.description_en) },
    cy: { t: esc(r.title_cy || r.title_en), loc: esc(r.location_cy || r.location_en), d: para(r.description_cy || r.description_en), s: snip(r.description_cy || r.description_en) },
    organiser: esc(r.organiser),
  };
}
// Does this regular activity happen on date d?
function happensOn(r, d) {
  if (d.getDay() !== r.day) return false;
  const k = key(d);
  if (r.from && k < r.from) return false;
  if (r.until && k > r.until) return false;
  if (r.every == null) return true;
  const nth = Math.ceil(d.getDate() / 7);
  if (r.every === -1) { const next = new Date(d); next.setDate(d.getDate() + 7); return next.getMonth() !== d.getMonth(); }
  return nth === r.every;
}
const ORD = { en: { 1: "First", 2: "Second", 3: "Third", 4: "Fourth", "-1": "Last" } };
// Welsh word order: "Dydd Mercher cyntaf y mis", "ail Ddydd Mercher y mis", "Dydd Mercher olaf y mis"
function monthlyCy(r) {
  const day = D.cy[r.day];
  return { 1: `${day} cyntaf y mis`, 2: `ail ${day.replace("Dydd", "Ddydd")} y mis`, 3: `trydydd ${day} y mis`, 4: `pedwerydd ${day} y mis`, "-1": `${day} olaf y mis` }[r.every];
}
function howOften(r) {
  const s = new Date(2000, 0, 1); const [h, m] = r.start.split(":"); s.setHours(+h, +m);
  let t = both(t12(s, "en"), t12(s, "cy"));
  if (r.end) { const e = new Date(2000, 0, 1); const [eh, em] = r.end.split(":"); e.setHours(+eh, +em); t = both(t12(s, "en") + " – " + t12(e, "en"), t12(s, "cy") + " – " + t12(e, "cy")); }
  const freq = r.every == null
    ? both("Every " + D.en[r.day], "Bob " + D.cy[r.day].replace("Dydd ", "dydd "))
    : both(`${ORD.en[r.every]} ${D.en[r.day]} of the month`, monthlyCy(r));
  return `${freq}, ${t}`;
}

function buildDays() {
  const items = events.map((e) => ({ s: new Date(e.start), en: e.en, cy: e.cy, href: "#event-" + e.id, reg: false, image: e.image }));
  for (let n = 0; n < 60; n++) {
    const d = new Date(today); d.setDate(today.getDate() + n);
    regular.forEach((r) => { if (happensOn(r, d)) items.push({ s: at(d, r.start), en: r.en, cy: r.cy, href: "#weekly", reg: true, monthly: r.every != null }); });
  }
  items.sort((a, b) => a.s - b.s);
  byDay = {};
  items.forEach((it) => (byDay[key(it.s)] = byDay[key(it.s)] || []).push(it));
}

function drawDays() {
  let h = "";
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const n = (byDay[key(d)] || []).length;
    const cls = ["dbtn", n ? "has" : "", i === 0 ? "today" : "", +d === +pick ? "sel" : ""].join(" ");
    h += `<button class="${cls}" data-i="${i}" aria-label="${D.en[d.getDay()]} ${d.getDate()} ${M.en[d.getMonth()]}: ${n} events">
      <span class="w">${i === 0 ? both("Today", "Heddiw") : both(D.en[d.getDay()].slice(0, 3), D.cy[d.getDay()].replace("Dydd ", "").slice(0, 4))}</span>
      <span class="n">${d.getDate()}</span><span class="c">${n || ""}</span></button>`;
  }
  const s = $("d-strip"); s.innerHTML = h;
  s.querySelectorAll(".dbtn").forEach((b) => (b.onclick = () => { pick = new Date(today); pick.setDate(today.getDate() + +b.dataset.i); drawDays(); }));
  const list = byDay[key(pick)] || [];
  $("d-day").innerHTML = `<h3>${longDate(pick)}</h3>` + (list.length ? list.map(rowHTML).join("")
    : emptyMsg("Nothing listed for this day.", "Dim byd wedi'i restru ar gyfer y diwrnod hwn."));
}

function drawFullList() {
  $("full-list").innerHTML = events.length ? events.map((e) => {
    const s = new Date(e.start), en = new Date(e.end);
    return `<a class="list-row" href="#event-${e.id}">${dateBox(s)}<div class="ev-info">
      <h3>${both(e.en.t, e.cy.t)}</h3>
      <p>${both(t12(s,"en") + " – " + t12(en,"en"), t12(s,"cy") + " – " + t12(en,"cy"))} · ${both(e.en.loc, e.cy.loc)}</p>
      <p>${both(e.en.d, e.cy.d)}</p></div>${e.image ? `<img class="list-thumb" src="${e.image.src}" alt="" loading="lazy">` : ""}</a>`;
  }).join("") : emptyMsg("No upcoming events yet.", "Dim digwyddiadau i ddod eto.");
}

function newsCard(n) {
  const d = new Date(n.date);
  return `<article class="news-card${n.image ? " has-photo" : ""}">
    ${n.image ? `<img class="news-photo" src="${n.image.src}" alt="${n.image.alt}" loading="lazy">` : ""}
    <div class="meta"><span class="cat">${both(n.cat[0], n.cat[1])}</span><time>${both(d.getDate() + " " + M.en[d.getMonth()], d.getDate() + " " + M.cy[d.getMonth()])}</time></div>
    <h3><a class="story-link" href="#news-${n.id}">${both(n.en.t, n.cy.t)}</a></h3>
    <p>${both(n.en.s, n.cy.s)}</p>
    <a class="read-more" href="#news-${n.id}">${n.en.body || n.gallery.length ? both("Read more ›", "Darllen mwy ›") : both("View ›", "Gweld ›")}${n.gallery.length ? ` <span class="ph-count">· ${n.gallery.length + (n.image ? 1 : 0)} ${both("photos", "llun")}</span>` : ""}</a>
  </article>`;
}
function drawWeekly() {
  const el = $("weekly-list");
  if (!regular.length) { el.innerHTML = emptyMsg("No regular sessions listed yet.", "Dim sesiynau rheolaidd wedi'u rhestru eto."); return; }
  const order = [1, 2, 3, 4, 5, 6, 0];
  el.innerHTML = order.filter((d) => regular.some((r) => r.day === d)).map((d) =>
    `<h3 class="day-head">${both(D.en[d], D.cy[d])}</h3>` + regular.filter((r) => r.day === d).map((r) =>
      `<div class="weekly-item"><strong>${both(r.en.t, r.cy.t)}</strong>
        <div class="meta">🕒 ${howOften(r)}<br>📍 ${both(r.en.loc, r.cy.loc)}${r.organiser ? ` · ${both("Run by", "Gan")} ${r.organiser}` : ""}</div>
        ${r.en.d ? `<p>${both(r.en.d, r.cy.d)}</p>` : ""}</div>`).join("")).join("");
}

function drawNews() {
  const none = emptyMsg("No news yet.", "Dim newyddion eto.");
  $("news-feed").innerHTML = news.length ? news.slice(0, 4).map(newsCard).join("") : none;
  $("news-all").innerHTML = news.length ? news.map(newsCard).join("") : none;
}

// A news story on its own page: main photo, summary, the full story with links, then all the photos with captions
function renderStory(id) {
  const n = news.find((x) => x.id === id); if (!n) return false;
  const d = new Date(n.date);
  $("story").innerHTML = `
    <div class="meta story-meta"><span class="cat">${both(n.cat[0], n.cat[1])}</span><time>${longDate(d)} ${d.getFullYear()}</time></div>
    <h2 class="title">${both(n.en.t, n.cy.t)}</h2>
    ${n.image ? `<img class="story-photo" src="${n.image.src}" alt="${n.image.alt}">` : ""}
    <p class="story-summary">${both(n.en.s, n.cy.s)}</p>
    <div class="story-body">${both(n.en.body, n.cy.body)}</div>
    ${n.gallery.length ? `<h3 class="sub">${both("Photos", "Lluniau")}</h3><div class="gallery">${n.gallery.map((g) => `
      <figure><a href="${g.src}" target="_blank" rel="noopener"><img src="${g.src}" alt="${g.en}" loading="lazy"></a>${g.en ? `<figcaption>${both(g.en, g.cy)}</figcaption>` : ""}</figure>`).join("")}</div>` : ""}
    <p class="story-back"><a href="#news">${both("‹ All news", "‹ Pob newyddion")}</a></p>`;
  document.title = n.en.t.replace(/&amp;/g, "&") + " · Llansannan Community";
  return true;
}
function renderDetail(id) {
  const e = events.find((x) => x.id === id); if (!e) return false;
  const s = new Date(e.start), en = new Date(e.end);
  $("detail").innerHTML = `
    <h2 class="title">${both(e.en.t, e.cy.t)}</h2>
    ${e.image ? `<img class="event-photo" src="${e.image.src}" alt="${e.image.alt}">` : ""}
    <div class="detail-box">
      <div><strong>${both("Date", "Dyddiad")}</strong> ${longDate(s)}</div>
      <div><strong>${both("Time", "Amser")}</strong> ${both(t12(s,"en") + " to " + t12(en,"en"), t12(s,"cy") + " tan " + t12(en,"cy"))}</div>
      <div><strong>${both("Where", "Lle")}</strong> ${both(e.en.loc + ", Llansannan", e.cy.loc + ", Llansannan")}</div>
      ${e.organiser ? `<div><strong>${both("Organiser", "Trefnydd")}</strong> ${e.organiser}</div>` : ""}
    </div>
    <p>${both(e.en.d, e.cy.d)}</p>
    <a class="btn btn-primary btn-block" href="${esc(gcal(e))}" target="_blank" rel="noopener">${both("Add to Google Calendar", "Ychwanegu at Google Calendar")}</a>
    <a class="btn btn-outline btn-block" href="${esc(ics(e))}" download="event-${e.id}.ics">${both("Add to iPhone or other calendar", "Ychwanegu at iPhone neu galendr arall")}</a>
    <a class="btn btn-outline btn-block" href="${esc(mapUrl(e))}" target="_blank" rel="noopener">${both("Show on a map", "Dangos ar fap")}</a>`;
  return true;
}

window.scrollStrip = function (dir) {
  const s = $("strip"), card = s.querySelector(".ev-card");
  if (card) s.scrollBy({ left: dir * (card.offsetWidth + 14), behavior: "smooth" });
};

// ---------- routing, language, menu ----------
function show(p) {
  document.querySelectorAll(".page").forEach((x) => x.classList.toggle("show", x.id === "page-" + p));
  document.querySelectorAll("nav a[data-p]").forEach((a) => a.classList.toggle("active", a.dataset.p === p));
  $("nav").classList.remove("open");
  document.querySelectorAll(".menu > li.open").forEach((x) => x.classList.remove("open"));
}
function route() {
  const h = (location.hash || "#home").slice(1);
  if (h === "whats-on-now") { show("home"); $("whats-on-now").scrollIntoView(); return; }
  let p = h;
  if (h.startsWith("event-")) p = renderDetail(Number(h.split("-")[1])) ? "event" : "home";
  if (h.startsWith("news-")) p = renderStory(Number(h.split("-")[1])) ? "story" : "news";
  if (!h.startsWith("news-")) document.title = "Llansannan Community";
  if (!$("page-" + p)) p = "home";
  if (FORMS[p]) prepareForm(p);
  show(p); window.scrollTo(0, 0);
}

window.setLang = function (l) {
  document.body.classList.toggle("lang-en", l === "en");
  document.body.classList.toggle("lang-cy", l === "cy");
  document.documentElement.lang = l;
  $("b-en").classList.toggle("on", l === "en");
  $("b-cy").classList.toggle("on", l === "cy");
  try { localStorage.setItem("lang", l); } catch (e) {}
};
try { if (localStorage.getItem("lang") === "cy") window.setLang("cy"); } catch (e) {}

document.querySelectorAll(".drop-btn").forEach((b) => b.addEventListener("click", (ev) => {
  ev.stopPropagation();
  const li = b.parentElement, wasOpen = li.classList.contains("open");
  document.querySelectorAll(".menu > li.open").forEach((x) => x.classList.remove("open"));
  if (!wasOpen) li.classList.add("open");
}));
document.addEventListener("click", () => document.querySelectorAll(".menu > li.open").forEach((x) => x.classList.remove("open")));

// ---------- Public forms: Submit an event, Send us your news ----------
// Each form: its id, the prefix of its photo fields, where it posts, its Turnstile box, and its thank-you box.
const FORMS = {
  submit: { form: "submit-form", p: "f", url: "/api/events/submit", ts: "#ts-widget", msg: "submit-msg", done: "submit-done", again: "submit-again" },
  "send-news": { form: "news-form", p: "n", url: "/api/news/submit", ts: "#ts-widget-news", msg: "news-msg", done: "news-done", again: "news-again" },
};
const tsTokens = {}, tsDrawn = {};
let cfgPromise = null, tsScript = null;
function getConfig() {
  if (!cfgPromise) cfgPromise = fetch("/api/config").then((r) => r.json()).catch(() => ({}));
  return cfgPromise;
}
function loadTurnstile() {
  if (!tsScript) tsScript = new Promise((ok) => {
    window.onTurnstileLoad = ok;
    const sc = document.createElement("script");
    sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";
    sc.async = true; document.head.appendChild(sc);
  });
  return tsScript;
}
async function prepareForm(page) {
  const F = FORMS[page];
  if (page === "submit") $("f-date").min = key(today);
  const cfg = await getConfig();
  if (cfg.publicPhotos === false) $(F.p + "-photo").closest(".field").hidden = true;
  if (cfg.turnstileSiteKey && !tsDrawn[page]) {
    tsDrawn[page] = true;
    await loadTurnstile();
    window.turnstile.render(F.ts, {
      sitekey: cfg.turnstileSiteKey, callback: (t) => (tsTokens[page] = t), "expired-callback": () => (tsTokens[page] = ""),
    });
  }
}

// Photo on a public form: shrunk on the phone/computer first (max 1600px), which also removes hidden location details.
async function shrinkPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("That file couldn't be opened as a photo. / Methu agor y ffeil fel llun.")); i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.85, 0.75, 0.65, 0.5]) {
      const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
      if (blob && blob.size <= 900000) return blob;
    }
    throw new Error("That photo is too large. Please try another. / Mae'r llun yn rhy fawr.");
  } finally { URL.revokeObjectURL(url); }
}
function setFormPhoto(F, id, previewBlob) {
  const f = $(F.form), p = F.p;
  f.elements.image_id.value = id || "";
  $(p + "-photo-preview").hidden = !id;
  // Preview from the person's own copy (the uploaded one stays private until it's approved)
  if (id && previewBlob) $(p + "-photo-preview").src = URL.createObjectURL(previewBlob);
  $(p + "-photo-remove").hidden = !id;
  $(p + "-alt-field").hidden = !id;
  if (!id) f.elements.image_alt.value = "";
  $(p + "-photo-pick").querySelectorAll("span[data-alt]").forEach((sp) => {
    if (!sp.dataset.orig) sp.dataset.orig = sp.textContent;
    sp.textContent = id ? sp.dataset.alt : sp.dataset.orig;
  });
}

function formBody(page, f) {
  const v = (n) => f.elements[n].value.trim();
  const common = {
    image_id: v("image_id"), image_alt: v("image_alt"),
    contact_name: v("contact_name"), contact_email: v("contact_email"), contact_phone: v("contact_phone"),
    consent: f.elements.consent.checked, website: v("website"), turnstile: tsTokens[page] || "",
  };
  if (page === "send-news") return { ...common,
    title_en: v("title_en"), story_en: v("story_en"), title_cy: v("title_cy"), story_cy: v("story_cy") };
  const date = v("date");
  return { ...common,
    title_en: v("title_en"), title_cy: v("title_cy"),
    description_en: v("description_en"), description_cy: v("description_cy"),
    location_en: v("location_en"), organiser: v("organiser"),
    start_at: `${date}T${v("start")}`, end_at: v("end") ? `${date}T${v("end")}` : `${date}T${v("start")}` };
}

Object.entries(FORMS).forEach(([page, F]) => {
  const p = F.p;
  $(p + "-photo").addEventListener("change", async (e) => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    const status = $(p + "-photo-status");
    status.textContent = "…";
    try {
      const blob = await shrinkPhoto(file);
      const res = await fetch("/api/photo", { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Upload failed");
      setFormPhoto(F, out.id, blob);
      status.textContent = "";
    } catch (err) { status.textContent = err.message; }
  });
  $(p + "-photo-remove").addEventListener("click", () => setFormPhoto(F, ""));

  $(F.form).addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target, msg = $(F.msg), btn = f.querySelector("button[type=submit]");
    btn.disabled = true; msg.className = "form-msg"; msg.textContent = "Sending… / Yn anfon…";
    try {
      const res = await fetch(F.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(formBody(page, f)) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Something went wrong");
      f.hidden = true;
      $(F.done).hidden = false;
      window.scrollTo(0, 0);
    } catch (e) {
      msg.className = "form-msg bad"; msg.textContent = e.message;
      if (window.turnstile && typeof window.turnstile.reset === "function") { window.turnstile.reset(F.ts); tsTokens[page] = ""; }
    } finally { btn.disabled = false; }
  });
  $(F.again).addEventListener("click", () => { const f = $(F.form); f.reset(); setFormPhoto(F, ""); f.hidden = false; $(F.done).hidden = true; $(F.msg).textContent = ""; });
});

// ---------- start ----------
async function load() {
  try {
    const [e, n, w] = await Promise.all([
      fetch("/api/events").then((r) => r.json()), fetch("/api/news").then((r) => r.json()), fetch("/api/weekly").then((r) => r.json())]);
    regular = (w.weekly || []).map(toRegular);
    events = (e.events || []).map(toEvent);
    news = (n.news || []).map(toNews);
  } catch (err) {
    console.error("Could not load events/news", err);
  }
  drawNextBox(); drawStrip(); buildDays(); drawDays(); drawFullList(); drawNews(); drawWeekly();
  route();
}
window.addEventListener("hashchange", route);
buildDays(); drawDays(); route();
load();
