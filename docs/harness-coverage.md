# Harness coverage

Shared skill instructions live in one `skills/<skill>/SKILL.md`. Claude Code, Codex, and Pi can all read that file. They do not share permission grants, hooks, or transcript stores.

This page states what each published skill can do on each harness, and what it cannot. It is not a certification that a harness executed the skill. Status comes from each skill's instructions and metadata, checked against the installed Pi 1.5.2 skill docs and a synthetic `--skill` probe. Live Claude Code and Codex discovery were not available when this was written: Claude Code was not logged in, and the Codex probe was blocked locally.

## What each harness loads

| Mechanism | Claude Code | Codex | Pi |
| --- | --- | --- | --- |
| `SKILL.md` instructions | Loaded when the skill is selected | Loaded when the skill is selected | Indexed by name and description at startup when a file-reading tool is available; the body is read later |
| `allowed-tools` | Temporary Bash allow-list while the skill is active | Not a permission grant | Documented as an experimental pre-approved tool list. Not verified as permission enforcement, and not a substitute for Pi's own tool permissions |
| Bundled Claude hooks | Run after a plugin install | Not loaded from a symlinked skill directory | Not executed. A hook file is inert text on Pi |
| Plugin marketplace metadata | Required for `/plugin` install | Required for `codex plugin` install | Not used. Pi discovers the skill directory |

Pi discovers a directory named `SKILL.md` recursively from `~/.agents/skills/` and from project `.agents/skills/` directories, walking ancestors up to the repository root. `pi --skill <path>` loads one skill explicitly. Install steps are in the README. Pi does not need `.claude-plugin/plugin.json`.

## Published skills

Dependencies are external programs or files the instructions require. Manual steps are actions the harness does not do for you. Missing functionality is behavior the skill has on one harness and not on another.

| Skill | Claude Code | Codex | Pi | Dependencies | Manual steps | Missing functionality |
| --- | --- | --- | --- | --- | --- | --- |
| obsidian | Instructions, plus an `allowed-tools` grant for `obsidian`, `jq`, and `pgrep` | Instructions only | Instructions only | Obsidian CLI, `jq`, and a running Obsidian app | Approve those commands in Codex and Pi; the frontmatter grant applies only in Claude Code | No harness-specific command gap |
| readout | Instructions only | Instructions only | Instructions only | None | None | None |
| domain-gloss | Instructions, plus an opt-in `UserPromptSubmit` hook | Instructions only | Instructions only | None for a manual gloss | Invoke the skill yourself (`$domain-gloss` in Codex, `/skill:domain-gloss` in Pi). Set `GLOSS_LANG` or `CLAUDE_GLOSS_LANG` in the environment that launches Codex or Pi; `CLAUDE_GLOSS_LANG` wins when both are nonempty. Approve `printenv` under that harness's own permission rules | The standing-mode hook, the `allowed-tools` grant, and Claude `settings.json` `env` blocks do not apply on Codex or Pi |
| thai-natural-voice | Instructions | Instructions | Instructions | Network access when a capture fetches a page; Slack connector or local CLI for Slack capture | Follow the capture reference before fetching or writing | Capture writes `~/.claude/thai-voice/`, a Claude config path, on every harness |
| blank-brain-recap | Instructions, plus a partial `allowed-tools` grant that does not cover compound scripts | Instructions; run the shell workflow yourself | Instructions; run the shell workflow yourself | `git`; `gh` only for open pull requests | Approve shell commands outside Claude Code | Memory search looks in `~/.claude` and `~/.ccs` only |
| safe-to-exit | Instructions, plus read-only `allowed-tools` grants | Instructions; run the shell workflow yourself | Instructions; run the shell workflow yourself | `git`, `gh`, and process-listing commands | Approve shell commands outside Claude Code. Secure-mode mutations are meant to prompt even in Claude Code | Subagent and loop checks describe Claude Code session state |
| agent-router | Instructions, plus optional SessionStart and PreToolUse hooks | Instructions; run the picker yourself | Instructions; run the picker yourself | Python 3 and the `aub` quota CLI | Without the Claude hooks, start at the picker. There is no injected quota line | SessionStart and PreToolUse hooks are Claude Code wiring. They do not install or run on Codex or Pi |
| session-audit | Supported. The scanner reads Claude Code JSONL | Not supported | Not supported | Python 3.9 or newer, standard library only | Point `--store` at the Claude project directory when you are not standing in that project | Pi session files are not accepted yet. Detectors and token totals describe Claude Code transcripts |
| meeting-secretary | Live phase, wrap-up, vocab, and the slash commands | Wrap-up, vocab, setup, and replay instructions only. Not executed on Codex | Wrap-up, vocab, setup, and replay instructions only. Not executed on Pi | macOS (Apple Silicon assumed), ffmpeg, Xcode command line tools (`swiftc`), `transcribe.cpp` with the Qwen3-ASR and Silero VAD models, and Python 3 | Run setup until the script stops reporting `missing:`. Grant Microphone (and Screen Recording or System Audio Recording when used) to the terminal app that launches the agent. Invoke the skill by name on Codex (`$meeting-secretary`) and Pi (`/skill:meeting-secretary`) | The live phase needs Claude Code's Monitor and TaskStop tools. Slash commands are Claude Code plugin commands. Microphone capture, background `final`, and model download under the Codex sandbox are not verified |

Mods under `mods/` are Claude Code hook plugins. They are not skills and are not installed on Codex or Pi.

## New skills

A new skill states its Claude Code, Codex, and Pi coverage in this table before it is called supported. Instructions that only need the model can say so. Anything else names the dependency, the manual step, or the missing function. Do not treat `allowed-tools` or a Claude hook as coverage on Codex or Pi.
