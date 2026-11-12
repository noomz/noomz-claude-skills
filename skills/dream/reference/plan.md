# The plan file

## Contents

- Where it goes
- Format
- The summary shown to the user
- Applying it

## Where it goes

In the staging folder, never in the memory folder: `dream-staging/` beside `memory/`, or the folder passed to `dream.py propose --out`. Staging holds `plan.md`, the proposed `MEMORY.md`, and any new topic pages. The user reviews it before anything is applied.

## Format

One row per note you looked at. Notes you keep still get a row, so the user can see the pass covered them.

```markdown
# Dream plan: <project>, <date>

Checked against: checkout <path> at <commit>; transcripts searched for <terms>; not available: <what>

| Note | Action | Reason | Evidence |
|---|---|---|---|
| status-2026-09.md | retire | work merged; git has it | `git log --oneline -3 -- src/x` shows the merge |
| deploy-quirks.md | correct | port changed | `compose.yml:14` says 8081, note says 8080 |
| api-keys-where.md | keep | not derivable | verified `scripts/env.sh` exists |
| old-owner.md | unverified | no checkout | not verified since <date> |
```

Allowed actions: `keep`, `correct`, `merge:<survivor>`, `retire`, `move:<owner file>`, `promote:<where>`, `unverified`. Evidence is a command, a `path:line`, a commit or a transcript search term; never a secret value.

## The summary shown to the user

- counts per action
- index size before and after (bytes and lines)
- links to fix, and links left unresolved
- anything risky: merges, promotions into the repo, notes you could not verify

## Applying it

After approval, in this order: `fix-links`, `retire`, corrections and merges by direct edit (run `dream.py snapshot` first), moves to owner files, then `dream.py apply` to rebuild the index. Every `--apply` takes its own snapshot and prints the path; give the user the first one as the way back.
