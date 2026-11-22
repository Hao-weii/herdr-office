// The office's pure logic: scene geometry, where each agent goes, which layout fits, and
// text formatting. No Herdr or GPUI imports, so tests run it with plain node (tests/).

// Scene units: each art piece is 200 wide; everything scales to fit the stage.
export const SCENE_W = 200, WALL_H = 48, ROW_H = 76, LOUNGE_H = 132, FILL_H = 76, PER_ROW = 3;
export const DESK_X = [34, 100, 166];
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
export const POSE_H = { walkA: 21, walkB: 21, walk: 21, stand: 21, standBack: 21, waveA: 21, waveB: 21, cheer: 21, sofa: 19, back: 16, typeA: 16, typeB: 16 };
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

// Where the agent goes, in scene units: [x of its middle, y of the sprite's top, pose].
// `n` is its place among agents of the same status; `lo` the lower room's top left.
export function spot(a, desk, n, lo) {
  if (a.status === "working") {
    const row = Math.floor(desk / PER_ROW), cx = DESK_X[desk % PER_ROW];
    return [cx, WALL_H + row * ROW_H + 33, "type"];
  }
  if (a.status === "blocked" || a.status === "done") {
    const lap = Math.floor(n / QUEUE_Y.length);
    return [lo.x + QUEUE_X[a.status] - lap * 5, lo.y + QUEUE_Y[n % QUEUE_Y.length] + lap * 3, a.status === "blocked" ? "wave" : "cheer"];
  }
  const [x, y, pose] = LOUNGE_SPOTS[n % LOUNGE_SPOTS.length];
  const lap = Math.floor(n / LOUNGE_SPOTS.length);
  return [lo.x + x + lap * 6, lo.y + y + lap * 4, pose];
}

// ---------- spaces ----------
// Each space's agents sit together, on a rug of their own with the space's name. A space starts
// a new row unless it fits in what is left of the current one. Returns each agent's desk, the
// groups (in order; `desks` ascending) and how many rows of desks the room needs (at least two).
export function seatBySpace(list) {
  const groups = [], byId = new Map();
  for (const a of list) {
    const id = a.space ?? a.space_name ?? "";
    let g = byId.get(id);
    if (!g) { g = { space: id, name: a.space_name ?? "", agents: [], desks: [] }; byId.set(id, g); groups.push(g); }
    g.agents.push(a.address);
  }
  const desk = {};
  let next = 0;
  for (const g of groups) {
    const used = next % PER_ROW;
    if (used && g.agents.length > PER_ROW - used) next += PER_ROW - used;
    for (const address of g.agents) { desk[address] = next; g.desks.push(next++); }
  }
  return { desk, groups, rows: Math.max(2, Math.ceil(next / PER_ROW)) };
}

// The rug under a group's desks: one rectangle per row it covers, in scene units.
export function rugRects(desks) {
  const rows = new Map();
  for (const d of desks) {
    const r = Math.floor(d / PER_ROW), c = d % PER_ROW, e = rows.get(r);
    rows.set(r, e ? [Math.min(e[0], c), Math.max(e[1], c)] : [c, c]);
  }
  return [...rows].map(([r, [c0, c1]]) => ({ x: DESK_X[c0] - 32, y: WALL_H + r * ROW_H + 1, w: DESK_X[c1] - DESK_X[c0] + 64, h: ROW_H - 2 }));
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

// A made-up office for `herdr-app check` and for previews (data/office/demo): three spaces.
export const DEMO = [
  ["web", "working", "fix login"], ["web", "blocked", "migrate db"], ["web", "idle", "docs"], ["web", "working", "refactor api"],
  ["api", "done", "write tests"], ["api", "idle", "triage"], ["api", "working", "perf pass"],
  ["infra", "idle", "standup"], ["infra", "idle", "coffee"],
].map(([space, status, tab_name], i) => ({
  address: `demo${i}`, pane: `demo${i}`, space, space_name: space, tab: `${space}-${i}`, tab_index: i, tab_name, status,
  app: i % 3 ? "claude-code" : "codex", program: { key: "agent", name: "Agent" }, title: "", seq: i, pinned: false, focused: i === 0,
}));

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
  const deskH = WALL_H + rows * ROW_H, meetH = meet ? MEET_H : 0, mo = { x: 0, y: deskH };
  const tall = { wide: false, meet, mo, w: SCENE_W, h: deskH + meetH + LOUNGE_H, lo: { x: 0, y: deskH + meetH } };
  const wide = { wide: true, meet, mo, w: SCENE_W * 2, h: Math.max(deskH + meetH, WALL_H + LOUNGE_H), lo: { x: SCENE_W, y: WALL_H } };
  const fit = (l) => Math.min(stageW / l.w, stageH / l.h);
  const pick = pref === "wide" ? wide : pref === "tall" ? tall : fit(wide) > fit(tall) ? wide : tall;
  return { ...pick, s: Math.max(0.6, fit(pick)) };
}
