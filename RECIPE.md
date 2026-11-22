# Office

A pixel-art office in a side panel: each coding agent running in Herdr is a person at work. Working agents type at their own desk, agents waiting for the person or done queue at the person's desk, idle ones rest in the lounge. Above the room, rings show each tool's remaining plan quota. Agents can message each other and hold meetings, and the office draws it.

<!-- ![Office](preview.png) — to be added -->

## What you see

Top to bottom, in a panel about 400 px wide:

- **Header**, 34 px: "辦公室", a count per status (dot in the theme's status color + label), a "開會" chip (or "會議中 · 第 n/N 輪" + "結束" while a meeting runs, "會議紀錄" after), a settings gear. With more than one office, the counts (but 閒置) take you to the office of the first agent in them.
- **Usage strip**, ~90 px, rounded card in `background` with a `border` line: one group per tool used in the last 7 days, most recent first, separated by 1 px rules. A group is its icon (Herdr's `icons/claude.svg` tinted `#d97757`, `icons/codex.svg`, `icons/antigravity.svg`), its name, and 40 px rings: a gray track (`raised`) and an arc for the share left, colored `#7cc47f` above 40 %, `working` from 16–40 %, `blocked` at 15 % or less, the remaining % in the middle, the window ("5 小時", "每週") below. A tool with no quota on disk (agy) shows a gray ring with today's prompt count.
- **The room**, filling the rest, scaled to fit both ways, rounded 8 px with a `border` line. Pixel art drawn 200 units wide per piece: a glass curtain wall with trees outside and a glass door in the middle (48), an open-plan floor of pods (84 a row, two pods a row, at least one row, 8 more under the last row), a meeting room (64, only during a meeting), and the lower room (132): lounge on the left with two sofas, a coffee table and a cat; "your desk" on the right behind a glass partition. Panels wider than tall put the lower room to the right of the desks instead, with a glass wall and a door between. Zone labels: 休息區, 你的桌子, 會議室. A water cooler at the lounge's top left.
- **Pods**: islands of four desks (96 wide): a long oak table; the near pair sit with their backs to us, their screens toward us; the far pair face us from behind their monitors, whose backs (`podfront.svg`) are drawn over them so only their heads show. A near seat's nameplate is under its chair; a far seat's sits on its monitor's back, shown only while its owner is away from the desk.
- **Spaces**: a pod belongs to the space of whoever sits at it, and gets a rounded rug in that space's color (`#6f9fd8`, `#7fb07a`, `#e9a24a`, `#d9727a`, `#a98bd6`, `#5fb3b0`, the spaces in the order Herdr lists their agents; fill 25 %, edge 67 %), laid between the floor (`floor.svg`) and the pods (`pod.svg`). Hover a pod: its space and how many are in. At the wall's top left, left of the door, a tag per space in its rug's color (white, bold), at most two lines; the rest fold into a "+N" chip listing them. With nobody in, the plain 工作區 label instead.
- **Offices**: an office holds as many pod rows as fit while the room is drawn at least at its art size (worked out for the stage as if the roster were full and the tabs shown, so neither changes it). More agents open another office. Then a row of tabs above the room: "1F 24", "2F 6", the shown one in `selected` with an `accent` edge; one where someone waits for the person has a blinking `blocked` dot. Each office has its own lounge and desk; a meeting is held on 1F. The roster shows each agent's office.
- **Clock**, at the wall's top right: ☀ (☾ at night) and the time, `HH:MM`.
- **Roster**, up to 5 rows of 28 px, then it scrolls: face, office (with more than one), name (bold, if given), task, a "子代理 n" tag, a pencil, the status.

Three styles (art in `img/<style>/`): modern (concrete, aluminium and glass, light oak, white), cozy (planks, wooden frames, walnut, green chairs, teal sofas), night (starry sky, dark floor and furniture, a lamp glow).

Day and night: modern and cozy follow the clock unless the setting 日夜 says 固定白天. From 17:00 the glass shows a sunset (orange bands, a sun on the hills, `wall-dusk.svg`) and the room takes a faint warm tint; from 19:00 to 6:00 a night sky (stars, a crescent moon, `wall-night.svg`), the room dims (`#0a123048`), and a glow sits around the floor lamp and every working monitor. The night style is always night (monitors glow too).

## How it behaves

- **Seats**: an agent keeps its seat as long as it lives (saved in shared `office.seats`, one map per office size). A newcomer walks in through the door and takes a free seat on its space's pod (near side first), else an empty pod, else a new pod; a space stays in one office while it has room.
- **working**: seated at its own seat: near side back to us, typing (two frames), the screen scrolling colored code lines with a blinking cursor; far side facing us, nodding over its monitor.
- **blocked**: walks to your desk, queues on the left, waves; a blinking "! 等你回覆" sign in `blocked`.
- **done**: queues on the right of your desk, bounces; "✓ 做完了" in `done`. Its desk stays empty with its nameplate.
- **idle**: sits on a lounge sofa, then on the far sofa, then stands around.
- **Errands**: an idle agent that has rested 15 s may get up (a 30 % chance every 2 s; about one in three idle agents out at once) for 6–14 s: to the water cooler (back to us, "倒水"), to the window (back to us at the glass, no label), to the cat ("摸貓"), or beside a working coworker ("聊天"). One at the cooler and one with the cat at a time. Its sofa stays its own; it walks back when done, or at once if its status changes.
- A status change walks the character to its new spot (left/top transitions, walking frames while moving). A resize places everyone afresh without walking.
- Hover a character: its name and task, and "左鍵前往 · 右鍵更多". Click: `agent.focus`.
- Right-click a character, nameplate or roster row: a menu (↑/↓, Enter, Esc) by status. Blocked: 前往回覆, 偷看一下 (`terminal.peek`), 釘選 (`terminal.pin`), 取名…. Done: 前往驗收, 交代下一件事…, 取名…, 收工…. Working: 偷看一下, 補充交代…, 前往, 取名…, 喊停…, 收工…. Idle: 派工…, 前往, 釘選, 取名…, 收工…. The ones that stop work come last, in `blocked` red, after a rule. A blocked agent gets no send: it may be on a permission prompt.
- 派工… and the like: a dialog with one line, sent with `hc send` and logged to `talk.jsonl` as from "you"; for 10 s a bubble "你 → name：text" sits over your desk. 喊停… (`hc interrupt`) and 收工… (`terminal.kill`) ask first, in the office's own dialog (red button).
- An empty seat lights up on hover ("在 web 開新的 Agent"). Click: `tab.new` in that pod's space (an empty pod: the space Herdr shows), in its first terminal's folder, running the most-picked installed agent (`knownAgents`); the seat is held for it for a minute (shared `office.reserved`), so it walks in and sits there. Right-click: pick the agent, or 帶著任務開… with a first message.
- Click 你的桌子: `agent.focus` on whoever has waited longest there, blocked first.
- Names are stored as the terminal label `office.name`.
- Subagents are interns, 72 % size, beside their parent and following it: Claude Code's own (from the session's `subagents/*.meta.json` while not `finished`) and `hc run` children (`terminals()` with a `parent`). Hover for the task; click an hc child to peek, right-click it for 偷看一下, 前往, 收工….
- A message sent with the herdr-team skill's `tell.mjs` walks the sender next to the receiver for 10 s with a speech bubble "→ name：text".
- A meeting (dialog: topic, 2–6 participants, 1–3 rounds) opens the meeting room; participants sit at the table, the speaker shows "● 發言中". It ends with a notification and the minutes.

## Built from

- Layout: a block `{ "mod": "office", "props": { "dock": true } }` in any layout, or `mod.open office` (`mod.json` describes a window overlay, key `office`).
- `main.js` (the view; roles by props: `rename`, `settings`, `meetingSetup`, `menu`/`seatMenu`, `dispatch`/`startTask`, `confirm`) and `logic.js` (geometry, layout choice, formatting; no Herdr imports).
- Herdr API: `agents`, `terminals`, `theme`, `spaces`, `panes`, `knownAgents`, `shared`/`setShared` (`office.style`, `office.layout`, `office.daynight`, `office.seats`, `office.reserved`), `openOverlay`, `closeOverlay`, `run` (`agent.focus`, `terminal.peek`, `terminal.pin`, `terminal.kill`, `tab.new`), `exec`, `hc` (`label`, `send`, `interrupt`), `readTextFile`, `notify`, `fs/promises`, `cx.timer`, native `loop`/`transition`.
- `usage.mjs` (run with node every minute): Codex `rate_limits` from `~/.codex/sessions`, Claude Code tokens from `~/.claude/projects` (incremental cache), plan quota from the status line's file, agy prompts from `~/.gemini/antigravity-cli/history.jsonl`.
- `statusline.mjs`: Claude Code status line; saves `rate_limits` and the terminal → session map.
- `meeting.mjs`: started with `hc run --bg`; sends each participant a `[會議]` message, `hc send --wait`, reads the speech file it wrote in the temp folder, writes the minutes.
- `skills/herdr-team`: teaches agents `tell.mjs who|<to> <message>` (wraps `hc send`, logs `talk.jsonl`).
- Art: `art/generate.mjs`, every sprite drawn from character maps and rectangles, outlined automatically.
- Preview: a file named `demo` in `data/office/` (and every `herdr-app check`) draws a made-up office of three spaces and nine agents (`demoAgents` in `logic.js`). In the file: `hour=18` pins the clock, `agents=30` sets the crowd, `floor=2` shows that office, `show=menu-working` (or `menu-idle`, `dispatch`, `confirm-kill`, `seat`, `task`…) opens a menu or dialog once. Its agents are made up: sends, stops and new agents don't run.

## Watch out

- On Windows, edits behind a directory junction don't reach Herdr's watcher: copy the mod in (`scripts/sync.mjs`), don't link it.
- Herdr's `transition` stuck characters when every one of them moved at once on a resize: key the character elements by layout and scale so a resize recreates them instead.
- `loop("opacity")` swinging far past 0..1 (−8 to 9, linear) gives near-instant frame flips: two stacked frames make a sprite animation without timers.
- Agents in sandboxes may not write outside their workspace: meeting speech files go to the system temp folder.
- agy keeps no quota on disk; don't call Google's private API with the person's token.

## Done when

- `herdr-app check mods/office` passes; `npm test` and `npm run check` pass.
- An agent that starts working walks to its desk and its monitor scrolls; one that blocks walks to your desk and waves.
- The usage strip lists only tools used this week, with rings for Claude Code and Codex.
- A meeting between two agents seats them, marks the speaker, and leaves `transcript.md` and `summary.md`.
- A Claude Code subagent appears as an intern beside its parent and leaves when it finishes.
