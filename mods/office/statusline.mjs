// Claude Code status line: saves the plan usage Claude Code passes in, for the office panel,
// and prints a short line under the prompt. Set in ~/.claude/settings.json as
//   "statusLine": { "type": "command", "command": "node C:/Users/<you>/.config/herdr-app/mods/office/statusline.mjs" }
// Writes ~/.config/herdr-app/data/office/claude-usage.json.

import { writeFileSync, mkdirSync, renameSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(raw); } catch { /* print what we can */ }
  const rl = input.rate_limits ?? {};
  const windows = [
    rl.five_hour && { label: "5 小時額度", used: rl.five_hour.used_percentage, resets_at: rl.five_hour.resets_at },
    rl.seven_day && { label: "每週額度", used: rl.seven_day.used_percentage, resets_at: rl.seven_day.resets_at },
  ].filter((w) => w && typeof w.used === "number");

  try {
    const dir = join(homedir(), ".config", "herdr-app", "data", "office");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "claude-usage.json");
    // Only overwrite with real numbers: one session without them must not erase another's.
    if (windows.length || !raw.includes("rate_limits")) {
      writeFileSync(`${file}.tmp`, JSON.stringify({ windows, has_rate_limits: "rate_limits" in input, at: Date.now() }));
      renameSync(`${file}.tmp`, file);
    }
  } catch { /* the status line still prints */ }

  // Which Claude session runs in which Herdr terminal, so the office can find this session's
  // subagents (<transcript>/subagents/*.meta.json) and draw them next to it.
  try {
    const term = process.env.HC_TERMINAL_ID;
    if (term && input.transcript_path) {
      const file = join(homedir(), ".config", "herdr-app", "data", "office", "claude-sessions.json");
      let map = {};
      try { map = JSON.parse(readFileSync(file, "utf8")); } catch { /* first one */ }
      const now = Date.now();
      map[term] = { session: input.session_id ?? null, transcript: input.transcript_path, at: now };
      for (const [k, v] of Object.entries(map)) if (now - (v?.at ?? 0) > 2 * 86400000) delete map[k];
      writeFileSync(`${file}.tmp`, JSON.stringify(map));
      renameSync(`${file}.tmp`, file);
    }
  } catch { /* the status line still prints */ }

  const parts = [];
  const model = input.model?.display_name;
  if (model) parts.push(model);
  for (const w of windows) parts.push(`${w.label.replace("額度", "")} ${Math.round(w.used)}%`);
  const ctx = input.context_window?.used_percentage;
  if (typeof ctx === "number") parts.push(`上下文 ${Math.round(ctx)}%`);
  process.stdout.write(parts.join(" · "));
});
