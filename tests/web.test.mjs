// The desktop-window server (mods/office/web/server.mjs): serves the page and art, and only to
// this machine's own pages. /api/state needs a running Herdr, so it is not tested here.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { windowCommand } from "../mods/office/web/server.mjs";

const PORT = 7400 + Math.floor(Math.random() * 90);

test("the desktop window opens as an app window where a Chromium browser is installed", () => {
  const url = "http://127.0.0.1:7421/";
  const app = [`--app=${url}`, "--window-size=720,900"];
  const only = (...names) => (n) => names.includes(n);
  assert.deepEqual(windowCommand("win32", url, only()), ["cmd", ["/c", "start", "", "msedge", ...app]]);
  // macOS: the first browser found, in order of preference.
  assert.deepEqual(windowCommand("darwin", url, only("Chromium", "Microsoft Edge")), ["open", ["-na", "Microsoft Edge", "--args", ...app]]);
  assert.deepEqual(windowCommand("darwin", url, only()), ["open", [url]]);
  assert.deepEqual(windowCommand("linux", url, only("chromium-browser")), ["chromium-browser", app]);
  assert.deepEqual(windowCommand("linux", url, only()), ["xdg-open", [url]]);
});
const BASE = `http://127.0.0.1:${PORT}`;

function get(path, headers = {}) {
  return new Promise((ok, fail) => {
    const req = request(`${BASE}${path}`, { headers }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => ok({ status: res.statusCode, type: res.headers["content-type"], body }));
    });
    req.on("error", fail);
    req.end();
  });
}

test("web server serves the office and refuses what isn't its own", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "herdr-office-web-"));
  mkdirSync(join(home, "icons"));
  writeFileSync(join(home, "icons", "claude.svg"), "<svg/>");
  writeFileSync(join(home, "shared.json"), "{\"secret\":1}");
  const server = spawn(process.execPath, [resolve("mods/office/web/server.mjs")], {
    env: { ...process.env, HERDR_APP_HOME: home, OFFICE_WEB_PORT: String(PORT) },
    stdio: "ignore",
  });
  t.after(() => { server.kill(); rmSync(home, { recursive: true, force: true }); });
  for (let i = 0; i < 50; i++) {
    try { if ((await get("/api/ping")).body === "office") break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  const page = await get("/");
  assert.equal(page.status, 200);
  assert.match(page.body, /<title>辦公室<\/title>/);
  assert.match((await get("/app.js")).type, /javascript/);
  assert.match((await get("/logic.js")).body, /export function pickLayout/);
  assert.equal((await get("/img/typeA-0.svg")).type, "image/svg+xml");
  assert.equal((await get("/herdr/icons/claude.svg")).body, "<svg/>");

  // Nothing outside the art and icon folders.
  assert.equal((await get("/herdr/icons/..%2Fshared.json")).status, 404);
  assert.equal((await get("/img/..%2Fweb%2Fserver.mjs")).status, 404);
  // Only pages served from this machine's own address (no DNS rebinding).
  assert.equal((await get("/api/ping", { host: "evil.example" })).status, 403);

  const post = (body, origin) => fetch(`${BASE}/api/focus`, { method: "POST", body, headers: origin ? { origin } : {} });
  assert.equal((await post(JSON.stringify({ terminal: "t1; rm -rf /" }))).status, 400);
  assert.equal((await post(JSON.stringify({ terminal: "t1" }), "http://evil.example")).status, 403);
});
