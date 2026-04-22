---
name: obsidian-cli
description: Drives an Obsidian vault from the command line using the official `obsidian` CLI — opens and appends daily notes, searches vault contents, creates notes from templates, lists files and tags, inspects tasks and unresolved links, reloads plugins, executes JavaScript in the running app, and automates vaults from shell scripts or cron. Use when the user mentions Obsidian, an Obsidian vault, markdown notes, daily notes, note-taking automation, the `obsidian` command, vault scripting, or plugin development for Obsidian.
---

# Obsidian CLI

The `obsidian` command controls a running Obsidian app from the terminal. "Anything you can do in Obsidian you can do from the command line" — daily notes, search, file creation, tag analysis, plugin reloading, and headless vault automation.

> Official docs: <https://obsidian.md/cli>

## Prerequisites (check first)

Before suggesting any `obsidian` command, verify the CLI is installed and reachable:

```bash
command -v obsidian && obsidian help | head -5
```

If `obsidian` is not found, walk the user through setup:

1. **Update Obsidian** to the latest version
2. **Enable the CLI** in Obsidian: `Settings → General → Command-line interface`
3. **Register to PATH**:
   - macOS: creates symlink at `/usr/local/bin/obsidian` (requires admin)
   - Linux: copies binary to `~/.local/bin/obsidian`
   - Windows: installs a terminal redirector next to `Obsidian.exe`
4. **Open a new shell** so the PATH update takes effect

Most commands require Obsidian to be running — the CLI proxies into the live app.

## Quick start

Five commands that cover most use cases:

```bash
obsidian daily                              # open today's daily note
obsidian daily:append content="- Idea..."   # append to today's daily note
obsidian search query="kubernetes"          # full-text vault search
obsidian create name="2026-04-22 Standup" template=MeetingNote
obsidian tasks daily                        # list tasks from today's note
```

Run `obsidian` with no arguments to launch an interactive TUI with autocomplete.

## Argument syntax

Obsidian CLI uses `key=value` arguments, not POSIX flags:

- ✓ `obsidian search query="error handling" vault="work" format=json`
- ✗ `obsidian search --query "error handling"` (will not work)

Quote values containing spaces. For JSON-friendly output, add `format=json` where supported (most list/query commands).

## Command categories

Jump to the reference file for the category matching the task:

- **Daily notes and journaling** → [reference/daily-notes.md](reference/daily-notes.md)
  `daily`, `daily:append`, `tasks daily`
- **Full command reference** → [reference/commands.md](reference/commands.md)
  `search`, `read`, `create`, `files`, `tags`, `diff`, `unresolved`, TUI keybindings
- **Developer and plugin commands** → [reference/developer.md](reference/developer.md)
  `devtools`, `plugin:reload`, `dev:screenshot`, `eval`, `dev:errors`, `dev:css`, `dev:dom`
- **Automation and scripting patterns** → [reference/automation.md](reference/automation.md)
  cron jobs, shell pipelines, JSON parsing with `jq`, vault backup, agent integration

Concrete end-to-end workflows are in [examples/workflows.md](examples/workflows.md).

## Core commands at a glance

| Command | Purpose |
|---|---|
| `obsidian daily` | Open today's daily note in the UI |
| `obsidian daily:append content="..."` | Append text to today's daily note |
| `obsidian search query="..."` | Search vault contents (supports `format=json`) |
| `obsidian read` | Read the currently-open file's contents to stdout |
| `obsidian create name="..." template=TemplateName` | Create a note from a template |
| `obsidian files` | List vault files (supports `sort=modified`, `limit=N`, `--copy`) |
| `obsidian tags counts` | List every tag with occurrence counts |
| `obsidian tasks [file]` | List tasks from a note; `daily` targets today's note |
| `obsidian diff file=NAME from=X to=Y` | Compare two versions of a file |
| `obsidian unresolved` | List broken internal links |
| `obsidian help` | Show help; append a command name for details |

Developer-only commands (require Obsidian dev mode) live in [reference/developer.md](reference/developer.md).

## Workflow patterns

### Pattern 1 — Capture into today's daily note

For "log this", "add to my journal", "note that I did X" style requests, prefer `daily:append` over creating a new note:

```bash
obsidian daily:append content="- 14:30 deployed v2.3.1 to staging"
```

If the user wants a timestamped entry, prepend it in the shell:

```bash
obsidian daily:append content="- $(date +%H:%M) $MESSAGE"
```

### Pattern 2 — Search, then read

Search returns file paths; follow up by reading the match:

```bash
obsidian search query="incident response" format=json \
  | jq -r '.[0].path'
# then open it in the UI or cat it from the vault path
```

When the user says "find my notes about X" without asking to open them, return the paths + a short snippet rather than flooding the conversation with full files.

### Pattern 3 — Create from template

`create` expects the template to already exist in the vault's templates folder (set in `Settings → Templates`):

```bash
obsidian create name="Post-mortem - 2026-04-22 outage" template=PostMortem
```

If the template does not exist, the command fails — check with `obsidian files` filtered to the templates folder first.

### Pattern 4 — Task harvest

List actionable items across the vault by combining `tasks` with shell tools. The `tasks` command outputs one task per line; pipe into `grep` or `rg` to filter by tag, project, or due date:

```bash
obsidian tasks daily | rg '#urgent'
```

For cross-vault task queries, see [reference/automation.md](reference/automation.md#task-harvesting).

### Pattern 5 — Headless automation

`obsidian` exits after running a command, so it composes cleanly in scripts:

```bash
#!/usr/bin/env bash
set -euo pipefail
obsidian daily:append content="- Build: $(git rev-parse --short HEAD) passed"
```

For scheduled runs (cron, launchd, Windows Task Scheduler), Obsidian must be running or must be launched by the script. See [reference/automation.md](reference/automation.md#scheduled-runs).

## Output formats

Where a command supports `format=json`, prefer it when piping to another tool — plain text output is intended for humans and may change between Obsidian versions. JSON lets you use `jq` or equivalent reliably:

```bash
obsidian search query="TODO" format=json \
  | jq -r '.[] | "\(.path):\(.line) \(.text)"'
```

Commands known to support JSON output include `search`, `files`, `tags`, and `tasks`. When in doubt, try appending `format=json` and fall back to plain text if Obsidian rejects it.

## TUI mode

Running `obsidian` with no arguments opens an interactive shell with command autocomplete. Keybindings:

| Key | Action |
|---|---|
| `Tab` | Accept current autocomplete suggestion |
| `Ctrl+A` / `Ctrl+E` | Jump to start / end of line |
| `Ctrl+U` / `Ctrl+K` | Delete to start / end of line |
| `Ctrl+R` | Reverse-search command history |
| `Ctrl+C` | Exit the TUI |

Use TUI mode when exploring the command surface interactively; prefer one-shot invocations from scripts.

## When things go wrong

- **"command not found: obsidian"** — CLI not enabled or not on PATH. Walk through the Prerequisites section.
- **Command hangs** — Obsidian app is not running, or is on a different vault than expected. Pass `vault="VaultName"` explicitly when scripting across multiple vaults.
- **Template not found** — check the template name matches a file in the vault's configured templates folder (no `.md` extension in the `template=` argument).
- **`format=json` returns plain text** — that subcommand does not support JSON on the installed version; parse the text output or upgrade Obsidian.
- **Plugin commands fail silently** — run `obsidian dev:errors` to surface the JavaScript error from the running app (see [reference/developer.md](reference/developer.md)).

## Decision guide

| User says | Do this |
|---|---|
| "add to my daily note" / "log this" | `obsidian daily:append content="..."` |
| "open today's note" | `obsidian daily` |
| "find notes about X" | `obsidian search query="X" format=json`, return paths |
| "show me my tasks" | `obsidian tasks daily` (or a named file) |
| "list my tags" / "what do I write about" | `obsidian tags counts` |
| "find broken links" | `obsidian unresolved` |
| "make a new note from template Y" | `obsidian create name="..." template=Y` |
| "reload my plugin" | `obsidian plugin:reload <plugin-id>` — see [developer.md](reference/developer.md) |
| "script my vault" / "cron this" | See [automation.md](reference/automation.md) |

## Security and safety

- `obsidian eval "..."` executes arbitrary JavaScript in the running Obsidian process. Never run untrusted input through it. Treat it as you would `eval` in any language.
- `obsidian daily:append` writes to the user's notes — confirm intent before appending on the user's behalf, especially to past days' notes.
- Avoid piping secrets (tokens, passwords) into `content=` arguments; the full command line is visible in process lists and shell history.

## See also

- [reference/commands.md](reference/commands.md) — complete command reference with flags
- [reference/daily-notes.md](reference/daily-notes.md) — journaling, append patterns, timestamps
- [reference/developer.md](reference/developer.md) — `eval`, `devtools`, plugin reload, DOM inspection
- [reference/automation.md](reference/automation.md) — shell scripting, cron, JSON parsing, backups
- [examples/workflows.md](examples/workflows.md) — end-to-end recipes
