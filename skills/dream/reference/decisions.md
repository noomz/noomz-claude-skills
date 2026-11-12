# Deciding what happens to a note

## Contents

- The test
- Signs a note is stale
- One fact, one owner
- Verdict guide
- Index hooks
- Topic pages
- Parallel work

## The test

Ask of each note: will the repo, git or the screen show this next session? If yes, it does not belong in memory. If no, and it will still matter, keep it. Durable means a decision with its reason, a trap and its cause, an owner's preference, a rule that was tested and held.

## Signs a note is stale

A status log is the most common stale note: PR numbers, commit hashes, "merged on <date>", "passed 8/8", "open", "next up". Check it against `git log` and `git branch -a`. If the work landed, the note is history; git has it. If something durable came out of the work (a trap, a decision), extract that sentence into its own note or the owner's file, then retire the log.

Other signs:

- names a path, script, flag, port, branch or version that no longer exists (verify before judging)
- "superseded by X" where X moved or was deleted
- a second copy of something a wiki, glossary, decision record or ledger already holds
- a rule repeated in several projects
- a hook in the index that no longer matches the note

## One fact, one owner

| Fact | Owner | Memory holds |
|---|---|---|
| definition, domain term | the repo's glossary | a pointer |
| decision and its reason | decision records or the ledger | a pointer |
| how a subsystem works | the repo's wiki or docs | a pointer |
| current status, next steps | a dated state file in the repo | nothing, or one pointer |
| rule that applies to many projects | the parent folder's instruction file | nothing |
| personal preference, environment quirk, past trap | memory | the note itself |

When moving a fact to its owner, write it there first, check it reads right, then retire the note.

## Verdict guide

- **keep**: still true after verification. Do not touch.
- **correct**: say what you checked ("verified against `scripts/deploy.sh` at HEAD"). Change only the wrong part.
- **merge**: name the survivor. Fold in only what the other note adds, then retire the other.
- **retire**: `dream.py retire --note NAME`. The note lives on in `archive/`.
- **move**: live status goes to the project's state file with its date; retire the note.
- **promote**: write the one-line hook into the index, or the fact into the repo's knowledge base.
- **unverified**: no checkout, no transcript, no way to check. Add "not verified since <date>" and change nothing else.

When unsure between retire and keep, keep, and list it in the report as a question.

## Index hooks

One line per note: `- [Title](file.md) — hook`. The hook says when to open the note, not what is in it. Stay under about 150 characters. Keep the user's curated order; do not reshuffle to be tidy.

## Topic pages

Once there are roughly 150 notes, the index lists topic pages and each topic page lists its notes. One page per subject; a note appears on one page. A topic page is itself a note with frontmatter (`name`, `description`), and its links use `[[note-name]]` or `(file.md)`. Lint counts notes reachable through a listed topic page as `deep`, not orphans, once that page links at least ten of them.

## Parallel work

Split by project or by subject. Never let two agents write the same page or the same project's `MEMORY.md`. Agents return candidate notes and verdicts as text; the lead writes them.
