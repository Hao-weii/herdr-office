// Draws the office, courtyard and characters as pixel SVGs in ../img/.
// Original art, drawn here in code; three styles, outlined shapes.
// Run from ~/.config/herdr-app:  node mods/office/art/generate.mjs

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "img");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ---------- palettes ----------
// One room, three looks. BASE is "modern": glass walls, pale concrete, light oak, white furniture.
// Each style overrides colors (and a couple of switches: plank floor, stars, lamp glow).
// Room pieces go to img/<style>/; characters and rings, shared by all, to img/.

const BASE = {
  line: "#3a3a3c", shadow: "#0000001a",
  floorKind: "concrete", floor: "#ecebe6", floorB: "#e6e4dd", seam: "#e1dfd8", speck: "#dcd9d1",
  sky: "#e3f0f5", glass: "#d6e8efb3", glassSolid: "#d6e8ef", glassHi: "#f4fafc", alu: "#c9cdd2", aluLo: "#a7adb4",
  sill: "#e5e5ea", sillLo: "#d1d1d6",
  far: "#b9d3a8", treeA: "#7fb069", treeB: "#5e9a52", treeC: "#9cc584", trunk: "#8a6a4a",
  oak: "#e3c9a2", oakHi: "#efdcbd", oakLo: "#c8a87b", oakEdge: "#b8976a",
  white: "#ffffff", snow: "#f5f5f7", gray1: "#e5e5ea", gray2: "#d1d1d6", gray3: "#aeaeb2", gray4: "#8e8e93",
  screen: "#1c1c1e", screenHi: "#2c2c2e",
  sofa: "#d9d3c7", sofaHi: "#e8e3d9", sofaLo: "#bfb7a8", accent: "#a3b8c9", accentHi: "#bccbd8", accentLo: "#8aa0b3",
  rug: "#e4dfd5", rugBorder: "#d3ccbf", rugDot: "#d9d3c7",
  zone: "#dfe6ee", zoneBorder: "#c4cfdb", zoneDot: "#d2dbe6",
  leaf: "#5e9a52", leafHi: "#86bf6e", leafLo: "#467a3d",
  pot: "#f5f5f7", potHi: "#ffffff", potLo: "#d1d1d6",
  chairSeat: "#d5dee8", chairBack: "#5f7fa6", chairBackHi: "#7f9cc0",
  lampShade: "#ffffff", glow: false, stars: false,
  mug: "#ffffff", coffee: "#7a5236", book: ["#a3b8c9", "#d9a77a", "#9cc584", "#c9b6d9", "#e5e5ea"],
  cat: "#e59a4c", catLo: "#c27a33", catHi: "#f4c08a",
  grass: "#94b879", grassHi: "#a0c284", grassLo: "#7da465",
  hill: "#769c61", hillHi: "#99b879", hillLo: "#5d8251",
  gravel: "#e3d9bc", gravelEdge: "#aab286", gravelSpeck: "#c2b697",
  pond: "#579baf", pondDeep: "#46869e", pondEdge: "#447a7e", pondRipple: "#a2d4d5",
  flower: "#f3edcc", flowerCenter: "#dbac65",
  orchardLeaves: ["#709e54", "#89a867", "#71a173", "#628b6e", "#819e51"],
};

const STYLES = {
  modern: {},
  // Wood everywhere: plank floor, wooden window frames, walnut desks, green chairs, teal sofas.
  cozy: {
    line: "#3b2a1e", shadow: "#3b2a1e2a",
    floorKind: "planks", floor: "#dcb27a", floorB: "#d3a76e", seam: "#b98c57", speck: "#c4955e",
    sky: "#cfe9f2", glass: "#cfe7f080", glassSolid: "#cfe7f0", glassHi: "#eef8fb", alu: "#a8794e", aluLo: "#8a5f3a",
    sill: "#bd8d60", sillLo: "#8a5f3a",
    oak: "#c98d5a", oakHi: "#dba574", oakLo: "#a56d42", oakEdge: "#8a5a34",
    sofa: "#5f8f8b", sofaHi: "#76a8a3", sofaLo: "#4a7470", accent: "#e9c46a", accentHi: "#f3d68a", accentLo: "#c9a24a",
    rug: "#9db58a", rugBorder: "#7e9a6d", rugDot: "#b5c9a3",
    zone: "#7489b0", zoneBorder: "#5f7398", zoneDot: "#8a9ec4",
    pot: "#c4703f", potHi: "#d98c5a", potLo: "#9a5530",
    chairSeat: "#8bb985", chairBack: "#557a52", chairBackHi: "#6f9a6a",
    lampShade: "#f6d58b", book: ["#d0605e", "#5b8fc7", "#e3a646", "#6aa86a", "#9a72c2"],
    grass: "#9bac73", grassHi: "#a9b680", grassLo: "#83955e",
    hill: "#7a9157", hillHi: "#9faa6f", hillLo: "#607849",
    gravel: "#e6ceb0", gravelEdge: "#b4a17b", gravelSpeck: "#c8ad8b",
    pond: "#568e91", pondDeep: "#467a83", pondEdge: "#476f60", pondRipple: "#a8c9bd",
    flower: "#f5dfb1", flowerCenter: "#d79a5a",
    orchardLeaves: ["#7e994e", "#a3aa59", "#6a9b67", "#638264", "#8d9b54"],
  },
  // After dark: a starry sky, tree shadows, dark floor and furniture, warm lamp light.
  night: {
    line: "#0e0f12", shadow: "#00000040",
    floor: "#2a2c33", floorB: "#272930", seam: "#33363e", speck: "#30333a",
    sky: "#131a33", far: "#1a2638", treeA: "#1e3a2c", treeB: "#18302a", treeC: "#26493a", trunk: "#2a2320",
    glass: "#2a3a5566", glassSolid: "#2a3a55", glassHi: "#4a5e80", alu: "#4a4f5a", aluLo: "#3a3e48",
    sill: "#3a3e48", sillLo: "#30333a",
    oak: "#6b4a33", oakHi: "#7d5a40", oakLo: "#56392a", oakEdge: "#45301f",
    white: "#d8d8dc", snow: "#c8c8cc", gray1: "#9a9aa0", gray2: "#7a7a80", gray3: "#5a5a60", gray4: "#4a4a50",
    sofa: "#3d4a5c", sofaHi: "#4d5d72", sofaLo: "#2f3a49", accent: "#c9a24a", accentHi: "#e0bd66", accentLo: "#a5822f",
    rug: "#363a44", rugBorder: "#2c3038", rugDot: "#40444f",
    zone: "#2f3b52", zoneBorder: "#26304a", zoneDot: "#3a4762",
    leaf: "#3f7a44", leafHi: "#5a9a5c", leafLo: "#2e5e33",
    pot: "#4a4f5a", potHi: "#5a606c", potLo: "#3a3e48",
    chairSeat: "#5a6170", chairBack: "#3a4050", chairBackHi: "#4a5262",
    lampShade: "#ffe39a", glow: true, stars: true, mug: "#d8d8dc",
    grass: "#2e4947", grassHi: "#365451", grassLo: "#253e3e",
    hill: "#29483f", hillHi: "#3c5c50", hillLo: "#203632",
    gravel: "#737b80", gravelEdge: "#445555", gravelSpeck: "#616c74",
    pond: "#2c5167", pondDeep: "#234258", pondEdge: "#213a48", pondRipple: "#7ea9b3",
    flower: "#9eabb6", flowerCenter: "#b9a579",
    orchardLeaves: ["#345847", "#445a43", "#386052", "#344d50", "#435c47"],
  },
};

let C = BASE;
let DIR = OUT;

// ---------- drawing ----------

class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.parts = []; }
  circle(cx, cy, r, fill) { this.parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" shape-rendering="geometricPrecision"/>`); return this; }
  rect(x, y, w, h, fill) { if (w > 0 && h > 0) this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`); return this; }
  stroke(points, width, color) {
    this.parts.push(`<polyline points="${points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`);
    return this;
  }
  // An outlined block with a lit top row and a shaded bottom row.
  box(x, y, w, h, fill, hi, lo, line = C.line) {
    this.rect(x, y, w, h, line).rect(x + 1, y + 1, w - 2, h - 2, fill);
    if (hi) this.rect(x + 1, y + 1, w - 2, 1, hi);
    if (lo) this.rect(x + 1, y + h - 2, w - 2, 1, lo);
    return this;
  }
  map(x, y, rows, colors) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch === ".") return;
      if (!colors[ch]) throw new Error(`no color for ${ch}`);
      this.rect(x + i, y + j, 1, 1, colors[ch]);
    }));
    return this;
  }
  save(name) {
    writeFileSync(join(DIR, name), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w * 2}" height="${this.h * 2}" shape-rendering="crispEdges">${this.parts.join("")}</svg>\n`);
  }
}

// Gives a sprite map a dark outline on every empty cell touching a filled one.
function outline(rows, mark = "#") {
  const g = rows.map((r) => [...r]);
  const filled = (r, c) => rows[r]?.[c] !== undefined && rows[r][c] !== ".";
  return g.map((row, r) => row.map((ch, c) => (ch === "." && (filled(r - 1, c) || filled(r + 1, c) || filled(r, c - 1) || filled(r, c + 1)) ? mark : ch)).join(""));
}

// Polished concrete (big slabs, faint seams and specks), or planks in the cozy style.
function floor(cv, x, y, w, h) {
  if (C.floorKind === "planks") {
    for (let r = 0; r * 7 < h; r++) {
      const yy = y + r * 7, hh = Math.min(7, h - r * 7);
      cv.rect(x, yy, w, hh, r % 2 ? C.floor : C.floorB).rect(x, yy + hh - 1, w, 1, C.seam);
      for (let sx = x + ((r * 17) % 37); sx < x + w; sx += 37) {
        cv.rect(sx, yy, 1, hh - 1, C.seam);
        if ((sx + r) % 3 === 0) cv.rect(sx + 9, yy + 2, 2, 1, C.speck);
      }
    }
    return;
  }
  cv.rect(x, y, w, h, C.floor);
  for (let yy = y + 37; yy < y + h; yy += 38) cv.rect(x, yy, w, 1, C.seam);
  for (let xx = x + 49; xx < x + w; xx += 50) cv.rect(xx, y, 1, h, C.seam);
  for (let i = 0; i < (w * h) / 90; i++) {
    const px = x + ((i * 37 + 11) % w), py = y + ((i * 53 + 7) % h);
    cv.rect(px, py, 1, 1, C.speck);
  }
}

// A leafy plant in a white pot; `big` is an indoor tree.
function plant(cv, x, y, big = false) {
  const leaves = big ? [
    "....l..LL.......",
    "..lLL.LLLl..l...",
    ".lLLLlLLLLl.LL..",
    "..LLLLLdLLLLLLl.",
    ".lLLdLLLLLdLLL..",
    "LLLLLLdLLLLLLLl.",
    ".LLdLLLLLLdLLL..",
    "..LLLLdLLLLLL...",
    "...LLLLLLdLL....",
    "....LLdLLL......",
    "......t.........",
    "......t.........",
  ] : [
    "...l.LL...",
    ".lLLlLLl..",
    "lLLdLLLLl.",
    ".LLLLdLLL.",
    "..LdLLLL..",
    "...LLL....",
  ];
  const w = leaves[0].length;
  cv.map(x, y, outline(leaves), { "#": C.line, L: C.leaf, l: C.leafHi, d: C.leafLo, t: C.trunk });
  const pw = big ? 9 : 6, px = x + Math.floor((w - pw) / 2), py = y + leaves.length - 1;
  cv.box(px, py, pw, big ? 7 : 5, C.pot, C.potHi, C.potLo);
}

function mug(cv, x, y) {
  cv.box(x, y, 5, 5, C.mug, null, C.gray1).rect(x + 1, y + 1, 3, 1, C.coffee).rect(x + 5, y + 1, 1, 3, C.line);
}

// Rounded crowns of trees outside the glass.
function tree(cv, x, y, s) {
  const crown = s === 0 ? [
    "..aaaa..",
    ".aaabaa.",
    "aabaaaba",
    "aaaaabaa",
    ".abaaaa.",
    "..aaaa..",
  ] : [
    "...aaaa...",
    ".aaaabaaa.",
    "aabaaaaaba",
    "aaaaabaaaa",
    "abaaaaabaa",
    ".aaabaaaa.",
    "..aaaaaa..",
  ];
  cv.rect(x + Math.floor(crown[0].length / 2) - 1, y + crown.length - 1, 2, 12, C.trunk);
  cv.map(x, y, crown, { a: s === 0 ? C.treeA : C.treeB, b: C.treeC });
}

// ---------- room pieces ----------


// The sky through the glass at sunset and at night, for the day styles: the mod picks the wall
// that matches the clock. The glass gets thinner so the colors come through.
const PHASES = {
  dusk: {
    skyBands: ["#e9806a", "#f19a6a", "#f6b673", "#fbd08c"], sun: true,
    far: "#9a8470", treeA: "#6f6a4a", treeB: "#5a5840", treeC: "#86805a", trunk: "#5a4232",
  },
  night: {
    sky: "#1d2547", stars: true, moon: true,
    far: "#1a2638", treeA: "#1e3a2c", treeB: "#18302a", treeC: "#26493a", trunk: "#2a2320",
  },
};

// The top: a glass curtain wall with trees outside. "lounge" plants different trees.
// `phase`: "dusk" or "night" for the evening walls (wall-dusk.svg, wall-lounge-night.svg, …).
function wall(variant = "office", phase = null) {
  const saved = C;
  if (phase) C = { ...C, ...PHASES[phase], glass: `${C.glassSolid}40` };
  const cv = new Canvas(200, 48);
  cv.rect(0, 0, 200, 44, C.sky);
  if (C.skyBands) C.skyBands.forEach((c, i) => cv.rect(0, i * 7, 200, i === C.skyBands.length - 1 ? 44 - i * 7 : 7, c));
  if (C.sun) cv.circle(variant === "office" ? 150 : 60, 25, 7, "#ffe08a");
  if (C.stars) for (let i = 0; i < 40; i++) cv.rect((i * 47 + 13) % 200, (i * 29 + 5) % 24, 1, 1, i % 5 ? "#c9d3ff" : "#fff6c2");
  if (C.moon) cv.circle(variant === "office" ? 164 : 52, 11, 4, "#f5f0d0").circle(variant === "office" ? 166 : 54, 10, 3, C.sky);
  cv.rect(0, 26, 200, 18, C.far);
  const trees = variant === "office"
    ? [[6, 10, 1], [40, 14, 0], [70, 8, 1], [112, 13, 0], [142, 9, 1], [178, 12, 0]]
    : [[14, 12, 0], [44, 7, 1], [88, 11, 1], [126, 14, 0], [160, 8, 1]];
  for (const [x, y, s] of trees) tree(cv, x, y, s);
  cv.rect(0, 0, 200, 44, C.glass);
  for (const [x, y] of [[10, 6], [62, 4], [118, 8], [170, 5]]) for (let i = 0; i < 10; i++) cv.rect(x + i, y + i * 2, 2, 2, C.glassHi);
  for (let x = 0; x < 200; x += 40) cv.rect(x, 0, 2, 44, C.alu).rect(x + 2, 0, 1, 44, C.aluLo);
  cv.rect(0, 0, 200, 3, C.alu).rect(0, 3, 200, 1, C.aluLo);
  cv.rect(0, 42, 200, 2, C.alu).rect(0, 44, 200, 4, C.sill).rect(0, 47, 200, 1, C.sillLo);
  if (variant === "office") {
    plant(cv, 70, 30); plant(cv, 156, 30);
    // the way in: a glass door in an aluminium frame, a bar handle
    cv.box(89, 4, 22, 40, C.alu, null, C.aluLo).rect(91, 6, 18, 37, C.glassSolid).rect(91, 6, 18, 37, C.glass);
    for (let i = 0; i < 8; i++) cv.rect(93 + i, 9 + i * 3, 1, 3, C.glassHi);
    cv.box(105, 20, 2, 10, C.aluLo);
  } else plant(cv, 96, 30);
  cv.save(`${variant === "office" ? "wall" : "wall-lounge"}${phase ? `-${phase}` : ""}.svg`);
  C = saved;
}

// The floor under a row of pods. The pods come as their own see-through layer, so each space's
// rug can lie between the two.
function floorRow() {
  const cv = new Canvas(200, POD_H);
  floor(cv, 0, 0, 200, POD_H);
  cv.save("floor.svg");
}

// An island of four desks (pod.svg): a long oak table, two chairs on the far side turned toward
// us, two on the near side with their backs to us. The near pair's screens face us; the far
// pair's monitors show us their backs, and those go in podfront.svg, drawn over the people sitting
// behind them. Seats' middles at SEAT_X. No floor.
const POD_H = 84, SEAT_X = [26, 70];
function pod() {
  const cv = new Canvas(96, POD_H);
  for (const x of SEAT_X) chair(cv, x - 9, 4, true);
  cv.rect(6, 47, 86, 3, C.shadow);
  cv.box(4, 16, 88, 30, C.oak, C.oakHi, null);
  cv.box(4, 44, 88, 4, C.oakEdge);
  cv.box(8, 47, 3, 6, C.white).box(85, 47, 3, 6, C.white);
  for (const [i, x] of SEAT_X.entries()) {
    // near monitor, screen toward us, on a stand
    cv.box(x - 11, 26, 22, 13, C.alu, null, C.aluLo);
    cv.rect(x - 9, 28, 18, 9, C.screen).rect(x - 9, 28, 18, 1, C.screenHi);
    cv.box(x - 2, 38, 4, 3, C.aluLo).box(x - 6, 40, 12, 2, C.alu);
    cv.box(x - 9, 42, 18, 3, C.white, null, C.gray1);
    cv.box(x + 11, 42, 3, 3, C.white);
    if (i === 0) { cv.box(x - 20, 27, 8, 10, C.snow, null, C.gray1).rect(x - 18, 30, 4, 1, C.gray2).rect(x - 18, 32, 4, 1, C.gray2); }
    else { cv.box(x + 13, 29, 7, 3, C.book[0]).box(x + 13, 31, 7, 3, C.book[1]).box(x + 14, 33, 6, 3, C.book[2]); }
    cv.rect(x - 8, 70, 16, 3, C.shadow);
    chair(cv, x - 9, 59);
  }
  plant(cv, 43, 28);
  mug(cv, 40, 39); mug(cv, 52, 39);
  cv.save("pod.svg");
}

// The backs of the far pair's monitors, drawn in front of the people facing us.
function podFront() {
  const cv = new Canvas(96, POD_H);
  for (const x of SEAT_X) {
    cv.box(x - 11, 13, 22, 13, C.alu, C.white, C.aluLo);
    cv.rect(x - 1, 18, 2, 2, C.gray3);
    cv.box(x - 3, 25, 6, 2, C.aluLo);
  }
  cv.save("podfront.svg");
}

// An office chair seen from behind: the seat peeking over a padded back, a stem and wheels.
// `facing`: turned toward us (behind a desk): the seat in front, the back behind it.
const CHAIR = [
  "..................",
  "....ssssssssss....",
  "...BBBBBBBBBBBB...",
  "..BbbbbbbbbbbbbB..",
  "..BbbbbbbbbbbbbB..",
  "..BBbbbbbbbbbbBB..",
  "...BBBBBBBBBBBB...",
  "........pp........",
  "....oo..pp..oo....",
  "..................",
];
const CHAIR_FACING = [
  "..................",
  "...BBBBBBBBBBBB...",
  "..BbbbbbbbbbbbbB..",
  "..BBbbbbbbbbbbBB..",
  "...ssssssssssss...",
  "...ssssssssssss...",
  "..................",
];
function chair(cv, x, y, facing = false) {
  cv.map(x, y, outline(facing ? CHAIR_FACING : CHAIR), { "#": C.line, s: C.chairSeat, B: C.chairBack, b: C.chairBackHi, p: C.gray4, o: C.line });
}

function cat(cv, x, y) {
  cv.map(x, y, outline([
    "..o.....o.....",
    "..oo...oo.....",
    "..oooooooOOO..",
    ".ooeooeooOOOO.",
    ".oooowoooOOOOo",
    "..ooooooOOOOoo",
    "...OOOOOOOO.o.",
  ]), { "#": C.line, o: C.cat, O: C.catLo, e: C.line, w: C.catHi });
}

// A water cooler: a blue bottle on a white stand with two taps. 10 wide, 22 tall.
function waterCooler(cv, x, y) {
  cv.box(x + 2, y, 6, 8, "#a9d4f2", "#d6ecfa", "#86bde6");
  cv.box(x, y + 7, 10, 15, C.snow, C.white, C.gray1);
  cv.rect(x + 2, y + 10, 2, 2, "#d0605e").rect(x + 6, y + 10, 2, 2, "#5b8fc7");
  cv.rect(x + 2, y + 14, 6, 1, C.gray2);
}

// A glass panel in an aluminium frame.
function glassPanel(cv, x, y, w, h) {
  cv.rect(x, y, w, h, C.glassSolid).rect(x, y, w, h, C.glass);
  cv.rect(x, y, w, 1, C.alu).rect(x, y + h - 1, w, 1, C.aluLo).rect(x, y, 1, h, C.alu).rect(x + w - 1, y, 1, h, C.aluLo);
  if (w > h) for (let i = 4; i < w - 4; i += 24) cv.rect(x + i, y + 2, 6, 1, C.glassHi);
  else for (let i = 6; i < h - 6; i += 30) cv.rect(x + 1, y + i, 1, 8, C.glassHi);
}

// ---------- courtyard ----------

// Pixel ellipses use the centers of unit squares, like the sprite maps.
function ellipseReach(y, cy, rx, ry) {
  const dy = (y + 0.5 - cy) / ry;
  return rx * Math.sqrt(Math.max(0, 1 - dy * dy));
}

function ellipse(cv, cx, cy, rx, ry, fill) {
  for (let y = cy - ry; y < cy + ry; y++) {
    const half = Math.floor(ellipseReach(y, cy, rx, ry) + 0.5);
    cv.rect(cx - half, y, half * 2, 1, fill);
  }
}

function courtyardHill(cv) {
  // The offset cutout leaves a crescent on the north and east banks.
  for (let y = 24; y <= 48; y++) {
    const outside = Math.round(ellipseReach(y, 56, 39, 32));
    const inside = Math.round(ellipseReach(y, 61, 35, 26));
    const west = 160 - outside, east = Math.min(160 + outside, 190 + (48 - y) * 2);
    const slopes = y < 35 ? [[west, east]] : [[west, 151 - inside], [151 + inside, east]];
    for (const [left, right] of slopes) {
      cv.rect(left, y, right - left, 1, C.hillLo);
      if (y > 24 && y < 48) cv.rect(left + 1, y, right - left - 2, 1, C.hill);
      if (y >= 27 && y < 35) cv.rect(left + 5, y, right - left - 12, 1, C.hillHi);
    }
  }
  ellipse(cv, 158, 58, 28, 15, C.pondEdge);
  ellipse(cv, 158, 58, 27, 14, C.pond);
  ellipse(cv, 160, 60, 23, 11, C.pondDeep);
  for (const [x, y, w] of [[149, 47, 13], [139, 51, 7], [161, 53, 10], [151, 57, 7], [167, 62, 9], [142, 65, 7], [154, 69, 14]]) {
    cv.rect(x, y, w, 1, C.pondRipple);
  }
  for (const [x, y] of [[132, 56], [140, 69], [176, 67], [182, 56]]) {
    cv.map(x, y - 3, [".l..", ".l.l", "ll.l", ".ll."], { l: C.hillLo });
  }
  for (const [x, y, size] of [[132, 24, 0], [155, 21, 1], [181, 29, 1]]) {
    ellipse(cv, x + 6, y + 18, 6, 2, C.hillLo);
    tree(cv, x, y, size);
  }
}

const COURTYARD_PATH = [[100, 246], [100, 214], [86, 190], [92, 166], [118, 150], [140, 128], [128, 104], [104, 92], [96, 70], [118, 82]];

function courtyardPath(cv) {
  const loop = [...COURTYARD_PATH.slice(2), COURTYARD_PATH[2]];
  const approach = COURTYARD_PATH.slice(0, 3);
  cv.stroke(loop, 10, C.gravelEdge).stroke(approach, 10, C.gravelEdge);
  cv.stroke(loop, 8, C.gravel).stroke(approach, 8, C.gravel);
  for (const run of [approach, loop]) {
    for (let i = 1; i < run.length; i++) {
      const [x, y] = run[i - 1], [endX, endY] = run[i];
      const dx = endX - x, dy = endY - y, length = Math.hypot(dx, dy);
      for (let d = 3; d < length; d += 3) {
        const offset = (d + i) % 5 - 2;
        const px = Math.round(x + (dx * d - dy * offset) / length);
        const py = Math.round(y + (dy * d + dx * offset) / length);
        cv.rect(px, py, d % 2 ? 2 : 1, 1, C.gravelSpeck);
      }
    }
  }
}

function terraceTable(cv, x, y) {
  for (const dx of [-10, 10]) {
    for (const top of [y - 10, y + 7]) {
      const left = x + dx - 5;
      cv.rect(left, top + 8, 11, 2, C.shadow);
      cv.box(left + 1, top, 8, 9, C.chairSeat, C.chairBackHi, null);
      cv.box(left, top === y - 10 ? top : top + 6, 10, 3, C.chairBack);
    }
  }
  ellipse(cv, x + 1, y + 3, 13, 8, C.shadow);
  ellipse(cv, x, y + 2, 12, 7, C.line);
  ellipse(cv, x, y, 12, 7, C.line);
  ellipse(cv, x, y, 11, 6, C.oak);
  cv.rect(x - 6, y - 5, 12, 1, C.oakHi).rect(x - 8, y + 4, 16, 1, C.oakLo);
  cv.rect(x - 3, y - 1, 2, 2, C.mug).rect(x + 3, y + 1, 2, 2, C.mug);
}

function courtyardFacade(cv) {
  cv.rect(0, 248, 200, 32, C.aluLo);
  for (const [x, w] of [[0, 30], [30, 30], [60, 29], [111, 29], [140, 30], [170, 30]]) {
    glassPanel(cv, x, 252, w, 25);
    cv.map(x + 8, 256, ["...hh.", "..hh..", ".hh..h", "hh..h.", "...h..", "..h..."], { h: C.glassHi });
  }
  cv.rect(0, 248, 200, 2, C.sill).rect(0, 250, 200, 1, C.sillLo);
  cv.rect(0, 277, 200, 2, C.sill).rect(0, 279, 200, 1, C.line);
  cv.box(89, 248, 22, 32, C.alu, C.sill, C.aluLo);
  glassPanel(cv, 91, 251, 18, 26);
  cv.rect(99, 252, 1, 24, C.alu).rect(100, 252, 1, 24, C.aluLo);
  cv.rect(102, 260, 2, 7, C.line).rect(102, 260, 1, 6, C.alu);
  cv.rect(91, 277, 18, 1, C.sill);
}

function courtyard() {
  const cv = new Canvas(200, 280);
  cv.rect(0, 0, 200, 200, C.grass);
  for (const [x, y, rx, ry] of [[33, 69, 24, 15], [59, 80, 25, 16], [29, 117, 24, 17], [55, 118, 28, 20], [42, 154, 33, 23], [71, 165, 18, 15], [160, 153, 32, 25], [184, 168, 16, 20]]) {
    ellipse(cv, x, y, rx, ry, C.grassHi);
  }
  for (let i = 0; i < 310; i++) {
    const x = (i * 73 + 17) % 198, y = (i * 47 + Math.floor(i / 7) * 13) % 198;
    cv.rect(x, y, i % 3 ? 2 : 1, 1, i % 4 ? C.grassLo : C.grassHi);
  }
  for (const [x, y] of [[7, 40], [19, 183], [54, 191], [111, 172], [120, 109], [149, 111], [154, 147], [173, 119], [188, 144], [183, 192], [135, 180]]) {
    cv.map(x, y, [".f....", "fcf...", ".f...f", "....fc", ".....l"], { f: C.flower, c: C.flowerCenter, l: C.grassLo });
  }
  // The hedge follows the far end of the garden.
  cv.rect(0, 0, 200, 10, C.hillLo).rect(0, 0, 200, 2, C.aluLo);
  for (let x = 0; x < 200; x += 14) {
    ellipse(cv, x + 4, 10, 11, 10, C.treeB);
    ellipse(cv, x + 3, 8, 8, 6, C.treeA);
    ellipse(cv, x + 10, 15, 8, 7, C.hillLo);
    ellipse(cv, x + 9, 14, 6, 5, C.hill);
    cv.rect(x + 6, 12, 4, 1, C.treeC);
  }
  courtyardHill(cv);

  floor(cv, 0, 200, 200, 48);
  cv.rect(0, 200, 200, 1, C.sill).rect(0, 201, 200, 1, C.sillLo);
  courtyardPath(cv);
  for (const x of [40, 100, 160]) terraceTable(cv, x, 224);
  plant(cv, 6, 226);
  plant(cv, 184, 226);
  courtyardFacade(cv);
  cv.save("courtyard.svg");
}

// Each crown has its own silhouette, with branches and bare space below for the next sprite.
const ORCHARD_CROWNS = {
  apple: [[7, 10, 6, 7], [12, 8, 7, 7], [17, 11, 6, 7], [11, 14, 8, 5]],
  apricot: [[6, 12, 5, 6], [11, 7, 6, 6], [17, 10, 6, 6], [14, 15, 8, 5]],
  pear: [[12, 6, 4, 5], [11, 11, 6, 7], [14, 14, 7, 6], [9, 15, 6, 5]],
  plum: [[7, 10, 6, 7], [13, 7, 6, 6], [18, 12, 5, 7], [12, 15, 7, 5]],
  cherry: [[6, 10, 5, 6], [11, 7, 6, 6], [17, 8, 6, 6], [17, 14, 6, 5], [8, 15, 7, 4]],
};
const ORCHARD_TRUNK = ["tt...t", ".tt.tt", "..tTt.", "..tT..", "..tT..", "..tT..", "..tT..", ".ttTt.", "tttTtt"];

function orchard(kind, lobes, leaf) {
  const cv = new Canvas(24, 28);
  ellipse(cv, 13, 25, 10, 3, C.shadow);
  const rows = Array.from({ length: 28 }, (_, y) => Array.from({ length: 24 }, (_, x) => {
    for (const [cx, cy, rx, ry] of lobes) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      if ((dx + 0.25) ** 2 + (dy + 0.38) ** 2 < 0.26) return "h";
      return dy > 0.47 ? "s" : "l";
    }
    return ORCHARD_TRUNK[y - 16]?.[x - 9] ?? ".";
  }).join(""));
  cv.map(0, 0, outline(rows), { "#": C.hillLo, h: C.treeC, s: C.treeB, l: leaf, t: C.trunk, T: C.oakLo });
  cv.save(`orchard-${kind}.svg`);
}

// An opaque replacement for wall.svg's door at (89, 4). The jamb and rail on the
// right cover the edge of the glass leaf as it slides into the wall pocket.
function doorOpen() {
  const cv = new Canvas(22, 40);
  cv.rect(0, 0, 22, 40, C.line).rect(2, 3, 17, 34, C.grass);
  cv.rect(2, 3, 17, 10, C.sky).rect(2, 12, 17, 5, C.far);
  tree(cv, 3, 8, 0);
  cv.rect(2, 26, 17, 11, C.grass);
  cv.stroke([[15, 25], [12, 30], [11, 37]], 6, C.gravel);
  cv.map(3, 28, [".l...l", "lll.ll", "..l..l"], { l: C.grassLo });
  cv.rect(1, 1, 20, 2, C.alu).rect(1, 3, 1, 34, C.alu);
  cv.rect(18, 3, 1, 34, C.glassSolid).rect(19, 3, 2, 34, C.aluLo);
  cv.rect(18, 17, 1, 7, C.aluLo);
  cv.rect(1, 37, 20, 1, C.sill).rect(1, 38, 20, 1, C.aluLo);
  cv.rect(0, 39, 22, 1, C.line);
  cv.save("door-open.svg");
}

// The lower room: the lounge on the left (idle agents) and your desk on the right, where
// agents that need you queue up. `open`: no glass wall on top (the rooms sit side by side).
function lounge(open = false) {
  const cv = new Canvas(200, 132);
  floor(cv, 0, 0, 200, 132);
  if (!open) { glassPanel(cv, 0, 2, 86, 8); glassPanel(cv, 114, 2, 86, 8); }
  // ----- lounge -----
  cv.box(6, 20, 126, 104, C.rugBorder);
  cv.rect(8, 22, 122, 100, C.rug);
  for (let y = 28; y < 118; y += 9) for (let x = 14 + ((y / 9) % 2) * 4; x < 126; x += 9) cv.rect(x, y, 1, 1, C.rugDot);
  // modular sofa facing us
  cv.rect(26, 52, 88, 3, C.shadow);
  cv.box(22, 30, 8, 22, C.sofa, C.sofaHi, C.sofaLo).box(110, 30, 8, 22, C.sofa, C.sofaHi, C.sofaLo);
  cv.box(28, 26, 84, 13, C.sofaLo, C.sofa, null);
  cv.box(28, 38, 84, 14, C.sofa, C.sofaHi, C.sofaLo);
  cv.rect(56, 39, 1, 12, C.sofaLo).rect(84, 39, 1, 12, C.sofaLo);
  cv.box(31, 29, 9, 8, C.accent, C.accentHi, C.accentLo).box(101, 29, 9, 8, C.accent, C.accentHi, C.accentLo);
  // oak coffee table with rounded corners
  cv.rect(46, 79, 48, 3, C.shadow);
  cv.box(44, 62, 50, 16, C.oak, C.oakHi, C.oakLo);
  for (const [x, y] of [[44, 62], [93, 62], [44, 77], [93, 77]]) cv.rect(x, y, 1, 1, C.rug);
  cv.box(50, 66, 11, 7, C.snow, null, C.gray1).rect(52, 68, 7, 1, C.gray2);
  mug(cv, 68, 66);
  plant(cv, 78, 60);
  // second sofa, back to us
  cv.box(22, 92, 8, 22, C.sofa, C.sofaHi, C.sofaLo).box(110, 92, 8, 22, C.sofa, C.sofaHi, C.sofaLo);
  cv.box(28, 92, 84, 12, C.sofa, C.sofaHi, null);
  cv.box(28, 102, 84, 13, C.sofaLo, C.sofa, null);
  // white floor lamp, the cat on a cushion, an indoor tree
  if (C.glow) for (const [r, a] of [[24, "10"], [18, "16"], [12, "1f"], [7, "2a"]]) cv.circle(123, 32, r, `#ffe39a${a}`);
  cv.box(122, 30, 2, 24, C.gray3).box(116, 22, 14, 9, C.lampShade, null, C.gray1).box(118, 53, 10, 2, C.gray3);
  cv.box(98, 62, 20, 9, C.accent, C.accentHi, C.accentLo);
  cat(cv, 101, 57);
  plant(cv, 1, 94, true);
  waterCooler(cv, 4, 12);
  // ----- your desk -----
  glassPanel(cv, 134, 14, 5, 116);
  cv.box(141, 14, 57, 116, C.zoneBorder);
  cv.rect(143, 16, 53, 112, C.zone);
  for (let y = 20; y < 126; y += 8) for (let x = 147 + ((y / 8) % 2) * 4; x < 194; x += 8) cv.rect(x, y, 1, 1, C.zoneDot);
  chair(cv, 161, 7, true);
  cv.rect(147, 33, 46, 3, C.shadow);
  cv.box(145, 14, 50, 14, C.oak, C.oakHi, null);
  cv.box(145, 26, 50, 5, C.oakEdge);
  cv.box(147, 30, 3, 4, C.white).box(190, 30, 3, 4, C.white);
  // laptop seen from behind, a tray of papers, a small speaker
  cv.box(163, 15, 14, 9, C.alu, null, C.aluLo).rect(169, 18, 2, 2, C.white);
  cv.box(148, 17, 11, 8, C.white, null, C.gray1).rect(149, 18, 9, 2, C.snow).rect(149, 20, 9, 1, C.gray2);
  cv.map(182, 17, outline([".ggg.", "ggggg", "gGgGg", ".ggg."]), { "#": C.line, g: C.gray1, G: C.gray3 });
  plant(cv, 186, 108);
  cv.save(open ? "lounge-open.svg" : "lounge.svg");
}

// The meeting room: glass walls with a door, a long table with three seats on each side,
// a whiteboard. Shown only while a meeting is on.
const MEET_X = [64, 100, 136];
function meetingRoom() {
  const cv = new Canvas(200, 64);
  floor(cv, 0, 0, 200, 64);
  glassPanel(cv, 0, 1, 86, 6);
  glassPanel(cv, 114, 1, 86, 6);
  cv.box(30, 9, 140, 52, C.zoneBorder);
  cv.rect(32, 11, 136, 48, C.zone);
  for (let y = 15; y < 57; y += 8) for (let x = 36 + ((y / 8) % 2) * 4; x < 166; x += 8) cv.rect(x, y, 1, 1, C.zoneDot);
  // whiteboard with notes
  cv.box(6, 12, 20, 30, C.white, null, C.gray1);
  cv.rect(9, 16, 12, 1, "#5b8fc7").rect(9, 19, 9, 1, "#d0605e").rect(9, 22, 13, 1, "#6aa86a").rect(9, 25, 7, 1, "#5b8fc7");
  cv.box(7, 41, 2, 10, C.gray3).box(23, 41, 2, 10, C.gray3);
  for (const cx of MEET_X) chair(cv, cx - 9, 13, true);
  cv.rect(46, 41, 110, 3, C.shadow);
  cv.box(44, 24, 112, 16, C.oak, C.oakHi, C.oakLo);
  for (const cx of MEET_X) {
    cv.box(cx - 5, 26, 10, 5, C.snow, null, C.gray1).rect(cx - 3, 28, 6, 1, C.gray2);
    cv.box(cx - 5, 33, 10, 5, C.snow, null, C.gray1).rect(cx - 3, 35, 6, 1, C.gray2);
  }
  plant(cv, 77, 22);
  mug(cv, 118, 30);
  for (const cx of MEET_X) chair(cv, cx - 9, 40);
  plant(cv, 182, 44);
  cv.save("meeting.svg");
}

// Floor under the side-by-side lounge when the desks run taller than it.
function loungeFill() {
  const cv = new Canvas(200, 76);
  floor(cv, 0, 0, 200, 76);
  glassPanel(cv, 134, -2, 5, 80);
  cv.save("lounge-fill.svg");
}

// ---------- characters (16 px wide, outlined) ----------

const FRONT = [
  "................",
  ".....HHHHHH.....",
  "....HHhhHHHH....",
  "...HHhHHHHHHH...",
  "...HHSSSSSSHH...",
  "...HSSSSSSSSH...",
  "...SSESSSSESS...",
  "...SSESSSSESS...",
  "...SRSSSSSSRS...",
  "....SSSSSSSS....",
  ".....sSSSSs.....",
  "....TTTCCTTT....",
  "...TTTTCCTTTt...",
  "...TTTTTTTTTt...",
  "...STTTTTTTTS...",
  "....PPPPPPPP....",
  "....PPPPpPPP....",
  "....PPP..PPP....",
  "....PPP..PPP....",
  "....BBB..BBB....",
  "................",
];
const SLEEPY = { 6: "...SSSSSSSSSS...", 7: "...SEESSSSEES..." };
const HAPPY = { 6: "...SSSSSSSSSS...", 7: "...SEESSSSEES...", 9: "....SSSMMSSS...." };
const WORRIED = { 9: "....SSSSoSSS...." };
const SOFA_BODY = [
  "....TTTCCTTT....",
  "...TTTTCCTTTt...",
  "...TTTTTTTTSGG..",
  "...TTTTTTTTTGG..",
  "...PPPPPPPPPP...",
  "...PPPPPPPPPP...",
  "...BB......BB...",
  "................",
];
const BACK = [
  "................",
  ".....HHHHHH.....",
  "....HHHHhHHH....",
  "...HHHHhHHHHH...",
  "...HHHHHHHHHH...",
  "...HHHHHHHHHH...",
  "...SHHHHHHHHS...",
  "...HHHHHHHHHH...",
  "....HHHHHHHH....",
  ".....sSSSSs.....",
  "...TTTTTTTTTt...",
  "..TTTTTTTTTTtt..",
  "..TTTTTTTTTTtt..",
  "..TTTTTTTTTTtt..",
  "...TTTTTTTTtt...",
  "................",
];

const over = (base, o = {}) => base.map((r, i) => o[i] ?? r);
function set(grid, r, c, ch) { const a = [...grid[r]]; a[c] = ch; grid[r] = a.join(""); }

function poses() {
  const out = {};
  out.stand = over(FRONT);
  // walking: legs apart, then together
  out.walkA = over(FRONT, { 17: "...PPP....PPP...", 18: "...PPP....PPP...", 19: "...BBB....BBB..." });
  out.walkB = over(FRONT, { 17: ".....PPPPPP.....", 18: ".....PPPPPP.....", 19: ".....BBBBBB....." });
  out.sofa = [...over(FRONT, SLEEPY).slice(0, 11), ...SOFA_BODY];
  out.back = [...BACK];
  // standing, back to us (at the window, at the cooler): the back of the torso over the legs
  out.standBack = [...BACK.slice(0, 15), ...FRONT.slice(15)];
  // seated behind a monitor, facing us: head and shoulders (the monitor hides the rest)
  out.typeFront = over(FRONT).slice(0, 16);
  out.typeA = [...BACK]; set(out.typeA, 9, 2, "S"); set(out.typeA, 10, 2, "T");
  out.typeB = [...BACK]; set(out.typeB, 9, 13, "S"); set(out.typeB, 10, 13, "T");
  // slumped over the desk (out of quota / exhausted): head dropped low, eyes shut, arms resting on the desk
  out.slumpFront = [
    "................",
    "................",
    "................",
    "................",
    ".....HHHHHH.....",
    "....HHhhHHHH....",
    "...HHhHHHHHHH...",
    "...HHSSSSSSHH...",
    "...HSSSSSSSSH...",
    "...SSSSSSSSSS...",
    "...SEESSSSEES...",
    "...SRSSSSSSRS...",
    "..TTSSSSSSSSST..",
    "..TTTTTTTTTTTt..",
    "...TTTTTTTTtt...",
    "................",
  ];
  out.slumpBack = [
    "................",
    "................",
    "................",
    "...SS......SS...",
    "..TTTHHHHHHTTT..",
    "..TTTHHHhHHTTT..",
    "..TTTHHHHHHTTT..",
    "..TTTHHHHHHTTT..",
    "...TTHHHHHHTT...",
    "...TTHHHHHHTT...",
    "...TTTTTTTTTt...",
    "..TTTTTTTTTTtt..",
    "..TTTTTTTTTTtt..",
    "...TTTTTTTTtt...",
    "....TTTTTTtt....",
    "................",
  ];
  const wave = (col, top) => {
    const g = over(FRONT, WORRIED);
    set(g, 14, 12, "t");
    for (let r = top + 2; r <= 12; r++) set(g, r, col, "T");
    set(g, top, col, "S"); set(g, top + 1, col, "S");
    return g;
  };
  out.waveA = wave(13, 4);
  out.waveB = wave(14, 3);
  out.cheer = over(FRONT, HAPPY);
  for (const col of [2, 13]) {
    set(out.cheer, 14, col === 2 ? 3 : 12, "T");
    for (let r = 5; r <= 12; r++) set(out.cheer, r, col, "T");
    set(out.cheer, 3, col, "S"); set(out.cheer, 4, col, "S");
  }
  // the face for lists: the head, cropped
  out.head = over(FRONT).slice(0, 11).map((r) => r.slice(2, 14));
  for (const [k, g] of Object.entries(out)) g.forEach((r, i) => { if (r.length !== g[0].length) throw new Error(`${k} row ${i}: ${r.length}`); });
  return out;
}

const PALETTES = [
  { H: "#4a3328", h: "#6b4c3b", S: "#f6d2b0", s: "#e2b48e", T: "#6f9fd8", t: "#5582bb", C: "#ffffff", P: "#4a4f63", p: "#3b3f50" },
  { H: "#c96a3a", h: "#e08a55", S: "#f4cfa8", s: "#dfb08a", T: "#e9a24a", t: "#c9852f", C: "#fff4dc", P: "#5a4a3e", p: "#47392f" },
  { H: "#2f2a33", h: "#4a4352", S: "#e8b98e", s: "#d09d70", T: "#7fb07a", t: "#629360", C: "#ffffff", P: "#3d4a5c", p: "#2f3a49" },
  { H: "#e2c07a", h: "#f2d89b", S: "#f6d2b0", s: "#e2b48e", T: "#d9727a", t: "#bb5860", C: "#fff0f0", P: "#4a4f63", p: "#3b3f50" },
  { H: "#5b3f8a", h: "#7a5cab", S: "#a8724c", s: "#8f5d3c", T: "#a98bd6", t: "#8b6dbb", C: "#ffffff", P: "#3b3f50", p: "#2e3140" },
  { H: "#ece6dc", h: "#ffffff", S: "#f0c9a3", s: "#d8ab82", T: "#5fb3b0", t: "#469895", C: "#ffffff", P: "#4a4f63", p: "#3b3f50" },
];
const SHARED = { "#": C.line, E: C.line, R: "#f2a1a1", M: "#9a4a3a", o: "#9a4a3a", B: "#3b2a1e", G: C.mug };

function characters() {
  const all = poses();
  let n = 0;
  PALETTES.forEach((pal, i) => {
    for (const [pose, grid] of Object.entries(all)) {
      const g = outline(grid);
      const cv = new Canvas(g[0].length, g.length);
      cv.map(0, 0, g, { ...SHARED, ...pal });
      cv.save(`${pose}-${i}.svg`);
      n++;
    }
  });
  return n;
}

// ---------- quota rings ----------
// A gray track and one arc per percent, drawn from the top clockwise. Single color: the mod
// tints them with svg(), so they follow the theme.

function rings() {
  const R = 15, CX = 18, CY = 18, SW = 4.5;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">`;
  writeFileSync(join(OUT, "ring-track.svg"), `${head}<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#000" stroke-width="${SW}"/></svg>
`);
  for (let p = 0; p <= 100; p++) {
    let body = "";
    if (p >= 100) body = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#000" stroke-width="${SW}"/>`;
    else if (p > 0) {
      const a = (p / 100) * 2 * Math.PI;
      const x = (CX + R * Math.sin(a)).toFixed(3), y = (CY - R * Math.cos(a)).toFixed(3);
      body = `<path d="M ${CX} ${CY - R} A ${R} ${R} 0 ${p > 50 ? 1 : 0} 1 ${x} ${y}" fill="none" stroke="#000" stroke-width="${SW}" stroke-linecap="round"/>`;
    }
    writeFileSync(join(OUT, `ring-${p}.svg`), `${head}${body}</svg>
`);
  }
}

for (const [name, over] of Object.entries(STYLES)) {
  C = { ...BASE, ...over };
  DIR = join(OUT, name);
  mkdirSync(DIR, { recursive: true });
  wall();
  wall("lounge");
  // The night style is always night; the day styles get a sunset and a night wall.
  if (name !== "night") for (const phase of Object.keys(PHASES)) { wall("office", phase); wall("lounge", phase); }
  floorRow();
  pod();
  podFront();
  lounge();
  lounge(true);
  loungeFill();
  meetingRoom();
  courtyard();
  Object.entries(ORCHARD_CROWNS).forEach(([kind, lobes], i) => orchard(kind, lobes, C.orchardLeaves[i]));
  doorOpen();
}
C = BASE;
DIR = OUT;
rings();
console.log(`wrote room pieces for ${Object.keys(STYLES).join(", ")} and ${characters()} character sprites to ${OUT}`);
