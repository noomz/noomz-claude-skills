# Standing mode (opt-in hook) and measuring

Asking once does not last: a mode set by prose decays across turns. The plugin
bundles a `UserPromptSubmit` hook ([hooks/hooks.json](../hooks/hooks.json) → [scripts/gloss_reminder.py](../scripts/gloss_reminder.py))
that restates the rule on every prompt. It prints **nothing** unless you opt in,
so installing or updating the plugin changes nothing by default.

Opt in through settings.json `env` (user, project, or local):

```json
{ "env": { "CLAUDE_GLOSS_LANG": "th", "CLAUDE_GLOSS_HOOK": "on" } }
```

| Variable | Effect |
|---|---|
| `CLAUDE_GLOSS_HOOK` | Trimmed and case-insensitive `on` activates. Anything else, including unset, keeps the hook silent |
| `CLAUDE_GLOSS_LANG` | Must be a non-English tag; every entry of a comma chain must be well-formed, and the chain at most 80 characters. `simple-en` counts as active |
| `CLAUDE_GLOSS_SKIP` | Passed into the reminder for the model to apply, sanitized: control characters removed, first 80 characters |
| `CLAUDE_GLOSS_SUBAGENT_MARKER` | Optional. Prompts starting with this string get no reminder |

When active it adds one line (about 60 tokens) per prompt:

```
domain-gloss ON (<lang>[; skip: <CLAUDE_GLOSS_SKIP>]): keep each domain term in English; gloss Band 2 on first use and Band 3 false friends once per answer as "term (gloss)". Chat prose only — never in code, commits, files on disk, or text sent to tools or other agents.
```

The reminder does not load this skill body. Invoke `/domain-gloss` once when the
band rules or rendering details are needed.

It stays silent inside subagents: Claude Code documents an `agent_id` field inside
subagent calls, and the hook stays silent when it is present. The marker and
slash-command guards exist because that field has not been confirmed for every way a
subagent can start. It also stays silent for prompts starting with
`CLAUDE_GLOSS_SUBAGENT_MARKER`, for slash-command prompts other than `/domain-gloss`,
when any `CLAUDE_GLOSS_LANG` entry is malformed, when the primary subtag is `en`,
`eng`, or `english`, and when the prompt is missing or not text. Headless workers
(`claude -p`) are new main sessions, so an orchestrator must not hand them
`CLAUDE_GLOSS_HOOK=on` — unset it or set `off`.

The hook reads the process environment only, meaning what settings.json `env`
provides. It cannot see a per-turn request or an invocation tag such as
`/domain-gloss th`; those still work through the skill itself.

Why it exists: on real transcripts, a standing rule in a project `CLAUDE.md` alone
produced about 10% gloss compliance on Band 3 terms (7% before the rule), decaying
to about 3% past the tenth prompt.

### Measure it

[scripts/gloss_rate.py](../scripts/gloss_rate.py) is a read-only stdlib script that reports the glossed rate
for a term list from Claude Code JSONL transcripts:

```bash
python3 <skill-root>/scripts/gloss_rate.py --terms premium,claim
```

Flags: `--store` (transcript directory), `--terms a,b` or `--terms @file`,
`--since YYYY-MM-DD`, `--window N` (characters after the term to look for a gloss,
default 60), `--json PATH`, and `--leak-check` (exits 1 if the reminder string
appears in any subagent transcript). A missing transcript store exits 2. `--leak-check` counts only hook-injected context records, so a subagent that merely reads this skill's text is not a leak. It cannot detect `simple-en` glosses.
