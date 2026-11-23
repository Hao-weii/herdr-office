// Courtyard scene geometry, resting spots, and path loop.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COURT_W, COURT_H, COURT_DOOR, COURT_PATH, ORCHARD, COURT_SPOTS,
  courtSpot, pathPoint, courtyardRoute, courtyardStep,
} from "../mods/office/logic.js";

const SPRITE_H = 21;

test("all courtyard spots, door, path points, and trees fit within 200x280 (including sprite height 21)", () => {
  assert.equal(COURT_W, 200);
  assert.equal(COURT_H, 280);
  assert.equal(COURT_SPOTS.terrace.length, 12);
  assert.equal(COURT_SPOTS.tree.length, ORCHARD.length);
  assert.equal(COURT_PATH.length, 10);

  const spots = [
    ["door", COURT_DOOR],
    ...Object.entries(COURT_SPOTS).flatMap(([k, list]) => list.map((p, i) => [`${k}[${i}]`, p])),
    ...COURT_PATH.map((p, i) => [`path[${i}]`, p]),
  ];
  for (const [label, [x, y]] of spots) {
    assert.ok(x >= 0 && x <= COURT_W, `${label} x=${x} out of [0, ${COURT_W}]`);
    assert.ok(y >= 0 && y + SPRITE_H <= COURT_H, `${label} y=${y} (+${SPRITE_H}) out of [0, ${COURT_H}]`);
  }
  for (const [x, y, kind] of ORCHARD) {
    assert.ok(x >= 0 && x <= COURT_W, `tree ${kind} x=${x} out of bounds`);
    assert.ok(y >= 0 && y + 28 <= COURT_H, `tree ${kind} y=${y} (+28) out of bounds`);
  }
});

test("pond spots are all south of the pond and within distance 40 of its center (158, 58)", () => {
  const [cx, cy] = [158, 58];
  assert.ok(COURT_SPOTS.pond.length > 0);
  for (const [x, y, pose] of COURT_SPOTS.pond) {
    assert.ok(y > cy, `pond spot (${x}, ${y}) is not south of y=${cy}`);
    const dist = Math.hypot(x - cx, y - cy);
    assert.ok(dist <= 40, `pond spot (${x}, ${y}) distance ${dist.toFixed(2)} exceeds 40`);
    assert.equal(pose, "standBack");
  }
});

test("courtSpot wraps around with modulo and returns null for unknown kinds", () => {
  assert.deepEqual(courtSpot("terrace", 0), COURT_SPOTS.terrace[0]);
  assert.deepEqual(courtSpot("terrace", 12), COURT_SPOTS.terrace[0]);
  assert.deepEqual(courtSpot("terrace", 15), COURT_SPOTS.terrace[3]);
  assert.deepEqual(courtSpot("pond", 4), COURT_SPOTS.pond[1]);
  assert.deepEqual(courtSpot("meadow", 5), COURT_SPOTS.meadow[2]);
  assert.deepEqual(courtSpot("tree", 6), COURT_SPOTS.tree[0]);
  assert.deepEqual(courtSpot("tree", 7), [ORCHARD[1][0] + 10, ORCHARD[1][1] + 28 + 4, "stand"]);
  assert.equal(courtSpot("fountain", 0), null);
  assert.equal(courtSpot("toString", 0), null);
});

test("pathPoint walks indices 0..9 in order, then loops over indices 2..9", () => {
  for (let i = 0; i < 10; i++) {
    assert.deepEqual(pathPoint(i), COURT_PATH[i], `step ${i}`);
  }
  for (let i = 10; i < 26; i++) {
    const expected = COURT_PATH[2 + ((i - 2) % 8)];
    assert.deepEqual(pathPoint(i), expected, `loop step ${i}`);
  }
  assert.deepEqual(pathPoint(10), COURT_PATH[2]);
  assert.deepEqual(pathPoint(17), COURT_PATH[9]);
  assert.deepEqual(pathPoint(18), COURT_PATH[2]);
});

test("a courtyard walk crosses the indoor door, completes the loop and returns indoors", () => {
  const route = courtyardRoute("walk");
  assert.equal(courtyardStep(route, 0).place, null);
  assert.deepEqual(courtyardStep(route, route[0].duration).place, COURT_DOOR);
  assert.deepEqual(route.slice(1, -1).map(({ place }) => place.slice(0, 2)), [
    ...COURT_PATH, COURT_PATH[2], COURT_PATH[1], COURT_PATH[0],
  ]);
  const total = route.reduce((ms, step) => ms + step.duration, 0);
  assert.equal(courtyardStep(route, total - 1).place, null);
  assert.equal(courtyardStep(route, total), null);
});

test("each courtyard destination uses its resting pose and returns along the same path", () => {
  for (const area of Object.keys(COURT_SPOTS)) {
    const destination = courtSpot(area, 1);
    const route = courtyardRoute(area, 1);
    const stop = route.findIndex(({ place }) => place === destination);
    assert.ok(stop >= 2, area);
    const approach = route.slice(1, stop).map(({ place }) => place);
    assert.deepEqual(route.slice(stop + 1, -1).map(({ place }) => place), approach.reverse());
    assert.ok(route[stop].duration > route[0].duration, area);
  }
});
