import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
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
