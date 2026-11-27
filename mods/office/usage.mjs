// Prints the usage the office shows, as JSON: { providers, codex, claude, claudePlan }.
// `providers`: each tool used in the last week (Claude Code, Codex, agy), most recent first.
// Run by the office mod with node (exec), about once a minute.
//  - codex: the newest `rate_limits` Codex's session logs carry (~/.codex/sessions/YYYY/MM/DD/*.jsonl).
//  - claude: tokens Claude Code used today and in the last 5 hours, summed from its transcripts
//    (~/.claude/projects/*/*.jsonl). Read incrementally: data/office/claude-cache.json remembers
//    how far each file was read and the replies of the last day.
//  - claudePlan: the plan percentages, only if a status line script saved them (claude-usage.json).

import { readdir, stat, open, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const DATA = join(HOME, ".config", "herdr-app", "data", "office");
const DAY = 86400000;

async function newestDirs(dir, depth) {
  if (depth === 0) return [dir];
  let names = [];
  try { names = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; }
  names.sort().reverse();
  const out = [];
  for (const n of names.slice(0, 3)) out.push(...(await newestDirs(join(dir, n), depth - 1)));
  return out;
}

// Bytes [from, end) of a file.
async function readRange(file, from, end) {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(Math.max(0, end - from));
    await fh.read(buf, 0, buf.length, from);
    return buf;
  } finally { await fh.close(); }
}

async function codex() {
  const days = await newestDirs(join(HOME, ".codex", "sessions"), 3);
  const files = [];
  for (const d of days.slice(0, 3)) {
    let names = [];
    try { names = await readdir(d); } catch { continue; }
    for (const n of names.filter((n) => n.endsWith(".jsonl"))) {
      const f = join(d, n);
      files.push({ f, s: await stat(f) });
    }
  }
  files.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
  let best = null;
  let bestAt = -1;
  for (const { f, s } of files.slice(0, 8)) {
    const lines = (await readRange(f, Math.max(0, s.size - 400_000), s.size)).toString("utf8").split("\n").reverse();
    for (const line of lines) {
      if (!line.includes('"rate_limits"')) continue;
      try {
        const row = JSON.parse(line);
        const rl = row.payload?.rate_limits ?? row.rate_limits;
        if (!rl) continue;
        const ts = row.timestamp ? Date.parse(row.timestamp) : NaN;
        const at = Number.isFinite(ts) ? ts : s.mtimeMs;
        if (at > bestAt) {
          bestAt = at;
          const win = (w) => w && { used: w.used_percent, minutes: w.window_minutes, resets_at: w.resets_at };
          best = { plan: rl.plan_type ?? null, windows: [win(rl.primary), win(rl.secondary)].filter(Boolean), at: row.timestamp ?? null };
        }
        break;
      } catch { /* a cut-off first line */ }
    }
  }
  return best;
}

async function claude() {
  let cache = { files: {}, replies: {} };
  try { cache = JSON.parse(await readFile(join(DATA, "claude-cache.json"), "utf8")); } catch { /* first run */ }
  const now = Date.now();
  const root = join(HOME, ".claude", "projects");
  let projects = [];
  try { projects = await readdir(root, { withFileTypes: true }); } catch { return null; }
  for (const p of projects.filter((d) => d.isDirectory())) {
    let names = [];
    try { names = await readdir(join(root, p.name)); } catch { continue; }
    for (const n of names.filter((n) => n.endsWith(".jsonl"))) {
      const f = join(root, p.name, n);
      const s = await stat(f);
      if (now - s.mtimeMs > DAY) continue;
      const seen = cache.files[f];
      let from = seen && seen.size <= s.size ? seen.offset : 0;
      // A file never seen and bigger than 8 MB: its old part is older than a day anyway.
      if (!seen && s.size > 8_000_000) from = s.size - 8_000_000;
      if (from >= s.size) continue;
      const buf = await readRange(f, from, s.size);
      const lastNl = buf.lastIndexOf(10);
      if (lastNl < 0) continue;
      for (const line of buf.subarray(0, lastNl).toString("utf8").split("\n")) {
        if (!line.includes('"usage"') || !line.includes('"assistant"')) continue;
        try {
          const row = JSON.parse(line);
          const u = row.message?.usage;
          if (row.type !== "assistant" || !u) continue;
          const t = Date.parse(row.timestamp);
          if (!(now - t < DAY)) continue;
          // Streaming writes one reply over several lines: the last one counts.
          cache.replies[row.message.id ?? row.uuid] = [t, u.output_tokens ?? 0, (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), u.cache_read_input_tokens ?? 0];
        } catch { /* a line cut by the first read */ }
      }
      cache.files[f] = { size: s.size, offset: from + lastNl + 1 };
    }
  }
  for (const [k, r] of Object.entries(cache.replies)) if (now - r[0] > DAY) delete cache.replies[k];
  for (const [f, v] of Object.entries(cache.files)) if (!v) delete cache.files[f];
  await mkdir(DATA, { recursive: true });
  await writeFile(join(DATA, "claude-cache.json"), JSON.stringify(cache));

  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const sum = (since) => {
    const out = { replies: 0, output: 0, input: 0, cached: 0 };
    for (const [t, o, i, c] of Object.values(cache.replies)) if (t >= since) { out.replies++; out.output += o; out.input += i; out.cached += c; }
    return out;
  };
  return { today: sum(midnight.getTime()), hours5: sum(now - 5 * 3600000) };
}

async function claudePlan() {
  try { return JSON.parse(await readFile(join(DATA, "claude-usage.json"), "utf8")); } catch { return null; }
}

// agy (Antigravity CLI) keeps no quota on disk: it asks Google each time. What it keeps is a
// history of prompts with timestamps, so the office shows how many it got today.
async function agy() {
  const file = join(HOME, ".gemini", "antigravity-cli", "history.jsonl");
  const s = await stat(file);
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const text = (await readRange(file, Math.max(0, s.size - 2_000_000), s.size)).toString("utf8");
  let prompts = 0;
  const convs = new Set();
  for (const line of text.split("\n")) {
    try {
      const row = JSON.parse(line);
      if (row.timestamp >= midnight.getTime()) { prompts++; if (row.conversationId) convs.add(row.conversationId); }
    } catch { /* a cut-off first line */ }
  }
  return { prompts, conversations: convs.size };
}

// When a tool was last used, from the files it writes; null when it isn't installed.
async function lastUsed(paths) {
  let latest = 0;
  for (const p of paths) {
    try { latest = Math.max(latest, (await stat(p)).mtimeMs); } catch { /* not there */ }
  }
  return latest || null;
}

async function newestCodexFile() {
  const days = await newestDirs(join(HOME, ".codex", "sessions"), 3);
  return days[0] ?? join(HOME, ".codex", "sessions");
}

const WEEK = 7 * DAY;
const now = Date.now();
const [cx, cl, plan, ag] = await Promise.all([
  codex().catch(() => null), claude().catch(() => null), claudePlan(), agy().catch(() => null),
]);
// After the readers: claude() writes the cache this looks at.
const [seenClaude, seenCodex, seenAgy] = await Promise.all([
  lastUsed([join(DATA, "claude-cache.json"), join(DATA, "claude-usage.json")]),
  newestCodexFile().then((d) => lastUsed([d])),
  lastUsed([join(HOME, ".gemini", "antigravity-cli", "history.jsonl"), join(HOME, ".gemini", "antigravity-cli", "cli.log")]),
]);

// Every tool used in the last week, most recent first.
const resetIfExpired = (w) => (w.resets_at && w.resets_at * 1000 <= now ? { ...w, used: 0 } : w);
const providers = [];
if (seenClaude && now - seenClaude < WEEK) {
  const fresh = plan?.windows?.length && now - plan.at < WEEK;
  providers.push({
    id: "claude", name: "Claude Code", icon: "icons/claude.svg", tint: "#d97757", seen: seenClaude,
    windows: fresh ? plan.windows.map((w) => resetIfExpired({ label: w.label.replace("額度", ""), used: w.used, resets_at: w.resets_at })) : [],
    detail: cl?.today?.replies ? `今天 ${cl.today.replies} 次回覆，輸出 ${cl.today.output}、輸入 ${cl.today.input} Token` : null,
  });
}
if (seenCodex && now - seenCodex < WEEK) {
  providers.push({
    id: "codex", name: "Codex", icon: "icons/codex.svg", tint: null, seen: seenCodex, plan: cx?.plan ?? null,
    windows: (cx?.windows ?? []).map((w) => resetIfExpired({ minutes: w.minutes, used: w.used, resets_at: w.resets_at })),
    detail: null,
  });
}
if (seenAgy && now - seenAgy < WEEK) {
  providers.push({
    id: "agy", name: "agy", icon: "icons/antigravity.svg", tint: null, seen: seenAgy, windows: [],
    count: ag ? { value: ag.prompts, label: "今天提問" } : null,
    detail: ag ? `今天 ${ag.prompts} 次提問、${ag.conversations} 個對話。agy 的額度只存在 Google 的伺服器上，本機讀不到。` : null,
  });
}
providers.sort((a, b) => b.seen - a.seen);
console.log(JSON.stringify({ providers, codex: cx, claude: cl, claudePlan: plan }));
