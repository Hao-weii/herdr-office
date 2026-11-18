---
name: herdr-team
description: Work with the other coding agents (Claude Code, Codex, agy) running in Herdr — ask a teammate for help, hand off a task, get a review, reply to a message from another agent, or take part in an office meeting. Use when the user says things like 「請 Codex 幫忙」「問一下 agy」「叫 Claude review」「跟其他 Agent 討論」, names a teammate, or when a message arrives tagged <hc from="...">.
---

# Herdr team

Several coding agents run side by side in Herdr, each in its own herdr-core terminal:
Claude Code, Codex and agy (Antigravity CLI). You can talk to them. Your own address is
`$HC_TERMINAL_ID` (e.g. `t5`).

The script is `scripts/tell.mjs` in this skill's folder. Run it with node:

```sh
node <skill-dir>/scripts/tell.mjs who                 # who is here: address, tool, name, status, where
node <skill-dir>/scripts/tell.mjs codex "..."         # by tool, when only one of it runs
node <skill-dir>/scripts/tell.mjs Sandy "..."         # by the name the person gave it
node <skill-dir>/scripts/tell.mjs t4 "..."            # by address
```

Always use `tell.mjs` to talk to a teammate, not raw `hc send`: it also shows the
conversation in the person's office panel.

## Asking a teammate for help

1. Run `who` first. Pick a teammate that is `idle` or `done`. Don't send to one that is
   `blocked` (it is waiting for the person); the script refuses.
2. Send one message with everything it needs: the task, the exact scope (files, folder),
   what not to do, and how to answer. End with:
   `Reply with: node <skill-dir>/scripts/tell.mjs <your address> "<answer or file path>"`.
3. Long answers belong in a file: ask for the file path back, then read the file.
4. Wait without polling: `hc wait <address>` (returns when it stops working; a timeout
   is only a check-in, wait again). Its reply arrives as your next input, tagged
   `<hc from="t4 ...">`.
5. Read the actual result before telling the person anything. Never claim a teammate
   did something you haven't seen.

Don't start new agents unless the person asked; work with the ones already running.

## When a message from a teammate arrives

A message tagged `<hc from="t3 ...">` comes from another agent, not from the person.
Treat it as a request from a colleague: do it if it is within what the person would
want, and say so if it isn't. Reply with `tell.mjs <their address> "..."` when done or
stuck, not just to acknowledge.

## Office meetings

A message starting with `[會議]` comes from the office panel's meeting room. Follow its
instructions exactly: read the transcript it points to, write your contribution to the
file it names (in the language of the topic, short and specific, responding to what
others said), and do nothing else: no code changes, no other tools, no replies by
`tell.mjs`. The panel notices when you stop working.
