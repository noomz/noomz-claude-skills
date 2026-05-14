# Automation and Scripting

The `obsidian` CLI is Unix-friendly: exits cleanly, uses `key=value` arguments, and supports JSON output on most query commands. This reference covers patterns for wiring it into shell scripts, cron, launchd, CI, and agent loops.

## Contents
- [Design principles](#design-principles)
- [Getting the vault path](#getting-the-vault-path)
- [JSON output and jq](#json-output-and-jq)
- [Scheduled runs](#scheduled-runs)
- [Ensuring Obsidian is running](#ensuring-obsidian-is-running)
- [Shell pipelines](#shell-pipelines)
- [Vault backup](#vault-backup)
- [Task harvesting](#task-harvesting)
- [Agent and LLM integration](#agent-and-llm-integration)
- [Environment and exit codes](#environment-and-exit-codes)
- [Anti-patterns](#anti-patterns)

## Design principles

1. **Require Obsidian to be running** — most commands proxy into the live app and hang otherwise. Check with `pgrep -qaf Obsidian` before invoking in unattended contexts.
2. **Use `format=json` where available** — plain text is for humans; JSON is stable. Not every command supports it (see [commands.md](commands.md)), so check before building pipelines on text.
3. **Pin the vault** — pass `vault="Name"` when a machine has multiple vaults open, otherwise behavior depends on which window has focus.
4. **Fail loudly** — wrap scripts with `set -euo pipefail` so a failed `obsidian` invocation aborts cleanly.

## Getting the vault path

Stop hardcoding paths. Ask the CLI:

```bash
VAULT=$(obsidian vault info=path)
echo "$VAULT"
# /Users/you/Library/Mobile Documents/iCloud~md~obsidian/Documents/default
```

Also useful:

```bash
obsidian vault info=name
obsidian vault info=size
obsidian vaults verbose              # list every known vault + path
```

## JSON output and jq

Commands with `format=json` support (check [commands.md](commands.md) for the full list):

```bash
# Top 10 tags (default format is tsv, so opt in to json)
obsidian tags counts format=json \
  | jq -r 'sort_by(-.count) | .[0:10] | .[] | "\(.count)\t\(.name)"'

# Unresolved links grouped by source file
obsidian unresolved verbose format=json \
  | jq -r 'group_by(.source) | .[] | "\(.[0].source): \(length) links"'

# Incomplete tasks from a file, with line numbers
obsidian tasks path="Projects/Kadnud.md" todo format=json \
  | jq -r '.[] | "L\(.line): \(.text)"'

# First 5 search hits
obsidian search query="incident response" format=json limit=5 \
  | jq -r '.[].path'
```

The exact JSON schema depends on the command and Obsidian version. If a field doesn't exist in your version, run `obsidian <command> format=json | jq 'first'` to inspect the shape.

## Scheduled runs

### cron (macOS, Linux)

```cron
# Weekday 09:00: add day-plan heading to today's daily note
0 9 * * 1-5 /usr/local/bin/obsidian daily:append content="## Plan for $(date +\%A)"
```

cron escapes `%` as `\%`. cron runs with a minimal PATH — use the absolute path to `obsidian`.

### launchd (macOS)

Use launchd (not cron) when a job should run only while the user is logged in. Create `~/Library/LaunchAgents/md.obsidian.dailyplan.plist` with `ProgramArguments` = `/usr/local/bin/obsidian`, `daily:append`, `content=…`.

### Windows Task Scheduler

Point the task at `obsidian.exe` with arguments. Obsidian must be running; add a login task to launch it first.

## Ensuring Obsidian is running

```bash
# macOS
pgrep -qaf Obsidian || open -ga Obsidian && sleep 3

# Linux (Wayland/X11)
pgrep -qf obsidian || (obsidian >/dev/null 2>&1 &) && sleep 3

# Windows (PowerShell)
if (-not (Get-Process Obsidian -ErrorAction SilentlyContinue)) { Start-Process obsidian.exe }
```

The `sleep 3` gives Obsidian time to bind the CLI socket. Adjust for slow machines.

## Shell pipelines

### Log a git commit to today's daily note

```bash
#!/usr/bin/env bash
set -euo pipefail
msg=$(git log -1 --format='%s')
sha=$(git rev-parse --short HEAD)
obsidian daily:append content="- $(date +%H:%M) $sha $msg"
```

### Yesterday's incomplete tasks

```bash
#!/usr/bin/env bash
set -euo pipefail
yesterday=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d)
obsidian tasks path="Daily/$yesterday.md" todo format=json \
  | jq -r '.[] | "- \(.text)"'
```

### Tag digest

```bash
obsidian tags counts format=json \
  | jq -r 'sort_by(-.count) | .[0:10] | .[] | "\(.name): \(.count)"'
```

### Orphan note report

```bash
obsidian orphans format=json 2>/dev/null \
  || obsidian orphans | head -20
```

## Vault backup

The CLI is **not** a backup tool — use `git` or `rsync`. The vault directory on disk is the source of truth; Obsidian just watches it.

Daily git snapshot:

```bash
#!/usr/bin/env bash
set -euo pipefail
VAULT=$(obsidian vault info=path)
cd "$VAULT"
git add -A
git diff --cached --quiet || git commit -m "vault snapshot $(date -u +%Y-%m-%dT%H:%MZ)"
git push
```

Exclude `.obsidian/workspace.json` (churns constantly, leaks UI state). The vault's `.gitignore` belongs in the vault, not the tooling repo.

## Task harvesting

### Inside a single file

```bash
obsidian tasks path="Projects/Kadnud.md" todo format=json
obsidian tasks active todo verbose
```

### Vault-wide

`tasks` operates per-file. For vault-wide, shell out:

```bash
VAULT=$(obsidian vault info=path)
rg -n '^\s*- \[ \] ' "$VAULT" --glob '*.md' --glob '!.obsidian/'
rg -n '^\s*- \[ \].*#today' "$VAULT" --glob '*.md'
```

For richer querying (due dates, recurrence, custom statuses), install the Obsidian Tasks community plugin and expose its API via `obsidian eval code="..."`.

## Agent and LLM integration

Pattern for feeding vault context to an LLM without dumping everything:

1. **Scope** — `obsidian search query="..." format=json limit=10` returns candidate paths
2. **Read on demand** — `obsidian read path="<hit>"` or `cat "$VAULT/<hit>"` for each selected hit
3. **Write through daily:append** — for capture; avoid direct file edits from an agent because Obsidian may be mid-write
4. **Return structured data** — `format=json` everywhere, so the agent reasons on fields not regex
5. **Use `command id=...`** — over `eval` where possible (self-documenting, safer)

Skeleton:

```bash
#!/usr/bin/env bash
set -euo pipefail
query=${1:?usage: ask.sh "<query>"}
VAULT=$(obsidian vault info=path)

obsidian search query="$query" format=json limit=5 \
  | jq -r '.[].path' \
  | while read -r p; do
      printf '=== %s ===\n' "$p"
      obsidian read path="$p"
      printf '\n\n'
    done
```

## Environment and exit codes

- `obsidian` exits `0` on success, non-zero on error. Use the exit code, don't grep stderr.
- Commands mix diagnostics into stdout in some versions when `format=` is off — another reason to prefer JSON in scripts.
- Some builds honor `OBSIDIAN_VAULT` as a default for `vault=`. Verify with `obsidian help` and set `vault=` explicitly in scripts to avoid surprises.

## Anti-patterns

- **Don't** loop `obsidian eval` over hundreds of items — each call round-trips. Batch inside one `eval` script.
- **Don't** depend on `files` for sort/limit — it has none. Pipe `find -exec stat` if you need time-ordering.
- **Don't** parse text output in long-lived scripts. Switch to `format=json` the second your script has a user.
- **Don't** assume the active vault in cron — scheduled jobs run without a focused window. Pin `vault=` explicitly.
- **Don't** use `daily:append` for destructive changes (e.g., replacing a heading). It only appends; use direct file edits or `command id=X` for the UI equivalent.
- **Don't** use filesystem `find` to discover the vault path — use `obsidian vaults` or `obsidian vault info=path`. `find` is slow and fragile.
- **Don't** pipe `obsidian help` to `head` or `wc` — the CLI doesn't handle SIGPIPE and will hang. Redirect to a file (`obsidian help > /tmp/help.txt`) instead.
