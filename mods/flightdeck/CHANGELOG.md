# Changelog

## 0.4.0

Hardened port of scasella/claude-flightdeck 0.3.2, published in noomz/noomz-claude-skills.

- Session text reaches state or the pane only through `scrub()` in `hooks/hygiene.ts`, which masks secrets, removes ESC, control, bidi and zero-width characters, and cuts each field to a fixed cap. `redact()` is gone.
- The log no longer keeps your prompts: a typed turn reads `you · new turn · <n> chars`.
- Agent cards no longer keep a subagent's answer. The expanded card shows its status and duration in place of the answer.
- The tool detail on cards, in the log and in the gate drill-down is derived: a command's first shell word that is not an assignment, a file's last two path segments, or a URL's host, each masked before any cut. Patterns, queries and descriptions are dropped.
- A turn's log row comes from who started it (`UserPromptSubmit`'s `source`), never from its text: a typed prompt is its length alone, and an engine-started turn is a fixed label.
- A session start resets state unless its `meta` names this schema version, so state upstream flightdeck wrote (it stored no `meta`) is never drawn.
- Architect advice, agent descriptions, names and types, and the architect roster are masked and cut before they are kept.
- New `/flightdeck audit` lists each stored text field by state path with its length, and the masked count, without printing a value. The receipt panel and the mini layout show a `hygiene · <n> masked` cell.
- `/flightdeck reset`, `/clear` and a resume also empty the architect roster and the masked count. State saved by an older version is reset when a session starts.
- An agent description holding an escape sequence no longer blanks the pane.

## 0.3.2

- A background architect's advice is read from its `SubagentHandback` tool call, where the report actually arrives, with the hand-back text as a fallback. Bold markers no longer leak into the advice line.
- README: no longer promises that counters survive every update; a change to the state's shape may reset them once.

## 0.3.1

- The main box shows the model and effort as soon as a request starts, not after the first one finishes.
- Advice from a background architect agent (such as `fable-advisor`) now reaches the architect's `»` line; it arrives as a hand-back message, not as the agent's own answer.
- New README media showing the Flightdeck header; plainer wording about opening on start.
- More gate tests (24 in all).

## 0.3.0

First public release.

- Panels: main vitals (context, compactions, cost, rate limits), architect timeline, permission gate strip with per-family drill-down, agent cards and swimlanes, other loops, turn receipt, session log.
- Layouts: docked one- or two-column, and an 8-row inline summary for the main screen. Cards fall back to swimlanes when they don't fit.
- Theme colours by default, with a `pastel` palette option.
- Animated connectors and live clocks as surface modules, only while work flows.
- Works on the terminal, desktop app, VS Code and mobile surfaces.
- Config for the architect pattern, labels, panels, layout, card limit, motion, moments, palette, opening on start and the status line.
- `/clear` and `/flightdeck reset` start the pane fresh; reads tolerate missing or older fields.
