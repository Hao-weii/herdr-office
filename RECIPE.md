# Office

A pixel-art office in a side panel: each coding agent running in Herdr is a person at work. Working agents type at their own desk, agents waiting for the person or done queue at the person's desk, idle ones rest in the lounge. Above the room, rings show each tool's remaining plan quota. Agents can message each other and hold meetings, and the office draws it.

<!-- ![Office](preview.png) — to be added -->

## What you see

Top to bottom, in a panel about 400 px wide:

- **Header**, 34 px: "辦公室", a count per status (dot in the theme's status color + label), a "開會" chip (or "會議中 · 第 n/N 輪" + "結束" while a meeting runs, "會議紀錄" after), a settings gear.
- **Usage strip**, ~90 px, rounded card in `background` with a `border` line: one group per tool used in the last 7 days, most recent first, separated by 1 px rules. A group is its icon (Herdr's `icons/claude.svg` tinted `#d97757`, `icons/codex.svg`, `icons/antigravity.svg`), its name, and 40 px rings: a gray track (`raised`) and an arc for the share left, colored `#7cc47f` above 40 %, `working` from 16–40 %, `blocked` at 15 % or less, the remaining % in the middle, the window ("5 小時", "每週") below. A tool with no quota on disk (agy) shows a gray ring with today's prompt count.
- **The room**, filling the rest, scaled to fit both ways, rounded 8 px with a `border` line. Pixel art drawn 200 units wide per piece: a glass curtain wall with trees outside (48), rows of three desks (76 each, at least two rows), a meeting room (64, only during a meeting), and the lower room (132): lounge on the left with two sofas, a coffee table and a cat; "your desk" on the right behind a glass partition. Panels wider than tall put the lower room to the right of the desks instead, with a glass wall and a door between. Zone labels: 休息區, 你的桌子, 會議室. Nameplates under each desk. A water cooler at the lounge's top left.
- **Spaces**: each space's agents sit at neighbouring desks; a space starts a new row unless it fits in what is left of the current one. Under its desks, a rounded rug in its color (`#6f9fd8`, `#7fb07a`, `#e9a24a`, `#d9727a`, `#a98bd6`, `#5fb3b0` in turn, fill at 25 %, edge at 67 %), laid between the floor (`floor.svg`) and the see-through desks (`deskrow.svg`). At the wall's top left, a tag per space in its rug's color with its name (white, bold, wraps to a second line). With nobody in, the plain 工作區 label instead.
- **Clock**, at the wall's top right: ☀ (☾ at night) and the time, `HH:MM`.
- **Roster**, up to 5 rows of 28 px, then it scrolls: face, name (bold, if given), task, a "子代理 n" tag, a pencil, the status.

Three styles (art in `img/<style>/`): modern (concrete, aluminium and glass, light oak, white), cozy (planks, wooden frames, walnut, green chairs, teal sofas), night (starry sky, dark floor and furniture, a lamp glow).

Day and night: modern and cozy follow the clock unless the setting 日夜 says 固定白天. From 17:00 the glass shows a sunset (orange bands, a sun on the hills, `wall-dusk.svg`) and the room takes a faint warm tint; from 19:00 to 6:00 a night sky (stars, a crescent moon, `wall-night.svg`), the room dims (`#0a123048`), and a glow sits around the floor lamp and every working monitor. The night style is always night (monitors glow too).

## How it behaves

- **working**: seated at its own desk, back to us, typing (two frames); the monitor shows scrolling colored code lines and a blinking cursor.
- **blocked**: walks to your desk, queues on the left, waves; a blinking "! 等你回覆" sign in `blocked`.
- **done**: queues on the right of your desk, bounces; "✓ 做完了" in `done`. Its desk stays empty with its nameplate.
- **idle**: sits on a lounge sofa, then on the far sofa, then stands around.
- **Errands**: an idle agent that has rested 15 s may get up (a 30 % chance every 2 s; about one in three idle agents out at once) for 6–14 s: to the water cooler (back to us, "倒水"), to the window (back to us at the glass, no label), to the cat ("摸貓"), or beside a working coworker ("聊天"). One at the cooler and one with the cat at a time. Its sofa stays its own; it walks back when done, or at once if its status changes.
- A status change walks the character to its new spot (left/top transitions, walking frames while moving). A resize places everyone afresh without walking.
- Hover a character: its name and task. Click: `agent.focus`. Right-click a character, nameplate or roster row: a dialog to name it (stored as the terminal label `office.name`).
- Subagents are interns, 72 % size, beside their parent and following it: Claude Code's own (from the session's `subagents/*.meta.json` while not `finished`) and `hc run` children (`terminals()` with a `parent`). Hover for the task; click an hc child to peek.
- A message sent with the herdr-team skill's `tell.mjs` walks the sender next to the receiver for 10 s with a speech bubble "→ name：text".
- A meeting (dialog: topic, 2–6 participants, 1–3 rounds) opens the meeting room; participants sit at the table, the speaker shows "● 發言中". It ends with a notification and the minutes.

## Built from

- Layout: a block `{ "mod": "office", "props": { "dock": true } }` in any layout, or `mod.open office` (`mod.json` describes a window overlay, key `office`).
- `main.js` (the view; roles by props: `rename`, `settings`, `meetingSetup` dialogs) and `logic.js` (geometry, layout choice, formatting; no Herdr imports).
- Herdr API: `agents`, `terminals`, `theme`, `shared`/`setShared` (`office.style`, `office.layout`, `office.daynight`), `openOverlay`, `closeOverlay`, `run` (`agent.focus`, `terminal.peek`), `exec`, `hc` (`label`), `readTextFile`, `notify`, `fs/promises`, `cx.timer`, native `loop`/`transition`.
- `usage.mjs` (run with node every minute): Codex `rate_limits` from `~/.codex/sessions`, Claude Code tokens from `~/.claude/projects` (incremental cache), plan quota from the status line's file, agy prompts from `~/.gemini/antigravity-cli/history.jsonl`.
- `statusline.mjs`: Claude Code status line; saves `rate_limits` and the terminal → session map.
- `meeting.mjs`: started with `hc run --bg`; sends each participant a `[會議]` message, `hc send --wait`, reads the speech file it wrote in the temp folder, writes the minutes.
- `skills/herdr-team`: teaches agents `tell.mjs who|<to> <message>` (wraps `hc send`, logs `talk.jsonl`).
- Art: `art/generate.mjs`, every sprite drawn from character maps and rectangles, outlined automatically.
- Preview: a file named `demo` in `data/office/` (and every `herdr-app check`) draws a made-up office of three spaces and nine agents (`DEMO` in `logic.js`); `hour=18` in the file pins the clock.

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
