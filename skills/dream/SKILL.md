---
name: dream
description: Offline "dreaming" pass over Claude Code memory folders (MEMORY.md index plus one note per fact). A bundled script lints the index, repairs broken wiki links and checks a project's own written caps; the agent then verifies notes against the repo, git and transcripts, and corrects, merges, retires to archive/ or promotes them, and rebuilds a small index. Use when the user says "dream", "clean up memory", "memory is stale", "MEMORY.md is cut off", or after a milestone. Nothing changes without approval, and every write is preceded by a snapshot.
allowed-tools: Bash(python3:*), Bash(git log:*), Bash(git branch:*), Bash(git status:*), Bash(git show:*)
---

# Dream

Memory drifts. Status notes outlive the status, links point at renamed notes, the index grows past the part Claude Code loads (the first 200 lines or 25 KB of `MEMORY.md`), and a project's own written rules stop being true. This skill is the offline pass that fixes that: a script does the mechanical half, you do the judgment half, and the user approves before anything is written.

Memory is for durable facts and tested rules that the repo, git and the screen will not show next time: why a thing is the way it is, an owner's decision, a trap that cost hours. It is not a log of what happened. Judge each note by that purpose, not by a rigid write rule; fixed rules such as "record only failures" made stronger models worse at memory in the research this pass comes from.

Run it from anywhere. `<skill-root>` is this skill's folder; the script is `<skill-root>/scripts/dream.py` (Python 3.11+, standard library only).

## Step 1: mechanical report

Run these and show the user the output (the script never prints a secret value; it names the note and the kind only):

```bash
python3 <skill-root>/scripts/dream.py lint                 # one row per project
python3 <skill-root>/scripts/dream.py lint <project-part>  # detail for one project
python3 <skill-root>/scripts/dream.py fix-links <project-part>   # dry run
python3 <skill-root>/scripts/dream.py rules <workspace>    # only when the project has a dream.toml
```

Work one project at a time. The memory root is `--root`, `$DREAM_MEMORY_ROOT`, `$CLAUDE_CONFIG_DIR/projects`, then `~/.claude/projects`; `--memory PATH` names one folder directly. Columns, flags and the config format are in [reference/commands.md](reference/commands.md). To give a project written caps, copy [examples/workspace/dream.toml](examples/workspace/dream.toml) (status board, ledger, wiki index, handoffs) or [examples/single-repo/dream.toml](examples/single-repo/dream.toml) (a goal only) to `<workspace>/.claude/dream.toml` and edit it.

## Step 2: verify

For each note that states something checkable (a file, script, flag, branch, port, path, version), check it against the main checkout with read-only git and the filesystem. Check first how far the checkout is behind its remote branch (`git status -sb`): when it is behind, verify against the remote-tracking branch (`git show origin/main:path`, `git log origin/main`), because a stale checkout reports merged work and existing files as missing. Say when the remote refs were last fetched; anything newer is unverified. Do not trust the note over the code. For status notes, compare with `git log` and `git branch -a`.

Transcripts (`*.jsonl`, often hundreds of megabytes) are evidence of last resort: search them for one specific term, never read one whole. Delegate bulk reading (many notes, many transcripts) to cheaper subagents and ask for conclusions with evidence lines, not file dumps. Subagents never write to shared memory; they return candidate notes and verdicts, and you write them.

If there is no checkout and no transcript for a note, it cannot be verified. Mark it `not verified since <date>` in its frontmatter or index hook and leave the content alone.

## Step 3: decide per note

Every note gets exactly one verdict:

| Verdict | When |
|---|---|
| keep | still true, still not derivable from the repo |
| correct | the fact changed; fix it and say what it was checked against |
| merge | duplicates a named note; fold in what is unique, retire the rest |
| retire | stale, derivable from the repo, or finished; move to `archive/` |
| move | it is live status; put it in the project's dated state file in the repo |
| promote | it is a rule or fact worth loading always; put it in the index, or in the repo's own knowledge base |

Rules for the decision, with examples, are in [reference/decisions.md](reference/decisions.md). The short version: one fact has one owner. If the repo has a wiki, glossary, decision records or a ledger, memory holds a pointer, never a second copy. Status belongs in a dated state file in the repo. A rule repeated across projects moves up to the parent folder's instruction file. Notes are never deleted: retire means move to `archive/`, which lint ignores.

## Step 4: index and topic pages

Keep `MEMORY.md` under the load limit: one line per note, a short hook, curated order. `dream.py propose` keeps your curated lines, shortens only lines over budget and appends unlisted notes. Past roughly 150 notes, the index lists topic pages and each topic page lists its notes: one page per subject, and parallel agents never write the same page.

## Step 5: propose, then apply

1. Write the plan in the staging folder (`dream-staging/` next to `memory/`, or `--out`): `plan.md` with one row per note giving action, reason and evidence, plus the proposed `MEMORY.md` from `dream.py propose` and any new topic pages. Format: [reference/plan.md](reference/plan.md).
2. Show the user the summary: counts per verdict, index size before and after, anything risky.
3. Apply only after the user approves, with the snapshot that every `--apply` takes first (`memory-backups/` beside the memory folder; the path is printed). A git-tracked memory folder with uncommitted changes in the target files is refused unless the user says `--force`.

```bash
python3 <skill-root>/scripts/dream.py fix-links <project> --apply
python3 <skill-root>/scripts/dream.py retire <project> --note old-status --note other --apply
python3 <skill-root>/scripts/dream.py apply <project> --apply     # rebuild MEMORY.md
```

Corrections and merges you make by editing notes directly: run `dream.py snapshot <project>` first.

## Step 6: report

Give the user, per project: index size before and after (bytes and lines), notes corrected, retired, moved and promoted, links fixed, and what could not be verified and why. Name every note you left alone because the evidence was missing. Never run `--apply` on a memory folder the user did not approve in this session.
