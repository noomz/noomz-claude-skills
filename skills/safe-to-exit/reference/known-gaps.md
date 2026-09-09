# Known gaps

Read these before trusting a readout, and before "improving" the skill. Each row is a limit that is real today; several are deliberate trade-offs rather than bugs, and the reason is given so a future editor does not "fix" one into a worse state.

| Limit | Detail |
|---|---|
| Subagent detection is conversational | No shell command lists them. It rests on reading this conversation plus `ListAgents`/`TaskList`. An agent spawned in a *different* session is invisible here. |
| Secret patterns are a denylist | It catches the common names. A credential in `config/prod.yaml` under an unusual key is not detected, and a clean report is not a security audit. |
| `SAFE_SUFFIX` can hide a real one | A genuinely secret `keys.template.json` is excluded by name. The exclusion is worth it — false alarms get the whole section ignored — but it is a real hole. |
| Marker scan is session-scoped by design | Added lines vs `HEAD`, plus whole untracked files. A stub committed and pushed last week never appears. Widening to the whole repo makes the section useless, so this is a deliberate trade, not an oversight. |
| Junk vs source is a guess | An untracked file is graded source-or-scratch by path and extension. A new script in `tmp/` grades as junk and is only a NOTE. |
| Process list is pattern-matched | `pgrep` covers common dev servers by name. A custom binary, or anything inside a container, is missed; `docker ps` is not checked. |
| No test run | The skill never runs the suite. "Tests were green an hour ago" is not a finding it can make — it only reports skips *added* in this diff. |
| `gh` covers GitHub only | GitLab, Gitea, and remoteless repos contribute nothing to source E, and their pending work is invisible. |
| Store discovery is git's list, not a name list | Source F enumerates via `git status --porcelain --ignored` and the repo's own declared rules. A store that is neither ignored nor untracked — a knowledge dir the repo actually commits — is not a source F finding at all; sources A and B cover it as ordinary tracked content. |
| Export detection is name-based | A runnable `export`/`publish`/`share` file inside a store is assumed to be its durable path. It might be unrelated, and the real sync might be a Makefile target or a CI job this never sees. Name it as a candidate, never a certainty — and read it before running it. |
| Scope depends on where you launched | Run from a project, the scope is that project. Run from a workspace parent, everything under it is in range and you get asked. Same command, different blast radius — the header names which happened. |
| `-maxdepth 2` covers children, not siblings | `find .` from the git toplevel sees repos nested below it; sibling repos beside it are invisible unless you run from the parent. A repo at `group/team/repo` needs `-maxdepth 3`. |
| Worktrees are counted, not inspected | Linked worktrees show up as separate repos when they sit under the root, and are missed entirely when they do not. |
| Porcelain quotes odd paths | A path with spaces or non-ASCII is emitted quoted (`?? "we ird.env"`). The awk strips surrounding quotes but does not un-escape the interior, so an exotic filename can still print oddly. It is reported, not missed. |
| `allowed-tools` barely applies | Prefix matching works on single commands, and every scan here is a compound pipeline starting with `cd` or `find` — so the read blocks prompt regardless of what the list says. The list's real job is the opposite one: keeping mutating commands *out*, so secure mode always meets a prompt. |
| A repo with no commits reports clean | `git diff HEAD` fails where HEAD does not exist yet, source C swallows it, and the section prints nothing. That is the state of every repo on its first day. |
| No accepted-blocker memory | "Accepted" lives in the conversation, not on disk. Run the check again in a fresh session and the midway rebase is a fresh blocker. The handoff note is the only durable record. |
| Grades are opinions | The BLOCKER/NOTE table encodes one view of risk, and it is deliberately strict: a bare dirty tree blocks, so NOT SAFE is the common verdict rather than the rare one. A dev who never loses a laptop may reasonably call that, or `unpushed:2`, a note. Change the table, not the individual calls, so the verdict stays consistent. |
| Nested-repo probe is depth-bounded | Source F looks 3 levels below an ignored or untracked path for a `.git`. A repo deeper than that is invisible — as it was to every source before this bound existed. |
| Source F sees ignored and untracked paths only | A repo nested inside a *tracked* directory is reached by neither source F nor source A's `-maxdepth 2`. Uncommon, but it is the same silent-empty shape. |
| `predating:` is the convention test | The grading table's "files predating today" distinction is read from `predating:`, not from a separate flag. `predating:0` on an untracked dir means genuinely new work, not an established store. |
| Store text counts double-report | An `IGNORED-STORE` line counts text under it, including files inside nested repos already reported above it. Noise, not a miss — but the same file can appear as evidence twice. |
