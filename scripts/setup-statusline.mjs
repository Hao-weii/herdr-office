// Points Claude Code's status line at the installed office/statusline.mjs. Used by install.ps1
// and install.sh. Keeps every other setting, backs settings.json up before writing, and leaves
// a different status line alone unless forced.
//   node scripts/setup-statusline.mjs [--home <dir>] [--dry-run] [--force]

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The command Claude Code runs: forward slashes everywhere, quoted when the path has spaces.
export function statusLineCommand(home) {
  const script = `${home.replace(/[\\/]+$/, "")}/.config/herdr-app/mods/office/statusline.mjs`.replaceAll("\\", "/");
  return /\s/.test(script) ? `node "${script}"` : `node ${script}`;
}

const stamp = () => {
  const d = new Date(), p = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
};

// Returns what it did: "configured", "unchanged", "conflict" or "dry-run".
export function setupStatusLine({ home = homedir(), dryRun = false, force = false, log = console.log, warn = console.warn } = {}) {
  const file = join(home, ".claude", "settings.json");
  const command = statusLineCommand(home);
  const exists = existsSync(file);
  let settings = {};
  if (exists) {
    settings = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      throw new Error(`${file} must contain a JSON object. Settings were not changed.`);
    }
  }
  const previous = settings.statusLine;
  if (previous?.type === "command" && previous.command === command) {
    log("[statusLine] already configured");
    return "unchanged";
  }
  if (previous && !force) {
    warn(`[statusLine] a different statusLine exists in ${file}. Kept it unchanged; add --force (-Force on Windows) to replace it.`);
    return "conflict";
  }
  const backup = `${file}.bak-${stamp()}`;
  if (dryRun) {
    log(exists ? `[statusLine] would back up ${file} -> ${backup}` : `[statusLine] would create ${file}`);
    log(`[statusLine] would set type=command; command=${command}`);
    return "dry-run";
  }
  if (exists) copyFileSync(file, backup);
  else mkdirSync(dirname(file), { recursive: true });
  settings.statusLine = { type: "command", command };
  writeFileSync(file, JSON.stringify(settings, null, 2) + "\n", "utf8");
  log(`[statusLine] configured ${file}`);
  return "configured";
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--home");
  try {
    setupStatusLine({ home: at >= 0 && args[at + 1] ? args[at + 1] : undefined, dryRun: args.includes("--dry-run"), force: args.includes("--force") });
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
