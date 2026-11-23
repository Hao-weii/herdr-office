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
// Each space (project) gets its own rug under its desks; idle agents run errands (water, the
// window, the cat, a chat); the window and the lights follow the clock.
// Status changes slide the character to its new zone. The rooms stack (narrow panel) or sit
// side by side (wide panel), whichever lets them be bigger. Above the room: plan usage.
// Art: art/generate.mjs. Usage: usage.mjs.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, terminals, spaces, panes, knownAgents, theme, run, props, openOverlay, closeOverlay, exec, hc, appHome, checking, shared, setShared, readTextFile, notify, window as herdrWindow } from "herdr";
import * as fs from "fs/promises";
import {
  SCENE_W, WALL_H, LOUNGE_H, FILL_H, LOUNGE_SPOTS, QUEUE_X, QUEUE_Y, MEET_H, MEET_SEATS, TALK_MS, TOOL_NAMES, toolOf, meetingOn, POSE_H, PALETTES, WALK, STATUS, ORDER, paletteOf, clean, task, spot, windowName, tokens, resetsIn, pickLayout,
  POD_W, POD_H, PODS_PER_ROW, SEATS_PER_POD, DOOR, DESK_PAD, tagWidth, packTags, seatAt, podRect, assignSeats, podsPerOffice, demoAgents,
  ERRANDS, ERRAND_MS, errandSpot, phaseAt, clockText, DEMO, menuItems, DISPATCH_TITLE, nextInQueue, isQuotaError,
  openFileCommand, COURT_W, COURT_H, ORCHARD, courtyardRoute, courtyardStep,
} from "./logic.js";

const statusColor = (t, s) => t[s] ?? (s === "tired" ? "#a68bd4" : t.muted);

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
// Whether the window follows the clock (sunset, night) or stays at daytime.
const DAYNIGHT = [
  { id: "auto", label: "跟著時間" },
  { id: "off", label: "固定白天" },
];
const styleOf = () => STYLES.find((x) => x.id === shared("office.style")) ?? STYLES[0];
const layoutOf = () => LAYOUTS.find((x) => x.id === shared("office.layout")) ?? LAYOUTS[0];
const daynightOf = () => DAYNIGHT.find((x) => x.id === shared("office.daynight")) ?? DAYNIGHT[0];
// The night style is always night; the others follow the clock unless the person turned it off.
// `hour` pins the clock for previews (data/office/demo with "hour=18").
const phaseNow = (hour = null) => styleOf().id === "night" ? "night"
  : daynightOf().id !== "auto" ? "day"
  : phaseAt(hour === null ? new Date() : new Date(2000, 0, 1, hour));
// Rug colors, one per space in turn, so neighbours never match: a see-through fill and a stronger edge.
// The roster at its tallest (five rows, then it scrolls), and the office tabs row.
const ROSTER_MAX = 5 * 28 + 12, TABS_H = 30;
const RUGS = ["#6f9fd8", "#7fb07a", "#e9a24a", "#d9727a", "#a98bd6", "#5fb3b0"];

// Herdr draws mods only inside its one window, so the desktop window is a browser page
// (web/server.mjs) that shows the office and can go on another screen.
function openDesktop() {
  exec("node", [`${appHome()}/mods/office/web/server.mjs`, "--open"], { timeout: 20000 })
    .catch((e) => notify({ title: "桌面視窗沒開成", body: String(e?.message ?? e).slice(0, 200), level: "error" }));
}


// ---------- actions, shared by the panel and its menus and dialogs ----------

const spaceById = (id) => spaces().find((x) => x.id === id) ?? null;
// An unnamed agent, for people: what it is on, else its tool.
const whoIs = (a) => (a ? task(a) || toolOf(a) : "");

// Where a space's new terminals should start: its first terminal's live folder, else where the
// space was made (as Herdr's own space menu does).
function placeOf(s) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || undefined;
}

// Starts an agent in a new tab of `space`, and holds `seat` (in offices of `cap` pods) for it for
// a minute, so it walks in and sits where it was clicked. `prog`: which agent (default: the one
// picked most, installed); `task`: its first message. Not in the made-up preview office.
async function startAgent({ space, seat, cap, prog, task, demo }) {
  if (demo) return notify({ title: "預覽模式", body: "預覽模式裡的辦公室是假的，點空位不會開新的 Agent。", level: "info" });
  const s = spaceById(space);
  if (!s) return notify({ title: "沒開成", body: "找不到這個 Space，可能已經關掉了。", level: "error" });
  try {
    const p = prog ?? (await knownAgents({ on: s.machine })).find((k) => k.installed);
    if (!p) return notify({ title: "沒開成", body: "這台電腦沒有偵測到已安裝的 Agent（Claude Code、Codex…）。", level: "error" });
    const now = Date.now();
    setShared("office.reserved", [...(shared("office.reserved") ?? []).filter((r) => r.until > now), { space: s.id, seat, cap, until: now + 60000 }]);
    run("tab.new", { space: s.id, folder: placeOf(s), argv: p.run, ...(task ? { task } : {}), focus: true });
  } catch (e) {
    notify({ title: "沒開成", body: String(e?.message ?? e).slice(0, 200), level: "error" });
  }
}

// Logs a message to talk.jsonl like the herdr-team skill does (the latest 100 lines).
async function logTalk(entry) {
  const dir = `${appHome()}/data/office`, path = `${dir}/talk.jsonl`;
  await fs.mkdir(dir, { recursive: true });
  const lines = ((await readTextFile(path)) ?? "").split("\n").filter(Boolean);
  lines.push(JSON.stringify(entry));
  await fs.writeFile(path, lines.slice(-100).join("\n") + "\n");
}

// A dialog's button: plain, or filled (`primary`, in `color` when given, e.g. red to stop work).
function dialogButton(t, id, text, primary, action, color) {
  const bg = primary ? color ?? t.solid : t.raised;
  return h_flex().id(id).h(30).px(14).items_center().rounded(7)
    .border(1).border_color(primary ? bg : t.input).bg(bg)
    .text_color(primary ? (color ? "#ffffff" : t.solid_foreground) : t.foreground).text_size(12.5)
    .hover((st) => st.opacity(0.88)).on_click(action).child(text);
}

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
    if (props()?.menu || props()?.seatMenu) return this.initMenu(cx);
    if (props()?.dispatch || props()?.startTask) return this.initSend(cx);
    if (props()?.confirm) return this.initConfirm(cx);
    this.talks = [];
    this.meeting = null;
    this.subs = {};
    this.doneMeta = new Set();
    // Idle agents' errands (address -> { kind, with, until }) and since when each has rested.
    this.errands = {};
    this.rested = {};
    this.showCourtyard = props()?.scene === "courtyard";
    // Newcomers standing in the doorway (address -> since).
    this.entering = {};
    this.clock = clockText();
    // A check draws a made-up office, so every part of the room gets drawn once.
    this.demo = checking() ? DEMO : null;
    if (checking()) return;
    this.poll(cx);
    cx.timer.every(1500, (cx) => this.poll(cx));
    this.refresh(cx);
    cx.timer.every(60000, (cx) => this.refresh(cx));
    cx.timer.every(2000, (cx) => this.errandTick(cx));
    // The wall clock, and the sky when the hour turns.
    cx.timer.every(10000, (cx) => { const c = clockText(); if (c !== this.clock) { this.clock = c; cx.notify(); } });
    // Sit them down once they arrive; send newcomers on from the doorway; keep the seat map.
    cx.timer.every(300, (cx) => {
      const now = Date.now();
      let done = false;
      for (const [k, until] of Object.entries(this.walking)) if (until <= now) { delete this.walking[k]; done = true; }
      for (const [k, since] of Object.entries(this.entering)) if (now - since >= 300) { delete this.entering[k]; done = true; }
      this.saveSeats();
      if (done || this.courtyardNext <= now) cx.notify();
    });
  }

  // The agents to draw: the real ones, or the made-up office while previewing.
  // Quota/rate-limit errors arrive from Herdr as `blocked`, so cross-check `terminals()` to
  // mark them as `tired` (slumped at their own desk) instead of waiting for a reply.
  people() {
    if (this.demo) return this.demo;
    const byAddr = Object.fromEntries(terminals().map((t) => [t.address, t]));
    return agents().map((a) => {
      const term = byAddr[a.address];
      return isQuotaError(term) ? { ...a, status: "tired", status_msg: term.report?.msg ?? "" } : a;
    });
  }

  // ---------- actions ----------
  // Right-click an agent (in the room, on its nameplate or in the roster) for a menu that fits its
  // status; click an empty seat to start an agent there. The menu and the dialogs are this mod
  // again, opened as overlays with a role in their props.

  menu(a) {
    openOverlay({
      mod: "office", kind: "popup", width: 190,
      props: { menu: a.address, status: a.status, pinned: !!a.pinned, name: this.names()[a.address] ?? "", task: task(a) || a.space_name, demo: !!this.demo },
    });
  }

  // An `hc run` intern: look, go, or end it.
  internMenu(x) {
    openOverlay({ mod: "office", kind: "popup", width: 190, props: { menu: x.id, intern: true, status: x.status, name: "", task: x.text, demo: !!this.demo } });
  }

  // An empty seat, right-clicked: which agent to start there.
  seatMenu(seat) {
    openOverlay({ mod: "office", kind: "popup", width: 210, props: { seatMenu: true, seat, demo: !!this.demo } });
  }

  initMenu(cx) {
    this.at = 0;
    this.known = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    const p = props();
    if (p.seatMenu) cx.spawn(async (cx) => {
      const s = spaceById(p.seat.space);
      try { this.known = (await knownAgents({ on: s?.machine ?? null })).filter((k) => k.installed); } catch { this.known = []; }
      cx.notify();
    });
  }

  menuList() {
    const p = props();
    if (p.seatMenu) return [
      ...(this.known ?? []).map((k) => ({ id: "start", label: `開 ${k.name}`, prog: k })),
      { id: "startTask", label: "帶著任務開…" },
    ];
    return menuItems(p);
  }

  choose(i) {
    const p = props();
    const it = this.menuList()[i];
    if (!it) return;
    closeOverlay(p.overlay);
    const terminal = p.menu, who = p.name || p.task || terminal;
    const dialog = (width, extra) => openOverlay({ mod: "office", kind: "dialog", width, props: extra });
    if (it.id === "focus") run("agent.focus", { terminal });
    else if (it.id === "peek") run("terminal.peek", { terminal });
    else if (it.id === "pin") run("terminal.pin", { terminal, pinned: !p.pinned });
    else if (it.id === "rename") dialog(340, { rename: terminal, value: p.name ?? "", task: p.task });
    else if (it.id === "dispatch") dialog(420, { dispatch: terminal, status: p.status, who, demo: p.demo });
    else if (it.id === "interrupt" || it.id === "kill") dialog(380, { confirm: it.id, terminal, who, demo: p.demo });
    else if (it.id === "start") startAgent({ ...p.seat, prog: it.prog, demo: p.demo });
    else if (it.id === "startTask") dialog(420, { startTask: true, seat: p.seat, demo: p.demo });
  }

  renderMenu() {
    const t = theme();
    const p = props();
    const list = this.menuList();
    const head = p.seatMenu ? `在 ${p.seat.name} 開新的 Agent` : p.name || p.task;
    return v_flex().id("office-menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.5)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.notify();
      })
      .when(!!head, (el) => el.child(div().px(8).pt(3).pb(5).text_size(11).text_color(t.dim).truncate().child(head)))
      .when(p.seatMenu && this.known === null, (el) => el.child(div().px(8).h(28).flex().items_center().text_color(t.dim).child("找可以開的 Agent…")))
      .when(p.seatMenu && this.known?.length === 0, (el) => el.child(div().px(8).h(28).flex().items_center().text_color(t.dim).child("沒有偵測到已安裝的 Agent")))
      .children(list.map((it, i) => v_flex()
        .when(it.danger && !list[i - 1]?.danger, (el) => el.child(div().mx(7).my(4).h(1).bg(t.border)))
        .child(h_flex().id(`om-${i}`).h(30).px(8).rounded(7).items_center()
          .text_color(it.danger ? t.blocked : t.foreground)
          .when(i === this.at, (el) => el.bg(t.selected))
          .hover((st) => st.bg(t.hover))
          .on_click(() => this.choose(i))
          .child(it.label))));
  }

  // The send dialog: one line for the agent, pasted into it with `hc send`; the office shows it
  // as a bubble from your desk. Also the "start with a task" dialog for an empty seat.
  initSend(cx) {
    const p = props();
    this.error = null;
    this.input = InputState.new({ value: "", placeholder: p.startTask ? "例如：幫我看一下登入的 bug" : "要交代的事，按 Enter 送出" });
    this.input.on("submit", (_e, cx) => this.send(cx));
    this.input.focus();
    cx.timer.after(300, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  send(cx) {
    const p = props();
    const text = (this.input.value() ?? "").trim();
    if (!text) { this.error = p.startTask ? "先寫下第一件要做的事" : "先寫下要交代的事"; return cx.notify(); }
    if (p.demo) { this.error = "預覽模式裡的同事是假的，不會真的送出"; return cx.notify(); }
    closeOverlay(p.overlay);
    if (p.startTask) return startAgent({ ...p.seat, task: text });
    cx.spawn(async () => {
      try {
        const r = await hc(["send", p.dispatch, text]);
        if (r.code !== 0) throw new Error(r.stderr || r.stdout || `hc send 結束碼 ${r.code}`);
        await logTalk({ at: Date.now(), from: "you", to: p.dispatch, text: text.slice(0, 120) });
      } catch (e) {
        notify({ title: "沒送出去", body: String(e?.message ?? e).slice(0, 200), level: "error" });
      }
    });
  }

  renderSend() {
    const t = theme();
    const p = props();
    const title = p.startTask ? `在 ${p.seat.name} 開新的 Agent` : `${DISPATCH_TITLE[p.status] ?? "派工"}給「${p.who}」`;
    const hint = p.startTask
      ? "會開一個新分頁跑你最常用的 Agent，這句話是它收到的第一則訊息。它會走進來坐到你點的位子。"
      : p.status === "working"
        ? "它正在工作，這句話會排進它的輸入框，等它看到再處理。"
        : "這句話會貼進它的輸入框並按下 Enter。";
    return v_flex().id("office-send").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .w_full().p(18).gap(10).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(14).font_semibold().truncate().child(title))
      .child(div().text_size(11.5).text_color(t.dim).child(hint))
      .child(Input.new(this.input).w_full())
      .when(!!this.error, (el) => el.child(div().text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(h_flex().pt(4).gap(8).justify_end()
        .child(dialogButton(t, "send-cancel", "取消", false, () => closeOverlay(p.overlay)))
        .child(dialogButton(t, "send-ok", p.startTask ? "開始" : "送出", true, (_e, cx) => this.send(cx))));
  }

  // Asking before work stops: 喊停 (press its stop key, it can go on later) or 收工 (end the
  // terminal and its subagents).
  initConfirm(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.error = null;
  }

  confirmed(cx) {
    const p = props();
    if (p.demo) { this.error = "預覽模式裡的同事是假的，不會真的停下來"; return cx.notify(); }
    closeOverlay(p.overlay);
    if (p.confirm === "kill") return run("terminal.kill", { terminal: p.terminal });
    cx.spawn(async () => {
      try {
        const r = await hc(["interrupt", p.terminal]);
        if (r.code !== 0) throw new Error(r.stderr || r.stdout || `hc interrupt 結束碼 ${r.code}`);
      } catch (e) {
        notify({ title: "沒喊停成功", body: String(e?.message ?? e).slice(0, 200), level: "error" });
      }
    });
  }

  renderConfirm() {
    const t = theme();
    const p = props();
    const kill = p.confirm === "kill";
    return v_flex().id("office-confirm").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "enter") this.confirmed(cx);
        else if (e.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.stop_propagation();
      })
      .w_full().p(18).gap(10).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(14).font_semibold().truncate().child(kill ? `讓「${p.who}」收工？` : `叫「${p.who}」停下來？`))
      .child(div().text_size(11.5).text_color(t.muted).child(kill
        ? "會結束它的終端機和它開的子代理，正在做的事會中斷，沒辦法復原。"
        : "會在它的終端機按下停止鍵，手上這一步會中斷。之後可以再派工叫它繼續。"))
      .when(!!this.error, (el) => el.child(div().text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(h_flex().pt(4).gap(8).justify_end()
        .child(dialogButton(t, "confirm-no", "取消", false, () => closeOverlay(p.overlay)))
        .child(dialogButton(t, "confirm-yes", kill ? "收工" : "喊停", true, (_e, cx) => this.confirmed(cx), t.blocked)));
  }

  // The free seats in the shown office, each a spot to click: start your usual agent there
  // (right-click: pick one, or give it a first task). A seat on a space's island starts it in that
  // space; one on an empty island, in the space Herdr shows.
  seatSpots(npods, taken, owner, spaceNames, base, cap, s, t) {
    const active = spaces().find((x) => x.active);
    const px = (v) => Math.round(v * s);
    const out = [];
    for (let seat = 0; seat < npods * SEATS_PER_POD; seat++) {
      if (taken.has(seat)) continue;
      const pod = Math.floor(seat / SEATS_PER_POD);
      const space = owner[pod] ?? active?.id;
      if (!space) continue;
      const name = owner[pod] ? spaceNames[owner[pod]] ?? owner[pod] : active?.name ?? "";
      const q = seatAt(seat);
      const at = { space, seat: base + seat, cap, name };
      out.push(div().id(`seat-${seat}`).absolute()
        .left(px(q.x - 12)).top(px(q.north ? q.top + 2 : q.top + 56)).w(px(24)).h(px(q.north ? 12 : 16)).rounded(px(4))
        .hover((st) => st.bg(`${t.accent}55`))
        .tooltip(`在 ${name} 開新的 Agent（右鍵：選擇要開哪個）`)
        .on_click(() => startAgent({ ...at, demo: !!this.demo }))
        .on_mouse_down("right", (_e, cx) => { this.seatMenu(at); cx.stop_propagation(); }));
    }
    return out;
  }

  // What you just sent from the office: a bubble over your desk, "你 → name：text".
  yourBubbles(list, lo, names, t, s) {
    const here = new Set(list.map((a) => a.address));
    const mine = (this.talks ?? []).filter((x) => x.from === "you" && here.has(x.to)).slice(-2);
    return mine.map((x, i) => h_flex().absolute().left(Math.round((lo.x + 40) * s)).top(Math.round((lo.y + 4) * s) + i * 22)
      .w(Math.round(158 * s)).justify_end()
      .child(this.bubble(`你 → ${names[x.to] ?? whoIs(list.find((a) => a.address === x.to))}：${x.text}`, t)));
  }

  // Your desk's label: click it to go to whoever has waited longest there.
  deskLabel(list, lo, s) {
    const next = nextInQueue(list);
    const ui = styleOf().ui;
    return div().id("your-desk").absolute().left(Math.round((lo.x + 144) * s)).top(Math.round((lo.y + 114) * s)).px(7).h(17).rounded(9)
      .bg(ui.label).border(1).border_color(ui.labelBorder).text_color(ui.text).text_size(10).font_semibold().flex().items_center()
      .when(!!next, (el) => el.tooltip("前往下一位：等最久的「等你回覆」優先").hover((st) => st.opacity(0.85))
        .on_click(() => run("agent.focus", { terminal: next.address })))
      .child("你的桌子");
  }


  // ---------- errands ----------

  // Every couple of seconds: send errands home when they're over (or the agent got busy), and
  // now and then send an idle agent that has rested a while on a new one. A few at a time.
  errandTick(cx) {
    const now = Date.now();
    const list = this.people();
    const byAddress = Object.fromEntries(list.map((a) => [a.address, a]));
    let changed = false;
    for (const [k, e] of Object.entries(this.errands)) {
      if (e.until > now && byAddress[k]?.status === "idle") continue;
      delete this.errands[k];
      this.rested[k] = now;
      changed = true;
    }
    for (const k of Object.keys(this.rested)) if (byAddress[k]?.status !== "idle") delete this.rested[k];
    const idle = list.filter((a) => a.status === "idle");
    for (const a of idle) this.rested[a.address] ??= now;
    const out = Object.values(this.errands);
    if (out.length < Math.max(1, Math.ceil(idle.length / 3)) && Math.random() < 0.3) {
      const ready = idle.filter((a) => !this.errands[a.address] && now - this.rested[a.address] > ERRAND_MS.rest);
      const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
      const who = ready.length ? pick(ready) : null;
      const office = (a) => this.officeOf?.[a.address] ?? 0;
      // A chat is with someone working in the same office.
      const working = who ? list.filter((a) => a.status === "working" && office(a) === office(who)) : [];
      // One at the cooler and one with the cat at a time per office; the window has room for a few.
      const taken = new Set(Object.entries(this.errands).filter(([k]) => byAddress[k] && who && office(byAddress[k]) === office(who)).map(([, e]) => e.kind));
      const kinds = ["water", "window", "cat", "chat", "chat", "courtyard"].filter((k) =>
        k === "window" || (k === "chat" ? working.length > 0 : !taken.has(k)));
      if (who && kinds.length) {
        const kind = pick(kinds);
        if (kind === "courtyard") {
          const area = pick(["walk", "walk", "terrace", "pond", "meadow", "tree"]);
          const route = courtyardRoute(area, who.seq);
          this.errands[who.address] = { kind, route, since: now, until: now + route.reduce((sum, step) => sum + step.duration, 0) };
        } else {
          this.errands[who.address] = {
            kind, with: kind === "chat" ? pick(working).address : null,
            until: now + WALK.duration + ERRAND_MS.min + Math.random() * (ERRAND_MS.max - ERRAND_MS.min),
          };
        }
        changed = true;
      }
    }
    if (changed) cx.notify();
  }

  courtyardTrips(list, meeting) {
    const now = Date.now();
    const trips = {};
    this.courtyardNext = Infinity;
    const talking = new Set((this.talks ?? []).flatMap(({ from, to }) => [from, to]));
    for (const a of list) {
      const trip = this.errands[a.address];
      if (trip?.kind !== "courtyard" || a.status !== "idle") continue;
      if (meeting?.participants.includes(a.address) || talking.has(a.address)) {
        delete this.errands[a.address];
        this.rested[a.address] = now;
        continue;
      }
      const step = courtyardStep(trip.route, now - trip.since);
      if (!step) continue;
      trips[a.address] = step;
      this.courtyardNext = Math.min(this.courtyardNext, trip.since + step.end);
    }
    return trips;
  }

  // What an agent on an errand is up to, over its head once it gets there.
  doing(text) {
    return div().h(16).px(5).rounded(8).bg(styleOf().ui.label).border(1).border_color(styleOf().ui.labelBorder)
      .text_color(styleOf().ui.text).text_size(10).flex().items_center().child(text);
  }

  // ---------- talk and meetings ----------

  // Recent messages between agents (tell.mjs) and the meeting in progress (meeting.mjs).
  poll(cx) {
    cx.spawn(async (cx) => {
      const base = `${appHome()}/data/office`;
      let changed = false;
      // A file named `demo` in the data folder swaps in the made-up office, for previews.
      try {
        const text = await readTextFile(`${base}/demo`);
        const hour = text?.match(/hour=(\d+)/)?.[1];
        const demoHour = hour === undefined ? null : Number(hour) % 24;
        const size = Math.min(60, Number(text?.match(/agents=(\d+)/)?.[1] ?? DEMO.length));
        // "floor=2" shows the second office (once, when the line changes).
        const floor = text?.match(/floor=(\d+)/)?.[1];
        if (floor !== this.demoFloor) { this.demoFloor = floor; if (floor) { this.floor = Number(floor) - 1; changed = true; } }
        // "show=menu-working" (or menu-idle, dispatch, confirm-kill, confirm-interrupt, seat, task)
        // opens that menu or dialog once, for a made-up agent: to look at them without clicking.
        const show = text?.match(/show=([\w-]+)/)?.[1];
        if (show !== this.demoShow && this.demo) {
          this.demoShow = show;
          const of = (st) => this.demo.find((a) => a.status === st) ?? this.demo[0];
          const seat = { space: "web", seat: 3, cap: 2, name: "web" };
          if (show?.startsWith("menu-")) this.menu(of(show.slice(5)));
          else if (show === "dispatch") openOverlay({ mod: "office", kind: "dialog", width: 420, props: { dispatch: of("idle").address, status: "idle", who: task(of("idle")), demo: true } });
          else if (show?.startsWith("confirm-")) openOverlay({ mod: "office", kind: "dialog", width: 380, props: { confirm: show.slice(8), terminal: of("working").address, who: task(of("working")), demo: true } });
          else if (show === "seat") this.seatMenu(seat);
          else if (show === "task") openOverlay({ mod: "office", kind: "dialog", width: 420, props: { startTask: true, seat, demo: true } });
        }
        if ((text !== null) !== !!this.demo || demoHour !== this.demoHour || (this.demo && size !== this.demo.length)) {
          this.demo = text !== null ? demoAgents(size) : null;
          this.demoHour = this.demo ? demoHour : null;
          changed = true;
        }
      } catch { /* no data folder yet */ }
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
        status: isQuotaError(term) ? "tired" : term.status === "error" ? "blocked" : term.status,
      });
    }
    return out;
  }

  // An intern: a smaller character beside its parent, posed by its own status; hover for its task.
  intern(x, i, parentPlace, s, key, parent) {
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
    // Claude Code's own subagents have no terminal of their own: they run inside the parent's
    // session, so a click goes to the parent (right-click: the parent's menu).
    const tip = x.kind === "claude" ? `子代理（${x.type}）：${x.text}\n點一下前往主代理` : `子 Agent（${x.type}）：${x.text}`;
    return div().id(`in-${x.id}-${key}`).absolute()
      .left(Math.round((px + dx) * s - w / 2)).top(Math.round(top * s)).w(w).h(h)
      .transition("left", WALK).transition("top", WALK)
      .tooltip(tip)
      .when(x.kind === "hc", (el) => el.on_click(() => run("terminal.peek", { terminal: x.id }))
        .on_mouse_down("right", (_e, cx) => { this.internMenu(x); cx.stop_propagation(); }))
      .when(x.kind === "claude" && !!parent, (el) => el.on_click(() => run("agent.focus", { terminal: parent.address }))
        .on_mouse_down("right", (_e, cx) => { this.menu(parent); cx.stop_propagation(); }))
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
    this.picked = new Set(this.people().filter((a) => a.status !== "blocked" && a.status !== "tired").map((a) => a.address));
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
    if (!m?.dir) return;
    const [cmd, args] = openFileCommand(herdrWindow().platform, m.dir, "transcript.md");
    exec(cmd, args).catch((e) => notify({ title: "打不開會議紀錄", body: `${m.dir}：${String(e?.message ?? e).slice(0, 160)}`, level: "error" }));
  }

  renderMeetingSetup() {
    const t = theme();
    const p = props();
    const names = this.names();
    const list = this.people();
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
        const on = this.picked.has(a.address), busy = a.status === "blocked" || a.status === "tired";
        return h_flex().id(`pick-${a.address}`).h(28).px(6).gap(8).items_center().rounded(6)
          .hover((el) => el.bg(t.hover))
          .on_click((_e, cx) => { if (on) this.picked.delete(a.address); else this.picked.add(a.address); cx.notify(); })
          .child(div().w(14).h(14).rounded(3).border(1).border_color(on ? t.accent : t.input).bg(on ? t.accent : t.raised)
            .flex().items_center().justify_center().text_size(10).text_color(t.accent_foreground).child(on ? "✓" : ""))
          .child(image(`mods/office/img/head-${paletteOf(a.address)}.svg`).w(16).h(14).flex_none())
          .child(div().flex_1().min_w(0).truncate().text_size(12)
            .child(`${names[a.address] ? names[a.address] + " · " : ""}${toolOf(a)} · ${task(a) || a.space_name}`))
          .when(busy, (el) => el.child(div().text_size(10.5).text_color(statusColor(t, a.status))
            .child(a.status === "tired" ? "沒精神中" : "等你回覆中")));
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
    return v_flex().id(`quota-${key}`).gap(6).flex_none()
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
    const strip = h_flex().id("office-usage").flex_none().h(100).mx(10).mt(8).px(12).py(8).gap(14).items_start().overflow_x_scrollbar()
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
    // Facing us behind a monitor: only the head shows, nodding along as it types.
    if (pose === "typeFront") return div().relative().w(w).h(Math.round(16 * s))
      .child(div().absolute().left(0).loop("top", { from: 0, to: -0.7 * s, period: 520 }).child(this.sprite("typeFront", pal, s)));
    // Slumped over the desk (out of quota): slow, heavy breathing.
    if (pose === "slumpFront" || pose === "slumpBack") return div().relative().w(w).h(Math.round(16 * s))
      .child(div().absolute().left(0).loop("top", { from: 0, to: 0.6 * s, period: 2200 }).child(this.sprite(pose, pal, s)));
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
    // Hovered: who it is, and what the mouse buttons do.
    const label = hovered
      ? v_flex().px(6).py(2).rounded(5).bg(t.popover).border(1).border_color(statusColor(t, a.status)).max_w(220)
        .child(div().text_size(11).text_color(t.foreground).truncate()
          .child(name ? `${name} · ${task(a) || a.space_name}` : task(a) || a.space_name))
        .when(!!a.status_msg, (el) => el.child(div().text_size(9.5).text_color(statusColor(t, a.status)).truncate().child(a.status_msg)))
        .child(div().text_size(9.5).text_color(t.dim).child("左鍵前往 · 右鍵更多"))
      : extra === false ? null : extra ?? this.sign(a, t);
    // The agent the person has picked: a ring at its feet and a mark over its head (above its
    // sign, if any); hidden while hovered, where the label says who it is.
    const picked = a.focused && !hovered;
    return div().id(`ag-${a.address}-${key}`).absolute()
      .left(Math.round(x * s - w / 2)).top(Math.round(y * s)).w(w).h(h)
      .transition("left", WALK).transition("top", WALK)
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .on_mouse_down("right", (_e, cx) => { this.menu(a); cx.stop_propagation(); })
      .on_hover((on, cx) => { this.hovered = on ? a.address : this.hovered === a.address ? null : this.hovered; cx.notify(); })
      .when(picked, (el) => el.child(div().absolute().left(-3).bottom(-2).w(w + 6).h(Math.max(3, Math.round(3 * s))).rounded(4).bg(`${t.accent}88`)))
      .child(this.figure(pose, pal, s))
      .when(!!label, (el) => el.child(h_flex().absolute().top(hovered ? -36 : -22).left(-60).w(w + 120).justify_center().child(label)))
      .when(picked, (el) => el.child(h_flex().absolute().top(label ? -36 : -14).left(-20).w(w + 40).justify_center()
        .child(div().text_size(11).text_color(t.accent).child("▼"))));
  }

  // The name on a desk, so an empty chair still says whose it is: under a near seat, on the back
  // of the monitor for a far one.
  plate(a, seat, s, name) {
    const p = seatAt(seat);
    const w = Math.round(40 * s);
    return div().absolute().left(Math.round(p.x * s - w / 2)).top(Math.round((p.top + (p.north ? 15 : 71)) * s)).w(w)
      .flex().justify_center()
      .child(div().id(`plate-${a.address}`).max_w(w).px(5).rounded(4).bg(styleOf().ui.plate).border(1).border_color(styleOf().ui.labelBorder)
        .text_color(styleOf().ui.text).text_size(9.5).truncate().when(!!name, (el) => el.font_semibold())
        .on_mouse_down("right", (_e, cx) => { this.menu(a); cx.stop_propagation(); })
        .child(name || task(a) || a.space_name));
  }

  // A working monitor runs: lines of code scroll past and a cursor blinks. Only the near seats'
  // screens face us; a far seat's monitor shows its back.
  screen(a, seat, s) {
    if (a.status !== "working" || seatAt(seat).north) return null;
    const p = seatAt(seat), cx = p.x;
    const W = Math.round(18 * s), H = Math.round(9 * s), u = Math.max(1, Math.round(s));
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
    return div().absolute().left(Math.round((cx - 9) * s)).top(Math.round((p.top + 28) * s))
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

  // The room's floor plan: walls (with the sky of the hour), the floor under the desks, the
  // meeting room and the lounge. The desks themselves go on top, after the rugs (deskLayer).
  room(L, rows, s, phase) {
    const px = (n) => Math.round(n * s);
    const img = (name, h) => image(`mods/office/img/${styleOf().id}/${name}.svg`).w(px(SCENE_W)).h(px(h)).flex_none();
    const sky = phase === "day" || styleOf().id === "night" ? "" : `-${phase}`;
    const desks = v_flex().w(px(SCENE_W)).flex_none()
      .child(img(`wall${sky}`, WALL_H))
      .children(Array.from({ length: rows }, () => img("floor", POD_H)))
      .child(div().w(px(SCENE_W)).h(px(DESK_PAD)).flex_none().overflow_hidden().child(img("floor", POD_H)))
      .when(!!L.meet, (el) => el.child(img("meeting", MEET_H)));
    if (!L.wide) return desks.child(img("lounge", LOUNGE_H));
    const fills = Math.max(0, Math.ceil((L.h - WALL_H - LOUNGE_H) / FILL_H));
    const lounge = v_flex().w(px(SCENE_W)).h(px(L.h)).flex_none().overflow_hidden()
      .child(img(`wall-lounge${sky}`, WALL_H))
      .child(img("lounge-open", LOUNGE_H))
      .children(Array.from({ length: fills }, () => img("lounge-fill", FILL_H)));
    return h_flex().child(desks).child(lounge);
  }

  // ---------- seats ----------

  // Who sits where in `cap`-pod offices, kept across reloads in shared state (one map per office
  // size, so the side panel and a floating window don't fight over it). Saved after the render.
  seating(list, cap) {
    const key = `${this.demo ? "demo:" : ""}${Number.isFinite(cap) ? cap : "all"}`;
    const store = shared("office.seats") ?? {};
    // Seats someone clicked to start an agent at, for this office size, not yet expired.
    const reserve = (shared("office.reserved") ?? []).filter((r) => r.cap === cap && r.until > Date.now());
    const A = assignSeats(list, store[key] ?? {}, cap, reserve);
    if (JSON.stringify(A.seats) !== JSON.stringify(store[key] ?? {})) this.pendingSeats = { key, seats: A.seats };
    return A;
  }

  saveSeats() {
    if (checking()) return;
    const held = shared("office.reserved") ?? [];
    if (held.some((r) => r.until <= Date.now())) setShared("office.reserved", held.filter((r) => r.until > Date.now()));
    const p = this.pendingSeats;
    if (!p) return;
    this.pendingSeats = null;
    setShared("office.seats", { ...(shared("office.seats") ?? {}), [p.key]: p.seats });
  }

  // A color per space: the spaces in the order Herdr lists their agents.
  spaceColors(list) {
    const out = {};
    for (const a of list) out[a.space] ??= RUGS[Object.keys(out).length % RUGS.length];
    return out;
  }

  // Each claimed pod's rug, in its space's color (drawn before the pods).
  rugs(owner, colors, s) {
    const px = (n) => Math.round(n * s);
    return Object.entries(owner).map(([pod, space]) => {
      const r = podRect(Number(pod)), c = colors[space] ?? RUGS[0];
      return div().id(`rug-${pod}`).absolute().left(px(r.x)).top(px(r.y)).w(px(r.w)).h(px(r.h)).rounded(px(4))
        .bg(`${c}40`).border(Math.max(1, Math.round(s))).border_color(`${c}aa`);
    });
  }

  // Which rug is which space: a tag per space, in its rug's color, on the wall left of the door.
  // At most two lines; the rest fold into a "+N" chip that lists them (each island also names its
  // space on hover).
  spaceLegend(spaces, colors, counts, s) {
    const width = Math.round(82 * s);
    const shown = packTags(spaces.map(([, name]) => tagWidth(name)), width);
    const rest = spaces.slice(shown);
    return h_flex().absolute().left(Math.round(4 * s)).top(Math.round(6 * s)).max_w(width).flex_wrap().gap(4)
      .children(spaces.slice(0, shown).map(([space, name]) => div().id(`rug-tag-${space}`).h(16).px(6).rounded(5).max_w(width)
        .bg(colors[space]).border(1).border_color("#00000026").text_color("#ffffff").text_size(10).font_semibold()
        .truncate().flex().items_center().tooltip(`${name} · ${counts[space] ?? 0} 位`).child(name)))
      .when(rest.length > 0, (el) => el.child(div().id("rug-tag-more").h(16).px(6).rounded(5)
        .bg(styleOf().ui.label).border(1).border_color(styleOf().ui.labelBorder).text_color(styleOf().ui.text)
        .text_size(10).font_semibold().flex().items_center()
        .tooltip(rest.map(([space, name]) => `${name} · ${counts[space] ?? 0} 位`).join("\n"))
        .child(`+${rest.length}`)));
  }

  // The pods, `n` of them: the islands (under everyone) or the far monitors' backs (`front`,
  // drawn over the people sitting behind them).
  // `label`: pod -> its space's name, shown on hover over the island.
  pods(n, s, front = false, label = {}) {
    const px = (v) => Math.round(v * s);
    return Array.from({ length: n }, (_, pod) => {
      const r = podRect(pod);
      return div().id(`pod-${front ? "f" : "b"}-${pod}`).absolute().left(px(r.x)).top(px(r.y - 1))
        .when(!front && !!label[pod], (el) => el.tooltip(label[pod]))
        .child(image(`mods/office/img/${styleOf().id}/${front ? "podfront" : "pod"}.svg`).w(px(POD_W)).h(px(POD_H)));
    });
  }

  // Evening light: a warm tint at sunset; at night (day styles only, the night style is drawn
  // dark already) the room dims. In the dark the floor lamp and working monitors glow.
  light(L, phase, s, placed) {
    const px = (n) => Math.round(n * s);
    const out = [];
    const dim = styleOf().id !== "night";
    if (phase === "dusk") out.push(div().absolute().left(0).top(0).w(px(L.w)).h(px(L.h)).bg("#ff8a3d14"));
    if (phase === "night" && dim) out.push(div().absolute().left(0).top(0).w(px(L.w)).h(px(L.h)).bg("#0a123048"));
    if (phase !== "night") return out;
    if (dim) for (const [r, a] of [[26, "14"], [16, "1c"]]) {
      out.push(div().absolute().left(px(L.lo.x + 123 - r)).top(px(L.lo.y + 30 - r)).w(px(r * 2)).h(px(r * 2)).rounded(px(r)).bg(`#ffe39a${a}`));
    }
    for (const p of placed) {
      if (p.a.status !== "working" || p.meeting || p.talk || p.seat == null) continue;
      const q = seatAt(p.seat);
      // A near screen lights the desk; a far one lights its reader's face.
      out.push(q.north
        ? div().absolute().left(px(q.x - 14)).top(px(q.top)).w(px(28)).h(px(24)).rounded(px(10)).bg("#79c0ff1a")
        : div().absolute().left(px(q.x - 17)).top(px(q.top + 22)).w(px(34)).h(px(22)).rounded(px(10)).bg("#79c0ff1f"));
    }
    return out;
  }

  // A clock on the wall: the real time, a sun or a moon by it.
  wallClock(phase, s) {
    const mark = phase === "night" ? "☾" : "☀";
    return div().absolute().left(Math.round(158 * s)).top(Math.round(6 * s)).px(6).h(17).gap(3).rounded(9)
      .bg(styleOf().ui.label).border(1).border_color(styleOf().ui.labelBorder).text_color(styleOf().ui.text)
      .text_size(10).font_semibold().flex().items_center()
      .child(div().text_color(phase === "night" ? "#8aa0d6" : phase === "dusk" ? "#e07a3a" : "#e0a020").child(mark))
      .child(this.demoHour != null ? `${String(this.demoHour).padStart(2, "0")}:00` : this.clock ?? clockText());
  }

  // The wall between the two rooms when they sit side by side, with a door.
  divider(L, s) {
    const seg = (y, h) => div().absolute().left(Math.round((SCENE_W - 3) * s)).top(Math.round(y * s))
      .w(Math.round(5 * s)).h(Math.round(h * s)).bg(styleOf().ui.wall).border(1).border_color(styleOf().ui.wallBorder);
    const door = WALL_H + 64, gap = 30;
    return [seg(WALL_H - 2, door - WALL_H + 2), seg(door + gap, L.h - door - gap + 2)];
  }

  // Newcomers walk in through the door: on the first render they stand in the doorway, a moment
  // later at their seat (or wherever their status sends them). Whoever is in when the panel opens
  // is simply there.
  arrivals(list) {
    const now = Date.now();
    if (!this.seen) { this.seen = new Set(list.map((a) => a.address)); return; }
    for (const a of list) if (!this.seen.has(a.address)) { this.seen.add(a.address); this.entering[a.address] = now; }
  }

  // ---------- offices ----------

  // The height the office size is worked out for: the stage as if the roster were full and the
  // navigation row shown, so a newcomer doesn't change the office size and reshuffle everyone.
  capHeight(n) {
    const roster = n > 0 ? Math.min(n * 28 + 12, ROSTER_MAX) : ROSTER_MAX;
    return this.stageH - (ROSTER_MAX - roster);
  }

  // Who is in which office, and which office is shown.
  plan(list) {
    const cap = podsPerOffice({ stageW: this.stageW, stageH: this.capHeight(list.length), pref: layoutOf().id });
    const A = this.seating(list, cap);
    const per = cap * SEATS_PER_POD;
    const officeOf = {};
    for (const a of list) officeOf[a.address] = Math.floor(A.seats[a.address] / per);
    const offices = Math.max(1, ...Object.values(officeOf).map((o) => o + 1));
    const meeting = meetingOn(this.meeting) ? this.meeting : null;
    const trips = this.courtyardTrips(list, meeting);
    // Follow a newly selected agent once, so the person can browse afterwards.
    const focus = list.find((a) => a.focused)?.address ?? null;
    if (focus !== this.lastFocus) {
      if (focus && this.lastFocus !== undefined) this.showCourtyard = !!trips[focus]?.place;
      this.lastFocus = focus;
      if (focus) this.floor = meeting?.participants.includes(focus) ? 0 : officeOf[focus] ?? this.floor;
    }
    this.floor = Math.max(0, Math.min(this.floor ?? 0, offices - 1));
    this.officeOf = officeOf;
    return { cap, A, per, officeOf, offices, floor: this.floor, trips, meeting };
  }

  // Go to the scene someone is in.
  goTo(address, P, cx) {
    const f = P.meeting?.participants.includes(address) ? 0 : P.officeOf[address];
    if (f == null) return;
    this.floor = f;
    this.showCourtyard = !!P.trips[address]?.place;
    cx?.notify();
  }

  // Each floor and the shared courtyard have a tab. Floors with waiting agents keep their red dot.
  officeTabs(list, P, t) {
    const by = Array.from({ length: P.offices }, () => ({ n: 0, blocked: 0 }));
    for (const a of list) { const o = by[P.officeOf[a.address]]; if (!o) continue; o.n++; if (a.status === "blocked") o.blocked++; }
    const tab = (id, label, on) => h_flex().id(id).h(22).px(8).gap(5).items_center().rounded(6).flex_none()
      .bg(on ? t.selected : t.raised).border(1).border_color(on ? t.accent : t.border)
      .text_size(11.5).text_color(on ? t.foreground : t.muted)
      .when(!on, (el) => el.hover((st) => st.bg(t.hover)))
      .child(div().font_semibold().child(label));
    const outside = Object.values(P.trips).filter((step) => step.place).length;
    return h_flex().id("office-tabs").flex_none().h(TABS_H).px(10).pt(8).gap(6).items_center().overflow_x_scroll()
      .child(tab("office-tab-courtyard", "中庭", this.showCourtyard)
        .on_click((_e, cx) => { this.showCourtyard = true; cx.notify(); })
        .when(outside > 0, (el) => el.child(div().text_color(t.dim).child(String(outside)))))
      .children(by.map((o, i) => tab(`office-tab-${i}`, P.offices === 1 ? "辦公室" : `${i + 1}F`, !this.showCourtyard && i === P.floor)
        .on_click((_e, cx) => { this.floor = i; this.showCourtyard = false; cx.notify(); })
        .child(div().text_color(t.dim).child(String(o.n)))
        .when(o.blocked > 0, (el) => el.child(div().w(7).h(7).rounded(4).bg(t.blocked)
          .tooltip(`${o.blocked} 位等你回覆`).loop("opacity", { from: 0.25, to: 1, period: 900 })))));
  }

  trackWalk(placed, key) {
    const now = Date.now();
    for (const { a, place: [x, y] } of placed) {
      const prev = this.last[a.address], here = `${Math.round(x)},${Math.round(y)}`;
      if (prev?.key !== key) delete this.walking[a.address];
      else if (prev.at !== here) this.walking[a.address] = now + WALK.duration;
      this.last[a.address] = { key, at: here };
    }
  }

  courtyard(list, t, P) {
    const s = Math.max(0, Math.min((this.stageW - 2) / COURT_W, (this.stageH - 2) / COURT_H));
    const px = (n) => Math.round(n * s);
    const phase = phaseNow(this.demoHour ?? null);
    const art = phase === "night" ? "night" : styleOf().id;
    const key = `courtyard-${Math.round(s * 100)}`;
    const names = this.names();
    const visitors = list.flatMap((a) => P.trips[a.address]?.place ? [{ a, place: P.trips[a.address].place }] : []);
    const interns = this.interns(visitors.map(({ a }) => a));
    this.trackWalk(visitors, key);
    const trees = ORCHARD.map(([x, y, fruit]) => ({ depth: y + 28,
      element: div().absolute().left(px(x - 12)).top(px(y))
        .child(image(`mods/office/img/${art}/orchard-${fruit}.svg`).w(px(24)).h(px(28))) }));
    const actors = visitors.map(({ a, place }) => ({ depth: place[1] + (POSE_H[place[2]] ?? 21),
      element: this.character(a, place, s, t, key, names[a.address]) }));
    return div().relative().w(px(COURT_W)).h(px(COURT_H)).overflow_hidden()
      .child(image(`mods/office/img/${art}/courtyard.svg`).w(px(COURT_W)).h(px(COURT_H)))
      .when(phase === "dusk", (el) => el.child(div().absolute().size_full().bg("#d96a3426")))
      .children([...trees, ...actors].sort((a, b) => a.depth - b.depth).map(({ element }) => element))
      .children(visitors.flatMap(({ a, place }) => (interns[a.address] ?? []).slice(0, 4).map((x, i) => this.intern(x, i, place, s, key, a))))
      .children(visitors.filter(({ a }) => (interns[a.address] ?? []).length > 4).map(({ a, place }) => this.moreInterns(interns[a.address].length - 4, place, s)));
  }

  scene(all, t, P) {
    const { A, floor } = P;
    const base = floor * P.per;
    const m = P.meeting;
    // A meeting is held on the first floor: its participants show there, whichever office is theirs.
    const meets = (a) => !!m && m.participants.includes(a.address);
    const list = all.filter((a) => (meets(a) ? floor === 0 : P.officeOf[a.address] === floor));
    const local = (a) => (P.officeOf[a.address] === floor ? A.seats[a.address] - base : null);
    const owner = {};
    for (const [pod, space] of Object.entries(A.owner)) if (Math.floor(Number(pod) / P.cap) === floor) owner[Number(pod) - floor * P.cap] = space;
    const rows = Math.max(1, Math.ceil(Math.max(0, ...Object.keys(owner).map((p) => Number(p) + 1)) / PODS_PER_ROW));
    const seats = m ? m.participants.filter((x) => list.some((a) => a.address === x)) : [];
    const L = this.layoutFor(rows, seats.length > 0), s = L.s, lo = L.lo, mo = L.mo;
    const phase = phaseNow(this.demoHour ?? null);
    const count = { working: 0, blocked: 0, done: 0, tired: 0, idle: 0 };
    const placed = list.map((a) => {
      const seat = local(a);
      const chair = seats.indexOf(a.address);
      if (chair >= 0) {
        const [x, y, pose] = MEET_SEATS[chair];
        return { a, seat, meeting: true, place: [mo.x + x, mo.y + y, pose] };
      }
      const key = a.status in count ? a.status : "idle";
      const place = spot({ ...a, status: key }, seat, count[key]++, lo);
      const trip = P.trips[a.address];
      return { a, seat, place: trip ? [DOOR[0], DOOR[1], "stand"] : place, trip };
    });
    const inside = placed.filter((p) => !p.trip?.place);
    // Whoever just messaged a teammate walks over and stands beside it.
    const talkOf = {};
    for (const x of this.talks ?? []) talkOf[x.from] = x;
    const at = Object.fromEntries(inside.map((p) => [p.a.address, p]));
    for (const p of inside) {
      const x = talkOf[p.a.address], to = x && at[x.to];
      if (!to || p.meeting || to === p) continue;
      p.talk = x;
      p.place = [Math.min(to.place[0] + 17, L.w - 9), to.place[1] - (to.place[2] === "type" ? 2 : 3), "stand"];
    }
    // Idle agents out on an errand. Their sofa stays theirs, so nobody else shuffles over.
    let atWindow = 0;
    for (const p of inside) {
      const e = this.errands?.[p.a.address];
      if (!e || e.kind === "courtyard" || p.meeting || p.talk || p.a.status !== "idle") continue;
      const place = errandSpot(e.kind, lo, e.kind === "window" ? atWindow++ : 0, e.with ? at[e.with]?.place : null);
      if (!place) continue;
      p.place = [Math.min(place[0], L.w - 9), place[1], place[2]];
      p.errand = e;
    }
    // Newcomers start in the doorway.
    for (const p of inside) if (this.entering[p.a.address] && !p.meeting) p.place = [DOOR[0], DOOR[1], "stand"];
    // Same layout and scale as last time and a new spot: the agent walks there.
    const key = `${floor}-${L.wide ? "w" : "t"}${Math.round(s * 100)}`;
    this.trackWalk(inside, key);
    const names = this.names();
    const interns = this.interns(list);
    const colors = this.spaceColors(all);
    const counts = {};
    for (const a of list) counts[a.space] = (counts[a.space] ?? 0) + 1;
    const legend = [...new Map(list.map((a) => [a.space, a.space_name])).entries()];
    const spaceNames = Object.fromEntries(all.map((a) => [a.space, a.space_name]));
    const extra = (p) => {
      if (p.meeting && m.speaker === p.a.address) return this.speaking(m.status === "summarizing" ? "整理結論中" : "發言中", t);
      if (p.meeting) return false; // in the meeting only the speaker gets a sign
      if (p.talk) return this.bubble(`→ ${names[p.talk.to] ?? toolOf(at[p.talk.to].a)}：${p.talk.text}`, t);
      if (p.errand) { const label = ERRANDS[p.errand.kind].label; return label && !this.walking[p.a.address] ? this.doing(label) : false; }
      return null;
    };
    const npods = rows * PODS_PER_ROW;
    // A far seat's plate sits on its monitor's back, where its owner's face would be: shown only
    // while the owner is away from the desk.
    const seated = (p) => (p.place[2] === "typeFront" || p.place[2] === "slumpFront") && !this.walking[p.a.address];
    const farPlates = placed.filter((p) => p.seat != null && seatAt(p.seat).north && !seated(p));
    // Farther back draws first, so nearer characters overlap them.
    const byDepth = [...inside].sort((p, q) => p.place[1] - q.place[1]);
    const gateOpen = inside.some((p) => p.trip);
    return div().relative().w(Math.round(L.w * s)).h(Math.round(L.h * s)).overflow_hidden()
      .child(this.room(L, rows, s, phase))
      .when(gateOpen, (el) => el.child(div().absolute().left(Math.round(89 * s)).top(Math.round(4 * s))
        .child(image(`mods/office/img/${phase === "night" ? "night" : styleOf().id}/door-open.svg`).w(Math.round(22 * s)).h(Math.round(40 * s)))))
      .children(this.rugs(owner, colors, s))
      .children(this.pods(npods, s, false, Object.fromEntries(Object.entries(owner).map(([pod, space]) => [pod, `${spaceNames[space] ?? space} · ${counts[space] ?? 0} 位`]))))
      .when(L.wide, (el) => el.children(this.divider(L, s)))
      .children(this.light(L, phase, s, inside))
      .child(this.wallClock(phase, s))
      // The spaces' tags name the work area; with nobody in, the plain label does.
      .child(legend.length ? this.spaceLegend(legend, colors, counts, s) : this.zone("工作區", 4, 6, s))
      .child(this.zone("休息區", lo.x + 8, lo.y + 112, s))
      .child(this.deskLabel(list, lo, s))
      .children(this.yourBubbles(list, lo, names, t, s))
      .when(!!L.meet, (el) => el.child(this.zone("會議室", mo.x + 150, mo.y + 47, s)))
      .children(inside.filter((p) => !p.meeting && !p.talk && p.seat != null).map((p) => this.screen(p.a, p.seat, s)).filter(Boolean))
      .children(placed.filter((p) => p.seat != null && !seatAt(p.seat).north).map((p) => this.plate(p.a, p.seat, s, names[p.a.address])))
      .children(this.seatSpots(npods, new Set(all.filter((a) => P.officeOf[a.address] === floor).map((a) => A.seats[a.address] - base)), owner, spaceNames, base, P.cap, s, t))
      .children(byDepth.map((p) => this.character(p.a, p.place, s, t, key, names[p.a.address], extra(p))))
      .children(this.pods(npods, s, true))
      .children(farPlates.map((p) => this.plate(p.a, p.seat, s, names[p.a.address])))
      .children(inside.flatMap((p) => (interns[p.a.address] ?? []).slice(0, 4).map((x, i) => this.intern(x, i, p.place, s, key, p.a))))
      .children(inside.filter((p) => (interns[p.a.address] ?? []).length > 4).map((p) => this.moreInterns(interns[p.a.address].length - 4, p.place, s)));
  }

  roster(list, t, P) {
    const sorted = [...list].sort((x, y) => (ORDER[x.status] ?? 9) - (ORDER[y.status] ?? 9) || y.seq - x.seq);
    const names = this.names();
    const interns = this.interns(list);
    const locations = P.offices > 1 || Object.values(P.trips).some((step) => step.place);
    // Compact rows; past five agents the list scrolls on its own, the room stays put.
    return div().id("office-roster").flex_none().max_h(ROSTER_MAX).overflow_y_scrollbar()
      .child(v_flex().px(10).py(6)
        .children(sorted.map((a) => {
          const color = statusColor(t, a.status);
          const name = names[a.address];
          const outside = !!P.trips[a.address]?.place;
          const here = outside ? this.showCourtyard : !this.showCourtyard && P.officeOf[a.address] === P.floor;
          const tip = [a.space_name, a.program?.name ?? a.app ?? "", a.status_msg].filter(Boolean).join(" · ");
          return h_flex().id(`row-${a.address}`).h(28).px(6).gap(8).items_center().rounded(6)
            .tooltip(tip)
            .when(a.focused, (el) => el.bg(t.raised))
            .hover((el) => el.bg(t.hover))
            .on_click((_e, cx) => { run("agent.focus", { terminal: a.address }); this.goTo(a.address, P, cx); })
            .on_mouse_down("right", (_e, cx) => { this.menu(a); cx.stop_propagation(); })
            .child(image(`mods/office/img/head-${paletteOf(a.address)}.svg`).w(18).h(16).flex_none())
            .when(locations, (el) => el.child(div().flex_none().w(25).text_size(10.5).font_semibold()
              .text_color(here ? t.foreground : t.dim).child(outside ? "中庭" : `${P.officeOf[a.address] + 1}F`)))
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
    // The floating window stays inside Herdr; the desktop window can go on another screen.
    const windowButton = (id, text, action) => h_flex().id(id).h(28).px(10).rounded(8).justify_center().items_center()
      .bg(t.raised).border(1).border_color(t.border).text_size(12).text_color(t.foreground)
      .hover((st) => st.bg(t.hover))
      .on_click(() => {
        action();
        if (props()?.overlay) closeOverlay(props().overlay);
      })
      .child(text);
    return v_flex().size_full().p(12).gap(12).bg(t.popover)
      .child(row("風格", STYLES, styleOf().id, "office.style"))
      .child(row("佈局", LAYOUTS, layoutOf().id, "office.layout"))
      .child(row("日夜", DAYNIGHT, daynightOf().id, "office.daynight"))
      .child(v_flex().gap(6)
        .child(div().text_size(11).text_color(t.dim).child("視窗"))
        .child(windowButton("office-popout", "以浮動視窗開啟（在 Herdr 裡）", () => run("mod.open", { name: "office" })))
        .child(windowButton("office-desktop", "開成桌面視窗（可拖到其他螢幕）", () => openDesktop())));
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

  header(list, t, P) {
    const count = (s) => list.filter((a) => a.status === s).length;
    const overlay = props()?.overlay;
    // With more than one office, a status count takes you to the office of the first one in it.
    const jump = (s) => (P.offices > 1 || this.showCourtyard) && s !== "idle";
    return h_flex().h(34).px(12).gap(10).items_center().flex_none().border_b(1).border_color(t.border)
      .child(div().text_size(13).font_semibold().text_color(t.foreground).child("辦公室"))
      .child(h_flex().flex_1().gap(8).children(["blocked", "done", "working", "tired", "idle"].filter((s) => count(s)).map((s) =>
        h_flex().id(`count-${s}`).gap(4).px(3).rounded(4).items_center().text_size(11).text_color(t.muted)
          .when(jump(s), (el) => el.hover((st) => st.bg(t.hover)).tooltip(`到${STATUS[s].label}的人所在的辦公室`)
            .on_click((_e, cx) => this.goTo(list.find((a) => a.status === s)?.address, P, cx)))
          .child(div().w(6).h(6).rounded(3).bg(statusColor(t, s)))
          .child(`${STATUS[s].label} ${count(s)}`))))
      .child(this.meetingControl(t))
      .child(div().id("office-settings").p(4).rounded(5).tooltip("設定")
        .hover((st) => st.bg(t.hover))
        .on_click(() => openOverlay({ mod: "office", kind: "popup", width: 260, height: 324, props: { settings: true } }))
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
    if (props()?.menu || props()?.seatMenu) return this.renderMenu();
    if (props()?.dispatch || props()?.startTask) return this.renderSend();
    if (props()?.confirm) return this.renderConfirm();
    const t = theme();
    const list = this.people();
    this.arrivals(list);
    const P = this.plan(list);
    // The room takes whatever height is left and scales to fit it both ways.
    return v_flex().size_full().overflow_hidden().bg(t.surface)
      .child(this.header(list, t, P))
      .child(this.usageStrip(t))
      .child(this.officeTabs(list, P, t))
      .child(h_flex().id("office-stage").flex_1().min_h(0).w_full().px(10).pt(8).justify_center().items_center().overflow_hidden()
        .on_size_change((size, cx) => {
          const w = Math.floor(size.width) - 20, h = Math.floor(size.height) - 8;
          if (w !== this.stageW || h !== this.stageH) { this.stageW = w; this.stageH = h; cx.notify(); }
        })
        .child(div().rounded(8).overflow_hidden().border(1).border_color(t.border)
          .child(this.showCourtyard ? this.courtyard(list, t, P) : this.scene(list, t, P))))
      .when(list.length > 0, (el) => el.child(this.roster(list, t, P)))
      .when(list.length === 0, (el) => el.child(v_flex().flex_none().p(16).gap(4).items_center().text_size(12).text_color(t.muted)
        .child("辦公室還沒有人上班")
        .child("在 Herdr 裡開一個 Claude Code 或 Codex，就會有人坐進來")));
  }
}
