// The office's pure logic: where agents go, which layout fits, and text formatting.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WALL_H, POD_H, POD_X, SEAT_X, LOUNGE_H, MEET_H, SCENE_W, QUEUE_X, QUEUE_Y, LOUNGE_SPOTS, PALETTES,
  paletteOf, task, spot, windowName, tokens, resetsIn, pickLayout, meetingOn, toolOf,
  menuItems, nextInQueue, DESK_PAD, tagWidth, packTags, seatAt, seatPlace, podRect, assignSeats, podsPerOffice, demoAgents, errandSpot, WINDOW_X, phaseAt, clockText, DEMO,
} from "../mods/office/logic.js";

const lo = { x: 0, y: 200 };

test("an agent keeps its look: same address, same palette, always in range", () => {
  for (const a of ["t1", "t2", "t10", "vps/t7"]) {
    assert.equal(paletteOf(a), paletteOf(a));
    assert.ok(paletteOf(a) >= 0 && paletteOf(a) < PALETTES);
  }
});

test("a working agent sits at its seat: near seats back to us, far seats facing us", () => {
  assert.deepEqual(spot({ status: "working" }, 0, 0, lo), [POD_X[0] + SEAT_X[0], WALL_H + 51, "type"]);
  assert.deepEqual(spot({ status: "working" }, 3, 0, lo), [POD_X[0] + SEAT_X[1], WALL_H + 3, "typeFront"]);
  // Pod 1 is to the right of pod 0; pod 2 starts the next row.
  assert.equal(spot({ status: "working" }, 4, 0, lo)[0], POD_X[1] + SEAT_X[0]);
  assert.equal(spot({ status: "working" }, 8, 0, lo)[1], WALL_H + POD_H + 51);
});

test("agents that need the person queue at the person's desk: waiting left, finished right", () => {
  assert.deepEqual(spot({ status: "blocked" }, 0, 0, lo), [lo.x + QUEUE_X.blocked, lo.y + QUEUE_Y[0], "wave"]);
  assert.deepEqual(spot({ status: "done" }, 3, 1, lo), [lo.x + QUEUE_X.done, lo.y + QUEUE_Y[1], "cheer"]);
  // A full queue starts a second, slightly offset line rather than stacking on one spot.
  const fifth = spot({ status: "blocked" }, 0, QUEUE_Y.length, lo);
  assert.notDeepEqual(fifth, spot({ status: "blocked" }, 0, 0, lo));
});

test("idle agents fill the lounge spots in order, then go round again offset", () => {
  const [x, y, pose] = LOUNGE_SPOTS[0];
  assert.deepEqual(spot({ status: "idle" }, 0, 0, { x: 200, y: 48 }), [200 + x, 48 + y, pose]);
  assert.notDeepEqual(spot({ status: "idle" }, 0, LOUNGE_SPOTS.length, lo), spot({ status: "idle" }, 0, 0, lo));
});

test("a narrow panel stacks the rooms, a wide one puts them side by side", () => {
  const narrow = pickLayout({ stageW: 380, stageH: 640, rows: 2, meet: false });
  assert.equal(narrow.wide, false);
  assert.equal(narrow.h, WALL_H + 2 * POD_H + DESK_PAD + LOUNGE_H);
  const wide = pickLayout({ stageW: 860, stageH: 450, rows: 2, meet: false });
  assert.equal(wide.wide, true);
  assert.equal(wide.w, SCENE_W * 2);
  assert.deepEqual(wide.lo, { x: SCENE_W, y: WALL_H });
});

test("the person's layout choice wins over what fits", () => {
  assert.equal(pickLayout({ stageW: 860, stageH: 450, rows: 2, meet: false, pref: "tall" }).wide, false);
  assert.equal(pickLayout({ stageW: 380, stageH: 640, rows: 2, meet: false, pref: "wide" }).wide, true);
});

test("a meeting adds the meeting room under the desks and moves the lounge down", () => {
  const off = pickLayout({ stageW: 380, stageH: 640, rows: 2, meet: false, pref: "tall" });
  const on = pickLayout({ stageW: 380, stageH: 640, rows: 2, meet: true, pref: "tall" });
  assert.equal(on.h - off.h, MEET_H);
  assert.equal(on.lo.y - off.lo.y, MEET_H);
  assert.deepEqual(on.mo, { x: 0, y: WALL_H + 2 * POD_H + DESK_PAD });
});

test("the room never shrinks below a readable scale", () => {
  assert.equal(pickLayout({ stageW: 10, stageH: 10, rows: 2, meet: false }).s, 0.6);
});

test("what an agent is on: a named tab, else its own title, never a path or a bare number", () => {
  assert.equal(task({ tab_name: "fix login", title: "x" }), "fix login");
  assert.equal(task({ tab_name: "1", title: "✦  Working on tests" }), "Working on tests");
  assert.equal(task({ tab_name: "1", title: "C:\\Users\\me\\repo" }), "");
  assert.equal(task({ tab_name: "2", title: "t4", address: "t4" }), "");
});

test("quota windows and token counts read naturally", () => {
  assert.equal(windowName(10080), "每週");
  assert.equal(windowName(300), "5 小時");
  assert.equal(tokens(371027), "371K");
  assert.equal(tokens(1111396), "1.1M");
  assert.equal(tokens(25_000_000), "25M");
  assert.equal(tokens(42), "42");
});

test("reset times count down and say when they have passed", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.equal(resetsIn(now - 10), "已重置");
  assert.match(resetsIn(now + 3 * 3600 + 60), /^3 小時後重置$/);
  assert.match(resetsIn(now + 50 * 3600 + 120), /^2 天 2 小時後重置$/);
  assert.match(resetsIn(now + 90), /分鐘後重置$/);
});

test("a meeting counts as on only while running and recently updated", () => {
  assert.equal(meetingOn(null), false);
  assert.equal(meetingOn({ status: "running", updated_at: Date.now() }), true);
  assert.equal(meetingOn({ status: "done", updated_at: Date.now() }), false);
  assert.equal(meetingOn({ status: "running", updated_at: Date.now() - 60 * 60000 }), false);
});

test("tools get their usual names", () => {
  assert.equal(toolOf({ app: "claude-code" }), "Claude Code");
  assert.equal(toolOf({ app: "antigravity" }), "agy");
  assert.equal(toolOf({ program: { name: "Pi" } }), "Pi");
});

const ag = (address, space) => ({ address, space, space_name: space });

test("each space gets its own pod; a pod's four seats fill near side first", () => {
  const { seats, owner, pods } = assignSeats([ag("a1", "web"), ag("a2", "web"), ag("b1", "api"), ag("a3", "web")]);
  assert.deepEqual([seats.a1, seats.a2, seats.a3], [0, 1, 2]);
  assert.equal(seats.b1, 4);
  assert.deepEqual(owner, { 0: "web", 1: "api" });
  assert.equal(pods, 2);
  assert.equal(seatAt(0).north, false);
  assert.equal(seatAt(2).north, true);
});

test("an agent keeps its seat when others come and go", () => {
  const first = assignSeats([ag("a1", "web"), ag("b1", "api"), ag("b2", "api")]).seats;
  // A new web agent and a departed one change nothing for the rest.
  const next = assignSeats([ag("a0", "web"), ag("a1", "web"), ag("b2", "api")], first).seats;
  assert.equal(next.a1, first.a1);
  assert.equal(next.b2, first.b2);
  assert.equal(next.a0, 1);
});

test("a full pod sends its space to an empty pod, else a new one; a vacated pod is free again", () => {
  const web = ["w1", "w2", "w3", "w4", "w5"].map((x) => ag(x, "web"));
  const { seats, owner } = assignSeats([...web, ag("o1", "ops")]);
  assert.equal(seats.w5, 4);
  assert.equal(seats.o1, 8);
  assert.deepEqual(owner, { 0: "web", 1: "web", 2: "ops" });
  // Web shrinks to one pod: the next new space takes pod 1, not a new pod 3.
  const later = assignSeats([ag("w1", "web"), ag("o1", "ops"), ag("x1", "x")], seats);
  assert.equal(later.seats.x1, 4);
});

test("a seat someone clicked waits for its space's next agent", () => {
  const { seats } = assignSeats([ag("a1", "web"), ag("a2", "web")], { a1: 0 }, Infinity, [{ space: "web", seat: 3 }]);
  assert.equal(seats.a2, 3);
  // Another space can't take it.
  const other = assignSeats([ag("b1", "api")], {}, Infinity, [{ space: "web", seat: 0 }]);
  assert.equal(other.seats.b1, 4);
});

test("pods sit two to a row, each with its rug rectangle", () => {
  assert.equal(podRect(0).x, POD_X[0]);
  assert.equal(podRect(1).x, POD_X[1]);
  assert.equal(podRect(2).y, WALL_H + POD_H + 1);
  assert.ok(podRect(0).x + podRect(0).w <= podRect(1).x);
  assert.deepEqual(seatPlace(1), [POD_X[0] + SEAT_X[1], WALL_H + 51, "type"]);
});

test("the demo office has the size asked for, every agent seated once", () => {
  assert.equal(demoAgents(30).length, 30);
  const { seats } = assignSeats(demoAgents(30));
  assert.equal(new Set(Object.values(seats)).size, 30);
  assert.equal(DEMO.length, 9);
});
test("errands take an idle agent to the cooler, the window, the cat, or beside a coworker", () => {
  assert.deepEqual(errandSpot("water", lo), [lo.x + 9, lo.y + 22, "standBack"]);
  assert.equal(errandSpot("window", lo, 0)[0], WINDOW_X[0]);
  assert.notDeepEqual(errandSpot("window", lo, 0), errandSpot("window", lo, 1));
  assert.notDeepEqual(errandSpot("window", lo, 0), errandSpot("window", lo, WINDOW_X.length));
  assert.equal(errandSpot("chat", lo, 0, [34, 81, "type"])[0], 34 + 15);
  assert.equal(errandSpot("chat", lo), null);
});

test("the window follows the clock: day, sunset, night", () => {
  const at = (h) => new Date(2026, 0, 1, h, 30);
  assert.equal(phaseAt(at(6)), "day");
  assert.equal(phaseAt(at(16)), "day");
  assert.equal(phaseAt(at(17)), "dusk");
  assert.equal(phaseAt(at(19)), "night");
  assert.equal(phaseAt(at(2)), "night");
  assert.equal(clockText(new Date(2026, 0, 1, 9, 5)), "09:05");
});

test("an office holds as many pods as fit at a readable size, at least one row", () => {
  // A tall side panel fits more rows than a short one.
  const tall = podsPerOffice({ stageW: 360, stageH: 900 });
  const short = podsPerOffice({ stageW: 360, stageH: 380 });
  assert.ok(tall > short);
  assert.equal(short % 2, 0);
  assert.ok(podsPerOffice({ stageW: 50, stageH: 50 }) >= 2);
});

test("a full office opens the next one; a space stays in its office while it has room", () => {
  // Two pods per office: web takes pods 0 and 1, so api starts office 2 at pod 2.
  const web = Array.from({ length: 7 }, (_, i) => ag(`w${i}`, "web"));
  const { seats, offices } = assignSeats([...web, ag("a1", "api")], {}, 2);
  assert.equal(Math.floor(seats.a1 / 4), 2);
  assert.equal(offices, 2);
  // An eighth web agent fills pod 1's last seat instead of moving to office 2.
  const more = assignSeats([...web, ag("w7", "web"), ag("a1", "api")], seats, 2);
  assert.equal(Math.floor(more.seats.w7 / 4), 1);
  // A ninth: office 1 is full, so web opens a pod in office 2 next to api.
  const ninth = assignSeats([...web, ag("w7", "web"), ag("w8", "web"), ag("a1", "api")], more.seats, 2);
  assert.equal(Math.floor(ninth.seats.w8 / 4), 3);
});

test("the wall shows the space tags that fit in two lines, then a +N chip", () => {
  const w = tagWidth("web");
  assert.ok(tagWidth("網站") > tagWidth("ab"));
  // Room for exactly two tags a line.
  const width = 2 * w + 4;
  assert.equal(packTags([w, w, w], width), 3);
  assert.equal(packTags([w, w, w, w], width), 4);
  // A fifth doesn't fit: three tags and the chip.
  assert.equal(packTags([w, w, w, w, w], width, 2, 4, w), 3);
  assert.equal(packTags([], width), 0);
});

test("the right-click menu fits the agent's status, stopping work last", () => {
  const ids = (a) => menuItems(a).map((x) => x.id);
  assert.equal(ids({ status: "blocked" })[0], "focus");
  assert.ok(!ids({ status: "blocked" }).includes("dispatch"));
  assert.equal(ids({ status: "working" })[0], "peek");
  assert.ok(ids({ status: "working" }).includes("interrupt"));
  assert.ok(!ids({ status: "idle" }).includes("interrupt"));
  assert.equal(ids({ status: "idle" })[0], "dispatch");
  assert.equal(ids({ status: "done" })[0], "focus");
  for (const status of ["blocked", "done", "working", "idle"]) {
    const items = menuItems({ status });
    const firstDanger = items.findIndex((x) => x.danger);
    if (firstDanger >= 0) assert.ok(items.slice(firstDanger).every((x) => x.danger));
  }
  assert.equal(menuItems({ status: "idle", pinned: true }).find((x) => x.id === "pin").label, "取消釘選");
  assert.deepEqual(ids({ intern: true }), ["peek", "focus", "kill"]);
});

test("the next one at the person's desk: the longest-waiting blocked, else a finished one", () => {
  const a = (address, status, seq) => ({ address, status, seq });
  assert.equal(nextInQueue([a("d", "done", 1), a("b2", "blocked", 9), a("b1", "blocked", 3)]).address, "b1");
  assert.equal(nextInQueue([a("w", "working", 1), a("d", "done", 5)]).address, "d");
  assert.equal(nextInQueue([a("w", "working", 1)]), null);
});
