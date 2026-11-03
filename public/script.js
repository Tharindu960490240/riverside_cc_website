/* ===== Riverside Blues CC — website script =====
 * Loads live data from our own server (/api/club-data), which calls PlayHQ.
 * The PlayHQ API key lives only on the server (.env), never in this file.
 */

const API_URL = "/api/club-data";
const REFRESH_MINUTES = 5;

// Shown only if the server can't be reached (e.g. opening index.html directly)
const SAMPLE_DATA = {
  nextMatch: { team: "1st XI", opponent: "[Opponent]", when: "[Sat · 1:00pm]", where: "[Home ground]" },
  results: [
    { status: "won", team: "1st XI", text: "RCC [score] def [Opponent] [score]" },
    { status: "lost", team: "2nd XI", text: "RCC [score] v [Opponent] [score]" },
  ],
  fixturesLabel: "This weekend",
  fixtures: [
    { day: "SAT", time: "1:00", team: "1st XI", opponent: "[Opponent]", venue: "[Ground]", where: "Home", group: "seniors" },
    { day: "SAT", time: "9:00", team: "U14 Blue", opponent: "[Opponent]", venue: "[Ground]", where: "Away", group: "juniors" },
  ],
  ladders: [
    { gradeId: "sample", gradeName: "Sample grade", rows: [
      { pos: 1, team: "[Club]", played: "–", won: "–", lost: "–", points: "–" },
      { pos: 2, team: "Riverside", played: "–", won: "–", lost: "–", points: "–", isUs: true },
    ] },
  ],
};

const INSTAGRAM_URL = "https://www.instagram.com/riversidebluescc/";

/* ---------- helpers ---------- */
const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c instanceof Node ? c : document.createTextNode(c ?? ""));
  return node;
}

function setStatus(kind, text) {
  const pill = $("#live-pill");
  pill.classList.toggle("is-sample", kind === "sample");
  pill.classList.toggle("is-error", kind === "error");
  $("#live-status").textContent = text;
}

/* ---------- renderers ---------- */
/** "South Launceston Green" → "SL" (shown when a club has no logo on PlayHQ). */
function initials(name) {
  const words = String(name || "").replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter((w) => w && !/^(cc|cricket|club|the|of|and|u\d+s?)$/i.test(w));
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
}

/** Small round club logo, falling back to initials if there's no logo or it fails to load. */
function teamBadge(name, logo, cls = "mini-crest") {
  const badge = el("span", { class: `${cls} is-initials`, "aria-hidden": "true" }, initials(name));
  if (logo) {
    const img = el("img", { src: logo, alt: "", decoding: "async" });
    img.addEventListener("load", () => { badge.classList.remove("is-initials"); badge.replaceChildren(img); });
    img.addEventListener("error", () => img.remove());
  }
  return badge;
}

function setNextCrest(name, logo) {
  const crest = $("#next-opp-crest");
  crest.className = "crest crest-muted";
  crest.replaceChildren(document.createTextNode(name ? initials(name) : "?"));
  if (!logo) return;
  const img = el("img", { src: logo, alt: "", decoding: "async" });
  img.addEventListener("load", () => { crest.className = "crest crest-logo-opp"; crest.replaceChildren(img); });
  img.addEventListener("error", () => img.remove());
}

function renderNextMatch(m) {
  if (!m) {
    $("#next-team").textContent = "TBC";
    $("#next-opp").textContent = "No game scheduled";
    setNextCrest("", "");
    $("#next-when").textContent = "–";
    $("#next-where").textContent = "–";
    return;
  }
  $("#next-team").textContent = m.team || m.grade;
  $("#next-opp").textContent = m.opponent;
  setNextCrest(m.opponent, m.opponentLogo);
  $("#next-when").textContent = m.when;
  $("#next-where").textContent = m.where;
  const btn = $("#match-centre");
  if (m.url) { btn.href = m.url; btn.target = "_blank"; btn.rel = "noopener"; }
}

function renderResults(results = []) {
  const wrap = $("#results");
  if (!results.length) {
    wrap.replaceChildren(el("p", { class: "loading" }, "No results yet this season."));
    return;
  }
  wrap.replaceChildren(...results.map((r) =>
    el(r.url ? "a" : "div", r.url ? { class: "result", href: r.url, target: "_blank", rel: "noopener" } : { class: "result" },
      el("span", { class: `tag ${r.status}` }, `${r.status} · ${r.team}`),
      el("span", { class: "line" }, r.text)
    )
  ));
}

let allFixtures = [];

function renderFixtures(filter = "all") {
  const list = $("#fixture-list");
  const shown = filter === "all" ? allFixtures : allFixtures.filter((f) => f.group === filter);
  list.replaceChildren(...shown.map((f) =>
    el("li", { class: "fixture" },
      el("div", { class: "date-box" },
        el("span", { class: "day" }, f.day),
        el("span", { class: "time" }, f.time || f.date || "")
      ),
      el("div", { class: "fixture-main" },
        teamBadge(f.opponent, f.opponentLogo),
        el("div", { class: "fixture-text" },
          f.url
            ? el("a", { class: "teams", href: f.url, target: "_blank", rel: "noopener" }, `${f.team} v ${f.opponent}`)
            : el("div", { class: "teams" }, `${f.team} v ${f.opponent}`),
          el("div", { class: "venue" }, f.venue)
        )
      ),
      el("span", { class: "where" }, f.where)
    )
  ));
  $("#fixture-empty").hidden = shown.length > 0;
}

let ladders = [];

function renderLadder(gradeId) {
  const ladder = ladders.find((l) => l.gradeId === gradeId) || ladders[0];
  const body = $("#ladder-body");
  if (!ladder || !ladder.rows.length) {
    $("#ladder-grade-name").textContent = "";
    body.replaceChildren(el("tr", { class: "muted-row" }, el("td", { colspan: "6" }, "Ladder not available yet.")));
    return;
  }
  $("#ladder-grade-name").textContent = ladders.length > 1 ? "" : ladder.gradeName;
  body.replaceChildren(...ladder.rows.map((r) =>
    el("tr", r.isUs ? { class: "us" } : {},
      el("td", {}, String(r.pos)),
      el("td", {}, r.team),
      el("td", { class: "num" }, String(r.played)),
      el("td", { class: "num" }, String(r.won)),
      el("td", { class: "num" }, String(r.lost ?? "–")),
      el("td", { class: "num" }, String(r.points))
    )
  ));
}

function setupLadderSelect() {
  const select = $("#ladder-grade");
  const current = select.value;
  select.replaceChildren(...ladders.map((l) => el("option", { value: l.gradeId }, l.gradeName)));
  select.hidden = ladders.length < 2;
  if (ladders.some((l) => l.gradeId === current)) select.value = current;
  renderLadder(select.value);
}

const IG_ICON = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/></svg>';
const PLAY_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

function renderInstagram(posts = []) {
  const grid = $("#insta-grid");
  if (!grid) return;
  const tints = ["#CFE2F6", "#BCD3EC", "#A9C5E6", "#DCE8F5", "#C3D8EF", "#B2CCE9"];

  if (!posts.length) {
    // No token yet (or Instagram is down): tiles that link to the profile
    grid.replaceChildren(...tints.map((bg) => {
      const tile = el("a", { class: "insta-tile", href: INSTAGRAM_URL, target: "_blank", rel: "noopener", "aria-label": "Open Instagram" });
      tile.style.background = bg;
      tile.innerHTML = IG_ICON;
      return tile;
    }));
    return;
  }

  grid.replaceChildren(...posts.map((p) => {
    const tile = el("a", { class: "insta-tile has-img", href: p.link, target: "_blank", rel: "noopener" });
    tile.append(el("img", { src: p.image, alt: p.caption || "Riverside Cricket Club on Instagram", loading: "lazy" }));
    if (p.isVideo) {
      const badge = el("span", { class: "insta-video" });
      badge.innerHTML = PLAY_ICON;
      tile.append(badge);
    }
    if (p.caption) tile.append(el("span", { class: "insta-caption" }, p.caption));
    return tile;
  }));
}

async function loadInstagram() {
  try {
    const res = await fetch("/api/instagram", { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = await res.json();
    renderInstagram(data.posts || []);
  } catch {
    renderInstagram([]);
  }
}

function renderAll(data) {
  renderNextMatch(data.nextMatch);
  renderResults(data.results);
  $("#fixtures-title").textContent = data.fixturesLabel || "Upcoming games";
  allFixtures = data.fixtures || [];
  renderFixtures(document.querySelector(".chip.is-active")?.dataset.filter || "all");
  ladders = data.ladders || [];
  setupLadderSelect();
}

/* ---------- data loading ---------- */
let hasLiveData = false;

async function loadData() {
  try {
    const res = await fetch(API_URL, { headers: { Accept: "application/json" }, cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    renderAll(data);
    hasLiveData = true;
    const time = new Date(data.updatedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    setStatus(data.stale ? "error" : "live", data.stale ? "Showing last update" : "Live from PlayHQ");
    $("#updated").textContent = `Updated ${time} · refreshes every ${REFRESH_MINUTES} min`;
  } catch (err) {
    console.warn("Live data unavailable:", err);
    if (!hasLiveData) {
      renderAll(SAMPLE_DATA);
      setStatus("sample", "Sample data");
      $("#updated").textContent = "Couldn't reach PlayHQ — showing sample data.";
    }
  }
}

/* ---------- Fixtures & results with filters ----------
 * Association → Competition → Season → Team, like PlayHQ.
 * Remembers the visitor's last choice in this browser.
 */
const TF_KEY = "rcc-fixture-filter";
const tf = { seasons: [], req: 0 };

function tfSaved() {
  try { return JSON.parse(localStorage.getItem(TF_KEY) || "{}"); } catch { return {}; }
}
function tfSave(obj) {
  try { localStorage.setItem(TF_KEY, JSON.stringify(obj)); } catch { /* storage blocked: fine */ }
}

function fillSelect(select, options, value) {
  select.replaceChildren(...options.map((o) => el("option", { value: o.value }, o.label)));
  if (options.some((o) => o.value === value)) select.value = value;
  select.disabled = options.length === 0;
}

const uniqueBy = (arr, key) => {
  const seen = new Set();
  return arr.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
};

function tfFillFromSeason(seasonId) {
  const season = tf.seasons.find((x) => x.id === seasonId) || tf.seasons[0];
  if (!season) return null;
  const assocs = uniqueBy(tf.seasons.map((x) => x.association), (a) => a.id);
  fillSelect($("#tf-assoc"), assocs.map((a) => ({ value: a.id, label: a.name })), season.association.id);
  tfFillComps(season.association.id, season.competition.id);
  tfFillSeasons(season.association.id, season.competition.id, season.id);
  return season.id;
}

function tfFillComps(assocId, compId) {
  const comps = uniqueBy(tf.seasons.filter((x) => x.association.id === assocId).map((x) => x.competition), (c) => c.id);
  fillSelect($("#tf-comp"), comps.map((c) => ({ value: c.id, label: c.name })), compId);
  return $("#tf-comp").value;
}

function tfFillSeasons(assocId, compId, seasonId) {
  const list = tf.seasons.filter((x) => x.association.id === assocId && x.competition.id === compId);
  fillSelect($("#tf-season"), list.map((x) => ({ value: x.id, label: x.name })), seasonId);
  return $("#tf-season").value;
}

function tfMessage(text) {
  $("#tf-list").replaceChildren();
  $("#tf-summary").replaceChildren(el("p", { class: "tf-message" }, text));
}

async function tfLoadTeams(seasonId, preferTeamId) {
  const my = ++tf.req;
  setPlayhqLinks(seasonId, false);
  const teamSel = $("#tf-team");
  teamSel.disabled = true;
  teamSel.replaceChildren(el("option", {}, "Loading teams…"));
  tfMessage("Loading…");
  try {
    const res = await fetch(`/api/season-teams?season=${encodeURIComponent(seasonId)}`);
    const data = await res.json();
    if (my !== tf.req) return;
    if (!res.ok) throw new Error(data.error || "error");
    const teams = data.teams || [];
    if (!teams.length) {
      fillSelect(teamSel, [], "");
      teamSel.replaceChildren(el("option", {}, "No Riverside teams"));
      tfMessage("Riverside didn't have a team in this competition and season.");
      return;
    }
    fillSelect(teamSel, teams.map((t) => ({ value: t.id, label: t.name })), preferTeamId);
    await tfLoadGames();
  } catch {
    if (my === tf.req) tfMessage("Couldn't load teams from PlayHQ. Please try again shortly.");
  }
}

function tfRow(g) {
  const roundLabel = String(g.round || "").replace(/^round\s*/i, "R") || "–";
  const resultLabel = g.result === "noresult" ? "No result" : g.forfeit ? `${g.result} (forfeit)` : g.result;
  const opp = g.url && g.state !== "bye"
    ? el("a", { href: g.url, target: "_blank", rel: "noopener" }, g.state === "bye" ? "BYE" : `v ${g.opponent}`)
    : document.createTextNode(g.state === "bye" ? "BYE" : `v ${g.opponent}`);

  const main = el("div", {},
    el("div", { class: "tf-opp" },
      g.state !== "bye" ? teamBadge(g.opponent, g.opponentLogo) : "",
      el("span", {}, opp, g.where ? el("span", { class: "tf-where" }, g.where) : "")),
    el("div", { class: "tf-sub" }, [g.when, g.venue].filter(Boolean).join(" · ") || (g.state === "bye" ? "No game this round" : "Date TBC"))
  );

  const result = el("div", { class: "tf-result" }, el("span", { class: `chip-r ${g.result}` }, resultLabel));
  if ((g.state === "done" || g.state === "live") && !g.forfeit && g.result !== "abandoned" && (g.usScore || g.oppScore)) {
    result.append(el("span", { class: "tf-score" }, `${g.usScore || "–"} v ${g.oppScore || "–"}`));
  }
  return el("li", { class: `tf-row${g.state === "bye" ? " is-bye" : ""}` }, el("div", { class: "tf-round" }, roundLabel), main, result);
}

async function tfLoadGames() {
  const my = ++tf.req;
  const season = $("#tf-season").value;
  const team = $("#tf-team").value;
  if (!team) return;
  tfSave({ season, team });
  tfMessage("Loading fixture…");
  try {
    const res = await fetch(`/api/team-games?season=${encodeURIComponent(season)}&team=${encodeURIComponent(team)}`);
    const data = await res.json();
    if (my !== tf.req) return;
    if (!res.ok) throw new Error(data.error || "error");

    const summary = [el("strong", {}, data.team.short || data.team.name)];
    if (data.team.grade) summary.push(el("span", {}, data.team.grade));
    if (data.record && data.record.played) {
      summary.push(el("span", { class: "tf-record" }, `Played ${data.record.played} · Won ${data.record.won} · Lost ${data.record.lost}`));
    }
    $("#tf-summary").replaceChildren(...summary);

    if (!data.games.length) {
      $("#tf-list").replaceChildren();
      $("#tf-summary").append(el("p", { class: "tf-message" }, data.note || "No fixture has been published for this team yet."));
      return;
    }
    $("#tf-list").replaceChildren(...data.games.map(tfRow));
  } catch {
    if (my === tf.req) tfMessage("Couldn't load this fixture from PlayHQ. Please try again shortly.");
  }
}

/* ---------- Links to PlayHQ ----------
 * PlayHQ season pages look like:
 * …/org/riverside-cricket-club-tas/d0eb0714/cricket-north-senior-competitions-summer-202627/f37be039/teams
 */
const PLAYHQ_CLUB = "https://www.playhq.com/cricket-australia/org/riverside-cricket-club-tas/d0eb0714";
const slugify = (text) => String(text || "").toLowerCase().replace(/\//g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
function playhqSeasonUrl(season) {
  if (!season?.id || !season.competition?.name) return `${PLAYHQ_CLUB}/register`;
  return `${PLAYHQ_CLUB}/${slugify(`${season.competition.name} ${season.name}`)}/${season.id.slice(0, 8)}/teams`;
}
function setPlayhqLinks(seasonId, updateHomeLink) {
  const season = tf.seasons.find((x) => x.id === seasonId);
  const url = playhqSeasonUrl(season);
  const tfLink = $("#tf-playhq");
  if (tfLink) tfLink.href = url;
  const home = $("#playhq-season-link");
  if (home && updateHomeLink) home.href = url;
}

async function initTeamFixtures() {
  try {
    const res = await fetch("/api/filters");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "error");
    tf.seasons = data.seasons || [];
    if (!tf.seasons.length) return tfMessage("No seasons found on PlayHQ.");

    const saved = tfSaved();
    const start = tf.seasons.some((x) => x.id === saved.season) ? saved.season : data.defaultSeasonId;
    const seasonId = tfFillFromSeason(start);
    tf.defaultSeasonId = data.defaultSeasonId;
    setPlayhqLinks(data.defaultSeasonId, true);
    setPlayhqLinks(seasonId, false);

    $("#tf-assoc").addEventListener("change", (e) => {
      const first = tf.seasons.find((x) => x.association.id === e.target.value);
      const comp = tfFillComps(e.target.value, first?.competition.id);
      tfLoadTeams(tfFillSeasons(e.target.value, comp));
    });
    $("#tf-comp").addEventListener("change", (e) => {
      tfLoadTeams(tfFillSeasons($("#tf-assoc").value, e.target.value));
    });
    $("#tf-season").addEventListener("change", (e) => tfLoadTeams(e.target.value, $("#tf-team").value));
    $("#tf-team").addEventListener("change", tfLoadGames);

    await tfLoadTeams(seasonId, saved.team);
  } catch {
    ["#tf-assoc", "#tf-comp", "#tf-season", "#tf-team"].forEach((id) => {
      $(id).replaceChildren(el("option", {}, "Unavailable"));
    });
    tfMessage("Fixtures are unavailable right now — see the full fixture on PlayHQ.");
  }
}

/* ---------- UI wiring ---------- */
function setupFilters() {
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => {
        c.classList.remove("is-active");
        c.setAttribute("aria-pressed", "false");
      });
      chip.classList.add("is-active");
      chip.setAttribute("aria-pressed", "true");
      renderFixtures(chip.dataset.filter);
    });
  });
}

function setupNav() {
  const toggle = $(".nav-toggle");
  const nav = $("#main-nav");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  });
  nav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );
}

document.addEventListener("DOMContentLoaded", () => {
  $("#year").textContent = new Date().getFullYear();
  setupNav();
  setupFilters();
  $("#ladder-grade").addEventListener("change", (e) => renderLadder(e.target.value));
  renderInstagram([]);
  loadInstagram();
  initTeamFixtures();
  loadData();
  setInterval(loadData, REFRESH_MINUTES * 60 * 1000);
  setInterval(loadInstagram, 30 * 60 * 1000);
});