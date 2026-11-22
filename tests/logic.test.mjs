// The office's pure logic: where agents go, which layout fits, and text formatting.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WALL_H, ROW_H, LOUNGE_H, MEET_H, SCENE_W, DESK_X, QUEUE_X, QUEUE_Y, LOUNGE_SPOTS, PALETTES,
  paletteOf, task, spot, windowName, tokens, resetsIn, pickLayout, meetingOn, toolOf,
  PER_ROW, seatBySpace, rugRects, errandSpot, WINDOW_X, phaseAt, clockText, DEMO,
} from "../mods/office/logic.js";

const lo = { x: 0, y: 200 };

test("an agent keeps its look: same address, same palette, always in range", () => {
  for (const a of ["t1", "t2", "t10", "vps/t7"]) {
    assert.equal(paletteOf(a), paletteOf(a));
    assert.ok(paletteOf(a) >= 0 && paletteOf(a) < PALETTES);
  }
});

test("a working agent sits at its own desk, three desks to a row", () => {
  assert.deepEqual(spot({ status: "working" }, 0, 0, lo), [DESK_X[0], WALL_H + 33, "type"]);
  assert.deepEqual(spot({ status: "working" }, 4, 0, lo), [DESK_X[1], WALL_H + ROW_H + 33, "type"]);
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
  assert.equal(narrow.h, WALL_H + 2 * ROW_H + LOUNGE_H);
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
  assert.deepEqual(on.mo, { x: 0, y: WALL_H + 2 * ROW_H });
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

test("each space's agents sit together; a space that won't fit the rest of a row starts a new one", () => {
  const { desk, groups, rows } = seatBySpace([ag("a1", "web"), ag("a2", "web"), ag("b1", "api"), ag("b2", "api"), ag("c1", "ops")]);
  assert.deepEqual(groups.map((g) => g.name), ["web", "api", "ops"]);
  assert.deepEqual([desk.a1, desk.a2], [0, 1]);
  // Two api agents don't fit the one desk left on row 0, so they take row 1.
  assert.deepEqual([desk.b1, desk.b2], [PER_ROW, PER_ROW + 1]);
  // One ops agent fits the desk left on row 1.
  assert.equal(desk.c1, PER_ROW + 2);
  assert.equal(rows, 2);
});

test("the room keeps at least two rows, and grows with the agents", () => {
  assert.equal(seatBySpace([]).rows, 2);
  assert.equal(seatBySpace([ag("a", "x")]).rows, 2);
  assert.equal(seatBySpace(DEMO).rows, 4);
  assert.equal(new Set(Object.values(seatBySpace(DEMO).desk)).size, DEMO.length);
});

test("a rug covers a group's desks, one rectangle per row", () => {
  const one = rugRects([0, 1]);
  assert.equal(one.length, 1);
  assert.equal(one[0].y, WALL_H + 1);
  assert.ok(one[0].x < DESK_X[0] && one[0].x + one[0].w > DESK_X[1]);
  const two = rugRects([2, 3, 4]);
  assert.equal(two.length, 2);
  assert.equal(two[1].y, WALL_H + ROW_H + 1);
  // Neighbouring groups' rugs on one row don't overlap.
  const [a] = rugRects([0]), [b] = rugRects([1]);
  assert.ok(a.x + a.w <= b.x);
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
