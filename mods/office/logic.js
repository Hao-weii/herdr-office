// The office's pure logic: scene geometry, where each agent goes, which layout fits, and
// text formatting. No Herdr or GPUI imports, so tests run it with plain node (tests/).

// Scene units: each art piece is 200 wide; everything scales to fit the stage.
export const SCENE_W = 200, WALL_H = 48, LOUNGE_H = 132, FILL_H = 76;
// An open-plan floor of islands (pods): four seats each, two backs to us (south side, their
// screens toward us) and two facing us from behind their monitors (north side). Two pods a row.
export const POD_W = 96, POD_H = 84, PODS_PER_ROW = 2, SEATS_PER_POD = 4;
export const POD_X = [3, 101];
export const SEAT_X = [26, 70]; // pod-local middle of the left and right seat
// Where new agents come in: the glass door in the middle of the wall.
export const DOOR = [100, 26];
// Room under the last row of pods, so its nameplates are not cut off.
export const DESK_PAD = 8;
// Spots in the lower room, relative to its top left: [x of the middle, y of the sprite's top, pose].
export const LOUNGE_SPOTS = [
  [46, 34, "sofa"], [70, 34, "sofa"], [94, 34, "sofa"],
  [46, 84, "back"], [70, 84, "back"], [94, 84, "back"],
  [18, 58, "stand"], [124, 62, "stand"], [124, 96, "stand"],
];
// The queues at your desk: waiting agents on the left, finished ones on the right.
export const QUEUE_X = { blocked: 157, done: 184 };
export const QUEUE_Y = [38, 60, 82, 104];
// The meeting room (only while a meeting runs): seats north (facing us) and south (backs to us).
export const MEET_H = 64;
export const MEET_SEATS = [[64, 5, "sofa"], [100, 5, "sofa"], [136, 5, "sofa"], [64, 32, "back"], [100, 32, "back"], [136, 32, "back"]];
// How long a message keeps its sender standing by the receiver.
export const TALK_MS = 10000;
export const TOOL_NAMES = { "claude-code": "Claude Code", claude: "Claude Code", codex: "Codex", antigravity: "agy", agy: "agy" };
export const toolOf = (a) => TOOL_NAMES[a.app] ?? TOOL_NAMES[a.program?.key] ?? a.program?.name ?? a.app ?? "Agent";
export const meetingOn = (m) => !!m && (m.status === "running" || m.status === "summarizing") && Date.now() - (m.updated_at ?? 0) < 40 * 60000;
export const POSE_H = { walkA: 21, walkB: 21, walk: 21, stand: 21, standBack: 21, waveA: 21, waveB: 21, cheer: 21, sofa: 19, back: 16, typeA: 16, typeB: 16, typeFront: 16 };
export const PALETTES = 6;
export const WALK = { duration: 1400, easing: "ease-in-out" };

export const STATUS = {
  blocked: { label: "等你回覆", mark: "!" },
  done: { label: "做完了", mark: "✓" },
  working: { label: "工作中" },
  idle: { label: "閒置" },
};
export const ORDER = { blocked: 0, done: 1, working: 2, idle: 3 };

export function paletteOf(address) {
  let h = 0;
  for (const ch of address) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % PALETTES;
}

export const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").trim();

// What the agent is on: a named tab, else its own title when it says something.
export function task(a) {
  if (a.tab_name && !/^\d+$/.test(a.tab_name)) return a.tab_name;
  const live = clean(a.title);
  const path = /^[~/]|^[A-Za-z]:\\/.test(live);
  return live && !path && live !== a.address && live !== a.program?.name ? live : "";
}

// ---------- seats ----------
// A seat number, within one office: pod * 4 + k; k 0 and 1 are the south (back to us) seats,
// 2 and 3 the north ones. Where it is, in scene units.
export function seatAt(seat) {
  const pod = Math.floor(seat / SEATS_PER_POD), k = seat % SEATS_PER_POD;
  const row = Math.floor(pod / PODS_PER_ROW), col = pod % PODS_PER_ROW;
  const top = WALL_H + row * POD_H;
  return { pod, k, row, col, top, x: POD_X[col] + SEAT_X[k % 2], north: k >= 2 };
}

// Where someone working at a seat sits: [x, y of the sprite's top, pose].
export function seatPlace(seat) {
  const p = seatAt(seat);
  return p.north ? [p.x, p.top + 3, "typeFront"] : [p.x, p.top + 51, "type"];
}

// A pod's rectangle (its rug), in scene units.
export function podRect(pod) {
  const row = Math.floor(pod / PODS_PER_ROW), col = pod % PODS_PER_ROW;
  return { x: POD_X[col], y: WALL_H + row * POD_H + 1, w: POD_W, h: POD_H - 2 };
}

// Who sits where. An agent keeps its seat (`prev`, address -> seat) for as long as it lives; a
// newcomer takes a free seat on its own space's pod, else an empty pod (a pod belongs to the space
// of whoever sits at it), else a new pod. `cap`: pods per office; a space stays in one office
// where it can, and the next office opens when one is full. `reserve`: seats someone clicked to
// start an agent in ({ space, seat }), kept for that space. Seat numbers run across offices:
// office = floor(pod / cap).
export function assignSeats(list, prev = {}, cap = Infinity, reserve = []) {
  const spaceOf = (a) => a.space ?? a.space_name ?? "";
  const seats = {}, owner = {}, used = new Set(), held = new Set(reserve.map((r) => r.seat));
  const podOf = (s) => Math.floor(s / SEATS_PER_POD);
  const take = (a, s) => { seats[a.address] = s; used.add(s); owner[podOf(s)] = spaceOf(a); };
  for (const a of list) {
    const s = prev[a.address];
    if (s == null || used.has(s) || (owner[podOf(s)] ?? spaceOf(a)) !== spaceOf(a)) continue;
    take(a, s);
  }
  // Reserved seats count as their space's.
  for (const r of reserve) owner[podOf(r.seat)] ??= r.space;
  const officeOf = (pod) => (Number.isFinite(cap) ? Math.floor(pod / cap) : 0);
  const free = (pod) => {
    for (let k = 0; k < SEATS_PER_POD; k++) { const s = pod * SEATS_PER_POD + k; if (!used.has(s) && !held.has(s)) return s; }
    return null;
  };
  const emptyPod = (from, to) => { for (let q = from; q < to; q++) if (owner[q] == null) return q; return null; };
  const left = [...reserve];
  for (const a of list) {
    if (seats[a.address] != null) continue;
    const sp = spaceOf(a);
    const r = left.findIndex((x) => x.space === sp && !used.has(x.seat));
    if (r >= 0) { take(a, left[r].seat); left.splice(r, 1); continue; }
    const mine = Object.keys(owner).map(Number).filter((p) => owner[p] === sp).sort((x, y) => x - y);
    const room = mine.map(free).find((s) => s != null);
    if (room != null) { take(a, room); continue; }
    let q = null;
    if (Number.isFinite(cap)) for (const o of [...new Set(mine.map(officeOf))]) { q = emptyPod(o * cap, (o + 1) * cap); if (q != null) break; }
    q ??= emptyPod(0, Infinity);
    take(a, free(q));
  }
  const pods = Math.max(0, ...Object.keys(owner).map((p) => Number(p) + 1));
  return { seats, owner, pods, offices: Math.max(1, Number.isFinite(cap) ? Math.ceil(pods / cap) : 1) };
}

// Where the agent goes, in scene units: [x of its middle, y of the sprite's top, pose].
// `seat` its seat in this office; `n` its place among agents of the same status; `lo` the lower
// room's top left.
export function spot(a, seat, n, lo) {
  if (a.status === "working") return seatPlace(seat);
  if (a.status === "blocked" || a.status === "done") {
    const lap = Math.floor(n / QUEUE_Y.length);
    return [lo.x + QUEUE_X[a.status] - lap * 5, lo.y + QUEUE_Y[n % QUEUE_Y.length] + lap * 3, a.status === "blocked" ? "wave" : "cheer"];
  }
  const [x, y, pose] = LOUNGE_SPOTS[n % LOUNGE_SPOTS.length];
  const lap = Math.floor(n / LOUNGE_SPOTS.length);
  return [lo.x + x + lap * 6, lo.y + y + lap * 4, pose];
}

// ---------- actions ----------
// The right-click menu for an agent, by its status: the likeliest thing first, the ones that
// stop work (`danger`) last. A blocked agent gets no "send": it may be waiting on a permission
// prompt that pasted text would answer wrong.
export function menuItems({ status, pinned = false, intern = false }) {
  const pin = { id: "pin", label: pinned ? "取消釘選" : "釘選" };
  const rename = { id: "rename", label: "取名…" };
  const kill = { id: "kill", label: "收工…", danger: true };
  if (intern) return [{ id: "peek", label: "偷看一下" }, { id: "focus", label: "前往" }, kill];
  if (status === "blocked") return [{ id: "focus", label: "前往回覆" }, { id: "peek", label: "偷看一下" }, pin, rename];
  if (status === "done") return [{ id: "focus", label: "前往驗收" }, { id: "dispatch", label: "交代下一件事…" }, rename, kill];
  if (status === "working") return [{ id: "peek", label: "偷看一下" }, { id: "dispatch", label: "補充交代…" }, { id: "focus", label: "前往" }, rename, { id: "interrupt", label: "喊停…", danger: true }, kill];
  return [{ id: "dispatch", label: "派工…" }, { id: "focus", label: "前往" }, pin, rename, kill];
}
// The send dialog's title, by the agent's status.
export const DISPATCH_TITLE = { idle: "派工", done: "交代下一件事", working: "補充交代" };

// Who waits at the person's desk next: the longest-waiting blocked agent, else a finished one.
export function nextInQueue(list) {
  const by = (s) => list.filter((a) => a.status === s).sort((x, y) => x.seq - y.seq)[0];
  return by("blocked") ?? by("done") ?? null;
}

// The spaces' tags on the wall: about how wide one is in px (CJK about 10 px a character, other
// text about 6), and how many fit in `lines` lines of `width` px. When not all fit, the last line
// keeps room for a "+N" chip (`more` px).
export const tagWidth = (name) => 14 + [...(name ?? "")].reduce((w, ch) => w + (ch.codePointAt(0) >= 0x2e80 ? 10 : 6.2), 0);
export function packTags(widths, width, lines = 2, gap = 4, more = 30) {
  const fits = (ws) => {
    let line = 1, x = 0;
    for (const w0 of ws) {
      const w = Math.min(w0, width);
      if (x > 0 && x + gap + w > width) { line++; x = w; } else x += (x > 0 ? gap : 0) + w;
    }
    return line <= lines;
  };
  if (fits(widths)) return widths.length;
  for (let k = widths.length - 1; k >= 0; k--) if (fits([...widths.slice(0, k), more])) return k;
  return 0;
}

// ---------- errands ----------
// Now and then an idle agent gets up: a glass of water at the cooler, a look out of the window,
// the cat, or a chat at a working coworker's desk. Then it walks back to its sofa.
export const ERRANDS = {
  water: { label: "倒水" },
  window: { label: null }, // seen from behind at the glass; a label would cover the space tags
  cat: { label: "摸貓" },
  chat: { label: "聊天" },
};
export const WINDOW_X = [67, 133];
export const ERRAND_MS = { rest: 15000, min: 6000, max: 14000 };

// Where an errand takes the agent: [x of its middle, y of the sprite's top, pose]. `n` spreads
// several agents at the window; `target` is the coworker's place for a chat (null: no errand).
export function errandSpot(kind, lo, n = 0, target = null) {
  if (kind === "water") return [lo.x + 9, lo.y + 22, "standBack"];
  if (kind === "window") return [WINDOW_X[n % WINDOW_X.length] + Math.floor(n / WINDOW_X.length) * 8, WALL_H - 24, "standBack"];
  if (kind === "cat") return [lo.x + 92, lo.y + 52, "stand"];
  if (kind === "chat" && target) return [target[0] + 15, target[1] - (target[2] === "type" ? 2 : 3), "stand"];
  return null;
}

// ---------- time of day ----------
// The window follows the clock: day from 6, sunset from 17, night from 19.
export function phaseAt(date = new Date()) {
  const h = date.getHours();
  if (h >= 6 && h < 17) return "day";
  if (h >= 17 && h < 19) return "dusk";
  return "night";
}
export const clockText = (date = new Date()) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

// A made-up office for `herdr-app check` and for previews (data/office/demo): `n` agents over
// a few spaces (nine over three by default; "agents=30" in the demo file for a crowd).
const DEMO_ROWS = [
  ["web", "working", "fix login"], ["web", "blocked", "migrate db"], ["web", "idle", "docs"], ["web", "working", "refactor api"],
  ["api", "done", "write tests"], ["api", "idle", "triage"], ["api", "working", "perf pass"],
  ["infra", "idle", "standup"], ["infra", "idle", "coffee"],
];
const DEMO_MORE = ["mobile", "data", "design", "ops", "billing", "search", "auth", "docs"];
const DEMO_STATUS = ["working", "working", "idle", "done", "working", "blocked", "idle"];
export function demoAgents(n = DEMO_ROWS.length) {
  return Array.from({ length: n }, (_, i) => {
    const [space, status, tab_name] = DEMO_ROWS[i] ?? [DEMO_MORE[Math.floor((i - DEMO_ROWS.length) / 3) % DEMO_MORE.length], DEMO_STATUS[i % DEMO_STATUS.length], `task ${i}`];
    return {
      address: `demo${i}`, pane: `demo${i}`, space, space_name: space, tab: `${space}-${i}`, tab_index: i, tab_name, status,
      app: i % 3 ? "claude-code" : "codex", program: { key: "agent", name: "Agent" }, title: "", seq: i, pinned: false, focused: i === 0,
    };
  });
}
export const DEMO = demoAgents();

// "每週" for a week-long window, "5 小時" for five hours.
export function windowName(minutes) {
  if (minutes >= 10000) return "每週";
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} 天`;
  return `${Math.round(minutes / 60)} 小時`;
}

// 371027 -> "371K", 1111396 -> "1.1M".
export function tokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

export function resetsIn(epochSeconds) {
  const ms = epochSeconds * 1000 - Date.now();
  if (!(ms > 0)) return "已重置";
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `${Math.floor(h / 24)} 天 ${h % 24} 小時後重置`;
  if (h >= 1) return `${h} 小時後重置`;
  return `${Math.max(1, Math.round(ms / 60000))} 分鐘後重置`;
}

// Stacked (desks above, lounge below) or side by side (desks left, lounge right), with the
// meeting room under the desks while a meeting runs. `pref`: "auto" picks whichever lets the
// room be drawn bigger in a stage of stageW x stageH pixels. `s` is the scale, at least 0.6.
export function pickLayout({ stageW, stageH, rows, meet, pref = "auto" }) {
  const deskH = WALL_H + rows * POD_H + DESK_PAD, meetH = meet ? MEET_H : 0, mo = { x: 0, y: deskH };
  const tall = { wide: false, meet, mo, w: SCENE_W, h: deskH + meetH + LOUNGE_H, lo: { x: 0, y: deskH + meetH } };
  const wide = { wide: true, meet, mo, w: SCENE_W * 2, h: Math.max(deskH + meetH, WALL_H + LOUNGE_H), lo: { x: SCENE_W, y: WALL_H } };
  const fit = (l) => Math.min(stageW / l.w, stageH / l.h);
  const pick = pref === "wide" ? wide : pref === "tall" ? tall : fit(wide) > fit(tall) ? wide : tall;
  return { ...pick, s: Math.max(0.6, fit(pick)) };
}

// How many pods one office holds in this stage: as many rows as fit while the room is still drawn
// at least READABLE times its art size (at least one row). More than that opens another office.
export const READABLE = 1;
export function podsPerOffice({ stageW, stageH, pref = "auto" }) {
  let rows = 1;
  while (rows < 12 && pickLayout({ stageW, stageH, rows: rows + 1, meet: false, pref }).s >= READABLE) rows++;
  return rows * PODS_PER_ROW;
}

// The command that opens a file with its default app. `platform` is Herdr's window().platform.
export function openFileCommand(platform, dir, name) {
  if (platform === "windows") return ["cmd", ["/c", "start", "", `${dir.replace(/[\\/]+$/, "")}\\${name}`]];
  const path = `${dir.replace(/\/+$/, "")}/${name}`;
  return platform === "macos" ? ["open", [path]] : ["xdg-open", [path]];
}
