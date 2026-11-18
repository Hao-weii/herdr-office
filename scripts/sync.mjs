// Copies mods/office into the Herdr app's mods folder, so Herdr hot-reloads it.
//   node scripts/sync.mjs           mirror once
//   node scripts/sync.mjs --watch   mirror now and on every save
//
// Why not a link: Herdr watches its own folder for changes, and on Windows saves behind a
// junction never reach that watcher, so the mod would stop reloading. The repo stays the
// source; the copy in Herdr is a mirror (files Herdr writes itself are left alone).
// HERDR_APP_HOME overrides the Herdr folder (default ~/.config/herdr-app).

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, watch } from "node:fs";
import { dirname, join, relative } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "mods", "office");
const HOME = process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app");
const DEST = join(HOME, "mods", "office");
// Written by Herdr into every mod folder on start; not ours to copy or delete.
const HERDR_OWNED = new Set(["jsconfig.json", "gpui-kit.d.ts"]);

function files(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return files(p, base);
    return HERDR_OWNED.has(d.name) || d.name.endsWith(".error") ? [] : [relative(base, p)];
  });
}

function mirror() {
  if (existsSync(DEST) && !statSync(DEST).isDirectory()) throw new Error(`${DEST} is not a folder`);
  mkdirSync(DEST, { recursive: true });
  const want = new Set(files(SRC));
  let copied = 0, removed = 0;
  for (const f of want) {
    const from = join(SRC, f), to = join(DEST, f);
    if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs && statSync(to).size === statSync(from).size) continue;
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    copied++;
  }
  for (const f of files(DEST)) if (!want.has(f)) { rmSync(join(DEST, f)); removed++; }
  console.log(`[sync] ${new Date().toLocaleTimeString()} copied ${copied}, removed ${removed} -> ${DEST}`);
}

mirror();
if (process.argv.includes("--watch")) {
  let timer = null;
  watch(SRC, { recursive: true }, () => { clearTimeout(timer); timer = setTimeout(() => { try { mirror(); } catch (e) { console.error(e.message); } }, 150); });
  console.log(`[sync] watching ${SRC}`);
}
