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

`scrub()` replaces each secret with `[masked]` and keeps the key name. Each secret is masked once and counted once, and scrubbing a scrubbed text changes nothing. Compatibility characters read as the plain characters they show, so a fullwidth `＝` is `=`. [`tests/hygiene.test.ts`](tests/hygiene.test.ts) holds a case for each rule:

- every character upstream `redact()` hides. Its pattern table, from [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck) at `f31daca`, runs inside `scrub()` in its own order, on the text as received and again on the cleaned line, so a compatibility reading or a removed invisible character never moves a secret out of it. Its URL pattern is rewritten to run in linear time with the same matches. An input `•` or `[masked]` that it would hide stays as the same glyph and is not counted.
- any value after `password`, `passwd`, `pwd`, `passphrase`, `token` or `secret` and `=` or `:`, such as `password = hunter2` and `token: abc`. After `=` or `:` a value is the text up to the next space, whatever it holds. A run with no letter or digit, or the word `is`, carries on to the next run, so `password: => hunter2` masks `=> hunter2`.
- any value after a key name such as `api_key`, `access_token` or `client_secret` and a separator, after the `--token`, `--password`, `--api-key` and `--secret` flags, and after `Authorization:` or `Authorization=`. With `Authorization: token`, the word `token` and the value are one mask.
- any value after `=` or `:` and a name whose last `_` or `-` part is `PASS` or `PAT` in any case, such as `DB_PASS: hunter2`, `"DB_PASS": "hunter2"`, `db_pass=hunter2` and `GH_PAT: abc123`
- a value after another separator (`->`, `-`, `–`, `→`), after `is`, `was` or `to`, after `for` and at most three words and then one of those, or after a space, such as `password -> hunter2`, `my password is hunter2`, `set the DB password to hunter2` and `password for admin is hunter2`, when the value holds a letter or digit and also a digit, a symbol or 20 characters. The same holds for a value after `api key`, `access key`, `secret key` or `private key` and any separator, such as `API key is abc123def456`, and after a bare `pass` and `=` or `:`. The signs `.`, `,`, `;`, `:`, `!`, `?`, `'`, `"`, `(`, `)`, `[` and `]` count as a symbol only between two letters, as in `Sun!shine`, and a final `!` after a letter counts too, as in `Sunshine!`. So `add password validation`, `password -> strength meter` and `Should we enforce password rotation?` stay as written.
- quoted values of any length, closed or not: straight, doubled and tripled quotes and backticks, escaped quotes such as `\"`, and `“”`, `‘’`, `„“`, `‚‘`, `«»`, `‹›`, `「」` and `『』`. The text inside is masked and the quotes stay unless `redact()` hides them too, so JSON `"password":"hunter2"` reads `"password":"[masked]"` and `password="hunter2"` reads `password=[masked]`.
- AWS secret keys and `AKIA` key ids
- JWTs, and PEM and PGP private key blocks, encrypted ones included
- GitHub, Slack and `sk-`/`pk-`/`rk-` style tokens
- bearer tokens: any 8 token characters after `Bearer`, or a shorter value with a digit or a symbol
- passwords in URLs, an empty user name included, such as `redis://:p4ssw0rd@cache:6379`, and secret query values (`key`, `sig`, `signature`, `token`, `X-Amz-Signature`, `code`, session ids)
- Slack and Discord webhook URLs in any case, with `www.` or a trailing dot on the host, and `curl -u user:pass` in any quoting (not a numeric `-u 1000:1000`)
- the password after `-p` in a `sshpass` or `login` command, such as `docker login -u admin -p Pa55w0rd!`, and glued to `-p` in a `mysql` or `mariadb` command, such as `mysql -u root -phunter2`
- environment variables whose names end in `KEY`, `TOKEN`, `SECRET` or `PASSWORD`, or hold one of those or `PAT` or `PASS` as an `_`-separated part, so `KEYBOARD=us` stays as written

A blank filler such as `ㅤ` (U+3164) is read both as a space and as nothing, and a value either reading shows is masked, so `passwordㅤhunter2` and `passㅤword=s3cret` are both caught. Each field is cut to its cap at the longest start that does not end inside a mask or show part of a secret, so a longer cap never shows less. A final `…` reads as a cut mark and stays outside any mask.

Masking works by pattern. A secret it misses can survive in the two places that keep words, an architect's advice line and an agent's description. The tests pin these misses:

- a secret with no key name or known shape, such as `the creds are hunter2`
- short forms such as `pw=hunter2`, and a value after a doubled or unknown separator, such as `password--hunter2` and `password >> hunter2`
- a letters-only password whose only sign is a final `.`, `,`, `;`, `:` or `?`, such as `password -> Hunter?` and `my password is Sunshine.`
- a value after `Bearer:` with a colon, a Slack webhook path written without `https://`, such as `hooks.slack.com/services/...`, and a token with an unknown prefix after `token` and a space, such as `token ghx_abc123def456`
- a `for` clause of more than three words before `is`, such as `the password for the old admin account is hunter2`
- a short letters-only password after a space or `is`, such as `my password is sunshine`
- a key name spelled with look-alike letters from another script, such as a Cyrillic `р` in `password`
- a value after a symbol that is not a separator, such as `password ⇒ hunter2`
- a control or format character between a key and its value, such as a NUL, U+0001, DEL, U+202E or U+FEFF in `password` NUL `hunter2xyz`. Removing it joins the two into `passwordhunter2xyz`, and nothing is masked. Upstream `redact()` does not mask these either.
- a NEL (U+0085) or other line break inside a key name, which splits it, so `pass` NEL `word=hunter2x` reads `pass word=hunter2x`
- the rest of a value glued to `-p` after a quoted part, so `mysql -p"hun"ter2` reads `mysql -p"[masked]"ter2` and shows `ter2`, and `sshpass -p "hun"ter2` shows `ter2` the same way
- the rest of a value after a run of five or more dashes inside it, so `DB_PASS=x-----y` shows `-----y`. A value that starts with dashes, such as `DB_PASS=-----S3cure!`, is masked whole.
- an input `•` or `[masked]` where `redact()` would hide a value, which stays as the same glyph and is not counted, so `https://u:•@h then password=x` reads `https://u:•@h then password=[masked]`
- every word after the first of a value in brackets, such as `password: (correct horse9)`, which shows `horse9)`
- a value after a symbol that reads as letters, such as `password: ⒜ hunter2`: compatibility reading turns `⒜` into `(a)`, which is masked as the value. The same reading catches key names spelled in such letters, such as `ⓟⓐⓢⓢⓦⓞⓡⓓ=hunter2`.

Some text is masked that holds no secret. `scrub()` masks every character upstream `redact()` masked, so a word after `token:`, `secret:`, `Authorization:`, `Bearer` or a secret flag is masked, as in `Add --token flag`, `Add Bearer authentication`, `Return 401 when Authorization: header is missing`, `Document the token: field` and `secret: none here`. The same parity masks a separator typed after `=` or `:` together with its value (`password == hunter2` reads `password =[masked]`), a key word that follows `password:` along with its own value (`password: secret: hunter2` shows two masks), the rest of a query after `token=` (`?token=abc&state=xyz` reads `?token=[masked]`), the port and path before a later `@` in a URL (`https://example.com:8443/package/@scope/pkg` reads `https://example.com:[masked]@scope/pkg`), and an `-----END` armor glued to a token-shaped run. An empty quoted value carries on to the next word, so `password: "" (none)` masks `(none)`. A query key typed as prose masks the next word, so `Deprecate the ?api_key= query param` masks `query`, and `docs;key=value` masks `value`. A final `!` after a word reads as a password sign, so `Rotate the password now!` masks `now!`. Other over-masks are `?code=python`, `PASSWORD_MIN_LENGTH=12`, `docker run -u $(id -u):$(id -g)`, a variable whose name only ends in `KEY` such as `MONKEY=banana`, and a name that starts like a token such as `sk-learn-pipeline` or `pk_live_handler_name`. `/flightdeck audit` shows how much text flightdeck holds.

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
| [`tests/`](tests) | the canary, `scrub()`'s cases, pure behaviour, and drawings mounted on every surface at 40–120 columns |

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
