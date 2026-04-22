# Automation and Scripting

The `obsidian` CLI is Unix-friendly: it exits cleanly, takes stdin-free arguments, and supports JSON output on the commands you most want to pipe. This reference covers the patterns that matter when wiring Obsidian into shell scripts, cron jobs, CI, and agent loops.

## Contents
- [Design principles](#design-principles)
- [JSON output and `jq`](#json-output-and-jq)
- [Scheduled runs](#scheduled-runs)
- [Shell pipelines](#shell-pipelines)
- [Vault backup](#vault-backup)
- [Task harvesting](#task-harvesting)
- [Agent and LLM integration](#agent-and-llm-integration)
- [Environment and exit codes](#environment-and-exit-codes)

## Design principles

When scripting Obsidian:

1. **Require Obsidian to be running** — most commands proxy into the live app and hang if it is not. Check with `pgrep -f Obsidian` before invoking in unattended contexts.
2. **Prefer `format=json`** — plain-text output is for humans; JSON is contract-stable across versions.
3. **Pin the vault** — pass `vault="Name"` when a machine has multiple vaults open, otherwise behavior depends on which window has focus.
4. **Fail loudly** — wrap scripts with `set -euo pipefail` so a failed `obsidian` invocation aborts the pipeline instead of silently skipping steps.

## JSON output and `jq`

Append `format=json` wherever supported, then parse with `jq`:

```bash
# 10 most recently modified files
obsidian files sort=modified limit=10 format=json \
  | jq -r '.[].path'

# tag histogram as tab-separated for awk
obsidian tags counts format=json \
  | jq -r '.[] | "\(.count)\t\(.name)"'

# all unresolved links grouped by source file
obsidian unresolved format=json \
  | jq -r 'group_by(.source) | .[] | "\(.[0].source): \(map(.target) | join(", "))"'
```

If `format=json` is rejected (older Obsidian), fall back to parsing text with `awk` / `rg` and pin the minimum Obsidian version in your script's README.

## Scheduled runs

### cron (macOS, Linux)

```cron
# Every weekday at 09:00, append the day's plan to the daily note
0 9 * * 1-5 /usr/local/bin/obsidian daily:append content="## Plan for $(date +\%A)"
```

cron escapes `%` as `\%`. Confirm cron can see `obsidian` on its PATH — cron uses a minimal environment, so prefer absolute paths.

### launchd (macOS)

Use `launchd` instead of cron when you need the job to run only while the user is logged in (cron on macOS runs regardless). Create `~/Library/LaunchAgents/md.obsidian.dailyplan.plist` with a `ProgramArguments` array pointing at `/usr/local/bin/obsidian` and its args.

### Windows Task Scheduler

Call `obsidian.exe` directly with arguments through the Task Scheduler UI or `schtasks` CLI. Obsidian must be running — use a startup task to launch Obsidian at login first.

### Ensuring Obsidian is running

```bash
# macOS
pgrep -qaf Obsidian || open -ga Obsidian && sleep 3

# Linux (Wayland/X11)
pgrep -qf obsidian || obsidian --background &

# Windows (PowerShell)
if (-not (Get-Process Obsidian -ErrorAction SilentlyContinue)) { Start-Process obsidian.exe }
```

Then run your `obsidian <command>` invocation.

## Shell pipelines

### Log a git commit into today's daily note

```bash
#!/usr/bin/env bash
set -euo pipefail
msg=$(git log -1 --format='%s')
sha=$(git rev-parse --short HEAD)
obsidian daily:append content="- $(date +%H:%M) $sha $msg"
```

### Morning standup from yesterday's tasks

```bash
#!/usr/bin/env bash
set -euo pipefail
yesterday=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d)
obsidian tasks "Daily/$yesterday.md" | rg -v '\[x\]'
```

### Weekly tag digest

```bash
obsidian tags counts format=json \
  | jq -r 'sort_by(-.count) | .[0:10] | .[] | "\(.name): \(.count)"'
```

## Vault backup

The CLI is **not** a backup tool — use `git`, `rsync`, or a proper backup system for that. The vault directory on disk is the source of truth; Obsidian just watches it.

Recommended pattern: commit the vault to a private Git repo with a daily cron job.

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$VAULT_PATH"
git add -A
git diff --cached --quiet || git commit -m "vault snapshot $(date -u +%Y-%m-%dT%H:%MZ)"
git push
```

Exclude `.obsidian/workspace.json` from commits — it churns constantly and leaks UI state.

## Task harvesting

### All open tasks across the vault

Obsidian's `tasks` subcommand targets a single file. For vault-wide harvest, combine with `files` or use `rg` directly:

```bash
rg -n '^\s*- \[ \]' "$VAULT_PATH" --glob '*.md' --glob '!.obsidian/'
```

### Tasks tagged `#today`

```bash
rg -n '^\s*- \[ \].*#today' "$VAULT_PATH" --glob '*.md'
```

For richer querying (due dates, recurrence), prefer the Obsidian Tasks community plugin and use `obsidian eval` to call its API.

## Agent and LLM integration

When an agent needs to reason over vault contents:

1. **Scope first** — don't dump the whole vault into context. Use `obsidian search query="..."` with `format=json` to get a candidate file list.
2. **Read on demand** — for each candidate, `cat` the file (via vault path) or `obsidian read` (if it is the active file) to pull contents.
3. **Write through `daily:append`** — for capture. Avoid directly editing note files from an agent unless the user has opted in, because Obsidian may be editing them concurrently.
4. **Return structured data** — use `format=json` everywhere so the agent can reason structurally rather than regex-ing loose text.

Example shape:

```bash
obsidian search query="$QUERY" format=json \
  | jq -r '.[].path' \
  | head -5 \
  | while read -r f; do
      echo "=== $f ==="
      cat "$VAULT_PATH/$f"
    done
```

## Environment and exit codes

- `obsidian` exits `0` on success, non-zero on error. Use the exit code in scripts rather than grepping stderr.
- Some commands print errors to stdout mixed with results when `format=json` is off — another reason to prefer JSON.
- The CLI respects the `OBSIDIAN_VAULT` environment variable on some platforms/versions as a default for `vault=`. Verify with `obsidian help` on the target system; set it explicitly in scripts to avoid surprises.

## Anti-patterns

- **Don't** loop `obsidian eval` over hundreds of items — each call round-trips to the app. Batch the logic inside a single `eval` script.
- **Don't** parse human-readable output from long-term scripts. Switch to `format=json` before the script has three users.
- **Don't** assume the active vault in cron — scheduled jobs run with no user interaction, so the most-recently-focused vault rule doesn't apply predictably. Always pass `vault=`.
