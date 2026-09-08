---
description: Check whether this session can be ended safely — uncommitted and unpushed work, secrets about to be committed, unfinished markers, running servers and subagents, open PRs
argument-hint: "[secure]"
---

Invoke the `safe-to-exit` skill and follow it exactly.

Run **check** mode: read-only. Gather the five sources, grade each finding, and print the verdict readout.

Settle scope before running any source. If the resolved root is not itself a git repo, or holds more than one repo, stop and ask which scope is wanted — this session's writes only, one named repo, or all of them. Never open with a multi-repo sweep; a check the user has to interrupt produces no verdict at all.

$ARGUMENTS

If the arguments above say `secure` (or otherwise ask to make the session safe), still print the check readout **first** — secure mode never runs against an audit the user has not seen. Then work the remediation ladder one rung at a time, printing each command and waiting for a go-ahead before running it.
