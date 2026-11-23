// Draws the office in a browser window, the way main.js draws it in Herdr: the same art,
// geometry (logic.js) and zones. Read-only apart from a click that shows the agent in Herdr;
// naming agents and meetings stay in Herdr.

import {
  SCENE_W, WALL_H, ROW_H, LOUNGE_H, FILL_H, PER_ROW, DESK_X, MEET_H, MEET_SEATS, POSE_H, STATUS, ORDER, STYLES, WALK, RUGS, ERRANDS,
  toolOf, meetingOn, paletteOf, task, spot, windowName, tokens, resetsIn, pickLayout,
  seatBySpace, rugRects, errandSpot, errandStep, phaseOf, clockText,
} from "/logic.js";

const $ = (id) => document.getElementById(id);
const R = Math.round;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Only touch the DOM when something changed, so running animations aren't restarted.
const setHtml = (el, html) => { if (el._html !== html) { el._html = html; el.innerHTML = html; } };

let data = null;
let stageW = 380, stageH = 640;
const last = {}, walking = {};
// Idle agents' errands and since when each has rested (errandStep in logic.js).
const errandState = { errands: {}, rested: {} };
let clock = clockText();

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
  if (pose === "wave") return flip(sprite("waveA", pal, s), sprite("waveB", pal, s), w, h, 600);
  if (pose === "cheer") return bob(sprite("cheer", pal, s), w, h, 600, -3 * s);
  return sprite(pose, pal, s);
}

function sign(a) {
  const st = STATUS[a.status];
  if (!st?.mark) return "";
  return `<div class="extra sign${a.status === "blocked" ? " pulse" : ""}" style="background:var(--${a.status})">${st.mark} ${st.label}</div>`;
}

// ---------- the room ----------

// The floor plan: walls (with the sky of the hour), the floor under the desks, the meeting room
// and the lounge. The desks go on top, after the rugs (deskLayer).
function room(L, rows, s, style, phase) {
  const px = (n) => R(n * s);
  const img = (name, h) => `<img src="/img/${style}/${name}.svg" style="width:${px(SCENE_W)}px;height:${px(h)}px;flex:none" alt="">`;
  const sky = phase === "day" || style === "night" ? "" : `-${phase}`;
  const desks = `<div class="col" style="width:${px(SCENE_W)}px;flex:none">${img(`wall${sky}`, WALL_H)}${img("floor", ROW_H).repeat(rows)}${L.meet ? img("meeting", MEET_H) : ""}${L.wide ? "" : img("lounge", LOUNGE_H)}</div>`;
  if (!L.wide) return desks;
  const fills = Math.max(0, Math.ceil((L.h - WALL_H - LOUNGE_H) / FILL_H));
  const lounge = `<div class="col" style="width:${px(SCENE_W)}px;height:${px(L.h)}px;flex:none;overflow:hidden">${img(`wall-lounge${sky}`, WALL_H)}${img("lounge-open", LOUNGE_H)}${img("lounge-fill", FILL_H).repeat(fills)}</div>`;
  return `<div class="row">${desks}${lounge}</div>`;
}

// Each space's rug under its desks.
function rugs(groups, s) {
  const px = (n) => R(n * s);
  return groups.map((g, i) => rugRects(g.desks).map((r) => {
    const c = RUGS[i % RUGS.length];
    return `<div class="abs" style="left:${px(r.x)}px;top:${px(r.y)}px;width:${px(r.w)}px;height:${px(r.h)}px;border-radius:${px(4)}px;background:${c}40;border:${Math.max(1, R(s))}px solid ${c}aa"></div>`;
  }).join("")).join("");
}

// The desks, one see-through row each, over the floor and the rugs.
const deskLayer = (rows, s, style) => Array.from({ length: rows }, (_, r) =>
  `<img class="abs" src="/img/${style}/deskrow.svg" style="left:0;top:${R((WALL_H + r * ROW_H) * s)}px;width:${R(SCENE_W * s)}px;height:${R(ROW_H * s)}px" alt="">`).join("");

// Evening light: a warm tint at sunset; at night (day styles only) the room dims, and the floor
// lamp and working monitors glow.
function light(L, phase, s, placed, style) {
  const px = (n) => R(n * s);
  const box = (x, y, w, h, bg, radius = 0) => `<div class="abs" style="left:${px(x)}px;top:${px(y)}px;width:${px(w)}px;height:${px(h)}px;border-radius:${px(radius)}px;background:${bg}"></div>`;
  const dim = style !== "night";
  let out = "";
  if (phase === "dusk") out += box(0, 0, L.w, L.h, "#ff8a3d14");
  if (phase === "night" && dim) out += box(0, 0, L.w, L.h, "#0a123048");
  if (phase !== "night") return out;
  if (dim) for (const [r, a] of [[26, "14"], [16, "1c"]]) out += box(L.lo.x + 123 - r, L.lo.y + 30 - r, r * 2, r * 2, `#ffe39a${a}`, r);
  for (const p of placed) {
    if (p.a.status !== "working" || p.meeting || p.talk) continue;
    const row = Math.floor(p.desk / PER_ROW), cx = DESK_X[p.desk % PER_ROW];
    out += box(cx - 17, WALL_H + row * ROW_H - 4, 34, 24, "#79c0ff1f", 10);
  }
  return out;
}

// A clock on the wall: the real time (or the preview's hour), a sun or a moon by it.
function wallClock(phase, s, ui, demoHour) {
  const color = phase === "night" ? "#8aa0d6" : phase === "dusk" ? "#e07a3a" : "#e0a020";
  const text = demoHour != null ? `${String(demoHour).padStart(2, "0")}:00` : clock;
  return `<div class="zone" style="left:${R(158 * s)}px;top:${R(6 * s)}px;gap:3px;padding:0 6px;background:${ui.label};border:1px solid ${ui.labelBorder};color:${ui.text}"><span style="color:${color}">${phase === "night" ? "☾" : "☀"}</span>${text}</div>`;
}

// Which rug is which space: a tag per space in its rug's color, on the wall above the desks.
function spaceLegend(groups, s) {
  const tags = groups.map((g, i) => `<div class="tag" title="${esc(`${g.name} · ${g.agents.length} 位`)}" style="max-width:${R(100 * s)}px;background:${RUGS[i % RUGS.length]}">${esc(g.name)}</div>`).join("");
  return `<div class="legend" style="left:${R(4 * s)}px;top:${R(6 * s)}px;max-width:${R(150 * s)}px">${tags}</div>`;
}

// The wall between the two rooms when they sit side by side, with a door.
function divider(L, s, ui) {
  const seg = (y, h) => `<div class="abs" style="left:${R((SCENE_W - 3) * s)}px;top:${R(y * s)}px;width:${R(5 * s)}px;height:${R(h * s)}px;background:${ui.wall};border:1px solid ${ui.wallBorder}"></div>`;
  const door = WALL_H + 64, gap = 30;
  return seg(WALL_H - 2, door - WALL_H + 2) + seg(door + gap, L.h - door - gap + 2);
}

const zone = (text, x, y, s, ui) =>
  `<div class="zone" style="left:${R(x * s)}px;top:${R(y * s)}px;background:${ui.label};border:1px solid ${ui.labelBorder};color:${ui.text}">${text}</div>`;

// A working monitor runs: lines of code scroll past and a cursor blinks.
function screen(a, desk, s) {
  if (a.status !== "working") return "";
  const row = Math.floor(desk / PER_ROW), cx = DESK_X[desk % PER_ROW];
  const W = R(18 * s), H = R(10 * s), u = Math.max(1, R(s));
  const COLORS = ["#7ee787", "#79c0ff", "#d2a8ff", "#ffa657", "#c9d1d9", "#79c0ff", "#7ee787", "#c9d1d9"];
  const seed = paletteOf(a.address);
  const lines = Array.from({ length: 12 }, (_, i) => {
    const k = (i * 7 + seed * 3) % 10;
    return `<div class="row" style="height:${u}px;gap:${u}px"><div style="width:${u * (1 + (k % 3))}px"></div>`
      + `<div style="width:${R(W * (0.25 + (k % 5) * 0.11))}px;background:${COLORS[(i + seed) % COLORS.length]}"></div>`
      + (k % 2 === 0 ? `<div style="width:${R(W * 0.15)}px;background:${COLORS[(i + seed + 3) % COLORS.length]}"></div>` : "")
      + `</div>`;
  }).join("");
  return `<div class="screen" style="left:${R((cx - 9) * s)}px;top:${R((WALL_H + row * ROW_H + 2) * s)}px;width:${W}px;height:${H}px">`
    + `<div class="lines col" style="left:${u}px;gap:${u}px;--p:${5200 + seed * 400}ms;--d:${-12 * 2 * u + H - u}px">${lines}</div>`
    + `<div class="cursor" style="right:${u * 2}px;bottom:${u}px;width:${u * 2}px;height:${u * 2}px"></div></div>`;
}

// The name on a desk, so an empty chair still says whose it is.
function plate(a, desk, s, name, ui) {
  const row = Math.floor(desk / PER_ROW), cx = DESK_X[desk % PER_ROW];
  const w = R(34 * s);
  return `<div class="plate" style="left:${R((cx - 6) * s - w / 2)}px;top:${R((WALL_H + row * ROW_H + 63) * s)}px;width:${w}px">`
    + `<div style="background:${ui.plate};border:1px solid ${ui.labelBorder};color:${ui.text}${name ? ";font-weight:600" : ""}">${esc(name || task(a) || a.space_name)}</div></div>`;
}

// Characters keep their element between polls, so a move to a new spot is animated.
function actor(layer, seen, id, left, top, w, h, inner, onClick) {
  seen.add(id);
  let el = layer.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) {
    el = document.createElement("div");
    el.dataset.id = id;
    el.className = id.startsWith("ag-") ? "char" : "intern";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    if (onClick) el.addEventListener("click", onClick);
    layer.appendChild(el);
  }
  Object.assign(el.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
  setHtml(el, inner);
  return el;
}

function renderScene(d) {
  const list = d.agents;
  const ui = (STYLES.find((x) => x.id === d.style) ?? STYLES[0]).ui;
  const style = (STYLES.find((x) => x.id === d.style) ?? STYLES[0]).id;
  const seating = seatBySpace(list), rows = seating.rows;
  const m = meetingOn(d.meeting) ? d.meeting : null;
  const seats = m ? m.participants.filter((x) => list.some((a) => a.address === x)) : [];
  const L = pickLayout({ stageW, stageH, rows, meet: seats.length > 0, pref: d.layout ?? "auto" });
  const s = L.s, lo = L.lo, mo = L.mo;
  const phase = phaseOf(style, d.daynight ?? "auto", d.demoHour ?? null);
  const count = { working: 0, blocked: 0, done: 0, idle: 0 };
  const placed = list.map((a) => {
    const desk = seating.desk[a.address];
    const seat = seats.indexOf(a.address);
    if (seat >= 0) {
      const [x, y, pose] = MEET_SEATS[seat];
      return { a, desk, meeting: true, place: [mo.x + x, mo.y + y, pose] };
    }
    const key = a.status in count ? a.status : "idle";
    return { a, desk, place: spot({ ...a, status: key }, desk, count[key]++, lo) };
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
    const e = errandState.errands[p.a.address];
    if (!e || p.meeting || p.talk || p.a.status !== "idle") continue;
    const place = errandSpot(e.kind, lo, e.kind === "window" ? atWindow++ : 0, e.with ? at[e.with]?.place : null);
    if (!place) continue;
    p.place = [Math.min(place[0], L.w - 9), place[1], place[2]];
    p.errand = e;
  }
  const key = `${L.wide ? "w" : "t"}${R(s * 100)}`;
  const now = Date.now();
  for (const p of placed) {
    const prev = last[p.a.address], here = `${R(p.place[0])},${R(p.place[1])}`;
    if (prev && prev.key === key && prev.at !== here) walking[p.a.address] = now + WALK.duration;
    last[p.a.address] = { key, at: here };
  }
  const names = d.names ?? {};
  const interns = d.interns ?? {};

  const scene = $("scene");
  scene.style.width = `${R(L.w * s)}px`;
  scene.style.height = `${R(L.h * s)}px`;
  // Separate layers, so the clock ticking doesn't restart the monitors' animations.
  if (!scene.firstChild) scene.innerHTML = `<div id="floor"></div><div id="props"></div><div id="labels"></div><div id="actors"></div>`;

  const more = placed.filter((p) => (interns[p.a.address] ?? []).length > 4).map((p) => {
    const [px, py] = p.place;
    return `<div class="more" style="left:${R((px + 30) * s)}px;top:${R((py - 2) * s)}px;background:${ui.label};border:1px solid ${ui.labelBorder};color:${ui.text}">+${interns[p.a.address].length - 4}</div>`;
  }).join("");
  setHtml($("floor"), room(L, rows, s, style, phase)
    + rugs(seating.groups, s)
    + deskLayer(rows, s, style)
    + (L.wide ? divider(L, s, ui) : "")
    + light(L, phase, s, placed, style));
  setHtml($("props"), placed.filter((p) => !p.meeting && !p.talk).map((p) => screen(p.a, p.desk, s)).join("")
    + placed.map((p) => plate(p.a, p.desk, s, names[p.a.address], ui)).join(""));
  // The spaces' tags name the work area; with nobody in, the plain label does.
  setHtml($("labels"), wallClock(phase, s, ui, d.demoHour)
    + (seating.groups.length ? spaceLegend(seating.groups, s) : zone("工作區", 4, 6, s, ui))
    + zone("休息區", lo.x + 8, lo.y + 112, s, ui)
    + zone("你的桌子", lo.x + 144, lo.y + 114, s, ui)
    + (L.meet ? zone("會議室", mo.x + 150, mo.y + 47, s, ui) : "")
    + more);

  const layer = $("actors");
  const seen = new Set();
  const extra = (p) => {
    if (p.meeting && m.speaker === p.a.address) return `<div class="extra speaking">● ${m.status === "summarizing" ? "整理結論中" : "發言中"}</div>`;
    if (p.meeting) return "";
    if (p.talk) return `<div class="extra bubble">→ ${esc(names[p.talk.to] ?? toolOf(at[p.talk.to].a))}：${esc(p.talk.text)}</div>`;
    if (p.errand) {
      // What it's up to, once it gets there.
      const label = ERRANDS[p.errand.kind].label;
      return label && !walking[p.a.address] ? `<div class="extra doing" style="background:${ui.label};border:1px solid ${ui.labelBorder};color:${ui.text}">${label}</div>` : "";
    }
    return sign(p.a);
  };
  // Farther back draws first, so nearer characters overlap them.
  const byDepth = [...placed].sort((p, q) => p.place[1] - q.place[1]);
  byDepth.forEach((p, z) => {
    const { a } = p;
    const [x, y, finalPose] = p.place;
    const pose = walking[a.address] ? "walk" : finalPose;
    const pal = paletteOf(a.address);
    const w = R(16 * s), h = R((pose === "type" ? 16 : POSE_H[pose] ?? 21) * s);
    const name = names[a.address];
    const what = task(a) || a.space_name;
    const hover = `<div class="hover" style="border-color:var(--${a.status})">${esc(name ? `${name} · ${what}` : what)}</div>`;
    const el = actor(layer, seen, `ag-${a.address}-${key}`, R(x * s - w / 2), R(y * s), w, h,
      figure(pose, pal, s) + `<div class="label">${hover}${extra(p)}</div>`,
      () => focusAgent(a.address));
    el.style.zIndex = String(10 + z);
  });
  // Subagents: smaller characters beside whoever started them; hover for the task.
  const OFF = [[-19, 0], [19, 0], [-28, 6], [28, 6]];
  for (const p of placed) {
    (interns[p.a.address] ?? []).slice(0, 4).forEach((x, i) => {
      const k = 0.72, ks = s * k;
      const w = R(16 * ks), h = R(21 * ks);
      const [dx, dy] = OFF[i % OFF.length];
      const [px, py, ppose] = p.place;
      const parentH = ppose === "type" ? 16 : POSE_H[ppose] ?? 21;
      const top = py + parentH - 21 * k + dy;
      const pal = paletteOf(x.id);
      const fig = x.status === "blocked"
        ? flip(sprite("waveA", pal, ks), sprite("waveB", pal, ks), w, h, 600)
        : x.status === "done"
          ? sprite("cheer", pal, ks)
          : x.status === "working" ? bob(sprite("stand", pal, ks), w, h, 700, -1.5 * s) : sprite("stand", pal, ks);
      const el = actor(layer, seen, `in-${x.id}-${key}`, R((px + dx) * s - w / 2), R(top * s), w, h, fig);
      el.title = x.kind === "claude" ? `子代理（${x.type}）：${x.text}` : `子 Agent（${x.type}）：${x.text}`;
      el.style.zIndex = "200";
    });
  }
  for (const el of [...layer.children]) if (!seen.has(el.dataset.id)) el.remove();
}

// ---------- header and roster ----------

function renderHeader(d) {
  const list = d.agents;
  const count = (s) => list.filter((a) => a.status === s).length;
  setHtml($("counts"), ["blocked", "done", "working", "idle"].filter((s) => count(s)).map((s) =>
    `<div class="count"><div class="dot" style="background:var(--${s})"></div>${STATUS[s].label} ${count(s)}</div>`).join(""));
  const m = d.meeting;
  setHtml($("meeting"), meetingOn(m)
    ? `<div class="chip" title="${esc(m.topic)}">會議中 · ${m.status === "summarizing" ? "整理結論" : `第 ${m.round}/${m.rounds} 輪`}</div>`
    : "");
  const waiting = count("blocked");
  document.title = waiting ? `辦公室（${waiting} 位等你回覆）` : "辦公室";
}

function renderRoster(d) {
  const list = d.agents;
  if (!list.length) {
    return setHtml($("roster"), `<div class="empty"><div>辦公室還沒有人上班</div><div>在 Herdr 裡開一個 Claude Code 或 Codex，就會有人坐進來</div></div>`);
  }
  const names = d.names ?? {};
  const interns = d.interns ?? {};
  const sorted = [...list].sort((x, y) => (ORDER[x.status] ?? 9) - (ORDER[y.status] ?? 9) || y.seq - x.seq);
  setHtml($("roster"), sorted.map((a) => {
    const name = names[a.address];
    const subs = interns[a.address] ?? [];
    return `<div class="agent${a.focused ? " focused" : ""}" data-addr="${esc(a.address)}" title="${esc(`${a.space_name} · ${a.program?.name ?? a.app ?? ""}`)}">`
      + `<img src="/img/head-${paletteOf(a.address)}.svg" style="width:18px;height:16px;flex:none" alt="">`
      + `<div class="who">${name ? `<span class="nm">${esc(name)}</span>` : ""}`
      + `<span class="task" style="color:var(--${name ? "muted" : "foreground"})">${esc(task(a) || a.space_name)}</span>`
      + (subs.length ? `<span class="subs" title="${esc(subs.map((x) => `${x.type}：${x.text}`).join("\n"))}">子代理 ${subs.length}</span>` : "")
      + `</div><div class="st" style="color:var(--${a.status})"><div class="dot" style="background:var(--${a.status})"></div>${STATUS[a.status]?.label ?? a.status}</div></div>`;
  }).join(""));
}

// ---------- loop ----------

function render() {
  if (!data) return;
  renderHeader(data);
  renderUsage(data.usage);
  renderScene(data);
  renderRoster(data);
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
  try {
    await fetch("/api/focus", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ terminal }) });
  } catch { /* the next poll shows the error */ }
}

$("roster").addEventListener("click", (e) => {
  const row = e.target.closest(".agent");
  if (row) focusAgent(row.dataset.addr);
});

new ResizeObserver(([entry]) => {
  const w = Math.floor(entry.contentRect.width) - 2, h = Math.floor(entry.contentRect.height) - 2;
  if (w !== stageW || h !== stageH) { stageW = w; stageH = h; render(); }
}).observe($("stage"));

// Sit them down once they arrive.
setInterval(() => {
  const now = Date.now();
  let done = false;
  for (const [k, until] of Object.entries(walking)) if (until <= now) { delete walking[k]; done = true; }
  if (done) render();
}, 300);

// Errands end and start every couple of seconds; the wall clock and the sky follow the time.
setInterval(() => {
  if (data && errandStep(errandState, data.agents, Date.now())) render();
}, 2000);
setInterval(() => {
  const c = clockText();
  if (c !== clock) { clock = c; render(); }
}, 10000);

poll();
setInterval(poll, 1500);
