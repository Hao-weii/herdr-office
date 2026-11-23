import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { lstatSync, readlinkSync } from "node:fs";
import { setupSidebar } from "../scripts/sidebar.mjs";
import { setupStatusLine, statusLineCommand } from "../scripts/setup-statusline.mjs";

test("status line backup, conflict protection, preservation and dry run", () => {
  const base = mkdtempSync(join(tmpdir(), "herdr-office-status-"));
  const home = join(base, "User With Spaces"), dir = join(home, ".claude"), file = join(dir, "settings.json");
  const lines = [];
  const run = (opts = {}) => setupStatusLine({ home, log: (m) => lines.push(m), warn: (m) => lines.push(m), ...opts });
  try {
    assert.equal(run({ dryRun: true }), "dry-run");
    assert.equal(existsSync(dir), false);
    mkdirSync(dir, { recursive: true });
    const original = '{"env":{"HELLO":"world"},"statusLine":{"type":"command","command":"existing"}}';
    writeFileSync(file, original);
    assert.equal(run(), "conflict");
    assert.match(lines.at(-1), /different statusLine/);
    assert.equal(readFileSync(file, "utf8"), original);
    run({ force: true, dryRun: true });
    assert.deepEqual(readdirSync(dir), ["settings.json"]);
    assert.equal(readFileSync(file, "utf8"), original);
    assert.equal(run({ force: true }), "configured");
    const settings = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(settings.env.HELLO, "world");
    assert.equal(settings.statusLine.type, "command");
    assert.equal(settings.statusLine.command, 'node "' + home.replaceAll("\\", "/") + '/.config/herdr-app/mods/office/statusline.mjs"');
    const backups = readdirSync(dir).filter((f) => f.startsWith("settings.json.bak-"));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(join(dir, backups[0]), "utf8"), original);
    assert.equal(run(), "unchanged");
    assert.equal(readdirSync(dir).length, 2);
    writeFileSync(file, '\uFEFF{"permissions":{"allow":["Read"]}}');
    run();
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).permissions.allow, ["Read"]);
    writeFileSync(file, "not valid json");
    assert.throws(() => run({ force: true }));
    assert.equal(readFileSync(file, "utf8"), "not valid json");
    writeFileSync(file, "[]");
    assert.throws(() => run({ force: true }), /JSON object/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("the status line command keeps the existing Windows form", () => {
  assert.equal(statusLineCommand("C:\\Users\\oright"), "node C:/Users/oright/.config/herdr-app/mods/office/statusline.mjs");
  assert.equal(statusLineCommand("/home/a/"), "node /home/a/.config/herdr-app/mods/office/statusline.mjs");
});

test("install.sh installs the mod, links the skill and sets the status line on macOS and Linux", { skip: process.platform === "win32" }, () => {
  const base = mkdtempSync(join(tmpdir(), "herdr-office-sh-"));
  const home = join(base, "home"), bin = join(base, "bin"), app = join(home, ".config", "herdr-app");
  mkdirSync(home);
  mkdirSync(bin);
  writeFileSync(join(bin, "herdr-app"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const env = { ...process.env, HOME: home, HERDR_APP_HOME: app, PATH: `${bin}:${process.env.PATH}` };
  const run = (...args) => execFileSync("bash", [resolve("install.sh"), ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const skill = resolve("skills/herdr-team");
  const links = [".claude/skills", ".codex/skills", ".gemini/config/skills"].map((d) => join(home, d, "herdr-team"));
  try {
    assert.match(run("--dry-run", "--statusline"), /Dry run only/);
    assert.equal(existsSync(join(app, "mods")), false);
    assert.equal(existsSync(join(home, ".claude")), false);

    run("--statusline");
    assert.equal(existsSync(join(app, "mods", "office", "main.js")), true);
    for (const link of links) {
      assert.equal(lstatSync(link).isSymbolicLink(), true);
      assert.equal(readlinkSync(link), skill);
    }
    const settings = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
    assert.equal(settings.statusLine.command, statusLineCommand(home));

    const again = run("--statusline");
    assert.match(again, /\[claude\] ok +herdr-team/);
    assert.match(again, /already configured/);

    rmSync(links[1]);
    mkdirSync(links[1]);
    assert.throws(() => run(), /real folder/);
    assert.throws(() => run("--bogus"), /Unknown option/);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test("sidebar setup clones when missing, patches layout and tabs, and is idempotent", () => {
  const appDir = mkdtempSync(join(tmpdir(), "herdr-office-sidebar-"));
  const layoutDir = join(appDir, "layouts");
  const tabsDir = join(appDir, "mods", "tabs-office");
  const sampleLayout = {
    id: "root",
    children: [
      { id: "tabs", type: "block", content: { mod: "tabs" } },
      { id: "panel-body", type: "stack", children: [{ id: "files", content: { mod: "files" } }, { id: "changes", content: { mod: "changes" } }] },
    ],
  };
  const sampleTabs = [
    'this.syncPanel(space, panel, body, enabled);',
    '.when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))',
    '.when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))',
  ].join("\n");
  const calls = [];
  const runHerdr = (args) => {
    calls.push(args);
    if (args[1] === "layout.clone") {
      mkdirSync(layoutDir, { recursive: true });
      writeFileSync(join(layoutDir, "office.json"), JSON.stringify(sampleLayout));
    }
    if (args[1] === "mod.clone") {
      mkdirSync(tabsDir, { recursive: true });
      writeFileSync(join(tabsDir, "main.js"), sampleTabs);
    }
  };
  try {
    setupSidebar({ appDir, dryRun: true, runHerdr, log: () => {} });
    assert.equal(calls.length, 0);
    assert.equal(existsSync(join(layoutDir, "office.json")), false);

    setupSidebar({ appDir, dryRun: false, runHerdr, log: () => {} });
    assert.equal(calls.length, 3);
    const layout = JSON.parse(readFileSync(join(layoutDir, "office.json"), "utf8"));
    assert.equal(layout.children[0].content.mod, "tabs-office");
    assert.equal(layout.children[1].children.some((c) => c.id === "office" && c.content.mod === "office"), true);
    const tabs = readFileSync(join(tabsDir, "main.js"), "utf8");
    assert.match(tabs, /\[...enabled, "office"\]/);
    assert.match(tabs, /panelButton\("office", "辦公室"/);

    setupSidebar({ appDir, dryRun: false, runHerdr, log: () => {} });
    assert.equal(calls.length, 4);
    assert.equal(tabs.match(/panelButton\("office"/g).length, 1);
  } finally {
    rmSync(appDir, { recursive: true, force: true });
  }
});
