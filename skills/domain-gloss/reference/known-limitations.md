# Known limitations


- **Stickiness is best-effort.** This is prompt text with no cross-turn state; across a long session the mode decays. A sentence in `CLAUDE.md` alone measured about 10% compliance on Band 3 terms. For standing mode, use the [opt-in hook](#standing-mode-opt-in-hook); otherwise re-invoke the skill.
- **No bundled glossary.** Renderings come from model knowledge and will vary slightly between sessions. For a fixed house translation, keep a glossary file in the repo and point at it.
- **Band 3 depends on repo evidence.** Cue (c) is the strongest signal; in a repo with thin schema and no defined terms, false-friend coverage degrades quietly.
- **Identifier roles need a source of truth.** With no inspected schema, data dictionary, or query result, most identifiers resolve to an explicit unknown rather than a role. That is the correct output, but a legacy database with no dictionary will produce a page of unknowns instead of a reading aid. Supply a dictionary first, or accept the unknowns as a map of what is undocumented.
- **The `allowed-tools` entry pins an exact command.** `Bash(printenv CLAUDE_GLOSS_LANG)` is deliberate — the `:*` prefix form would pre-allow bare `printenv` and dump every token and key in the environment into context. If exact-command matching is not honoured, the only symptom is a one-time permission prompt, which is the safe way to fail.
- **Overlaps with `explain-clear`** (`~/.claude/skills/explain-clear/SKILL.md`), whose `thai` / `th` command has its own bilingual mode. That skill replaces hard words; this one keeps them. If the wrong one activates, name it explicitly.
- **Breadth is the default.** Any locked domain is glossed, software included, so an ordinary repo with a dependency manifest will produce glosses. Narrow it with `CLAUDE_GLOSS_SKIP` rather than expecting the skill to guess which domains you already know.
- **Situational auto-firing is not available.** A skill is selected by matching your words, not by ambient facts about the repo, so working in an insurance codebase will not turn this on by itself. The opt-in hook is driven by your environment variables, not by the repo.
