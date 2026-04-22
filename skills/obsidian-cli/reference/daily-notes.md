# Daily Notes and Journaling

The `daily` and `daily:append` commands are the fastest way to capture into Obsidian from the terminal. They respect the Daily Notes or Periodic Notes plugin settings, so folder, filename format, and template are all handled for you.

## Contents
- [Opening today's note](#opening-todays-note)
- [Appending content](#appending-content)
- [Timestamped captures](#timestamped-captures)
- [Multi-line entries](#multi-line-entries)
- [Capturing from other tools](#capturing-from-other-tools)
- [Task harvesting](#task-harvesting)
- [Preventing duplicate appends](#preventing-duplicate-appends)

## Opening today's note

```bash
obsidian daily
```

Opens today's daily note in the UI, creating it from the template if needed. Use this when the user wants to read or edit the note, not just append.

## Appending content

```bash
obsidian daily:append content="- Standup went long"
```

- Non-blocking — returns immediately without switching focus to Obsidian
- Creates today's note (with template applied) if it does not exist yet
- Appends to the end of the file; does not choose a specific section

For section-aware appends (e.g., always append under a `## Log` heading), use Obsidian's Templater or QuickAdd community plugins instead — the CLI appends literally.

## Timestamped captures

Prepend the time in the shell so every entry is chronological:

```bash
obsidian daily:append content="- $(date +%H:%M) Kicked off migration"
```

For ISO timestamps:

```bash
obsidian daily:append content="- $(date -u +%Y-%m-%dT%H:%M:%SZ) event X"
```

On macOS, `date` and GNU `date` flags differ — write scripts with the flags matching the target platform, or use `gdate` from coreutils.

## Multi-line entries

`content=` accepts newlines. In Bash:

```bash
obsidian daily:append content="$(printf -- '- Task one\n- Task two\n- Task three')"
```

In fish shell:

```fish
obsidian daily:append content="- Task one
- Task two
- Task three"
```

Quote carefully — unescaped newlines inside a command substitution work in most shells, but CI runners with minimal shells may need `printf`.

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

Wire any of these into a shell alias or function for frictionless capture.

## Task harvesting

List tasks from today's daily note:

```bash
obsidian tasks daily
```

Filter to incomplete urgent tasks:

```bash
obsidian tasks daily | rg '^\s*- \[ \].*#urgent'
```

Harvest tasks from a specific project note:

```bash
obsidian tasks "Projects/Kadnud.md"
```

Combine with shell pipelines to produce a standup summary, build a Slack message, or feed another tool.

## Preventing duplicate appends

`daily:append` has no idempotency guard — the same content appended twice lands in the file twice. When scripting, de-dupe in the shell first:

```bash
entry="- $(date +%H:%M) deployment ok"
if ! rg -qF "$entry" "$VAULT/Daily/$(date +%Y-%m-%d).md" 2>/dev/null; then
  obsidian daily:append content="$entry"
fi
```

`$VAULT` should be the absolute path to the vault. If you do not know it, run `obsidian files limit=1` once interactively to confirm, or capture it from Obsidian's settings.

## Anti-patterns

- **Don't** use `daily:append` as a general note editor — it can only append, not edit. Use `obsidian daily` (UI) or direct file edits for that.
- **Don't** append sensitive content (tokens, passwords) via `content=` — the full command line lands in shell history and `ps` output.
- **Don't** assume the note exists for downstream tools; `obsidian daily:append` creates it on demand, but subsequent `cat` or `grep` against the file path will fail if the creation is racing another process.
