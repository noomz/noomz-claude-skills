# Gather rationale

Why the cold-mode commands in SKILL.md are written the way they are. Read before changing any of them, or when a source returns something surprising.

## Step 1 — repo discovery and author asymmetry

Two things about that command. It discovers repos with `find`, not with `ls` and not with a `.git */.git` glob. `ls` output can carry colour escapes that make `git -C` fail, and `2>/dev/null` would hide every one of those fatals, leaving an empty table that looks like a quiet fortnight. The glob is worse: under `zsh`, a pattern that matches nothing is a **fatal error**, not an empty list — measured in a single-repo workspace, `for d in .git */.git` aborted with `no matches found: */.git` before the loop body ran once, so the recap reported zero repos. `find` behaves the same in every shell and in every layout. And step 1 filters to **your** commits, while step 2 lists **everyone's** commits on the chosen date. That asymmetry is deliberate: the day is picked by when *you* last worked, but the day's record should include a teammate's or CI bot's merge. If SHIPPED shows work you do not recognise, that is why — say whose it is rather than dropping it.

## Source 1 — git and the NOISE filter

### Why the NOISE filter is mandatory

Observed on a 19-repo workspace: **47 dirty entries, of which 2 were real work.** The other 45 were operational dirs, agent-config tweaks, worktrees, and lockfiles. Unfiltered, the IN PROGRESS section fills with junk and buries the one file that matters — the failure lands exactly when the dev is least able to spot it.

Four rules keep this step honest:

- **Never drop silently — which needs the unconditional `printf`.** An earlier version guarded the print with `[ -n "$kept" ]`, so a repo whose every dirty path was noise printed *nothing at all*: 8 of 19 repos vanished with no `real:0 filtered:N` to show they had been considered. The count line must appear for every dirty repo, empty or not. If `filtered` looks surprisingly large, say so in the readout rather than trusting it.
- **The inner date loop is what makes a two-date window real.** The window table can ask for two days; a single `--since/--until` pair covers one. Without the loop, the header claims both dates while SHIPPED holds one — the exact silent-wrong-day failure this skill exists to avoid.
- **Put the dates in the `for` list as literals, never in a variable.** Under `zsh` — a common interactive default — unquoted expansions are not word-split: `DATES='a b'; for D in $DATES` runs **once** with `D='a b'`, so `--since="a b 00:00"` becomes a malformed window that git accepts silently and answers with the wrong day's commits. Same rule anywhere else in this file: no `for X in $VAR`.
- **A tracked modification (` M`) outranks an untracked file (`??`).** ` M` means the dev edited something that already exists — closer to the live task. Put ` M` items first in IN PROGRESS.

The script ends in `exit 0` on purpose: the last `grep -Ev` returns 1 when it matches nothing, and a non-zero pipeline exit here reads as failure when the output is fine. Judge this step by its printed output, never by its exit status.

## Source 2 — planning notes

**A glob list here is a silent-miss bug, not a style choice.** Under `zsh`, one unmatched pattern aborts the **whole** command, so `ls -lt WS/.planning/*.md WS/notes/*.md` prints nothing at all when only `.planning/` is missing — the existing `notes/*.md` never gets listed. Measured: an existing `notes/a.md` went unlisted for exactly that reason, `2>/dev/null` did **not** suppress the error, and the exit status stayed `0`. The miss reads as `(none)`. The `-z "$NOTES"` guard also matters: with empty input, `xargs ls -lt` runs `ls` with no arguments and lists the current directory, which looks like a result.

**Newest by mtime is often the wrong file.** Observed case: the newest file was a 65 KB technical log, while the actual next action lived in `HANDOFF-<topic>-<date>.md`, the second-newest. Stopping at the newest file alone loses the resume point.

**Do not blind-`tail` a large file.** A guessed `tail -100` can sail straight past an in-progress marker sitting earlier. Locate the markers first, then read around the hits:

**Never pipe the checkbox grep through `tail`.** Observed on a 65 KB state file: 83 marker hits but only **2** unchecked boxes in the whole file — and a combined `grep … | tail -40` showed **zero** of them, because 40 headings crowded them out. The command reported structure and hid the one thing it exists to find. Two greps, and the checkbox one runs untailed.

## Source 3 — open pull requests

Running `gh` from inside each repo lets it infer the remote — no hardcoded repo list to rot. Repos with a non-GitHub remote (GitLab, Gitea, none) are skipped by the `grep -q github.com` guard; **say which repos were skipped**, because their open work is then invisible to this source.

**Check the identity, never change it.** Machines with several authenticated accounts frequently default to the wrong one. `gh auth switch` would mutate global `gh` state and break this skill's read-only promise — so read `gh auth status` instead. If the active account cannot see these repos, every `gh pr list` returns empty or errors, and the rule below would read that as "clean". When the identity looks wrong, say so and tag every PR line `[unverified]`.

`--limit 30` avoids both truncating real PRs and `SIGPIPE`-ing `gh` mid-write with a `head`. `exit 0` for the same reason as source 1: judge by output.

**This lists PRs only, not issues.** A touched-but-unlinked issue never appears here. Source 4 is the only place those surface.

Read `baseRefName` — a PR based on another branch, not the default branch, is a stacked PR and its green CI can be false.
`no-review` means nobody has reviewed yet; it is **not** an approval. Never print it as an empty bracket.

## Source 4 — memory and ledger rows

**Never leave the date pattern as a variable.** Each fenced block runs in a **separate shell**, so a `$D` set in source 1 is empty here — and an empty `grep` pattern matches **every** line. Observed: an unset pattern returned all 137 lines of a decisions log instead of the 2 dated rows, and the whole ledger lands in the readout looking like real signal. Substitute the literal dates from step 1 every time.

**Memory records what was true when it was written**, so a PR or issue it calls open may already be merged or closed. Verify any PR or issue number taken from memory before printing it in BLOCKED / WAITING:

```bash
gh pr view <number> --repo <owner/repo> --json state,title,mergedAt 2>&1 | head -5
```

If it comes back `MERGED` or `CLOSED`, it is not a blocker — drop it. If you cannot resolve which repo it lives in, print it tagged `[unverified, from memory]` and never as a plain live blocker. Printing a merged PR as still-blocking sends the dev to re-do finished work, which is the most expensive error this skill can make.

## Step 1 — window header

Then **name the covered dates in the readout header**, e.g. `BLANK BRAIN RECAP — 2026-09-06 + 2026-09-07 (cold)`. This is not decoration. The threshold above is a judgment call that can be wrong in either direction, and a header naming the dates turns a wrong window into something the dev can see and correct. A recap that silently covers the wrong day is the worst failure this skill has — it looks complete.


## Step 0.5 — identity

Read the `shortlog` table. If more than one line is plainly the same human under different emails, matching the given name (the `--author` filter in step 1) already covers them. If the dev's name is spelled differently across identities, use the shortest common token and say so in `basis:`.


## Step 3 — SHIPPED sizing

A single active day can produce 38 commits across 3 repos, most of them merges and review-round fixes — that is roughly 5 readout lines, not 38.

A blank brain can hold one action — hence exactly one NEXT STEP. Legend examples: `a1b2c3d` is a commit sha, `#101` an issue number, `0007` a migration revision.
Planning notes: the newest file was once a 65 KB technical log while the next action lived in `HANDOFF-<topic>-<date>.md`, the second-newest.
