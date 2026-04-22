---
name: obsidian-cli
description: Drives an Obsidian vault from the command line using the official `obsidian` CLI — opens and appends daily notes, searches vault contents, creates and edits notes, lists files and folders, reads and sets frontmatter properties, manages tasks and tags, queries links and backlinks, executes any Obsidian command, manipulates plugins and themes, inspects Bases, and runs arbitrary JavaScript in the running app. Use when the user mentions Obsidian, an Obsidian vault, markdown notes, daily notes, note-taking automation, the `obsidian` command, vault scripting, or plugin development for Obsidian.
---

# Obsidian CLI

The `obsidian` command controls a running Obsidian app from the terminal via roughly 80 subcommands. Covers every surface of the vault: files, folders, daily notes, tasks, tags, properties, links, templates, bookmarks, plugins, themes, Bases, sync/history, and developer tooling.

> Official docs: <https://obsidian.md/cli>

**Freedom level**: low on command syntax (use the exact `key=value` form verified via `obsidian help <command>`); medium on workflow composition (adapt the patterns in this skill to context).

## Prerequisites

Verify the CLI is installed, Obsidian is running, and the vault is reachable. Run all three:

```bash
command -v obsidian \
  && pgrep -qaf Obsidian \
  && obsidian vault info=name
```

If all three succeed and the last prints a vault name, the skill is operational. If any fails, walk the user through setup — the likely failures:

- `command -v obsidian` fails → CLI not installed or not on PATH (see steps below)
- `pgrep` fails → Obsidian app isn't running; tell the user to launch it
- `obsidian vault info=name` hangs → Obsidian is running but the CLI can't reach it (installer out of date, or wrong vault focused)

If the installer is out of date — `obsidian version` will print *"Your Obsidian installer is out of date"* — tell the user to:

1. Download the latest installer from <https://obsidian.md/download> (their notes and vault config are separate — reinstalling only replaces the app).
2. Enable the CLI: **Settings → General → Command-line interface**.
3. On macOS, approve the admin prompt that creates `/usr/local/bin/obsidian`.
4. Open a new shell.

Obsidian must be **running** for CLI commands to work — the CLI proxies into the live app.

## Argument syntax

Commands use `key=value` arguments, not POSIX flags. Standalone words (`total`, `counts`, `verbose`, `active`, `done`, `todo`, `open`, `newtab`) act as boolean flags.

- ✓ `obsidian search query="error handling" vault="work" format=json`
- ✓ `obsidian tasks daily todo counts`
- ✗ `obsidian search --query "error handling"` (will not work)

**File targeting**: most commands accept either `file=<name>` (resolved by name like a wiki-link) or `path=<folder/note.md>` (exact path). With neither, commands default to the **active file** in Obsidian. The `active` flag forces the active-file interpretation explicitly.

**Escapes in `content=`**: use `\n` for newline and `\t` for tab inside quoted content values.

## Quick start

```bash
obsidian daily                              # open today's daily note
obsidian daily:append content="- Idea..."   # append to today's daily note
obsidian search query="kubernetes"          # full-text vault search
obsidian create name="2026-04-22 Standup" template=MeetingNote open
obsidian tasks daily todo                   # incomplete tasks from today's note
obsidian vault info=path                    # absolute path to the active vault
```

## Command categories

Jump to the reference file matching the task:

- **Daily notes and journaling** → [reference/daily-notes.md](reference/daily-notes.md)
  `daily`, `daily:append`, `daily:prepend`, `daily:read`, `daily:path`
- **Full command reference** → [reference/commands.md](reference/commands.md)
  Every subcommand grouped — files, folders, content, properties, tags, tasks, search, links, templates, plugins, themes, bookmarks, sync, history, Bases, workspace, vaults.
- **Developer and plugin commands** → [reference/developer.md](reference/developer.md)
  `eval`, `command`, `commands`, `devtools`, `plugin:reload`, `dev:dom`, `dev:css`, `dev:console`, `dev:errors`, `dev:screenshot`, `dev:cdp`, `dev:debug`, `dev:mobile`
- **Automation and scripting patterns** → [reference/automation.md](reference/automation.md)
  cron, launchd, JSON parsing with `jq`, vault-path discovery, agent integration

Concrete end-to-end workflows are in [examples/workflows.md](examples/workflows.md).

## Core commands at a glance

| Command | Purpose |
|---|---|
| `obsidian daily` | Open today's daily note |
| `obsidian daily:append content="..."` | Append to today's daily note |
| `obsidian search query="..."` | Search vault (supports `format=text\|json`, `limit=`, `path=`) |
| `obsidian search:context query="..."` | Search with matching-line context |
| `obsidian read` / `read file=<name>` | Read a file's contents to stdout |
| `obsidian append` / `prepend` | Append/prepend content to any file |
| `obsidian create name="..." [template=T] [open]` | Create a note, optionally from a template |
| `obsidian files [folder=<path>] [ext=md]` | List files (no sort — pipe through shell) |
| `obsidian folders [folder=<path>]` | List folders |
| `obsidian folder path="..."` | Show folder info |
| `obsidian tags [counts] [format=json]` | List tags |
| `obsidian tasks [file=\|path=] [done\|todo] [format=json]` | List tasks; `daily` flag targets today's note |
| `obsidian properties [file=\|active] [counts]` | List YAML frontmatter properties |
| `obsidian property:read name=X file=Y` | Read a single property value |
| `obsidian property:set name=X value=Y [type=T]` | Set a property on a file |
| `obsidian links` / `backlinks` / `unresolved` / `orphans` / `deadends` | Link graph queries |
| `obsidian command id=<command-id>` | **Execute any Obsidian command** (like `editor:toggle-bold`) |
| `obsidian commands [filter=prefix]` | List available command IDs |
| `obsidian vault info=path\|name\|files\|folders\|size` | Vault info |
| `obsidian vaults` | List known vaults |
| `obsidian help [command]` | Full reference for every subcommand |

## Workflow patterns

### Pattern 1 — Capture into today's daily note

For "log this", "add to my journal", "note that I did X":

```bash
obsidian daily:append content="- 14:30 deployed v2.3.1 to staging"
```

Prepend a timestamp in the shell:

```bash
obsidian daily:append content="- $(date +%H:%M) $MESSAGE"
```

### Pattern 2 — Search, then read

Search returns JSON with matches; follow up by reading a hit:

```bash
path=$(obsidian search query="incident response" format=json limit=1 \
  | jq -r '.[0].path')
obsidian read path="$path"
```

When the user says "find my notes about X" without asking to open them, return the paths and let them pick.

### Pattern 3 — Create from template

Templates live in the vault's configured templates folder; pass the template name without a `.md` extension. Add `open` to open the new note after creation.

```bash
obsidian create name="Post-mortem - 2026-04-22 outage" template=PostMortem open
```

If the template does not exist, the command fails. List available templates with `obsidian templates`.

### Pattern 4 — Task harvest

Incomplete tasks in today's daily note, JSON-shaped for pipelines:

```bash
obsidian tasks daily todo format=json \
  | jq -r '.[] | "\(.file):\(.line) \(.text)"'
```

Filter by status character (e.g. `/` for in-progress, `x` for done):

```bash
obsidian tasks status="/" format=json
```

For cross-vault harvesting without `obsidian`, see [reference/automation.md](reference/automation.md#task-harvesting).

### Pattern 5 — Execute Obsidian commands

`obsidian command id=<id>` runs any command from Obsidian's command palette — the single most powerful automation primitive. Anything Obsidian can do via the palette is scriptable.

```bash
obsidian commands filter=editor: | head
obsidian command id=editor:toggle-bold
```

**Caution**: palette IDs include destructive actions (`app:quit`, `app:reload`, `workspace:close-others`, `editor:delete-file`). Confirm intent before invoking on the user's behalf — treat these like `rm -rf`.

For frontmatter edits, vault-path discovery, and headless scripts see the Decision guide below and [reference/automation.md](reference/automation.md).

## Output formats

Per-command `format=` support varies — check `obsidian help <command>`:

| Command | Supported formats |
|---|---|
| `search`, `search:context` | `text` (default), `json` |
| `tags`, `tasks`, `unresolved`, `backlinks`, `bookmarks`, `hotkeys`, `plugins` | `tsv` (default), `json`, `csv` |
| `outline` | `tree` (default), `md`, `json` |
| `properties` | `yaml` (default), `json`, `tsv` |
| `base:query` | `json` (default), `csv`, `tsv`, `md`, `paths` |
| `files`, `folders`, `recents`, `templates`, `themes` | plain list — no `format=` |

Prefer `format=json` when piping to `jq` or feeding an agent. Text output is for humans and may change between versions.

## When things go wrong

- **"command not found: obsidian"** — CLI not enabled or not on PATH. Walk through Prerequisites.
- **"installer is out of date"** warning — the app can auto-update but the installer shim cannot. Reinstall from <https://obsidian.md/download>.
- **`which obsidian` points at `/Applications/Obsidian.app/...`** — the CLI shim at `/usr/local/bin/obsidian` is missing. Re-toggle `Settings → General → Command-line interface`.
- **Command hangs** — Obsidian is not running, or is focused on a different vault. Pass `vault="Name"` explicitly in scripts.
- **Template not found** — use `obsidian templates` to see valid names. Do not include `.md`.
- **`format=json` rejected** — that subcommand does not offer JSON; check the table above or run `obsidian help <command>`.
- **Plugin commands fail silently** — run `obsidian dev:errors` to surface the JavaScript error. See [reference/developer.md](reference/developer.md).

## Decision guide

| User says | Do this |
|---|---|
| "add to my daily note" / "log this" | `obsidian daily:append content="..."` |
| "open today's note" | `obsidian daily` |
| "read today's note" | `obsidian daily:read` |
| "find notes about X" | `obsidian search query="X" format=json limit=10` |
| "show me my tasks" | `obsidian tasks daily todo` |
| "list my folders" | `obsidian folders` |
| "list my tags" | `obsidian tags counts` |
| "find broken links" | `obsidian unresolved` |
| "find orphan notes" | `obsidian orphans` |
| "make a new note from template Y" | `obsidian create name="..." template=Y open` |
| "set a tag/status/date on a note" | `obsidian property:set name=... value=... file=...` |
| "run the command X in Obsidian" | `obsidian command id=X` (discover with `obsidian commands`) |
| "reload my plugin" | `obsidian plugin:reload id=<plugin-id>` — see [developer.md](reference/developer.md) |
| "script my vault" / "cron this" | See [automation.md](reference/automation.md) |
| "where is my vault on disk" | `obsidian vault info=path` |

## Security and safety

- `obsidian eval code="..."` executes arbitrary JavaScript in the Obsidian process. Never interpolate untrusted input into `code=`.
- `obsidian command id=...` will run any command in the user's palette, including destructive ones (`app:reload`, `app:quit`, `workspace:close-others`). Confirm before invoking on the user's behalf.
- `daily:append`, `append`, `prepend`, `create`, `delete`, `move`, `rename`, `property:set`, `property:remove` all mutate the vault — verify intent, especially for past-day notes.
- Avoid piping secrets (tokens, passwords) into `content=` or `value=` arguments; command lines are visible in process lists and shell history.

## See also

- [reference/commands.md](reference/commands.md) — complete subcommand reference
- [reference/daily-notes.md](reference/daily-notes.md) — journaling, append, read, path, prepend
- [reference/developer.md](reference/developer.md) — `eval`, `command`, plugin reload, DOM/CSS inspection
- [reference/automation.md](reference/automation.md) — shell scripting, cron, JSON parsing, vault backup
- [examples/workflows.md](examples/workflows.md) — end-to-end recipes
