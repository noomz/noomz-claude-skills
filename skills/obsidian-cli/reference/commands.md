# Obsidian CLI — Full Command Reference

## Contents
- [Argument syntax](#argument-syntax)
- [File commands](#file-commands)
- [Search](#search)
- [Daily notes](#daily-notes)
- [Tasks](#tasks)
- [Tags](#tags)
- [Linking and integrity](#linking-and-integrity)
- [Meta commands](#meta-commands)
- [TUI mode](#tui-mode)

## Argument syntax

Obsidian CLI uses `key=value` syntax — not POSIX short/long flags. Values with spaces must be quoted.

```bash
obsidian search query="design review" vault="work" format=json
```

Boolean-ish switches use standalone flag form where documented (e.g., `--copy` on `files`).

## File commands

### `obsidian read`

Prints the contents of the currently-focused file in the running Obsidian app to stdout.

```bash
obsidian read
obsidian read > /tmp/current.md       # pipe the active note
```

Requires a file to be open in Obsidian. Does not accept a path argument — use shell tools (`cat`, `bat`) to read an arbitrary file by absolute path.

### `obsidian create`

Creates a new note, optionally from a template.

```bash
obsidian create name="Meeting - 2026-04-22"
obsidian create name="Post-mortem - outage" template=PostMortem
```

- `name=` — the note title (no `.md` suffix needed)
- `template=` — the template name as it appears in the vault's configured templates folder. Missing templates cause the command to fail.
- `vault=` — target a specific vault when multiple are open

### `obsidian files`

Lists files in the vault. Supports sorting, limiting, and clipboard output.

```bash
obsidian files                         # all files
obsidian files sort=modified limit=10  # 10 most recently modified
obsidian files sort=created limit=5 --copy   # copy list to clipboard
```

Useful arguments:
- `sort=modified|created|name` — sort order
- `limit=N` — cap the output
- `--copy` — copy result to system clipboard instead of printing
- `format=json` — machine-readable output (where supported)

### `obsidian diff`

Compares two versions of a file (requires Obsidian's file-recovery or version-history plugin to be active for historical versions).

```bash
obsidian diff file="Projects/Kadnud" from=yesterday to=today
```

- `file=` — path relative to the vault root
- `from=`, `to=` — version identifiers. Obsidian accepts relative keywords (`today`, `yesterday`) and ISO dates depending on plugin support.

## Search

### `obsidian search`

Full-text search across the active vault.

```bash
obsidian search query="incident response"
obsidian search query="#retro" format=json
obsidian search query="TODO" vault="work" format=json \
  | jq -r '.[] | "\(.path):\(.line) \(.text)"'
```

Arguments:
- `query=` — any search expression Obsidian's search bar accepts (operators like `tag:`, `path:`, `file:` work)
- `vault=` — restrict to a specific vault name
- `format=json` — structured output suitable for `jq`

The JSON schema for each result typically includes `path`, `line`, and `text`. Fall back to parsing plain text if `format=json` is rejected on older Obsidian versions.

## Daily notes

### `obsidian daily`

Opens today's daily note in the UI, creating it from the configured daily-note template if it does not exist yet.

```bash
obsidian daily
```

Honors the Daily Notes core plugin (or Periodic Notes community plugin) settings for folder, date format, and template.

### `obsidian daily:append`

Appends content to today's daily note without focusing the UI. Ideal for quick capture and automation.

```bash
obsidian daily:append content="- 09:15 Started standup notes"
obsidian daily:append content="- $(date +%H:%M) Deployed $(git rev-parse --short HEAD)"
```

See [daily-notes.md](daily-notes.md) for capture patterns.

## Tasks

### `obsidian tasks`

Lists tasks (`- [ ] ...` lines) from a specific note.

```bash
obsidian tasks daily            # today's daily note
obsidian tasks "Projects/API.md"
```

Combine with `rg`, `grep`, or `awk` to filter:

```bash
obsidian tasks daily | rg '#urgent'
obsidian tasks daily | awk '/\[ \]/'    # only incomplete
```

If the installed Obsidian version supports `format=json` for tasks, each object typically includes `text`, `file`, `line`, `checked`, and any inline tags.

## Tags

### `obsidian tags counts`

Lists every tag in the vault with its occurrence count.

```bash
obsidian tags counts
obsidian tags counts format=json | jq 'sort_by(.count) | reverse | .[0:10]'
```

Use this to answer "what do I write about most" or to audit for typos (`#kubernetes` vs `#k8s`).

## Linking and integrity

### `obsidian unresolved`

Lists internal wiki-links (`[[Note]]`) that point to non-existent notes.

```bash
obsidian unresolved
obsidian unresolved format=json \
  | jq -r '.[] | "\(.source) → \(.target)"'
```

Each entry typically has `source` (the note containing the link) and `target` (the missing note name). Use in CI or pre-commit hooks to catch broken references before publishing.

## Meta commands

### `obsidian help`

Prints usage information. Append a subcommand to drill in:

```bash
obsidian help
obsidian help search
obsidian help daily:append
```

Treat `obsidian help <cmd>` as the source of truth when the Obsidian version on the user's machine differs from these docs.

### `obsidian` (no arguments)

Launches the interactive TUI — see [TUI mode](#tui-mode).

## TUI mode

Running `obsidian` bare opens a REPL with autocomplete against the full command surface.

| Key | Action |
|---|---|
| `Tab` | Accept autocomplete |
| `Ctrl+A` / `Ctrl+E` | Start / end of line |
| `Ctrl+U` / `Ctrl+K` | Delete to start / end |
| `Ctrl+R` | Reverse history search |
| `Ctrl+C` | Exit |

TUI mode is best for interactive exploration; scripts should use one-shot invocations for reproducibility.
