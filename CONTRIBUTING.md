# Contributing

Thanks for contributing a skill. This repo follows Anthropic's [Agent Skills authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — PRs that deviate from those guidelines will be asked to revise.

## Adding a new skill

1. **Fork and branch**: `git checkout -b add-<skill-name>`
2. **Create the skill directory**: `skills/<skill-name>/`
3. **Write `SKILL.md`** with valid YAML frontmatter (see template below)
4. **Add `reference/` and `examples/`** if the skill benefits from progressive disclosure
5. **Update the root `README.md`** skill table
6. **Open a PR** with a short description of what the skill enables

## `SKILL.md` template

```markdown
---
name: your-skill-name
description: One-sentence summary of what the skill does and when Claude should use it. Include concrete triggers — tool names, file extensions, user phrases.
---

# Your Skill Name

## Quick start

[Most common task, solved in 5-10 lines]

## When to use

[Bullet list of triggering situations]

## Reference

- [Command reference](reference/commands.md)
- [Advanced workflows](reference/workflows.md)
```

## Naming rules (enforced by Claude)

The `name` field:
- Max 64 characters
- Lowercase letters, numbers, hyphens only
- No XML tags
- Cannot contain reserved words `anthropic` or `claude`

The `description` field:
- Non-empty, max 1024 characters
- No XML tags
- **Third person** — "Processes X", not "I can help you process X"
- Include **what the skill does** AND **when to use it**
- Name specific triggers: tool names, file types, user-facing verbs

## Structural rules

- **SKILL.md under 500 lines** — split into `reference/*.md` when longer
- **One level deep** — every bundled file must link directly from `SKILL.md`, not from another reference file
- **Forward slashes in paths** — `reference/guide.md`, never `reference\guide.md`
- **TOC for long references** — any file over 100 lines needs a table of contents at the top
- **No time-sensitive statements** — "use version X after date Y" rots; prefer "old patterns" collapsible sections

## Content rules

- **Concise over verbose** — Claude already knows what a PDF is, what `grep` does, etc. Only add what Claude doesn't already know.
- **Consistent terminology** — pick one term and stick to it across the skill
- **Concrete examples** — input/output pairs beat abstract descriptions
- **Explicit script execution** — "Run `analyze.py`" vs "See `analyze.py` for the algorithm" — state which you want Claude to do

## Checking your skill

Before opening a PR, verify:

- [ ] `SKILL.md` frontmatter parses (no YAML errors)
- [ ] `name` and `description` match the rules above
- [ ] All internal links resolve
- [ ] No reference file links to another reference file (keep it one level deep)
- [ ] Skill directory contains no secrets, personal config, or large binaries
- [ ] Tested with a real task in Claude Code or Claude.ai

## License

By contributing, you agree your contribution is licensed under the MIT License (see [`LICENSE`](LICENSE)).
