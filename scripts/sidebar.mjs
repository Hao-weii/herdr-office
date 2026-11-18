// Configures an optional right-sidebar "辦公室" tab by cloning Herdr's shipped `main` layout
// and `tabs` mod (shipped files are overwritten on Herdr start).
// Run directly: node scripts/sidebar.mjs [--dry-run] [--app-dir <path>]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

function findNode(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

export function patchLayout(layout) {
  let changed = false;
  const tabs = findNode(layout, "tabs");
  if (tabs?.content?.mod === "tabs") {
    tabs.content.mod = "tabs-office";
    changed = true;
  }
  const body = findNode(layout, "panel-body");
  if (body && Array.isArray(body.children)) {
    const hasOffice = body.children.some((c) => c.id === "office" || c.content?.mod === "office");
    if (!hasOffice) {
      body.children.push({ id: "office", type: "block", content: { mod: "office" } });
      changed = true;
    }
  }
  return changed;
}

export function patchTabsSource(source) {
  let next = source;
  if (!next.includes('[...enabled, "office"]')) {
    next = next.replace(
      "this.syncPanel(space, panel, body, enabled);",
      'this.syncPanel(space, panel, body, [...enabled, "office"]);',
    );
  }
  if (!next.includes('panelButton("office"')) {
    const anchor = '.when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))';
    if (next.includes(anchor)) {
      next = next.replace(
        anchor,
        `${anchor}\n      .child(panelButton("office", "辦公室", "mods/workspace-chrome/monitor.svg"))`,
      );
    }
  }
  return { source: next, changed: next !== source };
}

function defaultRunHerdr(args) {
  execFileSync("herdr-app", args, { stdio: "inherit" });
}

export function setupSidebar({
  appDir = join(homedir(), ".config", "herdr-app"),
  dryRun = false,
  runHerdr = defaultRunHerdr,
  log = (msg) => console.log(msg),
} = {}) {
  const layoutPath = join(appDir, "layouts", "office.json");
  const tabsMainPath = join(appDir, "mods", "tabs-office", "main.js");

  if (!existsSync(layoutPath)) {
    if (dryRun) log("[sidebar] would clone layout main -> office");
    else runHerdr(["do", "layout.clone", "--name", "main", "--as", "office"]);
  }

  if (existsSync(layoutPath)) {
    const layout = JSON.parse(readFileSync(layoutPath, "utf8"));
    if (patchLayout(layout)) {
      if (dryRun) log(`[sidebar] would update ${layoutPath}`);
      else writeFileSync(layoutPath, JSON.stringify(layout, null, 2) + "\n", "utf8");
    } else {
      log("[sidebar] layout office.json already configured");
    }
  } else if (dryRun) {
    log(`[sidebar] would update ${layoutPath}`);
  } else {
    throw new Error(`Expected layout file was not created: ${layoutPath}`);
  }

  if (!existsSync(tabsMainPath)) {
    if (dryRun) log("[sidebar] would clone mod tabs -> tabs-office");
    else runHerdr(["do", "mod.clone", "--name", "tabs", "--as", "tabs-office"]);
  }

  if (existsSync(tabsMainPath)) {
    const src = readFileSync(tabsMainPath, "utf8");
    const patched = patchTabsSource(src);
    if (patched.changed) {
      if (dryRun) log(`[sidebar] would update ${tabsMainPath}`);
      else writeFileSync(tabsMainPath, patched.source, "utf8");
    } else {
      log("[sidebar] mod tabs-office already configured");
    }
  } else if (dryRun) {
    log(`[sidebar] would update ${tabsMainPath}`);
  } else {
    throw new Error(`Expected mod file was not created: ${tabsMainPath}`);
  }

  if (dryRun) {
    log("[sidebar] would switch to layout office");
  } else {
    runHerdr(["do", "layout.switch", "--name", "office"]);
    log("[sidebar] configured layout office with 辦公室 panel");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const dirIndex = args.indexOf("--app-dir");
  const appDir = dirIndex >= 0 && args[dirIndex + 1] ? args[dirIndex + 1] : undefined;
  setupSidebar({ appDir, dryRun });
}
