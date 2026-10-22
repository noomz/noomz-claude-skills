# Known gaps

Read these before trusting a readout, and before "improving" the skill.

Read these before trusting a readout, and before "improving" the skill.

| Limit | Detail |
|---|---|
| The `<10` threshold is arbitrary | No data chose 10. It is a guess that a small commit count means "tail of yesterday". The header prints the count so a wrong call is visible; fix the header before fixing the number. |
| Warm/cold is untested on a close call | Verified only on an unambiguously fresh session. A mid-session run may pick warm when you wanted cold — the header says which, so check it. |
| `gh` covers GitHub remotes only | Repos on GitLab, Gitea, or with no remote contribute nothing to BLOCKED. Source 4 is the only thing standing between that and a false "nothing is blocked". |
| The noise filter is a denylist | It hides what it knows about. A genuinely new junk directory shows up as real work until it is added to `NOISE`. See [reference/tuning.md](tuning.md). |
| Dates are typed by hand | Step 1 prints the dates; a transcription puts them into step 2. A typo yields an empty gather that looks like a quiet day. Cross-check the header against step 1's table. |
| Workspace root is inferred | `git rev-parse --show-toplevel` returns one repo, not a multi-repo parent. In a workspace of siblings, run from the parent or name it — otherwise the recap silently covers one repo out of many. |
| Repo discovery is `find`, not a glob or `ls` | Both alternatives fail silently-ish: `ls` can emit colour escapes that make `git -C` fatal under a swallowed stderr, and under `zsh` a `*/.git` glob matching nothing is a fatal error that kills the loop before its first iteration — measured in a single-repo workspace. Do not "simplify" `find` back to either. |
| `-maxdepth 2` is one level of siblings | A repo two levels down (`group/team/repo`) is invisible. Raise to 3 for that layout. |
| Shell word-splitting differs | Under `zsh`, unquoted expansions are not word-split, so any `for X in $VAR` silently collapses to one iteration. Every loop here uses literals or `while read` for that reason. |
| Glob lists are banned, not discouraged | Under `zsh` one unmatched pattern aborts the whole command, `2>/dev/null` does not suppress it, and the exit status stays `0` — so a missing `.planning/` hides an existing `notes/*.md` and the recap prints `(none)`. Every discovery step here uses `find`. |
| `allowed-tools` does not cover the compound scripts | Prefix matching applies to single commands, so the multi-line gather blocks still prompt. The frontmatter list helps the one-liners (`gh pr view`, `git shortlog`); expect approval prompts for the rest. |
| Agent-memory discovery is name-matched | The `grep -i` on the workspace directory name is a heuristic. A host whose slug convention differs returns nothing (safe) or another project's memory (not safe) — check the path before reading it. |
| Multiple git identities | One human often commits under two emails. Step 0.5 matches the *name*; an identity spelled differently is invisible until you widen the pattern. |
| Bot and teammate commits count | Step 2 has no author filter, so CI merges and teammate commits appear in SHIPPED. Attribute them rather than dropping them. |
