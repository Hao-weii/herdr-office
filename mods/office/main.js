// A pixel office for the side panel. Each zone means one thing:
//   work area  — working agents type at their own desk;
//   your desk  — agents that need you queue there: waiting for a reply on the left, finished
//                work to hand in on the right (their own desk stays empty, nameplate on it);
//   lounge     — idle agents rest on the sofas;
//   meeting    — a glass room that opens while a meeting runs (meeting.mjs): participants sit
//                at the table and take turns.
// Subagents show up as small interns beside whoever started them: Claude Code's own (found
// through statusline.mjs's session map and the session's subagents/*.meta.json) and agents
// started with `hc run` (terminals with a parent).
// Agents talking through the herdr-team skill (tell.mjs logs talk.jsonl) walk over to whoever
// they talk to, with what they said in a bubble.
// Status changes slide the character to its new zone. The rooms stack (narrow panel) or sit
// side by side (wide panel), whichever lets them be bigger. Above the room: plan usage.
// Art: art/generate.mjs. Usage: usage.mjs.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, terminals, theme, run, props, openOverlay, closeOverlay, exec, hc, appHome, checking, shared, setShared, readTextFile, notify } from "herdr";
import * as fs from "fs/promises";
import {
  SCENE_W, WALL_H, ROW_H, LOUNGE_H, FILL_H, PER_ROW, DESK_X, LOUNGE_SPOTS, QUEUE_X, QUEUE_Y, MEET_H, MEET_SEATS, TALK_MS, TOOL_NAMES, toolOf, meetingOn, POSE_H, PALETTES, WALK, STATUS, ORDER, paletteOf, clean, task, spot, windowName, tokens, resetsIn, pickLayout,
} from "./logic.js";

// Looks the person can pick (art in img/<id>/), and how the room is laid out. Saved in shared state.
const STYLES = [
  { id: "modern", label: "現代明亮", ui: { label: "#ffffffe6", labelBorder: "#d1d1d6", text: "#3a3a3c", plate: "#ffffff", wall: "#d6e8efd9", wallBorder: "#a7adb4" } },
  { id: "cozy", label: "溫暖木質", ui: { label: "#fffaf0e6", labelBorder: "#3b2a1e", text: "#5b4330", plate: "#fffaf0", wall: "#a8794e", wallBorder: "#3b2a1e" } },
  { id: "night", label: "夜間", ui: { label: "#1c1c1ee6", labelBorder: "#4a4f5a", text: "#d8d8dc", plate: "#2c2c2e", wall: "#2a3a55d9", wallBorder: "#4a4f5a" } },
];
const LAYOUTS = [
  { id: "auto", label: "自動" },
  { id: "tall", label: "上下" },
  { id: "wide", label: "左右" },
];
const styleOf = () => STYLES.find((x) => x.id === shared("office.style")) ?? STYLES[0];
const layoutOf = () => LAYOUTS.find((x) => x.id === shared("office.layout")) ?? LAYOUTS[0];

export default class Office extends View {
  init(_props, cx) {
    this.stageW = 380;
    this.stageH = 640;
    this.hovered = null;
    this.usage = null;
    // Walking: where each agent stood last render, and until when it is walking.
    this.last = {};
    this.walking = {};
    if (props()?.rename) return this.initRename(cx);
    if (props()?.settings) return;
    if (props()?.meetingSetup) return this.initMeetingSetup(cx);
    this.talks = [];
    this.meeting = null;
    this.subs = {};
    this.doneMeta = new Set();
    if (checking()) return;
    this.poll(cx);
    cx.timer.every(1500, (cx) => this.poll(cx));
    this.refresh(cx);
    cx.timer.every(60000, (cx) => this.refresh(cx));
    // Sit them down once they arrive.
    cx.timer.every(300, (cx) => {
      const now = Date.now();
      let done = false;
      for (const [k, until] of Object.entries(this.walking)) if (until <= now) { delete this.walking[k]; done = true; }
      if (done) cx.notify();
    });
  }

  // ---------- talk and meetings ----------

  // Recent messages between agents (tell.mjs) and the meeting in progress (meeting.mjs).
  poll(cx) {
    cx.spawn(async (cx) => {
      const base = `${appHome()}/data/office`;
      let changed = false;
      try {
        const now = Date.now();
        const talks = ((await readTextFile(`${base}/talk.jsonl`)) ?? "").trim().split("\n")
          .map((l) => { try { return JSON.parse(l); } catch { return null; } })
          .filter((x) => x && now - x.at < TALK_MS);
        const sig = talks.map((x) => x.at).join(",");
        if (sig !== this.talkSig) { this.talkSig = sig; this.talks = talks; changed = true; }
      } catch { /* no talk yet */ }
      try {
        const text = await readTextFile(`${base}/meeting.json`);
        const m = text ? JSON.parse(text) : null;
        const sig = m ? `${m.id}|${m.status}|${m.round}|${m.speaker}` : "";
        if (sig !== this.meetSig) {
          if (meetingOn(this.meeting) && m && !meetingOn(m) && m.id === this.meeting.id) {
            notify({ title: m.status === "done" ? "會議結束" : "會議停止", body: `${m.topic}：紀錄在 ${m.dir}`, level: "info" });
          }
          this.meetSig = sig; this.meeting = m; changed = true;
        }
      } catch { /* no meeting yet */ }
      // Claude Code's own subagents still running, per Herdr terminal.
      try {
        const map = JSON.parse((await readTextFile(`${base}/claude-sessions.json`)) ?? "{}");
        const subs = {};
        for (const a of agents()) {
          const e = map[a.address];
          if (!e?.transcript || (a.status !== "working" && a.status !== "blocked")) continue;
          const dir = e.transcript.replace(/\.jsonl$/, "") + "/subagents";
          let files = [];
          try { files = (await fs.readdir(dir)).filter((f) => f.endsWith(".meta.json")); } catch { continue; }
          for (const f of files) {
            const path = `${dir}/${f}`;
            if (this.doneMeta.has(path)) continue;
            try {
              const meta = JSON.parse((await readTextFile(path)) ?? "{}");
              if (meta.finished) { this.doneMeta.add(path); continue; }
              (subs[a.address] ??= []).push({ id: f.replace(/\.meta\.json$/, ""), kind: "claude", type: meta.agentType ?? "subagent", text: meta.description ?? "" });
            } catch { /* being written */ }
          }
        }
        const sig = JSON.stringify(subs);
        if (sig !== this.subSig) { this.subSig = sig; this.subs = subs; changed = true; }
      } catch { /* no session map yet */ }
      if (changed) cx.notify();
    });
  }

  // Every agent's subagents: Claude Code's own (polled above) and hc children.
  interns(list) {
    const out = {};
    for (const [parent, subs] of Object.entries(this.subs ?? {})) for (const x of subs) (out[parent] ??= []).push({ ...x, status: "working" });
    for (const term of terminals()) {
      if (!term.parent || term.state !== "live" || !term.status || !list.some((a) => a.address === term.parent)) continue;
      const app = term.report?.app ?? term.agent;
      (out[term.parent] ??= []).push({
        id: term.address, kind: "hc", type: TOOL_NAMES[app] ?? app ?? "agent", text: term.name ?? term.address,
        status: term.status === "error" ? "blocked" : term.status,
      });
    }
    return out;
  }

  // An intern: a smaller character beside its parent, posed by its own status; hover for its task.
  intern(x, i, parentPlace, s, key) {
    const k = 0.72, ks = s * k;
    const w = Math.round(16 * ks), h = Math.round(21 * ks);
    const OFF = [[-19, 0], [19, 0], [-28, 6], [28, 6]];
    const [dx, dy] = OFF[i % OFF.length];
    const [px, py, ppose] = parentPlace;
    const parentH = ppose === "type" ? 16 : POSE_H[ppose] ?? 21;
    const top = py + parentH - 21 * k + dy;
    const pal = paletteOf(x.id);
    const figure = x.status === "blocked"
      ? this.flip(this.sprite("waveA", pal, ks), this.sprite("waveB", pal, ks), w, h, 600)
      : x.status === "done"
        ? this.sprite("cheer", pal, ks)
        : div().relative().w(w).h(h).child(div().absolute().left(0)
          .loop("top", { from: 0, to: x.status === "working" ? -1.5 * s : 0, period: 700 }).child(this.sprite("stand", pal, ks)));
    const tip = x.kind === "claude" ? `子代理（${x.type}）：${x.text}` : `子 Agent（${x.type}）：${x.text}`;
    return div().id(`in-${x.id}-${key}`).absolute()
      .left(Math.round((px + dx) * s - w / 2)).top(Math.round(top * s)).w(w).h(h)
      .transition("left", WALK).transition("top", WALK)
      .tooltip(tip)
      .when(x.kind === "hc", (el) => el.on_click(() => run("terminal.peek", { terminal: x.id })))
      .child(figure);
  }

  // "+3" when an agent has more interns than fit beside it.
  moreInterns(n, parentPlace, s) {
    const [px, py] = parentPlace;
    return div().absolute().left(Math.round((px + 30) * s)).top(Math.round((py - 2) * s)).px(4).h(14).rounded(7)
      .bg(styleOf().ui.label).border(1).border_color(styleOf().ui.labelBorder).text_color(styleOf().ui.text)
      .text_size(9.5).flex().items_center().child(`+${n}`);
  }

  initMeetingSetup(cx) {
    this.topic = InputState.new({ value: "", placeholder: "例如：這個專案下一步該先做什麼？" });
    this.topic.focus();
    cx.timer.after(300, () => this.topic.focus());
    this.picked = new Set(agents().filter((a) => a.status !== "blocked").map((a) => a.address));
    this.rounds = 2;
    this.error = null;
    this.handle = cx.focus_handle();
  }

  startMeeting(cx) {
    const p = props();
    const topic = (this.topic.value() ?? "").trim();
    const list = agents().filter((a) => this.picked.has(a.address));
    if (!topic) { this.error = "請先寫下會議題目"; return cx.notify(); }
    if (list.length < 2) { this.error = "至少要選兩位參加"; return cx.notify(); }
    if (list.length > MEET_SEATS.length) { this.error = `會議室最多 ${MEET_SEATS.length} 位`; return cx.notify(); }
    const names = this.names();
    const d = new Date(), pad = (n) => String(n).padStart(2, "0");
    const id = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const req = { id, topic, rounds: this.rounds, participants: list.map((a) => ({ address: a.address, name: names[a.address] ?? null, tool: toolOf(a) })) };
    cx.spawn(async () => {
      const dir = `${appHome()}/data/office/requests`;
      try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(`${dir}/${id}.json`, JSON.stringify(req));
        await exec("hc", ["run", "--bg", "--name", `office-meeting-${id}`, "node", `${appHome()}/mods/office/meeting.mjs`, `${dir}/${id}.json`], { timeout: 20000 });
      } catch (e) {
        notify({ title: "會議沒開成", body: String(e?.message ?? e).slice(0, 200), level: "error" });
      }
    });
    closeOverlay(p.overlay);
  }

  stopMeeting() {
    const m = this.meeting;
    if (!m) return;
    const base = `${appHome()}/data/office`;
    this.meeting = { ...m, status: "cancelled", speaker: null, updated_at: Date.now() };
    fs.writeFile(`${base}/cancel-${m.id}`, "cancel").catch(() => {});
    fs.writeFile(`${base}/meeting.json`, JSON.stringify(this.meeting)).catch(() => {});
    if (m.runner) exec("hc", ["kill", m.runner]).catch(() => {});
  }

  openMinutes() {
    const m = this.meeting;
    if (m?.dir) exec("cmd", ["/c", "start", "", `${m.dir}\\transcript.md`]).catch(() => {});
  }

  renderMeetingSetup() {
    const t = theme();
    const p = props();
    const names = this.names();
    const list = agents();
    const button = (id, text, primary, action) => h_flex().id(id).h(30).px(14).items_center().rounded(7)
      .border(1).border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).hover((st) => st.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("office-meeting-setup").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .w_full().p(18).gap(10).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(14).font_semibold().child("開會"))
      .child(div().text_size(11.5).text_color(t.dim).child("參加的 Agent 會走進會議室，輪流發言、回應彼此，最後由一位整理結論。"))
      .child(div().pt(4).text_size(11.5).text_color(t.dim).child("題目"))
      .child(Input.new(this.topic).w_full())
      .child(div().pt(4).text_size(11.5).text_color(t.dim).child("誰參加"))
      .child(v_flex().gap(2).children(list.map((a) => {
        const on = this.picked.has(a.address), busy = a.status === "blocked";
        return h_flex().id(`pick-${a.address}`).h(28).px(6).gap(8).items_center().rounded(6)
          .hover((el) => el.bg(t.hover))
          .on_click((_e, cx) => { if (on) this.picked.delete(a.address); else this.picked.add(a.address); cx.notify(); })
          .child(div().w(14).h(14).rounded(3).border(1).border_color(on ? t.accent : t.input).bg(on ? t.accent : t.raised)
            .flex().items_center().justify_center().text_size(10).text_color(t.accent_foreground).child(on ? "✓" : ""))
          .child(image(`mods/office/img/head-${paletteOf(a.address)}.svg`).w(16).h(14).flex_none())
          .child(div().flex_1().min_w(0).truncate().text_size(12)
            .child(`${names[a.address] ? names[a.address] + " · " : ""}${toolOf(a)} · ${task(a) || a.space_name}`))
          .when(busy, (el) => el.child(div().text_size(10.5).text_color(t.blocked).child("等你回覆中")));
      })))
      .child(h_flex().pt(4).gap(8).items_center()
        .child(div().text_size(11.5).text_color(t.dim).child("發言幾輪"))
        .children([1, 2, 3].map((n) => h_flex().id(`rounds-${n}`).w(30).h(24).rounded(6).justify_center().items_center().text_size(12)
          .border(1).border_color(n === this.rounds ? t.accent : t.input).bg(n === this.rounds ? t.selected : t.raised)
          .on_click((_e, cx) => { this.rounds = n; cx.notify(); })
          .child(String(n)))))
      .when(!!this.error, (el) => el.child(div().text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(h_flex().pt(6).gap(8).justify_end()
        .child(button("meeting-cancel", "取消", false, () => closeOverlay(p.overlay)))
        .child(button("meeting-start", "開始開會", true, (_e, cx) => this.startMeeting(cx))));
  }

  // A speech bubble: what a character says right now.
  bubble(text, t) {
    return div().h(18).px(6).rounded(9).bg("#ffffff").border(1).border_color("#3a3a3c").text_color("#1c1c1e")
      .text_size(10.5).flex().items_center().max_w(190).truncate().child(text);
  }

  // ---------- names ----------
  // A name lives on the agent's terminal as the label `office.name`, so it goes with that
  // terminal and never passes to a new one that reuses its address.

  names() {
    const out = {};
    for (const term of terminals()) {
      const n = term.labels?.["office.name"];
      if (n) out[term.address] = n;
    }
    return out;
  }

  rename(a) {
    openOverlay({ mod: "office", kind: "dialog", width: 340, props: { rename: a.address, value: this.names()[a.address] ?? "", task: task(a) || a.space_name } });
  }

  initRename(cx) {
    const p = props();
    this.input = InputState.new({ value: p.value ?? "", placeholder: "例如：小明" });
    if (p.value) this.input.set_selected_range({ start: 0, end: p.value.length });
    this.input.on("submit", (_e, cx) => this.saveName(cx));
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  saveName(cx) {
    const p = props();
    const name = (this.input.value() ?? "").trim().slice(0, 20);
    cx.spawn(async () => { try { await hc(["label", p.rename, `office.name=${name}`]); } catch { /* nothing to undo */ } });
    closeOverlay(p.overlay);
  }

  renderRename() {
    const t = theme();
    const p = props();
    const button = (id, text, primary, action) => h_flex().id(id).h(30).px(14).items_center().rounded(7)
      .border(1).border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).hover((s) => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("office-rename").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .w_full().p(18).gap(10).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(14).font_semibold().child("幫這位同事取名字"))
      .child(div().text_size(11.5).text_color(t.dim).truncate().child(p.task))
      .child(Input.new(this.input).w_full())
      .child(div().text_size(11).text_color(t.dim).child("留空就會拿掉名字。名字跟著這個終端機，關掉就不見。"))
      .child(h_flex().pt(4).gap(8).justify_end()
        .child(button("rename-cancel", "取消", false, () => closeOverlay(p.overlay)))
        .child(button("rename-save", "儲存", true, (_e, cx) => this.saveName(cx))));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      try {
        const r = await exec("node", [`${appHome()}/mods/office/usage.mjs`], { timeout: 20000 });
        this.usage = JSON.parse(r.stdout);
      } catch { /* keep the last reading */ }
      cx.notify();
    });
  }

  // ---------- usage ----------

  // One quota as a ring: the arc is what's left, the number in the middle too; details on hover.
  gauge(id, label, used, resetsAt, t) {
    const rest = Math.max(0, Math.min(100, 100 - Math.round(used)));
    const color = rest <= 15 ? t.blocked : rest <= 40 ? t.working : "#7cc47f";
    const tip = `剩 ${rest}%（已用 ${Math.round(used)}%）${resetsAt ? `，${resetsIn(resetsAt)}` : ""}`;
    const D = 40;
    return v_flex().id(id).gap(3).items_center().flex_none().tooltip(tip)
      .child(div().relative().w(D).h(D)
        .child(div().absolute().top(0).left(0).child(svg("mods/office/img/ring-track.svg").size(D).text_color(t.raised)))
        .child(div().absolute().top(0).left(0).child(svg(`mods/office/img/ring-${rest}.svg`).size(D).text_color(color)))
        .child(div().absolute().top(0).left(0).w(D).h(D).flex().items_center().justify_center()
          .text_size(11).font_semibold().text_color(t.foreground).child(`${rest}%`)))
      .child(div().text_size(10.5).text_color(t.muted).child(label));
  }

  provider(key, icon, tint, name, gauges, tip, t) {
    return v_flex().id(`quota-${key}`).gap(6).min_w(0)
      .when(!!tip, (el) => el.tooltip(tip))
      .child(h_flex().gap(6).items_center()
        .child(tint ? svg(icon).size(13).flex_none().text_color(tint) : image(icon).w(13).h(13).flex_none())
        .child(div().text_size(11.5).text_color(t.foreground).truncate().child(name)))
      .child(h_flex().gap(12).children(gauges));
  }

  // Remaining plan quota as rings, one group per tool. Hover a ring for what's used and when it resets.
  // A count where a tool gives no quota: the number in an empty ring, gray.
  counter(id, value, label, tip, t) {
    const D = 40;
    return v_flex().id(id).gap(3).items_center().flex_none().when(!!tip, (el) => el.tooltip(tip))
      .child(div().relative().w(D).h(D)
        .child(div().absolute().top(0).left(0).child(svg("mods/office/img/ring-track.svg").size(D).text_color(t.raised)))
        .child(div().absolute().top(0).left(0).w(D).h(D).flex().items_center().justify_center()
          .text_size(12).font_semibold().text_color(t.muted).child(String(value))))
      .child(div().text_size(10.5).text_color(t.muted).child(label));
  }

  // Every tool used in the last week (usage.mjs finds them), most recent first: rings for plan
  // quota left, a plain count when the tool keeps no quota on disk.
  usageStrip(t) {
    const u = this.usage;
    const list = u?.providers ?? [];
    const groups = list.map((p) => {
      const figures = p.windows?.length
        ? p.windows.map((w, i) => this.gauge(`${p.id}-${i}`, w.label ?? windowName(w.minutes), w.used, w.resets_at, t))
        : p.count
          ? [this.counter(`${p.id}-count`, p.count.value, p.count.label, p.detail, t)]
          : [div().h(40).flex().items_center().text_size(11).text_color(t.dim).child("沒有額度資料")];
      const plan = p.plan ? ` · ${p.plan[0].toUpperCase()}${p.plan.slice(1)}` : "";
      const tip = p.detail?.replace(/(\d{4,})/g, (n) => tokens(Number(n)));
      return this.provider(p.id, p.icon, p.tint, `${p.name}${plan}`, figures, p.windows?.length ? tip : null, t);
    });
    const strip = h_flex().flex_none().mx(10).mt(8).px(12).py(8).gap(16).items_start().flex_wrap()
      .rounded(8).bg(t.background).border(1).border_color(t.border);
    if (!u) return strip.child(div().h(56).flex().items_center().text_size(11).text_color(t.dim).child("讀取用量中…"));
    if (!groups.length) return strip.child(div().h(56).flex().items_center().text_size(11).text_color(t.dim).child("最近一週沒有偵測到 Claude Code、Codex 或 agy 的使用紀錄"));
    return strip.children(groups.flatMap((g, i) => (i ? [div().w(1).h(68).bg(t.border), g] : [g])));
  }

  // ---------- room ----------

  sprite(pose, pal, s) {
    return image(`mods/office/img/${pose}-${pal}.svg`).w(Math.round(16 * s)).h(Math.round(POSE_H[pose] * s));
  }

  // Two frames, the top one blinking in and out: the loop swings far past 0..1, so the
  // clamped opacity is almost always fully on or off.
  flip(a, b, w, h, period) {
    return div().relative().w(w).h(h)
      .child(div().absolute().top(0).left(0).child(a))
      .child(div().absolute().top(0).left(0).loop("opacity", { from: -8, to: 9, period, easing: "linear" }).child(b));
  }

  figure(pose, pal, s) {
    const w = Math.round(16 * s);
    if (pose === "walk") return div().relative().w(w).h(Math.round(21 * s))
      .child(div().absolute().left(0).loop("top", { from: 0, to: -1.5 * s, period: 300 })
        .child(this.flip(this.sprite("walkA", pal, s), this.sprite("walkB", pal, s), w, Math.round(21 * s), 360)));
    if (pose === "type") return this.flip(this.sprite("typeA", pal, s), this.sprite("typeB", pal, s), w, Math.round(16 * s), 500);
    if (pose === "wave") return this.flip(this.sprite("waveA", pal, s), this.sprite("waveB", pal, s), w, Math.round(21 * s), 600);
    if (pose === "cheer") return div().relative().w(w).h(Math.round(21 * s))
      .child(div().absolute().left(0).loop("top", { from: 0, to: -3 * s, period: 600 }).child(this.sprite("cheer", pal, s)));
    return this.sprite(pose, pal, s);
  }

  // Only what needs the person gets a sign: a waiting or a finished agent.
  sign(a, t) {
    const st = STATUS[a.status];
    if (!st?.mark) return null;
    const color = t[a.status];
    const el = h_flex().h(18).px(6).gap(3).rounded(5).items_center().bg(color).text_color(t.background)
      .text_size(11).font_semibold().child(st.mark).child(st.label);
    return a.status === "blocked" ? el.loop("opacity", { from: 0.45, to: 1, period: 900 }) : el;
  }

  // `key` changes with the layout and scale, so a resize starts the characters afresh where
  // they belong; within one layout the same element moves, and the move is animated.
  character(a, place, s, t, key, name, extra) {
    const [x, y, finalPose] = place;
    const pose = this.walking[a.address] ? "walk" : finalPose;
    const pal = paletteOf(a.address);
    const h = Math.round((pose === "type" ? 16 : POSE_H[pose] ?? 21) * s);
    const w = Math.round(16 * s);
    const hovered = this.hovered === a.address;
    const label = hovered
      ? div().h(18).px(6).rounded(5).bg(t.popover).border(1).border_color(t[a.status] ?? t.border)
        .text_size(11).text_color(t.foreground).flex().items_center().max_w(200).truncate()
        .child(name ? `${name} · ${task(a) || a.space_name}` : task(a) || a.space_name)
      : extra === false ? null : extra ?? this.sign(a, t);
    return div().id(`ag-${a.address}-${key}`).absolute()
      .left(Math.round(x * s - w / 2)).top(Math.round(y * s)).w(w).h(h)
      .transition("left", WALK).transition("top", WALK)
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .on_mouse_down("right", (_e, cx) => { this.rename(a); cx.stop_propagation(); })
      .on_hover((on, cx) => { this.hovered = on ? a.address : this.hovered === a.address ? null : this.hovered; cx.notify(); })
      .child(this.figure(pose, pal, s))
      .when(!!label, (el) => el.child(h_flex().absolute().top(-22).left(-60).w(w + 120).justify_center().child(label)));
  }

  // The name on a desk, so an empty chair still says whose it is.
  plate(a, desk, s, name) {
    const row = Math.floor(desk / PER_ROW), cx = DESK_X[desk % PER_ROW];
    const w = Math.round(34 * s);
    return div().absolute().left(Math.round((cx - 6) * s - w / 2)).top(Math.round((WALL_H + row * ROW_H + 63) * s)).w(w)
      .flex().justify_center()
      .child(div().id(`plate-${a.address}`).max_w(w).px(5).rounded(4).bg(styleOf().ui.plate).border(1).border_color(styleOf().ui.labelBorder)
        .text_color(styleOf().ui.text).text_size(9.5).truncate().when(!!name, (el) => el.font_semibold())
        .on_mouse_down("right", (_e, cx) => { this.rename(a); cx.stop_propagation(); })
        .child(name || task(a) || a.space_name));
  }

  // A working monitor runs: lines of code scroll past and a cursor blinks.
  screen(a, desk, s) {
    if (a.status !== "working") return null;
    const row = Math.floor(desk / PER_ROW), cx = DESK_X[desk % PER_ROW];
    const W = Math.round(18 * s), H = Math.round(10 * s), u = Math.max(1, Math.round(s));
    const COLORS = ["#7ee787", "#79c0ff", "#d2a8ff", "#ffa657", "#c9d1d9", "#79c0ff", "#7ee787", "#c9d1d9"];
    // Each agent's code looks a little different.
    const seed = paletteOf(a.address);
    const lines = Array.from({ length: 12 }, (_, i) => {
      const k = (i * 7 + seed * 3) % 10;
      return h_flex().h(u).gap(u)
        .child(div().w(u * (1 + (k % 3))).h(u))
        .child(div().w(Math.round(W * (0.25 + (k % 5) * 0.11))).h(u).bg(COLORS[(i + seed) % COLORS.length]))
        .when(k % 2 === 0, (el) => el.child(div().w(Math.round(W * 0.15)).h(u).bg(COLORS[(i + seed + 3) % COLORS.length])));
    });
    return div().absolute().left(Math.round((cx - 9) * s)).top(Math.round((WALL_H + row * ROW_H + 2) * s))
      .w(W).h(H).bg("#0d1117").overflow_hidden()
      .child(v_flex().absolute().left(u).top(0).gap(u)
        .loop("top", { from: 0, to: -12 * 2 * u + H - u, period: 5200 + seed * 400, easing: "linear" })
        .children(lines))
      .child(div().absolute().right(u * 2).bottom(u).w(u * 2).h(u * 2).bg("#e6edf3")
        .loop("opacity", { from: -8, to: 9, period: 900, easing: "linear" }));
  }

  speaking(text, t) {
    return h_flex().h(18).px(6).gap(3).rounded(5).items_center().bg(t.accent).text_color(t.accent_foreground)
      .text_size(11).font_semibold().child("●").child(text).loop("opacity", { from: 0.55, to: 1, period: 1100 });
  }

  zone(text, x, y, s) {
    return div().absolute().left(Math.round(x * s)).top(Math.round(y * s)).px(7).h(17).rounded(9)
      .bg(styleOf().ui.label).border(1).border_color(styleOf().ui.labelBorder).text_color(styleOf().ui.text).text_size(10).font_semibold().flex().items_center().child(text);
  }

  // Stacked: desks above, lounge below. Side by side: desks left, lounge right, a wall with a
  // door between. Picks whichever lets the room be drawn bigger in the stage.
  layoutFor(rows, meet) {
    return pickLayout({ stageW: this.stageW, stageH: this.stageH, rows, meet, pref: layoutOf().id });
  }

  room(L, rows, s) {
    const px = (n) => Math.round(n * s);
    const img = (name, h) => image(`mods/office/img/${styleOf().id}/${name}.svg`).w(px(SCENE_W)).h(px(h)).flex_none();
    const desks = v_flex().w(px(SCENE_W)).flex_none()
      .child(img("wall", WALL_H))
      .children(Array.from({ length: rows }, () => img("deskrow", ROW_H)))
      .when(!!L.meet, (el) => el.child(img("meeting", MEET_H)));
    if (!L.wide) return desks.child(img("lounge", LOUNGE_H));
    const fills = Math.max(0, Math.ceil((L.h - WALL_H - LOUNGE_H) / FILL_H));
    const lounge = v_flex().w(px(SCENE_W)).h(px(L.h)).flex_none().overflow_hidden()
      .child(img("wall-lounge", WALL_H))
      .child(img("lounge-open", LOUNGE_H))
      .children(Array.from({ length: fills }, () => img("lounge-fill", FILL_H)));
    return h_flex().child(desks).child(lounge);
  }

  // The wall between the two rooms when they sit side by side, with a door.
  divider(L, s) {
    const seg = (y, h) => div().absolute().left(Math.round((SCENE_W - 3) * s)).top(Math.round(y * s))
      .w(Math.round(5 * s)).h(Math.round(h * s)).bg(styleOf().ui.wall).border(1).border_color(styleOf().ui.wallBorder);
    const door = WALL_H + 64, gap = 30;
    return [seg(WALL_H - 2, door - WALL_H + 2), seg(door + gap, L.h - door - gap + 2)];
  }

  scene(list, t) {
    const rows = Math.max(2, Math.ceil(list.length / PER_ROW));
    const m = meetingOn(this.meeting) ? this.meeting : null;
    const seats = m ? m.participants.filter((x) => list.some((a) => a.address === x)) : [];
    const L = this.layoutFor(rows, seats.length > 0), s = L.s, lo = L.lo, mo = L.mo;
    const count = { working: 0, blocked: 0, done: 0, idle: 0 };
    const placed = list.map((a, desk) => {
      const seat = seats.indexOf(a.address);
      if (seat >= 0) {
        const [x, y, pose] = MEET_SEATS[seat];
        return { a, desk, meeting: true, place: [mo.x + x, mo.y + y, pose] };
      }
      const key = a.status in count ? a.status : "idle";
      return { a, desk, place: spot({ ...a, status: key }, desk, count[key]++, lo) };
    });
    // Whoever just messaged a teammate walks over and stands beside it.
    const talkOf = {};
    for (const x of this.talks ?? []) talkOf[x.from] = x;
    const at = Object.fromEntries(placed.map((p) => [p.a.address, p]));
    for (const p of placed) {
      const x = talkOf[p.a.address], to = x && at[x.to];
      if (!to || p.meeting || to === p) continue;
      p.talk = x;
      p.place = [Math.min(to.place[0] + 17, L.w - 9), to.place[1] - (to.place[2] === "type" ? 2 : 3), "stand"];
    }
    // Same layout and scale as last time and a new spot: the agent walks there.
    const key = `${L.wide ? "w" : "t"}${Math.round(s * 100)}`;
    const now = Date.now();
    for (const p of placed) {
      const prev = this.last[p.a.address], here = `${Math.round(p.place[0])},${Math.round(p.place[1])}`;
      if (prev && prev.key === key && prev.at !== here) this.walking[p.a.address] = now + WALK.duration;
      this.last[p.a.address] = { key, at: here };
    }
    const names = this.names();
    const interns = this.interns(list);
    const extra = (p) => {
      if (p.meeting && m.speaker === p.a.address) return this.speaking(m.status === "summarizing" ? "整理結論中" : "發言中", t);
      if (p.meeting) return false; // in the meeting only the speaker gets a sign
      if (p.talk) return this.bubble(`→ ${names[p.talk.to] ?? toolOf(at[p.talk.to].a)}：${p.talk.text}`, t);
      return null;
    };
    // Farther back draws first, so nearer characters overlap them.
    const byDepth = [...placed].sort((p, q) => p.place[1] - q.place[1]);
    return div().relative().w(Math.round(L.w * s)).h(Math.round(L.h * s)).overflow_hidden()
      .child(this.room(L, rows, s))
      .when(L.wide, (el) => el.children(this.divider(L, s)))
      .child(this.zone("工作區", 4, 30, s))
      .child(this.zone("休息區", lo.x + 8, lo.y + 112, s))
      .child(this.zone("你的桌子", lo.x + 144, lo.y + 114, s))
      .when(!!L.meet, (el) => el.child(this.zone("會議室", mo.x + 150, mo.y + 47, s)))
      .children(placed.filter((p) => !p.meeting && !p.talk).map((p) => this.screen(p.a, p.desk, s)).filter(Boolean))
      .children(placed.map((p) => this.plate(p.a, p.desk, s, names[p.a.address])))
      .children(byDepth.map((p) => this.character(p.a, p.place, s, t, key, names[p.a.address], extra(p))))
      .children(placed.flatMap((p) => (interns[p.a.address] ?? []).slice(0, 4).map((x, i) => this.intern(x, i, p.place, s, key))))
      .children(placed.filter((p) => (interns[p.a.address] ?? []).length > 4).map((p) => this.moreInterns(interns[p.a.address].length - 4, p.place, s)));
  }

  roster(list, t) {
    const sorted = [...list].sort((x, y) => (ORDER[x.status] ?? 9) - (ORDER[y.status] ?? 9) || y.seq - x.seq);
    const names = this.names();
    const interns = this.interns(list);
    // Compact rows; past five agents the list scrolls on its own, the room stays put.
    return div().id("office-roster").flex_none().max_h(5 * 28 + 12).overflow_y_scrollbar()
      .child(v_flex().px(10).py(6)
        .children(sorted.map((a) => {
          const color = t[a.status] ?? t.idle;
          const name = names[a.address];
          return h_flex().id(`row-${a.address}`).h(28).px(6).gap(8).items_center().rounded(6)
            .tooltip(`${a.space_name} · ${a.program?.name ?? a.app ?? ""}`)
            .when(a.focused, (el) => el.bg(t.raised))
            .hover((el) => el.bg(t.hover))
            .on_click(() => run("agent.focus", { terminal: a.address }))
            .on_mouse_down("right", (_e, cx) => { this.rename(a); cx.stop_propagation(); })
            .child(image(`mods/office/img/head-${paletteOf(a.address)}.svg`).w(18).h(16).flex_none())
            .child(h_flex().flex_1().min_w(0).gap(6).items_center()
              .when(!!name, (el) => el.child(div().flex_none().text_size(12).font_semibold().text_color(t.foreground).child(name)))
              .child(div().flex_1().min_w(0).text_size(12).text_color(name ? t.muted : t.foreground).truncate().child(task(a) || a.space_name))
              .when((interns[a.address] ?? []).length > 0, (el) => el.child(div().flex_none().px(5).rounded(4).bg(t.raised)
                .text_size(10.5).text_color(t.muted).tooltip((interns[a.address] ?? []).map((x) => `${x.type}：${x.text}`).join("\n"))
                .child(`子代理 ${interns[a.address].length}`))))
            .child(div().id(`rename-${a.address}`).flex_none().p(3).rounded(4).tooltip(name ? "改名字" : "取名字")
              .hover((el) => el.bg(t.raised))
              .on_click((_e, cx) => { this.rename(a); cx.stop_propagation(); })
              .child(svg("mods/workspace-chrome/square-pen.svg").size(12).text_color(t.dim)))
            .child(h_flex().gap(4).items_center().flex_none().text_size(11).text_color(color)
              .child(div().w(6).h(6).rounded(3).bg(color))
              .child(STATUS[a.status]?.label ?? a.status));
        })));
  }

  // The popup behind the header button: pick a style and a layout; the room follows at once.
  renderSettings() {
    const t = theme();
    const row = (title, items, current, key) => v_flex().gap(6)
      .child(div().text_size(11).text_color(t.dim).child(title))
      .child(h_flex().gap(4).p(3).rounded(8).bg(t.raised)
        .children(items.map((it) => h_flex().id(`${key}-${it.id}`).flex_1().h(26).rounded(6).justify_center().items_center()
          .text_size(12).text_color(it.id === current ? t.foreground : t.muted)
          .when(it.id === current, (el) => el.bg(t.popover).border(1).border_color(t.border))
          .when(it.id !== current, (el) => el.hover((st) => st.text_color(t.foreground)))
          .on_click(() => setShared(key, it.id))
          .child(it.label))));
    return v_flex().size_full().p(12).gap(12).bg(t.popover)
      .child(row("風格", STYLES, styleOf().id, "office.style"))
      .child(row("佈局", LAYOUTS, layoutOf().id, "office.layout"))
      .child(v_flex().gap(6)
        .child(div().text_size(11).text_color(t.dim).child("視窗"))
        .child(h_flex().id("office-popout").h(28).px(10).rounded(8).justify_center().items_center()
          .bg(t.raised).border(1).border_color(t.border).text_size(12).text_color(t.foreground)
          .hover((st) => st.bg(t.hover))
          .on_click(() => {
            run("mod.open", { name: "office" });
            if (props()?.overlay) closeOverlay(props().overlay);
          })
          .child("以獨立視窗開啟")));
  }

  // Start a meeting; while one runs, its progress and a stop button; after, its minutes.
  meetingControl(t) {
    const m = this.meeting;
    const chip = (id, text, tip, action, color) => h_flex().id(id).h(22).px(8).gap(4).items_center().rounded(6).flex_none()
      .bg(t.raised).border(1).border_color(color ?? t.border).text_size(11.5).text_color(t.foreground)
      .hover((st) => st.bg(t.hover)).when(!!tip, (el) => el.tooltip(tip)).on_click(action).child(text);
    if (meetingOn(m)) {
      const where = m.status === "summarizing" ? "整理結論" : `第 ${m.round}/${m.rounds} 輪`;
      return h_flex().gap(4).flex_none()
        .child(chip("meeting-progress", `會議中 · ${where}`, m.topic, () => this.openMinutes(), t.accent))
        .child(chip("meeting-stop", "結束", "停止這場會議", () => this.stopMeeting()));
    }
    const recent = m && m.finished_at && Date.now() - m.finished_at < 12 * 3600000;
    return h_flex().gap(4).flex_none()
      .when(!!recent, (el) => el.child(chip("meeting-minutes", "會議紀錄", m?.topic, () => this.openMinutes())))
      .child(chip("meeting-new", "開會", "請幾位 Agent 一起討論一個題目",
        () => openOverlay({ mod: "office", kind: "dialog", width: 420, props: { meetingSetup: true } })));
  }

  header(list, t) {
    const count = (s) => list.filter((a) => a.status === s).length;
    const overlay = props()?.overlay;
    return h_flex().h(34).px(12).gap(10).items_center().flex_none().border_b(1).border_color(t.border)
      .child(div().text_size(13).font_semibold().text_color(t.foreground).child("辦公室"))
      .child(h_flex().flex_1().gap(8).children(["blocked", "done", "working", "idle"].filter((s) => count(s)).map((s) =>
        h_flex().gap(4).items_center().text_size(11).text_color(t.muted)
          .child(div().w(6).h(6).rounded(3).bg(t[s]))
          .child(`${STATUS[s].label} ${count(s)}`))))
      .child(this.meetingControl(t))
      .child(div().id("office-settings").p(4).rounded(5).tooltip("設定")
        .hover((st) => st.bg(t.hover))
        .on_click(() => openOverlay({ mod: "office", kind: "popup", width: 248, height: 232, props: { settings: true } }))
        .child(svg("mods/workspace-chrome/settings.svg").size(14).text_color(t.muted)))
      .when(!!overlay, (el) => el.child(div().id("office-close").px(6).rounded(4).text_color(t.muted)
        .hover((st) => st.bg(t.hover).text_color(t.foreground))
        .on_click(() => closeOverlay(overlay))
        .child("✕")));
  }

  render() {
    if (props()?.rename) return this.renderRename();
    if (props()?.settings) return this.renderSettings();
    if (props()?.meetingSetup) return this.renderMeetingSetup();
    const t = theme();
    const list = agents();
    // The room takes whatever height is left and scales to fit it both ways.
    return v_flex().size_full().bg(t.surface)
      .child(this.header(list, t))
      .child(this.usageStrip(t))
      .child(h_flex().id("office-stage").flex_1().min_h(0).w_full().px(10).pt(8).justify_center().items_center().overflow_hidden()
        .on_size_change((size, cx) => {
          const w = Math.floor(size.width) - 20, h = Math.floor(size.height) - 8;
          if (w !== this.stageW || h !== this.stageH) { this.stageW = w; this.stageH = h; cx.notify(); }
        })
        .child(div().rounded(8).overflow_hidden().border(1).border_color(t.border).child(this.scene(list, t))))
      .when(list.length > 0, (el) => el.child(this.roster(list, t)))
      .when(list.length === 0, (el) => el.child(v_flex().flex_none().p(16).gap(4).items_center().text_size(12).text_color(t.muted)
        .child("辦公室還沒有人上班")
        .child("在 Herdr 裡開一個 Claude Code 或 Codex，就會有人坐進來")));
  }
}
