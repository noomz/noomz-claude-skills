# Rendering rules and where a gloss must never appear

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

### Where a gloss must never appear

The rule is an artifact/conversation split. Anything committed, logged, transmitted,
or read by someone who does not share the language is English-only.

- Code you write — identifiers, string literals, comments — including scratch files.
- Inside fenced code blocks. Put the gloss in the prose line above the fence.
- Commit messages, branch names, PR titles and bodies, review comments.
- Error messages, log lines, exception text, and user-facing UI copy. Those have their own i18n path and a gloss forks it.
- Config keys and values, JSON, YAML, env var names, filenames, paths.
- Migrations, SQL, and schema contents, including table and column identifiers inside them. When citing those identifiers in chat, preserve the literal and put its gloss outside the backticks.
- Test names and assertion messages. CI reads those, not the learner.
- Repository documentation — README, ADR, CONTRIBUTING, docstrings. It reads like prose but it is committed, diffed, and read by teammates who do not share the language. Treat it as source. The one exception is a file the user explicitly designates as the bilingual glossary.
- Anything sent to an external service, MCP server, API payload, or another agent.
- Plan, checklist, and handoff files written to disk. Gloss the copy echoed in chat, never the copy written to the file.
- Tool-call descriptions, parameters, and Bash commands. They are logged and matched against permission rules.
