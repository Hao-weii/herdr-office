// Runs an office meeting: the office panel starts it in a background hc terminal with
//   node meeting.mjs <request.json>
// request: { id, topic, rounds, participants: [{ address, name, tool }] }
//
// Each round, every participant in turn gets a `[會議]` message: read the transcript so far,
// write a short contribution to a file. The runner waits for its turn to end, adds the file to
// the transcript, and moves on. At the end one participant writes the summary.
// Speech files live in the system temp folder (agents in sandboxes can usually write there);
// the transcript and summary are copied to ~/.config/herdr-app/data/office/meetings/<id>/.
// Progress goes to ~/.config/herdr-app/data/office/meeting.json for the panel to draw.
// To stop: create ~/.config/herdr-app/data/office/cancel-<id> (the panel does), or kill this terminal.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, rmSync, renameSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

const req = JSON.parse(readFileSync(process.argv[2], "utf8"));
const DATA = join(process.env.HERDR_APP_HOME ?? join(homedir(), ".config", "herdr-app"), "data", "office");
const WORK = join(tmpdir(), "herdr-office", "meetings", req.id);
const KEEP = join(DATA, "meetings", req.id);
const TRANSCRIPT = join(WORK, "transcript.md");
const STATE = join(DATA, "meeting.json");
mkdirSync(WORK, { recursive: true });
mkdirSync(KEEP, { recursive: true });

const who = (p) => (p.name ? `${p.name}（${p.tool}）` : `${p.tool} ${p.address}`);
const roster = req.participants.map(who).join("、");
const state = {
  id: req.id, topic: req.topic, rounds: req.rounds, participants: req.participants.map((p) => p.address),
  runner: process.env.HC_TERMINAL_ID ?? null, round: 0, speaker: null, status: "running",
  started_at: Date.now(), dir: KEEP,
};

function save(extra = {}) {
  Object.assign(state, extra, { updated_at: Date.now() });
  writeFileSync(`${STATE}.tmp`, JSON.stringify(state));
  renameSync(`${STATE}.tmp`, STATE);
}

const hc = (args, timeoutS = 60) => execFileSync("hc", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutS * 1000 });
function status(address) {
  try { const t = JSON.parse(hc(["get", address, "--json"])); return t.state === "live" ? t.status ?? "unknown" : "gone"; } catch { return "gone"; }
}
const cancelled = () => existsSync(join(DATA, `cancel-${req.id}`));

// Ask one participant for one piece of writing, wait for it, return the text (or null).
function ask(p, file, text) {
  rmSync(file, { force: true });
  const st = status(p.address);
  if (st === "gone" || st === "blocked") return { text: null, why: st === "gone" ? "已經離開" : "正在等人回覆，跳過" };
  try { hc(["send", "--wait", "--timeout", "300", p.address, text], 330); } catch { /* checked below */ }
  // Its turn may outlast one wait; give it up to ~15 more minutes while it keeps working.
  for (let i = 0; i < 3 && !existsSync(file) && !cancelled(); i++) {
    const now = status(p.address);
    if (now !== "working") break;
    try { hc(["wait", "--timeout", "300", p.address], 330); } catch { /* check again */ }
  }
  if (existsSync(file)) return { text: readFileSync(file, "utf8").trim() };
  return { text: null, why: status(p.address) === "blocked" ? "卡在等人回覆" : "沒有寫出發言" };
}

writeFileSync(TRANSCRIPT, `# 會議：${req.topic}\n\n參加者：${roster}\n\n`);
save();

try {
  for (let r = 1; r <= req.rounds && !cancelled(); r++) {
    for (const p of req.participants) {
      if (cancelled()) break;
      save({ round: r, speaker: p.address });
      const file = join(WORK, `r${r}-${p.address}.md`);
      const msg = `[會議] 題目：${req.topic} ｜ 參加者：${roster} ｜ 第 ${r}/${req.rounds} 輪，輪到你（${who(p)}）發言。`
        + ` 1. 先讀目前的會議紀錄：${TRANSCRIPT}`
        + ` 2. 針對題目和前面其他人的意見寫下你的看法，150 字以內，可以同意、反對或補充，用繁體中文。`
        + ` 3. 把發言直接寫進這個檔案：${file}`
        + ` 寫完就停下來：不要改任何程式碼、不要做其他事、也不用回覆訊息。`;
      const out = ask(p, file, msg);
      appendFileSync(TRANSCRIPT, `## ${who(p)} · 第 ${r} 輪\n\n${out.text ?? `（${out.why}）`}\n\n`);
    }
  }
  if (!cancelled()) {
    const lead = req.participants.find((p) => p.tool === "Claude Code" && status(p.address) !== "gone") ?? req.participants[0];
    save({ status: "summarizing", speaker: lead.address });
    const file = join(WORK, "summary.md");
    const msg = `[會議] 會議結束，請你（${who(lead)}）整理結論。 1. 讀完整的會議紀錄：${TRANSCRIPT}`
      + ` 2. 用繁體中文寫出：結論、大家的共識、還有分歧的地方、建議的下一步，300 字以內。`
      + ` 3. 寫進這個檔案：${file}`
      + ` 寫完就停下來：不要改任何程式碼、不要做其他事、也不用回覆訊息。`;
    const out = ask(lead, file, msg);
    appendFileSync(TRANSCRIPT, `# 結論（${who(lead)} 整理）\n\n${out.text ?? `（${out.why}）`}\n`);
    if (out.text) writeFileSync(join(KEEP, "summary.md"), `# 會議結論：${req.topic}\n\n${out.text}\n`);
  }
  copyFileSync(TRANSCRIPT, join(KEEP, "transcript.md"));
  save({ status: cancelled() ? "cancelled" : "done", speaker: null, finished_at: Date.now() });
} catch (e) {
  try { copyFileSync(TRANSCRIPT, join(KEEP, "transcript.md")); } catch { /* nothing to keep */ }
  save({ status: "error", speaker: null, error: String(e.message ?? e).slice(0, 300), finished_at: Date.now() });
}
