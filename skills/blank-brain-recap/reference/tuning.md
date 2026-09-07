# Per-workspace tuning

Everything the recap needs is discovered at runtime, so the skill works in a fresh clone with no setup. This file covers the knobs worth adjusting once you have run it a few times in one workspace, and the smoke test that proves an edit did not break it.

## Contents

- [Where to record the tuning](#where-to-record-the-tuning)
- [Workspace root](#workspace-root)
- [Identity pattern](#identity-pattern)
- [The NOISE denylist](#the-noise-denylist)
- [Planning-note locations](#planning-note-locations)
- [Ledger and memory locations](#ledger-and-memory-locations)
- [Pull-request scope](#pull-request-scope)
- [The window threshold](#the-window-threshold)
- [Smoke test](#smoke-test)
- [Failure signatures](#failure-signatures)

## Where to record the tuning

Put the tuned values in the workspace's own agent instructions file (`CLAUDE.md`, `AGENTS.md`, or equivalent) under a short heading, not in this skill. The skill is shared across workspaces; the tuning is not.

```markdown
## blank-brain-recap tuning
- workspace root: ~/Projects/acme (19 sibling repos, not a single git toplevel)
- identity: matches the name "Dana"; commits land as dana@work.example and dana@personal.example
- extra NOISE: `(^|/)\.terraform/|(^|/)fixtures/generated/`
- planning notes: `docs/planning/*.md` (no `.planning/` dir here)
- ledgers: `docs/adr/*.md`
- non-GitHub repos: `legacy-etl` (GitLab) — never appears in BLOCKED
```

Six lines like that turn every later run from inference into lookup.

## Workspace root

`git rev-parse --show-toplevel` answers with **one repo**. In a workspace of sibling repos it returns whichever one you happened to be standing in, and the recap then covers 1 repo of 19 without any error.

Rules:

- If the parent of the toplevel contains two or more sibling repos, the parent is probably the workspace. Say so and confirm before widening.
- Always print the repo count from the `find . -maxdepth 2 -name .git` discovery line. A count of 1 in a workspace you know is bigger is the single loudest failure signal this skill has.
- Nested workspaces (a repo containing repos) work as-is: `-maxdepth 2` covers the outer repo and one level of inner ones. It does **not** recurse deeper — a repo two levels down is invisible. For a `group/*/repo` layout, raise it to `-maxdepth 3`.
- **Do not replace `find` with a `*/.git` glob.** Under `zsh` a glob that matches nothing is a fatal error, so in a single-repo workspace the loop dies before its first iteration and the recap reports zero repos.

## Identity pattern

The step-1 filter is `--author="$ME"` where `ME` is `git config user.name`. That is a substring match on both name and email, which is why the name works across several email addresses.

Adjust when:

- **The name is spelled differently across identities** (`Dana Lee` vs `dlee`) — use the shortest common token, or run step 1 twice and merge.
- **The name is a common substring** (`Al` matching `Alex`, `Alicia`, `Salvador`) — use the full name or an email domain instead.
- **You want a teammate's day, not yours** — pass their name; everything downstream still works.

Verify with the `git shortlog -sne --all --since="21 days ago"` output from step 0.5 — it lists every identity in the window, so a missing third identity is visible there and nowhere else.

## The NOISE denylist

`NOISE` filters `git status --porcelain`, not the commit log. It is a denylist: it hides what it knows about, and anything new looks like real work until you add it.

The shipped list covers dependency dirs, build output, lockfiles, agent config, and worktrees. Add anything that churns in your workspace without ever being the answer to "what was I doing":

| Kind | Pattern to add |
|---|---|
| Infra state | `(^\|/)\.terraform/\|\.tfstate` |
| Generated fixtures/snapshots | `(^\|/)__snapshots__/\|fixtures/generated/` |
| Local env files | `(^\|/)\.env\.local$` |
| Editor and tool dirs | `(^\|/)\.idea/\|(^\|/)\.vscode/` |
| Fetch-on-demand vendored dirs | the dir name, anchored: `^\?\? vendor(/\|$)` |

Two constraints on edits:

- **Anchor patterns.** An unanchored `build` matches `src/buildLogger.ts`. Use `(^|/)build/`.
- **Never make the printing conditional.** The `printf` in source 1 runs for every dirty repo whether `kept` is empty or not. A conditional print makes fully-noisy repos vanish with no `real:0 filtered:N` line, and there is then no evidence they were considered.

If `filtered` is large and `real` is 0 across many repos, that is a healthy result — say so. If `filtered` is large in a repo you were actively editing, the denylist is probably eating real work: check with `git -C <repo> status --porcelain` unfiltered.

## Planning-note locations

The skill looks in `.planning/`, `docs/planning/`, and `notes/`, at the workspace root and one level down. Point it elsewhere if your notes live somewhere else — a `HANDOFF-*.md` convention is what makes the NEXT STEP line reliable, and the skill degrades to git-only without it.

Precedence when files disagree:

1. A `HANDOFF-*` dated in or near the window — it exists to say "start here".
2. The newest `STATE-*` or equivalent — good for the in-progress item, unreliable for the next action.
3. Git uncommitted state — always available, never tells you *why*.

Name the file NEXT STEP came from in `basis:`. When two sources disagree and you pick one, that line is what lets the dev catch a wrong pick.

## Ledger and memory locations

Optional. The skill greps `docs/kb/ledgers/`, `docs/decisions/`, and `CHANGELOG.md` for the literal window dates, and looks for a project `MEMORY.md` under the agent's home config dirs.

If your workspace keeps decision or incident logs elsewhere, record the path in the tuning block. If it keeps none, this source prints `(none)` — that is a normal result, not a gap to fill.

Two rules that do not change:

- **Literal dates in the grep pattern, never a variable.** Each fenced block is a separate shell; an unset pattern matches every line and dumps the whole ledger into the readout as if it were signal.
- **Verify PR and issue numbers taken from memory** with `gh pr view` before printing them as blockers. Memory records what was true when written.

## Pull-request scope

Source 3 iterates repos and runs `gh` from inside each one, so the repo list cannot rot. What it cannot see:

- Repos whose `origin` is not GitHub — skipped by the `grep -q github.com` guard. List them in the tuning block so their absence is a known quantity rather than a silent hole.
- Repos with no remote at all.
- Issues. Only pull requests are listed; a touched-but-unlinked issue surfaces only through the ledger/memory source.
- Anything the currently authenticated account cannot read. Read `gh auth status`; never run `gh auth switch`, which mutates global state and breaks the read-only promise.

For a large workspace where `gh` per repo is slow, restrict to repos that had commits in the window — you already know them from step 1.

## The window threshold

The "fewer than 10 commits today → also cover yesterday" rule is a guess, not a measurement. Tune it to how you actually work:

| Work pattern | Suggested threshold |
|---|---|
| Many small commits, rebase-heavy | raise to 20–25 |
| Few large squashed commits | lower to 3–5 |
| Long-running branches, rare merges | keep 10, and lean on planning notes instead |

Whatever the number, the header keeps printing the count and the covered dates. Fix the header before fixing the number — a visible wrong window is recoverable, a silent one is not.

## Smoke test

Cheapest proof the skill still works after an edit. Run from the workspace root:

```bash
WS=$(pwd)
echo "today is $(date +%F)"
find . -maxdepth 2 -name .git 2>/dev/null \
  | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort   # expect your repo list, never empty
git config user.name                              # expect a non-empty identity
git shortlog -sne --all --since="21 days ago" | head -5
gh auth status 2>&1 | head -3                     # expect an account, not an error
```

Expected: a date, a plausible repo count, a name, at least one identity line, and an authenticated account.

Then run step 1 alone and confirm the date table is non-empty. If it is empty while `git log` clearly has commits, the identity pattern is wrong — that is the most common breakage after moving the skill to a new workspace.

## Failure signatures

| Symptom | Cause |
|---|---|
| Empty date table, but the repos clearly have commits | Identity pattern does not match any author in the window. |
| Repo count is 1 in a multi-repo workspace | `WS` resolved to a single git toplevel; run from the parent. |
| A dirty repo missing from IN PROGRESS entirely | Someone made the `printf` conditional again. |
| Header claims two dates, SHIPPED shows one | The inner date loop was collapsed, or dates were passed via a variable under zsh. |
| The whole decisions log lands in the readout | Empty grep pattern — dates were left as an unset variable. |
| BLOCKED empty in a workspace you know has blockers | `gh` saw only some repos, or the wrong account is authenticated. Read `gh auth status`. |
| A "blocker" the dev already merged | A memory-sourced PR number printed without `gh pr view` verification. |
| Planning notes or ledger rows print `(none)` while the files plainly exist | A `*.md` glob list crept back into source 2 or 4. Under zsh one unmatched pattern aborts the whole command, stderr suppression hides it, and the exit status stays `0`. Use `find` (source 2) and directory arguments to `grep -r` (source 4). |
| A recap citing decisions from a different project | The agent-memory `find` matched another project's `MEMORY.md`. Tighten the `grep -i` slug, or drop the source. |
