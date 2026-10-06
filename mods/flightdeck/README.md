# Flightdeck

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code 2.1.287+](https://img.shields.io/badge/Claude%20Code-2.1.287%2B%20mod-d97757.svg)](https://claude.com/blog/claude-code-mods)

**A Claude Code mod that puts a live agent dashboard in your terminal**: context and cost, an advisor timeline, every permission check, and your subagents as cards or swimlanes. Every number comes from a real session event, and nothing leaves your machine.

This is a hardened port of [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck) v0.3.2. It keeps every panel and adds one rule: session text reaches state or the pane only through `scrub()` in [`hooks/hygiene.ts`](hooks/hygiene.ts), and a canary test proves it for every place flightdeck reads text. It keeps derived fields in place of your prompts, your subagents' answers and your tool arguments. Screenshots and a demo of the pane live in the upstream repository.

## Install

Uninstall the upstream plugin first, if you have it. Two plugins named `flightdeck` would both draw a pane.

Inside Claude Code (2.1.287 or later):

```
/plugin marketplace add noomz/noomz-claude-skills
/plugin install flightdeck@noomz-claude-skills
/reload-plugins
/flightdeck
```

To update later, run `claude plugin marketplace update noomz-claude-skills` and then `claude plugin update flightdeck@noomz-claude-skills` in a terminal, and restart Claude Code. A marketplace update or `/reload-plugins` alone keeps the version you have installed.

The installer may say config options aren't set; the defaults are fine, and [`/config`](#configure) changes them.

Mods are an early-access Claude Code feature and their API can change between releases. If something breaks, see [Troubleshooting](#troubleshooting).

## What you see

| Panel | Shows | From |
| --- | --- | --- |
| **main** | model, effort, permission mode, request count; a context gauge with compactions (⟲); cost and the first two rate-limit windows when your plan reports them | `turn.step`, `session.measure`, `session.compact`, `$.session.usage()` |
| **architect** | consults on a timeline, whether one is running, how long the last took; optionally the moment of each consult; the first line of a subagent architect's advice, masked | a spawn of a matching agent type, or a matching server tool in the assistant's rows |
| **gate** | one cell per permission check: green allowed without asking, blue decided by the auto-mode classifier or you and then run, amber pending, red ✗ denied, dim if made inside a subagent. Totals, and a drill-down per tool family that names the tool and its program, file or host | `tool.check`, settled by the `tool.call` around it |
| **agents** | cards side by side while they fit: the task, type, live context and output tokens, steps, a running clock, `max_tokens` in red. Beyond that, swimlanes on one time axis | `agent.spawn`, `turn.step`, `tool.call`, `turn.complete` |
| **loops** | model loops that match no card: workflow agents, compactions, memory forks | `turn.step` ids no card claims |
| **receipt** | the running turn, or the last one: duration, agents, edits, errors, cost added; and a dim `hygiene · <n> masked` cell | `turn.start`, `turn.complete` |
| **log** | each turn as `you · new turn · <n> chars`, spawns, completions, consults, edits, errors and denials; filtered to one agent while you view its transcript | all of the above |

Connectors animate only while work flows: a turn is running, an agent is running, or a consult is open. Panels with nothing to show take no room, so a session without subagents shows just the main box and the log.

## Use

| Command | Does |
| --- | --- |
| `/flightdeck` | open the pane |
| `/flightdeck close` | close it |
| `/flightdeck reset` | clear agents, checks, consults, the log, the turn, the architect roster and the masked count (cost, rate limits and compactions stay) |
| `/flightdeck audit` | list each stored text field by state path with its length, and the masked count. It prints no value, and the model does not read it |
| `/flightdeck layout auto\|compact\|wide\|mini` | override the layout for this session |

Focus the pane with `ctrl+x tab`, then:

| Key | Does |
| --- | --- |
| `1`, `2`, … | expand an agent card or lane: its task, last 3 tool calls, status and duration |
| `f` `s` `o` | open the gate's file / shell / other drill-down: the last 5 checks and their verdicts |

`/clear` and a resume reset the pane along with the conversation.

## Where it runs

- **Fullscreen terminal:** docked beside the transcript; two columns from 110 columns wide.
- **Main-screen terminal:** inline above the prompt, as the 8-row summary, with the hygiene cell on its last row.
- **Desktop app, VS Code, mobile:** the same panels, plus the agents drawn as an SVG time axis. VS Code and mobile can't animate, so connectors and clocks are static there.

With `openOnStart`, the pane opens by itself when a session starts, in terminals at least 144 columns wide; below that, `/flightdeck` opens it. Colours come from your Claude Code theme, so light, dark and colour-blind themes all read.

## What it can reach

Flightdeck only watches. Every hook passes its event on unchanged: it never denies, rewrites or delays a tool call, a prompt or a subagent.

| It sees | Through |
| --- | --- |
| every tool call's name and input, and whether it failed | `tool.call` |
| every permission verdict | `tool.check` |
| subagent spawns, their model requests and token usage, and their final answers | `agent.spawn`, `turn.step`, `turn.complete` |
| your prompts | `turn.start` |
| the agent types offered to the model | `agent.offer` |
| context, cost and rate-limit readings | `session.measure`, `$.session.usage()` |
| advisor tool calls in the assistant's responses (their content is encrypted) | `session.append` |

It makes **no** network requests, runs no processes, reads and writes no files, stores nothing across sessions, and calls no model. `claude plugin validate .` prints exactly what it hooks and calls.

## What it keeps

Seeing is not keeping. Each row below is a claim a test in [`tests/`](tests) checks.

| Session text | Kept as | Test |
| --- | --- | --- |
| A prompt you type | its length alone: `you · new turn · <n> chars` | `a typed prompt shows in the log as its length alone` |
| A subagent's answer | nothing; its card keeps the status and the duration | `a finished card keeps its status and duration, never its answer` |
| An architect's report, on any of its three paths | its first line, masked, at most 160 characters | `architect advice from … is masked` (three tests) |
| An agent's description | masked, at most 80 characters | `an agent description is masked and cut to 80 characters, its name to 40` |
| An agent's name or type, a consult's agent type, the architect roster | masked, at most 40 characters | the same test, and `every stored text field stays inside its cap` |
| A tool call's input | the program a command runs, a file's last two path segments, or a URL's host, masked, at most 64 characters. Patterns, queries and descriptions are dropped | `a Bash detail keeps only the program the command runs`, `a file tool detail…`, `a URL tool detail keeps the host alone` |
| Any text above | with ESC, other control characters, bidi overrides and zero-width characters removed, and whitespace folded to one line | `controls, ESC, bidi overrides and zero-width characters are stripped`, `a newline cannot start a second line` |

The canary tests in [`tests/canary.test.tsx`](tests/canary.test.tsx) push secrets through every place flightdeck reads text. They read every stored value and every drawn string in each layout, on the terminal and desktop surfaces. No secret, prompt or answer text, ESC or bidi character survives, and no field passes its cap.

`scrub()` masks key-value secrets (`password=`, `api_key:`, `aws_secret_access_key`, `token`), `Authorization` and `Bearer` values, URL credentials and secret query values, `-u user:pass` and `--token` flags, secret environment variables, PEM private keys, JWTs, AWS key ids, GitHub and Slack tokens, `sk-` style API keys and Slack webhooks. [`tests/hygiene.test.ts`](tests/hygiene.test.ts) holds a case for each. Masking is by pattern. A secret with no key name and no known token shape can survive in the two places that keep words: an architect's advice line and an agent's description. `/flightdeck audit` shows how much text that is.

State lives in `$.state` for the session. `/flightdeck reset`, `/clear` and a resume empty every text field and the masked count; `/flightdeck audit` then reports 0 stored text fields. State written by an older version of flightdeck is reset when a session starts, because none of it went through `scrub()`.

## What is inferred, not measured

- **Architect moments.** "Before a plan" means no edits yet this turn, "error repeats" means 2+ main-loop errors in a row, "before done" means edits were made. They are labelled `(inferred)`; turn them off with `moments: false`.
- **Server-side advice is encrypted.** For a server tool such as Claude Code's `advisor`, the pane counts and times the consult but cannot show what it said.
- **Per-agent context is the latest request's whole input** (uncached + cache read + cache write). It is labelled `ctx`, not cost: the API has no per-agent cost.
- **Other loops** can't tell a workflow agent from a compaction fork; both are model loops no card claims.
- **A background agent's first step** can arrive before its card exists, so its usage may show one step late.

## Configure

In `/config`, or under `pluginConfigs["flightdeck"].options` in `settings.json`:

| Option | Default | Meaning |
| --- | --- | --- |
| `architectPattern` | `advisor\|architect` | case-insensitive regex for agent types and server tools that count as the architect |
| `matchDescriptions` | `false` | also match agent descriptions, not just type names |
| `architectLabel` | `ARCHITECT` | the architect's name in the pane |
| `gateLabel` | `GATE` | the permission panel's name |
| `panels` | `main,architect,gate,agents,loops,receipt,log` | which panels show, in order |
| `layout` | `auto` | `mini`, `compact`, `wide`, or `auto` (mini inline, wide from 110 columns docked) |
| `maxCards` | `3` | cards side by side before swimlanes (1–6); fewer if the pane is too narrow |
| `motion` | `while-active` | `off` keeps connectors still |
| `moments` | `true` | show the inferred consult moments |
| `palette` | `theme` | `pastel` uses fixed colours tuned for dark terminals |
| `openOnStart` | `true` | ask to open the pane when a session starts |
| `statusLine` | `true` | context, running agents, consults and denials in the status line, as counts only |

## Troubleshooting

**The pane doesn't appear.**
- Check `claude --version` is 2.1.287 or later, then run `/reload-plugins` and `/flightdeck`.
- Below 144 columns, Claude Code won't seat a pane nobody asked for; `/flightdeck` opens it at any width.
- Look in the transcript for a dim line starting `flightdeck:`. It names the hook that failed or the reason the pane was refused. Please [open an issue](https://github.com/noomz/noomz-claude-skills/issues) with it.

**Colours look wrong.** Set `palette` to `pastel` in `/config`.

**It's too much motion.** Set `motion` to `off`.

## How it works

| File | Holds |
| --- | --- |
| [`hooks/register.tsx`](hooks/register.tsx) | the event hooks, state access, and one function per panel |
| [`hooks/core.ts`](hooks/core.ts) | every reducer, formatter and layout rule as pure functions, so behaviour is testable directly |
| [`hooks/hygiene.ts`](hooks/hygiene.ts) | `scrub()`, the one gate session text passes through; a byte-identical copy of the pinboard mod's |
| [`hooks/rail.tsx`](hooks/rail.tsx), [`hooks/elapsed.tsx`](hooks/elapsed.tsx) | surface modules: animated connectors and live clocks that redraw only themselves, on the surface's own frame clock |
| [`types/index.d.ts`](types/index.d.ts) | the state contract; every field that holds session text is typed `SafeText` |
| [`tests/`](tests) | 78 tests: the canary, `scrub()`'s cases, pure behaviour, and drawings mounted on every surface at 40–120 columns |

New to mods? Start with [Claude Code mods](https://claude.com/blog/claude-code-mods) and [Getting started with Claude Code mods](https://claude.dev/blog/getting-started-with-claude-code-mods/).

## Develop

From the repository root:

```sh
claude --plugin-dir mods/flightdeck    # load it; edits hot-reload
claude plugin validate mods/flightdeck
claude plugin test mods/flightdeck
bun mods/flightdeck/tests/hygiene.bench.ts --upstream <path to a claude-flightdeck checkout>
```

Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Credit

Flightdeck is by [Stephen Casella](https://github.com/scasella), at [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck). This port adds the hygiene gate, the derived fields and the audit command.

## License

[MIT](LICENSE)
