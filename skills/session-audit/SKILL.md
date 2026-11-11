---
name: session-audit
description: Audit Claude Code or Pi session transcripts for rule compliance, delegation, cost, and stall patterns. Use when a user asks to measure past sessions, find rule violations, inspect loops or grinds, audit a Pi session or branch, or compare audit runs. Read-only; Pi sessions report unavailable where Pi has no evidence.
allowed-tools: Bash(python3:*)
---

# Session audit

This skill runs the bundled standard-library scanner over Claude Code or Pi session transcripts. It reports mechanical detectors D1–D9, per-prompt stall labels, delegation and token summaries (Claude) or usage scopes (Pi), and flagged sessions for hand-labelling. Output names the harness. Codex sessions are not supported.

## Run (Claude Code, the default)

Run from the repository you want to audit, with an absolute path to the script — both the transcript store and the config file are resolved from the current directory, so running from the skill directory audits the wrong project:

```bash
cd /path/to/target/repo
python3 <skill-root>/scripts/session_audit.py [--store DIR] [--since YYYY-MM-DD] [--config PATH] [--include-workers] [--json OUT.json] [--flag DETECTOR --top N] [--prompts SESSION_ID] [--min-turns 5]
```

With no `--store`, the scanner uses `CLAUDE_CONFIG_DIR/projects/<slug>`, then `~/.claude/projects/<slug>`, where `<slug>` replaces every `/` in the absolute current directory with `-`. Pass `--store` to audit a project you are not standing in. It reads files only. Malformed JSONL lines and unreadable files are skipped and listed in a `problems` section (text and JSON).

## Run (Pi)

Add `--harness pi`. Choose exactly one selection mode; the report shows which one ran:

| Mode | Flags | Behavior |
|---|---|---|
| `default-project-dir` | none, or `--project DIR` | Scans `*.jsonl` directly in `${PI_CODING_AGENT_DIR:-~/.pi/agent}/sessions/--<path>--/`, where `<path>` is the project path without its leading separator and with `/`, `\` and `:` replaced by `-`. `--project` defaults to the current directory. |
| `explicit-dir` | `--store DIR` | Same non-recursive scan of a Pi session directory. Use it for a custom `--session-dir`, `PI_CODING_AGENT_SESSION_DIR`, or `sessionDir`; the scanner never guesses a past launch's override. |
| `explicit-files` | `--session-file FILE` (repeatable) | Audits those files. No project check; the header `cwd` is still reported. Cannot combine with `--store`. |

In the two directory modes, only files whose header `cwd` equals the project are audited; others are excluded and counted (`excluded other project`), so a shared directory is safe. `--leaf ID` picks an explicit leaf and needs exactly one `--session-file`. Without it the leaf is the last appended entry, and a file whose last line is malformed is reported unavailable rather than guessed.

```bash
python3 <skill-root>/scripts/session_audit.py --harness pi [--project DIR | --store DIR | --session-file FILE [--leaf ID]] [--json OUT.json] [--min-turns 5]
```

**Read-only rule:** never open the store with Pi itself to inspect it. Pi's loader migrates legacy session files in place. The scanner opens files read-only, never migrates, and treats version 1 files as linear in memory. `--session-file`, `--leaf` and `--project` with `--harness claude` are argument errors.

## Configure

`--config PATH`, or a file at `<cwd>/.claude/session-audit.json`, sets `money_terms`, `truth_paths`, and `rule_windows`. All three ship empty:

- D4 reports `N/A` until `money_terms` and `truth_paths` name your domain vocabulary and the repos that hold authoritative answers.
- Every other detector applies to every session until `rule_windows` gives it a start date; a session older than that date is `N/A`, never `FAIL`.

Worker sessions are excluded by default; pass `--include-workers` to retain them. See [reference/detectors.md](reference/detectors.md) for thresholds, per-harness applicability, Pi usage scopes, and a config example.

## Read the output

The default report contains the harness, store and selection, sample size, detector rates, stall labels and worst prompts, then delegation and token totals (Claude) or `lineage` and `usage` sections (Pi). Detector status `UNAVAILABLE` means the harness has no evidence for that rule; it is never a pass. `--flag D4 --top 10` is intended for precision checks: inspect the prompt, money hits, and truth paths before treating a rate as a verdict. `--prompts SESSION_ID` shows the prompt-level features used by D9. `--json` writes the same per-session, per-prompt, and aggregate data as one JSON document, with `null` plus a reason wherever Pi has no evidence.

A session with malformed lines or missing fields is audited as `complete: no`, and the header counts incomplete sessions. Sessions whose lineage cannot be established, and files with an unsupported version, are listed under `problems` and not audited. When nothing is usable, the scanner prints `no usable sessions` with reason counts and exits 0.

The implementation is [scripts/session_audit.py](scripts/session_audit.py) with the Pi reader in [scripts/pi_sessions.py](scripts/pi_sessions.py); both use only Python 3.9+ standard-library modules. Verify a change with `python3 -m unittest discover -s <skill-root>/scripts -p 'test_*.py'`.

## Boundaries

The audit measures transcript evidence, not whether a remembered fact was correct or whether a human would approve a flagged session. Review sampled failures, especially topic-term matches and broad narration regexes. It never writes to the transcript store. Reports contain prompt excerpts and file paths; do not paste them into public issues.
