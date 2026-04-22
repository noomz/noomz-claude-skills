# End-to-end Workflows

Concrete recipes that combine real `obsidian` commands with shell tools. Copy, adjust, run.

## Contents
- [Morning standup summary](#morning-standup-summary)
- [Git commit → daily note log](#git-commit--daily-note-log)
- [Weekly review digest](#weekly-review-digest)
- [Post-mortem scaffolding](#post-mortem-scaffolding)
- [Broken-link pre-push check](#broken-link-pre-push-check)
- [Plugin hot-reload dev loop](#plugin-hot-reload-dev-loop)
- [LLM "what did I write about X" retrieval](#llm-what-did-i-write-about-x-retrieval)
- [Bulk frontmatter update](#bulk-frontmatter-update)
- [Tips](#tips)

---

## Morning standup summary

Yesterday's open tasks, JSON-shaped:

```bash
#!/usr/bin/env bash
set -euo pipefail

yesterday=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d 'yesterday' +%Y-%m-%d)

echo "# Carry-over from $yesterday"
obsidian tasks path="Daily/$yesterday.md" todo format=json 2>/dev/null \
  | jq -r '.[] | "- \(.text)"' \
  || echo "(no open tasks)"
```

Wire to a launchd agent or a shell alias `standup`.

---

## Git commit → daily note log

Append every commit to today's daily note. Put in `.git/hooks/post-commit`:

```bash
#!/usr/bin/env bash
set -euo pipefail
sha=$(git rev-parse --short HEAD)
msg=$(git log -1 --format='%s')
repo=$(basename "$(git rev-parse --show-toplevel)")
obsidian daily:append content="- $(date +%H:%M) [$repo] $sha $msg"
```

`chmod +x .git/hooks/post-commit`. Deploy via dotfiles or `git config --global core.hooksPath`.

---

## Weekly review digest

Tag activity + top-modified notes + broken links, rolled into a Monday-morning digest.

```bash
#!/usr/bin/env bash
set -euo pipefail
VAULT=$(obsidian vault info=path)

{
  echo "## Top tags"
  obsidian tags counts format=json \
    | jq -r 'sort_by(-.count) | .[0:10] | .[] | "- \(.name): \(.count)"'

  echo ""
  echo "## 10 most recently modified notes"
  find "$VAULT" -name '*.md' -not -path '*/.obsidian/*' -type f \
    -exec stat -f '%m %N' {} + \
    | sort -rn | head -10 \
    | awk -v v="$VAULT/" '{ sub(v, "", $2); print "- [[" $2 "]]" }'

  echo ""
  echo "## Broken links"
  obsidian unresolved verbose format=json \
    | jq -r '.[] | "- \(.source) → \(.target)"' \
    || echo "(none 🎉)"
} | tee /tmp/weekly-review.md

obsidian create name="Weekly review - $(date +%Y-%m-%d)" template=WeeklyReview open
```

Tweak `-exec stat -f '%m %N'` to `-printf '%T@ %p\n'` on GNU coreutils (Linux).

---

## Post-mortem scaffolding

Called by on-call tooling when an incident closes:

```bash
#!/usr/bin/env bash
set -euo pipefail
incident_id=${1:?usage: post-mortem.sh <incident-id>}
title="Post-mortem - $(date +%Y-%m-%d) $incident_id"

obsidian create name="$title" template=PostMortem open
obsidian daily:append content="- Post-mortem: [[$title]] ($incident_id)"
```

Requires a `PostMortem` template in the vault's configured templates folder.

---

## Broken-link pre-push check

```bash
#!/usr/bin/env bash
set -euo pipefail

# must run on a machine with Obsidian open — CLI proxies into the live app.
# in headless CI, use a static linter (e.g. obsidian-lint) instead.

count=$(obsidian unresolved format=json | jq 'length')
if [[ "$count" -gt 0 ]]; then
  echo "error: $count unresolved wiki-link(s):" >&2
  obsidian unresolved verbose format=json \
    | jq -r '.[] | "  \(.source) → \(.target)"' >&2
  exit 1
fi
```

Install as `.git/hooks/pre-push`.

---

## Plugin hot-reload dev loop

```json
{
  "scripts": {
    "build": "esbuild src/main.ts --bundle --outfile=dist/main.js --external:obsidian --platform=node",
    "reload": "obsidian plugin:reload id=my-plugin-id",
    "dev": "esbuild --watch src/main.ts --bundle --outfile=dist/main.js --external:obsidian --platform=node",
    "dev:reload": "chokidar 'dist/main.js' -c 'obsidian plugin:reload id=my-plugin-id'"
  }
}
```

Run `pnpm dev` in one pane and `pnpm dev:reload` in another. Add a third pane for errors:

```bash
watch -n 2 'obsidian dev:errors | tail -10'
```

Iteration drops from ~10s (full restart) to under 1s.

---

## LLM "what did I write about X" retrieval

Feed a targeted slice of the vault to an LLM.

```bash
#!/usr/bin/env bash
set -euo pipefail
query=${1:?usage: ask.sh "<query>"}

{
  echo "Context from Obsidian vault:"
  echo ""
  obsidian search query="$query" format=json limit=5 \
    | jq -r '.[].path' \
    | while read -r p; do
        printf '### %s\n\n' "$p"
        obsidian read path="$p"
        printf '\n\n'
      done
  printf '\n---\n\nUser query: %s\n' "$query"
} | your-llm-cli
```

Cap hits (`limit=5`) or rank with embeddings before concatenating to keep the prompt small.

---

## Bulk frontmatter update

Add `reviewed: true` to every note in a folder:

```bash
#!/usr/bin/env bash
set -euo pipefail
VAULT=$(obsidian vault info=path)

obsidian files folder="Reviews" \
  | while read -r p; do
      obsidian property:set name=reviewed value=true type=checkbox path="$p"
    done
```

For typed values, match the type: `list`, `number`, `date`, `datetime`, `checkbox`, or `text`.

---

## Tips

- Start interactive: run `obsidian help <category>` and try one-liners before wiring them into scripts.
- Always `format=json` on anything piped to another tool. Default formats vary (tsv for tags/unresolved, text for search/tasks, yaml for properties).
- Wrap any Obsidian-dependent script with a pre-flight that confirms `pgrep -qaf Obsidian` and the active vault matches `obsidian vault info=name`.
- Keep workflows idempotent. `daily:append` and `append` are not — guard with `rg -qF` against `obsidian daily:path` output before writing.
- Prefer `obsidian command id=...` over `obsidian eval code=...` when an equivalent command exists — safer and self-documenting.
