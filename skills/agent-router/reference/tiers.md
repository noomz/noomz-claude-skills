# Agent router tiers

One row per provider/model choice, **listed in the exact order `pick_agent.py` considers them** — the first non-RED row of a tier wins, so row order is the cost order. `aub` account means the provider id and, for Claude, the selected account (default `work`; set `AGENT_ROUTER_CLAUDE_ACCOUNT` or `--claude-account`). The `How to invoke` column reproduces the picker's `invoke:` string verbatim; paste that line, not a paraphrase.

Cost order inside a tier: local runtimes, then ccs, then Grok, then the Codex cheap lane, then Claude — with Gemini last in T2 because it is unverified.

| Tier | Provider | Model | aub provider id (+ account) | How to invoke | Cost lane | Use for | Traps |
|---|---|---|---|---|---|---|---|
| T0 | Codex | gpt-6-astra | codex | `codex exec -m gpt-6-astra - < brief.md` | frontier | adversarial review, hard root cause, money logic | Codex `-p` is `--profile`, not prompt. Verify with `git diff`, never exit code. |
| T0 | Claude | fable | — | main loop only; never a subagent | frontier | hardest reasoning | Not selectable by the picker. Keep the main frontier model for planning and synthesis. |
| T1 | Codex | gpt-5.6-terra | codex | `codex exec -m gpt-5.6-terra - < brief.md` | mid | deep reasoning and synthesis | Codex `-p` is `--profile`; verify by artifact. |
| T1 | Claude | opus | claude + account | `Agent model: opus` | frontier | architecture, synthesis, planner/critic | Pin `model:`. |
| T2 | Ollama | local | ollama | `ollama` | free | scoped local work | GREEN when status is `ok`; skipped entirely when absent. |
| T2 | LM Studio | local | lmstudio | `lmstudio` | free | scoped local work | GREEN when status is `ok`; skipped entirely when absent. |
| T2 | Llama.cpp | local | llamacpp | `llamacpp` | free | scoped local work | GREEN when status is `ok`; skipped entirely when absent. |
| T2 | Grok | grok-4.6 | grok | `grok --prompt-file brief.md -m grok-4.6 --permission-mode auto --max-turns 40 --output-format json --cwd DIR` | cheap | standard implementation and research | `acceptEdits` and `dontAsk` are silent no-ops. `-p` is single prompt and conflicts with `--prompt-file`. Verify `git diff`, not exit code. |
| T2 | Codex | gpt-5.6-luna | codex | `codex exec -m gpt-5.6-luna - < brief.md` | cheap | standard implementation and research | Codex `-p` is `--profile`; verify by `git diff`. |
| T2 | Codex | gpt-5.6-sol | codex | `codex exec -m gpt-5.6-sol - < brief.md` | cheap | standard implementation | Codex `-p` is `--profile`; verify by artifact. |
| T2 | Claude | sonnet | claude + account | `Agent model: sonnet` | mid | scoped implementation, standard review | Pin `model:`; account quota is selected explicitly. |
| T2 | Gemini | default | gemini | `gemini` | mid | standard work when eligible | Unverified (last seen returning `IneligibleTierError`). Ranked last on purpose; do not assume it works. |
| T3 | Ollama | local | ollama | `ollama` | free | mechanical work | GREEN when status is `ok`; skip when absent. |
| T3 | LM Studio | local | lmstudio | `lmstudio` | free | mechanical work | GREEN when status is `ok`; skip when absent. |
| T3 | Llama.cpp | local | llamacpp | `llamacpp` | free | mechanical work | GREEN when status is `ok`; skip when absent. |
| T3 | ccs | glm | ccs | `ccs glm -p "..."` | cheap | mechanical edits and checks | Treated as UNKNOWN (never skipped) when `aub` reports no ccs provider. Brief must include the subagent off-switch line. |
| T3 | ccs | kimi | ccs | `ccs kimi -p "..."` | cheap | mechanical edits and checks | Treated as UNKNOWN when absent. Brief must include the subagent off-switch line. |
| T3 | Grok | grok-4.6 | grok | `grok --prompt-file brief.md -m grok-4.6 --permission-mode auto --max-turns 40 --output-format json --cwd DIR` | cheap | wide greps and bulk audits | Use `--permission-mode auto`; `acceptEdits`/`dontAsk` silently do nothing. |
| T3 | Codex | gpt-5.6-luna (low) | codex | `codex exec -m gpt-5.6-luna -c model_reasoning_effort=low - < brief.md` | cheap | mechanical work | Codex `-p` is `--profile`; verify by artifact. |
| T3 | Claude | haiku | claude + account | `Agent model: haiku` | cheap | verify passes and mechanical work | Pin `model:`. |

The frontier Codex row is the only selectable T0 subagent; Claude fable is main-loop only.

Every subagent brief should start with: `You are a subagent. readout and domain-gloss are OFF: plain English, no Thai glosses, no readout blocks or provenance tags.`
