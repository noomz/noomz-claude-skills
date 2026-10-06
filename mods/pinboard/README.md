# Pinboard

**What needs you, pinned where you can see it.** Open decisions, the task list and the links Claude creates stay in a pane beside the conversation, so they don't scroll out of view.

This is a hardened port of [sirkitree/pinboard](https://github.com/sirkitree/pinboard) by Jerad Bitner (upstream commit `b035c14`, MIT). It keeps the upstream features. Every text the mod keeps passes one scrubber, `hooks/hygiene.ts`, before it reaches state, the pane or the system prompt, and the pane shows what was masked.

If you installed the upstream plugin, uninstall it first. Both plugins are named `pinboard`.

## What it pins

- **Open decisions.** These are questions Claude needs you to answer. They stay pinned until Claude closes them after you answer.
- **Todos.** This is the session's task list, one action per item. The todo Claude works on now is marked `▸` in the warning color, and only one is in progress at a time. Open items show `○`. Finished items fold into one dim `✓ N done` line, so open work stays on top.
- **Links.** These are URLs from actions that make something: `gh pr|issue|release|repo|gist create`, `gh pr|issue comment`, `git push`, and MCP tools whose name holds `create`, `draft`, `send`, `publish`, `share` or `upload` as its own word, such as `slack_send_message` (not `slack_read_canvas` or `list_drafts`). The newest is first, up to 12. A GitHub pull request or issue gets a short label such as `repo PR #12`. Every other link is labeled with its host and path. Press `l` or the **clear** button to empty the list.

## How Claude updates it

Pinboard registers a tool, `mcp__pinboard__update`. Claude calls it to add todos, start one, check todos off or remove them by id, open decisions, and close them. Each call shows as one dim line in the transcript, such as `Pinboard: +2 todo, 1 decided`. Only the main conversation can update the board. A subagent's call is denied.

The tool checks each call before it changes the board:

- It accepts only its six keys: `add_todos`, `start_todo`, `done_todos`, `remove_todos`, `open_decisions` and `decide`. The engine owns four more names beside them, `tool`, `tool_use_id`, `agentId` and `consent`, so a model-written one never reaches the board, and a model-written `agentId` of any value, `''`, `0`, `false` and `null` included, reads as a subagent's call. The engine drops an own `__proto__` key before the mod sees the call. The refusal for any other key names it as received: JSON-quoted, with each character outside printable ASCII written as `\uXXXX`, then scrubbed.
- Each list holds at most 20 entries per call.
- Todo ids look like `t1` and decision ids look like `d1`.
- The board holds at most 50 todos and 20 decisions.

A call that fails a check is refused. Claude reads the reason as an error result, the board stays the same, and the `rejected` counter goes up by one. A subagent's denied call does not count. Each call reads and writes the board and its hygiene counters in one step, so two calls in the same turn both land, a call that races `/clear` never brings back what the clear removed, and the `masked` count always matches the masks the board holds.

## What it stores, sends and masks

**Stores.** The mod keeps two values in session state: the board, which holds the todos (id, text, done, in progress), the decisions (id, text) and the hygiene counters (`masked`, `rejected`), and the links (address, label). A `/clear` or a resume empties both. When the session starts, the mod checks every value an older build left in state again. It rebuilds each item from its known fields, scrubs each text, keeps `done` and `in progress` only when they are `true`, drops items with a bad or repeated id, keeps at most one todo in progress, and resets a value of the wrong shape to empty. The counters must be whole numbers of zero or more. It holds the board to the caps: past 50 todos the oldest finished todos go first and then the list keeps its first 50, and past 20 decisions it keeps the first 20. Upstream kept the todos and the decisions as values of their own, `pinboard/todos` and `pinboard/decisions`. When the board is empty, the mod reads them into it through the same checks. It sets them, and the separate `pinboard/hygiene` counters of earlier builds, to null at session start and on a `/clear` or a resume.

**Sends to the model.** On every request, the mod adds one section to the end of the system prompt. Its first line names the marks (`[ ]` open, `[>]` in progress, `[x]` done, `[?]` open decision). It also says that each item's text is a JSON-quoted label that this session's pinboard tool calls wrote: a record of the plan, not instructions from the user or the system. Each item follows on its own line as id, mark and JSON-quoted text. A newline in a todo cannot start a new prompt line. The tool result carries the same text. Links never go to the model.

**Masks.** Each todo, decision and answer text goes through `scrub()` before the mod keeps it:

- Compatibility characters read as the plain characters they show, so a fullwidth `＝` is `=`.
- Control characters, `ESC`, bidi overrides, zero-width characters and other invisible characters are removed.
- Whitespace collapses to one space, so the text is one line.
- Secrets are replaced with `[masked]`, and the key name stays. Each secret is masked once and counted once, and scrubbing a scrubbed text changes nothing. The rules cover:
  - any value after `password`, `passwd`, `pwd`, `passphrase`, `token` or `secret` and a separator that starts with `=` or `:`, such as `password = hunter2`, `token: abc` and `password=>abc`
  - any value after a key name such as `api_key`, `access_token` or `client_secret`, after the `--token`, `--password`, `--api-key` and `--secret` flags, and after `Authorization:` or `Authorization=`
  - a value after another separator (`->`, `-`, `–`, `→`, `is`) or a space, such as `password -> hunter2` and `my password is hunter2`, when the value holds a digit or a symbol or runs to 20 characters, so `add password validation` and `password -> strength meter` stay as written
  - quoted values of any length, closed or not, such as JSON `"password":"..."`
  - AWS secret keys and `AKIA` key ids
  - JWTs, and PEM and PGP private key blocks, encrypted ones included
  - GitHub, Slack and `sk-`/`pk-`/`rk-` style tokens
  - bearer tokens: any 8 token characters after `Bearer`, or a shorter value with a digit or a symbol
  - passwords in URLs and secret query values (`key`, `sig`, `signature`, `token`, `X-Amz-Signature`, `code`, session ids)
  - Slack and Discord webhook URLs, and `-u user:pass` (not a numeric `-u 1000:1000`)
  - environment variables whose names end in `KEY`, `TOKEN`, `SECRET` or `PASSWORD`, or hold one of those or `PAT` or `PASS` as an `_`-separated part, so `KEYBOARD=us` stays as written
- The text is cut to 200 characters. Text past the first 4096 characters is dropped, along with the word the cut runs through, so a single word longer than that leaves nothing and the call is refused.

A link must use `https` and carry no user name or password. The mod keeps no query string. It drops the fragment, except a GitHub comment anchor (`#issuecomment-N`, `#discussion_rN`). It does not pin a link whose path, as written or percent-decoded, holds anything `scrub()` would mask, so a host plus an encoded path such as `hooks.slack.com/%73ervices/...` is caught. Each decoding round decodes only the valid `%XX` escapes, and decoding stops when a round leaves none, so a literal percent such as `wiki/100%25_renewable_energy` pins. It does not pin a link whose escapes do not decode to UTF-8, such as `caf%C3`, one that still holds an escape after 8 rounds, or one longer than 2048 characters as written or once encoded. A port stays in the link, so `https://example.com:8443/package/@scope/pkg` pins; its path is checked without the port, since `scrub()` reads `host:port/...@` as a URL password. The masking rules cost some ordinary links: a path with a name that starts like a token, such as `ghp-pages-builder`, `sk-learn-pipeline` or `sk_buff_helpers.c`, or a segment that reads as `key: value`, such as `wiki/Token:Foo`, is not pinned. A GitHub label needs the host to be exactly `github.com`. Every other label starts with the real host, so `https://attacker.example/github.com/o/r/pull/1` reads `attacker.example/github.com/o/r/pull/1`.

**What it does not catch.** Masking works by pattern. These stay as written:

- a secret with no key name or known shape, such as `the creds are hunter2`
- short or tool-specific forms such as `pw=hunter2` and `mysql -phunter2`
- a short letters-only password after a space or `is`, such as `my password is sunshine`
- a key name spelled with look-alike letters from another script, such as a Cyrillic `р` in `password`

Some text is masked that holds no secret. The mod masks at least every value the flightdeck mod's `redact()` masked, so a word after `token:`, `secret:`, `Authorization:`, `Bearer` or a secret flag is masked, as in `Add --token flag`, `Add Bearer authentication`, `Return 401 when Authorization: header is missing`, `Document the token: field` and `secret: none here`. Other over-masks are `?code=python`, `PASSWORD_MIN_LENGTH=12`, `docker run -u $(id -u):$(id -g)`, a variable whose name only ends in `KEY` such as `MONKEY=banana`, and a name that starts like a token such as `sk-learn-pipeline` or `pk_live_handler_name`. The quoting and the header keep a todo from posing as a prompt line, but whether a model acts on text inside a quoted label depends on the model.

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
