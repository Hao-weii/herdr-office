// usage.mjs against a fake home folder: Codex quota, Claude Code token counts and plan quota,
// agy prompt counts, and which tools count as in use.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const USAGE = join(dirname(fileURLToPath(import.meta.url)), "..", "mods", "office", "usage.mjs");

function fakeHome() {
  const home = mkdtempSync(join(tmpdir(), "herdr-office-test-"));
  const now = Date.now();
  const d = new Date();
  const ymd = [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")];

  const codexDir = join(home, ".codex", "sessions", ...ymd);
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(join(codexDir, "rollout-test.jsonl"), [
    JSON.stringify({ timestamp: new Date(now).toISOString(), type: "event_msg", payload: { type: "other" } }),
    JSON.stringify({ timestamp: new Date(now).toISOString(), payload: { type: "token_count", rate_limits: {
      plan_type: "team", primary: { used_percent: 72, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 86400 }, secondary: null } } }),
  ].join("\n") + "\n");

  const claudeDir = join(home, ".claude", "projects", "C--repo");
  mkdirSync(claudeDir, { recursive: true });
  const reply = (id, out, inp, cached) => JSON.stringify({ type: "assistant", timestamp: new Date(now - 60000).toISOString(),
    message: { id, usage: { output_tokens: out, input_tokens: inp, cache_creation_input_tokens: 0, cache_read_input_tokens: cached } } });
  // msg_1 streams twice: only its last line counts.
  writeFileSync(join(claudeDir, "session.jsonl"), [reply("msg_1", 10, 100, 1000), reply("msg_1", 20, 100, 1000), reply("msg_2", 5, 50, 500)].join("\n") + "\n");

  const data = join(home, ".config", "herdr-app", "data", "office");
  mkdirSync(data, { recursive: true });
  writeFileSync(join(data, "claude-usage.json"), JSON.stringify({ windows: [
    { label: "5 小時額度", used: 21, resets_at: Math.floor(now / 1000) + 3600 },
    { label: "每週額度", used: 40, resets_at: Math.floor(now / 1000) + 86400 }], at: now }));

  const agyDir = join(home, ".gemini", "antigravity-cli");
  mkdirSync(agyDir, { recursive: true });
  writeFileSync(join(agyDir, "history.jsonl"), [
    JSON.stringify({ display: "a", timestamp: now - 1000, conversationId: "c1" }),
    JSON.stringify({ display: "b", timestamp: now - 2000, conversationId: "c1" }),
    JSON.stringify({ display: "old", timestamp: now - 3 * 86400000, conversationId: "c0" }),
  ].join("\n") + "\n");
  return home;
}

function run(home) {
  const out = execFileSync(process.execPath, [USAGE], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } });
  return JSON.parse(out);
}

test("reads every tool in use from a fake home", () => {
  const home = fakeHome();
  try {
    const u = run(home);
    const by = Object.fromEntries(u.providers.map((p) => [p.id, p]));
    assert.deepEqual(Object.keys(by).sort(), ["agy", "claude", "codex"]);

    assert.equal(by.codex.plan, "team");
    assert.deepEqual(by.codex.windows.map((w) => [w.used, w.minutes]), [[72, 10080]]);

    assert.deepEqual(by.claude.windows.map((w) => [w.label, w.used]), [["5 小時", 21], ["每週", 40]]);
    assert.equal(u.claude.today.replies, 2);
    assert.equal(u.claude.today.output, 25);

    assert.deepEqual(by.agy.windows, []);
    assert.equal(by.agy.count.value, 2);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a second run reads only what was added since", () => {
  const home = fakeHome();
  try {
    run(home);
    const again = run(home);
    assert.equal(again.claude.today.replies, 2);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("a home with no tools shows nothing", () => {
  const home = mkdtempSync(join(tmpdir(), "herdr-office-empty-"));
  try { assert.deepEqual(run(home).providers, []); } finally { rmSync(home, { recursive: true, force: true }); }
});

test("codex picks the newest rate_limits by timestamp and resets expired windows", () => {
  const home = mkdtempSync(join(tmpdir(), "herdr-office-reset-"));
  try {
    const now = Date.now();
    const d = new Date();
    const ymd = [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")];
    const codexDir = join(home, ".codex", "sessions", ...ymd);
    mkdirSync(codexDir, { recursive: true });

    const olderContent = join(codexDir, "rollout-newer-mtime.jsonl");
    const newerContent = join(codexDir, "rollout-older-mtime.jsonl");
    writeFileSync(olderContent, JSON.stringify({
      timestamp: new Date(now - 3600_000).toISOString(),
      payload: { type: "token_count", rate_limits: {
        plan_type: "team",
        primary: { used_percent: 18, window_minutes: 300, resets_at: Math.floor(now / 1000) - 600 },
        secondary: { used_percent: 52, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 3600 },
      } },
    }) + "\n");
    writeFileSync(newerContent, JSON.stringify({
      timestamp: new Date(now - 60_000).toISOString(),
      payload: { type: "token_count", rate_limits: {
        plan_type: "team",
        primary: { used_percent: 76, window_minutes: 300, resets_at: Math.floor(now / 1000) - 600 },
        secondary: { used_percent: 61, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 3600 },
      } },
    }) + "\n");
    // Give the older-timestamp file a newer mtime to mirror NTFS mtime skew.
    utimesSync(newerContent, new Date(now - 7200_000), new Date(now - 7200_000));
    utimesSync(olderContent, new Date(now), new Date(now));

    const data = join(home, ".config", "herdr-app", "data", "office");
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, "claude-usage.json"), JSON.stringify({ windows: [
      { label: "5 小時額度", used: 45, resets_at: Math.floor(now / 1000) - 60 },
      { label: "每週額度", used: 84, resets_at: Math.floor(now / 1000) + 86400 },
    ], at: now }));

    const by = Object.fromEntries(run(home).providers.map((p) => [p.id, p]));
    assert.deepEqual(by.codex.windows.map((w) => [w.minutes, w.used]), [[300, 0], [10080, 61]]);
    assert.deepEqual(by.claude.windows.map((w) => [w.label, w.used]), [["5 小時", 0], ["每週", 84]]);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
