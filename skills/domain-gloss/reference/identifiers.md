# Opaque identifiers in explanations

A table or field code can block understanding without being an English word.
Handle these separately from the three vocabulary bands whenever an identifier
supports a finding, comparison, or decision in chat:

- Keep the literal in backticks and anchor its **first mention per response**:
  `PAYHDR` (ข้อมูลรายการจ่าย). This describes its role, not a guessed expansion.
- Ground the role in inspected schema, a data dictionary, queries, or supplied
  evidence. If the meaning is unresolved, say so beside the identifier. An opaque
  spelling alone does not establish a meaning or an acronym expansion.
- Cover tables, columns, enum values, and status codes. For a related field group,
  give one shared role only when the evidence establishes that role for every
  member; otherwise map each member separately.
- For dense passages, put a dedicated `Term | Gloss` table **before** their first
  use in the narrative. Every identifier used as evidence gets a mapping; keep
  unknown meanings visibly unresolved. Inline anchors follow the rendering rules
  below; the dedicated table uses separate term and gloss cells.
- Identifier mappings are required reading aids and do not consume the five-gloss
  vocabulary budget. Category exclusions still apply.
- **Cap inline anchors at six per response.** Past six, stop annotating inline and
  emit the dedicated table instead — a paragraph carrying a dozen parenthesised
  roles buries the finding it was meant to support.
- **Retire an identifier once a glossary table in this thread has mapped it**,
  and re-anchor it if it later appears in a different role. Repetition alone
  never retires an identifier that has only ever been anchored inline.

These are conversation annotations. The underlying identifier remains exact in
SQL, schema, code, and artifacts. A pasted passage submitted for correction is
evidence of a readability problem, not evidence that the reader owns its terms.
