# Pinboard

**What needs you, pinned where you can see it.** Open decisions, the task list and the links Claude creates stay in a pane beside the conversation, so they don't scroll out of view.

This is a hardened port of [sirkitree/pinboard](https://github.com/sirkitree/pinboard) by Jerad Bitner (upstream commit `b035c14`, MIT). It keeps the upstream features. Every text the mod keeps passes one scrubber, `hooks/hygiene.ts`, before it reaches state, the pane or the system prompt, and the pane shows what was masked.

If you installed the upstream plugin, uninstall it first. Both plugins are named `pinboard`.

## What it pins

- **Open decisions.** These are questions Claude needs you to answer. They stay pinned until Claude closes them after you answer.
- **Todos.** This is the session's task list, one action per item. The todo Claude works on now is marked `▸` in the warning color, and only one is in progress at a time. Open items show `○`. Finished items fold into one dim `✓ N done` line, so open work stays on top.
- **Links.** These are URLs from actions that make something: `gh pr|issue|release|repo|gist create`, `gh pr|issue comment`, `git push`, and MCP tools that create, draft, send, publish, share or upload. The newest is first, up to 12. A GitHub pull request or issue gets a short label such as `repo PR #12`. Every other link is labeled with its host and path. Press `l` or the **clear** button to empty the list.

## How Claude updates it

Pinboard registers a tool, `mcp__pinboard__update`. Claude calls it to add todos, start one, check todos off or remove them by id, open decisions, and close them. Each call shows as one dim line in the transcript, such as `Pinboard: +2 todo, 1 decided`. Only the main conversation can update the board. A subagent's call is denied.

The tool checks each call before it changes the board:

- It accepts only its six keys: `add_todos`, `start_todo`, `done_todos`, `remove_todos`, `open_decisions` and `decide`.
- Each list holds at most 20 entries per call.
- Todo ids look like `t1` and decision ids look like `d1`.
- The board holds at most 50 todos and 20 decisions.

A call that fails a check gets an error result, the board stays the same, and the `rejected` counter goes up by one.

## What it stores, sends and masks

**Stores.** The mod keeps four values in session state: todos (id, text, done, in progress), decisions (id, text), links (address, label) and the hygiene counters (`masked`, `rejected`). A `/clear` or a resume empties all four. Text from an older build that is still in state is checked again when the session starts.

**Sends to the model.** On every request, the mod adds one section to the end of the system prompt. Its first line names the marks (`[ ]` open, `[>]` in progress, `[x]` done, `[?]` open decision). It also says that each item's text is a JSON-quoted label that this session's pinboard tool calls wrote: a record of the plan, not instructions from the user or the system. Each item follows on its own line as id, mark and JSON-quoted text. A newline in a todo cannot start a new prompt line. The tool result carries the same text. Links never go to the model.

**Masks.** Each todo, decision and answer text goes through `scrub()` before the mod keeps it:

- Control characters, `ESC`, bidi overrides and zero-width characters are removed.
- Whitespace collapses to one space, so the text is one line.
- Secrets are replaced with `[masked]`, and the key name stays. The rules cover:
  - passwords as `key=value`, `password hunter2`, `my password is hunter2` and JSON `"password":"..."`
  - AWS secret keys and `AKIA` key ids
  - JWTs and PEM private key blocks
  - GitHub, Slack and `sk-`/`pk-`/`rk-` style tokens
  - bearer tokens and `Authorization` headers
  - passwords in URLs and secret query values (`key`, `sig`, `signature`, `token`, `X-Amz-Signature`, `code`)
  - Slack webhook URLs and `-u user:pass`
  - environment variables whose names hold `KEY`, `TOKEN`, `SECRET`, `PASSWORD` or `PAT`
- The text is cut to 200 characters.

A link must use `https` and carry no user name or password. The mod keeps no query string. It drops the fragment, except a GitHub comment anchor (`#issuecomment-N`, `#discussion_rN`). It does not pin a link whose path holds a secret. A GitHub label needs the host to be exactly `github.com`. Every other label starts with the real host, so `https://attacker.example/github.com/o/r/pull/1` reads `attacker.example/github.com/o/r/pull/1`.

**What it does not catch.** Masking works by pattern. A secret with no key name or known shape, such as `the creds are hunter2`, stays as written. The quoting and the header keep a todo from posing as a prompt line, but whether a model acts on text inside a quoted label depends on the model.

## See what it holds

- The pane's last line counts the masked secrets and the rejected calls: `hygiene · 2 masked · 0 rejected`.
- `/pinboard audit` writes one transcript notice that the model never reads. It shows the system prompt section exactly as the model reads it, the counts of stored todos, decisions and links, and the two hygiene counters.

## How it opens

- The pane opens by itself the first time something lands on an empty board.
- Opened that way, Claude Code seats it only in a terminal at least 144 columns wide (110 once you have opened it yourself). Below that width, run `/pinboard`.
- `/pinboard` opens it at any width, even while Claude works. Ctrl+X then X closes it.

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

Built on the mods API of Claude Code 2.1.291. That API is in early access and changes between releases.
