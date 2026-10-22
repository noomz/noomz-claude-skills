# Grading judgement and the readout example

Detail behind Steps 2 and 3: the two grading rows that carry a judgement, the accepted-blocker category, and a full readout to copy the shape from.

## Why each finding is graded so

The grading question: **what happens if the dev closes the laptop right now?**

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
| `NESTED-REPO` with `upstream:(none)` and a `durable-path?` line | **BLOCKER** | The repo cannot be pushed anywhere, and the script inside it is the only declared way out. Run it; do not treat the commit as the fix |
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

## Grading judgement

Two rows carry a judgement worth stating. **A dirty tree blocks on its own, deliberately** — uncommitted edits exist on exactly one disk, and this skill is asked precisely when the dev stops watching that disk. The cost is that NOT SAFE becomes the common answer; read that as the tool working, and note that a single `git commit` usually moves it. If you would rather the common case be quieter, the change is one row: NOTE when a dirty tree stands alone, BLOCKER in combination with `upstream:(none)`, a `MIDWAY:` state, or a secret. **`.only` and `skip` are not the same finding** — `.only` silently disables the rest of the suite so a green run means nothing; a deliberately skipped test is ordinary. Source C labels hits `SKIP` and `TODO` but cannot tell `.only` from `skip`, so read the matched line before grading.

## Accepted blockers

An **accepted blocker** is one the dev was shown, chose to leave, and which is now written into the handoff note. It still prints, tagged `accepted`, and the verdict reads `NOT SAFE (1 accepted: midway rebase, recorded in HANDOFF)`. This exists because the skill's own advice on the highest-stakes finding — a midway rebase — is to leave it alone overnight. Without the category, following that advice guarantees a bare NOT SAFE and makes the closing re-check look like a malfunction. An accepted blocker is a decision on the record, not a cleared one.

That last verdict rule matters most. A source that failed is not a source that passed, and "safe" earned from a silent failure is the only output of this skill that can actively hurt someone.

## Readout example

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
