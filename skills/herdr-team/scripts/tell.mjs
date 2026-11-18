#!/usr/bin/env node
// Talk to the other coding agents running in Herdr (herdr-core terminals).
//
//   node tell.mjs who                     list teammates: address, tool, name, status, where
//   node tell.mjs <to> <message...>       send a message; <to> is t7, a name, or a tool
//                                         (claude, codex, agy) when only one of it runs
//
// Each send is also logged to ~/.config/herdr-app/data/office/talk.jsonl, so the Herdr office
// panel can show who is talking to whom. hc tags the message with the sender, so the receiver
// knows where to reply.

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const TOOLS = { "claude-code": "Claude Code", codex: "Codex", antigravity: "agy" };
const ALIASES = { claude: "claude-code", "claude-code": "claude-code", codex: "codex", agy: "antigravity", antigravity: "antigravity" };
const LOG = join(homedir(), ".config", "herdr-app", "data", "office", "talk.jsonl");

const hc = (args) => execFileSync("hc", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function teammates() {
  const all = JSON.parse(hc(["ls", "--json"]));
  const list = (all.terminals ?? all).filter((t) => t.state === "live" && t.agent && t.status); // agents report a status; plain shells don't
  return list.map((t) => {
    let labels = {};
    try { labels = JSON.parse(hc(["get", t.address, "--json"])).labels ?? {}; } catch { /* keep going */ }
    return { address: t.address, tool: TOOLS[t.agent] ?? t.agent, agent: t.agent, name: labels["office.name"] ?? null, status: t.status ?? "unknown", where: t.where ?? "" };
  });
}

function resolve(to, list) {
  const key = to.toLowerCase();
  const exact = list.find((t) => t.address === to || (t.name && t.name.toLowerCase() === key));
  if (exact) return exact;
  const tool = ALIASES[key];
  if (tool) {
    const same = list.filter((t) => t.agent === tool && t.address !== process.env.HC_TERMINAL_ID);
    if (same.length === 1) return same[0];
    if (same.length > 1) throw new Error(`more than one ${TOOLS[tool]} is running (${same.map((t) => t.address).join(", ")}): pick one by address or name`);
  }
  throw new Error(`no teammate called "${to}". Run: node tell.mjs who`);
}

function log(entry) {
  try {
    mkdirSync(join(LOG, ".."), { recursive: true });
    appendFileSync(LOG, JSON.stringify(entry) + "\n");
    // Keep only the latest 100 lines.
    const lines = readFileSync(LOG, "utf8").trim().split("\n");
    if (lines.length > 100) writeFileSync(LOG, lines.slice(-100).join("\n") + "\n");
  } catch { /* the message itself matters more than the log */ }
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (!cmd || cmd === "who") {
    const me = process.env.HC_TERMINAL_ID;
    for (const t of teammates()) {
      console.log(`${t.address}${t.address === me ? " (you)" : ""}\t${t.tool}\t${t.name ?? "-"}\t${t.status}\t${t.where}`);
    }
  } else {
    const text = rest.join(" ").trim();
    if (!text) throw new Error("nothing to say: node tell.mjs <to> <message>");
    const target = resolve(cmd, teammates());
    if (target.status === "blocked") throw new Error(`${target.address} is waiting for the person (blocked); don't interrupt it`);
    hc(["send", target.address, text]);
    log({ at: Date.now(), from: process.env.HC_TERMINAL_ID ?? null, to: target.address, text: text.slice(0, 120) });
    console.log(`sent to ${target.address} (${target.tool}${target.name ? `, ${target.name}` : ""})`);
  }
} catch (e) {
  console.error(String(e.stderr || e.message || e).trim());
  process.exit(1);
}
