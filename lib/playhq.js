/**
 * Riverside Cricket Club — shared PlayHQ + Instagram logic.
 * Used by the Vercel functions in /api and by dev-server.js for local testing.
 * All keys come from environment variables (Vercel → Project → Settings → Environment Variables).
 */

/* ---------------- config ---------------- */
const env = process.env;
const BASE = (env.PLAYHQ_BASE || "https://api.playhq.com").replace(/\/$/, "");
const API_KEY = env.PLAYHQ_API_KEY || "";
const TENANT = env.PLAYHQ_TENANT || "ca";
const ORG_ID = env.PLAYHQ_ORG_ID || "";
const list = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
// Blank = use every current season of the organisation (seniors, juniors, women's…)
const SEASON_IDS = list(env.PLAYHQ_SEASON_IDS || env.PLAYHQ_SEASON_ID);
// Extra grades to always include (optional)
const GRADE_IDS = list(env.PLAYHQ_GRADE_IDS);
// Find every grade that has a Riverside team (on unless set to 0)
const AUTO_GRADES = env.AUTO_GRADES !== "0";
const CLUB_NAME = (env.CLUB_NAME || "Riverside").toLowerCase();
const TZ = env.TIMEZONE || "Australia/Hobart";
const CACHE_SECONDS = Number(env.CACHE_SECONDS || 300);
const IG_BASE = (env.INSTAGRAM_BASE || "https://graph.instagram.com").replace(/\/$/, "");
// How many posts the site can show in total (8 at first, then 8 more each "Load more")
const IG_POSTS = Math.min(Math.max(Number(env.INSTAGRAM_POSTS) || 32, 8), 50);
const IG_TOKEN = env.INSTAGRAM_ACCESS_TOKEN || "";
// Temporary backup source: the Wix Instagram Feed app's server (see README "Instagram").
// Uses values copied from the old Wix site; stops working when the Wix session expires or the Wix site is closed.
const WIX_IG = {
  base: (env.WIX_INSTAFEED_BASE || "https://instafeed.codev.wixapps.net").replace(/\/$/, ""),
  token: env.WIX_INSTAGRAM_TOKEN || "",
  userId: env.WIX_INSTAGRAM_USER_ID || "",
  compId: env.WIX_COMP_ID || "comp-m46st6zl2",
  instance: env.WIX_INSTANCE_ID || "",
};
// Wix's own widget identifies the account by the instance ID alone (it sends the token and user ID as "undefined")
const HAS_WIX_IG = Boolean(WIX_IG.instance);

export const config = { hasKey: Boolean(API_KEY), hasInstagram: Boolean(IG_TOKEN || HAS_WIX_IG), instagramSource: IG_TOKEN ? "official" : HAS_WIX_IG ? "wix-backup" : "none", tenant: TENANT, club: CLUB_NAME, seasons: SEASON_IDS, cacheSeconds: CACHE_SECONDS };
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------------- PlayHQ client ---------------- */
async function phq(apiPath) {
  const res = await fetch(BASE + apiPath, {
    headers: { "x-api-key": API_KEY, "x-phq-tenant": TENANT, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PlayHQ ${res.status} on ${apiPath}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** Fetches every page of a list endpoint (PlayHQ uses metadata.hasMore / nextCursor). */
async function phqAll(apiPath) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 50; page++) {
    const sep = apiPath.includes("?") ? "&" : "?";
    const body = await phq(cursor ? `${apiPath}${sep}cursor=${encodeURIComponent(cursor)}` : apiPath);
    const data = body?.data ?? body;
    if (Array.isArray(data)) items.push(...data);
    else if (data && Array.isArray(data.items)) items.push(...data.items);
    else if (data) items.push(data);
    const meta = body?.metadata || {};
    cursor = meta.hasMore && meta.nextCursor ? meta.nextCursor : null;
    if (!cursor) break;
  }
  return items;
}

/* ---------------- helpers ---------------- */
const lc = (v) => String(v ?? "").toLowerCase();
const isUsName = (name) => lc(name).includes(CLUB_NAME);
/** A team is ours if it belongs to our PlayHQ organisation, or (fallback) has our club name. */
const isOurTeam = (t) =>
  (ORG_ID && [t.club?.id, t.organisation?.id, t.organisationId, t.clubId].includes(ORG_ID)) ||
  isUsName(t.name) || isUsName(t.club?.name);
const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

/** Club logo from PlayHQ (club.logo.sizes) — the 128px version, or the nearest size. */
function clubLogo(club, want = 128) {
  const sizes = club?.logo?.sizes;
  if (!Array.isArray(sizes) || !sizes.length) return "";
  const best = [...sizes]
    .filter((x) => x?.url && /^https:\/\//.test(x.url))
    .sort((a, b) => Math.abs((a.dimensions?.width || 0) - want) - Math.abs((b.dimensions?.width || 0) - want))[0];
  return best?.url || "";
}

/** "YYYY-MM-DDTHH:MM" in the club's time zone, so all times sort and compare the same way. */
function localKeyFromDate(d) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Works out a game's local start time from the different shapes PlayHQ may use. */
function gameLocalKey(g) {
  const s = Array.isArray(g.schedule) ? g.schedule[0] : g.schedule;
  const full = first(s?.dateTime, s?.startDateTime, g.dateTime, g.startDateTime, g.startTime, g.date?.dateTime);
  if (full && /[zZ]|[+-]\d\d:?\d\d$/.test(full)) return localKeyFromDate(new Date(full));
  const date = first(s?.date, g.date?.date, typeof g.date === "string" ? g.date : null, full?.slice?.(0, 10));
  if (!date) return null;
  const time = first(s?.time, g.time, full?.slice?.(11, 16)) || "00:00";
  return `${date.slice(0, 10)}T${time.slice(0, 5)}`;
}

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
function prettyParts(key) {
  if (!key) return { day: "TBC", time: "", date: "TBC", long: "Date TBC" };
  const [y, m, d] = key.slice(0, 10).split("-").map(Number);
  const [hh, mm] = key.slice(11, 16).split(":").map(Number);
  const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const h12 = ((hh + 11) % 12) + 1;
  const time = hh === 0 && mm === 0 ? "TBC" : `${h12}:${String(mm).padStart(2, "0")}`;
  const ampm = hh < 12 ? "am" : "pm";
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-AU", { month: "short", timeZone: "UTC" });
  return {
    day, time,
    date: `${d} ${month}`,
    long: (() => {
      const dayName = day.charAt(0) + day.slice(1).toLowerCase();
      return time === "TBC" ? `${dayName} ${d} ${month}` : `${dayName} ${d} ${month} · ${time}${ampm}`;
    })(),
  };
}

function gradeGroup(name) {
  const n = lc(name);
  if (/(^|\W)u\s?\d{1,2}|under\s?\d|junior|blast|youth|kids/.test(n)) return "juniors";
  if (/women|female|girls|ladies/.test(n)) return "women";
  return "seniors";
}

function scoreText(t) {
  const s = first(t.score, t.scoreTotal, t.statistics?.score, t.result?.score);
  if (s === undefined) {
    if (t.runs != null) return t.wickets != null ? `${t.wickets}/${t.runs}` : String(t.runs);
    return "";
  }
  if (typeof s === "object") {
    const runs = first(s.runs, s.total, s.value);
    if (runs === undefined) return "";
    return s.wickets != null ? `${s.wickets}/${runs}` : String(runs);
  }
  return String(s);
}

/**
 * Cricket innings score for one team, from PlayHQ's periods → statistics.
 * e.g. "6/210", "174" (all out), or "8/245 & 3/61" for two-innings games.
 */
function inningsScore(g, teamId) {
  const parts = [];
  const periods = [...(g.periods || [])].sort((a, b) => Number(a.sequenceNo) - Number(b.sequenceNo));
  for (const p of periods) {
    for (const t of p.teams || []) {
      if (t.id !== teamId) continue;
      const stats = Object.fromEntries((t.outcome?.statistics || []).map((x) => [x.type, x.value]));
      if (stats.TOTAL_SCORE == null) continue;
      const outs = stats.TOTAL_OUTS;
      const status = String(t.outcome?.status || "").toUpperCase();
      let txt = status === "ALL_OUT" || outs >= 10 || outs == null ? String(stats.TOTAL_SCORE) : `${outs}/${stats.TOTAL_SCORE}`;
      if (/DECLARE/.test(status)) txt += "d";
      parts.push(txt);
    }
  }
  if (!parts.length && g.match?.teams) {
    const m = g.match.teams.find((t) => t.id === teamId);
    const total = (m?.outcome?.statistics || []).find((x) => x.type === "TOTAL_SCORE");
    if (total) parts.push(String(total.value));
  }
  return parts.join(" & ");
}

/** The two sides of a game, with names looked up from the grade's team list. */
function teamsOfGame(g, names = {}) {
  let arr = g.teams || g.competitors || g.participants || [];
  if (!arr.length) {
    const home = g.home || g.homeTeam;
    const away = g.away || g.awayTeam;
    arr = [home && { ...home, isHomeTeam: true }, away && { ...away, isHomeTeam: false }].filter(Boolean);
  }
  return arr.map((t) => {
    const id = first(t.id, t.team?.id);
    return {
      id,
      name: first(t.name, t.team?.name, names[id], "TBC"),
      isHome: first(t.isHomeTeam, t.isHome),
      result: String(first(t.outcome, t.result?.outcome, t.result) ?? "").toUpperCase(),
      score: inningsScore(g, id) || scoreText(t),
    };
  });
}

/** PlayHQ statuses seen: PENDING, FINAL, ABANDONED (+ live/in-progress during games). */
function gameState(g, teams) {
  const st = String(first(g.status, g.state) ?? "").toUpperCase();
  if (/PROGRESS|LIVE|STARTED|PLAYING/.test(st)) return "live";
  if (/FINAL|COMPLETE|FINISH|ABANDON|CANCEL|FORFEIT|RESULT/.test(st)) return "done";
  if (teams.some((t) => /WON|LOST|WIN|LOS|DRAW|TIE|ABANDON|FORFEIT/.test(t.result))) return "done";
  return "upcoming";
}

function outcome(us) {
  const r = us.result;
  if (/ABANDON|NO_RESULT|CANCEL/.test(r)) return "abandoned";
  if (/WON|WIN/.test(r)) return "won";
  if (/LOST|LOS/.test(r)) return "lost";
  if (/DRAW|TIE/.test(r)) return "drawn";
  return "played";
}

/** Fetches a grade's games. v2 shape: { rounds:[{name, games:[…]}], teams:[{id,name}], playingSurfaces:[…] } */
async function fetchGradeGames(gid) {
  const body = await phq(`/v2/grades/${gid}/games`);
  const names = Object.fromEntries((body.teams || []).map((t) => [t.id, t.name]));
  const surfaces = Object.fromEntries((body.playingSurfaces || []).map((s) => [s.id, s]));
  let games = [];
  const byes = [];
  if (Array.isArray(body.rounds)) {
    body.rounds.forEach((r, idx) => {
      for (const g of r.games || []) games.push({ ...g, _round: r.name, _roundIdx: idx, _isFinal: r.isFinalRound });
      for (const b of r.byes || []) byes.push({ teamId: b.teamID ?? b.teamId, round: r.name, roundIdx: idx });
    });
  } else {
    games = Array.isArray(body.data) ? body.data : [];
  }
  return { games, names, surfaces, byes };
}

function venueOf(g, surfaces) {
  const sched = Array.isArray(g.schedule) ? g.schedule[0] : g.schedule;
  const s = surfaces[sched?.playingSurfaceId];
  if (s) return first(s.venue?.name, s.name);
  return first(g.venue?.name, g.venueName, "");
}

/** Turns the ladder response into simple rows, whatever its exact shape. */
function normaliseLadder(body, names = {}) {
  const d = body?.data ?? body ?? {};
  let ladders = d.ladders ?? d.ladder ?? (Array.isArray(d) ? d : [d]);
  if (!Array.isArray(ladders)) ladders = [ladders];
  const lad = ladders[0] || {};
  const headers = lad.headers || d.headers || [];
  const standings = lad.standings || lad.teams || lad.rows || d.standings || [];

  return standings.map((r, i) => {
    const vals = {};
    const add = (k, v) => { if (k) vals[lc(k)] = v; };
    if (Array.isArray(r.values)) {
      r.values.forEach((v, j) => {
        if (v && typeof v === "object" && "key" in v) add(v.key, v.value);
        else add(headers[j]?.key ?? headers[j]?.name ?? headers[j]?.label, v?.value ?? v);
      });
    }
    for (const obj of [r.stats, r.statistics]) if (obj && typeof obj === "object") Object.entries(obj).forEach(([k, v]) => add(k, v));
    const get = (...ks) => {
      for (const k of ks) {
        if (r[k] !== undefined && r[k] !== null && typeof r[k] !== "object") return r[k];
        if (vals[lc(k)] !== undefined) return vals[lc(k)];
      }
      return "–";
    };
    const team = first(r.team?.name, r.name, r.teamName, names[first(r.team?.id, r.teamId, r.id)], "TBC");
    const pos = get("position", "rank", "pos");
    return {
      pos: pos === "–" ? i + 1 : pos,
      team,
      played: get("played", "gamesPlayed", "p", "gp"),
      won: get("won", "wins", "w"),
      lost: get("lost", "losses", "l"),
      points: get("points", "pts", "competitionPoints", "totalPoints"),
      isUs: isUsName(team),
    };
  });
}

/** "Riverside Men's 1st Grade" → "Men's 1st Grade" */
function shortUs(name) {
  const re = new RegExp("^\\s*" + CLUB_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*", "i");
  return String(name || "").replace(re, "").trim() || name;
}
/** "Launceston Men's 1st Grade" → "Launceston" (drops the same team suffix as ours) */
function shortOpp(oppName, usName) {
  const suffix = shortUs(usName);
  const opp = String(oppName || "");
  if (suffix && suffix !== usName && opp.toLowerCase().endsWith(" " + suffix.toLowerCase())) {
    return opp.slice(0, opp.length - suffix.length).trim();
  }
  return opp;
}

/* ---------------- build the site data ---------------- */
/** Runs fn over items, at most `limit` at a time (keeps PlayHQ happy). */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

function seasonLabel(s) {
  // "Cricket North Senior Competitions" + "Summer 2026/27" → "Cricket North Senior · Summer 2026/27"
  const comp = String(s.competition?.name || "").replace(/\s*competitions?$/i, "");
  return [comp, s.name].filter(Boolean).join(" · ") || s.id;
}

/** Is this season running now (or about to start)? */
function isCurrentSeason(s) {
  const st = lc(s.status);
  if (/active|current|in_progress|live|upcoming|open|published/.test(st)) return true;
  if (/complete|archiv|finish|closed|past|cancel/.test(st)) return false;
  const start = first(s.startDate, s.dates?.start, s.startsAt);
  const end = first(s.endDate, s.dates?.end, s.endsAt);
  if (start || end) {
    const now = Date.now();
    return (!start || new Date(start).getTime() <= now + 60 * 864e5) &&
           (!end || new Date(end).getTime() >= now - 14 * 864e5);
  }
  // No status or dates: look for this cricket season's year in the name (e.g. "2026/27")
  const d = new Date();
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return seasonLabel(s).includes(String(y));
}

async function resolveSeasons() {
  if (SEASON_IDS.length) return SEASON_IDS.map((id) => ({ id, name: id }));
  if (!ORG_ID) throw new Error("Set PLAYHQ_ORG_ID (or PLAYHQ_SEASON_IDS) in .env");
  const seasons = await phqAll(`/v1/organisations/${ORG_ID}/seasons`);
  let current = seasons.filter(isCurrentSeason);
  if (!current.length) {
    const byDate = [...seasons].sort((a, b) =>
      lc(first(b.startDate, b.createdAt, "")).localeCompare(lc(first(a.startDate, a.createdAt, ""))));
    current = byDate.slice(0, 1);
  }
  if (!current.length) throw new Error("No seasons found for this organisation");
  return current.map((s) => ({ id: s.id, name: seasonLabel(s) }));
}

const GROUP_ORDER = { seniors: 0, women: 1, juniors: 2 };

async function buildClubData() {
  const seasons = await resolveSeasons();

  const gradeName = {};
  const gradeSeason = {};
  const teamName = {};            // every team in our seasons, id → name
  const teamLogo = {};            // every team in our seasons, id → club logo URL
  const ourTeamIds = new Set();
  const gradeIds = [...GRADE_IDS];
  const gamesByGrade = new Map(); // games already fetched while searching for our grades
  const addGrade = (gid) => { if (gid && !gradeIds.includes(gid)) gradeIds.push(gid); };
  const isUsTeam = (t) => ourTeamIds.has(t.id) || isUsName(t.name);

  await mapLimit(seasons, 3, async (season) => {
    const [grades, teams] = await Promise.all([
      phqAll(`/v1/seasons/${season.id}/grades`).catch((e) => { console.warn(e.message); return []; }),
      phqAll(`/v1/seasons/${season.id}/teams`).catch((e) => { console.warn(e.message); return []; }),
    ]);
    grades.forEach((g) => { gradeName[g.id] = first(g.name, g.displayName, "Grade"); gradeSeason[g.id] = season.name; });
    teams.forEach((t) => {
      if (!t?.id) return;
      teamName[t.id] = t.name;
      const logo = clubLogo(t.club);
      if (logo) teamLogo[t.id] = logo;
    });
    const ours = teams.filter((t) => t && isOurTeam(t));
    ours.forEach((t) => ourTeamIds.add(t.id));
    if (!AUTO_GRADES) return;

    // Our teams usually say which grade they're in
    const withGrade = ours.filter((t) => first(t.grade?.id, t.gradeId));
    for (const t of withGrade) {
      const gid = first(t.grade?.id, t.gradeId);
      if (t.grade?.name && !gradeName[gid]) gradeName[gid] = t.grade.name;
      gradeSeason[gid] = season.name;
      addGrade(gid);
    }
    // None of them do: check each grade's games for a Riverside team instead
    if (!withGrade.length) {
      await mapLimit(grades, 4, async (g) => {
        const res = await fetchGradeGames(g.id).catch(() => null);
        if (res && res.games.some((gm) => teamsOfGame(gm, res.names).some(isUsTeam))) {
          addGrade(g.id);
          gamesByGrade.set(g.id, res);
        }
      });
    }
  });

  if (!gradeIds.length) {
    throw new Error(`No grades with a "${CLUB_NAME}" team found — check CLUB_NAME, PLAYHQ_ORG_ID or PLAYHQ_SEASON_IDS`);
  }

  // Seniors first, then women, then juniors; alphabetical inside each group
  gradeIds.sort((a, b) => {
    const na = gradeName[a] || "", nb = gradeName[b] || "";
    return (GROUP_ORDER[gradeGroup(na)] - GROUP_ORDER[gradeGroup(nb)]) || na.localeCompare(nb, "en", { numeric: true });
  });

  const perGrade = await mapLimit(gradeIds, 4, async (gid) => {
    const [ladderBody, gamesRes] = await Promise.all([
      phq(`/v2/grades/${gid}/ladder`).catch((e) => { console.warn(e.message); return null; }),
      gamesByGrade.get(gid) || fetchGradeGames(gid).catch((e) => { console.warn(e.message); return { games: [], names: {}, surfaces: {} }; }),
    ]);
    return { gid, ladderBody, ...gamesRes };
  });

  const todayKey = localKeyFromDate(new Date()).slice(0, 10);
  const weekKey = localKeyFromDate(new Date(Date.now() + 7 * 864e5));

  const ourGames = [];
  const ladders = [];

  for (const { gid, ladderBody, games, names, surfaces } of perGrade) {
    const gName = gradeName[gid] || "Grade";
    const group = gradeGroup(gName);
    const allNames = { ...teamName, ...names };

    if (ladderBody) {
      const rows = normaliseLadder(ladderBody, allNames);
      const dupName = gradeIds.some((o) => o !== gid && gradeName[o] === gName);
      const label = dupName && gradeSeason[gid] ? `${gName} (${gradeSeason[gid]})` : gName;
      if (rows.length) ladders.push({ gradeId: gid, gradeName: label, rows });
    }

    for (const g of games) {
      const ts = teamsOfGame(g, allNames);
      const usIdx = ts.findIndex(isUsTeam);
      if (usIdx === -1) continue;
      const us = ts[usIdx];
      const opp = ts.find((_, i) => i !== usIdx) || { name: "TBC", score: "", result: "" };
      ourGames.push({
        key: gameLocalKey(g),
        gradeName: gName, group,
        round: first(g._round, g.round?.name, g.roundName, ""),
        state: gameState(g, ts),
        url: g.url || "",
        us, opp,
        usShort: shortUs(us.name),
        oppShort: shortOpp(opp.name, us.name),
        oppLogo: teamLogo[opp.id] || "",
        venue: venueOf(g, surfaces),
        where: us.isHome === true ? "Home" : us.isHome === false ? "Away" : "",
      });
    }
  }

  const byDateAsc = (a, b) => (a.key || "9999").localeCompare(b.key || "9999");
  const live = ourGames.filter((g) => g.state === "live");
  const upcoming = ourGames.filter((g) => g.state === "upcoming" && g.key && g.key >= todayKey).sort(byDateAsc);
  const thisWeek = upcoming.filter((g) => g.key <= weekKey);
  const fixturesSrc = thisWeek.length ? thisWeek : upcoming.slice(0, 8);
  const completed = ourGames
    .filter((g) => g.state === "done")
    .sort((a, b) => (b.key || "").localeCompare(a.key || ""))
    .slice(0, 8);

  const resultText = (g) => {
    const o = outcome(g.us);
    if (o === "abandoned") return `v ${g.oppShort} · abandoned`;
    if (/FORFEIT/.test(g.us.result)) return `${o === "won" ? "Won" : "Lost"} on forfeit v ${g.oppShort}`;
    return `Riverside ${g.us.score || "–"} v ${g.oppShort} ${g.opp.score || "–"}`;
  };

  const next = upcoming[0];

  return {
    updatedAt: new Date().toISOString(),
    // What the server found — handy for checking setup at /api/health
    found: {
      seasons,
      grades: gradeIds.map((id) => ({ id, name: gradeName[id] || id, group: gradeGroup(gradeName[id]) })),
    },
    nextMatch: next && {
      team: next.usShort || next.gradeName,
      grade: next.gradeName,
      opponent: next.oppShort,
      opponentLogo: next.oppLogo,
      when: prettyParts(next.key).long,
      where: next.venue || "Venue TBC",
      url: next.url,
    },
    results: [
      ...live.map((g) => ({
        status: "live", team: g.usShort, url: g.url,
        text: `Riverside ${g.us.score || "yet to bat"} v ${g.oppShort} ${g.opp.score || ""}`.trim(),
      })),
      ...completed.map((g) => ({ status: outcome(g.us), team: g.usShort, url: g.url, text: resultText(g) })),
    ],
    fixturesLabel: thisWeek.length ? "This weekend" : "Upcoming games",
    fixtures: fixturesSrc.map((g) => {
      const p = prettyParts(g.key);
      return {
        day: p.day, time: p.time, date: p.date,
        team: g.usShort, opponent: g.oppShort, opponentLogo: g.oppLogo,
        venue: [g.round, g.venue].filter(Boolean).join(" · "),
        where: g.where || p.date,
        group: g.group,
        url: g.url,
      };
    }),
    ladders,
  };
}

/* ---------------- cache ---------------- */
let cache = { at: 0, data: null, pending: null };
async function getClubData() {
  const fresh = cache.data && Date.now() - cache.at < CACHE_SECONDS * 1000;
  if (fresh) return cache.data;
  if (!cache.pending) {
    cache.pending = buildClubData()
      .then((data) => { cache = { at: Date.now(), data, pending: null }; return data; })
      .catch((err) => { cache.pending = null; throw err; });
  }
  try {
    return await cache.pending;
  } catch (err) {
    if (cache.data) return { ...cache.data, stale: true }; // PlayHQ down: show last good data
    throw err;
  }
}

/* ---------------- Fixture filter: association → competition → season → team ---------------- */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const memo = new Map();

/** Small time-based cache; on a PlayHQ error it keeps serving the last good value. */
async function cached(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit && "value" in hit && Date.now() - hit.at < ttlMs) return hit.value;
  if (hit?.pending) return hit.pending;
  if (memo.size > 500) memo.clear();
  const pending = fn()
    .then((value) => { memo.set(key, { at: Date.now(), value }); return value; })
    .catch((err) => {
      if (hit && "value" in hit) { memo.set(key, hit); return hit.value; }
      memo.delete(key);
      throw err;
    });
  memo.set(key, { ...(hit || { at: 0 }), pending });
  return pending;
}

/** Every season Riverside has played in, with its association and competition. */
function getFilterOptions() {
  return cached("filters", 60 * 60 * 1000, async () => {
    if (!ORG_ID) throw new Error("Set PLAYHQ_ORG_ID in .env");
    const raw = await phqAll(`/v1/organisations/${ORG_ID}/seasons`);
    const seasons = raw
      .map((s) => ({
        id: s.id,
        name: s.name || "Season",
        active: /active|current|progress|live|upcoming/i.test(s.status || ""),
        start: s.startDate || "",
        association: { id: s.association?.id || "none", name: s.association?.name || "Other" },
        competition: { id: s.competition?.id || "none", name: s.competition?.name || "Competition" },
      }))
      .sort((a, b) => (b.active - a.active) || b.start.localeCompare(a.start));
    // Main association = the one Riverside has the most seasons in (Cricket North); list it first
    const count = {};
    seasons.forEach((x) => { count[x.association.id] = (count[x.association.id] || 0) + 1; });
    seasons.sort((a, b) => (count[b.association.id] - count[a.association.id]) || a.association.name.localeCompare(b.association.name));
    const main = seasons[0]?.association.id;
    const def =
      seasons.find((x) => x.association.id === main && x.active && /senior/i.test(x.competition.name)) ||
      seasons.find((x) => x.association.id === main && x.active) ||
      seasons.find((x) => x.active) || seasons[0];
    return { seasons, defaultSeasonId: def?.id || null };
  });
}

/** Every team in one season (raw from PlayHQ), cached for an hour. */
function getAllSeasonTeams(seasonId) {
  return cached(`allteams:${seasonId}`, 60 * 60 * 1000, () => phqAll(`/v1/seasons/${seasonId}/teams`));
}

/** team id → club logo URL for every team in one season. */
async function getSeasonLogos(seasonId) {
  const teams = await getAllSeasonTeams(seasonId).catch(() => []);
  const map = {};
  for (const t of teams) { const logo = t && clubLogo(t.club); if (logo) map[t.id] = logo; }
  return map;
}

/** Riverside's teams in one season. */
function getSeasonTeams(seasonId) {
  return cached(`teams:${seasonId}`, 60 * 60 * 1000, async () => {
    const teams = await getAllSeasonTeams(seasonId);
    return teams
      .filter((t) => t && isOurTeam(t))
      .map((t) => ({
        id: t.id,
        name: t.name,
        short: shortUs(t.name),
        gradeId: first(t.grade?.id, t.gradeId, null),
        gradeName: first(t.grade?.name, ""),
        group: gradeGroup(first(t.grade?.name, t.name)),
      }))
      .sort((a, b) => (GROUP_ORDER[a.group] - GROUP_ORDER[b.group]) || a.name.localeCompare(b.name, "en", { numeric: true }));
  });
}

/** Full fixture for one team: every round, with results and byes. */
function getTeamGames(seasonId, teamId) {
  return cached(`tg:${seasonId}:${teamId}`, CACHE_SECONDS * 1000, async () => {
    const team = (await getSeasonTeams(seasonId)).find((t) => t.id === teamId);
    if (!team) { const e = new Error("Team not found in this season"); e.status = 404; throw e; }
    const info = { name: team.name, short: team.short, grade: team.gradeName };
    if (!team.gradeId) return { team: info, games: [], record: null, note: "This team isn't in a grade yet." };

    const [{ games, names, surfaces, byes }, logos] = await Promise.all([
      fetchGradeGames(team.gradeId),
      getSeasonLogos(seasonId),
    ]);
    const rows = [];
    for (const g of games) {
      const ts = teamsOfGame(g, names);
      const us = ts.find((t) => t.id === teamId);
      if (!us) continue;
      const opp = ts.find((t) => t !== us) || { name: "TBC", score: "" };
      const key = gameLocalKey(g);
      const p = prettyParts(key);
      const state = gameState(g, ts);
      rows.push({
        round: g._round || "", roundIdx: g._roundIdx ?? 999, key,
        when: p.long,
        opponent: shortOpp(opp.name, us.name),
        opponentLogo: logos[opp.id] || "",
        venue: venueOf(g, surfaces),
        where: us.isHome === true ? "Home" : us.isHome === false ? "Away" : "",
        state,                                                  // upcoming | live | done
        // won | lost | drawn | abandoned | upcoming | live | noresult (date passed, never played)
        result: state === "done" ? outcome(us)
          : state === "upcoming" && key && key.slice(0, 10) < localKeyFromDate(new Date()).slice(0, 10) ? "noresult"
          : state,
        forfeit: /FORFEIT/.test(us.result),
        usScore: us.score || "", oppScore: opp.score || "",
        url: g.url || "",
      });
    }
    for (const b of byes) {
      if (b.teamId === teamId) rows.push({ round: b.round, roundIdx: b.roundIdx, key: "", state: "bye", result: "bye", when: "", opponent: "BYE" });
    }
    rows.sort((a, b) => (a.roundIdx - b.roundIdx) || (a.key || "").localeCompare(b.key || ""));

    const done = rows.filter((r) => r.state === "done" && r.result !== "abandoned");
    const record = {
      played: done.length,
      won: done.filter((r) => r.result === "won").length,
      lost: done.filter((r) => r.result === "lost").length,
    };
    return { team: info, games: rows, record };
  });
}


/* ---------------- Instagram (official API) ----------------
 * Uses a long-lived token from "Instagram API with Instagram Login" (see README).
 * A weekly Vercel Cron job (api/cron/refresh-instagram.js) refreshes it, which
 * keeps it valid for another 60 days each time.
 */
/** Instagram media (Graph API format) → the posts the website shows. */
function toPosts(items) {
  return (items || [])
    .map((m) => ({
      image: m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url,
      isVideo: m.media_type === "VIDEO",
      caption: String(m.caption || "").slice(0, 140),
      link: m.permalink,
      date: m.timestamp,
    }))
    .filter((p) => p.image && /^https:\/\//.test(p.image) && p.link)
    .slice(0, IG_POSTS);
}

/** Backup: the Wix Instagram Feed app's server, with the values copied from the old Wix site. */
async function fetchWixInstagram() {
  const res = await fetch(`${WIX_IG.base}/api/facebook/getMedias?from=&count=${IG_POSTS}`, {
    // The same headers the Wix widget itself sends
    headers: {
      "x-instagram-token": WIX_IG.token || "undefined",
      "x-instagram-user-id": WIX_IG.userId || "undefined",
      "x-instagram-expires-in": "undefined",
      "x-is-business-app": "true",
      "x-wix-comp-id": WIX_IG.compId,
      "x-wix-instance-id": WIX_IG.instance,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  const items = body?.payload?.data;
  if (!res.ok || !Array.isArray(items)) {
    throw new Error(`Wix Instagram backup failed (${res.status} ${body?.message || ""}). The Wix session has probably expired: switch to INSTAGRAM_ACCESS_TOKEN.`);
  }
  return { configured: true, source: "wix-backup", posts: toPosts(items), updatedAt: new Date().toISOString() };
}

async function buildInstagram() {
  if (!IG_TOKEN) {
    if (HAS_WIX_IG) return fetchWixInstagram();
    return { configured: false, posts: [] };
  }
  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  const url = `${IG_BASE}/me/media?fields=${fields}&limit=${IG_POSTS}&access_token=${encodeURIComponent(IG_TOKEN)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Instagram ${res.status}: ${body.error?.message || "request failed"}`);
  const posts = toPosts(body.data);
  return { configured: true, source: "official", posts, updatedAt: new Date().toISOString() };
}

export function getInstagram() {
  return cached("instagram", 15 * 60 * 1000, buildInstagram).catch((err) => {
    console.warn(err.message);
    return { configured: true, posts: [], error: "Instagram unavailable" };
  });
}

/** Extends the token's life by 60 days (needs to be at least 24 hours old). */
export async function refreshInstagramToken() {
  if (!IG_TOKEN) return { ok: false, reason: "INSTAGRAM_ACCESS_TOKEN not set" };
  const url = `${IG_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(IG_TOKEN)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) return { ok: false, reason: body.error?.message || `HTTP ${res.status}` };
  const days = body.expires_in ? Math.round(body.expires_in / 86400) : 60;
  const changed = body.access_token !== IG_TOKEN;
  if (changed) console.warn("Instagram returned a new token string: update INSTAGRAM_ACCESS_TOKEN in Vercel to the new value.");
  return { ok: true, validForDays: days, tokenChanged: changed };
}

export { getClubData, getFilterOptions, getSeasonTeams, getTeamGames };
