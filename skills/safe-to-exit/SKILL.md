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

The script that resolves the root and counts repos is in [reference/scope-resolution.md](reference/scope-resolution.md#the-script). Run it once, print its output, reuse it.

**Stop here and read the count before running anything else.** Scope is settled first, every time — the gate is the repo count at the resolved root, not whether you walked upward to find them.

| `inrepo` | repos | What to do |
|---|---|---|
| `true` | 1 | Proceed. This is the ordinary case and needs no question. |
| `true` | more than 1 | Nested repos or submodules below this one. Ask before including them. |
| `false` | 1 or more | **`git rev-parse` failed and the root fell back to `pwd`.** You are sitting in a workspace parent, not a project. Ask; never sweep. |
| either | 0 | Not a git repo and none below it. Say so and stop — sources A, B, C and E would all return empty and read as a clean bill of health. |

When you have to ask, offer three options and wait: **this session's writes only** (usually what the dev means, and the cheapest), **one named repo**, or **all N** (an explicit, informed sweep). How to resolve each option, and why this gate is hard (a 19-repo sweep was interrupted before any verdict appeared), are in [reference/scope-resolution.md](reference/scope-resolution.md#asking-which-scope).

Whatever scope is chosen, **name it in the readout header and in `basis:`** — `1 repo (this session's writes)` reads very differently from `19 repos`, and a scope the dev cannot see is one they cannot correct.

## Step 1 — six sources, gathered IN PARALLEL

Send them as separate Bash calls in **one** message. They are independent; a sequential chain here is the failure mode. Substitute the literal root from step 0.5 into each block — **each fenced block runs in its own shell**, so a variable set in an earlier block is empty here.

The Bash tool on this machine runs **zsh**, which does not word-split unquoted expansions. Every loop below uses `while read` or a literal list, and every `@{u}` is quoted, because zsh brace-expands a bare one. Do not "simplify" either back.

Each source has an exact script and a note on how to read its output. **Read the file for a source before running it** and run its block as written — the patterns are bracket-class regexes and quoting-sensitive, and every past bug in this skill exited `0` and printed something that looked fine.

- **A — git state: what would be lost.** Per repo: `upstream`, `unpushed`, `unreachable`, `behind`, `stash`, `staged`, `dirty`, `filtered`, and `MIDWAY:` for an interrupted rebase, merge, cherry-pick, revert or bisect. Judge by output, never by exit status.
- **B — secrets and junk about to be committed.** `SECRET-IN-TREE`, `ALREADY-TRACKED`, `JUNK`. Match the path, never the raw porcelain line. A hit is a question, not a verdict; never print the file's contents.
- **C — unfinished work markers.** `SKIP`/`TODO` lines this session added (diff vs `HEAD` plus whole untracked files), then unchecked boxes in plan notes touched today. Stay session-scoped; never widen to the whole repo.
  Read [reference/sources-a-c.md](reference/sources-a-c.md) before running A, B or C.
- **D — what keeps running after you leave.** Dev servers, watchers, listeners, tmux, `.omc/state`, plus agents and loops that no shell command shows: unreported subagents in this conversation, `ListAgents`, `TaskList`, `/loop`, `ralph`/`autopilot`/`ultragoal`, `CronList`, armed artifact watches. A running agent or active loop is a **blocker**.
- **E — what waits on someone else.** `gh pr list` per GitHub-remote repo: your open PRs and review requests. Empty output means the repos you could query are clean, never "nothing is pending"; if the `gh` identity looks wrong, tag the section `[unverified]`. Name non-GitHub repos that were skipped. Never `gh auth switch`.
- **F — where this repo keeps its memory.** Asks git what is ignored or untracked and what the repo's own docs say about it: `NESTED-REPO`, `IGNORED-STORE`, `LOCAL-BY-CONVENTION`. `NESTED-REPO` is the one to read first; quote the repo's own words when reporting a store.
  Read [reference/sources-d-f.md](reference/sources-d-f.md) before running D, E or F; read [reference/repo-conventions.md](reference/repo-conventions.md) to interpret F's three findings.

## Step 2 — grade every finding

The readout is only useful if the grades are consistent. Grade by one question: **what happens if the dev closes the laptop right now?**

| Finding | Grade |
|---|---|
| Interrupted rebase / merge / cherry-pick | **BLOCKER** |
| Secret staged, or already tracked | **BLOCKER** |
| Running subagent, active loop or scheduled mode | **BLOCKER** |
| `unpushed:N` where N is not 0 | **BLOCKER** |
| `unreachable:N` where N is not 0 | **BLOCKER** |
| Untracked files not matching the junk denylist | **BLOCKER** |
| `NESTED-REPO` with `unpushed:` not 0, `upstream:(none)`, or `dirty:` not 0 | **BLOCKER** |
| `NESTED-REPO … [no commits yet]` with `dirty:` not 0 | **BLOCKER** |
| `NESTED-REPO` with `upstream:(none)` and a `durable-path?` line | **BLOCKER** |
| `IGNORED-STORE` with a `durable-path?` line | **BLOCKER** |
| `IGNORED-STORE` with no `durable-path?` | NOTE |
| `LOCAL-BY-CONVENTION` with `predating:` not 0 | NOTE |
| `LOCAL-BY-CONVENTION` with `predating:0` | **BLOCKER** |
| Tracked edits uncommitted | **BLOCKER** |
| `.only` test added this session | **BLOCKER** |
| Skipped test added this session | NOTE |
| Dev server, watcher, or tmux session still up | NOTE |
| Stash entries | NOTE |
| New TODO/FIXME in this session's diff | NOTE |
| Unchecked boxes in a plan touched today | NOTE |
| In-progress work with no HANDOFF/STATE written | NOTE |
| Your PR with `CHANGES_REQUESTED` or failing checks | NOTE |
| PR with review requested from you | NOTE |
| Untracked files matching the junk denylist | NOTE |

What breaks if each is ignored is in [reference/grading-and-readout.md](reference/grading-and-readout.md#why-each-finding-is-graded-so). Read it when a grade is disputed or the finding is borderline.

A dirty tree blocks on its own, deliberately. `.only` and `skip` are not the same finding — read the matched line before grading, since source C labels both `SKIP`. Reasoning and the one-row change that quiets the common case: [reference/grading-and-readout.md](reference/grading-and-readout.md#grading-judgement).

Then the verdict is mechanical — **do not soften it**:

- any unaccepted BLOCKER → **NOT SAFE**
- zero blockers, one or more notes → **SAFE WITH NOTES**
- nothing at all → **SAFE**
- any source that errored or could not run → **NOT SAFE (unverified)**, naming the source

An **accepted blocker** is one the dev was shown, chose to leave, and which is now written into the handoff note. It still prints, tagged `accepted`, and the verdict reads `NOT SAFE (1 accepted: midway rebase, recorded in HANDOFF)`. It is a decision on the record, not a cleared one. Why this category exists: [reference/grading-and-readout.md](reference/grading-and-readout.md#accepted-blockers).

A source that failed is not a source that passed, and "safe" earned from a silent failure is the only output of this skill that can actually hurt someone.

## Step 3 — the readout

Fixed shape, values first, no story. Every line carries the remedy next to the finding, so the dev never has to go looking for the command.

Sections in order: a header line (`SAFE TO EXIT — <verdict> — <scope> @ <date time> (<mode>)`), a count line (`N blockers, N notes, N repos, 6/6 sources ran`), then BLOCKERS, NOTES, CARRY FORWARD, VERDICT, and a closing `basis:` line naming the scope, the sources and the `gh` identity. A full example is in [reference/grading-and-readout.md](reference/grading-and-readout.md#readout-example) — copy its shape.

Rules for the block:

- **Four sections, always, in that order.** An empty one prints `(none)`. A deleted section makes the dev wonder whether you looked.
- **One line per finding, remedy on the same line.** Three or more facts about one thing become columns, not a comma run-on.
- **Print the source count** (`6/6 sources ran`) — the difference between a clean report and a blind one — and write **CARRY FORWARD for tomorrow's blank brain**, not for tonight: one or two sentences, the content a HANDOFF note would carry.
- **The verdict line is the last word and is never hedged.** No "mostly safe", no "probably fine".

## Secure mode

Only after the readout is on screen and the dev asks. The ladder, the exact commands, the consent rule, and the permanently banned operations are in **[reference/remediation.md](reference/remediation.md)** — read it before running any remedy, including one that looks obvious.

The short version: safest first (write a handoff note, commit, push), each command printed, then waited on, one rung at a time, re-run the check at the end. Nothing that discards, resets, force-pushes, or cleans is ever on the table.

Every command in `allowed-tools` is read-only, deliberately, so each secure-mode mutation hits a normal permission prompt as a second gate. Never add mutating patterns to `allowed-tools`; the rationale is at the end of [reference/remediation.md](reference/remediation.md#why-allowed-tools-is-read-only).

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
