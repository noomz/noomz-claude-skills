---
name: domain-gloss
description: Keeps the English domain term and attaches a short inline gloss in the developer's configured first language, so jargon teaches instead of blocking. Covers specialist terms (subrogation, estoppel, indemnity) and ordinary-looking words carrying a shifted domain meaning (consideration in contract law, endorsement in insurance, stewardship in nonprofit) — not general academic English. Triggers on "gloss the jargon", "explain in my language", "add Thai", "I don't know these insurance words", "what is subrogation", "too many hard words", and on domain-heavy insurance, legal, finance, healthcare, nonprofit, or technical work once the user has asked for glossing. Reads the target language from configuration rather than assuming one. Distinct from explain-clear — this skill keeps the hard word and anchors it so the reader learns it, while explain-clear replaces hard words with simpler English. Does not apply to code edits, git operations, or whole-document translation.
allowed-tools: Bash(printenv CLAUDE_GLOSS_LANG), Bash(printenv CLAUDE_GLOSS_SKIP)
---

# Domain Gloss

A developer working in an unfamiliar domain is not blocked by English. They are
blocked by roughly two hundred domain terms that arrive faster than they can be
looked up — and by a smaller, meaner set of ordinary words that quietly mean
something else here.

Translating the sentence does not fix this. The terms are in the tickets, the
schema, and the code review; the developer has to end up owning them. So keep
the English term exactly as it is and attach a short anchor in their language:

> Insurer exercises subrogation (การรับช่วงสิทธิ์ — จ่ายเราก่อน แล้วไปไล่เบี้ยคู่กรณีแทน) after payout.

The term stays greppable and sayable in standup. The anchor makes it stick.

## Resolve the gloss language first

Never assume a language. Resolve in this order, most specific first:

1. **Stated this turn** — "gloss in Japanese", "add Thai". Wins over everything, never persisted.
2. **Named at invocation** — `/domain-gloss th`. Read the tag from the user's own text.
3. **Project, personal** — `CLAUDE_GLOSS_LANG` in the repo's `.claude/settings.local.json` env block.
4. **Project, shared** — same variable in the committed `.claude/settings.json` env block.
5. **User default** — same variable in `~/.claude/settings.json` env block.
6. **Unset** — ask once, then continue.

Rungs 3 through 5 arrive as an environment variable. Read it with exactly:

```bash
printenv CLAUDE_GLOSS_LANG || echo unset
```

Values are BCP-47 tags — `th`, `ja`, `zh-Hant`, `pt-BR`. Region and script are not
decoration: `zh-Hans` and `zh-Hant` are different scripts, and `pt-BR` and `pt-PT`
diverge in exactly the legal vocabulary this skill glosses.

Two values need explicit handling:

- **A comma-separated list is a fallback chain, not a request for two glosses.** Gloss into the first tag. Use a later tag only when you cannot render the first one confidently. Never stack two languages in one gloss — that breaks rules 6 and 7 below.
- **`simple-en` means the anchor is a plain-English definition** rather than a translation, and the micro-definition form is dropped as redundant: `subrogation (insurer pays you first, then pursues the other party)`.

**When resolution fails, do not guess.** Each failure has one correct response:

| Situation | Do this |
|---|---|
| `printenv` unavailable or not permitted | Treat as unset — fall to rung 6 |
| Unset | Ask once, then continue |
| Unrecognised or malformed tag (`thai`, `Thai`, `th-TH-x-junk`) | Ask which language was meant; never infer from a near-miss |
| Value is `en` or any English tag | Do not activate. There is nothing to anchor to — suggest `simple-en`, or explain-clear if the goal is simpler English |

When nothing is configured, ask once — then offer to persist to rung 3 and let the
user do it. Do not write to a settings file on your own initiative.

### Excluding categories

Glossing is not restricted to business domains. Software and infrastructure are
lockable domains too, so `singleflight` and `cache stampede` are legitimate Band 2
terms in a Redis repo. That is the default and it is deliberate — a developer
reading a second language is not only reading insurance contracts.

When a category is unwanted, name it in `CLAUDE_GLOSS_SKIP`, resolved through the
same six rungs as the language:

```bash
printenv CLAUDE_GLOSS_SKIP || echo none
```

Comma-separated free-text labels, matched against the locked domain — `software`,
`infra`, `frontend`, `finance`, `legal`, `medical`. When the locked domain matches
a skip entry, glossing is off for that domain entirely, Band 2 and Band 3 alike. A
term still glosses if it belongs to a second locked domain that is not skipped: in
an insurance repo skipping `software`, `subrogation` is glossed and `singleflight`
is not.

## Lock the domain before the first token

Sense-shift detection is meaningless without a domain, so establish it once per
turn, not once per term. Read signals strongest-first:

1. The user's own wording
2. Ticket or issue text already in context
3. Directory, table, migration, and enum names — `claims_adjuster`, `donor_pledges`, `policy_endorsements`
4. Dependency manifest — `stripe`, `hl7`, `plaid`, `docusign`
5. Repository name

**Two agreeing signals lock the domain.** If the repo spans two domains, hold both
and resolve per-sentence from the surrounding lines. If nothing locks, gloss Band 2
only and disable Band 3 entirely.

Any subject-matter domain is lockable, software included — `ioredis` and `express`
lock infrastructure the same way `stripe` and `hl7` lock payments and healthcare.
Breadth is the default; `CLAUDE_GLOSS_SKIP` is how a reader narrows it.

## The three bands

| Band | What it is | Action |
|---|---|---|
| 0–1 | Everyday and general academic English (one band — no rule separates them) — `deliberately`, `caveat`, `mitigate`, `tacit` | **Never gloss** |
| 2 | Domain jargon, rare and domain-bound — `subrogation`, `estoppel`, `escheat`, `indemnity` | Gloss + micro-definition |
| 3 | False friends — easy words carrying a shifted domain sense | Gloss, every response |

Band 1 is deliberately excluded. Glossing `deliberately` is the failure mode that
makes this skill unreadable, and an unused gloss budget is correct output.

Band 3 is the whole point. `consideration` in contract law is not "thinking about
it" — it is the thing of value exchanged, and a developer who misreads it ships
wrong logic. Likewise `endorsement` (a policy amendment, not approval), `premium`
(the payment, not a bonus), `stewardship` (donor relationship management), and
`without prejudice` (rights are not waived, not "unbiased").

## Detecting Band 3

You cannot detect a false friend by introspection. While generating domain prose
you have already selected the domain sense fluently, so nothing *feels* ambiguous
from the inside. Score external cues instead:

- **(a) Vacuity** — substitute the everyday paraphrase. Does the clause go trivially true or legally empty? *"a contract requires consideration"* → *"requires thinking about it"*.
- **(b) Grammar the everyday sense cannot take** — countable (`three endorsements`), or a thing you *give*, *attach*, or *file*.
- **(c) The repo defines it** — enum member, column name, schema field, or a capitalised Term in a contract document.
- **(d) Company it keeps** — co-occurs with already-locked domain terms in the same clause.

**Two cues fire → gloss. One cue fires → gloss only if that cue is (c).** Cue (c) is
repo-grounded and therefore the most reliable of the four; when the repo is thin on
definitions, expect Band 3 coverage to degrade and lean harder on (a).

## Gloss forms

Two forms, chosen by band:

```
term (gloss)                      Band 3, and Band 2 after first encounter
term (gloss — short definition)   Band 2 on first encounter, when it fits
```

**The anchor is mandatory; the micro-definition is not.** When the two will not fit
on one line, drop the definition and keep the anchor. Rule 7 wins over this form.

Rendering rules, which hold across every writing system:

1. **ASCII space and ASCII parentheses, always** — `term (gloss)`. The parentheses belong to the English sentence, not to the gloss, and staying ASCII keeps one grep pattern working.
2. **Reject fullwidth（）even for CJK.** Ambiguous-width glyphs break monospace alignment. Correct: `subrogation (代位求償 — 保険会社が先に払い、後で相手方に請求する)`.
3. **Never add spaces inside the gloss** for unspaced scripts (Thai, Lao, Khmer, CJK). The ASCII space sits only at the English/paren junction.
4. **Separator is always ` — `** — space, em dash, space. Never a script-local dash.
5. **Gloss outside backticks** — `` `subrogation` (การรับช่วงสิทธิ์) ``, never `` `subrogation (การรับช่วงสิทธิ์)` ``. The code span is the copy-paste and double-click unit; keep it pure.
6. **One gloss per line**, and never inside a mixed markdown table cell — wide and combining characters destroy column alignment. A dedicated `Term | Gloss` table is fine.
7. **Keep it to one visual line — 60 columns.** If the term, anchor, and definition will not fit, drop the definition and keep the bare anchor. Never wrap a gloss across lines.
8. **RTL languages break the inline form.** Arabic, Hebrew, and Persian glosses reorder against following English and visually detach the sentence tail. End the sentence, then use an indented continuation:

```
Insurer exercises subrogation after payout.
  ↳ الحلول محل المؤمن — تدفع الشركة أولاً ثم تطالب الطرف الآخر
```

9. **Never emit bidi or invisible control characters** — RLM, LRM, FSI, PDI, ZWJ. Terminal support is inconsistent, they are grep-hostile, and they trip trojan-source scanners. Rule 8 achieves the same result visibly.

## Do

- Gloss a Band 2 term on **first use per response**; retire it silently after five uses across the session.
- Gloss a Band 3 false friend **once per response, forever**. It never retires — the everyday sense keeps re-asserting itself.
- Cap at **five glosses per response**. Over budget, keep Band 3 and drop Band 2.
- Gloss a term you lift out of code into prose — a column name, an error string, a PR title.
- Gloss the term that is load-bearing in any decision or tradeoff you ask the user to judge.
- Gloss multi-word terms of art as one unit — `material breach`, `in-kind donation`. Never gloss the parts separately.
- Expand acronyms in English first, then gloss — `KYC (Know Your Customer — ...)`.
- Gloss both members of a contrast pair together, with the distinction stated once — `peril` and `hazard`.
- Scope the gloss when a term carries two senses in one repo — `premium (ค่าเบี้ยประกัน — ในโมดูลนี้คือยอดชำระ ไม่ใช่ tier ราคา)`.
- Re-gloss a retired term if it reappears in a **different** sense.

## Don't

- **Never coin a term.** If unsure of the rendering, gloss with an explanation instead — `escheat (ทรัพย์สินตกเป็นของรัฐเมื่อไม่มีทายาท)`. A confident wrong translation is worse than no gloss.
- Don't gloss a term the user used correctly themselves. They own it.
- Don't gloss a term the user just asked you to define. Answer the question instead.
- Don't gloss twice in one sentence. On collision, keep the Band 3 one.
- Don't gloss Band 1 to fill an unused budget.
- Don't gloss protocol or library acronyms — `HTTP`, `JWT`, `ORM`.

### Where a gloss must never appear

The rule is an artifact/conversation split. Anything committed, logged, transmitted,
or read by someone who does not share the language is English-only.

- Code you write — identifiers, string literals, comments — including scratch files.
- Inside fenced code blocks. Put the gloss in the prose line above the fence.
- Commit messages, branch names, PR titles and bodies, review comments.
- Error messages, log lines, exception text, and user-facing UI copy. Those have their own i18n path and a gloss forks it.
- Config keys and values, JSON, YAML, env var names, filenames, paths.
- Migrations, SQL, schema, table, and column names.
- Test names and assertion messages. CI reads those, not the learner.
- Repository documentation — README, ADR, CONTRIBUTING, docstrings. It reads like prose but it is committed, diffed, and read by teammates who do not share the language. Treat it as source. The one exception is a file the user explicitly designates as the bilingual glossary.
- Anything sent to an external service, MCP server, API payload, or another agent.
- Plan, checklist, and handoff files written to disk. Gloss the copy echoed in chat, never the copy written to the file.
- Tool-call descriptions, parameters, and Bash commands. They are logged and matched against permission rules.

## Examples

Band 2, first encounter — term, anchor, micro-definition:

> The policy lapses before underwriting (การพิจารณารับประกัน — ขั้นตอนที่บริษัทตัดสินใจว่าจะรับประกันหรือไม่) completes.

Band 3, the dangerous case — an easy word, glossed because cue (a) and cue (c) both fired:

> This clause fails because the contract lacks consideration (สิ่งตอบแทนในสัญญา — สิ่งมีมูลค่าที่แลกกัน ไม่ใช่ "การพิจารณา").

Contrast pair, distinction stated once:

> Fire is a peril (ภัย — เหตุที่ทำให้เกิดความเสียหาย); storing fuel indoors is a hazard (สภาพเสี่ยง — สิ่งที่ทำให้ภัยเกิดง่ายขึ้น).

Lifting a column name into prose — gloss the concept, leave the identifier alone:

> The `endorsement_id` column tracks each endorsement (สลักหลังกรมธรรม์ — เอกสารแก้ไขกรมธรรม์ ไม่ใช่ "การรับรอง") applied to the policy.

Correct restraint — Band 1 words left bare, budget unspent:

> The record was left alone deliberately, so the reconciliation job could mitigate the drift on its next pass.

## Modes

| Invocation | Effect |
|---|---|
| *(none)* | Off until asked — ambient repo state does not trigger this skill |
| `/domain-gloss` | On, using the resolved language |
| `/domain-gloss th` | On, forcing a language for this thread |
| `gloss off` | Off |
| `/domain-gloss off` | Off |
| `gloss skip software` | Stop glossing one category for this thread |
| `gloss unskip software` | Resume it |

## Check yourself

Before sending, confirm all four:

1. Every gloss sits in chat prose — none in code, commits, schemas, or files on disk.
2. No Band 1 word was glossed.
3. Did this response contain a Band 2 or Band 3 candidate and zero glosses? That is a miss, not restraint.
4. Does the gloss sit on the term's **first** mention in this response? A term used bare in an early paragraph and glossed later has already failed the reader.
5. Every rendering is one line, ASCII-parenthesised, and outside backticks.

## Known limitations

- **Stickiness is best-effort.** This is prompt text with no cross-turn state; across a long session the mode decays. Re-invoke it, or put the preference in your `CLAUDE.md`.
- **No bundled glossary.** Renderings come from model knowledge and will vary slightly between sessions. For a fixed house translation, keep a glossary file in the repo and point at it.
- **Band 3 depends on repo evidence.** Cue (c) is the strongest signal; in a repo with thin schema and no defined terms, false-friend coverage degrades quietly.
- **The `allowed-tools` entry pins an exact command.** `Bash(printenv CLAUDE_GLOSS_LANG)` is deliberate — the `:*` prefix form would pre-allow bare `printenv` and dump every token and key in the environment into context. If exact-command matching is not honoured, the only symptom is a one-time permission prompt, which is the safe way to fail.
- **Overlaps with `explain-clear`** (`~/.claude/skills/explain-clear/SKILL.md`), whose `thai` / `th` command has its own bilingual mode. That skill replaces hard words; this one keeps them. If the wrong one activates, name it explicitly.
- **Breadth is the default.** Any locked domain is glossed, software included, so an ordinary repo with a dependency manifest will produce glosses. Narrow it with `CLAUDE_GLOSS_SKIP` rather than expecting the skill to guess which domains you already know.
- **Situational auto-firing is not available.** A skill is selected by matching your words, not by ambient facts about the repo, so working in an insurance codebase will not turn this on by itself.
