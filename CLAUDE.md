# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A Claude Code plugin marketplace hosting Agent Skills. No source code to build — content is Markdown + JSON manifests. End users install skills via `/plugin` in Claude Code.

Two separate names are in play and must stay in sync:
- **GitHub repo**: `noomz/noomz-claude-skills`
- **Marketplace name** in `.claude-plugin/marketplace.json` → `"name": "noomz-claude-skills"`

These are used as `/plugin marketplace add noomz/noomz-claude-skills` and `/plugin install <skill>@noomz-claude-skills` respectively. If one changes, update the other and update every `@...-claude-skills` reference in `README.md`.

## Adding a new skill — operational workflow

1. Create `skills/<skill-name>/SKILL.md` with frontmatter (`name`, `description`, optional `allowed-tools`).
2. Create `skills/<skill-name>/.claude-plugin/plugin.json` (name, description, version, author, homepage, license, keywords).
3. Append a plugins-array entry to `.claude-plugin/marketplace.json`.
4. Add the skill to the table in `README.md`.
5. Run the validation block below before committing.

For bigger skills, also add `skills/<skill-name>/reference/*.md` and `skills/<skill-name>/examples/*.md`. All bundled files must be linked **directly from SKILL.md** — one level deep only.

## Validation before every commit

Every change to a SKILL.md or manifest should pass these checks. Run from the repo root:

```bash
# 1. Frontmatter rules
python3 -c "
import re, sys, glob
errs = []
for p in glob.glob('skills/*/SKILL.md'):
    c = open(p).read()
    m = re.match(r'---\n(.*?)\n---', c, re.DOTALL)
    if not m: errs.append(f'{p}: no frontmatter'); continue
    fm = m.group(1)
    name = re.search(r'^name:\s*(.+)$', fm, re.MULTILINE).group(1).strip()
    desc = re.search(r'^description:\s*(.+)$', fm, re.MULTILINE).group(1).strip()
    if len(name) > 64: errs.append(f'{p}: name > 64')
    if not re.fullmatch(r'[a-z0-9-]+', name): errs.append(f'{p}: name charset')
    if any(w in name for w in ('anthropic','claude')): errs.append(f'{p}: name reserved')
    if len(desc) > 1024: errs.append(f'{p}: description > 1024')
    if '<' in desc or '>' in desc: errs.append(f'{p}: description XML')
sys.exit(1 if errs else 0) if errs else print('frontmatter OK')
[print(' -', e) for e in errs]
"

# 2. JSON manifests parse
python3 -c "import json, glob; [json.load(open(p)) for p in glob.glob('**/.claude-plugin/*.json', recursive=True)]; print('JSON OK')"

# 3. SKILL.md line cap (progressive disclosure: under 500)
awk 'END{if(NR>500)print FILENAME,"exceeds 500 lines:",NR}' skills/*/SKILL.md
```

## Content rules that matter here

These are enforced by the Agent Skills spec, not generic style preferences:

- **`name` charset**: lowercase letters, numbers, hyphens only; max 64 chars; cannot contain `anthropic` or `claude`.
- **`description`**: third-person, non-empty, max 1024 chars, no XML tags. Must include what the skill does AND when to trigger it. Claude picks skills by semantic match on this field — be specific, name the tool, name user phrasings.
- **`allowed-tools`** (optional): comma-separated list in frontmatter. Claude Code pre-allows these Bash patterns while the skill is active. Example: `allowed-tools: Bash(obsidian:*), Bash(jq:*)`. Use `:*` suffix for "prefix anything". This is the supported permission mechanism — plugin-level `settings.json` does **not** yet accept a `permissions` key.
- **SKILL.md body**: under 500 lines. Longer material goes in `reference/*.md`.
- **One level deep only**: every reference file must be linked directly from SKILL.md, never from another reference file. Claude may partially read nested references.
- **Forward slashes** in all paths, always.
- **No time-sensitive claims** ("after Aug 2025, use X"). If you must discuss legacy, use a collapsible `<details>` block labeled "Old patterns".

## Writing SKILL.md for a CLI tool — lesson from obsidian-cli

When documenting a CLI, **always verify command syntax against live `<tool> help` output before writing**. The obsidian-cli skill v0.1.0 fabricated flags (`files sort=modified limit=N --copy`) and used the wrong arg name for `eval` (bare string instead of `code=...`). v0.1.1 fixed these after the user pasted real `obsidian help` output. Before shipping CLI documentation:

1. Run `<tool> help` and every subcommand's help.
2. Cross-reference the official docs URL, but trust the live help output when they disagree.
3. If uncertain about a flag or JSON schema, hedge with "verify at runtime via `<tool> help <cmd>`" instead of asserting.

## Versioning and releases

Every substantive change to a skill bumps `skills/<name>/.claude-plugin/plugin.json`'s `version` field. Semver — patch for fixes/doc tweaks, minor for new commands/features, major for breaking changes to user-facing commands or frontmatter.

Users update their installed plugin with:
```
/plugin marketplace update noomz-claude-skills
/reload-plugins
```

Note: `/plugin update <name>@<marketplace>` is **not** a real command — it fails silently. Always direct users through marketplace update → reload.

## Git account context

The user's machine has two authenticated GitHub accounts; this repo lives under `noomz`, not `noomzopendream`. Before `gh repo create`, `gh pr create`, or any push-side operation, check `gh auth status` and `gh auth switch --user noomz` if the active account is wrong.

## Commit message style

From the existing git log: multi-paragraph body with a one-line summary, followed by bullet points explaining what changed and why (not what files). End with the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

```
skill-name: vX.Y.Z — one-line summary

Paragraph explaining the motivation and what was wrong before (if this
is a fix) or what this enables (if this is a feature).

- Bullet of change 1
- Bullet of change 2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## Scope discipline

This repo hosts Agent Skills only. Do not add: generic CLAUDE.md templates for other projects, agents/commands/hooks (those belong in separate plugins), user-specific config, built artifacts, or anything requiring a build step. Each skill stays focused on a single tool or workflow — if scope creeps, split it into a new skill rather than bloating SKILL.md.
