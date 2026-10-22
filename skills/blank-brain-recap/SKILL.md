---
name: blank-brain-recap
description: Rebuilds yesterday's working context in any repo or multi-repo workspace so a blank-brain morning starts with facts instead of guesses. Finds the last active day from git across every repo under the workspace root, reads the newest planning STATE and HANDOFF notes, lists open pull requests for repos that have a GitHub remote, cross-checks dated memory and ledger rows, then prints one terse readout ending in a single next step. Trigger on "/blank-brain-recap", "blank brain", "brain is blank", "recap", "catch me up", "where was I", "what did I do yesterday", "what was I working on", "resume where I left off", or the first status question of a new day. Do NOT trigger on "rewind" alone — that word belongs to the built-in checkpoint rewind, a different feature. Read-only: it never edits, commits, pushes, or closes anything.
allowed-tools: Bash(git:*), Bash(gh:*), Bash(ls:*), Bash(grep:*), Bash(sed:*), Bash(date:*), Bash(find:*), Bash(head:*), Bash(sort:*), Bash(uniq:*), Bash(wc:*)
---

# Blank Brain Recap

> Yesterday gone,
> New fresh morning,
> My brain's so blank.
>
> Recap.

## Role

You are the dev's memory for the current workspace. You reconstruct where work stopped and what the next action is. You do not do the work.

## Step 0 — pick the mode first

Check the current conversation before running any command.

| Condition | Mode | What to cover |
|---|---|---|
| This session already did real work (edits, runs, a checklist in progress) | **warm** | Only the current session's task. Skip all history gathering. |
| Session is fresh — no work done yet in this conversation | **cold** | The last active day, gathered from the four sources below. |

"Real work" means you made an edit, ran a command that changed something, or already have a checklist in progress. Reading one or two files is **not** real work — that is still cold. When genuinely torn, pick cold: a redundant gather costs a few seconds, a wrongly-warm recap silently reports nothing.

Warm mode is the cheap path: do not run `git` or `gh` — the answer is already in context. Say which mode you used in the header.

## Step 0.5 — resolve the workspace root and identity

Nothing below is hardcoded. Resolve it once, print it, and reuse it.

```bash
# WS = the workspace root. Prefer the dir the user named; else the git toplevel;
# else the current dir. If the toplevel's PARENT holds several sibling repos,
# the parent is usually the real workspace — say so and ask before widening.
WS=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$WS" || exit 1
echo "workspace: $WS"
echo "today is $(date +%F)"          # print it — never compare dates from memory

# Every repo this recap covers: the workspace repo itself (prints as `.`) plus
# one level of siblings. Use -maxdepth 3 for a group/*/repo layout.
REPOS=$(find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort)
printf '%s\n' "$REPOS"
printf 'repo count: %s\n' "$(printf '%s\n' "$REPOS" | grep -c .)"

# Who is "me"? Match on the NAME, not one email — one human commonly
# commits under a work address and a personal address.
ME=$(git config user.name)
echo "identity: $ME"
git shortlog -sne --all --since="21 days ago" 2>/dev/null | head -10
```

Read the `shortlog` table: one human under several emails is already covered by the name match in step 1. If the name is spelled differently across identities, use the shortest common token and say so in `basis:`.

If the repo count is `0` you are in the wrong directory — every later step returns empty and looks like a quiet day. Stop and say so.

## Cold mode — Step 1: find the last active day

```bash
# Substitute the literal root and name from step 0.5 — each fenced block runs
# in its OWN shell, so a variable set in an earlier block is empty here.
cd /abs/path/to/workspace || exit 1
find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' |
while IFS= read -r r; do          # `.` is the workspace repo itself —
  git -C "$r" log --all --author="Dana" --since="21 days ago" \
      --date=short --format='%ad' 2>/dev/null
done | sort -r | uniq -c | head -8
```

The `uniq -c` count on the left is the commit count for each date.

Pick the window by this rule — do not improvise it:

| Newest date in output | Commit count | Window to cover |
|---|---|---|
| is today | fewer than 10 | **today + the next date down** — today's few commits are usually the tail of yesterday's task |
| is today | 10 or more | **today only** — a full day already happened; adding yesterday doubles what the dev must read |
| is not today | any | **that date only** — this is a normal gap (weekend, day off) |

**Name the covered dates in the readout header**, e.g. `BLANK BRAIN RECAP — 2026-09-06 + 2026-09-07 (cold)`. The `<10` threshold is a judgment call; a header naming the dates lets the dev see and correct a wrong window. A recap that silently covers the wrong day is this skill's worst failure.

Never guess the dates; they come from this command's output.

Discovery uses `find`, never `ls` or a `*/.git` glob (colour escapes and `zsh` no-match fatals both fail silently into a quiet-looking empty table). Step 1 filters to **your** commits, step 2 lists **everyone's** on the chosen date, deliberately — if SHIPPED shows work you do not recognise, say whose it is rather than dropping it. Detail: [reference/gather-rationale.md](reference/gather-rationale.md).

## Cold mode — Step 2: gather the four sources IN PARALLEL

Send all four as separate Bash calls in **one** message. They are independent — a sequential chain here is the failure mode.

**1. Git across every repo** — what actually changed.

```bash
cd /abs/path/to/workspace || exit 1        # literal from step 0.5, not a variable
# Tune NOISE per workspace — see reference/tuning.md. Everything here is churn
# that is never the answer to "what was I doing".
NOISE='(^|/)node_modules/|(^|/)\.venv/|__pycache__/|(^|/)dist/|(^|/)build/|(^|/)target/|(^|/)\.next/|(^|/)\.worktrees/|(^|/)\.planning/|(^|/)\.omc/|\.DS_Store|\.log$|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|uv\.lock|CLAUDE\.md|AGENTS\.md'
find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' |
while IFS= read -r r; do
  for D in 2026-09-06 2026-09-07; do        # <- EVERY date from step 1, as literals
    out=$(git -C "$r" log --all --since="$D 00:00" --until="$D 23:59:59" \
          --format="  $D %h %s" 2>/dev/null)
    [ -n "$out" ] && printf '== %s (commits %s)\n%s\n' "$r" "$D" "$out"
  done

  all=$(git -C "$r" status --porcelain 2>/dev/null)
  [ -z "$all" ] && continue
  kept=$(printf '%s\n' "$all" | grep -Ev "$NOISE")
  n_all=$(printf '%s\n' "$all" | grep -c .)
  n_kept=$(printf '%s\n' "$kept" | grep -c .)
  # print ALWAYS, even when kept is empty — that is what real:0 filtered:N means
  printf '== %s UNCOMMITTED [%s] real:%s filtered:%s\n%s\n' \
     "$r" "$(git -C "$r" rev-parse --abbrev-ref HEAD 2>/dev/null)" \
     "$n_kept" "$((n_all - n_kept))" "$kept"
done
exit 0
```

Uncommitted files are usually the in-progress item.

**The NOISE filter is mandatory.** Unfiltered dirty entries bury the one real file (observed: 47 entries, 2 real). Four rules:

- **Never drop silently.** The `printf` of `real:N filtered:M` is unconditional — print it for every dirty repo, even when `real:0`. If `filtered` looks surprisingly large, say so in the readout.
- **The inner date loop makes a two-date window real.** One `--since/--until` pair covers one day; without the loop the header claims both dates while SHIPPED holds one.
- **Dates go in the `for` list as literals, never a variable.** Under `zsh` unquoted `$VAR` is not word-split. No `for X in $VAR` anywhere.
- **A tracked modification (` M`) outranks an untracked file (`??`)** — put ` M` items first in IN PROGRESS.

The script ends in `exit 0` on purpose; judge this step by its printed output, never its exit status. Evidence and history: [reference/gather-rationale.md](reference/gather-rationale.md).

**2. Planning notes — STATE and HANDOFF** — the checklist and the resume point.

```bash
# Discover, do not assume. NEVER pass a list of *.md globs here.
NOTES=$(find /abs/path/to/workspace -maxdepth 3 -type f -name '*.md' \
        \( -path '*/.planning/*' -o -path '*/docs/planning/*' -o -path '*/notes/*' \) \
        2>/dev/null)
if [ -z "$NOTES" ]; then echo "(none)"
else printf '%s\n' "$NOTES" | tr '\n' '\0' | xargs -0 ls -lt | head -8; fi
```

If none exist, print `(none)` and move on — not a failure.

**Never use a glob list here** — under `zsh` one unmatched pattern silently aborts the whole command and the miss reads as `(none)`. Keep the `-z "$NOTES"` guard.

**Newest by mtime is often the wrong file** (a 65 KB log can outrank the HANDOFF). Open the newest file **and** every `HANDOFF-*` in or near the window. When the two disagree about what comes next, **the HANDOFF wins** — a HANDOFF exists precisely to say "start here". Name the file you took NEXT STEP from in `basis:`.

**Do not blind-`tail` a large file.** Locate the markers first, then read around the hits:

```bash
F=/abs/path/to/workspace/.planning/<file>          # absolute — each block is its own shell

# 1. every checkbox, NEVER tailed — this is the live work
grep -nE '^[[:space:]]*[-0-9.]*[[:space:]]*\[[ xX]\]' "$F"

# 2. structure, tail is fine here
grep -nE '^#{1,3} |NEXT|Resume|BLOCKED|IN PROGRESS' "$F" | tail -20
```

Unchecked boxes (`[ ]`) are the live work; the last checked box (`[x]`) is where the dev stopped. **Never pipe the checkbox grep through `tail`** — headings crowd the unchecked boxes out.

**3. Open pull requests** — what waits on someone else.

```bash
cd /abs/path/to/workspace || exit 1        # literal from step 0.5, not a variable
gh auth status 2>&1 | head -6      # READ this; do not switch accounts
find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' |
while IFS= read -r r; do
  git -C "$r" remote get-url origin 2>/dev/null | grep -q github.com || continue
  echo "== $r"
  ( cd "$r" && gh pr list --state open --limit 30 \
      --json number,title,reviewDecision,baseRefName \
      --template '{{range .}}  PR #{{.number}} {{.title}} [{{if .reviewDecision}}{{.reviewDecision}}{{else}}no-review{{end}}] base:{{.baseRefName}}{{"\n"}}{{end}}' 2>&1 )
done
exit 0
```

Say which repos were skipped (non-GitHub remote). Never `gh auth switch` — read `gh auth status`; if the identity looks wrong, tag every PR line `[unverified]`. PRs only, not issues. Stacked PRs (`baseRefName` not default) can have false-green CI; `no-review` is not approval. **Empty `gh` output means "the repos I could query are clean", never "no blockers exist"** — cross-check against source 4. Detail: [reference/gather-rationale.md](reference/gather-rationale.md).

**Empty `gh` output means "the repos I could query are clean", never "no blockers exist."** So cross-check BLOCKED / WAITING against source 4.

**4. Memory open threads and dated ledger rows.**

```bash
# Ledgers / decision logs, if this workspace keeps any. Pass DIRECTORIES and
# plain files to `grep -r` — never a *.md glob, for the reason in source 2.
grep -rnE '2026-09-06|2026-09-07' \
  /abs/path/to/workspace/docs /abs/path/to/workspace/CHANGELOG.md 2>/dev/null | head -20

# Agent memory for THIS project, if present (path and slug convention vary by
# host). Filter by the workspace directory name: an unfiltered find returns
# every project's memory — measured 37 files on one machine — and reading
# another project's memory invents history that never happened here.
find ~/.claude ~/.ccs -maxdepth 7 -name MEMORY.md 2>/dev/null \
  | grep -i 'workspace-dir-name' | head -5
```

Then read whichever of those exist. If none do, print `(none)` — this source is optional infrastructure, not a requirement.

**Never leave the date pattern as a variable.** Each fenced block is a separate shell, so an unset `$D` becomes an empty `grep` pattern that matches **every** line. Substitute the literal dates from step 1.

**Memory records what was true when written.** Verify any PR or issue number taken from memory before printing it in BLOCKED / WAITING:

```bash
gh pr view <number> --repo <owner/repo> --json state,title,mergedAt 2>&1 | head -5
```

`MERGED` or `CLOSED` means drop it. Unresolvable repo: tag `[unverified, from memory]`, never a plain live blocker.

## Step 3 — the readout

Fixed shape. Values first, no story. Every figure carries a provenance tag; `basis:` names what produced it.

Shape (values first, one line per item; full worked example in [reference/readout-example.md](reference/readout-example.md)):

```
BLANK BRAIN RECAP — <dates> (cold, today had N commits)
SHIPPED
IN PROGRESS
BLOCKED / WAITING
NEXT STEP
basis: <what produced each figure, repos reached per source>
```

Rules for the block:

- **Four sections, always, in that order.** An empty section prints `(none)` — never delete it. A missing section makes the dev wonder if you looked.
- **SHIPPED is one line per feature-level change, never one per commit.** Collapse by the unit the dev thinks in: the issue or PR (`#142 parties tab`), not the sha chain that delivered it. If a repo had commits but no feature landed, write one line saying work continued and where.
- **One line per item.** Three or more facts about one thing → columns, not a comma run-on.
- **Exactly one NEXT STEP.** Extra candidates go in a single line after the block, then stop.
- **Legend every opaque token on first use** (sha, issue number, migration revision). Gloss once, reuse bare.
- **Name the workspace and repo count in `basis:`**, plus how many repos each source actually reached. "4 GitHub repos of 19" is the difference between a clean report and a blind one.

Warm mode uses the same four sections but drops `basis:` lines that would cite commands you did not run. Header reads `(current session, warm)`.

## Narrowing — hard rules

- **Read-only.** No edits, no commits, no pushes, no issue or PR comments, no `gh auth switch`. If the recap reveals a fix, name it in NEXT STEP and stop.
- **Never invent a date.** Dates come from step 1's output, not from today's calendar minus one.
- **Never quote a test or failure count as stable** — the same branch can report 15 then 14. Say "failures present", or diff the name sets.
- **Two probes, no signal → report the gap.** If a source returns nothing, print `(none)` for it and move on. Do not go hunting.
- **No hostnames, DSNs, credentials, or client PII** in the readout.
- **One workspace only.** Stay under the resolved `$WS`. Sibling projects elsewhere on disk are out of scope unless the dev names them.
- **Exit code is not evidence.** A `gh` call that prints nothing may have failed auth. Read the output.

## Verify before trusting the run

One line, before Step 1: the workspace path printed in step 0.5 is the one you meant, the repo count is not `0`, and the identity is not empty. Those three are what every later step silently depends on. The fuller smoke test lives in [reference/tuning.md](reference/tuning.md). Known limits of this skill: [reference/known-gaps.md](reference/known-gaps.md).


## Reference

- [Per-workspace tuning](reference/tuning.md) — read when changing NOISE, repo scope, planning-note and ledger paths, identity patterns, or after editing any command; holds the smoke test.
- [Gather rationale](reference/gather-rationale.md) — read before changing any cold-mode command, or when a source returns something surprising; why `find`, literals, unconditional prints, and verification steps exist.
- [Readout example](reference/readout-example.md) — read when writing the Step 3 block for the first time or when unsure of the format.
- [Known gaps](reference/known-gaps.md) — read before trusting an odd readout, and before "improving" the skill.
