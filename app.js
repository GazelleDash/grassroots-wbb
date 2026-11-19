/* Grassroots WBB fan site.
   Hash routes:  #view=board&c=2027&q=&pos=&st=&intl=&s=rk&d=a&lim=
                 #view=classes&c=2027&open=<tid>
                 #view=track&c=2022
                 #view=player&p=<key>
   Data: data/meta.json, board.json, schools.json, track.json up front;
   data/p_<class>.json (profiles) only when a player card is opened. */
"use strict";

const S = { meta: null, rows: [], byKey: new Map(), schools: [], track: [], chunks: {} };
const $ = sel => document.querySelector(sel);
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ESC[c]);
const PAGE = 250;

/* ── shared formatting ────────────────────────────────────────────────── */
function heatColor(p) {           // identical to the WNBA RAPM site
  if (p == null) return "";
  const dist = Math.abs(p - 50) / 50;
  return `hsl(${Math.round(p * 1.2)}, ${Math.round(45 + 30 * dist)}%, ${Math.round(93 - 6 * dist)}%)`;
}
function barHeat(p) {             // same hue ramp, a step stronger so thin bars read
  if (p == null) return "#ddd";
  const dist = Math.abs(p - 50) / 50;
  return `hsl(${Math.round(p * 1.2)}, ${Math.round(50 + 25 * dist)}%, ${Math.round(80 - 12 * dist)}%)`;
}
const heatVar = p => p == null ? "" : ` style="--heat:${heatColor(p)}"`;
const num = (v, d = 1) => (v == null || isNaN(v)) ? "—" : Number(v).toFixed(d);
const sgn = (v, d = 1) => (v == null || isNaN(v)) ? "—" : (v > 0 ? "+" : "") + Number(v).toFixed(d);
function ord(n) {
  if (n == null) return "—";
  n = Math.round(n);
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function htIn(h) {
  const m = /^(\d)-(\d{1,2})$/.exec(h || "");
  return m ? +m[1] * 12 + +m[2] : null;
}
const logoURL = tid => `https://a.espncdn.com/i/teamlogos/ncaa/500/${tid}.png`;
const schoolName = tid => (S.meta.schools[tid] || [])[0];
function schHTML(tid, raw, cls = "") {
  const name = tid ? (schoolName(tid) || raw) : raw;
  if (!name) return '<span class="muted">—</span>';
  const img = tid ? `<img src="${logoURL(tid)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<span class="sch ${cls}">${img}${esc(name)}</span>`;
}
function statusTags(src) {
  if (src === "enrolled") return '<span class="tag t-fr" title="Playing college ball this season">Fr</span>';
  if (src === "x") return '<span class="tag t-x" title="Commitment reported on X; not yet on ESPN\'s list">X</span>';
  return "";
}
function lum(hex) {
  if (!/^[0-9a-f]{6}$/i.test(hex || "")) return 0;
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function shade(hex, f) {
  const ch = [0, 2, 4].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * f));
  return "#" + ch.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}
function teamColor(tid) {           // banner color, darkened until white text reads
  const m = S.meta.schools[tid];
  let c = m && /^[0-9a-f]{6}$/i.test(m[1]) ? m[1] : "8a3f12";
  while (lum(c) > 0.18) c = shade(c, 0.8).slice(1);
  return "#" + c;
}

/* ── routing ──────────────────────────────────────────────────────────── */
function getState() { return Object.fromEntries(new URLSearchParams(location.hash.slice(1))); }
function hashOf(s) {
  const o = {};
  for (const [k, v] of Object.entries(s)) if (v !== "" && v != null) o[k] = v;
  return "#" + new URLSearchParams(o).toString();
}
function setState(patch, replace = false) {
  const h = hashOf({ ...getState(), ...patch });
  if (replace) history.replaceState(null, "", h);
  else location.hash = h;
}
window.addEventListener("hashchange", render);

const VIEWS = { board: renderBoard, classes: renderClasses, track: renderTrack, player: renderPlayer };
let lastView = null;
function render() {
  const st = getState();
  const view = VIEWS[st.view] ? st.view : "board";
  document.querySelectorAll("#viewnav a").forEach(a =>
    a.classList.toggle("active", a.dataset.view === view || (view === "player" && a.dataset.view === "board")));
  if (view !== lastView) window.scrollTo(0, 0);
  lastView = view;
  VIEWS[view](st);
}

/* ── data ─────────────────────────────────────────────────────────────── */
async function getJSON(name) {
  const r = await fetch(`data/${name}`, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
  return r.json();
}
async function boot() {
  try {
    const [meta, board, schools, track] = await Promise.all(
      ["meta.json", "board.json", "schools.json", "track.json"].map(getJSON));
    S.meta = meta; S.schools = schools; S.track = track;
    S.rows = board.rows.map(r => Object.fromEntries(board.cols.map((c, i) => [c, r[i]])));
    S.rows.forEach(r => S.byKey.set(r.key, r));
    const d = new Date(meta.updated + "T12:00:00");
    $("#asof").innerHTML = `Updated <b>${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>`;
    render();
  } catch (e) {
    $("#main").innerHTML = `<div class="errbox">Couldn't load the rankings (${esc(e.message)}). Refresh to try again.</div>`;
  }
}

function classSelect(id, classes, cur, label = c => c) {
  return `<label>Class <select id="${id}" aria-label="Recruiting class">${classes.map(c =>
    `<option value="${c}"${String(c) === String(cur) ? " selected" : ""}>${label(c)}</option>`).join("")}</select></label>`;
}
const classLabel = c => c === 2026 ? "2026 (college Fr.)" : String(c);
const defaultClass = () => 2027;

/* ── Prospects board ──────────────────────────────────────────────────── */
const BCOLS = [
  { k: "rk", l: "Rk", g: "", cls: "rk", title: "Our rank in the class, by projected RAPM NET. Stays fixed when you sort by another column." },
  { k: "name", l: "Player", g: "Overview", cls: "name", sortv: r => r.name,
    fmt: r => `<a href="#view=player&p=${encodeURIComponent(r.key)}">${esc(r.name)}</a>${r.intl ? '<span class="tag t-intl" title="International">INTL</span>' : ""}` },
  { k: "pos", l: "Pos", g: "Overview", sortv: r => r.pos || "~" },
  { k: "ht", l: "Ht", g: "Overview", sortv: r => htIn(r.ht), fmt: r => esc(r.ht || "—") },
  { k: "school", l: "College", g: "Overview", cls: "left", sortv: r => r.tid ? schoolName(r.tid) : (r.school_raw || "~"),
    fmt: r => schHTML(r.tid, r.school_raw) + statusTags(r.school_src) },
  { k: "espn_rank", l: "Rk", g: "ESPN", d: 0, title: "ESPN SC Next rank in class" },
  { k: "espn_grade", l: "Grade", g: "ESPN", d: 0 },
  { k: "vs_espn", l: "vs ESPN", g: "ESPN", title: "Positive = we rank her higher than ESPN does",
    fmt: r => r.vs_espn == null ? "—" : `<span class="${r.vs_espn > 0 ? "up" : r.vs_espn < 0 ? "dn" : ""}">${sgn(r.vs_espn, 0)}</span>` },
  { k: "rapm", l: "RAPM", g: "Projection", d: 2, pct: "rapm_p", title: "Projected RAPM NET (on/off impact per 100 possessions); the ranking metric" },
  { k: "orapm", l: "ORAPM", g: "Projection", d: 2, pct: "orapm_p", title: "Projected offensive RAPM" },
  { k: "drapm", l: "DRAPM", g: "Projection", d: 2, pct: "drapm_p", title: "Projected defensive RAPM (higher = better)" },
  { k: "wbpm", l: "WBPM-C", g: "Projection", d: 2, pct: "wbpm_p", title: "Projected career box plus/minus (WBPM-C)" },
  { k: "grade_shoot3", l: "3PT", g: "Skill grades", grade: true },
  { k: "grade_shoot2", l: "2PT", g: "Skill grades", grade: true },
  { k: "grade_passing", l: "Pass", g: "Skill grades", grade: true },
  { k: "grade_rebound", l: "Reb", g: "Skill grades", grade: true },
  { k: "grade_defense", l: "Def", g: "Skill grades", grade: true },
  { k: "grade_overall", l: "Ovr", g: "Skill grades", grade: true },
  { k: "circuits", l: "Circuits", g: "Info", cls: "left", fmt: r => `<span class="muted">${esc(r.circuits || "")}</span>` },
];

function boardFilter(st) {
  const c = +(st.c || defaultClass());
  const q = (st.q || "").trim().toLowerCase();
  return S.rows.filter(r =>
    r.class_year === c &&
    (!st.pos || r.pos === st.pos) &&
    (!st.intl || r.intl === 1) &&
    (!st.st || (st.st === "com" ? !!(r.school_raw) : st.st === "unc" ? !r.school_raw : r.school_src === "enrolled")) &&
    (!q || r.name.toLowerCase().includes(q) || (r.tid && (schoolName(r.tid) || "").toLowerCase().includes(q))));
}
function sortRows(rows, cols, key, dir) {
  const col = cols.find(c => c.k === key) || cols[0];
  const get = col.sortv || (r => r[col.k]);
  const m = dir === "d" ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const x = get(a), y = get(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * m;
  });
}
function headHTML(cols, key, dir) {
  const groups = [];
  for (const c of cols) {
    const g = groups[groups.length - 1];
    if (g && g.g === c.g) g.n++; else groups.push({ g: c.g, n: 1 });
  }
  const grp = `<tr class="grprow">${groups.map(g => `<th colspan="${g.n}">${esc(g.g)}</th>`).join("")}</tr>`;
  const hdr = `<tr>${cols.map(c => {
    const on = c.k === key;
    return `<th data-k="${c.k}" tabindex="0" class="${on ? "sorted" : ""}"${c.title ? ` title="${esc(c.title)}"` : ""}>${esc(c.l)}${on ? `<span class="arr">${dir === "d" ? "▼" : "▲"}</span>` : ""}</th>`;
  }).join("")}</tr>`;
  return `<thead>${grp}${hdr}</thead>`;
}
function cellHTML(c, r, key) {
  const sorted = c.k === key ? " sorted" : "";
  if (c.fmt) return `<td class="${c.cls || ""}${sorted}">${c.fmt(r)}</td>`;
  const v = r[c.k];
  if (c.grade) {
    return `<td class="${sorted}" style="--heat:${heatColor(v)}">${v == null ? "—" : v}</td>`;
  }
  if (c.pct) {
    const p = r[c.pct];
    return `<td class="${sorted.trim()}" style="--heat:${heatColor(p)}"><span class="cellstack"><span class="v">${sgn(v, c.d)}</span><span class="pct">${p == null ? "" : ord(p)}</span></span></td>`;
  }
  return `<td class="${c.cls || ""}${sorted}">${c.d != null ? num(v, c.d) : esc(v ?? "—")}</td>`;
}

function renderBoard(st) {
  const c = +(st.c || defaultClass());
  document.title = `Class of ${c} prospects · Grassroots WBB`;
  $("#controls").innerHTML = `
    <span class="cgrp">${classSelect("csel", S.meta.classes, c, classLabel)}</span>
    <span class="cgrp"><input id="q" type="text" placeholder="Search player or school…" autocomplete="off" aria-label="Search player or school" value="${esc(st.q || "")}"></span>
    <span class="cgrp">
      <label>Pos <select id="pos" aria-label="Position"><option value="">All</option>${["G", "F", "C"].map(p => `<option${st.pos === p ? " selected" : ""}>${p}</option>`).join("")}</select></label>
      <label>College <select id="stsel" aria-label="Commitment status">
        <option value="">All</option>
        <option value="com"${st.st === "com" ? " selected" : ""}>Committed</option>
        <option value="unc"${st.st === "unc" ? " selected" : ""}>Uncommitted</option>
        <option value="fr"${st.st === "fr" ? " selected" : ""}>Playing now</option>
      </select></label>
      <button class="tbtn${st.intl ? " on" : ""}" id="intl" aria-pressed="${!!st.intl}">International</button>
    </span>`;
  $("#csel").onchange = e => setState({ c: e.target.value, lim: "" });
  $("#pos").onchange = e => setState({ pos: e.target.value, lim: "" });
  $("#stsel").onchange = e => setState({ st: e.target.value, lim: "" });
  $("#intl").onclick = () => setState({ intl: st.intl ? "" : "1", lim: "" });
  let t;
  $("#q").oninput = e => {
    clearTimeout(t);
    t = setTimeout(() => { setState({ q: e.target.value, lim: "" }, true); boardTable(getState()); }, 150);
  };
  boardTable(st);
}
function boardTable(st) {
  const c = +(st.c || defaultClass());
  const key = st.s || "rk", dir = st.d || (key === "rk" ? "a" : "d");
  const rows = sortRows(boardFilter(st), BCOLS, key, dir);
  const lim = st.lim === "all" ? rows.length : PAGE;
  const filt = [`class == ${c}`].concat(st.pos ? [`pos == "${st.pos}"`] : [],
    st.st === "com" ? ["committed"] : st.st === "unc" ? ["!committed"] : st.st === "fr" ? ["enrolled"] : [],
    st.intl ? ["intl"] : [], st.q ? [`str_detect(name, "${st.q}")`] : []);
  $("#query").innerHTML = `<span class="prompt">&gt;</span> prospects <span class="pipe">|&gt;</span> <span class="fn">filter</span>(${esc(filt.join(", "))}) <span class="pipe">|&gt;</span> <span class="fn">arrange</span>(${dir === "d" ? `desc(${key})` : key})<span class="tibble">## A tibble: ${rows.length.toLocaleString()} × ${BCOLS.length}</span>`;
  const body = rows.slice(0, lim).map(r => `<tr>${BCOLS.map(col => cellHTML(col, r, key)).join("")}</tr>`).join("");
  const more = rows.length > lim
    ? `<div class="more"><button class="tbtn" id="showall">Show all ${rows.length.toLocaleString()} players</button></div>` : "";
  const note = c === 2026 ? `<div class="note">The 2026 class is in college now. <span class="tag t-fr">Fr</span> marks players found on a college roster this season; projections are still pre-college, so this is how the model saw them coming in.</div>` : "";
  $("#main").innerHTML = `${note}<div class="tablewrap"><table id="board">${headHTML(BCOLS, key, dir)}<tbody>${body ||
    `<tr><td colspan="${BCOLS.length}">No players match these filters.</td></tr>`}</tbody></table></div>${more}`;
  wireSort("#board", BCOLS, key, dir);
  const sa = $("#showall");
  if (sa) sa.onclick = () => setState({ lim: "all" });
}
function wireSort(sel, cols, key, dir) {
  document.querySelectorAll(`${sel} thead tr:not(.grprow) th`).forEach(th => {
    const go = () => {
      const k = th.dataset.k;
      const nd = k === key ? (dir === "d" ? "a" : "d") : (k === "rk" || k === "name" || k === "school" || k === "pos" || k === "espn_rank" ? "a" : "d");
      setState({ s: k, d: nd });
    };
    th.onclick = go;
    th.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
}

/* ── Recruiting classes ───────────────────────────────────────────────── */
function renderClasses(st) {
  const c = +(st.c || defaultClass());
  document.title = `Class of ${c} recruiting rankings · Grassroots WBB`;
  const years = [...new Set(S.schools.map(s => s.class_year))].sort();
  $("#controls").innerHTML = `
    <span class="cgrp">${classSelect("csel", years, c, classLabel)}</span>
    <span class="cgrp"><input id="q" type="text" placeholder="Find a school…" autocomplete="off" aria-label="Find a school" value="${esc(st.q || "")}"></span>`;
  $("#csel").onchange = e => setState({ c: e.target.value, open: "", q: "" });
  let t;
  $("#q").oninput = e => {
    clearTimeout(t);
    t = setTimeout(() => { setState({ q: e.target.value }, true); classesTable(getState()); }, 150);
  };
  classesTable(st);
}
function classesTable(st) {
  const c = +(st.c || defaultClass());
  const q = (st.q || "").trim().toLowerCase();
  const all = S.schools.filter(s => s.class_year === c);
  const rows = all.filter(s => !q || (s.school || "").toLowerCase().includes(q));
  const open = st.open ? +st.open : null;
  $("#query").innerHTML = `<span class="prompt">&gt;</span> commits <span class="pipe">|&gt;</span> <span class="fn">filter</span>(class == ${c}) <span class="pipe">|&gt;</span> <span class="fn">group_by</span>(school) <span class="pipe">|&gt;</span> <span class="fn">summarise</span>(points = <span class="fn">sum</span>(rapm * 0.8^(rank - 1)))<span class="tibble">## A tibble: ${all.length} × 7</span>`;
  const head = `<thead><tr class="grprow"><th colspan="3"></th><th colspan="3">Class strength</th><th colspan="2">Headliner</th></tr>
    <tr><th class="nosort"></th><th class="nosort">Rk</th><th class="nosort">School</th><th class="nosort" title="Commits we track">Commits</th>
    <th class="nosort" title="Each commit's projection, best first, weighted 1, 0.8, 0.64…">Points</th><th class="nosort" title="Average projected RAPM NET">Avg RAPM</th>
    <th class="nosort">Top commit</th><th class="nosort">ESPN Rk</th></tr></thead>`;
  const pts = all.map(s => s.points).sort((a, b) => a - b);
  const pctOf = v => pts.length > 1 ? Math.round(100 * pts.filter(x => x <= v).length / pts.length) : 50;
  const body = rows.map(s => {
    const isOpen = s.tid === open;
    const top = s.commits[0];
    const row = `<tr class="srow${isOpen ? " open" : ""}" data-tid="${s.tid}" tabindex="0" aria-expanded="${isOpen}">
      <td class="caret">${isOpen ? "▾" : "▸"}</td><td class="rk">${s.rank}</td>
      <td class="left">${schHTML(s.tid, s.school, "lg")}</td><td>${s.n}</td>
      <td style="--heat:${heatColor(pctOf(s.points))}"><b>${num(s.points, 2)}</b></td><td>${sgn(s.avg, 2)}</td>
      <td class="left">${top ? esc(top[1]) : ""}</td><td>${s.top_rank == null ? "—" : s.top_rank}</td></tr>`;
    return isOpen ? row + detailRow(s) : row;
  }).join("");
  $("#main").innerHTML = `<div class="note">Recruiting classes ranked by our projections, 247Sports-style: each commit's projected RAPM NET, best first, weighted 1, 0.8, 0.64… Click a school to see its commits; click a player for her profile.${c === 2026 ? " For 2026, the school is where she's playing now." : ""}</div>
    <div class="tablewrap"><table id="classes">${head}<tbody>${body || `<tr><td colspan="8">No schools match.</td></tr>`}</tbody></table></div>`;
  document.querySelectorAll("#classes tr.srow").forEach(tr => {
    const toggle = () => {
      const tid = +tr.dataset.tid;
      setState({ open: tid === open ? "" : String(tid) }, true);
      classesTable(getState());
    };
    tr.onclick = e => { if (!e.target.closest("a")) toggle(); };
    tr.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } };
  });
}
function detailRow(s) {
  const tc = teamColor(s.tid);
  const rows = s.commits.map(([key, name, proj, er, pos, imp, src]) => {
    const b = key ? S.byKey.get(key) : null;
    const p = b ? b.rapm_p : null;
    const who = key ? `<a href="#view=player&p=${encodeURIComponent(key)}">${esc(name)}</a>` : esc(name);
    return `<tr><td class="name">${who}${imp ? '<span class="tag t-imp" title="No grassroots stats; estimated from ESPN grade">*</span>' : ""}${statusTags(src)}</td>
      <td>${esc(pos || (b && b.pos) || "—")}</td><td>${b && b.ht ? esc(b.ht) : "—"}</td><td>${er == null ? "—" : er}</td>
      <td style="--heat:${heatColor(p)}">${sgn(proj, 2)}</td><td>${b ? sgn(b.wbpm, 2) : "—"}</td>
      <td style="--heat:${heatColor(b ? b.grade_overall : null)}">${b && b.grade_overall != null ? b.grade_overall : "—"}</td></tr>`;
  }).join("");
  return `<tr class="detail"><td colspan="8"><div class="bar" style="--tc:${tc}">
    <table><thead><tr><th class="nosort">Player</th><th class="nosort">Pos</th><th class="nosort">Ht</th><th class="nosort">ESPN Rk</th>
    <th class="nosort">RAPM</th><th class="nosort">WBPM-C</th><th class="nosort">Skill Ovr</th></tr></thead><tbody>${rows}</tbody></table></div></td></tr>`;
}

/* ── Track record ─────────────────────────────────────────────────────── */
function renderTrack(st) {
  const years = S.track.map(t => t.class_year);
  const c = +(st.c || years.filter(y => y <= 2023).slice(-1)[0] || years[0]);
  const t = S.track.find(x => x.class_year === c) || S.track[0];
  document.title = `Track record, class of ${c} · Grassroots WBB`;
  $("#controls").innerHTML = `<span class="cgrp">${classSelect("csel", years, c)}</span>`;
  $("#csel").onchange = e => setState({ c: e.target.value });
  const totHits = S.track.reduce((a, x) => a + x.hits5, 0);
  $("#query").innerHTML = `<span class="prompt">&gt;</span> held_out <span class="pipe">|&gt;</span> <span class="fn">filter</span>(class == ${c}) <span class="pipe">|&gt;</span> <span class="fn">slice_min</span>(our_rank, n = 15)<span class="tibble">## the model never saw this class while training</span>`;
  const body = t.rows.map(([name, col, tid, rk, er, ar, pred, act]) => {
    const ap = ar == null ? null : Math.round(100 * (1 - (ar - 1) / t.n));
    return `<tr><td class="rk">${rk}</td><td class="name">${esc(name)}</td><td class="left">${schHTML(tid, col)}</td>
      <td>${er == null ? "—" : er}</td><td style="--heat:${heatColor(ap)}"><b>${ar == null ? "—" : Math.round(ar)}</b></td>
      <td>${sgn(pred, 2)}</td><td>${sgn(act, 2)}</td></tr>`;
  }).join("");
  $("#main").innerHTML = `<div class="note"><b>Class of ${c}:</b> ${t.hits5} of our top 5 finished in the class's top 10 by actual college RAPM NET (${t.n} players with college careers).
    Across ${S.track.length} classes, ${totHits} of ${S.track.length * 5} top-5 picks did. Each class is ranked by a model that never saw it.</div>
    <div class="tablewrap"><table id="track"><thead><tr class="grprow"><th colspan="3">Our ranking (before college)</th><th>ESPN</th><th colspan="3">What happened</th></tr>
    <tr><th class="nosort">Our Rk</th><th class="nosort">Player</th><th class="nosort">College</th><th class="nosort">Rk</th>
    <th class="nosort" title="Rank in the class by actual career RAPM NET">Actual Rk</th><th class="nosort" title="Projected RAPM NET">Proj</th><th class="nosort" title="Actual career RAPM NET">Actual</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

/* ── Player card ──────────────────────────────────────────────────────── */
async function renderPlayer(st) {
  $("#controls").innerHTML = "";
  $("#query").innerHTML = "";
  const r = S.byKey.get(st.p);
  if (!r) { $("#main").innerHTML = `<div class="errbox">No player found for that link. <a href="#view=board">Back to the prospects</a></div>`; return; }
  document.title = `${r.name} · Grassroots WBB`;
  if (!S.chunks[r.class_year]) {
    $("#main").innerHTML = '<div class="loading">Loading player…</div>';
    try { S.chunks[r.class_year] = await getJSON(`p_${r.class_year}.json`); }
    catch (e) { $("#main").innerHTML = `<div class="errbox">Couldn't load this profile (${esc(e.message)}).</div>`; return; }
    if (getState().p !== st.p) return;       // navigated away while loading
  }
  const P = S.chunks[r.class_year][r.key] || null;
  $("#main").innerHTML = cardHTML(r, P);
}

function classRank(r, k) {
  const v = r[k];
  if (v == null) return null;
  return S.rows.filter(x => x.class_year === r.class_year && x[k] != null && x[k] > v).length + 1;
}

function cardHTML(r, P) {
  const tc = r.tid ? teamColor(r.tid) : "#8a3f12";
  const m = r.tid ? S.meta.schools[r.tid] : null;
  const tc2 = m && /^[0-9a-f]{6}$/i.test(m[2]) ? "#" + m[2] : tc;
  const where = r.school_src === "enrolled" ? "Plays at" : r.school_raw ? "Committed to" : null;
  const schoolBit = where ? `${where} ${schHTML(r.tid, r.school_raw)}${statusTags(r.school_src)}` : "Uncommitted";
  const n = S.rows.filter(x => x.class_year === r.class_year).length;
  const logo = r.tid ? `<img class="logo" src="${logoURL(r.tid)}" alt="${esc(schoolName(r.tid) || "")}" onerror="this.remove()">` : "";
  const banner = `<div class="banner">${logo}<div class="who">
    <a class="back" href="#view=board&c=${r.class_year}">← Class of ${r.class_year} prospects</a>
    <h1><span class="rk">#${r.rk}</span>${esc(r.name)}${r.intl ? '<span class="tag t-intl">INTL</span>' : ""}</h1>
    <div class="meta"><span>Class of ${r.class_year}</span>${r.pos ? `<span>${esc(r.pos)}</span>` : ""}${r.ht ? `<span>${esc(r.ht)}</span>` : ""}
      <span>${esc(r.circuits || "")}</span>${P ? `<span>${P.avg.gp} games</span>` : ""}<span>${schoolBit}</span></div></div>
    <div class="chips">
      <span class="chip">Our rank <b>#${r.rk}</b> of ${n.toLocaleString()}</span>
      <span class="chip">ESPN <b>${r.espn_rank == null ? "unranked" : "#" + r.espn_rank}</b>${r.espn_grade ? ` · grade ${r.espn_grade}` : ""}</span>
      ${r.vs_espn == null ? "" : `<span class="chip">vs ESPN <b class="${r.vs_espn > 0 ? "up" : r.vs_espn < 0 ? "dn" : ""}">${sgn(r.vs_espn, 0)}</b></span>`}
    </div></div>`;

  const tiles = P ? tilesHTML(P) : "";
  const proj = projHTML(r);
  const radar = radarHTML(r, tc, tc2);
  const stand = P ? standHTML(P) : "";
  const resume = P ? resumeHTML(P) : "";
  const bars = P ? barsHTML(P) : `<div class="pnl full">No grassroots box scores on file for this player.</div>`;
  const events = P ? eventsHTML(P) : "";
  return `<article class="card" style="--tc:${tc};--tc2:${tc2}">${banner}${tiles}
    <div class="cgrid">${proj}${radar}${stand}${resume}${bars}${events}</div>
    <div class="cardfoot">Percentiles compare her career grassroots averages with ${S.meta.pool_n.toLocaleString()} prospects who have 6+ games on file. Projection ranks and percentiles are within the class of ${r.class_year}.</div></article>`;
}
function resumeHTML(P) {
  const ev = P.events;
  const seasons = ev.map(e => e[0]).filter(Boolean);
  const circuits = [...new Set(ev.map(e => e[2]).filter(Boolean))];
  const teams = [...new Set(ev.map(e => e[4]).filter(Boolean))];
  const usa = teams.includes("USA");
  const fiba = circuits.includes("FIBA-W");
  const row = (k, v) => `<div><span class="rl">${k}</span><span>${v}</span></div>`;
  return `<section class="pnl stand"><h3>Resume<span class="sub">what's on file</span></h3>
    ${row("Seasons", seasons.length ? `${Math.min(...seasons)}–${Math.max(...seasons)}` : "—")}
    ${row("Events", `${ev.length} (${P.avg.gp} games)`)}
    ${row("Circuits", esc(circuits.join(", ")) || "—")}
    ${row("Teams", esc(teams.slice(-4).join(", ")) + (teams.length > 4 ? ` +${teams.length - 4}` : ""))}
    ${fiba ? row("FIBA", usa ? "<b>Team USA</b>" : "International team") : ""}
    ${P.best ? row("Best event", `<b>${num(P.best[2], 1)} ppg</b> at ${esc(P.best[0])} (${P.best[1]}, ${P.best[3]} games)`) : ""}
  </section>`;
}

const TILE = [["pts", "PTS", 1], ["reb", "REB", 1], ["ast", "AST", 1], ["stl", "STL", 1], ["ts", "TS%", 1], ["tp", "3P%", 1], ["ft", "FT%", 1]];
function tilesHTML(P) {
  return `<div class="tiles">${TILE.map(([k, l, d]) => {
    const p = P.pct[k];
    let sub = p == null ? "—" : `${ord(p)} pct`;
    if (k === "tp" && P.shoot[1]) sub = `${Math.round(P.shoot[0])}-${Math.round(P.shoot[1])} · ${p == null ? "—" : ord(p)}`;
    if (k === "ft" && P.shoot[3]) sub = `${Math.round(P.shoot[2])}-${Math.round(P.shoot[3])} · ${p == null ? "—" : ord(p)}`;
    return `<div class="tile"${heatVar(p)}><div class="k">${l}</div><div class="v">${num(P.avg[k], d)}</div><div class="p">${sub}</div></div>`;
  }).join("")}</div>`;
}
function projHTML(r) {
  const items = [["rapm", "RAPM", "On/off impact (ranking metric)"], ["orapm", "ORAPM", "Offense"], ["drapm", "DRAPM", "Defense"], ["wbpm", "WBPM-C", "Box impact"]];
  return `<section class="pnl"><h3>College projection<span class="sub">career impact per 100 possessions</span></h3>
    <div class="proj">${items.map(([k, l, s]) => {
      const p = r[k + "_p"], rk = classRank(r, k);
      return `<div${heatVar(p)}><div class="lbl" title="${s}">${l}</div><div class="big">${sgn(r[k], 2)}</div>
        <div class="sm">${rk ? `#${rk} in class` : "—"}${p == null ? "" : ` · ${ord(p)}`}</div></div>`;
    }).join("")}</div>
    <div class="projline">Skill grade <b>${r.grade_overall ?? "—"}</b>/100 overall${r.espn_rank != null ? ` · ESPN has her <b>#${r.espn_rank}</b>, we have her <b>#${r.rk}</b>` : ` · not on ESPN's list; we have her <b>#${r.rk}</b>`}.</div></section>`;
}
function standHTML(P) {
  const lab = Object.fromEntries(S.meta.metrics.map(m => [m[0], m[1]]));
  const top = Object.entries(P.pct).filter(([, p]) => p != null && p >= 70).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const fmt = k => ["ts", "tp", "ft", "usg"].includes(k) ? num(P.avg[k], 1) : k === "ato" ? num(P.avg[k], 2) : k === "bpm" ? sgn(P.avg[k], 1) : num(P.avg[k], 1);
  return `<section class="pnl stand"><h3>Stands out<span class="sub">vs grassroots peers</span></h3>${top.length
    ? top.map(([k, p]) => `<div><span class="pp"${heatVar(p)}>${ord(p)}</span><span>${esc(lab[k])} (${fmt(k)})</span></div>`).join("")
    : '<div class="muted">No stat at the 70th percentile or above yet.</div>'}</section>`;
}
function barsHTML(P) {
  const groups = {};
  for (const [k, l, g] of S.meta.metrics) (groups[g] = groups[g] || []).push([k, l]);
  const fmt = k => ["ts", "tp", "ft", "usg"].includes(k) ? num(P.avg[k], 1) : k === "ato" ? num(P.avg[k], 2) : k === "bpm" ? sgn(P.avg[k], 1) : num(P.avg[k], 1);
  return `<section class="pnl full"><h3>Grassroots percentiles<span class="sub">per game, career</span></h3><div class="bars">${Object.entries(groups).map(([g, ms]) =>
    `<div><h4>${esc(g)}</h4>${ms.map(([k, l]) => {
      const p = P.pct[k];
      const fill = p == null ? "" : `<div class="bfill" style="width:${p}%;background:${barHeat(p)}"></div><div class="bdot" style="left:${Math.max(6, Math.min(94, p))}%;background:${heatColor(p)}">${p}</div>`;
      return `<div class="brow"><span>${esc(l)}</span><div class="btrack">${fill}</div><span class="bv">${fmt(k)}</span></div>`;
    }).join("")}</div>`).join("")}</div></section>`;
}
function radarHTML(r, tc, tc2) {
  const ax = [["grade_shoot3", "3PT shooting"], ["grade_shoot2", "2PT scoring"], ["grade_passing", "Passing"], ["grade_rebound", "Rebounding"], ["grade_defense", "Defense"]];
  if (ax.every(([k]) => r[k] == null)) return "";
  const W = 230, C = W / 2, R = 78;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / ax.length;
    return [C + Math.cos(a) * R * v / 100, C + Math.sin(a) * R * v / 100];
  };
  const rings = [25, 50, 75, 100].map(v => `<polygon points="${ax.map((_, i) => pt(i, v).join(",")).join(" ")}" fill="none" stroke="${v === 50 ? "#999" : "#ddd"}" stroke-width="1"/>`).join("");
  const spokes = ax.map((_, i) => `<line x1="${C}" y1="${C}" x2="${pt(i, 100)[0]}" y2="${pt(i, 100)[1]}" stroke="#ddd"/>`).join("");
  const poly = ax.map(([k], i) => pt(i, r[k] ?? 0).join(",")).join(" ");
  const labels = ax.map(([, l], i) => {
    const [x, y] = pt(i, 122);
    return `<text x="${x}" y="${y}" fill="#000" font-size="10" font-family="Verdana, sans-serif" text-anchor="middle" dominant-baseline="middle">${l}</text>`;
  }).join("");
  return `<section class="pnl"><h3>Skill grades<span class="sub">0–100 percentile · 50th ring in grey · outward = better</span></h3>
    <div class="radarwrap"><svg width="${W}" height="${W}" viewBox="-20 -10 ${W + 40} ${W + 20}" role="img" aria-label="Skill grade radar">
      ${rings}${spokes}<polygon points="${poly}" fill="${tc}" fill-opacity=".22" stroke="${tc}" stroke-width="2"/>${labels}</svg>
      <div class="glist">${ax.map(([k, l]) => `<div><b${heatVar(r[k])}>${r[k] ?? "—"}</b>${l}</div>`).join("")}
        <div><b${heatVar(r.grade_overall)}>${r.grade_overall ?? "—"}</b>Overall</div></div></div></section>`;
}
function eventsHTML(P) {
  const ev = P.events.slice().reverse();
  const pct = v => v == null ? "—" : num(v <= 1 ? v * 100 : v, 1);
  return `<section class="pnl full"><h3>Event log<span class="sub">per game, newest first</span></h3><div class="tablewrap"><table class="evt">
    <thead><tr><th class="l">Season</th><th class="l">Event</th><th class="l">Circuit</th><th class="l">Team</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>
    <tbody>${ev.map(e => {
      const [season, event, circuit, age, team, g, mn, pts, reb, ast, stl, blk, tov, fg, tp, ft] = e;
      return `<tr><td class="l">${season}</td><td class="l">${esc(event)}</td><td class="l">${esc(circuit)}${age ? ` · ${esc(age)}` : ""}</td><td class="l">${esc(team)}</td>
        <td>${g}</td><td>${num(mn, 1)}</td><td><b>${num(pts, 1)}</b></td><td>${num(reb, 1)}</td><td>${num(ast, 1)}</td><td>${num(stl, 1)}</td><td>${num(blk, 1)}</td><td>${num(tov, 1)}</td>
        <td>${pct(fg)}</td><td>${pct(tp)}</td><td>${pct(ft)}</td></tr>`;
    }).join("")}</tbody></table></div></section>`;
}

boot();
