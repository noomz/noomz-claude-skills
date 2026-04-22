# claude-skills

A curated collection of [Claude Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — reusable, filesystem-based capabilities that extend Claude with domain-specific expertise, workflows, and best practices.

Each skill lives in its own directory under `skills/` and follows the [official authoring spec](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices). Skills load on-demand via progressive disclosure: only the `name` and `description` are pre-loaded into the system prompt; deeper instructions and references are read only when the skill is triggered.

## Available skills

| Skill | Description |
|---|---|
| [`obsidian-cli`](skills/obsidian-cli) | Drive an Obsidian vault from the terminal — daily notes, search, file ops, tags, tasks, plugin reloading, headless scripting. |

More skills incoming — see [`CONTRIBUTING.md`](CONTRIBUTING.md) to add your own.

## Installation

### Claude Code — `/plugin` (recommended)

This repo is a Claude Code plugin marketplace. Install from inside Claude Code:

```
/plugin marketplace add noomz/noomz-claude-skills
/plugin install obsidian-cli@claude-skills
```

To install from a local clone (useful while iterating):

```
/plugin marketplace add /path/to/claude-skills
/plugin install obsidian-cli@claude-skills
```

New skills added to this repo show up automatically in the marketplace listing — run `/plugin install <skill>@claude-skills` to grab them.

### Claude Code — manual copy

If you prefer not to use the plugin system, drop the skill directly into the skills folder.

Per-project:

```bash
cd your-project/
mkdir -p .claude/skills
cp -r /path/to/claude-skills/skills/obsidian-cli .claude/skills/
```

Global (all projects):

```bash
mkdir -p ~/.claude/skills
cp -r /path/to/claude-skills/skills/obsidian-cli ~/.claude/skills/
```

Or symlink so updates flow through:

```bash
ln -s "$(pwd)/skills/obsidian-cli" ~/.claude/skills/obsidian-cli
```

### Claude.ai

Zip the skill directory and upload it via **Settings → Features → Skills**:

```bash
cd skills/
zip -r obsidian-cli.zip obsidian-cli
```

### Claude API

Upload via the `/v1/skills` endpoint. See the [API skills guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide).

## Repo layout

```
claude-skills/
├── .claude-plugin/
│   └── marketplace.json         # Plugin marketplace manifest
├── README.md
├── LICENSE
├── CONTRIBUTING.md
└── skills/
    └── obsidian-cli/
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
