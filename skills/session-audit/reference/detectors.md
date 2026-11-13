# Detector reference

| ID | CLAUDE.md rule | Signal | Threshold | Known false positives |
|---|---|---|---|---|
| D1 | Checklist before non-trivial work | Checklist write in the first six tool calls | At least 15 tools and no matching write by tool 6; a later write is reported as late | Work may not need a state file; path can be hidden in a script |
| D2 | Narrate between steps | Assistant turn with text block of at least 20 characters | Less than 30% of assistant turns | Short but useful narration; generated status text |
| D3 | Subagents for exploration | Bash calls versus Agent/Task/Workflow calls | At least 100 Bash and at most 3 agents | Legitimately mechanical tasks; nested tools may be recorded differently |
| D4 | Truth repos for high-stakes topics | Boundary-aware topic terms in cleaned prompts, assistant text, and tool inputs versus truth-path tool inputs | At least 10 topic hits, at least 3 distinct terms, and zero truth touches | Topic terms can be incidental; facts recalled from memory; wiki access represented opaquely |
| D5 | Fable delegates to cheaper models | Unmodelled Agent/Task or Workflow delegation while main model is fable | Any occurrence | Model may be selected by a wrapper or inherited from configuration |
| D6 | Verify by artifact after delegation | Delegation followed by git diff/status in next five tool uses | Any delegation with no check | Verification may happen outside the session or via another tool |
| D7 | Reviews converge | Review-bearing Agent prompts in a session | More than 2 | Several independent reviews; "review" in quoted user material |
| D8 | Big briefs kill spawns | UTF-8 byte length of Agent/Task prompt | Greater than 7,000 bytes | Long prompt may be deliberate or mostly structured data |
| D9 | Bias to closure / not stuck | Prompt-level stall features | LOOP or GRIND is a failure; WAIT/OK are not | WAIT can be an intentional long-running task; repeated commands can be harmless |

## Applicability

A detector reports `N/A` instead of `PASS`/`FAIL` when it cannot apply:

- **D4 is `N/A` until it is configured.** The scanner ships no `money_terms` and no `truth_paths`, because both are specific to your domain and your repos. Set them in a config file to switch D4 on.
- **Any detector is `N/A` for sessions older than its rule window.** `rule_windows` is empty by default, so every detector applies to every session. Set a date per detector to record when that rule started applying in your repo.

## Per-harness applicability

`UNAVAILABLE` (with a `reason`) differs from `N/A`: `N/A` means config or a rule window turns the detector off; `UNAVAILABLE` means the harness records no evidence for it. Neither is a pass, and neither counts toward the applicable total.

| ID | Claude Code | Pi |
|---|---|---|
| D1 | Applies: `Write`/`Edit` of a `.planning/` state file, or `Bash` writing one | Applies: `write`/`edit` with a `path` arg, or `bash` with a `command` arg, naming the same files. Literal file-write evidence only |
| D2 | Applies: assistant text blocks | Applies: assistant `text` blocks (thinking blocks dropped) |
| D3 | Applies: `Bash` versus `Agent`/`Task`/`Workflow` | `UNAVAILABLE`, "no Pi delegation evidence model". Pi `bash` is not renamed to `Bash` |
| D4 | Applies when `money_terms` and `truth_paths` are set | Same sources as Claude; `N/A` until configured |
| D5-D8 | Apply (model choice, artifact check, review rounds, brief size) | `UNAVAILABLE`, same reason. Pi tool names are never treated as `Agent`/`Task`/`Workflow` |
| D9 | `LOOP` or `GRIND` fails | `LOOP` fails. GRIND needs "no delegation", which Pi cannot evidence, so a prompt meeting the other GRIND conditions is labelled `UNKNOWN`. D9 is `FAIL` on any `LOOP`, else `UNAVAILABLE` if any `UNKNOWN`, else `PASS` |

For Pi, the delegation summary prints `unavailable (pi)` and JSON carries `null` plus a reason for `agent_calls`, `agent_calls_with_model`, `off_claude`, `tokens_per_model`, `token_fields_per_model`, and `subagent_tokens_per_model`. Per-prompt `agents` is `null`; per-prompt `tokens` is `null` unless the span has Pi assistant usage (`output + cacheWrite`).

## Pi history and lineage

- **One path per file.** The audit reads raw recorded history along one leaf-to-root path. Abandoned branches and other roots are excluded and counted (`abandoned`). The default leaf is the last appended entry, because Pi rebuilds `leafId` from append order on reopen; a navigation with no later append is not persisted. A malformed or id-less last line means the leaf is unknown and the file is unavailable unless `--leaf` is given.
- **Audit history is not model-visible context.** Entries before a compaction stay on the path, and `context_edit` is not applied. The audit does not show what the model saw after compaction or an edit.
- **Version 1** files are linear: all non-header entries in append order, read in memory, labelled `v1-linear`, never migrated. `--leaf` on a v1 file is an error. `hookMessage` is treated like v3 `custom` (not a prompt). Versions other than 1-3 are unavailable.
- **Forks.** A header `parentSession` is reported with `lineage_followed: false`; the parent is not opened or stitched. Forks copy history, so their usage is excluded from the aggregate and the report warns that detector rates and prompt tables may double-count when parent and fork are both audited.

## Pi usage

Pi fields `input`, `output`, `cacheRead`, `cacheWrite` are reported as `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` (renamed, not converted). Buckets: `assistant` (by `message.model`), `usage_entry` (by model and `kind`), `compaction`, `branch_summary`. Tool-result usage has no established attribution (`nestedCalls` may repeat it), so it is shown as `tool_result (not in totals)` and never summed.

Two scopes, each entry counted once: `path` (entries on the selected path) and `file` (every entry in the file). Neither is claimed to equal Pi's own session statistics. A missing `usage` is absent, not zero; a scope with no usage anywhere reads `unavailable`. The aggregate is path scope over non-fork sessions only.

## Problems

Text and JSON list per-file problems with path, kind, and detail (ids, counts, versions; never transcript text): `malformed_lines`, `missing_field`, `duplicate_id`, `unreadable`, `missing_header`, `unsupported_version`, `leaf_unknown`, `leaf_not_found`, `leaf_unsupported_v1`, `broken_lineage`, `lineage_cycle`, `store_not_found`, `cwd_missing`, `duplicate_session_id` (informational; the second file's id gets a `~2` suffix). Sessions with the first three kinds are audited but `complete: false`. `store_not_found` means nothing was scanned, `cwd_missing` excludes the file from project selection, and `duplicate_session_id` is informational; every other kind makes the file unavailable. Claude runs report `malformed_lines` and `unreadable` the same way. Reports contain prompt excerpts: do not paste them into public issues.

A repeated entry id keeps the last entry, as Pi's own loader does, and is reported as `duplicate_id`. A line that holds `NaN` or `Infinity` is not JSON and counts under `malformed_lines`. A Claude session read from a file with malformed lines, or from a file that could not be read to the end, is reported `complete: false`.

## Prompt handling

Prompt wrapper blocks — local-command output, command metadata, system reminders, and task notifications — are removed before top-level prompts are counted. Worker sessions (identified by a teammate message or "You are a subagent" in their first top-level prompt) are excluded from detectors and stall counts by default; use `--include-workers` to include them.

## Config file

Default path `<cwd>/.claude/session-audit.json`, or pass `--config PATH`:

```json
{
  "money_terms": ["premium", "cash value", "NFO"],
  "truth_paths": ["your-canonical-repo", "docs/kb", "wiki_query"],
  "rule_windows": {"D2": "2026-08-26"}
}
```
