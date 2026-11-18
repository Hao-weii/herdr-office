// The office's pure logic: where agents go, which layout fits, and text formatting.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WALL_H, ROW_H, LOUNGE_H, MEET_H, SCENE_W, DESK_X, QUEUE_X, QUEUE_Y, LOUNGE_SPOTS, PALETTES,
  paletteOf, task, spot, windowName, tokens, resetsIn, pickLayout, meetingOn, toolOf,
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
