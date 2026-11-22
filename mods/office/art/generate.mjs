// Draws the office: room pieces (wall, a row of desks, the lounge) and the characters,
// as pixel SVGs in ../img/. Original art, drawn here in code; three styles, outlined shapes.
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
  },
};

let C = BASE;
let DIR = OUT;

// ---------- drawing ----------

class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.parts = []; }
  circle(cx, cy, r, fill) { this.parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" shape-rendering="geometricPrecision"/>`); return this; }
  rect(x, y, w, h, fill) { if (w > 0 && h > 0) this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`); return this; }
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

const DESK_X = [34, 100, 166];

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
  if (variant === "office") { plant(cv, 76, 30); plant(cv, 156, 30); } else plant(cv, 96, 30);
  cv.save(`${variant === "office" ? "wall" : "wall-lounge"}${phase ? `-${phase}` : ""}.svg`);
  C = saved;
}

// The floor under a row of desks. The desks come as their own see-through layer (deskrow.svg),
// so each space's rug can lie between the two.
function floorRow() {
  const cv = new Canvas(200, 76);
  floor(cv, 0, 0, 200, 76);
  cv.save("floor.svg");
}

// One long oak table with three stations, white task chairs in front. No floor: see floorRow.
function deskRow() {
  const cv = new Canvas(200, 76);
  cv.rect(8, 30, 186, 3, C.shadow);
  cv.box(6, 8, 188, 20, C.oak, C.oakHi, null);
  cv.box(6, 26, 188, 4, C.oakEdge);
  cv.box(10, 29, 3, 6, C.white).box(187, 29, 3, 6, C.white);
  DESK_X.forEach((cx, i) => {
    // display on an aluminium stand
    cv.box(cx - 11, 0, 22, 14, C.alu, null, C.aluLo);
    cv.rect(cx - 9, 2, 18, 10, C.screen).rect(cx - 9, 2, 18, 1, C.screenHi);
    cv.box(cx - 2, 13, 4, 5, C.aluLo).box(cx - 6, 17, 12, 2, C.alu);
    // keyboard and mouse
    cv.box(cx - 9, 20, 18, 4, C.white, null, C.gray1);
    cv.box(cx + 11, 20, 3, 4, C.white);
    if (i === 0) { cv.box(cx - 22, 12, 9, 11, C.snow, null, C.gray1).rect(cx - 20, 15, 5, 1, C.gray2).rect(cx - 20, 17, 5, 1, C.gray2); mug(cv, cx + 15, 12); }
    if (i === 1) { plant(cv, cx - 23, 7); cv.box(cx + 15, 13, 6, 4, C.white).rect(cx + 16, 14, 4, 1, C.gray1); }
    if (i === 2) { cv.box(cx - 22, 14, 8, 3, C.book[0]).box(cx - 22, 16, 8, 3, C.book[1]).box(cx - 21, 18, 7, 3, C.book[2]); mug(cv, cx + 15, 12); }
    cv.rect(cx - 8, 52, 16, 3, C.shadow);
    chair(cv, cx - 9, 41);
  });
  cv.save("deskrow.svg");
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
  out.typeA = [...BACK]; set(out.typeA, 9, 2, "S"); set(out.typeA, 10, 2, "T");
  out.typeB = [...BACK]; set(out.typeB, 9, 13, "S"); set(out.typeB, 10, 13, "T");
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
  deskRow();
  lounge();
  lounge(true);
  loungeFill();
  meetingRoom();
}
C = BASE;
DIR = OUT;
rings();
console.log(`wrote room pieces for ${Object.keys(STYLES).join(", ")} and ${characters()} character sprites to ${OUT}`);
