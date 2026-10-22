# Flightdeck

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code 2.1.287+](https://img.shields.io/badge/Claude%20Code-2.1.287%2B%20mod-d97757.svg)](https://claude.com/blog/claude-code-mods)

**A Claude Code mod that puts a live agent dashboard in your terminal**: context and cost, an advisor timeline, your permission checks, and your subagents as cards or swimlanes. Its numbers come from session events, and nothing leaves your machine.

This is a hardened port of [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck) v0.3.2, with the main box and session log changes from upstream v0.4.0. It keeps the upstream panels and adds one rule: session text reaches state or the pane only through `scrub()` in [`hooks/hygiene.ts`](hooks/hygiene.ts), and a canary test feeds secrets through each place the port's audit found flightdeck reading text. It keeps derived fields in place of your prompts, your subagents' answers and your tool arguments.

![flightdeck demo: the pane tracks vitals, permission checks and a subagent card while Claude works](../../docs/media/flightdeck.gif)

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
| **main** | model, effort, the permission mode a main-loop subagent start last reported (`mode … (last spawn)`), request count; a context gauge with compactions (⟲); cost and the first two rate-limit windows when your plan reports them, with the time to each reset (↻) from 56 columns; the last main-loop request's time to first token and output tokens per second | `turn.step`, `agent.spawn`, `session.measure`, `session.compact`, `$.session.usage()` |
| **architect** | consults on a timeline, whether one is running, how long the last took; optionally the moment of each consult; one line of a subagent architect's advice, masked, picked as [What it keeps](#what-it-keeps) says | a spawn of a matching agent type, or a matching server tool in the assistant's rows |
| **gate** | one cell per recent permission check: green allowed without asking, blue decided by the auto-mode classifier or you and then run, the main box's colour allowed by your approval, amber pending, red ✗ denied, dim if made inside a subagent. Totals, a drill-down per tool family that shows its last 5 checks (the tool name and its program word, file or host, masked), and the [denied calls](#denied-calls) list | `tool.check`, settled by the `tool.call` around it or by its loop's `turn.complete` |
| **agents** | cards side by side while they fit: the task, type, live context and output tokens, steps, a running clock, `max_tokens` in red. Beyond that, swimlanes on one time axis. A card's number shows [that agent's conversation](#inspect-a-subagent) | `agent.spawn`, `turn.step`, `tool.call`, `turn.complete` |
| **loops** | model loops that match no card: workflow agents, compactions, memory forks | `turn.step` ids no card claims |
| **receipt** | the running turn, or the last one: duration, agents, edits, errors, cost added; and a dim `hygiene · <n> masked` cell | `turn.start`, `turn.complete` |
| **log** | each turn you type as `you · new turn · <n> chars`, a turn the engine started as `engine` and a fixed label, spawns, an agent the engine wakes again (`woken`), completions, consults, edits, errors and denials; filtered to one agent while you view its transcript | all of the above |

Connectors animate only while work flows: a turn is running, an agent is running, or a consult is open. Panels with nothing to show take no room, so a session without subagents shows just the main box and the log.

## Use

| Command | Does |
| --- | --- |
| `/flightdeck` | open the pane |
| `/flightdeck close` | close it |
| `/flightdeck reset` | clear agents, checks and their totals, consults, the log, the turn, the architect roster and the masked count (cost, rate limits and compactions stay) |
| `/flightdeck audit` | list the stored text fields under `log`, `agents`, `gate`, `architect`, `roster` and `view` by state path with their lengths in UTF-16 units, as JavaScript counts them, and the masked count. It prints no value, and the model does not read it |
| `/flightdeck layout auto\|compact\|wide\|mini` | override the layout for this session |

Focus the pane with `ctrl+x tab`, then:

| Key | Does |
| --- | --- |
| `1`, `2`, … | show that agent's conversation in the main view; press it again to return |
| `m` | return the main view to the main conversation (shown while you view an agent) |
| `f` `s` `o` | open the gate's file / shell / other drill-down: the last 5 checks and their verdicts |
| `d` | open the gate's denied calls |
| `a` `r` `x` | with the denied calls open: arm the newest approvable refusal, then press again to approve it; retry the newest approved one, forget every approval |

`/clear` and a resume reset the pane along with the conversation.

### Inspect a subagent

Press a card's number (`1` to `6`) to open that agent's conversation in the main view, as the tasks list does. Your next Enter goes to that agent. Press the number again, or `m`, to return to the main conversation. Claude Code draws the conversation; flightdeck stores none of it. While you view an agent, its summary stays open under the cards: its task, status and last 3 tool calls.

Claude Code cannot show every agent, for example a workflow agent, or a finished agent with no saved transcript. Then the card opens its summary with the reason, masked: `not shown: <reason>`. Press the number again to close it.

### Denied calls

Press `d` in the gate panel to list the 4 latest refusals, newest first. Each row says what refused the call:

| Label | Meaning | Can you approve it here? |
| --- | --- | --- |
| `rule <rule>` | a deny rule in your settings | No. Edit the settings. |
| `hook <hook>` | a hook refused it | No. |
| `policy` | the mode, the tool's own check, or your organization | No. |
| `refused · you` | it was asked and you pressed No | Yes, when the ask came from no settings rule, hook, setting, `decider` or organization ceiling. |
| `refused · dontAsk` | it was asked and nobody could be asked, as in `dontAsk` mode or a background agent | Yes, on the same terms. |
| `refused · hook` | it was asked, then a hook denied it as the call was made | No. |
| `refused` | it was asked and still open when its loop's turn ended, so flightdeck cannot tell who refused it | Yes, on the same terms. |

A call counts as refused in three cases:

- You pressed No on its permission dialog. Claude Code answers that call with its own sentence, `The user doesn't want to proceed with this tool use`, and flightdeck matches it. As a backstop, an ask still open when that loop's turn ends counts as refused too, since a turn cannot end while a dialog is open or a tool runs.
- Nobody could be asked, as in `dontAsk` mode or a background agent. Claude Code answers with its own sentence, `Permission to use <tool> has been denied`, and flightdeck matches that sentence only when `<tool>` is the call's own tool, so a tool's error text that names another tool is not a refusal.
- A hook denied the call after it was asked. That row is blocked: approving would only meet the hook again.

A call that ran and failed is not refused: its row is cleared, never in this list. If a later Claude Code words its refusal differently, such a call reads as cleared too, never as approvable.

The row a press would act on gets a second, full-width line showing what an approval would match: the tool, a 4-character mark of the exact call, so two calls read apart even past the cut, and the masked head of the command, path, search, URL or input. It has an **approve** button, which takes two presses on the same row. The first press arms the row and its button reads **confirm**; the second approves it. `a` presses the armed row, or the newest approvable row when none is armed, and a refusal that arrives after you armed a row does not move it. A press on a row you did not arm only arms that row. Approving allows **that exact call** for the rest of this session: the same shell command character for character with every other field the same (only its description, timeout and background flag may differ, so the same command with the sandbox turned off is asked again), the same tool on the same file path, the same search path and pattern, the same URL, or for any other tool the same input, its description included. Approving `npm publish` does not allow `npm publish --force`, and `a && b` approved allows only `a && b`. Flightdeck's `tool.check` then answers `allow` when core would ask about that call with nothing configured behind the ask. The row reads `approved · not used yet` until that happens, then `approved · used <n>×`. If it stays at `not used yet` after the call ran again, something above flightdeck answered first.

An approved row has a **retry** button. Retry tells the loop that was refused to try again, with one fixed message that names only the row's masked detail: the main conversation gets a prompt that runs when the session is idle, and a subagent gets a message (a finished subagent resumes, as when you message it). Each refusal retries once. A retry that is not delivered, because the prompt queue refused it or the subagent is gone, logs `retry not delivered, press again` and the row offers retry again. Approve and retry are two presses on purpose: a retry costs a turn.

`x` forgets every approval. Approvals are also forgotten by `/flightdeck reset`, when the session ends for any reason, clears or resumes, and when flightdeck reloads. A row from before that reads `expired` and has nothing to press.

## Where it runs

- **Fullscreen terminal:** docked beside the transcript; two columns from 110 columns wide.
- **Main-screen terminal:** inline above the prompt, as the 8-row summary, with the hygiene cell on its last row.
- **Desktop app, VS Code, mobile:** the same panels, plus the agents drawn as an SVG time axis. VS Code and mobile can't animate, so connectors and clocks are static there.

With `openOnStart`, the pane opens by itself when a session starts, in terminals at least 144 columns wide; below that, `/flightdeck` opens it. Colours come from your Claude Code theme, so light, dark and colour-blind themes all read.

## What it can reach

Flightdeck watches, with one exception that you start: a call you approved in the [denied calls](#denied-calls). Its other hooks hand on what the next handler returns, so it does not deny or rewrite a tool call, a prompt or a subagent; a test pins this for `tool.call`, `turn.start`, `turn.complete` and `agent.spawn`.

Its `tool.check` hook answers `allow` in place of core's verdict only when all of these hold, and the claims tests pin each one:

- You pressed approve on a refusal of that exact call in this session, and flightdeck has not reloaded since.
- Core's verdict is `ask` with no settings rule, hook, setting, `decider` or organization ceiling behind it. A deny of any origin never changes, and neither does any other verdict.
- The tool is not `AskUserQuestion`, `ExitPlanMode`, `Agent`, `Task` or `SendMessage`.
- The session is not in plan mode, as far as flightdeck knows. In plan mode Claude Code itself ignores a hook's `allow` for any call that is not read-only. Flightdeck also holds back when it knows the mode is plan, but it learns the mode only when the main loop starts a subagent, so this check is best effort.

Claude Code still asks you for tools that need you, and still blocks writes in plan mode, whatever a hook answers. Retry sends one fixed-text prompt (`$.prompt.submit`) or message (`$.session.send`), and only when you press it. A card press asks Claude Code to show an agent's transcript in the main view (`$.ui.view`); that changes what you see, not what any agent does.

| It sees | Through |
| --- | --- |
| each tool call's name and input, and whether it failed | `tool.call` |
| each permission verdict | `tool.check` |
| subagent spawns, their model requests and token usage, and their final answers | `agent.spawn`, `turn.step`, `turn.complete` |
| your prompts | `turn.start` |
| where each prompt came from: the engine's origin kind, not the text | `prompt.submit` |
| which agents exist and whether each is running, to route a retry | `$.agent.list()` |
| the agent types offered to the model | `agent.offer` |
| context, cost and rate-limit readings | `session.measure`, `$.session.usage()` |
| server-side advisor calls a main-loop request ran: name, id, start and end time (their content is encrypted) | `turn.step` |

It makes **no** network requests, runs no processes, reads and writes no files, stores nothing across sessions, and calls no model. `claude plugin validate .` prints what it hooks and calls.

## What it keeps

Seeing is not keeping. Each row below is a claim a test in [`tests/`](tests) checks.

| Session text | Kept as | Test |
| --- | --- | --- |
| A prompt you type, or send through the SDK | its length alone: `you · new turn · <n> chars`, whatever it opens with. The text is not read | `a typed prompt shows in the log as its length alone`, `a typed prompt that opens with a tag, or holds from="…", is still its length alone`, `a typed prompt shaped as a live architect's hand-back is still its length alone` |
| A turn the engine started: a delivered message or a scheduled task | `engine` and a fixed label by the `prompt.submit` origin: `message delivered` for a task notification, a peer or coordinator message, a relayed or channel message, or an observer report, and `scheduled task` for a scheduled trigger or `/loop`. When such a turn's text opens `<agent-message from="…">` naming an architect agent the session spawned, its report's first line is read as the architect row says, and the row is the advice, not the label. An origin this list does not name (your own Enter, Remote Control, the SDK, a plugin, an unclassified turn) logs as typed, and its text is not read. The origin is the one `prompt.submit` carried with the turn's own text. Flightdeck holds a hash of that text, never the text, and a text once submitted with a typed origin reads as typed for as long as flightdeck stays loaded, through `/clear` and `/resume`, so an engine delivery into a running turn or a later one with the same text never labels a typed prompt | `a turn the engine started is logged as a fixed label for its source, never its text`, `a hand-back turn is read only when the engine started it`, `a source named after an object property is a typed prompt`, `a prompt typed while a turn runs stays typed when the engine delivers a message into that turn`, `a prompt submitted from two sources with the same text is typed`, `a prompt once typed stays typed after 32 other submits and an engine delivery of the same text`, `once 4096 typed texts fill its memory, every later turn reads as typed` |
| A subagent's answer | nothing; its card keeps the status and the duration | `a finished card keeps its status and duration, never its answer` |
| An architect's report, from its `turn.complete` answer, its hand-back turn or its `SubagentHandback` call | its first non-empty line that does not open with `[` or `<`, at most 160 characters. It is masked whole, then with leading `#`, `>`, `*` and `-` marks and `**` or `__` removed, and masked again when any mark came off, so `**Password**: hunter2zz` reads `Password: [masked]`, `--token abc12345xyz` at the start of a line reads `token [masked]` and `-pass=hunter2x is the staging creds` reads `pass=[masked] is the staging creds` | `architect advice from … is masked` (three tests), `keeps its first line alone`, `is cut to 160 characters`, `masks a flag value at the start of the line`, `masks a flag value after a bullet or a quote mark, a token split by __, and a glued PEM block`, `masks a key that Markdown marks wrap or split, after the marks come off`, `masks a key or a token that a leading mark hid, after the mark comes off`, `masks a bold key mid-sentence, after the marks come off`, `drawn on a terminal or the desktop, a key that Markdown marks wrapped shows masked` |
| An agent's description | masked, at most 80 characters | `an agent description is masked and cut to 80 characters, its name to 40` |
| An agent's name, or its type when it has no name; a consult's agent type (what follows the last `:` of the masked type); an architect roster entry | masked, at most 40 characters | `the names flightdeck keeps are masked and cut to 40 characters` (three tests), `every stored text field stays inside its cap` |
| A tool call's input | the tool name and one part of the input, masked, at most 64 characters. For a command, the word it opens with: after any leading spaces, tabs or line breaks, a word of ASCII letters, digits, `_`, `.`, `/` and `-` that does not start with `-` (so `héllo x` shows the tool name alone), followed by a space, a tab, a carriage return, a line feed or the end. The word is masked, then its last path segment taken and masked again when that changed it, so `/usr/local/bin/psql postgres://bob:hunter2@db/x` reads `Bash → psql`. Only the opening is checked, so `echo ok; pwd` reads `Bash → echo`. A command that opens any other way shows the tool name alone. That includes an assignment, so `PGPASSWORD=hunter2 psql -h db` and `H=Authorization:Bearer dummytok123456 curl x` read `Bash` and `$env:PGPASSWORD='hunter2'; psql` reads `PowerShell`, and a quote, `$`, `\`, a bracket or any other character at the start. For a file path, its last two segments, the path masked whole first when it holds `://`, a `=`, `:`, quote, space or `--` (a drive letter aside): `/repo/postgres://u:pw@h/db` reads `Grep → u:[masked]@h/db`. For a URL, its parsed host as the URL spells it, when the URL holds no tab or line break, the user name and password hold no percent-encoded character and the host has the DNS or IP shape; otherwise the tool name alone. Patterns, queries, descriptions and a URL's user, password, query and fragment are never shown | `a Bash or PowerShell detail shows the plain word a command opens with`, `…shows the tool name alone for a command that does not open with a plain word`, `a command that opens with an assignment, or with …, shows the tool name alone`, `a file tool detail…`, `a URL tool detail keeps the host alone`, `a denied PowerShell call that sets a variable never keeps the value` |
| A call you can approve, and one you approved | in module memory alone, as the exact call it matches on, until the session ends or flightdeck reloads. State keeps only the refusal's masked tool detail, who refused it, the loop it ran in, and for an approval its time and use count. While the refusal can be approved or retried, the denied list draws its subject line from module memory: the tool, a 4-character mark of the exact call, and the masked head of the command, path, search, URL or input, at most 120 characters. The command, path or input is never stored | `a denied command approved and retried reaches neither state nor the retry text`, `after session.start no grant is left, in state or in memory`, `after session.end (…) no grant is left, in state or in memory` (five tests) |
| A deny's settings rule or hook name | masked, at most 40 characters | `every stored text field stays inside its cap` |
| Claude Code's reason for not showing an agent | masked, at most 64 characters | `every stored text field stays inside its cap`, `a card Claude Code cannot show opens its summary with the reason, masked; a second press closes it` |
| A retry's text | a fixed sentence holding only the refusal's masked tool detail | `the text holds the scrubbed detail and nothing else from the session`, `a denied command approved and retried reaches neither state nor the retry text` |
| Each text above | with ESC, other control characters, bidi overrides and zero-width characters removed, and whitespace folded to one line | `controls, ESC, bidi overrides and zero-width characters are stripped`, `a newline cannot start a second line` |

The canary tests in [`tests/canary.test.tsx`](tests/canary.test.tsx) feed secrets and session words through each place the port's audit found flightdeck reading text: typed prompts and hand-back turns, an agent's description, name and type, an offered agent type, a shell command, a file path, a URL, a fetch prompt, a search pattern, a tool name, a subagent's answer, an architect's report, a deny's rule, Claude Code's reason for not showing an agent, and denied commands that are approved and retried, one of them left unanswered as a No is and settled by its loop's end. The retry texts are read too. They read each stored string and each drawn string in the four layouts, docked and inline, on the terminal and desktop surfaces. None of the canary's secrets, prompt or answer words, ESC or bidi characters shows up, and each field the canary lists stays inside its cap. The one exception is the denied list's subject line, which shows the masked command on purpose: the canary checks that it is drawn, holds no secret, and stays inside 120 characters, and that the command's words show up nowhere else.

`scrub()` replaces each secret with `[masked]` and keeps the key name. Compatibility characters read as the plain characters they show, so a fullwidth `＝` is `=`. Each rule below names the forms the tests pin. Other spellings can slip through, and the ones found so far are listed under **What it does not catch**. In the tested forms a secret is one mask and counts once; the exceptions are the two-mask cases listed with the over-masks. A `[masked]` the text already holds as a whole value, such as `password=[masked]`, stays and is not counted, and scrubbing a scrubbed text changes nothing. [`tests/hygiene.test.ts`](tests/hygiene.test.ts) and [`tests/claims.test.ts`](tests/claims.test.ts) hold the cases. The rules cover:

- every character upstream `redact()` hides. Its pattern table, from [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck) at `f31daca`, runs inside `scrub()` in its own order, on the text as received and again on the cleaned line, so a compatibility reading or a removed invisible character does not move a secret out of its reach in the 20,000 random mixes the suite checks. Its URL pattern is rewritten to run in linear time with the same matches. Some things it hides stay visible and are not counted: a final `…`, which reads as a cut mark, an input `•` or `[masked]` it would hide in some places, such as a URL password in `https://u:•@h`, and in a tool detail the host after a credential it hides along with the host, so `https://--secret:@api.x.com/v1` reads `WebFetch → api.x.com`. After a key name or flag, an input `•` is masked and counted like any value, as in `password=•`, `--token=•` and `API_KEY=•`.
- a value after `password`, `passwd`, `pwd`, `passphrase`, `token` or `secret` and `=` or `:`, such as `password = hunter2` and `token: abc`. After `=` or `:` a value is the text up to the next space, symbols included. A run with no letter or digit, or the word `is`, carries on to the next run, so `password: => hunter2` masks `=> hunter2`.
- a value after a key name such as `api_key`, `access_token` or `client_secret` and a separator, after the `--token`, `--password`, `--api-key` and `--secret` flags, and after `Authorization:` or `Authorization=`. With `Authorization: token`, the word `token` and the value are one mask.
- a value after `=` or `:` and a name whose last `_` or `-` part is `PASS` or `PAT` in upper, lower or mixed case, such as `DB_PASS: hunter2`, `"DB_PASS": "hunter2"`, `db_pass=hunter2`, `Db_Pass=hunter2` and `GH_PAT: abc123`, unless the value starts `-----BEGIN` or `-----END`
- a value after another separator (`->`, `-`, `–`, `→`), after `is`, `was` or `to`, after `for` and at most three words and then one of those, or, for `password`, `passwd` and `passphrase` only, after a space, such as `password -> hunter2`, `my password is hunter2`, `set the DB password to hunter2`, `password for admin is hunter2` and `passwd abc123def456`, when the value holds a letter or digit and also a digit, a symbol or 20 characters. The same holds for a value after `api key`, `access key`, `secret key` or `private key` and `:`, `=`, `->` or `is`, such as `API key is abc123def456` and `secret key -> abc123def456`, and after a bare `pass` and `=` or `:`. The signs `.`, `,`, `;`, `:`, `!`, `?`, `'`, `"`, `(`, `)`, `[` and `]` count as a symbol only between two letters, as in `Sun!shine`, and a final `!` after a letter counts too, as in `Sunshine!`. So `add password validation`, `password -> strength meter` and `Should we enforce password rotation?` stay as written.
- quoted values, short or long, closed or not: straight, doubled and tripled quotes and backticks, escaped quotes such as `\"`, and `“”`, `‘’`, `„“`, `‚‘`, `«»`, `‹›`, `「」` and `『』`. The text inside is masked and the quotes stay unless `redact()` hides them too, so JSON `"password":"hunter2"` reads `"password":"[masked]"` and `password="hunter2"` reads `password=[masked]`.
- AWS secret keys and `AKIA` key ids
- JWTs, and PEM and PGP private key blocks, encrypted ones included
- GitHub, Slack and `sk-`/`pk-`/`rk-` style tokens
- bearer tokens: 8 or more ASCII letters, digits, `.`, `_`, `~`, `+`, `/` or `-` after `Bearer`, such as `Bearer abcdefgh`, or a shorter value with a digit or a symbol, such as `Bearer abc1` and `Bearer ab!`
- passwords in URLs, an empty user name included, such as `redis://:p4ssw0rd@cache:6379`, and secret query values (`key`, `sig`, `signature`, `token`, `X-Amz-Signature`, `code`, session ids)
- Slack and Discord webhook URLs in upper, lower or mixed case, with `www.` or a trailing dot on the host
- the password in `curl -u user:pass` and `--user`, bare or quoted, with the pair quoted or the user quoted before the colon, such as `curl -u admin:"s3cr3t"`, `curl -u 'admin:pass'` and `curl -u "admin":"hunter2"` (not a numeric `-u 1000:1000`)
- the password after `-p` in a `sshpass` or `login` command, such as `docker login -u admin -p Pa55w0rd!`, and glued to `-p` in a `mysql` or `mariadb` command, such as `mysql -u root -phunter2`
- environment variables whose names end in `KEY`, `TOKEN`, `SECRET` or `PASSWORD`, or hold one of those or `PAT` or `PASS` as an `_`-separated part, so `KEYBOARD=us` stays as written

A blank filler such as `ㅤ` (U+3164) is read both as a space and as nothing, and the rules above run on both readings, so `passwordㅤhunter2` and `passㅤword=s3cret` are both caught.

Each field is cut to its cap at the longest start that does not end inside a mask or show part of a secret, so on the inputs the suite cuts at each cap a longer cap shows no less. A final `…` reads as a cut mark and stays outside any mask.

**What it does not catch.** Masking works by pattern. A secret it misses stays in the fields that keep text: the architect's advice line, an agent's description, name and type, the architect roster and a tool detail. It also shows in the denied list's subject line while that refusal can be approved, so `echo the creds are hunter2` refused there reads in full. The tests pin these misses:

- a secret with no key name or known shape, such as `the creds are hunter2`
- a value after `>` or `>>`, which reads as a shell redirect, such as `password >> hunter2`
- a letters-only password whose only sign is a final `.`, `,`, `;`, `:` or `?`, such as `password -> Hunter?` and `my password is Sunshine.`, since prose reads the same
- a short letters-only password after a space or `is`, such as `my password is sunshine` and `The **password** is x`, since prose reads the same. A value with a digit or a symbol is masked, as in `The **password** is hunter2`.
- a `for` clause of more than six words before `is`, such as `the password for the very old shared staging admin account is hunter2`
- a key name spelled with look-alike letters from another script, such as a Cyrillic `р` in `password`
- an input `•` or `[masked]` in some places where `redact()` would hide a value, which stays as the same glyph, so `https://u:•@h then password=x` reads `https://u:•@h then password=[masked]`
- a value after a symbol that reads as letters, such as `password: ⒜ hunter2`: compatibility reading turns `⒜` into `(a)`, which is masked as the value. The same reading catches key names spelled in such letters, such as `ⓟⓐⓢⓢⓦⓞⓡⓓ=hunter2`.
- a URL password with a space, such as `https://app:correct horse9@db`. Upstream `redact()` leaves it visible too.
- a bold label that is not a key word, such as `**Credentials**: admin:hunter2xyz`, which an architect's advice line keeps as `Credentials: admin:hunter2xyz`. Upstream `redact()` does not mask it either.
- the words after a doubled quote in a value, so `passphrase='correct'' horse9'` shows ` horse9'`
- a key split by a quote inside a path segment, such as `/a/"pass"word=hunter2`, since a path's quotes stay as written

Some text is masked that holds no secret. `scrub()` masks what upstream `redact()` hides, with the exceptions above, so a word after `token:`, `secret:`, `Authorization:`, `Bearer` or a secret flag is masked, as in `Add --token flag`, `Add Bearer authentication`, `Return 401 when Authorization: header is missing`, `Document the token: field` and `secret: none here`. The same parity masks a separator typed after `=` or `:` together with its value (`password == hunter2` reads `password =[masked]`), a key word that follows `password:` along with its own value (`password: secret: hunter2` shows two masks and counts 2), the word `Basic` behind a blank filler or zero-width character after `Authorization =` (`Authorization =` U+2800 `Basic abc` reads `Authorization =[masked] [masked]` and counts 2), the rest of a query after `token=` (`?token=abc&state=xyz` reads `?token=[masked]`), the port and path before a later `@` in a URL (`https://example.com:8443/package/@scope/pkg` reads `https://example.com:[masked]@scope/pkg`), and an `-----END` armor glued to a token-shaped run. An empty quoted value carries on to the next word, so `password: "" (none)` masks `(none)`. A query key typed as prose masks the next word, so `Deprecate the ?api_key= query param` masks `query`, and `docs;key=value` masks `value`. A final `!` after a word reads as a password sign, so `Rotate the password now!` masks `now!`. The rules that close the gaps of issues #19 and #20 mask on the safe side too: a word with a digit or a symbol after `token`, `secret`, `pwd`, `api key` or a table cell named after a key, so `pwd /tmp` masks `/tmp` and `token limit_exceeded` masks `limit_exceeded`; a value after two or more dashes after a key, so `password--x9` masks `x9`; every word after a `-----BEGIN` header that no `-----END` header follows; a value in brackets or `$( )` after a key, whole, so `password: (see vault)` masks `(see vault)`; and the credential after an `Authorization: ApiKey`, `Digest`, `Negotiate` or `NTLM` scheme word, which shows two masks, since upstream `redact()` hides the scheme word. Other over-masks are `?code=python`, `PASSWORD_MIN_LENGTH=12`, `docker run -u $(id -u):$(id -g)`, a variable whose name only ends in `KEY` such as `MONKEY=banana`, and a name that starts like a token such as `sk-learn-pipeline` or `pk_live_handler_name`. `/flightdeck audit` shows how much text flightdeck holds.

State lives in `$.state` for the session. `/flightdeck reset`, `/clear` and a resume empty the text fields under `log`, `agents`, `gate`, `architect`, `roster` and `view` and set the masked count to 0; `/flightdeck audit` then reports 0 stored text fields. A session start resets state unless its `meta` names this schema version: upstream flightdeck stored no `meta` at all, an older port stored a lower version, and a reload after an install can meet either, so a missing, malformed, older or newer `meta` empties the state, the model, mode, cost and rate limits included, because none of it went through `scrub()`.

The `hygiene · <n> masked` cell and `/flightdeck audit` show the masked count. It adds up the masks `scrub()` finds each time flightdeck reads text for a field it keeps, before the field's cap cuts it, so a mask the cap cuts away still counts. A log row or title built from a field already masked adds nothing: an agent description `token=abc123 go` counts 1 across the card and its log row, and a denied check on `postgres://app:pw1234@db` counts 1 across the gate detail and the denial row. A command read twice counts twice: inside a subagent, its permission check and its tool call each read it, so the gate detail and the card's tool note count 2. A plain ask flightdeck could approve is read once more for the denied list's subject line, so its masks count again there. A secret in a part the detail never reads, such as an assignment's value, is not counted, so `PGPASSWORD="correct horse battery staple" psql -h db` counts 0. A tool call in the main loop that ran keeps nothing and counts 0. The count is not the number of masks the pane shows.

## What is inferred, not measured

- **Architect moments.** "Before a plan" means no edits yet this turn, "error repeats" means 2+ main-loop errors in a row, "before done" means edits were made. They are labelled `(inferred)`; turn them off with `moments: false`.
- **Server-side advice is encrypted.** For a server tool such as Claude Code's `advisor`, the pane counts and times the consult but cannot show what it said. The consult appears when the request that ran it ends, with the start and end times the API stamped.
- **Permission mode is the last one a subagent start reported.** Claude Code passes the mode to plugins only through classic hooks and `agent.spawn`, and flightdeck hooks no classic event (see [Troubleshooting](#troubleshooting)). The main box labels it `(last spawn)`, and a mode you switch to after that start shows only at the next one.
- **Per-agent context is the latest request's whole input** (uncached + cache read + cache write). It is labelled `ctx`, not cost: the API has no per-agent cost.
- **Other loops** can't tell a workflow agent from a compaction fork; both are model loops no card claims.
- **A background agent's first step** can arrive before its card exists, so its usage may show one step late.
- **Request speed.** `ttft` and `tok/s` are timed at Flightdeck's own `turn.step` hook, so they include everything beneath it: other plugins' hooks, the engine, the network and any retry. `tok/s` divides the reported `output_tokens` (thinking included) by the time from the first piece of response to the stop. Measured, not inferred, but not the API's own figures.

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

**On a machine with managed settings, or in a Team or Enterprise organization.** Claude Code seats the built-in `cc-plugin-sec-default` plugin first there. It keeps classic hooks (`classic.*`), `session.append` and `prompt.compose` away from plugins you install, and says so in a start-up line for each skipped hook. Flightdeck hooks none of them, so it prints no such line and every panel works. `claude --debug` logs whether it is seated in a line starting `cc-plugin-sec-default@builtin`.

**Colours look wrong.** Set `palette` to `pastel` in `/config`.

**It's too much motion.** Set `motion` to `off`.

## How it works

| File | Holds |
| --- | --- |
| [`hooks/register.tsx`](hooks/register.tsx) | the event hooks, state access, and one function per panel |
| [`hooks/core.ts`](hooks/core.ts) | the reducers, formatters and layout rules as pure functions, so behaviour is testable directly |
| [`hooks/grants.ts`](hooks/grants.ts) | every rule that decides when flightdeck may answer `allow`, the denied list's reducers and the retry route, as pure functions; and the memory that holds approved calls, never in state |
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
