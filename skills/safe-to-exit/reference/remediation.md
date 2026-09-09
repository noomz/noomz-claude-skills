# Remediation ladder

This file is deliberately conservative. Everything here either **creates** a record of work or **moves** it somewhere safer. Nothing here removes anything.

## Contents

- [The consent rule](#the-consent-rule)
- [The ladder](#the-ladder)
- [Rung 1 — write the handoff](#rung-1--write-the-handoff)
- [Rung 2 — stop what is running](#rung-2--stop-what-is-running)
- [Rung 3 — unstage the secrets](#rung-3--unstage-the-secrets)
- [Rung 4 — commit the work](#rung-4--commit-the-work)
- [Rung 5 — get it off this disk](#rung-5--get-it-off-this-disk)
- [Rung 6 — finish or park the midway state](#rung-6--finish-or-park-the-midway-state)
- [Banned, regardless of phrasing](#banned-regardless-of-phrasing)
- [Closing out](#closing-out)

## The consent rule

Three parts, all required:

1. **The check readout is already on screen.** A remedy chosen from an unseen audit is a guess about a repo neither of you has looked at.
2. **The command is printed before it runs**, on its own line, exactly as it will execute. Not a description of it.
3. **Then stop, and wait for the dev to say go.** Printing is not asking. End your turn on the printed command and let them answer — a rung that prints and executes in the same breath has shown the dev the command only in the sense that a receipt shows you a purchase.
4. **One rung at a time.** Report what happened, then wait again before the next. A batch of six commands under a single "yes" means the dev approved a summary, not the operations.

Rule 3 is the one that is easy to satisfy in letter and break in spirit, so state it as a behaviour: **the ladder advances only on a new message from the dev.** Not on your own judgement that the last rung went fine, not on the fact that the remaining rungs are less risky than the one they already approved, and not on a permission prompt being accepted.

**A permission prompt is not the go-ahead.** Prompts get pre-approved, remembered, or answered on reflex, and in some permission modes they never appear at all. They are a second, independent gate — useful precisely because they are mechanical — but the consent this ladder requires is the dev, in the conversation, after the readout, saying to do this rung.

"Make it safe" authorises this ladder and nothing else. It never reaches the banned list — not on a second ask, not with "I'm sure", not with "just do whatever". If the dev genuinely wants a destructive operation, they can run it themselves, in their own shell, where the consequence is unambiguous.

**If a rung fails, stop the ladder.** A failed commit followed by a push is how a partial state gets published. Report the failure and let the dev decide.

## The ladder

Safest first. This ordering is not cosmetic — each rung reduces what the next one can cost.

| Rung | Act | Why it sits here |
|---|---|---|
| 1 | Write the handoff | Costs nothing, reversible, and it is the only rung that survives you being wrong about everything else |
| 1b | Take the repo's own durable path, if one was found | Records rather than removes — but it runs a script you did not write, and publishing is not reversible. It sits beside rung 1 rather than inside it for that reason |
| 2 | Stop running agents and servers | Nothing else is stable while something is still writing to the repo |
| 3 | Unstage secrets | Must happen before any commit, or the commit is the leak |
| 4 | Commit the work | Turns "on this disk" into "in this repo" |
| 5 | Push or set an upstream | Turns "in this repo" into "off this laptop" |
| 6 | Finish or park a midway rebase | Highest judgement, so it goes last, and usually the dev does it |

## Rung 1 — write the handoff

Offer this first, always — it is the one rung worth proposing even when the dev declines everything else. It still needs the go-ahead: rung 1 is the only rung that creates a file, and file creation is the mutation a reader is least likely to notice is a mutation. It is pure gain: the note is what tomorrow's recap reads, and writing it costs nothing that could be lost.

Append to the repo's existing planning note if one exists (`.planning/STATE*.md`, `HANDOFF*.md`, `notes/`); create `.planning/HANDOFF-<topic>-<date>.md` only if none does. Match the file's existing shape rather than imposing one.

Four things, no more:

```markdown
## <date> — stopped here

- **Doing:** one sentence on the task in flight
- **Stopped at:** the specific thing that was not working, or the last step finished
- **Next:** exactly one action to start with
- **Watch out:** anything left in an odd state (skipped test, midway rebase, stubbed function)
```

Write what is true, including "this did not work." A handoff that reads like a status report to a manager is useless to the person who has to resume it.

### The repo's own durable path

If source F found a store that was written today **and** an `export`/`publish`/`share` script inside it, that script is how this repo gets that content off the machine. A commit will not do it — the store is ignored or local by convention, which is why the script exists.

Name it, show the command, and wait:

```
docs/kb/ was written today (6 files) and is gitignored by design.
Its declared durable path is docs/kb/tools/export-shared.py, which has not run.
Run it?   python3 docs/kb/tools/export-shared.py
```

Three constraints, because this is the one rung that runs code you did not write:

- **Never run it unprompted, and never on a guess.** The detection is name-based. A file called `export-shared.py` might publish to a shared drive, might open a PR, might do nothing you expect. If you cannot tell what it does from a quick read, say so and let the dev run it.
- **It may be outward-facing.** Publishing sends content somewhere other people can see, which is not reversible by deleting the output afterwards. Treat it with more care than a commit, not less.
- **If it fails, stop the ladder.** A half-run export is worse than none, because the next check may see fresh output and call the store exported.

When there is no such script, say the store is local by design and move on. That is a NOTE, not a problem to solve.

## Rung 2 — stop what is running

**Agents and loops first, processes second.** A subagent can still write files; a dev server cannot.

- A subagent with no completion notification: **wait for it**. Do not cancel work whose output you have not seen — that discards a result the dev paid for. If they want it stopped anyway, `TaskStop` on that task, and say what was lost.
- An active loop or mode (`/loop`, `ralph`, `autopilot`, `ultragoal`): cancel it explicitly — `ScheduleWakeup` with `stop: true`, or `/oh-my-claudecode:cancel`. Left armed, it wakes the session up after the dev has gone.
- A scheduled routine or artifact watch: leave it unless the dev asks. Those are meant to outlive the session.
- Dev servers and watchers: kill only PIDs that appeared in the source D output and that the dev recognises.

```bash
kill 40311          # named in the readout, confirmed by the dev
```

Plain `kill` sends `TERM`, which lets the process flush and shut down. **Never reach for `kill -9`** — a watcher killed hard can leave a corrupt cache or a half-written build that costs tomorrow morning.

Never `pkill -f node`. It matches processes the session never started, including things the dev is running in another window.

## Rung 3 — unstage the secrets

Before any commit. Unstaging is reversible; committing a credential is not.

```bash
git -C <repo> restore --staged path/to/.env
```

That takes it out of the index and leaves the file exactly as it is on disk. Do not delete it, do not rewrite it, do not move it.

**`--staged` is the whole safety property of this command.** `git restore --staged <path>` unstages. `git restore <path>` — the same command minus one flag — overwrites the working file from the index and destroys the edits, which is why it sits on the banned list below. This rung is the ladder's safest, and dropping one flag turns it into an unrecoverable deletion of the exact file the rung exists to protect. Type the flag deliberately every time.

Then check whether it should have been ignored all along, and say so — do not silently edit `.gitignore` as part of a remedy:

```bash
git -C <repo> check-ignore -v path/to/.env || echo "not ignored — add it?"
```

**If the file is already tracked**, unstaging does not help: it is in history. That is beyond this skill. Say plainly that it is committed, name the file, and stop — history rewriting and credential rotation are decisions for a clear head, not for the last two minutes of a session. If it has been pushed, the credential should be treated as exposed and rotated, and saying so is more useful than any command.

## Rung 4 — commit the work

The commit message is the honest part. This is a checkpoint, not a delivery — say so, so that nobody reading `git log` next week believes a stub was finished.

```bash
git -C <repo> add -A
git -C <repo> commit -m "wip: <what is actually done>

Checkpoint at end of session. Not complete: <what is missing>."
```

Rules that keep this rung safe:

- **Never commit a local-by-convention store to "fix" it.** If source F reported `tracked:0` with files older than today, the repo has chosen not to track that path. Committing 228 files of `.planning/` because one of them is new is a change of convention presented as a repair, and it is not yours to make. Exclude it and say why.

- **Never `git add -A` without showing the file list first.** The audit already printed it; if the dev is adding files they have not seen, the noise filter hid something.
- **Exclude anything source B flagged.** If a secret is still in the tree, this rung does not run — go back to rung 3.
- **Never write a message that claims completion.** "implement retry path" for a stubbed function is a lie that survives in history and gets read as truth during a later bisect.
- **Follow the repo's own commit convention** if it has one; a checkpoint commit that breaks a hook or a lint rule just fails and wastes the moment.

## Rung 5 — get it off this disk

```bash
git -C <repo> push                              # has an upstream
git -C <repo> push -u origin <branch>           # upstream:(none) in the audit
```

Plain `push` only. If it is rejected because the remote moved ahead, **stop and report it** — do not pull, do not rebase, do not force. A merge or rebase resolved at the end of a session, on someone else's behalf, is a conflict resolved without attention.

Pushing a WIP branch is normal and good. Pushing WIP to a **shared** branch is not: if the branch is the default branch or one with an open PR others are reviewing, say so and let the dev choose.

## Rung 6 — finish or park the midway state

An interrupted rebase, merge, cherry-pick, or revert. Show the state, then hand it over:

```bash
git -C <repo> status
git -C <repo> rebase --continue     # only if the conflicts are genuinely resolved
```

**The default is to leave it exactly as it is and write it into the handoff.** That is the whole of rung 6 unless the dev explicitly asks for more. A midway rebase is not urgent: it survives the night untouched, and the risk of finishing someone else's conflict resolution at the end of a session outweighs the tidiness of a clean `git status`.

The `rebase --continue` line above exists for one case only — the dev says the conflicts are resolved and asks you to continue. Do not infer that from a clean-looking tree; a rebase can look resolved and be half-done. `--abort` is not on this ladder at all: it discards conflict resolution already performed by hand, which puts it on the banned list, not in a remedy.

What matters is that tomorrow's cold start finds the note *before* it finds the confusing repo state. That is rung 1's job, which is why rung 1 comes first.

## Banned, regardless of phrasing

These are not on the ladder and never join it. "Yes do it", "clean it up", "I don't care, just make it safe" — none of them reach this list. If asked directly, name the command, say it is the dev's to run, and move on without arguing.

| Command | What it costs |
|---|---|
| `git reset --hard` | Deletes uncommitted work outright, no recovery |
| `git checkout -- .` / `git restore <path>` over uncommitted edits | Same, quieter |
| `git clean -fd` / `-fdx` | Deletes untracked files, including the ones never staged, including `.env` |
| `git push --force` / `--force-with-lease` | Rewrites shared history at the worst possible moment |
| `git stash drop` / `git stash clear` | Discards the one place work was deliberately parked |
| `git rebase --abort` on someone's behalf | Throws away conflict resolution already done by hand |
| `git rebase --skip` | Worst of the set: silently drops the conflicting commit and says almost nothing |
| `git merge --abort`, `cherry-pick --abort`, `revert --abort`, `am --abort` | Same cost as `rebase --abort`, same trigger, reachable from rung 6's stated scope |
| `git stash` / `git stash push` | Hides work from the closing re-check; the next verdict is a false SAFE |
| `git commit --amend` | Overwrites a commit — and rung 4 anticipates a hook rejecting the first one, which is exactly when it gets reached for |
| `git worktree remove` | Uncommitted work in a linked worktree goes with it |
| `git branch -D` | Unreferenced commits become unreachable |
| `git filter-branch` / `git filter-repo` / BFG | History rewriting is never an end-of-session act |
| `kill -9`, `pkill -f <pattern>` | Corrupt state, and kills processes the session never started |
| `rm -rf` anything | Not this skill's business at any time |
| `gh pr merge`, `gh pr close`, `gh auth switch` | Outward-facing or identity-mutating; not part of ending a session |
| Editing `.gitignore` as a silent side effect | Hides a real finding behind a config change |

The pattern behind the list: **anything that removes, discards, or overwrites is out; anything that records or relocates is in — and anything that makes a finding invisible to the closing re-check is out too, even when it preserves the content perfectly.**

That third clause is not decoration. Without it, `git stash push` passes the rule: it relocates, it destroys nothing, it is not on any list. It is also the single most effective way to produce a **false SAFE** from this skill. Stashing moves the entire working tree somewhere source A's `dirty:` field no longer reports, the closing re-check comes back clean, and the verdict flips to SAFE — arrived at by following this file's own rules correctly. Combined with a midway rebase it reliably loses an afternoon. A remedy that makes the audit quieter without making the session safer is the failure this whole document exists to prevent.

## Closing out

Re-run the check after the last rung. This is not ceremony — a push can fail, a commit can be rejected by a hook, and a remedy that silently did not apply leaves the dev walking away on a stale "SAFE".

Print the fresh verdict in the same shape as before, plus one line naming what changed:

```
SAFE TO EXIT — SAFE WITH NOTES — claude-skills @ 2026-09-08 18:51 (secure, re-checked)
applied: handoff written, vite pid 40311 stopped, .env unstaged, 4 files committed, pushed
```

If the second check still reports an **unaccepted** blocker, say so and stop. Two failed attempts at the same rung means something about the repo does not match the model in this file — worth the dev's attention while they are still at the keyboard, and worth a look at the Known gaps table afterwards.

An **accepted** blocker is different and must not be read as a failure. A midway rebase the dev was shown, chose to leave, and which rung 1 wrote into the handoff is the ladder working as designed — rung 6's default is to leave it. Print it tagged `accepted` and let the verdict say so:

```
NOT SAFE (1 accepted: midway rebase, recorded in HANDOFF-2026-09-08.md)
```

Without that distinction, following rung 6's own advice guarantees a bare NOT SAFE on the re-check and sends the dev to debug a skill that did the right thing.
