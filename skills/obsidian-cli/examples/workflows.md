# End-to-end Workflows

Concrete recipes that combine `obsidian` commands with shell tools. Each workflow is self-contained — copy, tweak the paths to your vault, and run.

## Contents
- [Morning standup summary](#morning-standup-summary)
- [Git commit → daily note log](#git-commit--daily-note-log)
- [Weekly review digest](#weekly-review-digest)
- [Post-mortem scaffolding](#post-mortem-scaffolding)
- [Broken-link CI check](#broken-link-ci-check)
- [Plugin hot-reload dev loop](#plugin-hot-reload-dev-loop)
- [LLM "what did I write about X" retrieval](#llm-what-did-i-write-about-x-retrieval)

---

## Morning standup summary

Print yesterday's incomplete tasks so you can triage at 09:00.

```bash
#!/usr/bin/env bash
set -euo pipefail

yesterday=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d)
note="Daily/$yesterday.md"

echo "# Carry-over from $yesterday"
obsidian tasks "$note" 2>/dev/null | rg -v '\[x\]' || echo "(no open tasks)"
```

Wire to a launchd agent or a shell alias `standup`.

---

## Git commit → daily note log

Append every commit on the current branch to today's daily note. Put in `.git/hooks/post-commit`:

```bash
#!/usr/bin/env bash
set -euo pipefail
sha=$(git rev-parse --short HEAD)
msg=$(git log -1 --format='%s')
repo=$(basename "$(git rev-parse --show-toplevel)")
obsidian daily:append content="- $(date +%H:%M) [$repo] $sha $msg"
```

`chmod +x .git/hooks/post-commit`. Deploy with your dotfiles or via `git config core.hooksPath`.

---

## Weekly review digest

Generate a Monday-morning digest covering tag activity, top files, and broken links.

```bash
#!/usr/bin/env bash
set -euo pipefail

{
  echo "## Top tags this week"
  obsidian tags counts format=json \
    | jq -r 'sort_by(-.count) | .[0:10] | .[] | "- \(.name): \(.count)"'

  echo ""
  echo "## 10 most recently edited notes"
  obsidian files sort=modified limit=10 format=json \
    | jq -r '.[] | "- [[\(.path | sub("\\.md$"; ""))]]"'

  echo ""
  echo "## Broken links"
  obsidian unresolved format=json \
    | jq -r '.[] | "- \(.source) → \(.target)"' \
    || echo "(none 🎉)"
} | tee /tmp/weekly-review.md

obsidian create name="Weekly review - $(date +%Y-%m-%d)" template=WeeklyReview
# (open the new note in Obsidian, then paste the digest)
```

For full automation, replace the last line with direct file writes to the vault — but respect concurrent editing in Obsidian.

---

## Post-mortem scaffolding

Called by on-call tooling after an incident closes:

```bash
#!/usr/bin/env bash
set -euo pipefail
incident_id=${1:?usage: post-mortem.sh <incident-id>}
title="Post-mortem - $(date +%Y-%m-%d) $incident_id"

obsidian create name="$title" template=PostMortem

# capture relevant runbook output as context
obsidian daily:append content="- Post-mortem: [[$title]] ($incident_id)"
```

Requires a `PostMortem` template in the vault.

---

## Broken-link CI check

Prevent PRs that merge notes with dangling wiki-links. Add to GitHub Actions or a pre-push hook:

```bash
#!/usr/bin/env bash
set -euo pipefail

# requires Obsidian to be running in CI — typically only useful locally or on a
# self-hosted runner with a headless X server. For headless, prefer a static
# linter like obsidian-lint or a small node script that parses the markdown.

count=$(obsidian unresolved format=json | jq 'length')
if [[ "$count" -gt 0 ]]; then
  echo "::error::$count unresolved wiki-link(s) in vault"
  obsidian unresolved format=json | jq -r '.[] | "\(.source): \(.target)"'
  exit 1
fi
```

For true CI (no Obsidian process), swap in a static linter — the CLI is interactive-only on most surfaces.

---

## Plugin hot-reload dev loop

During plugin development, rebuild and hot-reload on every save:

```bash
# package.json
{
  "scripts": {
    "build": "esbuild src/main.ts --bundle --outfile=dist/main.js --external:obsidian --platform=node",
    "dev": "pnpm run build && pnpm run watch",
    "watch": "chokidar 'src/**/*.ts' -c 'pnpm run build && obsidian plugin:reload my-plugin-id'"
  }
}
```

Pair with `obsidian dev:errors` in a second pane:

```bash
watch -n 2 'obsidian dev:errors | tail -10'
```

Iteration latency drops from ~10 seconds (full restart) to under 1 second.

---

## LLM "what did I write about X" retrieval

Feed Obsidian-backed context to an LLM without dumping the whole vault.

```bash
#!/usr/bin/env bash
set -euo pipefail
query=${1:?usage: ask.sh "<query>"}

paths=$(obsidian search query="$query" format=json | jq -r '.[0:5] | .[].path')

{
  echo "Context from Obsidian vault:"
  echo ""
  for f in $paths; do
    printf '### %s\n\n' "$f"
    cat "$VAULT_PATH/$f"
    printf '\n\n'
  done
  printf '\n---\n\nUser query: %s\n' "$query"
} | your-llm-cli
```

Cap results (`.[0:5]`) to keep the prompt small, or score with embeddings before concatenating.

---

## Tips for building your own workflows

- Start interactive in TUI mode, then transcribe the commands into a script once you know the shape.
- Always pass `format=json` for anything that feeds into another tool.
- Wrap Obsidian-dependent scripts with a pre-flight that confirms the app is running and the right vault is focused.
- Keep workflows idempotent where possible — `daily:append` is not, so guard with `rg -qF` before appending.
