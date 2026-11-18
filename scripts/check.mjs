// Syntax-checks every script in the repo with `node --check`. Imports are not resolved, so the
// mod's own files (which import Herdr's "gpui-kit" and "herdr" modules) check fine outside Herdr.
// `herdr-app check mods/office` is the real load test; it needs the Herdr app, so it runs locally.

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", "img"]);

function scripts(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (SKIP.has(d.name)) return [];
    const p = join(dir, d.name);
    if (d.isDirectory()) return scripts(p);
    return /\.(m?js)$/.test(d.name) && !d.name.endsWith(".d.ts") ? [p] : [];
  });
}

let failed = 0;
for (const f of scripts(ROOT)) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
    console.log(`ok    ${relative(ROOT, f)}`);
  } catch (e) {
    failed++;
    console.error(`FAIL  ${relative(ROOT, f)}\n${e.stderr}`);
  }
}
process.exit(failed ? 1 : 0);
