# noomz agent skills

A curated collection of reusable [Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) for Claude, Codex, and compatible agents — filesystem-based capabilities that add domain-specific expertise, workflows, and best practices.

Each skill lives in its own directory under `skills/` and follows the [official authoring spec](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices). Skills load on-demand via progressive disclosure: only the `name` and `description` are pre-loaded into the system prompt; deeper instructions and references are read only when the skill is triggered.

## Available skills

| Skill | Description |
|---|---|
| [`obsidian`](skills/obsidian) | Drive an Obsidian vault from the terminal — daily notes, search, file ops, tags, tasks, plugin reloading, headless scripting. |
| [`readout`](skills/readout) | Report operational results as terse machine readouts — delta bridges, scan tables, verdict blocks, alarm stacks, event sequences — instead of narrative prose. |
| [`domain-gloss`](skills/domain-gloss) | Keep English domain terms and schema identifiers exact, with first-language explanations beside jargon, false friends, and opaque table or field names. |
| [`thai-natural-voice`](skills/thai-natural-voice) | Draft natural Thai for agent replies, technical work, and publishing — generic profiles, source-inspired presets, and a `/capture-thai-voice` workflow for links, names, documents, or Slack authors through an authorized connector or local CLI. |

More skills incoming — see [`CONTRIBUTING.md`](CONTRIBUTING.md) to add your own.

## Installation

### Codex — repo marketplace

This repo includes a Codex plugin manifest and repository marketplace. Install the plugin from GitHub:

```bash
codex plugin marketplace add noomz/noomz-claude-skills
codex plugin list
codex plugin add noomz-claude-skills@noomz-claude-skills
```

Start a new Codex session after installation so the skills are discovered. For local development, add the checked-out repository marketplace instead:

```bash
codex plugin marketplace add /path/to/claude-skills
codex plugin add noomz-claude-skills@noomz-claude-skills
```

### Codex — individual skills

Codex also discovers skills directly from `.agents/skills`. Link whichever skills you want into a project:

```bash
mkdir -p .agents/skills
ln -s "$(pwd)/skills/obsidian" .agents/skills/obsidian
ln -s "$(pwd)/skills/readout" .agents/skills/readout
ln -s "$(pwd)/skills/domain-gloss" .agents/skills/domain-gloss
ln -s "$(pwd)/skills/thai-natural-voice" .agents/skills/thai-natural-voice
```

Each skill requires `SKILL.md`; the optional `agents/openai.yaml` files provide Codex display metadata and starter prompts.

### Claude Code — `/plugin` (recommended)

This repo is also a Claude Code plugin marketplace. Install from inside Claude Code:

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
├── .agents/
│   └── plugins/
│       └── marketplace.json     # Codex plugin marketplace manifest
├── .claude-plugin/
│   └── marketplace.json         # Plugin marketplace manifest
├── .codex-plugin/
│   └── plugin.json              # Codex plugin manifest
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

These skills follow the open Agent Skills format and Anthropic's authoring guidance:

- **Concise SKILL.md** (under 500 lines) — assumes Claude already knows general concepts
- **Progressive disclosure** — detail lives in `reference/` and `examples/`, loaded only when needed
- **One-level-deep references** — every bundled file is linked directly from `SKILL.md`
- **Third-person descriptions** — the `description` field is injected into the system prompt
- **Concrete triggers** — descriptions name specific tools, file types, and user intents

The Codex package is instruction-first: it ships skills and display metadata without MCP servers, hooks, or external credentials. Other agent hosts can consume the individual skill directories directly; marketplace installation and discovery commands remain host-specific.

## Security

Skills can direct Claude to run code and invoke tools. Only use skills from sources you trust. Audit `SKILL.md` and any bundled scripts before installing — especially skills that fetch external content at runtime.

## License

MIT — see [`LICENSE`](LICENSE).
