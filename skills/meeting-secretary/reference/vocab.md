# Vocab phase — /meeting-vocab

The recognizer gets a comma-separated vocab prompt with every chunk. Terms in it come
out spelled right; terms missing from it come out as the nearest common word or as
Thai-script loanwords. The prompt is merged from three files, in this order:

| File | Holds | Written by |
|---|---|---|
| `assets/vocab.txt` in this skill | generic work terms (deploy, staging, PR, ...) | ships with the skill; do not edit |
| `<project>/.claude/meeting-vocab.txt` | this project's people, products, orgs, jargon | `/meeting-vocab` |
| `<root>/<name>/vocab-extra.txt` | one meeting's agenda terms | `/meeting-vocab <name>` or live pre-flight |

One term per line; blank lines and `# comments` are skipped; duplicates are dropped.

## Pick the target

- No argument, or "for this project" → the project file.
- A meeting name, or an agenda pasted with the request → that meeting's
  `vocab-extra.txt`. Create the folder if the meeting has not started yet; the
  recorder reads the file when it starts.

## 1. Gather candidates (cheap reads only)

- Instruction files (`CLAUDE.md`, `AGENTS.md`), README, top-level docs headings
- Repo and package names (`package.json`, `pyproject.toml`, sub-repo folder names)
- People: `git shortlog -sn --all | head -30`, names in docs, plans and the memory
  index. Keep the name people say aloud (first name or nickname), not the git handle.
- Products, features, clients, vendors, integrations named in docs and plans
- Recent issue and PR titles if `gh` works for this repo (`gh issue list -L 30`,
  read-only) — feature names and jargon
- Earlier meetings in the data root: the "Corrections" sections and `(?)` marks in
  `summary*.md` show exactly which words the recognizer got wrong
- For a meeting target: the agenda, invite text or topic the user gave

## 2. Choose terms

Keep words the recognizer is likely to get wrong:

- proper nouns: people, products, clients, vendors, places
- acronyms and ids people say aloud (`SSO`, `B2B`, `v2`)
- English terms said inside Thai speech that are not in the base list
- a name in the script people use when they say it, and both scripts when both
  happen (`Ton`, `พี่ต้น`)

Skip common words the recognizer already handles, anything in the base list, file
paths, code identifiers nobody says aloud, and secrets of any kind.

Aim for 30–80 project terms and under 30 per meeting. The whole list goes with every
20 s chunk: a long list dilutes the bias, and on silence the model sometimes reads the
prompt back (the script drops any line with 8+ commas as an echo, so a real
transcript line is lost only when speech itself is that comma-heavy). Put the most
important terms first.

## 3. Write

- New file: a one-line `#` header saying what it is, then the terms.
- Existing file: keep every line already there, comments included. Append new terms
  under `# added YYYY-MM-DD`. Do not delete lines yourself; list terms that look stale
  and ask (AskUserQuestion) before removing any.

## 4. Report

Run `MEETING vocab [name]` and report: target file, terms added (listed), total unique
terms, prompt size. Then one line: `.claude/meeting-vocab.txt` holds people's names
and is committed with `.claude/` in many projects — the user decides whether it
belongs in git.
