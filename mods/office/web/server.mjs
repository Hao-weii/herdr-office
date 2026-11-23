// The office as a web page, so it can sit in its own desktop window on another screen
// (Herdr draws mods only inside its one window). Same art and logic as the mod.
//   node server.mjs           serve http://127.0.0.1:7421 (OFFICE_WEB_PORT picks another)
//   node server.mjs --open    start the server if it isn't running, then open the window
// The server reads what the mod reads: `herdr-app ls` (agents and status), `hc get` (titles,
// names, parents), data/office (talk, meetings, Claude sessions), usage.mjs and shared.json.
// A `demo` file in data/office swaps in the made-up office (logic.js DEMO), as in the panel.
// It stops on its own once no window has asked for the office in a few minutes.

import { execFile, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { delimiter, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO, TALK_MS, TOOL_NAMES } from "../logic.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MOD = join(HERE, "..");
const HOME = process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app");
const DATA = join(HOME, "data", "office");
const PORT = Number(process.env.OFFICE_WEB_PORT) || 7421;
const URL_BASE = `http://127.0.0.1:${PORT}`;
const IDLE_MS = 5 * 60000;

function run(cmd, args, timeout = 8000) {
  return new Promise((ok, fail) => {
    execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 16 << 20 }, (err, stdout) => (err ? fail(err) : ok(stdout)));
  });
}

const readJson = async (path, fallback) => {
  try { return JSON.parse((await readFile(path, "utf8")).replace(/^﻿/, "")); } catch { return fallback; }
};

const STATUSES = new Set(["working", "blocked", "done", "idle"]);
const statusOf = (s) => (s === "error" ? "blocked" : STATUSES.has(s) ? s : "idle");

// ---------- what the office shows ----------

let usage = null, usageAt = 0, usageRunning = false;
function refreshUsage() {
  if (usageRunning || Date.now() - usageAt < 60000) return;
  usageRunning = true;
  run(process.execPath, [join(MOD, "usage.mjs")], 20000)
    .then((out) => { usage = JSON.parse(out); usageAt = Date.now(); })
    .catch(() => { usageAt = Date.now(); /* keep the last reading */ })
    .finally(() => { usageRunning = false; });
}

const doneMeta = new Set();

// Claude Code's own subagents still running, per agent (as main.js polls them).
async function claudeSubs(agents) {
  const map = await readJson(join(DATA, "claude-sessions.json"), {});
  const subs = {};
  for (const a of agents) {
    const e = map[a.address];
    if (!e?.transcript || (a.status !== "working" && a.status !== "blocked")) continue;
    const dir = e.transcript.replace(/\.jsonl$/, "") + "/subagents";
    let files = [];
    try { files = (await readdir(dir)).filter((f) => f.endsWith(".meta.json")); } catch { continue; }
    for (const f of files) {
      const path = `${dir}/${f}`;
      if (doneMeta.has(path)) continue;
      const meta = await readJson(path, null);
      if (!meta) continue;
      if (meta.finished) { doneMeta.add(path); continue; }
      (subs[a.address] ??= []).push({ id: f.replace(/\.meta\.json$/, ""), kind: "claude", type: meta.agentType ?? "subagent", text: meta.description ?? "", status: "working" });
    }
  }
  return subs;
}

async function collect() {
  const shared = await readJson(join(HOME, "shared.json"), {});
  const settings = { style: shared["office.style"] ?? null, layout: shared["office.layout"] ?? null, daynight: shared["office.daynight"] ?? null };
  refreshUsage();
  // A file named `demo` in the data folder swaps in the made-up office, as the panel does.
  let demo = null;
  try { demo = await readFile(join(DATA, "demo"), "utf8"); } catch { /* not previewing */ }
  if (demo !== null) {
    const hour = demo.match(/hour=(\d+)/)?.[1];
    return { agents: DEMO, names: {}, interns: {}, talks: [], meeting: null, usage, ...settings, demoHour: hour === undefined ? null : Number(hour) % 24, at: Date.now() };
  }

  const [ls, live] = await Promise.all([
    run("herdr-app", ["ls"]).then(JSON.parse),
    run("hc", ["ls", "--json"]).then((out) => JSON.parse(out).terminals ?? []).catch(() => []),
  ]);
  const gets = await Promise.all(live.map((t) => run("hc", ["get", t.address, "--json"]).then(JSON.parse).catch(() => null)));
  const info = Object.fromEntries(gets.filter(Boolean).map((g) => [g.address, g]));

  const agents = [];
  for (const space of ls.spaces ?? []) {
    for (const tab of space.tabs ?? []) {
      for (const t of tab.terminals ?? []) {
        if (!t.app) continue;
        const g = info[t.terminal];
        agents.push({
          address: t.terminal,
          status: statusOf(t.status),
          app: t.app,
          program: { name: TOOL_NAMES[t.app] ?? t.app },
          title: g?.title ?? null,
          tab_name: tab.name,
          space: space.id,
          space_name: space.name,
          focused: !!(space.active && tab.active),
          seq: g?.created_ms ?? 0,
        });
      }
    }
  }
  const known = new Set(agents.map((a) => a.address));

  const names = {};
  for (const g of Object.values(info)) if (g.labels?.["office.name"]) names[g.address] = g.labels["office.name"];

  // Subagents: Claude Code's own, and agents started with `hc run` (terminals with a parent).
  const interns = await claudeSubs(agents).catch(() => ({}));
  for (const g of Object.values(info)) {
    if (!g.parent || g.state !== "live" || !g.status || !known.has(g.parent)) continue;
    const app = g.status.app ?? g.agent;
    (interns[g.parent] ??= []).push({
      id: g.address, kind: "hc", type: TOOL_NAMES[app] ?? app ?? "agent", text: g.name ?? g.address,
      status: statusOf(g.status.state),
    });
  }

  const now = Date.now();
  let talks = [];
  try {
    talks = (await readFile(join(DATA, "talk.jsonl"), "utf8")).trim().split("\n")
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter((x) => x && now - x.at < TALK_MS);
  } catch { /* no talk yet */ }
  const meeting = await readJson(join(DATA, "meeting.json"), null);
  return { agents, names, interns, talks, meeting, usage, ...settings, demoHour: null, at: now };
}

// Several windows polling at once share one reading.
let last = null, lastAt = 0, pending = null;
function state() {
  if (last && Date.now() - lastAt < 1000) return Promise.resolve(last);
  pending ??= collect().then((s) => { last = s; lastAt = Date.now(); return s; }).finally(() => { pending = null; });
  return pending;
}

// ---------- server ----------

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8" };

// A file under `root`, never outside it.
function inside(root, rel) {
  const full = resolve(root, "." + sep + decodeURIComponent(rel));
  return full.startsWith(resolve(root) + sep) ? full : null;
}

async function sendFile(res, path) {
  if (!path) return send(res, 404, "not found");
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(body);
  } catch { send(res, 404, "not found"); }
}

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((ok) => {
    let text = "";
    req.on("data", (c) => { text += c; if (text.length > 4096) req.destroy(); });
    req.on("end", () => ok(text));
  });
}

let lastSeen = Date.now();

function serve() {
  const server = createServer(async (req, res) => {
    // Only this machine's own pages: refuse other hosts (DNS rebinding) and other origins.
    const host = req.headers.host ?? "";
    if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return send(res, 403, "forbidden");
    const url = new URL(req.url, URL_BASE);
    const p = url.pathname;
    try {
      if (p === "/api/ping") return send(res, 200, "office");
      if (p === "/api/state") {
        lastSeen = Date.now();
        return send(res, 200, JSON.stringify(await state()), TYPES[".json"]);
      }
      if (p === "/api/focus" && req.method === "POST") {
        const origin = req.headers.origin;
        if (origin && origin !== URL_BASE && origin !== `http://localhost:${PORT}`) return send(res, 403, "forbidden");
        const { terminal } = JSON.parse((await readBody(req)) || "{}");
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(terminal ?? "")) return send(res, 400, "bad terminal");
        await run("herdr-app", ["do", "agent.focus", "--terminal", terminal]);
        return send(res, 200, "ok");
      }
      if (p === "/" || p === "/index.html") return sendFile(res, join(HERE, "index.html"));
      if (p === "/app.js") return sendFile(res, join(HERE, "app.js"));
      if (p === "/logic.js") return sendFile(res, join(MOD, "logic.js"));
      if (p === "/favicon.svg") return sendFile(res, join(MOD, "icon.svg"));
      if (p.startsWith("/img/")) return sendFile(res, inside(join(MOD, "img"), p.slice(5)));
      if (p.startsWith("/herdr/icons/")) return sendFile(res, inside(join(HOME, "icons"), p.slice(13)));
      return send(res, 404, "not found");
    } catch (e) {
      return send(res, 500, String(e?.message ?? e));
    }
  });
  server.listen(PORT, "127.0.0.1", () => console.log(`[office] ${URL_BASE}`));
  // Close the last window and the server goes too.
  setInterval(() => { if (Date.now() - lastSeen > IDLE_MS) process.exit(0); }, 30000).unref();
}

// ---------- --open ----------

async function alive() {
  try {
    const r = await fetch(`${URL_BASE}/api/ping`, { signal: AbortSignal.timeout(800) });
    return r.ok && (await r.text()) === "office";
  } catch { return false; }
}

// Chromium-based browsers open a page as an app: a window of its own, no tabs or address bar.
// Windows always has Edge; on macOS and Linux the first one installed is used, and without
// any of them the page opens in the default browser as an ordinary tab.
const MAC_APPS = ["Google Chrome", "Microsoft Edge", "Chromium", "Brave Browser"];
const LINUX_BINS = ["google-chrome", "google-chrome-stable", "microsoft-edge", "microsoft-edge-stable", "chromium", "chromium-browser", "brave-browser"];

export function windowCommand(platform, url, has) {
  const app = [`--app=${url}`, "--window-size=720,900"];
  if (platform === "win32") return ["cmd", ["/c", "start", "", "msedge", ...app]];
  if (platform === "darwin") {
    const name = MAC_APPS.find(has);
    return name ? ["open", ["-na", name, "--args", ...app]] : ["open", [url]];
  }
  const bin = LINUX_BINS.find(has);
  return bin ? [bin, app] : ["xdg-open", [url]];
}

function installed(name) {
  if (process.platform === "darwin") return spawnSync("open", ["-Ra", name], { stdio: "ignore" }).status === 0;
  return (process.env.PATH ?? "").split(delimiter).some((dir) => dir && existsSync(join(dir, name)));
}

function openWindow() {
  const [cmd, args] = windowCommand(process.platform, `${URL_BASE}/`, installed);
  spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
}

async function open() {
  if (!(await alive())) {
    spawn(process.execPath, [fileURLToPath(import.meta.url)], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    for (let i = 0; i < 40 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 200));
    if (!(await alive())) throw new Error(`office server did not start on ${URL_BASE}`);
  }
  openWindow();
}

// Run directly (not imported by the tests).
const isMain = !!process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain && process.argv.includes("--open")) {
  open().catch((e) => { console.error(e.message); process.exit(1); });
} else if (isMain) {
  serve();
}
