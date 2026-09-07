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

Warm mode is the cheap path. Do not run `git` or `gh` in warm mode — the answer is already in your context. Say which mode you used in the readout header.

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

Read the `shortlog` table. If more than one line is plainly the same human under different emails, matching the given name (the `--author` filter in step 1) already covers them. If the dev's name is spelled differently across identities, use the shortest common token and say so in `basis:`.

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

Then **name the covered dates in the readout header**, e.g. `BLANK BRAIN RECAP — 2026-09-06 + 2026-09-07 (cold)`. This is not decoration. The threshold above is a judgment call that can be wrong in either direction, and a header naming the dates turns a wrong window into something the dev can see and correct. A recap that silently covers the wrong day is the worst failure this skill has — it looks complete.

Never guess the dates; they come from this command's output.

Two things about that command. It discovers repos with `find`, not with `ls` and not with a `.git */.git` glob. `ls` output can carry colour escapes that make `git -C` fail, and `2>/dev/null` would hide every one of those fatals, leaving an empty table that looks like a quiet fortnight. The glob is worse: under `zsh`, a pattern that matches nothing is a **fatal error**, not an empty list — measured in a single-repo workspace, `for d in .git */.git` aborted with `no matches found: */.git` before the loop body ran once, so the recap reported zero repos. `find` behaves the same in every shell and in every layout. And step 1 filters to **your** commits, while step 2 lists **everyone's** commits on the chosen date. That asymmetry is deliberate: the day is picked by when *you* last worked, but the day's record should include a teammate's or CI bot's merge. If SHIPPED shows work you do not recognise, that is why — say whose it is rather than dropping it.

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

Uncommitted files matter as much as commits — they are usually the in-progress item.

### Why the NOISE filter is mandatory

Observed on a 19-repo workspace: **47 dirty entries, of which 2 were real work.** The other 45 were operational dirs, agent-config tweaks, worktrees, and lockfiles. Unfiltered, the IN PROGRESS section fills with junk and buries the one file that matters — the failure lands exactly when the dev is least able to spot it.

Four rules keep this step honest:

- **Never drop silently — which needs the unconditional `printf`.** An earlier version guarded the print with `[ -n "$kept" ]`, so a repo whose every dirty path was noise printed *nothing at all*: 8 of 19 repos vanished with no `real:0 filtered:N` to show they had been considered. The count line must appear for every dirty repo, empty or not. If `filtered` looks surprisingly large, say so in the readout rather than trusting it.
- **The inner date loop is what makes a two-date window real.** The window table can ask for two days; a single `--since/--until` pair covers one. Without the loop, the header claims both dates while SHIPPED holds one — the exact silent-wrong-day failure this skill exists to avoid.
- **Put the dates in the `for` list as literals, never in a variable.** Under `zsh` — a common interactive default — unquoted expansions are not word-split: `DATES='a b'; for D in $DATES` runs **once** with `D='a b'`, so `--since="a b 00:00"` becomes a malformed window that git accepts silently and answers with the wrong day's commits. Same rule anywhere else in this file: no `for X in $VAR`.
- **A tracked modification (` M`) outranks an untracked file (`??`).** ` M` means the dev edited something that already exists — closer to the live task. Put ` M` items first in IN PROGRESS.

The script ends in `exit 0` on purpose: the last `grep -Ev` returns 1 when it matches nothing, and a non-zero pipeline exit here reads as failure when the output is fine. Judge this step by its printed output, never by its exit status.

**2. Planning notes — STATE and HANDOFF** — the checklist and the resume point.

```bash
# Discover, do not assume. NEVER pass a list of *.md globs here — see the
# warning below. `find` first, then sort the hits by mtime.
NOTES=$(find /abs/path/to/workspace -maxdepth 3 -type f -name '*.md' \
        \( -path '*/.planning/*' -o -path '*/docs/planning/*' -o -path '*/notes/*' \) \
        2>/dev/null)
if [ -z "$NOTES" ]; then echo "(none)"
else printf '%s\n' "$NOTES" | tr '\n' '\0' | xargs -0 ls -lt | head -8; fi
```

If none exist, print `(none)` for this source and move on — many repos keep no planning notes at all, and that is not a failure.

**A glob list here is a silent-miss bug, not a style choice.** Under `zsh`, one unmatched pattern aborts the **whole** command, so `ls -lt WS/.planning/*.md WS/notes/*.md` prints nothing at all when only `.planning/` is missing — the existing `notes/*.md` never gets listed. Measured: an existing `notes/a.md` went unlisted for exactly that reason, `2>/dev/null` did **not** suppress the error, and the exit status stayed `0`. The miss reads as `(none)`. The `-z "$NOTES"` guard also matters: with empty input, `xargs ls -lt` runs `ls` with no arguments and lists the current directory, which looks like a result.

**Newest by mtime is often the wrong file.** Observed case: the newest file was a 65 KB technical log, while the actual next action lived in `HANDOFF-<topic>-<date>.md`, the second-newest. Stopping at the newest file alone loses the resume point.

So: open the newest file **and** every `HANDOFF-*` in or near the window. When the two disagree about what comes next, **the HANDOFF wins** — a HANDOFF exists precisely to say "start here". Name the file you took NEXT STEP from in `basis:`.

**Do not blind-`tail` a large file.** A guessed `tail -100` can sail straight past an in-progress marker sitting earlier. Locate the markers first, then read around the hits:

```bash
F=/abs/path/to/workspace/.planning/<file>          # absolute — each block is its own shell

# 1. every checkbox, NEVER tailed — this is the live work
grep -nE '^[[:space:]]*[-0-9.]*[[:space:]]*\[[ xX]\]' "$F"

# 2. structure, tail is fine here
grep -nE '^#{1,3} |NEXT|Resume|BLOCKED|IN PROGRESS' "$F" | tail -20
```

Unchecked boxes (`[ ]`) are the live work; the last checked box (`[x]`) is where the dev stopped.

**Never pipe the checkbox grep through `tail`.** Observed on a 65 KB state file: 83 marker hits but only **2** unchecked boxes in the whole file — and a combined `grep … | tail -40` showed **zero** of them, because 40 headings crowded them out. The command reported structure and hid the one thing it exists to find. Two greps, and the checkbox one runs untailed.

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

Running `gh` from inside each repo lets it infer the remote — no hardcoded repo list to rot. Repos with a non-GitHub remote (GitLab, Gitea, none) are skipped by the `grep -q github.com` guard; **say which repos were skipped**, because their open work is then invisible to this source.

**Check the identity, never change it.** Machines with several authenticated accounts frequently default to the wrong one. `gh auth switch` would mutate global `gh` state and break this skill's read-only promise — so read `gh auth status` instead. If the active account cannot see these repos, every `gh pr list` returns empty or errors, and the rule below would read that as "clean". When the identity looks wrong, say so and tag every PR line `[unverified]`.

`--limit 30` avoids both truncating real PRs and `SIGPIPE`-ing `gh` mid-write with a `head`. `exit 0` for the same reason as source 1: judge by output.

**This lists PRs only, not issues.** A touched-but-unlinked issue never appears here. Source 4 is the only place those surface.

Read `baseRefName` — a PR based on another branch, not the default branch, is a stacked PR and its green CI can be false.
`no-review` means nobody has reviewed yet; it is **not** an approval. Never print it as an empty bracket.

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

**Never leave the date pattern as a variable.** Each fenced block runs in a **separate shell**, so a `$D` set in source 1 is empty here — and an empty `grep` pattern matches **every** line. Observed: an unset pattern returned all 137 lines of a decisions log instead of the 2 dated rows, and the whole ledger lands in the readout looking like real signal. Substitute the literal dates from step 1 every time.

**Memory records what was true when it was written**, so a PR or issue it calls open may already be merged or closed. Verify any PR or issue number taken from memory before printing it in BLOCKED / WAITING:

```bash
gh pr view <number> --repo <owner/repo> --json state,title,mergedAt 2>&1 | head -5
```

If it comes back `MERGED` or `CLOSED`, it is not a blocker — drop it. If you cannot resolve which repo it lives in, print it tagged `[unverified, from memory]` and never as a plain live blocker. Printing a merged PR as still-blocking sends the dev to re-do finished work, which is the most expensive error this skill can make.

## Step 3 — the readout

Fixed shape. Values first, no story. Every figure carries a provenance tag; `basis:` names what produced it.

```
BLANK BRAIN RECAP — 2026-09-06 + 2026-09-07 (cold, today had 4 commits)

SHIPPED
  api-service     commit a1b2c3d  issue #101 rate-table split
                  -> deployed to staging                                  (measured)
  schema          commit e4f5a6b  migration 0007, new payee columns       (measured)

IN PROGRESS
  #118 phase B2   stopped at: loader cannot reach the mandate record
                  api-service [main]  M etl/loader.py  (real:1 filtered:2)  (measured)

BLOCKED / WAITING
  PR #204 api-service     open, 2 owner rulings pending      (gh-verified)
  pricing-rounding        waiting on analyst answer          [unverified, from memory]

NEXT STEP
  Do Job 1 in HANDOFF-promote-2026-09-07: write promote_settlement.py,
  dry-run against staging, then --apply.

basis: git log 19 repos, 2026-09-06 + 2026-09-07; git status --porcelain, noise-filtered;
       .planning/HANDOFF-promote-2026-09-07.md (next step);
       .planning/STATE-213-B.md (in-progress item);
       gh pr list 4 GitHub repos of 19, cross-checked vs MEMORY.md open threads
```

Rules for the block:

- **Four sections, always, in that order.** An empty section prints `(none)` — never delete it. A missing section makes the dev wonder if you looked.
- **SHIPPED is one line per feature-level change, never one per commit.** A single active day can produce 38 commits across 3 repos, most of them merges and review-round fixes — that is roughly 5 readout lines, not 38. Collapse by the unit the dev thinks in: the issue or PR (`#142 parties tab`), not the sha chain that delivered it. If a repo had commits but no feature landed, write one line saying work continued and where.
- **One line per item.** Three or more facts about one thing → columns, not a comma run-on.
- **Exactly one NEXT STEP.** A blank brain can hold one action. Extra candidates go in a single line after the block, then stop.
- **Legend every opaque token on first use** — `a1b2c3d` is a commit sha, `#101` an issue number, `0007` a migration revision. Gloss once, reuse bare.
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

One line, before Step 1: the workspace path printed in step 0.5 is the one you meant, the repo count is not `0`, and the identity is not empty. Those three are what every later step silently depends on. The fuller smoke test lives in [reference/tuning.md](reference/tuning.md).

## Known gaps

Read these before trusting a readout, and before "improving" the skill.

| Limit | Detail |
|---|---|
| The `<10` threshold is arbitrary | No data chose 10. It is a guess that a small commit count means "tail of yesterday". The header prints the count so a wrong call is visible; fix the header before fixing the number. |
| Warm/cold is untested on a close call | Verified only on an unambiguously fresh session. A mid-session run may pick warm when you wanted cold — the header says which, so check it. |
| `gh` covers GitHub remotes only | Repos on GitLab, Gitea, or with no remote contribute nothing to BLOCKED. Source 4 is the only thing standing between that and a false "nothing is blocked". |
| The noise filter is a denylist | It hides what it knows about. A genuinely new junk directory shows up as real work until it is added to `NOISE`. See [reference/tuning.md](reference/tuning.md). |
| Dates are typed by hand | Step 1 prints the dates; a transcription puts them into step 2. A typo yields an empty gather that looks like a quiet day. Cross-check the header against step 1's table. |
| Workspace root is inferred | `git rev-parse --show-toplevel` returns one repo, not a multi-repo parent. In a workspace of siblings, run from the parent or name it — otherwise the recap silently covers one repo out of many. |
| Repo discovery is `find`, not a glob or `ls` | Both alternatives fail silently-ish: `ls` can emit colour escapes that make `git -C` fatal under a swallowed stderr, and under `zsh` a `*/.git` glob matching nothing is a fatal error that kills the loop before its first iteration — measured in a single-repo workspace. Do not "simplify" `find` back to either. |
| `-maxdepth 2` is one level of siblings | A repo two levels down (`group/team/repo`) is invisible. Raise to 3 for that layout. |
| Shell word-splitting differs | Under `zsh`, unquoted expansions are not word-split, so any `for X in $VAR` silently collapses to one iteration. Every loop here uses literals or `while read` for that reason. |
| Glob lists are banned, not discouraged | Under `zsh` one unmatched pattern aborts the whole command, `2>/dev/null` does not suppress it, and the exit status stays `0` — so a missing `.planning/` hides an existing `notes/*.md` and the recap prints `(none)`. Every discovery step here uses `find`. |
| `allowed-tools` does not cover the compound scripts | Prefix matching applies to single commands, so the multi-line gather blocks still prompt. The frontmatter list helps the one-liners (`gh pr view`, `git shortlog`); expect approval prompts for the rest. |
| Agent-memory discovery is name-matched | The `grep -i` on the workspace directory name is a heuristic. A host whose slug convention differs returns nothing (safe) or another project's memory (not safe) — check the path before reading it. |
| Multiple git identities | One human often commits under two emails. Step 0.5 matches the *name*; an identity spelled differently is invisible until you widen the pattern. |
| Bot and teammate commits count | Step 2 has no author filter, so CI merges and teammate commits appear in SHIPPED. Attribute them rather than dropping them. |

## Reference

- [Per-workspace tuning](reference/tuning.md) — NOISE list, repo scope, planning-note and ledger paths, identity patterns, and the smoke test to run after changing any of them.
