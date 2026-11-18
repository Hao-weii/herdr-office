import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { setupSidebar } from "../scripts/sidebar.mjs";
const quote = s => "'" + s.replaceAll("'", "''") + "'";
test("status line backup, conflict protection, preservation and DryRun", {skip: process.platform !== "win32"}, () => {
  const base=mkdtempSync(join(tmpdir(),"herdr-office-status-"));
  const user=join(base,"User With Spaces"),dir=join(user,".claude"),file=join(dir,"settings.json");
  const helper=resolve("scripts/statusline.ps1");
  const run=(flags="")=>execFileSync("powershell.exe",["-NoProfile","-Command",
    "$ErrorActionPreference='Stop'; . "+quote(helper)+"; Set-OfficeStatusLine -UserDirectory "+quote(user)+" "+flags],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  try {
    run("-DryRun");assert.equal(existsSync(dir),false);
    mkdirSync(dir,{recursive:true});
    const original='{"env":{"HELLO":"world"},"statusLine":{"type":"command","command":"existing"}}';
    writeFileSync(file,original);
    assert.match(run(),/different statusLine/);assert.equal(readFileSync(file,"utf8"),original);
    run("-Force -DryRun");assert.deepEqual(readdirSync(dir),["settings.json"]);
    assert.equal(readFileSync(file,"utf8"),original);
    run("-Force");
    const settings=JSON.parse(readFileSync(file,"utf8"));
    assert.equal(settings.env.HELLO,"world");assert.equal(settings.statusLine.type,"command");
    assert.equal(settings.statusLine.command,'node "'+user.replaceAll("\\","/")+'/.config/herdr-app/mods/office/statusline.mjs"');
    const backups=readdirSync(dir).filter(f=>f.startsWith("settings.json.bak-"));
    assert.equal(backups.length,1);assert.equal(readFileSync(join(dir,backups[0]),"utf8"),original);
    run();assert.equal(readdirSync(dir).length,2);
    writeFileSync(file,'{"permissions":{"allow":["Read"]}}');
    run();assert.deepEqual(JSON.parse(readFileSync(file,"utf8")).permissions.allow,["Read"]);
    writeFileSync(file,"not valid json");
    assert.throws(()=>run("-Force"));assert.equal(readFileSync(file,"utf8"),"not valid json");
  } finally {rmSync(base,{recursive:true,force:true});}
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
