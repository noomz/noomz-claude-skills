# claude-skills

A curated collection of [Claude Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — reusable, filesystem-based capabilities that extend Claude with domain-specific expertise, workflows, and best practices.

Each skill lives in its own directory under `skills/` and follows the [official authoring spec](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices). Skills load on-demand via progressive disclosure: only the `name` and `description` are pre-loaded into the system prompt; deeper instructions and references are read only when the skill is triggered.

## Available skills

| Skill | Description |
|---|---|
| [`obsidian`](skills/obsidian) | Drive an Obsidian vault from the terminal — daily notes, search, file ops, tags, tasks, plugin reloading, headless scripting. |
| [`readout`](skills/readout) | Report operational results as terse machine readouts — delta bridges, scan tables, verdict blocks, alarm stacks, event sequences — instead of narrative prose. |

More skills incoming — see [`CONTRIBUTING.md`](CONTRIBUTING.md) to add your own.

## Installation

### Claude Code — `/plugin` (recommended)

This repo is a Claude Code plugin marketplace. Install from inside Claude Code:

```
/plugin marketplace add noomz/noomz-claude-skills
/plugin install obsidian@noomz-claude-skills
```

To install from a local clone (useful while iterating):

```
/plugin marketplace add /path/to/claude-skills
/plugin install obsidian@noomz-claude-skills
```

New skills added to this repo show up automatically in the marketplace listing — run `/plugin install <skill>@noomz-claude-skills` to grab them.

### Claude Code — manual copy

If you prefer not to use the plugin system, drop the skill directly into the skills folder.

Per-project:

```bash
cd your-project/
mkdir -p .claude/skills
cp -r /path/to/claude-skills/skills/obsidian .claude/skills/
```

Global (all projects):

```bash
mkdir -p ~/.claude/skills
cp -r /path/to/claude-skills/skills/obsidian ~/.claude/skills/
```

Or symlink so updates flow through:

```bash
ln -s "$(pwd)/skills/obsidian" ~/.claude/skills/obsidian
```

### Claude.ai

Zip the skill directory and upload it via **Settings → Features → Skills**:

```bash
cd skills/
zip -r obsidian.zip obsidian
```

### Claude API

Upload via the `/v1/skills` endpoint. See the [API skills guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide).

## Permissions

Skills in this repo declare `allowed-tools` in their frontmatter so Claude Code won't prompt on every invocation **while the skill is active**. For example, `obsidian` pre-allows `Bash(obsidian:*)`, `Bash(jq:*)`, and `Bash(pgrep:*)`.

That covers skill-scoped usage. If you want the same commands allowed **globally** (outside the skill, in any conversation), add them once via:

```
/permissions
```

…then add `Bash(obsidian *)` to the allow list. Or edit `.claude/settings.json` directly:

```json
{
  "permissions": {
    "allow": ["Bash(obsidian *)", "Bash(jq:*)"]
  }
}
```

Note: at the time of writing, Claude Code plugins cannot pre-declare `permissions` in a plugin-shipped `settings.json` (only `agent` and `subagentStatusLine` are supported). Skill-level `allowed-tools` is the supported mechanism.

## Repo layout

```
claude-skills/
├── .claude-plugin/
│   └── marketplace.json         # Plugin marketplace manifest
├── README.md
├── LICENSE
├── CONTRIBUTING.md
└── skills/
    └── obsidian/
        ├── .claude-plugin/
        │   └── plugin.json      # Individual plugin manifest
        ├── SKILL.md
        ├── reference/
        │   ├── commands.md
        │   ├── daily-notes.md
        │   ├── developer.md
        │   └── automation.md
        └── examples/
            └── workflows.md
```

## Principles

These skills follow Anthropic's authoring guidance:

- **Concise SKILL.md** (under 500 lines) — assumes Claude already knows general concepts
- **Progressive disclosure** — detail lives in `reference/` and `examples/`, loaded only when needed
- **One-level-deep references** — every bundled file is linked directly from `SKILL.md`
- **Third-person descriptions** — the `description` field is injected into the system prompt
- **Concrete triggers** — descriptions name specific tools, file types, and user intents

## Security

Skills can direct Claude to run code and invoke tools. Only use skills from sources you trust. Audit `SKILL.md` and any bundled scripts before installing — especially skills that fetch external content at runtime.

## License

MIT — see [`LICENSE`](LICENSE).
