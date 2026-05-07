# Daily Notes and Journaling

The `daily*` commands are the fastest way to capture into Obsidian from the terminal. They respect the Daily Notes core plugin (or Periodic Notes community plugin) settings, so folder, filename format, and template are all handled for you.

## Contents
- [Command surface](#command-surface)
- [Opening today's note](#opening-todays-note)
- [Appending and prepending](#appending-and-prepending)
- [Reading today's note](#reading-todays-note)
- [Getting today's note path](#getting-todays-note-path)
- [Timestamped captures](#timestamped-captures)
- [Multi-line entries](#multi-line-entries)
- [Capturing from other tools](#capturing-from-other-tools)
- [Task harvesting](#task-harvesting)
- [Preventing duplicate appends](#preventing-duplicate-appends)
- [Anti-patterns](#anti-patterns)

## Command surface

| Command | Purpose |
|---|---|
| `obsidian daily [paneType=tab\|split\|window]` | Open today's note |
| `obsidian daily:append content=T [inline] [open] [paneType=...]` | Append content |
| `obsidian daily:prepend content=T [inline] [open] [paneType=...]` | Prepend content |
| `obsidian daily:read` | Print today's note contents |
| `obsidian daily:path` | Print today's note absolute path |

`inline` appends without a leading newline. `open` opens the note after the write.

## Opening today's note

```bash
obsidian daily
obsidian daily paneType=split            # open in a split pane
```

Creates the note from the template if it does not exist.

## Appending and prepending

```bash
obsidian daily:append content="- Standup went long"
obsidian daily:prepend content="## Morning summary"
obsidian daily:append content="continued" inline        # no newline before
```

`daily:append` is non-blocking — returns immediately without focusing Obsidian. Content lands at the end of the file (prepend = top). Neither targets a specific heading; for section-aware insertion, use Templater or QuickAdd community plugins.

## Reading today's note

```bash
obsidian daily:read
obsidian daily:read | rg '^- \[ \]'       # incomplete tasks
```

Use this instead of `cat` — you don't have to know where the Daily Notes plugin is configured to store notes.

## Getting today's note path

```bash
TODAY=$(obsidian daily:path)
echo "$TODAY"
# /Users/you/Vault/Daily/2026-04-22.md
```

Useful when you need `cat`, `rg`, or `git` to touch the file directly.

## Timestamped captures

Prepend the time in the shell so entries stay chronological:

```bash
obsidian daily:append content="- $(date +%H:%M) Kicked off migration"
obsidian daily:append content="- $(date -u +%Y-%m-%dT%H:%M:%SZ) event X"
```

On macOS `date` and GNU `date` flags differ — target the platform you run on, or use `gdate` from coreutils.

## Multi-line entries

`content=` accepts newlines. Use `\n` in the quoted string (the CLI interprets it), or use shell newlines directly.

**Escape sequence form (cross-shell):**

```bash
obsidian daily:append content="- Task one\n- Task two\n- Task three"
```

**Literal newlines (bash/zsh):**

```bash
obsidian daily:append content="- Task one
- Task two
- Task three"
```

**fish shell:**

```fish
obsidian daily:append content="- Task one
- Task two
- Task three"
```

Minimal shells in CI may balk at literal newlines — prefer the `\n` form there.

## Capturing from other tools

### From `git`

```bash
obsidian daily:append content="- Shipped $(git log -1 --format='%s') ($(git rev-parse --short HEAD))"
```

### From clipboard

```bash
obsidian daily:append content="- Clip: $(pbpaste)"          # macOS
obsidian daily:append content="- Clip: $(xclip -o)"         # Linux
```

### From a one-off prompt

```bash
read -p "Log entry: " entry && obsidian daily:append content="- $entry"
```

Wrap any of these in a shell function for frictionless capture (`alias log='obsidian daily:append content='` then `log "- quick note"`).

## Task harvesting

List tasks in today's note:

```bash
obsidian tasks daily
obsidian tasks daily todo                    # incomplete only
obsidian tasks daily format=json
obsidian tasks daily format=json todo \
  | jq -r '.[] | "\(.line): \(.text)"'
```

Filter by tag using text tools:

```bash
obsidian tasks daily todo | rg '#urgent'
```

Mark a specific task done (requires path and line from the JSON output):

```bash
obsidian task ref="Daily/2026-04-22.md:17" done
```

## Preventing duplicate appends

`daily:append` has no idempotency guard. Guard in the shell:

```bash
entry="- $(date +%H:%M) deployment ok"
note=$(obsidian daily:path)
if ! rg -qF "$entry" "$note" 2>/dev/null; then
  obsidian daily:append content="$entry"
fi
```

`obsidian daily:path` gets you the exact file path — don't hardcode.

## Anti-patterns

- **Don't** use `daily:append` as a general editor — it can only append/prepend, not replace or edit in place. For edits, open the file in Obsidian or modify it directly on disk (accept the concurrent-write risk).
- **Don't** pass secrets (tokens, passwords) through `content=` — the full command line is visible in process lists and shell history.
- **Don't** assume the file exists after `daily:append` for the same-pipe grep — the creation is async in some versions. Separate the operations, or re-read via `obsidian daily:read`.
