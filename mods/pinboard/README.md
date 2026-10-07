# Pinboard

**What needs you, pinned where you can see it.** Open decisions, the task list and the links Claude creates stay in a pane beside the conversation, so they don't scroll out of view.

This is a hardened port of [sirkitree/pinboard](https://github.com/sirkitree/pinboard) by Jerad Bitner (upstream commit `b035c14`, MIT). It keeps the upstream features. Every text the mod keeps passes one scrubber, `hooks/hygiene.ts`, before it reaches state, the pane or the system prompt, and the pane shows what was masked.

If you installed the upstream plugin, uninstall it first. Both plugins are named `pinboard`.

## What it pins

- **Open decisions.** These are questions Claude needs you to answer. They stay pinned until Claude closes them after you answer.
- **Todos.** This is the session's task list, one action per item. The todo Claude works on now is marked `▸` in the warning color, and only one is in progress at a time. Open items show `○`. Finished items fold into one dim `✓ N done` line, so open work stays on top.
- **Links.** These are URLs from actions that make something: `gh pr|issue|release|repo|gist create`, `gh pr|issue comment`, `git push`, and MCP tools whose name holds `create`, `draft`, `send`, `publish`, `share` or `upload` as its own word in any case, with words split at `_`, `-` and a lower-to-upper case change, such as `slack_send_message`, `CreateIssue` or `UPLOAD_FILE` (not `slack_read_canvas`, `list_drafts` or `createdAt`). A subagent's action pins nothing, whatever value its `agentId` holds. The newest is first, up to 12. A GitHub pull request or issue gets a short label such as `repo PR #12`. Every other link is labeled with its host and path. Press `l` or the **clear** button to empty the list.

## How Claude updates it

Pinboard registers a tool, `mcp__pinboard__update`. Claude calls it to add todos, start one, check todos off or remove them by id, open decisions, and close them. Each call shows as one dim line in the transcript, such as `Pinboard: +2 todos, 1 decided`. That line is all the mod draws for a call; the call's raw input, secrets included, stays in Claude Code's own transcript, which the mod does not control. Only the main conversation can update the board. A subagent's call is denied.

The tool checks each call before it changes the board:

- It accepts only its six keys: `add_todos`, `start_todo`, `done_todos`, `remove_todos`, `open_decisions` and `decide`. The engine owns four more names beside them, `tool`, `tool_use_id`, `agentId` and `consent`, so a model-written one never reaches the board, and a model-written `agentId` of any value, `''`, `0`, `false` and `null` included, reads as a subagent's call. The engine drops an own `__proto__` key before the mod sees the call. The refusal for any other key names it: the key is scrubbed first, so a secret behind a tab, a no-break space or another separator is masked, then JSON-quoted, with each character outside printable ASCII written as `\uXXXX`, and scrubbed again. A key that scrubbing masks nothing in is quoted as received, invisible characters and trailing spaces included.
- Each list holds at most 20 entries per call.
- Todo ids look like `t1` and decision ids look like `d1`.
- The board holds at most 50 todos and 20 decisions.

A call that fails a check is refused. Claude reads the reason as an error result, the board stays the same, and the `rejected` counter goes up by one. A call the checks cannot finish, because a check itself failed, is refused the same way with one fixed reason that holds none of the call's text. A subagent's denied call does not count. Each call reads and writes the board and its hygiene counters in one step, so two calls in the same turn both land, and a call that races `/clear` never brings back what the clear removed. Session start takes the todos and decisions older builds kept apart and folds them in only if nothing wrote the board since it read it, so a `/clear` racing the start does not bring them back either; the cost is that any other write landing in that moment, a tool call included, drops them. The `masked` count is a running total of the masks that accepted calls wrote into todos, decisions and answers. It does not go down when an item leaves the board, a refused call adds none, and a `/clear` or a resume sets it and `rejected` back to 0.

## What it stores, sends and masks

**Stores.** The mod keeps two values in session state: the board, which holds the todos (id, text, done, in progress), the decisions (id, text) and the hygiene counters (`masked`, `rejected`), and the links (address, label). A `/clear` or a resume empties both. When the session starts, the mod checks every value an older build left in state again. It rebuilds each item from its known fields, scrubs each text, keeps `done` and `in progress` only when they are `true`, drops items with a bad or repeated id, keeps at most one todo in progress, and resets a value of the wrong shape to empty. The counters must be whole numbers of zero or more. It holds the board to the caps: past 50 todos the oldest finished todos go first and then the list keeps its first 50, and past 20 decisions it keeps the first 20. Upstream kept the todos and the decisions as values of their own, `pinboard/todos` and `pinboard/decisions`. When the board is empty, the mod reads them into it through the same checks. It sets them, and the separate `pinboard/hygiene` counters of earlier builds, to null at session start and on a `/clear` or a resume.

**Sends to the model.** On every request, the mod adds one section to the end of the system prompt. Its first line names the marks (`[ ]` open, `[>]` in progress, `[x]` done, `[?]` open decision). It also says that each item's text is a JSON-quoted label that this session's pinboard tool calls wrote: a record of the plan, not instructions from the user or the system. Each item follows on its own line as id, mark and JSON-quoted text. A newline in a todo cannot start a new prompt line. The tool result carries the same text. Links never go to the model.

**Masks.** Each todo, decision and answer text goes through `scrub()` before the mod keeps it:

- Compatibility characters read as the plain characters they show, so a fullwidth `＝` is `=`.
- Control characters, `ESC`, bidi overrides, zero-width characters and other invisible characters are removed.
- Whitespace collapses to one space, so the text is one line.
- Secrets are replaced with `[masked]`, and the key name stays. Each secret is masked once and counted once, a `[masked]` the text already holds stays and is not counted, and scrubbing a scrubbed text changes nothing. The rules cover:
  - every character the flightdeck mod's `redact()` hides. Its pattern table, from [scasella/claude-flightdeck](https://github.com/scasella/claude-flightdeck) at `f31daca` (MIT, Copyright (c) 2026 Stephen Casella), runs inside `scrub()` in its own order, on the text as received and again on the cleaned line, so a compatibility reading or a removed invisible character never moves a secret out of its reach. Its URL pattern is rewritten to run in linear time with the same matches. Two things it hides stay visible. A final `…` reads as a cut mark. An input `•` or `[masked]` that it would hide stays as the same glyph and is not counted.
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
- A blank filler such as `ㅤ` (U+3164) is read both as a space and as nothing, and a value either reading shows is masked, so `passwordㅤhunter2` and `passㅤword=s3cret` are both caught.
- The text is cut to 200 characters, at the longest start that does not end inside a mask or show part of a secret, so a longer limit never shows less. A final `…` reads as a cut mark and stays outside any mask. Text past the first 4096 characters is dropped, along with the word the cut runs through, so a single word longer than that leaves nothing and the call is refused.

A link must use `https` and carry no user name or password. A link in a command's output ends at a space, a quote, `<`, `>`, a backtick, or a non-ASCII character that is not a letter, digit or mark, so `https://github.com/o/r/pull/12，next` pins `https://github.com/o/r/pull/12`. The mod keeps no query string. It drops the fragment, except a GitHub comment anchor (`#issuecomment-N`, `#discussion_rN`). It does not pin a link whose path, as written or percent-decoded, holds anything `scrub()` would mask, so a host plus an encoded path such as `hooks.slack.com/%73ervices/...` is caught. Each decoding round decodes only the valid `%XX` escapes, and decoding stops when a round leaves none, so a literal percent such as `wiki/100%25_renewable_energy` pins. It does not pin a link whose escapes do not decode to UTF-8, such as `caf%C3`, one that still holds an escape after 8 rounds, or one longer than 2048 characters as written or once encoded. A port stays in the link, so `https://example.com:8443/package/@scope/pkg` pins; its path is checked without the port, since `scrub()` reads `host:port/...@` as a URL password. The masking rules cost some ordinary links: a path with a name that starts like a token, such as `ghp-pages-builder`, `sk-learn-pipeline` or `sk_buff_helpers.c`, a segment that reads as `key: value`, such as `wiki/Token:Foo`, a path whose decoded words read as a secret, such as `the%20password%20v2`, a link through an archive whose inner address holds `host:port/...@`, such as `https://web.archive.org/web/2020/https://host:8080/a@b`, and a path whose literal `%25` is followed by two hex digits, such as `wiki/100%25Beef`, is not pinned. A GitHub label needs the host to be exactly `github.com`. Every other label is the host, port included, then the percent-encoded path, cut to 80 characters with a final `…`, so `https://attacker.example/github.com/o/r/pull/1` reads `attacker.example/github.com/o/r/pull/1` and `https://example.com:8443/password-reset` reads `example.com:8443/password-reset`. A host of 80 characters or more shows as `…` and the host's last 79 characters, with no path, so the end of the host, which names its registered domain, stays in view.

**What it does not catch.** Masking works by pattern. These stay as written:

- a secret with no key name or known shape, such as `the creds are hunter2`
- short forms such as `pw=hunter2`, and a value after a doubled or unknown separator, such as `password--hunter2` and `password >> hunter2`
- a letters-only password whose only sign is a final `.`, `,`, `;`, `:` or `?`, such as `password -> Hunter?` and `my password is Sunshine.`
- a value after `Bearer:` with a colon, a Slack webhook path written without `https://`, such as `hooks.slack.com/services/...`, and a token with an unknown prefix after `token` and a space, such as `token ghx_abc123def456`
- a `for` clause of more than three words before `is`, such as `the password for the old admin account is hunter2`
- a short letters-only password after a space or `is`, such as `my password is sunshine`
- a key name spelled with look-alike letters from another script, such as a Cyrillic `р` in `password`
- a value after a symbol that is not a separator, such as `password ⇒ hunter2`
- a control or format character between a key and its value, such as a NUL, U+0001, DEL, U+202E or U+FEFF in `password` NUL `hunter2xyz`. Removing it joins the two into `passwordhunter2xyz`, and nothing is masked. Flightdeck's `redact()` does not mask these either.
- a NEL (U+0085) or other line break inside a key name, which splits it, so `pass` NEL `word=hunter2x` reads `pass word=hunter2x`
- the rest of a value glued to `-p` after a quoted part, so `mysql -p"hun"ter2` reads `mysql -p"[masked]"ter2` and shows `ter2`, and `sshpass -p "hun"ter2` shows `ter2` the same way
- the rest of a value after a run of five or more dashes inside it, so `DB_PASS=x-----y` shows `-----y`. A value that starts with dashes, such as `DB_PASS=-----S3cure!`, is masked whole.
- an input `•` or `[masked]` where `redact()` would hide a value, which stays as the same glyph, so `https://u:•@h then password=x` reads `https://u:•@h then password=[masked]`
- every word after the first of a value in brackets, such as `password: (correct horse9)`, which shows `horse9)`
- a value after a symbol that reads as letters, such as `password: ⒜ hunter2`: compatibility reading turns `⒜` into `(a)`, which is masked as the value. The same reading catches key names spelled in such letters, such as `ⓟⓐⓢⓢⓦⓞⓡⓓ=hunter2`.

Some text is masked that holds no secret. The mod masks every character the flightdeck mod's `redact()` hid, so a word after `token:`, `secret:`, `Authorization:`, `Bearer` or a secret flag is masked, as in `Add --token flag`, `Add Bearer authentication`, `Return 401 when Authorization: header is missing`, `Document the token: field` and `secret: none here`. The same parity masks a separator typed after `=` or `:` together with its value (`password == hunter2` reads `password =[masked]`), a key word that follows `password:` along with its own value (`password: secret: hunter2` shows two masks), the rest of a query after `token=` (`?token=abc&state=xyz` reads `?token=[masked]`), the port and path before a later `@` in a URL (`https://example.com:8443/package/@scope/pkg` reads `https://example.com:[masked]@scope/pkg`), and an `-----END` armor glued to a token-shaped run. An empty quoted value carries on to the next word, so `password: "" (none)` masks `(none)`. A query key typed as prose masks the next word, so `Deprecate the ?api_key= query param` masks `query`, and `docs;key=value` masks `value`. A final `!` after a word reads as a password sign, so `Rotate the password now!` masks `now!`. Other over-masks are `?code=python`, `PASSWORD_MIN_LENGTH=12`, `docker run -u $(id -u):$(id -g)`, a variable whose name only ends in `KEY` such as `MONKEY=banana`, and a name that starts like a token such as `sk-learn-pipeline` or `pk_live_handler_name`. The quoting and the header keep a todo from posing as a prompt line, but whether a model acts on text inside a quoted label depends on the model.

## See what it holds

- The pane's last line counts the masked secrets and the rejected calls: `hygiene · 2 masked · 0 rejected`.
- `/pinboard audit` writes transcript notices, one per line, and returns nothing to the model. They show the system prompt section exactly as the model reads it, the counts of stored todos, decisions and links, and the two hygiene counters.

## How it opens

- The pane opens by itself when the first thing lands on an empty board.
- `/pinboard` opens it.

## Install

```
/plugin install pinboard@noomz-claude-skills
```

## Develop

```bash
claude plugin validate mods/pinboard
claude plugin test mods/pinboard
claude --plugin-dir mods/pinboard
bun mods/pinboard/tests/hygiene.bench.ts --upstream <path to a sirkitree/pinboard checkout>
```

The bench compares `describeBoard` against upstream and times `scrub()` on adversarial inputs. It fails when either goes past the limits in the file.
