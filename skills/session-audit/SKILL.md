---
name: session-audit
description: Audit Claude Code JSONL transcripts for CLAUDE.md compliance, delegation, cost, and stall patterns. Use when a user asks to measure past sessions, find rule violations, inspect loops or grinds, or compare audit runs.
---

# Session audit

This skill runs the bundled standard-library scanner over Claude Code session transcripts. It reports mechanical detectors D1–D9, per-prompt stall labels, delegation and token summaries, and flagged sessions for hand-labelling.

## Run

From this skill directory:

```bash
python3 scripts/session_audit.py [--store DIR] [--since YYYY-MM-DD] [--config PATH] [--include-workers] [--json OUT.json] [--flag DETECTOR --top N] [--prompts SESSION_ID] [--min-turns 5]
```

With no `--store`, the scanner uses `CLAUDE_CONFIG_DIR/projects/<slug>`, then `~/.claude/projects/<slug>`, where `<slug>` replaces every `/` in the absolute current directory with `-`. It reads files only; malformed JSONL records are skipped.

Use `--config` to select a configuration file, or place one at the default path `<cwd>/.claude/session-audit.json` to override `money_terms`, `truth_paths`, and detector `rule_windows`. The default path is relative to the current working directory, so run the command from the target repo or pass `--config` explicitly. Worker sessions are excluded by default; pass `--include-workers` to retain them. A session whose first timestamp precedes a detector's window is `N/A`, never `FAIL`.

## Read the output

The default report contains the store and sample size, detector rates, stall labels and worst prompts, then delegation and token totals. `--flag D4 --top 10` is intended for precision checks: inspect the prompt, money hits, and truth paths before treating a rate as a verdict. `--prompts SESSION_ID` shows the prompt-level features used by D9. `--json` writes the same per-session, per-prompt, and aggregate data as one JSON document.

The detector definitions and thresholds are in [reference/detectors.md](reference/detectors.md). The implementation is [scripts/session_audit.py](scripts/session_audit.py); it streams JSONL and uses only Python 3.9+ standard-library modules.

## Boundaries

The audit measures transcript evidence, not whether a remembered fact was correct or whether a human would approve a flagged session. Review sampled failures, especially money-topic truth-path matches and broad narration/money regexes. It never writes to the transcript store.
