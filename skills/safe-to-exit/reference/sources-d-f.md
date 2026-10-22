# Sources D, E and F — running processes, waiting PRs, repo memory

The exact blocks for the last three sources of Step 1, with the reasoning behind each. Substitute the literal root from Step 0.5 for `/abs/path/to/root`; each fenced block runs in its own shell.

## Source D — what keeps running after you leave

Two halves, and the second is the one people forget.

**Processes on this machine:**

```bash
pgrep -fl 'vite|webpack|next dev|nodemon|jest --watch|vitest|tsc -w|ng serve|rails s|flask run|uvicorn|docker compose up|ngrok' 2>/dev/null | head -20
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR==1 || /node|python|ruby|java|deno|bun/' | head -20
tmux ls 2>/dev/null
ls -1 /abs/path/to/root/.omc/state 2>/dev/null
exit 0     # `ls` on a missing dir exits 1; without this the source reads as failed
```

**Agents and loops — not visible to any shell command.** A subagent you spawned keeps running, keeps spending budget, and can still write files into the repo after the dev has stopped watching. Check all four:

- **This conversation.** Every agent you spawned should have a completion notification. One without a matching notification is still running — say so by name. Never predict what it will return.
- **`ListAgents`** — enumerates addressable subagents and sessions.
- **`TaskList`** (deferred; load with `ToolSearch`) — harness-tracked background tasks and shells.
- **Loops and schedules** — an active `/loop`, a `ralph`/`autopilot`/`ultragoal` mode under `.omc/state/`, a `CronList` routine, or an armed artifact watch will all wake this session up after the dev leaves.

A running agent or an active loop is a **blocker**, not a note. Everything else in this skill concerns work that sits still; this is the only category that changes the repo while nobody is looking.

## Source E — what waits on someone else

```bash
cd /abs/path/to/root || exit 1
gh auth status 2>&1 | head -6      # READ it; never run gh auth switch
find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort |
while IFS= read -r r; do
  git -C "$r" remote get-url origin 2>/dev/null | grep -q github.com || { echo "== $r (no github remote, skipped)"; continue; }
  echo "== $r"
  ( cd "$r" || exit 0
    gh pr list --author '@me' --state open --limit 30 \
      --json number,title,isDraft,reviewDecision,mergeStateStatus \
      --template '{{range .}}  mine  #{{.number}} {{.title}} [{{if .reviewDecision}}{{.reviewDecision}}{{else}}no-review{{end}}]{{if .isDraft}} DRAFT{{end}} {{.mergeStateStatus}}{{"\n"}}{{end}}' 2>&1
    gh pr list --search 'review-requested:@me' --state open --limit 20 \
      --json number,title \
      --template '{{range .}}  waiting-on-you  #{{.number}} {{.title}}{{"\n"}}{{end}}' 2>&1 )
done
exit 0
```

`no-review` means nobody has looked yet — it is not an approval, and it must never print as an empty bracket. Repos with a non-GitHub remote are skipped by the guard; **name them**, because their open work is invisible to this source.

**Empty `gh` output means "the repos I could query are clean", never "nothing is pending."** If `gh auth status` shows an account that cannot see these repos, every listing comes back empty and reads as clean. When the identity looks wrong, say so and tag the whole section `[unverified]`.

## Source F — where this repo keeps its memory

Sources A and B see what git can see **from this repo**. They miss two things, and both are where a repo's actual knowledge lives: paths the repo ignores on purpose, and repos nested inside those paths. Ignored is not the same as unimportant — it is frequently the opposite.

Do not guess store names. A fixed list of `docs/kb`, `.planning`, `wiki` fits one repo's habits and silently reports nothing for the next. Ask git what this repo ignores, then ask what the repo says about why.

```bash
cd /abs/path/to/root || exit 1
NOISE='(node_modules|__pycache__|[.]venv|venv|dist|build|target|[.]next|[.]pytest_cache|[.]ruff_cache|[.]mypy_cache|[.]gradle|[.]idea|[.]vscode)/|[.]DS_Store|[.]pyc$|[.]log$'

# What does this repo SAY stays local? Its own words. Keep the match, not the
# first 160 characters of a paragraph that happens to contain it.
grep -nE '^[[:space:]]*#' .gitignore 2>/dev/null | grep -iE 'commit|track|local|secret|credential|export|share' | head -6
for f in CLAUDE.md AGENTS.md CONTRIBUTING.md; do
  [ -f "$f" ] && grep -inoE ".{0,60}(never commit|do not commit|stays? (local|untracked)|not tracked|deliberately untracked).{0,60}" "$f" 2>/dev/null | head -3 | sed "s|^|$f:|"
done

# probe_repo <path> — grade any repo like a repo. Used for repos found at or
# under an ignored path AND under an untracked one.
probe_repo() {
  g=$1
  if ! git -C "$g" rev-parse --verify -q HEAD >/dev/null 2>&1; then
    printf 'NESTED-REPO %s [no commits yet] dirty:%s\n' "$g" \
      "$(git -C "$g" status --porcelain 2>/dev/null | grep -c .)"
    return
  fi
  un=$(git -C "$g" rev-list --count HEAD --not --remotes 2>/dev/null)
  dy=$(git -C "$g" status --porcelain 2>/dev/null | grep -c .)
  [ "${un:-0}" -eq 0 ] && [ "$dy" -eq 0 ] && return    # clean and pushed is not a finding
  up=$(git -C "$g" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '(none)')
  printf 'NESTED-REPO %s [%s] upstream:%s unpushed:%s dirty:%s\n' "$g" \
    "$(git -C "$g" rev-parse --abbrev-ref HEAD 2>/dev/null)" "$up" "${un:-0}" "$dy"
  # Only a repo with NO remote needs an export path — for one that can be
  # pushed, push IS the durable path, and every ordinary code project would
  # otherwise advertise its build script as the workspace's way out.
  [ "$up" = "(none)" ] || return
  find "$g" -maxdepth 3 -type f \( -name 'export*' -o -name '*publish*' -o -name '*share*' \) \
    \( -perm -u+x -o -name '*.py' -o -name '*.sh' -o -name '*.rb' \) \
    2>/dev/null | grep -v __pycache__ | head -2 | sed 's|^|  durable-path? |'
}

# Both halves can reach the same repo (an ignored store under a tracked
# parent). Dedupe so one finding prints once.
{
# Ignored paths, straight from git. No list of names.
git status --porcelain --ignored 2>/dev/null | awk '$1=="!!"{$1="";sub(/^ /,"");print}' |
  tr -d '"' | grep -Ev "$NOISE" |
while IFS= read -r p; do
  case "$p" in */) ;; *) continue ;; esac
  # A repo may sit AT the ignored path or BELOW it. A single "$p.git" test only
  # ever catches the first, and the second is invisible to every other source.
  find "$p" -maxdepth 3 -type d -name .git 2>/dev/null | sed 's|/\.git$||' |
    while IFS= read -r g; do probe_repo "$g"; done
  # If the ignored path IS a repo, probe_repo already said everything that
  # matters, durable path included. A store line on top just repeats it.
  [ -d "${p}.git" ] && continue
  # Text written today, excluding .git internals. Files inside a nested repo
  # reported above are still counted here — double-reporting, not a miss.
  # Knowledge is text; counting every file makes a cache look like the
  # busiest store in the workspace.
  fresh=$(find "$p" -type f -mtime -1 -not -path '*/.git/*' \
            \( -name '*.md' -o -name '*.txt' -o -name '*.rst' -o -name '*.adoc' \) 2>/dev/null | grep -c .)
  [ "$fresh" -eq 0 ] && continue
  printf 'IGNORED-STORE %s text-today:%s text-predating:%s\n' "$p" "$fresh" \
    "$(find "$p" -type f -mtime +1 -not -path '*/.git/*' \
         \( -name '*.md' -o -name '*.txt' -o -name '*.rst' -o -name '*.adoc' \) 2>/dev/null | grep -c .)"
  # A durable path must be runnable — a file called export-2025.csv is not one.
  find "$p" -maxdepth 3 -type f \( -name 'export*' -o -name '*publish*' -o -name '*share*' \) \
    \( -perm -u+x -o -name '*.py' -o -name '*.sh' -o -name '*.rb' \) \
    2>/dev/null | grep -v __pycache__ | head -2 | sed 's|^|  durable-path? |'
done

# Untracked-but-not-ignored directories nothing has ever tracked.
git status --porcelain 2>/dev/null | awk '$1=="??"{$1="";sub(/^ /,"");sub(/\/.*/,"/");print}' |
  tr -d '"' | sort -u | grep -Ev "$NOISE" |
while IFS= read -r d; do
  case "$d" in */) ;; *) continue ;; esac
  find "$d" -maxdepth 3 -type d -name .git 2>/dev/null | sed 's|/\.git$||' |
    while IFS= read -r g; do probe_repo "$g"; done
  [ -d "${d}.git" ] && continue      # a whole checkout, not a knowledge store
  t=$(git ls-files "$d" 2>/dev/null | grep -c .)
  [ "$t" -gt 0 ] && continue
  printf 'LOCAL-BY-CONVENTION %s tracked:%s ondisk:%s predating:%s\n' "$d" "$t" \
    "$(find "$d" -type f -not -path '*/.git/*' 2>/dev/null | grep -c .)" \
    "$(find "$d" -type f -mtime +1 -not -path '*/.git/*' 2>/dev/null | grep -c .)"
done
} | awk '!seen[$0]++'
exit 0
```

**`NESTED-REPO` is the one to read first.** A repo inside an ignored or untracked path is invisible to every other source, so its own `upstream`/`unpushed`/`dirty` numbers are the only evidence there is — measured, `docs/kb` came back `upstream:(none) unpushed:29 dirty:13` while every other source called that workspace clean. Quote the repo's own words — the `.gitignore` comment or `CLAUDE.md` line the grep found — whenever you report a store. What the three findings mean, why a name list was the wrong instrument, and a worked example are in [reference/repo-conventions.md](repo-conventions.md).
