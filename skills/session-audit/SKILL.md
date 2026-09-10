---
name: session-audit
description: Audit Claude Code JSONL transcripts for CLAUDE.md compliance, delegation, cost, and stall patterns. Use when a user asks to measure past sessions, find rule violations, inspect loops or grinds, or compare audit runs.
allowed-tools: Bash(python3:*)
---

# Session audit

This skill runs the bundled standard-library scanner over Claude Code session transcripts. It reports mechanical detectors D1–D9, per-prompt stall labels, delegation and token summaries, and flagged sessions for hand-labelling.

## Run

Run from the repository you want to audit, with an absolute path to the script — both the transcript store and the config file are resolved from the current directory, so running from the skill directory audits the wrong project:

```bash
cd /path/to/target/repo
python3 <skill-root>/scripts/session_audit.py [--store DIR] [--since YYYY-MM-DD] [--config PATH] [--include-workers] [--json OUT.json] [--flag DETECTOR --top N] [--prompts SESSION_ID] [--min-turns 5]
```

With no `--store`, the scanner uses `CLAUDE_CONFIG_DIR/projects/<slug>`, then `~/.claude/projects/<slug>`, where `<slug>` replaces every `/` in the absolute current directory with `-`. Pass `--store` to audit a project you are not standing in. It reads files only; malformed JSONL records are skipped.

## Configure

`--config PATH`, or a file at `<cwd>/.claude/session-audit.json`, sets `money_terms`, `truth_paths`, and `rule_windows`. All three ship empty:

- D4 reports `N/A` until `money_terms` and `truth_paths` name your domain vocabulary and the repos that hold authoritative answers.
- Every other detector applies to every session until `rule_windows` gives it a start date; a session older than that date is `N/A`, never `FAIL`.

Worker sessions are excluded by default; pass `--include-workers` to retain them. See [reference/detectors.md](reference/detectors.md) for thresholds, applicability, and a config example.

## Read the output

The default report contains the store and sample size, detector rates, stall labels and worst prompts, then delegation and token totals. `--flag D4 --top 10` is intended for precision checks: inspect the prompt, money hits, and truth paths before treating a rate as a verdict. `--prompts SESSION_ID` shows the prompt-level features used by D9. `--json` writes the same per-session, per-prompt, and aggregate data as one JSON document.

The implementation is [scripts/session_audit.py](scripts/session_audit.py); it streams JSONL and uses only Python 3.9+ standard-library modules. Verify a change with `python3 <skill-root>/scripts/test_session_audit.py`.

## Boundaries

The audit measures transcript evidence, not whether a remembered fact was correct or whether a human would approve a flagged session. Review sampled failures, especially topic-term matches and broad narration regexes. It never writes to the transcript store.
