# Wiring

Add this to the repository's `.claude/settings.local.json`. `CLAUDE_PLUGIN_ROOT` is only defined for hooks shipped inside a plugin's own `hooks/hooks.json`; a repository's `.claude/settings.local.json` does not get it, so the commands below spell out the path. `~` is expanded because hook commands run through a shell.

```json
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "python3 ~/.claude/plugins/marketplaces/noomz-claude-skills/skills/agent-router/scripts/quota_snapshot.py"}]}],
    "PreToolUse": [{"matcher": "Agent|Task|Workflow", "hooks": [{"type": "command", "command": "python3 ~/.claude/plugins/marketplaces/noomz-claude-skills/skills/agent-router/scripts/agent_call_guard.py"}]}]
  }
}
```

If the marketplace is installed elsewhere, substitute that directory. A plugin-level `hooks/hooks.json` is the alternative if the router should apply in every repo.

The scripts locate the `aub` binary via `$AGENT_ROUTER_AUB`, then `PATH`, then `~/.local/bin/aub`. Set `AGENT_ROUTER_AUB` if it lives somewhere else; a missing binary is non-fatal and simply produces no output.

Paste this paragraph into the repository `CLAUDE.md`:

> At session start, read the agent-router quota line. Before a fan-out of three or more agents, any Workflow, or any T0 review, run `python3 <agent-router>/scripts/pick_agent.py <tier> --fresh`. Put the picker's `invoke:` line into the brief. Pin `model:` on Agent, Task, and Workflow `agent()` calls. Keep briefs below 7,000 bytes. After delegated edits, verify with `git diff` or `git -C <dir> diff --stat`; never trust an exit code alone. Include the subagent off-switch line in every brief.
