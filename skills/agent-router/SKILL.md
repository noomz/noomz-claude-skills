---
name: agent-router
description: Route Claude, Codex, Grok, and local subagents by task tier and live aub quota. Use before agent fan-outs, Workflow calls, T0 reviews, or when choosing a provider/model for delegation.
allowed-tools: Bash(python3:*)
---

# Agent router

Use the router when delegation can spend a provider budget in a burst. It is an L2 warning system: it advises and warns, but never rewrites a tool call.

## Workflow

1. Read the quota line injected at session start, once the hooks in [reference/wiring.md](reference/wiring.md) are installed. Without them there is no quota line and step 2 is the entry point.
2. Run `python3 <skill-root>/scripts/pick_agent.py <T0|T1|T2|T3>` before a fan-out of three or more agents, any `Workflow`, or any T0 review. Add `--fresh` for those burst decisions.
3. Put the selected `invoke:` line into the brief. Keep Agent prompts below 7,000 bytes; a brief near 8 KB can silently kill a spawn.
4. Pin `model:` on every Agent/Task and every Workflow `agent()` call when the tool supports it.
5. After a delegation expected to edit files, verify with `git -C <dir> diff --stat` or `git diff`; never trust the provider exit code alone.

The picker reads `aub --cached --json --provider all` by default. `--fresh` omits `--cached`. The `aub` binary is resolved from `$AGENT_ROUTER_AUB`, then `PATH`, then `~/.local/bin/aub`. Missing or failing `aub` is non-fatal: scripts exit 0 and print nothing.

## Routing rules

Tiers are ordered by task difficulty: T0 frontier, T1 reasoning, T2 standard, and T3 mechanical. A provider is GREEN at 40% or more remaining, AMBER from 15% up to 40%, and RED below 15% or when its status is not `ok`. The worst quota window controls provider colour. Pace above 1.2 degrades the colour once. AMBER candidates are chosen by soonest reset; GREEN candidates follow the tier's cost order.

Run `pick_agent.py --explain` when the reason for a choice matters. Use `--json` for an orchestrator or hook.

Read [reference/tiers.md](reference/tiers.md) for the complete provider/model table, invocation shapes, and traps. Read [reference/wiring.md](reference/wiring.md) to enable the SessionStart and PreToolUse hooks in a repository.

## Hooks

`quota_snapshot.py` is the SessionStart hook. `agent_call_guard.py` is the non-blocking PreToolUse hook for `Agent|Task|Workflow`. Both are safe to install: they emit no output on malformed input or unavailable quota data. The guard only reads the picker stamp and keeps a per-session call count. Verify a change with `python3 <skill-root>/scripts/test_pick_agent.py`.
