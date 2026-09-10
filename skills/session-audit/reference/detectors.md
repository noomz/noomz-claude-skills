# Detector reference

| ID | CLAUDE.md rule | Signal | Threshold | Known false positives |
|---|---|---|---|---|
| D1 | Checklist before non-trivial work | Checklist write in the first six tool calls | At least 15 tools and no matching write by tool 6; a later write is reported as late | Work may not need a state file; path can be hidden in a script |
| D2 | Narrate between steps | Assistant turn with text block of at least 20 characters | Less than 30% of assistant turns | Short but useful narration; generated status text |
| D3 | Subagents for exploration | Bash calls versus Agent/Task/Workflow calls | At least 100 Bash and at most 3 agents | Legitimately mechanical tasks; nested tools may be recorded differently |
| D4 | Truth repos for money topics | Boundary-aware money terms in cleaned prompts, assistant text, and tool inputs versus truth-path tool inputs | At least 10 topic hits, at least 3 distinct terms, and zero truth touches | Topic terms can be incidental; facts recalled from memory; wiki access represented opaquely |
| D5 | Fable delegates to cheaper models | Unmodelled Agent/Task or Workflow delegation while main model is fable | Any occurrence | Model may be selected by a wrapper or inherited from configuration |

Prompt wrapper blocks such as local-command output, command metadata, system reminders, and task notifications are removed before top-level prompts are counted. Worker sessions (identified by a teammate message or “You are a subagent” in their first top-level prompt) are excluded from detectors and stall counts by default; use `--include-workers` to include them.
| D6 | Verify by artifact after delegation | Delegation followed by git diff/status in next five tool uses | Any delegation with no check | Verification may happen outside the session or via another tool |
| D7 | Reviews converge | Review-bearing Agent prompts in a session | More than 2 | Several independent reviews; “review” in quoted user material |
| D8 | Big briefs kill spawns | UTF-8 byte length of Agent/Task prompt | Greater than 7,000 bytes | Long prompt may be deliberate or mostly structured data |
| D9 | Bias to closure / not stuck | Prompt-level stall features | LOOP or GRIND is a failure; WAIT/OK are not | WAIT can be an intentional long-running task; repeated commands can be harmless |
