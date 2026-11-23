// Draws the office in a browser window, the way main.js draws it in Herdr: the open-plan floor of
// four-seat islands, one office per screenful (tabs when there are more), newcomers walking in at
// the door, idle errands, the clock and the sky. Geometry and seating come from logic.js; the
// seat map is the panel's own (shared.json), read but never written, so both show the same seats.
// Read-only apart from showing an agent in Herdr: the right-click menus, naming, starting agents
// and meetings stay in the Herdr panel.

import {
  SCENE_W, WALL_H, LOUNGE_H, FILL_H, MEET_H, MEET_SEATS, POSE_H, STATUS, ORDER, WALK, ERRANDS, ERRAND_MS,
  POD_W, POD_H, PODS_PER_ROW, SEATS_PER_POD, DOOR, DESK_PAD,
  toolOf, meetingOn, paletteOf, task, spot, windowName, tokens, resetsIn, pickLayout,
  seatAt, podRect, assignSeats, podsPerOffice, tagWidth, packTags, errandSpot, phaseAt, clockText, nextInQueue,
} from "/logic.js";

// ---------- what main.js keeps to itself (copied as is; keep them in step) ----------

const STYLES = [
  { id: "modern", ui: { label: "#ffffffe6", labelBorder: "#d1d1d6", text: "#3a3a3c", plate: "#ffffff", wall: "#d6e8efd9", wallBorder: "#a7adb4" } },
  { id: "cozy", ui: { label: "#fffaf0e6", labelBorder: "#3b2a1e", text: "#5b4330", plate: "#fffaf0", wall: "#a8794e", wallBorder: "#3b2a1e" } },
  { id: "night", ui: { label: "#1c1c1ee6", labelBorder: "#4a4f5a", text: "#d8d8dc", plate: "#2c2c2e", wall: "#2a3a55d9", wallBorder: "#4a4f5a" } },
];
const RUGS = ["#6f9fd8", "#7fb07a", "#e9a24a", "#d9727a", "#a98bd6", "#5fb3b0"];
// The roster at its tallest (five rows, then it scrolls), and the office tabs row.
const ROSTER_MAX = 5 * 28 + 12, TABS_H = 30;
// The night style is always night; the others follow the clock unless the person turned it off.
const phaseNow = (style, daynight, hour) => style === "night" ? "night"
  : (daynight ?? "auto") !== "auto" ? "day"
  : phaseAt(hour == null ? new Date() : new Date(2000, 0, 1, hour));

// ---------- state ----------

const $ = (id) => document.getElementById(id);
const R = Math.round;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Only touch the DOM when something changed, so running animations aren't restarted.
const setHtml = (el, html) => { if (el._html !== html) { el._html = html; el.innerHTML = html; } };

let data = null;
let stageW = 380, stageH = 640;
let floor = 0, demoFloor = null, tabsShown = false, lastFocus;
let clock = clockText();
const last = {}, walking = {};
// Idle agents' errands (address -> { kind, with, until }), since when each has rested, and who is
// in which office (for errands, tabs and the roster).
const errands = {}, rested = {};
let officeOf = {};
// Newcomers standing in the doorway (address -> since); everyone in at the first look just is.
const entering = {};
let seen = null;
// Seats for an office size the panel hasn't saved: kept here while the window is open.
const ownSeats = {};

// ---------- usage ----------

const mask = (url, color) => `<i class="mask" style="--m:url('${url}');background:${color}"></i>`;

function gauge(label, used, resetsAt) {
  const rest = Math.max(0, Math.min(100, 100 - R(used)));
  const color = rest <= 15 ? "var(--blocked)" : rest <= 40 ? "var(--working)" : "var(--ok)";
  const tip = `剩 ${rest}%（已用 ${R(used)}%）${resetsAt ? `，${resetsIn(resetsAt)}` : ""}`;
  return `<div class="gauge" title="${esc(tip)}"><div class="ring">${mask("/img/ring-track.svg", "var(--raised)")}${mask(`/img/ring-${rest}.svg`, color)}<span>${rest}%</span></div>${esc(label)}</div>`;
}

function counter(value, label, tip) {
  return `<div class="gauge" title="${esc(tip ?? "")}"><div class="ring">${mask("/img/ring-track.svg", "var(--raised)")}<span class="count">${esc(value)}</span></div>${esc(label)}</div>`;
}

function renderUsage(u) {
  if (!u) return setHtml($("usage"), `<div class="note">讀取用量中…</div>`);
  const list = u.providers ?? [];
  if (!list.length) return setHtml($("usage"), `<div class="note">最近一週沒有偵測到 Claude Code、Codex 或 agy 的使用紀錄</div>`);
  const groups = list.map((p) => {
    const figures = p.windows?.length
      ? p.windows.map((w) => gauge(w.label ?? windowName(w.minutes), w.used, w.resets_at)).join("")
      : p.count
        ? counter(p.count.value, p.count.label, p.detail)
        : `<div class="note" style="height:40px">沒有額度資料</div>`;
    const plan = p.plan ? ` · ${p.plan[0].toUpperCase()}${p.plan.slice(1)}` : "";
    const tip = p.windows?.length ? p.detail?.replace(/(\d{4,})/g, (n) => tokens(Number(n))) : null;
    const src = `/herdr/${encodeURI(p.icon ?? "")}`;
    const icon = p.tint ? `<span class="icon">${mask(src, esc(p.tint))}</span>` : `<img class="icon" src="${esc(src)}" alt="">`;
    return `<div class="provider"${tip ? ` title="${esc(tip)}"` : ""}><div class="name">${icon}<span>${esc(p.name + plan)}</span></div><div class="gauges">${figures}</div></div>`;
  });
  setHtml($("usage"), groups.join(`<div class="sep"></div>`));
}

// ---------- figures ----------

const sprite = (pose, pal, s) => `<img src="/img/${pose}-${pal}.svg" style="width:${R(16 * s)}px;height:${R(POSE_H[pose] * s)}px" alt="">`;
// Two frames, the second blinking in and out over the first.
const flip = (a, b, w, h, period) => `<div class="flip" style="width:${w}px;height:${h}px;--p:${period}ms">${a}<div class="b">${b}</div></div>`;
const bob = (inner, w, h, period, d) => `<div style="position:relative;width:${w}px;height:${h}px"><div class="bob" style="--p:${period}ms;--d:${d}px">${inner}</div></div>`;

function figure(pose, pal, s) {
  const w = R(16 * s), h = R(21 * s);
  if (pose === "walk") return bob(flip(sprite("walkA", pal, s), sprite("walkB", pal, s), w, h, 360), w, h, 300, -1.5 * s);
  if (pose === "type") return flip(sprite("typeA", pal, s), sprite("typeB", pal, s), w, R(16 * s), 500);
  // Facing us behind a monitor: only the head shows, nodding along as it types.
  if (pose === "typeFront") return bob(sprite("typeFront", pal, s), w, R(16 * s), 520, -0.7 * s);
  if (pose === "wave") return flip(sprite("waveA", pal, s), sprite("waveB", pal, s), w, h, 600);
  if (pose === "cheer") return bob(sprite("cheer", pal, s), w, h, 600, -3 * s);
  return sprite(pose, pal, s);
}

function sign(a) {
  const st = STATUS[a.status];
  if (!st?.mark) return "";
  return `<div class="extra sign${a.status === "blocked" ? " pulse" : ""}" style="background:var(--${a.status})">${st.mark} ${st.label}</div>`;
}

const chip = (ui) => `background:${ui.label};border:1px solid ${ui.labelBorder};color:${ui.text}`;
const zone = (text, x, y, s, ui) => `<div class="zone" style="left:${R(x * s)}px;top:${R(y * s)}px;${chip(ui)}">${text}</div>`;

// ---------- the room ----------

// The floor plan: walls (with the sky of the hour), the floor under the islands, the meeting room
// and the lounge.
function room(L, rows, s, style, phase) {
  const px = (n) => R(n * s);
  const img = (name, h) => `<img src="/img/${style}/${name}.svg" style="width:${px(SCENE_W)}px;height:${px(h)}px;flex:none" alt="">`;
  const sky = phase === "day" || style === "night" ? "" : `-${phase}`;
  const pad = `<div style="width:${px(SCENE_W)}px;height:${px(DESK_PAD)}px;flex:none;overflow:hidden">${img("floor", POD_H)}</div>`;
  const desks = `<div class="col" style="width:${px(SCENE_W)}px;flex:none">${img(`wall${sky}`, WALL_H)}${img("floor", POD_H).repeat(rows)}${pad}${L.meet ? img("meeting", MEET_H) : ""}${L.wide ? "" : img("lounge", LOUNGE_H)}</div>`;
  if (!L.wide) return desks;
  const fills = Math.max(0, Math.ceil((L.h - WALL_H - LOUNGE_H) / FILL_H));
  const lounge = `<div class="col" style="width:${px(SCENE_W)}px;height:${px(L.h)}px;flex:none;overflow:hidden">${img(`wall-lounge${sky}`, WALL_H)}${img("lounge-open", LOUNGE_H)}${img("lounge-fill", FILL_H).repeat(fills)}</div>`;
  return `<div class="row">${desks}${lounge}</div>`;
}

// Each claimed island's rug, in its space's color.
function rugs(owner, colors, s) {
  const px = (n) => R(n * s);
  return Object.entries(owner).map(([pod, space]) => {
    const r = podRect(Number(pod)), c = colors[space] ?? RUGS[0];
    return `<div class="abs" style="left:${px(r.x)}px;top:${px(r.y)}px;width:${px(r.w)}px;height:${px(r.h)}px;border-radius:${px(4)}px;background:${c}40;border:${Math.max(1, R(s))}px solid ${c}aa"></div>`;
  }).join("");
}

// The islands (under everyone, hover names the space) or the far monitors' backs (`front`, over
// the people sitting behind them).
function pods(n, s, style, front = false, label = {}) {
  const px = (v) => R(v * s);
  return Array.from({ length: n }, (_, pod) => {
    const r = podRect(pod);
    const tip = !front && label[pod] ? ` title="${esc(label[pod])}"` : "";
    return `<img class="abs" src="/img/${style}/${front ? "podfront" : "pod"}.svg"${tip} style="left:${px(r.x)}px;top:${px(r.y - 1)}px;width:${px(POD_W)}px;height:${px(POD_H)}px" alt="">`;
  }).join("");
}

// The wall between the two rooms when they sit side by side, with a door.
function divider(L, s, ui) {
  const seg = (y, h) => `<div class="abs" style="left:${R((SCENE_W - 3) * s)}px;top:${R(y * s)}px;width:${R(5 * s)}px;height:${R(h * s)}px;background:${ui.wall};border:1px solid ${ui.wallBorder}"></div>`;
  const door = WALL_H + 64, gap = 30;
  return seg(WALL_H - 2, door - WALL_H + 2) + seg(door + gap, L.h - door - gap + 2);
}

// Evening light: a warm tint at sunset; at night (day styles only) the room dims, the floor lamp
// glows, and so does each working screen: a near one lights the desk, a far one its reader's face.
function light(L, phase, s, placed, style) {
  const px = (n) => R(n * s);
  const box = (x, y, w, h, bg, r = 0) => `<div class="abs" style="left:${px(x)}px;top:${px(y)}px;width:${px(w)}px;height:${px(h)}px;border-radius:${px(r)}px;background:${bg}"></div>`;
  const dim = style !== "night";
  let out = "";
  if (phase === "dusk") out += box(0, 0, L.w, L.h, "#ff8a3d14");
  if (phase === "night" && dim) out += box(0, 0, L.w, L.h, "#0a123048");
  if (phase !== "night") return out;
  if (dim) for (const [r, a] of [[26, "14"], [16, "1c"]]) out += box(L.lo.x + 123 - r, L.lo.y + 30 - r, r * 2, r * 2, `#ffe39a${a}`, r);
  for (const p of placed) {
    if (p.a.status !== "working" || p.meeting || p.talk || p.seat == null) continue;
    const q = seatAt(p.seat);
    out += q.north ? box(q.x - 14, q.top, 28, 24, "#79c0ff1a", 10) : box(q.x - 17, q.top + 22, 34, 22, "#79c0ff1f", 10);
  }
  return out;
}

// A working near monitor runs: lines of code scroll past and a cursor blinks (a far seat's
// monitor shows its back).
function screen(a, seat, s) {
  if (a.status !== "working" || seatAt(seat).north) return "";
  const p = seatAt(seat);
  const W = R(18 * s), H = R(9 * s), u = Math.max(1, R(s));
  const COLORS = ["#7ee787", "#79c0ff", "#d2a8ff", "#ffa657", "#c9d1d9", "#79c0ff", "#7ee787", "#c9d1d9"];
  const seed = paletteOf(a.address);
  const lines = Array.from({ length: 12 }, (_, i) => {
    const k = (i * 7 + seed * 3) % 10;
    return `<div class="row" style="height:${u}px;gap:${u}px"><div style="width:${u * (1 + (k % 3))}px"></div>`
      + `<div style="width:${R(W * (0.25 + (k % 5) * 0.11))}px;background:${COLORS[(i + seed) % COLORS.length]}"></div>`
      + (k % 2 === 0 ? `<div style="width:${R(W * 0.15)}px;background:${COLORS[(i + seed + 3) % COLORS.length]}"></div>` : "")
      + `</div>`;
  }).join("");
  return `<div class="screen" style="left:${R((p.x - 9) * s)}px;top:${R((p.top + 28) * s)}px;width:${W}px;height:${H}px">`
    + `<div class="lines col" style="left:${u}px;gap:${u}px;--p:${5200 + seed * 400}ms;--d:${-12 * 2 * u + H - u}px">${lines}</div>`
    + `<div class="cursor" style="right:${u * 2}px;bottom:${u}px;width:${u * 2}px;height:${u * 2}px"></div></div>`;
}

// The name on a desk, so an empty chair still says whose it is: under a near seat, on the back of
// the monitor for a far one.
function plate(a, seat, s, name, ui) {
  const p = seatAt(seat);
  const w = R(40 * s);
  return `<div class="plate" style="left:${R(p.x * s - w / 2)}px;top:${R((p.top + (p.north ? 15 : 71)) * s)}px;width:${w}px">`
    + `<div style="background:${ui.plate};border:1px solid ${ui.labelBorder};color:${ui.text}${name ? ";font-weight:600" : ""}">${esc(name || task(a) || a.space_name)}</div></div>`;
}

// A clock on the wall: the real time (or the preview's hour), a sun or a moon by it.
function wallClock(phase, s, ui, demoHour) {
  const color = phase === "night" ? "#8aa0d6" : phase === "dusk" ? "#e07a3a" : "#e0a020";
  const text = demoHour != null ? `${String(demoHour).padStart(2, "0")}:00` : clock;
  return `<div class="zone" style="left:${R(158 * s)}px;top:${R(6 * s)}px;gap:3px;padding:0 6px;${chip(ui)}"><span style="color:${color}">${phase === "night" ? "☾" : "☀"}</span>${text}</div>`;
}

// Which rug is which space: a tag per space on the wall left of the door, at most two lines; the
// rest fold into a "+N" chip that lists them.
function spaceLegend(spaces, colors, counts, s, ui) {
  const width = R(82 * s);
  const shown = packTags(spaces.map(([, name]) => tagWidth(name)), width);
  const rest = spaces.slice(shown);
  const tags = spaces.slice(0, shown).map(([space, name]) =>
    `<div class="tag" title="${esc(`${name} · ${counts[space] ?? 0} 位`)}" style="max-width:${width}px;background:${colors[space]}">${esc(name)}</div>`).join("");
  const more = rest.length
    ? `<div class="tag" title="${esc(rest.map(([space, name]) => `${name} · ${counts[space] ?? 0} 位`).join("\n"))}" style="${chip(ui)}">+${rest.length}</div>`
    : "";
  return `<div class="legend" style="left:${R(4 * s)}px;top:${R(6 * s)}px;max-width:${width}px">${tags}${more}</div>`;
}

// ---------- characters ----------

// Characters keep their element between polls, so a move to a new spot is animated.
function actor(layer, seen, id, cls, left, top, w, h, inner, onClick) {
  seen.add(id);
  let el = layer.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) {
    el = document.createElement("div");
    el.dataset.id = id;
    el.className = cls;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    if (onClick) el.addEventListener("click", onClick);
    layer.appendChild(el);
  }
  Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
  setHtml(el, inner);
  return el;
}

function prune(layer, seen) {
  for (const el of [...layer.children]) if (!seen.has(el.dataset.id)) el.remove();
}

// ---------- offices ----------

// The height the office size is worked out for: the stage as if the roster were full and the
// office tabs shown, so neither a newcomer nor the tabs appearing changes the size.
function capHeight(n) {
  const roster = n > 0 ? Math.min(n * 28 + 12, ROSTER_MAX) : ROSTER_MAX;
  return stageH - (ROSTER_MAX - roster) - (tabsShown ? 0 : TABS_H);
}

// Who is in which office, and which office is shown. Seats: the panel's map for this office size
// when it has one, else the window's own, both kept stable by assignSeats.
function plan(d) {
  const list = d.agents;
  const cap = podsPerOffice({ stageW, stageH: capHeight(list.length), pref: d.layout ?? "auto" });
  const key = `${d.demo ? "demo:" : ""}${Number.isFinite(cap) ? cap : "all"}`;
  const reserve = (d.reserved ?? []).filter((r) => r.cap === cap && r.until > Date.now());
  const A = assignSeats(list, ownSeats[key] ?? d.seats?.[key] ?? {}, cap, reserve);
  if (!d.seats?.[key]) ownSeats[key] = A.seats;
  const per = cap * SEATS_PER_POD;
  officeOf = {};
  for (const a of list) officeOf[a.address] = Math.floor(A.seats[a.address] / per);
  const offices = Math.max(1, ...Object.values(officeOf).map((o) => o + 1));
  // Follow the agent picked in Herdr: show its office once, when the pick changes (as main.js).
  const focus = list.find((a) => a.focused)?.address ?? null;
  if (focus !== lastFocus) {
    lastFocus = focus;
    const m = meetingOn(d.meeting) ? d.meeting : null;
    if (focus) floor = m?.participants.includes(focus) ? 0 : officeOf[focus] ?? floor;
  }
  floor = Math.max(0, Math.min(floor, offices - 1));
  return { cap, A, per, offices, floor };
}

const goTo = (address) => { const f = officeOf[address]; if (f != null && f !== floor) { floor = f; render(); } };

// The offices as tabs above the room: "1F · 8"; one where somebody waits gets a blinking dot.
function renderTabs(list, P) {
  const el = $("tabs");
  el.style.display = P.offices > 1 ? "flex" : "none";
  if (P.offices <= 1) return setHtml(el, "");
  const by = Array.from({ length: P.offices }, () => ({ n: 0, blocked: 0 }));
  for (const a of list) { const o = by[officeOf[a.address]]; if (!o) continue; o.n++; if (a.status === "blocked") o.blocked++; }
  setHtml(el, by.map((o, i) => `<div class="tab${i === P.floor ? " on" : ""}" data-floor="${i}" title="${i + 1} 樓：${o.n} 位${o.blocked ? `，${o.blocked} 位等你回覆` : ""}">`
    + `<b>${i + 1}F</b><span>${o.n}</span>${o.blocked ? `<i class="wait"></i>` : ""}</div>`).join(""));
}

// Newcomers walk in through the door: on the first render they stand in the doorway, a moment
// later at their seat. Whoever is in when the window opens is simply there.
function arrivals(list) {
  const now = Date.now();
  if (!seen) { seen = new Set(list.map((a) => a.address)); return; }
  for (const a of list) if (!seen.has(a.address)) { seen.add(a.address); entering[a.address] = now; }
}

function renderScene(d, P) {
  const all = d.agents;
  arrivals(all);
  const style = (STYLES.find((x) => x.id === d.style) ?? STYLES[0]).id;
  const ui = (STYLES.find((x) => x.id === style)).ui;
  const { A } = P;
  const base = P.floor * P.per;
  const m = meetingOn(d.meeting) ? d.meeting : null;
  // A meeting is held on the first floor: its participants show there, whichever office is theirs.
  const meets = (a) => !!m && m.participants.includes(a.address);
  const list = all.filter((a) => (meets(a) ? P.floor === 0 : officeOf[a.address] === P.floor));
  const local = (a) => (officeOf[a.address] === P.floor ? A.seats[a.address] - base : null);
  const owner = {};
  for (const [pod, space] of Object.entries(A.owner)) if (Math.floor(Number(pod) / P.cap) === P.floor) owner[Number(pod) - P.floor * P.cap] = space;
  const rows = Math.max(1, Math.ceil(Math.max(0, ...Object.keys(owner).map((p) => Number(p) + 1)) / PODS_PER_ROW));
  const chairs = m ? m.participants.filter((x) => list.some((a) => a.address === x)) : [];
  const L = pickLayout({ stageW, stageH, rows, meet: chairs.length > 0, pref: d.layout ?? "auto" });
  const s = L.s, lo = L.lo, mo = L.mo;
  const phase = phaseNow(style, d.daynight, d.demoHour);
  const count = { working: 0, blocked: 0, done: 0, idle: 0 };
  const placed = list.map((a) => {
    const seat = local(a);
    const chair = chairs.indexOf(a.address);
    if (chair >= 0) {
      const [x, y, pose] = MEET_SEATS[chair];
      return { a, seat, meeting: true, place: [mo.x + x, mo.y + y, pose] };
    }
    const key = a.status in count ? a.status : "idle";
    return { a, seat, place: spot({ ...a, status: key }, seat, count[key]++, lo) };
  });
  // Whoever just messaged a teammate walks over and stands beside it.
  const talkOf = {};
  for (const x of d.talks ?? []) talkOf[x.from] = x;
  const at = Object.fromEntries(placed.map((p) => [p.a.address, p]));
  for (const p of placed) {
    const x = talkOf[p.a.address], to = x && at[x.to];
    if (!to || p.meeting || to === p) continue;
    p.talk = x;
    p.place = [Math.min(to.place[0] + 17, L.w - 9), to.place[1] - (to.place[2] === "type" ? 2 : 3), "stand"];
  }
  // Idle agents out on an errand. Their sofa stays theirs, so nobody else shuffles over.
  let atWindow = 0;
  for (const p of placed) {
    const e = errands[p.a.address];
    if (!e || p.meeting || p.talk || p.a.status !== "idle") continue;
    const place = errandSpot(e.kind, lo, e.kind === "window" ? atWindow++ : 0, e.with ? at[e.with]?.place : null);
    if (!place) continue;
    p.place = [Math.min(place[0], L.w - 9), place[1], place[2]];
    p.errand = e;
  }
  // Newcomers start in the doorway.
  for (const p of placed) if (entering[p.a.address] && !p.meeting) p.place = [DOOR[0], DOOR[1], "stand"];
  // Same layout, scale and office as last time and a new spot: the agent walks there.
  const key = `${L.wide ? "w" : "t"}${R(s * 100)}f${P.floor}`;
  const now = Date.now();
  for (const p of placed) {
    const prev = last[p.a.address], here = `${R(p.place[0])},${R(p.place[1])}`;
    if (prev && prev.key === key && prev.at !== here) walking[p.a.address] = now + WALK.duration;
    last[p.a.address] = { key, at: here };
  }
  const names = d.names ?? {};
  const interns = d.interns ?? {};
  const colors = {};
  for (const a of all) colors[a.space] ??= RUGS[Object.keys(colors).length % RUGS.length];
  const counts = {};
  for (const a of list) counts[a.space] = (counts[a.space] ?? 0) + 1;
  const legend = [...new Map(list.map((a) => [a.space, a.space_name])).entries()];
  const spaceNames = Object.fromEntries(all.map((a) => [a.space, a.space_name]));
  const npods = rows * PODS_PER_ROW;
  const podLabel = Object.fromEntries(Object.entries(owner).map(([pod, space]) => [pod, `${spaceNames[space] ?? space} · ${counts[space] ?? 0} 位`]));
  // A far seat's plate sits on its monitor's back, shown only while its owner is away from it.
  const seated = (p) => p.place[2] === "typeFront" && !walking[p.a.address];
  const farPlates = placed.filter((p) => p.seat != null && seatAt(p.seat).north && !seated(p));

  const scene = $("scene");
  scene.style.width = `${R(L.w * s)}px`;
  scene.style.height = `${R(L.h * s)}px`;
  // Layers, back to front; separate so the clock ticking doesn't restart the monitors.
  if (!scene.firstChild) scene.innerHTML = ["floor", "props", "labels", "actors", "front", "interns"].map((id) => `<div id="${id}"></div>`).join("");

  setHtml($("floor"), room(L, rows, s, style, phase) + rugs(owner, colors, s) + pods(npods, s, style, false, podLabel)
    + (L.wide ? divider(L, s, ui) : "") + light(L, phase, s, placed, style));
  setHtml($("props"), placed.filter((p) => !p.meeting && !p.talk && p.seat != null).map((p) => screen(p.a, p.seat, s)).join("")
    + placed.filter((p) => p.seat != null && !seatAt(p.seat).north).map((p) => plate(p.a, p.seat, s, names[p.a.address], ui)).join(""));

  // What you just sent from the panel: a bubble over your desk, "你 → name：text".
  const here = new Set(list.map((a) => a.address));
  const mine = (d.talks ?? []).filter((x) => x.from === "you" && here.has(x.to)).slice(-2);
  const bubbles = mine.map((x, i) => {
    const to = names[x.to] ?? (task(at[x.to]?.a ?? {}) || toolOf(at[x.to]?.a ?? {}));
    return `<div class="yours" style="left:${R((lo.x + 40) * s)}px;top:${R((lo.y + 4) * s) + i * 22}px;width:${R(158 * s)}px"><div class="bubble">你 → ${esc(to)}：${esc(x.text)}</div></div>`;
  }).join("");
  const next = nextInQueue(list);
  const desk = `<div class="zone${next ? " link" : ""}" id="your-desk" data-next="${esc(next?.address ?? "")}"${next ? ` title="前往下一位：等最久的「等你回覆」優先"` : ""} style="left:${R((lo.x + 144) * s)}px;top:${R((lo.y + 114) * s)}px;${chip(ui)}">你的桌子</div>`;
  setHtml($("labels"), wallClock(phase, s, ui, d.demoHour)
    + (legend.length ? spaceLegend(legend, colors, counts, s, ui) : zone("工作區", 4, 6, s, ui))
    + zone("休息區", lo.x + 8, lo.y + 112, s, ui)
    + desk + bubbles
    + (L.meet ? zone("會議室", mo.x + 150, mo.y + 47, s, ui) : ""));

  const extra = (p) => {
    if (p.meeting && m.speaker === p.a.address) return `<div class="extra speaking">● ${m.status === "summarizing" ? "整理結論中" : "發言中"}</div>`;
    if (p.meeting) return "";
    if (p.talk) return `<div class="extra bubble">→ ${esc(names[p.talk.to] ?? toolOf(at[p.talk.to].a))}：${esc(p.talk.text)}</div>`;
    if (p.errand) {
      const label = ERRANDS[p.errand.kind].label;
      return label && !walking[p.a.address] ? `<div class="extra doing" style="${chip(ui)}">${label}</div>` : "";
    }
    return sign(p.a);
  };
  const layer = $("actors"), seenNow = new Set();
  // Farther back draws first, so nearer characters overlap them.
  [...placed].sort((p, q) => p.place[1] - q.place[1]).forEach((p, z) => {
    const { a } = p;
    const [x, y, finalPose] = p.place;
    const pose = walking[a.address] ? "walk" : finalPose;
    const w = R(16 * s), h = R((pose === "type" ? 16 : POSE_H[pose] ?? 21) * s);
    const name = names[a.address];
    const what = task(a) || a.space_name;
    const hover = `<div class="hover" style="border-color:var(--${a.status})"><div>${esc(name ? `${name} · ${what}` : what)}</div><small>點一下在 Herdr 裡前往</small></div>`;
    // The agent picked in Herdr: a ring at its feet and a mark over its head (above its sign).
    const ex = extra(p);
    const picked = a.focused ? `<div class="ring-pick" style="height:${Math.max(3, R(3 * s))}px"></div><div class="pick${ex ? " high" : ""}">▼</div>` : "";
    const el = actor(layer, seenNow, `ag-${a.address}-${key}`, "char", R(x * s - w / 2), R(y * s), w, h,
      picked + figure(pose, paletteOf(a.address), s) + `<div class="label">${hover}${ex}</div>`,
      () => { focusAgent(a.address); });
    el.style.zIndex = String(10 + z);
  });
  prune(layer, seenNow);

  setHtml($("front"), pods(npods, s, style, true) + farPlates.map((p) => plate(p.a, p.seat, s, names[p.a.address], ui)).join(""));

  // Subagents: smaller characters beside whoever started them; hover for the task.
  const ilayer = $("interns"), iseen = new Set();
  const OFF = [[-19, 0], [19, 0], [-28, 6], [28, 6]];
  let more = "";
  for (const p of placed) {
    const subs = interns[p.a.address] ?? [];
    subs.slice(0, 4).forEach((x, i) => {
      const k = 0.72, ks = s * k;
      const w = R(16 * ks), h = R(21 * ks);
      const [dx, dy] = OFF[i % OFF.length];
      const [px, py, ppose] = p.place;
      const top = py + (ppose === "type" ? 16 : POSE_H[ppose] ?? 21) - 21 * k + dy;
      const pal = paletteOf(x.id);
      const fig = x.status === "blocked"
        ? flip(sprite("waveA", pal, ks), sprite("waveB", pal, ks), w, h, 600)
        : x.status === "done"
          ? sprite("cheer", pal, ks)
          : x.status === "working" ? bob(sprite("stand", pal, ks), w, h, 700, -1.5 * s) : sprite("stand", pal, ks);
      // A click goes to the parent in Herdr: Claude Code's own subagents run inside its session.
      const parent = p.a.address;
      const el = actor(ilayer, iseen, `in-${x.id}-${key}`, "intern", R((px + dx) * s - w / 2), R(top * s), w, h, fig, () => focusAgent(parent));
      el.title = `${x.kind === "claude" ? "子代理" : "子 Agent"}（${x.type}）：${x.text}\n點一下前往主代理`;
    });
    if (subs.length > 4) {
      const [px, py] = p.place;
      more += `<div class="more" style="left:${R((px + 30) * s)}px;top:${R((py - 2) * s)}px;${chip(ui)}">+${subs.length - 4}</div>`;
    }
  }
  // "+3" chips go in a holder of their own, so the interns' elements aren't rebuilt.
  let holder = ilayer.querySelector("[data-id='more']");
  if (!holder) { holder = document.createElement("div"); holder.dataset.id = "more"; ilayer.appendChild(holder); }
  iseen.add("more");
  setHtml(holder, more);
  prune(ilayer, iseen);
}

// ---------- header and roster ----------

function renderHeader(list) {
  const count = (s) => list.filter((a) => a.status === s).length;
  setHtml($("counts"), ["blocked", "done", "working", "idle"].filter((s) => count(s)).map((s) =>
    `<div class="count" data-status="${s}"><div class="dot" style="background:var(--${s})"></div>${STATUS[s].label} ${count(s)}</div>`).join(""));
  const m = data.meeting;
  setHtml($("meeting"), meetingOn(m)
    ? `<div class="chip" title="${esc(m.topic)}">會議中 · ${m.status === "summarizing" ? "整理結論" : `第 ${m.round}/${m.rounds} 輪`}</div>`
    : "");
  const waiting = count("blocked");
  document.title = waiting ? `辦公室（${waiting} 位等你回覆）` : "辦公室";
}

function renderRoster(list, P) {
  if (!list.length) {
    return setHtml($("roster"), `<div class="empty"><div>辦公室還沒有人上班</div><div>在 Herdr 裡開一個 Claude Code 或 Codex，就會有人坐進來</div></div>`);
  }
  const names = data.names ?? {};
  const interns = data.interns ?? {};
  const sorted = [...list].sort((x, y) => (ORDER[x.status] ?? 9) - (ORDER[y.status] ?? 9) || y.seq - x.seq);
  setHtml($("roster"), sorted.map((a) => {
    const name = names[a.address];
    const subs = interns[a.address] ?? [];
    const where = P.offices > 1 ? `<span class="fl" style="color:var(--${officeOf[a.address] === P.floor ? "foreground" : "dim"})">${officeOf[a.address] + 1}F</span>` : "";
    return `<div class="agent${a.focused ? " focused" : ""}" data-addr="${esc(a.address)}" title="${esc(`${a.space_name} · ${a.program?.name ?? a.app ?? ""}`)}">`
      + `<img src="/img/head-${paletteOf(a.address)}.svg" style="width:18px;height:16px;flex:none" alt="">${where}`
      + `<div class="who">${name ? `<span class="nm">${esc(name)}</span>` : ""}`
      + `<span class="task" style="color:var(--${name ? "muted" : "foreground"})">${esc(task(a) || a.space_name)}</span>`
      + (subs.length ? `<span class="subs" title="${esc(subs.map((x) => `${x.type}：${x.text}`).join("\n"))}">子代理 ${subs.length}</span>` : "")
      + `</div><div class="st" style="color:var(--${a.status})"><div class="dot" style="background:var(--${a.status})"></div>${STATUS[a.status]?.label ?? a.status}</div></div>`;
  }).join(""));
}

// ---------- errands (as main.js's errandTick) ----------

// Every couple of seconds: send errands home when they're over (or the agent got busy), and now
// and then send an idle agent that has rested a while on a new one: a few at a time, a chat only
// with someone working in the same office, one at the cooler and one with the cat per office.
function errandTick() {
  if (!data) return;
  const now = Date.now();
  const list = data.agents;
  const byAddress = Object.fromEntries(list.map((a) => [a.address, a]));
  let changed = false;
  for (const [k, e] of Object.entries(errands)) {
    if (e.until > now && byAddress[k]?.status === "idle") continue;
    delete errands[k];
    rested[k] = now;
    changed = true;
  }
  for (const k of Object.keys(rested)) if (byAddress[k]?.status !== "idle") delete rested[k];
  const idle = list.filter((a) => a.status === "idle");
  for (const a of idle) rested[a.address] ??= now;
  if (Object.keys(errands).length < Math.max(1, Math.ceil(idle.length / 3)) && Math.random() < 0.3) {
    const ready = idle.filter((a) => !errands[a.address] && now - rested[a.address] > ERRAND_MS.rest);
    const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
    const who = ready.length ? pick(ready) : null;
    const office = (a) => officeOf[a.address] ?? 0;
    const working = who ? list.filter((a) => a.status === "working" && office(a) === office(who)) : [];
    const taken = new Set(Object.entries(errands).filter(([k]) => byAddress[k] && who && office(byAddress[k]) === office(who)).map(([, e]) => e.kind));
    const kinds = ["water", "window", "cat", "chat", "chat"].filter((k) => k === "window" || (k === "chat" ? working.length > 0 : !taken.has(k)));
    if (who && kinds.length) {
      const kind = pick(kinds);
      errands[who.address] = {
        kind, with: kind === "chat" ? pick(working).address : null,
        until: now + WALK.duration + ERRAND_MS.min + Math.random() * (ERRAND_MS.max - ERRAND_MS.min),
      };
      changed = true;
    }
  }
  if (changed) render();
}

// ---------- loop ----------

function render() {
  if (!data) return;
  // The preview's "floor=2" shows that office once, when the line changes.
  if (data.demoFloor !== demoFloor) { demoFloor = data.demoFloor; if (demoFloor) floor = demoFloor - 1; }
  const list = data.agents;
  const P = plan(data);
  tabsShown = P.offices > 1;
  renderHeader(list);
  renderUsage(data.usage);
  renderTabs(list, P);
  renderScene(data, P);
  renderRoster(list, P);
}

function showError(text) {
  const el = $("error");
  el.style.display = text ? "block" : "none";
  el.textContent = text ?? "";
}

async function poll() {
  try {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (!r.ok) throw new Error(`讀不到 Herdr 的狀態（${(await r.text()).slice(0, 120)}）。Herdr 有開著嗎？`);
    data = await r.json();
    showError(null);
    render();
  } catch (e) {
    showError(e instanceof TypeError ? "辦公室伺服器停了。請從 Herdr 辦公室的齒輪選單再開一次桌面視窗。" : e.message);
  }
}

async function focusAgent(terminal) {
  if (!terminal || data?.demo) return;
  try {
    await fetch("/api/focus", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ terminal }) });
  } catch { /* the next poll shows the error */ }
}

$("roster").addEventListener("click", (e) => {
  const row = e.target.closest(".agent");
  if (row) { focusAgent(row.dataset.addr); goTo(row.dataset.addr); }
});
$("tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab) { floor = Number(tab.dataset.floor); render(); }
});
$("counts").addEventListener("click", (e) => {
  const c = e.target.closest(".count");
  if (!c || !data || c.dataset.status === "idle") return;
  goTo(data.agents.find((a) => a.status === c.dataset.status)?.address);
});
$("scene").addEventListener("click", (e) => {
  const desk = e.target.closest("#your-desk");
  if (desk?.dataset.next) focusAgent(desk.dataset.next);
});

new ResizeObserver(([entry]) => {
  const w = Math.floor(entry.contentRect.width) - 2, h = Math.floor(entry.contentRect.height) - 2;
  if (w !== stageW || h !== stageH) { stageW = w; stageH = h; render(); }
}).observe($("stage"));

// Sit them down once they arrive; send newcomers on from the doorway.
setInterval(() => {
  const now = Date.now();
  let done = false;
  for (const [k, until] of Object.entries(walking)) if (until <= now) { delete walking[k]; done = true; }
  for (const [k, since] of Object.entries(entering)) if (now - since >= 300) { delete entering[k]; done = true; }
  if (done) render();
}, 300);
setInterval(errandTick, 2000);
// The wall clock, and the sky when the hour turns.
setInterval(() => { const c = clockText(); if (c !== clock) { clock = c; render(); } }, 10000);

poll();
setInterval(poll, 1500);
