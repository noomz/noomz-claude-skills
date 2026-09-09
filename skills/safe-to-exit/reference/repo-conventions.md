# Reading a repo's own conventions

Every repo decides what is committed, what stays on the machine, and how local knowledge gets out. Those decisions are written down — in `.gitignore` comments, in `CLAUDE.md` or `AGENTS.md`, in `CONTRIBUTING.md` — and they differ enough between repos that any fixed list of "knowledge directories" is wrong somewhere.

So source F discovers, it does not assume. This file explains its three findings, how each is graded, and how to report one.

## Contents

- [Why not a list of names](#why-not-a-list-of-names)
- [NESTED-REPO](#nested-repo)
- [LOCAL-BY-CONVENTION](#local-by-convention)
- [IGNORED-STORE](#ignored-store)
- [Quoting the constitution](#quoting-the-constitution)
- [A worked example](#a-worked-example)

## Why not a list of names

An earlier version probed a hardcoded list — `.planning`, `docs/kb`, `wiki`, `notes`. It worked on the repo it was written against and would have reported nothing for the next one, which is the worst failure available to a check whose empty output means "safe".

Git already knows what a repo ignores. `git status --porcelain --ignored` is the enumeration, and the repo's own instruction files say *why*. Between them there is nothing left to guess.

## NESTED-REPO

A git repo found under a path the parent **ignores**, or under one it merely leaves **untracked**. Source F probes three levels below each. **Read this finding first.**

It is invisible to every other source. The parent ignores or does not track it, so no parent-level `status`, `rev-list`, `diff` or `ls-files` mentions it — and source A's `find -maxdepth 2` misses it whenever it sits deeper, which is normal for a knowledge base under `docs/`.

Grade it exactly as you would grade the main repo, because it *is* a repo:

| Line | Grade |
|---|---|
| `upstream:(none)`, or `unpushed:` not 0, or `dirty:` not 0 | **BLOCKER** |
| `[no commits yet]` with `dirty:` not 0 | **BLOCKER** — work in a repo that has never committed anything |
| a `durable-path?` line beneath it | **BLOCKER** — see below |
| clean and fully pushed | not printed at all |

A `durable-path?` appears under a nested repo only when that repo has **no remote**. For a repo that can be pushed, push *is* the durable path — without that condition every ordinary code project advertises its build or codegen script as the workspace's way out. Measured: `clife-phoenix` on `origin/main` correctly stays silent while `docs/kb` on no remote surfaces `tools/export-shared.py`.

The trap: because the parent ignores it, everything else reports the workspace as fine. A clean parent tells you nothing about it.

## LOCAL-BY-CONVENTION

An untracked, un-ignored directory that **nothing has ever tracked** (`tracked:0`), holding files that predate this session.

| Line | Grade |
|---|---|
| `predating:` not 0 | NOTE — an established store |
| `predating:0` | **BLOCKER** — nothing predates today, so this is new work in no commit anywhere |

`predating:` is the whole test, and it is the only thing separating a settled habit from a brand-new directory. Somebody writing there for weeks without ever committing is a convention; a directory created an hour ago is not.

**Never propose committing an established one.** Committing a store the repo has kept local for 141 files is a change of convention presented as a repair, and it is not the skill's call. If the dev wants it tracked, that is a decision they make deliberately, not a remedy they accept at the end of a tired day.

## IGNORED-STORE

An ignored directory that was written today and is **not itself a repo** — if it were, `probe_repo` already reported it and the store line is suppressed as a duplicate.

It may still *contain* repos. `IGNORED-STORE vault/` prints alongside the `NESTED-REPO vault/kb` lines beneath it, and its `text-today:` count includes files inside those repos. That is double-reporting, not a miss.

| Line | Grade |
|---|---|
| with a `durable-path?` | **BLOCKER** — the repo's own way out was not taken |
| without one | NOTE — local by design; say which store, and stop |

Search for the script **inside** the store, never repo-wide. Measured: a repo-wide sweep returned four unrelated `export_*.sql` and `export.yaml` files and pushed the store's own `tools/export-shared.py` off the end of the list.

## Quoting the constitution

The grep at the top of source F pulls the repo's own words — `.gitignore` comments, and `never commit` / `stays untracked` lines from the agent instruction files, anchored on the match rather than the start of the line.

Quote the matching line when you report a store. It changes the finding from an accusation into a fact:

> `docs/kb` was written today and is ignored by design — `.gitignore:55` says *"LLM knowledge base — env/access details, stays untracked"*.

The dev wrote that line. Reporting it back is how they know you read the repo rather than pattern-matched it.

If the repo says nothing at all, say that too. A store with no declared rule and no export path is a judgement call, and the dev should know they are making one.

## A worked example

One real workspace, as source F reports it today. Note the shapes: repo lines carry no trailing slash, store lines do.

```
NESTED-REPO docs/kb [main] upstream:(none) unpushed:29 dirty:13
  durable-path? docs/kb/tools/export-shared.py
IGNORED-STORE docs/local/ text-today:1 text-predating:36
LOCAL-BY-CONVENTION .planning/ tracked:0 ondisk:229 predating:162
```

| Finding | Grade | Why |
|---|---|---|
| `docs/kb` | **BLOCKER** | A repo with no remote, 29 unpushed commits and 13 dirty files — including the decisions ledger. Genuinely one disk, and its own export script has not run. |
| `docs/local/` | NOTE | Ignored, one file today, no export script. Local by design. |
| `.planning/` | NOTE | 162 files predate today and none was ever tracked. Committing it changes a convention. |

Before source F existed, the check reported this workspace with a single blocker — an untracked planning note — and proposed committing it. It got the grade wrong on the one it saw, and never saw the one that mattered.

That is the failure this file exists to prevent: **a knowledge store is not safe because it is invisible.**
