---
name: domain-gloss
description: Keeps English domain terms and attaches short glosses in the developer's configured first language. Covers specialist jargon (subrogation, estoppel, indemnity), ordinary-looking words carrying a shifted domain meaning (consideration in contract law, endorsement in insurance, stewardship in nonprofit), and opaque table names, column names, enum values, or legacy codes cited in explanations. Triggers on "domain-gloss", "gloss the jargon", "explain in my language", "add Thai", "I don't know these insurance words", "what is subrogation", "too many hard words", "table names without glosses", and domain-heavy insurance, legal, finance, healthcare, nonprofit, or technical work once the user has asked for glossing. Preserves identifiers exactly and explains their evidenced role beside them. Reads the target language from configuration rather than assuming one. Distinct from explain-clear, which replaces difficult terms. Applies to conversation, not code edits, git artifacts, or whole-document translation.
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
Values are BCP-47 tags (`th`, `ja`, `zh-Hant`, `pt-BR`); keep region and script.
Rungs 3 through 5 arrive as an environment variable. Read it with exactly:

```bash
printenv CLAUDE_GLOSS_LANG || echo unset
```

Unset, unavailable, or malformed: ask once, never guess. An English tag: do not
activate. A comma list is a fallback chain — gloss into the first tag only. Do not
write a settings file on your own initiative.

**Read [reference/language-resolution.md](reference/language-resolution.md) when** the value is a comma list, `simple-en`, malformed, English, or `printenv` fails, and for the `CLAUDE_GLOSS_SKIP` category exclusion (software, infra, legal, ...) and software-domain locking. Skip variable: `printenv CLAUDE_GLOSS_SKIP || echo none`; a skipped locked domain gets no Band 2 or Band 3 glosses.

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

## Opaque identifiers in explanations

Tables, columns, enum values, and status codes that support a finding get the
literal in backticks plus a role anchor on the **first mention per response**:
`PAYHDR` (ข้อมูลรายการจ่าย). Ground the role in inspected schema or evidence; if
unresolved, say so beside the identifier. Never invent an expansion. Mappings do
not consume the five-gloss budget. Past six inline anchors, emit a `Term | Gloss`
table instead. Identifiers stay exact in SQL, code, and artifacts.

**Read [reference/identifiers.md](reference/identifiers.md) when** an identifier supports a finding, comparison, or decision, or a passage is dense with codes.

## Gloss forms

Two forms, chosen by band:

```
term (gloss)                      Band 3, and Band 2 after first encounter
term (gloss — short definition)   Band 2 on first encounter, when it fits
```

**The anchor is mandatory; the micro-definition is not.** When the two will not fit
on one line, drop the definition and keep the anchor. Rule 7 wins over this form.

Rendering rules (one line, 60 columns max): ASCII space and ASCII parentheses
`term (gloss)`; no fullwidth（）; no spaces inside an unspaced-script gloss; separator
` — `; gloss outside backticks; one gloss per line, never inside a mixed table cell;
RTL languages use an indented `↳` continuation line; never emit bidi or invisible
control characters.

**Read [reference/rendering-and-placement.md](reference/rendering-and-placement.md) when** rendering a gloss in CJK, Thai, or RTL script, or when unsure whether a location may carry a gloss.

## Do

- Gloss a Band 2 term on **first use per response**; retire it silently after five uses across the session.
- Gloss a Band 3 false friend **once per response, forever**. It never retires — the everyday sense keeps re-asserting itself.
- Cap vocabulary glosses at **five per response**. Over budget, keep Band 3 and drop Band 2. Opaque identifier mappings follow their separate coverage rule above.
- Gloss a term you lift out of code into prose — a column name, an error string, a PR title.
- Gloss the term that is load-bearing in any decision or tradeoff you ask the user to judge.
- Gloss multi-word terms of art as one unit — `material breach`, `in-kind donation`. Never gloss the parts separately.
- Expand established acronyms in English first, then gloss — `KYC (Know Your Customer — ...)`. Explain opaque identifiers by their evidenced role instead of inventing expansions.
- Gloss both members of a contrast pair together, with the distinction stated once — `peril` and `hazard`.
- Scope the gloss when a term carries two senses in one repo — `premium (ค่าเบี้ยประกัน — ในโมดูลนี้คือยอดชำระ ไม่ใช่ tier ราคา)`.
- Re-gloss a retired term if it reappears in a **different** sense.

## Don't

- **Never coin a term.** If unsure of the rendering, gloss with an explanation instead — `escheat (ทรัพย์สินตกเป็นของรัฐเมื่อไม่มีทายาท)`. A confident wrong translation is worse than no gloss.
- Don't gloss a term the user demonstrably used correctly themselves. Quoted output, error reports, and requests for explanation do not demonstrate ownership.
- Don't gloss a term the user just asked you to define. Answer the question instead.
- Don't gloss twice in one sentence. On collision, keep the Band 3 one.
- Don't gloss Band 1 to fill an unused budget.
- Don't gloss protocol or library acronyms — `HTTP`, `JWT`, `ORM`.


### Where a gloss must never appear

Chat prose only. Anything committed, logged, transmitted, or read by someone who
does not share the language is English-only: code and comments, fenced blocks,
commits and PRs, error and log text, config, SQL and schema, tests, repository docs,
external payloads, plan files on disk, and tool-call parameters. The full list is in
[reference/rendering-and-placement.md](reference/rendering-and-placement.md).

**Read [reference/examples.md](reference/examples.md) when** you need a model of a Band 2, Band 3, contrast-pair, column-name, or opaque-identifier gloss, or of correct restraint.

## Modes

| Invocation | Effect |
|---|---|
| *(none)* | Off until asked — ambient repo state does not trigger this skill. The one exception is the opt-in hook in [Standing mode](#standing-mode-opt-in-hook) |
| `/domain-gloss` | On, using the resolved language |
| `/domain-gloss th` | On, forcing a language for this thread |
| `gloss off` | Off |
| `/domain-gloss off` | Off |
| `gloss skip software` | Stop glossing one category for this thread |
| `gloss unskip software` | Resume it |

## Check yourself

Before sending, confirm all six:

1. Every gloss sits in chat prose — none in code, commits, schemas, or files on disk.
2. No Band 1 word was glossed.
3. Did this response contain a Band 2 or Band 3 candidate and zero glosses? That is a miss, not restraint.
4. Does the gloss sit on the term's **first** mention in this response? A term used bare in an early paragraph and glossed later has already failed the reader.
5. Every inline rendering is one line, ASCII-parenthesised, and outside backticks; dedicated glossary tables keep the literal and gloss in separate cells.
6. Every opaque identifier supporting a finding has a first-mention role anchor or an earlier glossary row, including an explicit unknown where evidence is missing. The artifact exclusion and vocabulary budget did not suppress these mappings.


## Standing mode (opt-in hook)

A `UserPromptSubmit` hook ([hooks/hooks.json](hooks/hooks.json) → [scripts/gloss_reminder.py](scripts/gloss_reminder.py))
restates the rule each prompt. It prints nothing unless `CLAUDE_GLOSS_HOOK=on` is set
in settings.json `env`. [scripts/gloss_rate.py](scripts/gloss_rate.py) measures glossed rate from transcripts.

**Read [reference/standing-mode.md](reference/standing-mode.md) when** setting up, debugging, or measuring the hook.

## Known limitations

Stickiness is best-effort, there is no bundled glossary, Band 3 depends on repo
evidence, and this skill overlaps `explain-clear`.

**Read [reference/known-limitations.md](reference/known-limitations.md) when** the user asks why glossing decayed, was missed, or why the wrong skill fired.
