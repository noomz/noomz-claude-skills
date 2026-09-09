---
name: safe-to-exit
description: Verifies a working session can be ended safely and, when asked, makes it safe. Audits git state (uncommitted edits, unpushed commits, branches with no upstream, stashes, an interrupted rebase or merge), secrets and scratch files about to be committed, unfinished-work markers (unchecked boxes in planning notes, new TODO/FIXME/skipped-test lines this session added), still-running dev servers, subagents and loop modes that keep working after you leave, and pull requests waiting on you. Prints one verdict — SAFE, SAFE WITH NOTES, or NOT SAFE — with the exact command that clears each blocker. Trigger on "is it safe to end this session", "/safe-to-exit", "anything left before I quit", "wrapping up", "done for the day", "can I close this", "shutting down", "end of session check", or before the user ends a long working session. Read-only by default; mutates nothing until the user asks to secure the session, then one remedy at a time with a go-ahead for each.
allowed-tools: Bash(git status:*), Bash(git log:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git diff:*), Bash(git stash list:*), Bash(git ls-files:*), Bash(git remote get-url:*), Bash(git check-ignore:*), Bash(git shortlog:*), Bash(gh auth status:*), Bash(gh pr list:*), Bash(gh pr view:*), Bash(grep:*), Bash(find:*), Bash(awk:*), Bash(ls:*), Bash(date:*), Bash(head:*), Bash(sort:*), Bash(wc:*), Bash(pgrep:*), Bash(lsof:*), Bash(tmux ls:*)
---

# Safe To Exit

> Hand on the light switch.
> What did I leave burning?

## Role

You are the last check before the dev walks away. You find what would be lost, leaked, or left running, and you say plainly whether it is safe to stop. You do not finish their work, and you do not tidy anything on your own initiative.

This is the bookend to a morning recap: everything you flag here is what tomorrow's blank brain will have to reconstruct.

## Step 0 — pick the mode, and keep the two apart

There is a real tension in this skill: the dev asks "is it safe to end?" but usually means "make it safe to end." Both are legitimate. They are not the same act, and collapsing them is how an exit check becomes the thing that loses work.

| Mode | Trigger | What it may do |
|---|---|---|
| **check** (default) | Any trigger phrase. Always runs first. | Read-only. Reports findings and prints the command that fixes each one. Changes nothing. |
| **secure** | The dev says "make it safe", "yes do it", "clean it up", or names a specific remedy after seeing the readout. | Applies remedies one at a time. Each command is printed, then you stop and wait for a go-ahead before running it. See [reference/remediation.md](reference/remediation.md). |

Two rules hold the line:

- **Secure never runs without a check readout already on screen.** The dev has to see what is about to be touched. A remedy chosen from an unseen audit is a guess.
- **"Make it safe" is a mode, not a blank cheque.** It authorises the safe ladder in the remediation file. It does not authorise anything on that file's banned list, ever, no matter how it is phrased.

Say which mode you ran in the readout header.

## Step 0.5 — resolve scope and session facts

Nothing below is hardcoded. Resolve once, print it, reuse it.

```bash
WS=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$WS" || exit 1
# Did `git rev-parse` actually resolve, or did we fall back to `pwd`? These are
# very different situations and the fallback is the one that goes wrong.
INREPO=$(git rev-parse --is-inside-work-tree 2>/dev/null || echo false)
echo "root:   $WS"
echo "inrepo: $INREPO"
echo "now:    $(date '+%F %H:%M')"
REPOS=$(find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort)
echo "repos:  $(printf '%s\n' "$REPOS" | grep -c .)"
printf '%s\n' "$REPOS" | head -20
```

**Stop here and read the count before running anything else.** Scope is settled first, every time — the gate is the repo count at the resolved root, not whether you walked upward to find them.

| `inrepo` | repos | What to do |
|---|---|---|
| `true` | 1 | Proceed. This is the ordinary case and needs no question. |
| `true` | more than 1 | Nested repos or submodules below this one. Ask before including them. |
| `false` | 1 or more | **`git rev-parse` failed and the root fell back to `pwd`.** You are sitting in a workspace parent, not a project. Ask; never sweep. |
| either | 0 | Not a git repo and none below it. Say so and stop — sources A, B, C and E would all return empty and read as a clean bill of health. |

When you have to ask, offer these three and wait:

- **this session's writes only** — the repos holding files you actually created or edited this session. Usually what the dev means, and the cheapest. There is no single command for it: take the paths this session wrote, resolve each to its repo with `git -C <dir> rev-parse --show-toplevel`, and run the sources once per distinct root.
- **one named repo** — they name it.
- **all N** — an explicit, informed sweep.

**Why this is a hard gate rather than a judgement call.** Launched from a directory that is not itself a repo — `~/Projects`, `~/work`, any workspace parent — `git rev-parse --show-toplevel` fails, `WS` becomes `pwd`, and every project underneath is a legitimate `find` hit. Measured: 19 repos, five sources each, and the dev interrupted the run before any verdict appeared. An exit check that has to be interrupted has failed completely — it produced no answer at all, at the one moment its answer was wanted. Cost is a safety property here, not an efficiency concern.

Whatever scope is chosen, **name it in the readout header and in `basis:`** — `1 repo (this session's writes)` reads very differently from `19 repos`, and a scope the dev cannot see is one they cannot correct.

## Step 1 — six sources, gathered IN PARALLEL

Send them as separate Bash calls in **one** message. They are independent; a sequential chain here is the failure mode. Substitute the literal root from step 0.5 into each block — **each fenced block runs in its own shell**, so a variable set in an earlier block is empty here.

The Bash tool on this machine runs **zsh**, which does not word-split unquoted expansions. Every loop below uses `while read` or a literal list, and every `@{u}` is quoted, because zsh brace-expands a bare one. Do not "simplify" either back.

### Source A — git state: what would be lost

```bash
cd /abs/path/to/root || exit 1
NOISE='(^|/)node_modules/|(^|/)\.venv/|__pycache__/|(^|/)dist/|(^|/)build/|(^|/)target/|(^|/)\.next/|(^|/)\.worktrees/|\.DS_Store|\.log$'
find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort |
while IFS= read -r r; do
  # A repo with no commits yet: every rev-list below returns empty, which would
  # print blank fields and read as clean. Say what it is and move on.
  if ! git -C "$r" rev-parse --verify -q HEAD >/dev/null 2>&1; then
    printf '== %s [no commits yet] nothing committed; sources C and E have nothing to read\n' "$r"
    continue
  fi
  b=$(git -C "$r" rev-parse --abbrev-ref HEAD 2>/dev/null)
  g=$(git -C "$r" rev-parse --absolute-git-dir 2>/dev/null)
  up=$(git -C "$r" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)
  # Commits on no remote at all — the true "exists only on this laptop" count,
  # correct whether or not the branch has an upstream. Never "?".
  unpushed=$(git -C "$r" rev-list --count HEAD --not --remotes 2>/dev/null)
  # Commits reachable from HEAD and from no branch or remote — exactly what goes
  # unreachable at the next checkout. Non-zero here is what makes detached HEAD bite.
  loose=$(git -C "$r" rev-list --count HEAD --not --branches --remotes 2>/dev/null)
  if [ -n "$up" ]; then
    behind=$(git -C "$r" rev-list --count 'HEAD..@{u}' 2>/dev/null)
  else
    up="(none)"; behind="?"
  fi
  st_n=$(git -C "$r" stash list 2>/dev/null | grep -c .)
  st_old=$(git -C "$r" stash list --date=short --format='%ad' 2>/dev/null | tail -1)
  mid=""
  for f in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG; do
    [ -e "$g/$f" ] && mid="$mid $f"
  done
  # --untracked-files=all: porcelain otherwise collapses a wholly-untracked
  # directory to one line, hiding every file inside it from every grader.
  all=$(git -C "$r" status --porcelain --untracked-files=all 2>/dev/null)
  kept=$(printf '%s\n' "$all" | grep -Ev "$NOISE")
  printf '== %s [%s] upstream:%s unpushed:%s unreachable:%s behind:%s stash:%s%s staged:%s dirty:%s filtered:%s%s\n' \
    "$r" "$b" "$up" "$unpushed" "$loose" "$behind" \
    "$st_n" "${st_old:+ (oldest $st_old)}" \
    "$(git -C "$r" diff --cached --name-only 2>/dev/null | grep -c .)" \
    "$(printf '%s\n' "$kept" | grep -c .)" \
    "$(( $(printf '%s\n' "$all" | grep -c .) - $(printf '%s\n' "$kept" | grep -c .) ))" \
    "${mid:+ MIDWAY:$mid}"
  printf '%s\n' "$kept" | grep -E '.' | head -20
done
exit 0
```

Read every field; each maps to a different way work disappears. `dirty` is edits that exist on this disk and nowhere else — the most common thing lost at exit. `upstream:(none)` is a branch nobody else can see and no backup holds. `unpushed:N` counts commits that exist on **no remote**, via `rev-list --not --remotes` rather than against an upstream: the obvious `@{u}..HEAD` returns nothing exactly when there is no upstream, which is the case the grading table calls a blocker, so an empty new branch and a branch carrying nine unpushed commits would otherwise print identically. `unreachable:N` counts commits on no branch and no remote — it separates a dev who checked out a tag to read something (`0`) from one who committed four times into limbo, and read together with a `[HEAD]` branch name it is what makes a detached HEAD dangerous.

`MIDWAY:` is an interrupted rebase, merge, cherry-pick, revert, or bisect — the highest-stakes finding on the list, because the repo looks broken tomorrow and the cold-start reflex is `git reset --hard`, which destroys the very work the rebase was moving. `filtered:N` prints even when it is the only thing on the line: a repo printing nothing at all has not been checked, while one printing `dirty:0 filtered:12` has.

The `exit 0` is deliberate: the last `grep` returns 1 when it matches nothing, and a non-zero exit here reads as failure when the output is fine. **Judge this step by its output, never by its exit status.**

### Source B — secrets and junk about to be committed

The costliest exit mistake is not lost work, it is a credential that leaves with a push. Untracked is bad; already tracked is worse, because it is one commit from public.

```bash
cd /abs/path/to/root || exit 1
# Bracket classes, no backslashes — these are passed through `awk -v`.
SECRET='(^|/)[.]env($|[.])|[.]pem$|[.]p12$|[.]pfx$|(^|/)id_(rsa|dsa|ecdsa|ed25519)$|[.]key$|(^|/)[.]npmrc$|(^|/)[.]netrc$|credentials?([.]json)?$|service.account.*[.]json$|(^|/)[.]aws/|secrets?[.]ya?ml$|secrets?[.]json$|secrets?[.]toml$'
SAFE_SUFFIX='[.]example$|[.]sample$|[.]template$|[.]dist$|[.]md$'
JUNK='(^|/)(scratch|tmp|temp)/|[.]orig$|[.]rej$|[.]bak$|(^|/)nohup[.]out$|(^|/)core$|[.]swp$|(^|/)untitled'
find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort |
while IFS= read -r r; do
  echo "== $r"
  # Match the PATH, not the porcelain line — see the warning below.
  # --untracked-files=all for the same reason as source A: a wholly-untracked
  # directory otherwise collapses to `?? newmodule/` and the secret inside it
  # is never seen. tolower() because the ls-files half below uses grep -Ei,
  # and macOS filesystems are case-insensitive, so .ENV is a real filename.
  git -C "$r" status --porcelain --untracked-files=all 2>/dev/null |
    awk -v s="$SECRET" -v j="$JUNK" -v k="$SAFE_SUFFIX" '
      { st=substr($0,1,2); p=substr($0,4); sub(/^.* -> /,"",p); gsub(/^"|"$/,"",p)
        f=tolower(p)      # match lowercased, PRINT the real name
        if (f ~ s && f !~ k) { print "  SECRET-IN-TREE [" st "] " p; next }
        if (f ~ j)           { print "  JUNK           [" st "] " p } }'
  git -C "$r" ls-files 2>/dev/null | grep -Ei "$SECRET" | grep -Ev "$SAFE_SUFFIX" | sed 's/^/  ALREADY-TRACKED /'
done
exit 0
```

**Match the path, never the raw `git status --porcelain` line.** Porcelain prefixes every path with a two-character status field and a space, so a `(^|/)`-anchored pattern can never match a file at the repo root — every root-level `.env` and the whole junk category go missing while the section prints a partial result and reads as clean. The `awk` above extracts the path into `p` and matches on that alone. The fixture in [reference/smoke-test.md](reference/smoke-test.md) asserts both halves of the pair for exactly this reason.

A collapsed directory is the same bug one level up: porcelain reports a wholly-untracked directory as a single `?? newmodule/`, so a `.env` inside a brand-new module never reaches the scanner. Hence `--untracked-files=all` in both A and B.

Four details in that awk worth keeping. `st` is preserved and printed because grading needs it — a staged secret is a blocker, an untracked one a warning. `sub(/^.* -> /,"",p)` resolves a rename to the path that would actually be committed. Patterns use bracket classes, not backslashes, because `awk -v` processes escape sequences in the value. And `f` is a lowercased copy of `p` used only for matching — the path is printed as it really is, since a remedy naming `config.pem` fails on a case-sensitive filesystem for a file called `CONFIG.PEM`.

`SAFE_SUFFIX` exists because `.env.example` and `credentials.md` are normal committed files, and a checker that cries wolf on them gets ignored on the day it is right. A hit is a **question, not a verdict** — `config.key` may be a keyboard mapping. Check the file before calling it a leak, and never print its contents.

### Source C — unfinished work markers

Two different questions: what did *this session* leave half-built, and what does the plan still say is open.

```bash
cd /abs/path/to/root || exit 1
# Bracket classes, NOT backslashes — see the warning below. Two patterns, not
# one, because the grading table treats their hits differently.
MARK_TODO='TODO|FIXME|XXX|HACK|WIP|PLACEHOLDER|STUB|unimplemented'
MARK_SKIP='test[.]skip|test[.]only|describe[.]only|it[.]only|[.]skip[(]|pytest[.]mark[.]skip|NotImplementedError'
DOCS='[.]md$|[.]rst$|[.]txt$|[.]adoc$'
NOISE='(^|/)node_modules/|(^|/)[.]venv/|__pycache__/|(^|/)dist/|(^|/)build/|(^|/)target/|(^|/)[.]next/|(^|/)[.]worktrees/'
find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort |
while IFS= read -r r; do
  echo "== $r"
  # lines this session ADDED to files git already tracks
  git -C "$r" diff HEAD --unified=0 2>/dev/null |
    awk -v t="$MARK_TODO" -v k="$MARK_SKIP" -v d="$DOCS" '
      /^\+\+\+ /{f=substr($0,7)}
      /^\+[^+]/{ ln=substr($0,2)
        if (f !~ d && ln ~ k) { print "  SKIP  changed " f ": " ln; next }
        if (ln ~ t)           { print "  TODO  changed " f ": " ln } }' | head -25
  # brand-new files: every line is new, and NONE of them appear in the diff above
  git -C "$r" ls-files --others --exclude-standard 2>/dev/null | grep -Ev "$NOISE" |
  while IFS= read -r f; do
    case "$f" in
      *.md|*.rst|*.txt|*.adoc) ;;
      *) grep -InE "$MARK_SKIP" "$r/$f" 2>/dev/null | sed "s|^|  SKIP  new $f:|" | head -3 ;;
    esac
    grep -InE "$MARK_TODO" "$r/$f" 2>/dev/null | sed "s|^|  TODO  new $f:|" | head -3
  done | head -20
done
exit 0
```

Two things this block gets wrong if you rewrite it casually.

**`awk -v` processes escape sequences, so a regex with backslashes arrives mangled.** Measured: `\.skip\(` reached awk as `.skip(` — an unbalanced paren — and awk died once per file while the scan silently found nothing. Bracket classes survive `-v` untouched. Any pattern passed through `-v` must contain no backslashes at all.

**Untracked files never appear in `git diff HEAD`.** A brand-new module full of stubs is invisible to the diff scan, which is exactly the file most likely to hold them. `ls-files --others --exclude-standard` is the second half, and it greps whole files on purpose: in a file git has never seen, every line is new. The read-only alternative would be `git add -N`, which mutates the index — not available to this skill.

**Both halves stay scoped to this session; neither ever widens to the whole repo.** A repo-wide `grep TODO` returns years of accumulated backlog, buries the three lines you added an hour ago, and trains the dev to skim past this section forever. The one legitimate widening is unpushed commits: if the session also committed, extend the first half to `git diff '@{u}'...HEAD` — but only where source A reported an upstream, since that ref errors out on exactly the `upstream:(none)` repos the table grades as blockers. Say that you widened.

Then the plan side:

```bash
find /abs/path/to/root -maxdepth 3 -type f -mtime -1 \
  \( -path '*/.planning/*' -o -path '*/notes/*' -o -name 'STATE*.md' -o -name 'HANDOFF*.md' -o -name 'TODO.md' \) \
  -name '*.md' 2>/dev/null | head -10
```

Open what it finds and pull the checkboxes out **untailed** — unchecked boxes are the live work, and in a large state file they sit far above the last heading:

```bash
grep -nE '^[[:space:]]*[-*+0-9.]*[[:space:]]*\[[ xX]\]' /abs/path/to/file.md
```

If nothing turns up, print `(none)` and move on. Many repos keep no planning notes, and that is not a finding.

**The absence of a note is itself a finding when there is unfinished work.** If source A shows real in-progress edits and no STATE or HANDOFF file was touched today, tomorrow's recap has nothing to resume from. That is a NOTE and it belongs in CARRY FORWARD.

### Source D — what keeps running after you leave

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

### Source E — what waits on someone else

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

### Source F — where this repo keeps its memory

Sources A and B see what git can see **from this repo**. They miss two things, and both are where a repo's actual knowledge lives: paths the repo ignores on purpose, and repos nested inside those paths. Ignored is not the same as unimportant — it is frequently the opposite.

Do not guess store names. A fixed list of `docs/kb`, `.planning`, `wiki` fits one repo's habits and silently reports nothing for the next. Ask git what this repo ignores, then ask what the repo says about why.

```bash
cd /abs/path/to/root || exit 1
NOISE='(node_modules|__pycache__|[.]venv|venv|dist|build|target|[.]next|[.]pytest_cache|[.]ruff_cache|[.]mypy_cache|[.]gradle|[.]idea|[.]vscode)/|[.]DS_Store|[.]pyc$|[.]log$'
TEXT='( -name *.md -o -name *.txt -o -name *.rst -o -name *.adoc )'   # documented below

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
  printf 'NESTED-REPO %s [%s] upstream:%s unpushed:%s dirty:%s\n' "$g" \
    "$(git -C "$g" rev-parse --abbrev-ref HEAD 2>/dev/null)" \
    "$(git -C "$g" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '(none)')" \
    "${un:-0}" "$dy"
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
  # Text written today, excluding anything inside a repo we just probed and
  # anything inside .git. Knowledge is text; counting every file makes a cache
  # look like the busiest store in the workspace.
  # If the ignored path IS a repo, probe_repo already said what matters; a
  # store line on top of it just repeats a whole checkout back at the dev.
  if [ -d "${p}.git" ]; then
    # Only a repo that actually gained TEXT today is a knowledge store. Without
    # this, every code project advertises its export_*.py as a "durable path".
    [ "$(find "$p" -maxdepth 3 -type f -mtime -1 -not -path '*/.git/*' \
          \( -name '*.md' -o -name '*.txt' -o -name '*.rst' -o -name '*.adoc' \) 2>/dev/null | grep -c .)" -eq 0 ] && continue
    find "$p" -maxdepth 3 -type f \( -name 'export*' -o -name '*publish*' -o -name '*share*' \) \
      \( -perm -u+x -o -name '*.py' -o -name '*.sh' -o -name '*.rb' \) \
      2>/dev/null | grep -v __pycache__ | head -2 | sed 's|^|  durable-path? |'
    continue
  fi
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

**`NESTED-REPO` is the one to read first.** A repo inside an ignored or untracked path is invisible to every other source, so its own `upstream`/`unpushed`/`dirty` numbers are the only evidence there is — grade them as you would the main repo's. Measured: a knowledge base at `docs/kb` came back `upstream:(none) unpushed:29 dirty:13` while every other source called that workspace clean.

Two filters keep the rest readable: freshness counts **text** files, or a cache directory outranks the knowledge base, and a nested repo that is clean and fully pushed is skipped. Quote the repo's own words — the `.gitignore` comment or `CLAUDE.md` line the grep found — when you report any of this. How the three findings differ, why a name list was the wrong instrument, and a worked example are in [reference/repo-conventions.md](reference/repo-conventions.md).

## Step 2 — grade every finding

The readout is only useful if the grades are consistent. Grade by one question: **what happens if the dev closes the laptop right now?**

| Finding | Grade | What breaks if ignored |
|---|---|---|
| Interrupted rebase / merge / cherry-pick | **BLOCKER** | Cold-start reflex is `reset --hard`; the in-flight work is exactly what it deletes |
| Secret staged, or already tracked | **BLOCKER** | One push from published; deleting it later does not unpublish it |
| Running subagent, active loop or scheduled mode | **BLOCKER** | Keeps editing the repo and spending budget with nobody watching |
| `unpushed:N` where N is not 0 | **BLOCKER** | Commits on no remote at all; one dead laptop from gone, and invisible to every teammate |
| `unreachable:N` where N is not 0 | **BLOCKER** | Commits on no branch and no remote; gone at the next checkout |
| Untracked files not matching the junk denylist | **BLOCKER** | Not in the index, so not in a stash and not in any commit |
| `NESTED-REPO` with `unpushed:` not 0, `upstream:(none)`, or `dirty:` not 0 | **BLOCKER** | A repo inside an ignored or untracked path. No other source can see it, so its own numbers are the only evidence there is |
| `NESTED-REPO … [no commits yet]` with `dirty:` not 0 | **BLOCKER** | Work in a repo that has never committed anything |
| `IGNORED-STORE` with a `durable-path?` line | **BLOCKER** | Written today, ignored, and the repo's own way out was not taken |
| `IGNORED-STORE` with no `durable-path?` | NOTE | Local by design; say which store, and stop |
| `LOCAL-BY-CONVENTION` with `predating:` not 0 | NOTE | An established store — `predating:` is the test. Committing it changes a convention rather than repairing anything |
| `LOCAL-BY-CONVENTION` with `predating:0` | **BLOCKER** | Nothing predates today, so this is new work in no commit anywhere — not a convention |
| Tracked edits uncommitted | **BLOCKER** | Exists on one disk only; a stray `checkout` or worktree removal eats it |
| `.only` test added this session | **BLOCKER** | It silently disables every other test; a green suite that is not green is worse than a red one |
| Skipped test added this session | NOTE | Routine when deliberate — say which test, so it is not forgotten |
| Dev server, watcher, or tmux session still up | NOTE | Holds a port, burns battery, can serve stale code tomorrow |
| Stash entries | NOTE | Safe, but they rot; source A prints the count and the oldest date |
| New TODO/FIXME in this session's diff | NOTE | Fine to leave — but say where, so tomorrow starts there |
| Unchecked boxes in a plan touched today | NOTE | This is tomorrow's first action; it belongs in CARRY FORWARD |
| In-progress work with no HANDOFF/STATE written | NOTE | Tomorrow's recap has nothing to resume from |
| Your PR with `CHANGES_REQUESTED` or failing checks | NOTE | Waiting on you, but nothing is lost |
| PR with review requested from you | NOTE | Someone else is blocked on you |
| Untracked files matching the junk denylist | NOTE | Noise, and a future accidental commit |

Two rows carry a judgement worth stating. **A dirty tree blocks on its own, deliberately** — uncommitted edits exist on exactly one disk, and this skill is asked precisely when the dev stops watching that disk. The cost is that NOT SAFE becomes the common answer; read that as the tool working, and note that a single `git commit` usually moves it. If you would rather the common case be quieter, the change is one row: NOTE when a dirty tree stands alone, BLOCKER in combination with `upstream:(none)`, a `MIDWAY:` state, or a secret. **`.only` and `skip` are not the same finding** — `.only` silently disables the rest of the suite so a green run means nothing; a deliberately skipped test is ordinary. Source C labels hits `SKIP` and `TODO` but cannot tell `.only` from `skip`, so read the matched line before grading.

Then the verdict is mechanical — **do not soften it**:

- any unaccepted BLOCKER → **NOT SAFE**
- zero blockers, one or more notes → **SAFE WITH NOTES**
- nothing at all → **SAFE**
- any source that errored or could not run → **NOT SAFE (unverified)**, naming the source

An **accepted blocker** is one the dev was shown, chose to leave, and which is now written into the handoff note. It still prints, tagged `accepted`, and the verdict reads `NOT SAFE (1 accepted: midway rebase, recorded in HANDOFF)`. This exists because the skill's own advice on the highest-stakes finding — a midway rebase — is to leave it alone overnight. Without the category, following that advice guarantees a bare NOT SAFE and makes the closing re-check look like a malfunction. An accepted blocker is a decision on the record, not a cleared one.

That last verdict rule matters most. A source that failed is not a source that passed, and "safe" earned from a silent failure is the only output of this skill that can actively hurt someone.

## Step 3 — the readout

Fixed shape, values first, no story. Every line carries the remedy next to the finding, so the dev never has to go looking for the command.

```
SAFE TO EXIT — NOT SAFE — claude-skills @ 2026-09-08 18:42 (check)
5 blockers, 4 notes, 1 repo, 6/6 sources ran

BLOCKERS
  secret     .env staged at repo root       -> git restore --staged .env
  dirty      4 tracked edits [main]         -> git add -A && git commit
  midway     merge in progress [main]       -> leave it; rung 1 records it (see below)
  agent      cavecrew-builder never reported -> wait for it; do not close yet
  memory     docs/kb is its own repo:          -> git -C docs/kb push  (set an upstream first)
             upstream:(none) unpushed:29 dirty:13

NOTES
  stash      3 entries, oldest 2026-08-14   -> git stash list
  server     vite pid 40311 on :5173        -> kill 40311
  markers    2 new TODO in etl/loader.py:88 -> fine to leave, starts here tomorrow
  pr         #204 CHANGES_REQUESTED         -> gh pr view 204

CARRY FORWARD
  Loader cannot reach the mandate record; next action is the retry path.
  No HANDOFF written today — tomorrow's recap will have nothing to resume from.

VERDICT
  NOT SAFE. Clear the secret, the edits and the agent, or say "make it safe" and I will
  work the ladder one rung at a time, printing each command and waiting.
  The midway merge is the one to leave: rung 1 writes it into the handoff and
  it becomes an accepted blocker rather than a cleared one.

basis: git status/rev-list 1 repo; secret+junk scan (tracked and untracked);
       diff-scoped marker scan vs HEAD; pgrep/lsof/tmux + agent inventory;
       store probe: docs/kb is a nested repo, ignored by the parent and seen by
       no other source; .planning local-by-convention (0 of 228 tracked, 141 predating);
       gh pr list as noomz (verified)
```

Rules for the block:

- **Four sections, always, in that order.** An empty one prints `(none)`. A deleted section makes the dev wonder whether you looked.
- **One line per finding, remedy on the same line.** Three or more facts about one thing become columns, not a comma run-on.
- **Print the source count** (`6/6 sources ran`) — the difference between a clean report and a blind one — and write **CARRY FORWARD for tomorrow's blank brain**, not for tonight: one or two sentences, the content a HANDOFF note would carry.
- **The verdict line is the last word and is never hedged.** No "mostly safe", no "probably fine".

## Secure mode

Only after the readout is on screen and the dev asks. The ladder, the exact commands, the consent rule, and the permanently banned operations are in **[reference/remediation.md](reference/remediation.md)** — read it before running any remedy, including one that looks obvious.

The short version: safest first (write a handoff note, commit, push), each command printed, then waited on, one rung at a time, re-run the check at the end. Nothing that discards, resets, force-pushes, or cleans is ever on the table.

**Every command in `allowed-tools` is read-only, and that is deliberate.** `Bash(git:*)` would have pre-approved `git reset --hard`, `git clean -fd`, and `git push --force` — every operation this skill bans — turning a convenience declaration into a silent grant of exactly the powers the design refuses. So the audit runs without prompting and every secure-mode mutation hits a normal permission prompt instead. That prompt is a second, independent gate on top of the dev's go-ahead. Do not add mutating patterns to `allowed-tools` to make secure mode smoother; the friction is the point.

## Hard rules

- **Read-only unless the dev asked for secure mode**, and even then only the ladder.
- **Never call it safe on an unverified source.** Exit code is not evidence; read the output.
- **Never print secret file contents**, values, tokens, hostnames, or DSNs. The path and the remedy are enough.
- **Never kill a PID you have not identified**, and never one you did not see the dev start.
- **Never `gh auth switch`** — it mutates global state to answer a read-only question.
- **Do not do the work.** A missing test is a finding, not an invitation to write it.
- **Never propose committing a path the repo keeps local.** Decide from evidence, not preference: `tracked:0` plus files older than this session means the repo has chosen not to track it. Committing that is a change of convention dressed up as a fix. The remedy for a local store is its own export path, or nothing.
- **One root only.** Stay under the resolved root unless the dev widens it.
- **Settle scope before running any source.** More than one repo at the root, or a root that is not itself a repo, means ask first. Never open with a sweep.
- **Do not repeat the audit after a "no thanks."** Print the verdict once and stop.

## Verify before trusting the run

Three lines, before Step 1: the root printed in step 0.5 is the one you meant, the repo count is not `0`, and `gh auth status` names an account that can see these repos. Every later grade silently depends on those three.

After changing any pattern or `rev-list` in this file, run the fixture in [reference/smoke-test.md](reference/smoke-test.md) instead of trusting a clean-looking local run. It asserts expected output text, because every bug this skill has had exited `0` and printed something that looked fine.

## Known gaps

The limits are real and several are deliberate trade-offs — a store list that is a guess, an export detection that is name-based, a scope that depends on where you launched, a strictness choice that makes NOT SAFE common. **Read [reference/known-gaps.md](reference/known-gaps.md) before trusting a readout**, and before changing anything in this file: it says which limits were chosen and why.

## Reference

- [Known gaps](reference/known-gaps.md) — every limit, with the reason it was accepted.
- [Repo conventions](reference/repo-conventions.md) — how source F's three findings differ, and how to report a store using the repo's own declared rules.
- [Smoke test](reference/smoke-test.md) — a six-repo fixture with observed expected output for sources A, B and C, and what each case is defending against.
- [Remediation ladder](reference/remediation.md) — what secure mode may run, in what order, with which consent, and the operations that stay banned regardless of how the request is phrased.
