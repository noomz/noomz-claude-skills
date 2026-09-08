# Reading a repo's own conventions

Every repo decides for itself what is committed, what stays on the machine, and how local knowledge gets out. Those decisions are written down — in `.gitignore` comments, in `CLAUDE.md` or `AGENTS.md`, in `CONTRIBUTING.md` — and they differ enough between repos that any fixed list of "knowledge directories" is wrong somewhere.

So source F discovers, it does not assume. This file explains what each of its three findings means and how to report it.

## Contents

- [Why not a list of names](#why-not-a-list-of-names)
- [NESTED-REPO](#nested-repo)
- [LOCAL-BY-CONVENTION](#local-by-convention)
- [IGNORED-STORE](#ignored-store)
- [Quoting the constitution](#quoting-the-constitution)
- [A worked example](#a-worked-example)

## Why not a list of names

An earlier version of this skill probed a hardcoded list — `.planning`, `docs/kb`, `wiki`, `notes`. It worked on the repo it was written against and would have reported nothing for the next one, which is the worst possible failure for a check whose empty output means "safe".

Git already knows what a repo ignores. `git status --porcelain --ignored` is the enumeration, and the repo's own instruction files say *why*. Between them there is nothing left to guess.

## NESTED-REPO

A git repo living inside a path the parent ignores. **Read this one first.**

It is invisible to every other source. The parent ignores it, so no parent-level `status`, `rev-list`, `diff`, or `ls-files` will ever mention it — and `find -maxdepth 2` from the workspace root misses it whenever it sits a level deeper, which is common for a knowledge base under `docs/`.

Grade it exactly as you would grade the main repo, because it *is* a repo: `upstream:(none)` means nobody else can see it, `unpushed:N` means N commits exist on one disk, `dirty:N` means N files are not even committed there.

The trap: because the parent ignores it, everything else reports the workspace as fine. A clean parent tells you nothing about it.

## LOCAL-BY-CONVENTION

An untracked, un-ignored directory that **nothing has ever tracked** (`tracked:0`), holding files that predate this session.

That combination is a settled habit, not an oversight. Somebody has been writing there for weeks and never committed any of it. Treat new files there as a NOTE, and say which store they are in so tomorrow starts there.

**Never propose committing it.** Committing a store the repo has kept local for 141 files is a change of convention presented as a repair, and it is not the skill's call. If the dev wants it tracked, that is a decision they make deliberately, not a remedy they accept at the end of a tired day.

Distinguish this from a genuinely new directory, which also shows `tracked:0` but has *no* files predating today. That one is a real blocker — it is new work in no commit anywhere.

## IGNORED-STORE

An ignored directory, not a repo, that was written today.

Content there is on this machine only. No commit reaches it; that is what ignored means. Two cases:

- **A `durable-path?` was found** — an `export`/`publish`/`share` script inside the store. That is the repo's own way of getting the content out, and if it has not run since the store changed, the path exists and was not taken. **Blocker**, and the remedy is to run that script, never to commit the store.
- **No durable path** — local by design. Say which store and how many files, and stop. Nothing to fix.

Search for the script **inside** the store, never repo-wide. Measured: a repo-wide sweep on one workspace returned four unrelated `export_*.sql` and `export.yaml` files and pushed the store's own `tools/export-shared.py` off the end of the list.

## Quoting the constitution

The grep at the top of source F pulls the repo's own words — `.gitignore` comments and `never commit` / `stays untracked` lines from the agent instruction files.

Quote the matching line when you report a store. It changes the finding from an accusation into a fact:

> `docs/kb/` was written today (8 text files) and is ignored by design —
> `.gitignore:55` says *"LLM knowledge base — env/access details, stays untracked"*.

The dev wrote that line. Reporting it back is how they know you understood the repo rather than pattern-matched it.

If the repo says nothing at all, say that too. A store with no declared rule and no export path is a judgement call, and the dev should know they are making one.

## A worked example

One real workspace, as source F reported it:

```
NESTED-REPO docs/kb/ [main] upstream:(none) unpushed:29 dirty:13 text-today:8
LOCAL-BY-CONVENTION .planning/ ondisk:228 predating:141
IGNORED-STORE docs/local/ text:37 predating:54 today:1
```

Three findings, three different verdicts:

| Finding | Grade | Why |
|---|---|---|
| `docs/kb/` | **BLOCKER** | A repo with no remote, 29 unpushed commits and 13 dirty files — including the decisions ledger. Genuinely one disk. |
| `.planning/` | NOTE | 141 files predate today and none was ever tracked. Local by convention; committing it changes that. |
| `docs/local/` | NOTE | Ignored, one file today, no export script found. Local by design. |

Before source F existed, the check reported this workspace with a single blocker — an untracked planning note — and proposed committing it. It got the grade wrong on the one it saw, and never saw the one that mattered.

That is the failure mode this file exists to prevent: **a knowledge store is not safe because it is invisible.**
