# Flightdeck

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Claude Code 2.1.287+](https://img.shields.io/badge/Claude%20Code-2.1.287%2B%20mod-d97757.svg)](https://claude.com/blog/claude-code-mods)

**A Claude Code mod that puts a live agent dashboard in your terminal**: context and cost, an advisor timeline, your permission checks, and your subagents as cards or swimlanes. Its numbers come from session events, and nothing leaves your machine.

This is a hardened port of [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck) v0.3.2. It keeps the upstream panels and adds one rule: session text reaches state or the pane only through `scrub()` in [`hooks/hygiene.ts`](hooks/hygiene.ts), and a canary test feeds secrets through each place the port's audit found flightdeck reading text. It keeps derived fields in place of your prompts, your subagents' answers and your tool arguments. Screenshots and a demo of the pane live in the upstream repository.

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
| **architect** | consults on a timeline, whether one is running, how long the last took; optionally the moment of each consult; one line of a subagent architect's advice, masked, picked as [What it keeps](#what-it-keeps) says | a spawn of a matching agent type, or a matching server tool in the assistant's rows |
| **gate** | one cell per recent permission check: green allowed without asking, blue decided by the auto-mode classifier or you and then run, amber pending, red ✗ denied, dim if made inside a subagent. Totals, and a drill-down per tool family that shows its last 5 checks: the tool name and its program word, file or host, masked | `tool.check`, settled by the `tool.call` around it |
| **agents** | cards side by side while they fit: the task, type, live context and output tokens, steps, a running clock, `max_tokens` in red. Beyond that, swimlanes on one time axis | `agent.spawn`, `turn.step`, `tool.call`, `turn.complete` |
| **loops** | model loops that match no card: workflow agents, compactions, memory forks | `turn.step` ids no card claims |
| **receipt** | the running turn, or the last one: duration, agents, edits, errors, cost added; and a dim `hygiene · <n> masked` cell | `turn.start`, `turn.complete` |
| **log** | each turn you type as `you · new turn · <n> chars`, a turn the engine started as `engine` and a fixed label, spawns, completions, consults, edits, errors and denials; filtered to one agent while you view its transcript | all of the above |

Connectors animate only while work flows: a turn is running, an agent is running, or a consult is open. Panels with nothing to show take no room, so a session without subagents shows just the main box and the log.

## Use

| Command | Does |
| --- | --- |
| `/flightdeck` | open the pane |
| `/flightdeck close` | close it |
| `/flightdeck reset` | clear agents, checks and their totals, consults, the log, the turn, the architect roster and the masked count (cost, rate limits and compactions stay) |
| `/flightdeck audit` | list the stored text fields under `log`, `agents`, `gate`, `architect` and `roster` by state path with their lengths in UTF-16 units, as JavaScript counts them, and the masked count. It prints no value, and the model does not read it |
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

Flightdeck only watches. Its hooks hand on what the next handler returns, so it does not deny or rewrite a tool call, a prompt or a subagent. A test pins this for `tool.check`, `tool.call`, `turn.start`, `turn.complete` and `agent.spawn`.

| It sees | Through |
| --- | --- |
| each tool call's name and input, and whether it failed | `tool.call` |
| each permission verdict | `tool.check` |
| subagent spawns, their model requests and token usage, and their final answers | `agent.spawn`, `turn.step`, `turn.complete` |
| your prompts | `turn.start` |
| the agent types offered to the model | `agent.offer` |
| context, cost and rate-limit readings | `session.measure`, `$.session.usage()` |
| advisor tool calls in the assistant's responses (their content is encrypted) | `session.append` |

It makes **no** network requests, runs no processes, reads and writes no files, stores nothing across sessions, and calls no model. `claude plugin validate .` prints what it hooks and calls.

## What it keeps

Seeing is not keeping. Each row below is a claim a test in [`tests/`](tests) checks.

| Session text | Kept as | Test |
| --- | --- | --- |
| A prompt you type, or send through the SDK | its length alone: `you · new turn · <n> chars`, whatever it opens with. The text is not read | `a typed prompt shows in the log as its length alone`, `a typed prompt that opens with a tag, or holds from="…", is still its length alone`, `a typed prompt shaped as a live architect's hand-back is still its length alone` |
| A turn the engine started: a delivered message, a loop or scheduled wakeup, an event | `engine` and a fixed label by the `UserPromptSubmit` source: `message delivered`, `loop wakeup`, `scheduled task` or `event delivered`. When such a turn's text opens `<agent-message from="…">` naming an architect agent the session spawned, its report's first line is read as the architect row says, and the row is the advice, not the label. A source the table does not name, or none, logs as typed, and its text is not read. The source is the one `UserPromptSubmit` carried with the turn's own text, so a message the engine delivers into a running turn does not label a prompt typed during that turn, and a text submitted from two sources logs as typed | `a turn the engine started is logged as a fixed label for its source, never its text`, `a hand-back turn is read only when the engine started it`, `a source named after an object property is a typed prompt`, `a prompt typed while a turn runs stays typed when the engine delivers a message into that turn`, `a prompt submitted from two sources with the same text is typed` |
| A subagent's answer | nothing; its card keeps the status and the duration | `a finished card keeps its status and duration, never its answer` |
| An architect's report, from its `turn.complete` answer, its hand-back turn or its `SubagentHandback` call | its first non-empty line that does not open with `[` or `<`, at most 160 characters. It is masked whole, then with leading `#`, `>`, `*` and `-` marks and `**` or `__` removed, and masked again when any mark came off, so `**Password**: hunter2zz` reads `Password: [masked]`, `--token abc12345xyz` at the start of a line reads `token [masked]` and `-pass=hunter2x is the staging creds` reads `pass=[masked] is the staging creds` | `architect advice from … is masked` (three tests), `keeps its first line alone`, `is cut to 160 characters`, `masks a flag value at the start of the line`, `masks a flag value after a bullet or a quote mark, a token split by __, and a glued PEM block`, `masks a key that Markdown marks wrap or split, after the marks come off`, `masks a key or a token that a leading mark hid, after the mark comes off`, `masks a bold key mid-sentence, after the marks come off`, `drawn on a terminal or the desktop, a key that Markdown marks wrapped shows masked` |
| An agent's description | masked, at most 80 characters | `an agent description is masked and cut to 80 characters, its name to 40` |
| An agent's name, or its type when it has no name; a consult's agent type (what follows the last `:` of the masked type); an architect roster entry | masked, at most 40 characters | `the names flightdeck keeps are masked and cut to 40 characters` (three tests), `every stored text field stays inside its cap` |
| A tool call's input | the tool name and one part of the input, masked, at most 64 characters. For a command, its first shell word that is not a `NAME=value` or PowerShell `$env:NAME=value` assignment, taken as written (quotes, backslash escapes, backticks, and a `(…)` or `$(…)` up to its first `)` keep a word whole), masked, then its quotes off, what sits before its first `(`, and its last path segment, masked again when any of these changed it: `PGPASSWORD="correct horse battery staple" psql -h db` reads `Bash → psql`, `PGPASSWORD=$(echo hunter2) psql -h db` reads `Bash → psql`, `$env:PGPASSWORD=(Write-Output 'hunter2'); psql` reads `PowerShell → psql` and `[Environment]::SetEnvironmentVariable('API_KEY','abc123def456')` reads `PowerShell → [Environment]::SetEnvironmentVariable`. An assignment whose value is empty, has no letter or digit, ends in `=`, `:` or a bare `--flag`, or is `is`, `Bearer` or `Basic`, or holds more `(` than `)`, or whose name is or ends in `Authorization`, ends the search, so a bare `AWS_SECRET_ACCESS_KEY=…`, `password= hunter2 run` or `PGPASSWORD=$(printf %s $(printf pre) hunter2) psql`, whose inner `)` ends the word, reads `Bash`. For a file path, its last two segments, the path masked whole first when it holds `://`, a `=`, `:`, quote, space or `--` (a drive letter aside): `/repo/postgres://u:pw@h/db` reads `Grep → u:[masked]@h/db`. For a URL, its parsed host as the URL spells it, when the URL holds no tab or line break, the user name and password hold no percent-encoded character and the host has the DNS or IP shape; otherwise the tool name alone. Patterns, queries, descriptions, a command's other words, an assignment's value and a URL's user, password, query and fragment are dropped whole | `a Bash detail keeps only the program the command runs`, `a file tool detail…`, `a URL tool detail keeps the host alone`, `a denied PowerShell call that sets a variable keeps the method, never the value`, `a Bash or PowerShell detail drops a value with a nested substitution or set through $env:` |
| Each text above | with ESC, other control characters, bidi overrides and zero-width characters removed, and whitespace folded to one line | `controls, ESC, bidi overrides and zero-width characters are stripped`, `a newline cannot start a second line` |

The canary tests in [`tests/canary.test.tsx`](tests/canary.test.tsx) feed secrets and session words through each place the port's audit found flightdeck reading text: typed prompts and hand-back turns, an agent's description, name and type, an offered agent type, a shell command, a file path, a URL, a fetch prompt, a search pattern, a tool name, a subagent's answer and an architect's report. They read each stored string and each drawn string in the four layouts, docked and inline, on the terminal and desktop surfaces. None of the canary's secrets, prompt or answer words, ESC or bidi characters shows up, and each field the canary lists stays inside its cap.

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

**What it does not catch.** Masking works by pattern. A secret it misses stays in the fields that keep text: the architect's advice line, an agent's description, name and type, the architect roster and a tool detail. The tests pin these misses:

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
- the rest of a value after a run of five or more dashes inside it, so `DB_PASS=x-----y` shows `-----y`, and a `PASS` or `PAT` value that starts `-----BEGIN` or `-----END`, such as `DB_PASS=-----BEGINhunter2!` and `GH_PAT: -----BEGINabc`. A value that starts with other dashes, such as `DB_PASS=-----S3cure!` and `REDIS_PASS=--x9`, is masked.
- the password in `curl -u` with an empty user, as in `curl -u :hunter2` and `curl -u "":hunter2`, or with a quote inside the user or the password: `curl -u "ad"min:hunter2` stays as written, `curl -u "admin:hun"ter2` shows `ter2`, and `curl -u "ad:min":"pw"` shows `"pw"`
- a value after `api key`, `pwd`, `token` or `secret` and a space, such as `api key abc123def456`, `pwd abc123def456`, `token abc123def456` and `secret abc123def456`
- a key wrapped in Markdown emphasis in an agent's description, name or type, a consult type, a roster entry or a tool detail, such as `**Password**: hunter2xyz`, `Set **DB_PASSWORD**=S3cretPass99`, `__password__=x` and `The **password** is x`. An architect's advice line is masked again after its marks come off, so there it reads `Password: [masked]`. Upstream `redact()` does not mask these either.
- a private-use character inside a key name, such as U+E000 in `pass` U+E000 `word=hunter2`. It splits the key and stays in the text, and many fonts draw it as nothing, so the line can look like an unmasked `password=hunter2`.
- an input `•` or `[masked]` in some places where `redact()` would hide a value, which stays as the same glyph, so `https://u:•@h then password=x` reads `https://u:•@h then password=[masked]`
- the words after the first of a value in brackets, such as `password: (correct horse9)`, which shows `horse9)`
- a value after a symbol that reads as letters, such as `password: ⒜ hunter2`: compatibility reading turns `⒜` into `(a)`, which is masked as the value. The same reading catches key names spelled in such letters, such as `ⓟⓐⓢⓢⓦⓞⓡⓓ=hunter2`.
- a key in single-star emphasis in an architect's report, which keeps its closing star, so `*Password*: hunter2xyz` reads `Password*: hunter2xyz`
- a key split by a quote inside a path segment, such as `/a/"pass"word=hunter2`, since a path's quotes stay as written
- a key in backticks, such as ``Use `password`: hunter2zz``, or in brackets and quotes, such as `config['password']='hunter2'`. Upstream `redact()` does not mask these either.
- a key and value inside JSON that is escaped as a string, such as `{\"password\":\"hunter2\"}`. Upstream `redact()` does not mask these either.
- the part of a URL password after a second `@`, so `https://app:p@ssw0rd9@db` reads `https://app:[masked]@ssw0rd9@db` and shows `@ssw0rd9`, and a URL password with a space, so `https://app:correct horse9@db` stays as written. Upstream `redact()` leaves the same text visible.
- in an architect's report, a key on a line the pick skips (one that opens with `[` or `<`, or an earlier line) with its value on the next line, since each line is masked on its own: `[x] password:` and then `hunter2 rotate it` keeps `hunter2 rotate it`, and `[architect] PGPASSWORD='Vckb` and then `f2lyk'` keeps `f2lyk'`
- in a command, a value with a space inside curly or escaped quotes. The program word splits it at the space, as the shell does, so `REDIS_PASS=“bkBL 7xCKS” gh pr list` reads `Bash → 7xCKS”` and `GH_PAT=\"correct horse battery\" gh` reads `Bash → horse`. A backtick group that is itself the first word is kept whole when it holds no key name, so `` `echo hunter2` deploy `` reads ``Bash → `echo hunter2` ``, while `$(echo hunter2) deploy` reads `Bash → $`.

Some text is masked that holds no secret. `scrub()` masks what upstream `redact()` hides, with the exceptions above, so a word after `token:`, `secret:`, `Authorization:`, `Bearer` or a secret flag is masked, as in `Add --token flag`, `Add Bearer authentication`, `Return 401 when Authorization: header is missing`, `Document the token: field` and `secret: none here`. The same parity masks a separator typed after `=` or `:` together with its value (`password == hunter2` reads `password =[masked]`), a key word that follows `password:` along with its own value (`password: secret: hunter2` shows two masks and counts 2), the word `Basic` behind a blank filler or zero-width character after `Authorization =` (`Authorization =` U+2800 `Basic abc` reads `Authorization =[masked] [masked]` and counts 2), the rest of a query after `token=` (`?token=abc&state=xyz` reads `?token=[masked]`), the port and path before a later `@` in a URL (`https://example.com:8443/package/@scope/pkg` reads `https://example.com:[masked]@scope/pkg`), and an `-----END` armor glued to a token-shaped run. An empty quoted value carries on to the next word, so `password: "" (none)` masks `(none)`. A query key typed as prose masks the next word, so `Deprecate the ?api_key= query param` masks `query`, and `docs;key=value` masks `value`. A final `!` after a word reads as a password sign, so `Rotate the password now!` masks `now!`. Other over-masks are `?code=python`, `PASSWORD_MIN_LENGTH=12`, `docker run -u $(id -u):$(id -g)`, a variable whose name only ends in `KEY` such as `MONKEY=banana`, and a name that starts like a token such as `sk-learn-pipeline` or `pk_live_handler_name`. `/flightdeck audit` shows how much text flightdeck holds.

State lives in `$.state` for the session. `/flightdeck reset`, `/clear` and a resume empty the text fields under `log`, `agents`, `gate`, `architect` and `roster` and set the masked count to 0; `/flightdeck audit` then reports 0 stored text fields. A session start resets state unless its `meta` names this schema version: upstream flightdeck stored no `meta` at all, an older port stored a lower version, and a reload after an install can meet either, so a missing, malformed, older or newer `meta` empties the state, the model, mode, cost and rate limits included, because none of it went through `scrub()`.

The `hygiene · <n> masked` cell and `/flightdeck audit` show the masked count. It adds up the masks `scrub()` finds each time flightdeck reads text for a field it keeps, before the field's cap cuts it, so a mask the cap cuts away still counts. A log row or title built from a field already masked adds nothing: an agent description `token=abc123 go` counts 1 across the card and its log row, and a denied check on `postgres://app:pw1234@db` counts 1 across the gate detail and the denial row. A command read twice counts twice: inside a subagent, its permission check and its tool call each read it, so the gate detail and the card's tool note count 2. A secret in a part the detail never reads, such as an assignment's value, is not counted, so `PGPASSWORD="correct horse battery staple" psql -h db` counts 0. A tool call in the main loop that ran keeps nothing and counts 0. The count is not the number of masks the pane shows.

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
| [`hooks/core.ts`](hooks/core.ts) | the reducers, formatters and layout rules as pure functions, so behaviour is testable directly |
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
