---
name: readout
description: Formats operational results as terse machine readouts — delta bridges, scan tables, verdict blocks, alarm stacks, event sequences — instead of narrative prose. Use when reporting costs, savings, benchmark numbers, durations, test and build results, deploy or service status, dependency upgrade checks, resource inventories, incident timelines, or a correction to a figure stated earlier. Triggers on "readout", "machine mode", "just the numbers", "stop explaining", "table it", "give me the result", and on requests to report a measured outcome rather than explain one.
---

# Readout

Report results the way an instrument reports them: values first, structured, no
narrative. The reader wants the number, not the story of how it was found.

Prose forces the reader to parse sentences to extract facts. A readout puts facts
in fixed positions so the eye lands on them directly. This costs the model
nothing and saves the reader every time.

**Read [`reference/formats.md`](reference/formats.md) for the five structures,
their verbatim templates, state vocabulary, and worked examples.** This file
covers when to emit a readout at all, and the rules binding every structure.

## The classification test

Before writing, ask: **could a dumb machine screen display this answer?** Is the
answer a set of named values you actually have?

| Response is… | Format |
|---|---|
| Named values — amounts, counts, states, durations, deltas | Readout |
| A judgement, tradeoff, or recommendation | Prose |
| Causal reasoning from background knowledge | Prose |
| Causal decomposition of evidence you read this session | Readout |

In doubt, with three or more values you measured: readout.

## Evidence, not subject matter, decides

A "why" question is not automatically prose. What matters is whether you hold
evidence or are reasoning from what you know.

- **Why, from reasoning** → prose. "Why does connection pooling help?" You are
  explaining a mechanism. A readout would imply measurement you never took.
- **Why, from evidence read this session** → readout. "Why did the bill jump?"
  with the invoice in hand is a Delta Bridge: `gap:` decomposes the change into
  named drivers. "Why did checkout break?" with the log in hand is a Sequence of
  Events: `causal:` states what the ordering supports.

The dividing line is the `basis:` line. If you cannot name what produced the
numbers, you do not have a readout — you have prose wearing a grid.

## Never emit a readout for these

- **Judgement** — "should I", "is it worth", "which should we use".
- **Explanation of a mechanism** — "how does X work", "what's the difference".
- **"Is this normal?"** — wants a yes/no plus context, not the value restated.
- **Security warnings and irreversible-action confirmations** — these must read
  as sentences a human cannot skim past.
- Any request where the user explicitly asked for an explanation.

**Precedence, highest first:** this list → the evidence rule above → a
structure's own "use when" in `formats.md` → the classification test. A
structure's use-when never readmits something this list excludes.

## Four rules, every structure

### 1. Provenance on every number

Every value carries its epistemic status, because a machine-looking readout
implies measurement and will otherwise lend instrument authority to a guess.

| Tag | Meaning |
|---|---|
| `(measured)` | Read from a real source this session — command output, file, API response, invoice |
| `(est.)` | Computed or extrapolated from something measured |
| `(inferred)` | Reasoned from background knowledge; not observed here |

Tag the block once when every value shares a status; tag per-line when they
differ. **A derived value inherits the weakest status of its inputs** — a delta
between a measured value and an estimated one is `(est.)`.

`~` means **rounded for display** (`~41k` for 41,237 measured). It is not a
hedge and never substitutes for a tag. Hedging is `(est.)` or `(inferred)`.

**Precision.** Match the source's significant figures. Never print a decimal the
source did not have. If the honest answer is a range, print a range.

**Before publishing.** A `basis:` or `notes:` line will often name a real
identifier — an invoice line, an internal path, a hostname, a ticket number.
That is correct inside the session; it is what makes the value auditable. Check
the block before pasting a readout into a public issue, PR, or chat.

### 2. Reserved `notes:` line for full sentences

A `key: value` line structurally caps how much qualification can attach to a
fact — so caveats get silently dropped, which is the failure that matters most.
Anything longer than one noun phrase goes on a `notes:` line at the bottom.
Never cram a sentence into parentheses in the value slot.

### 3. Never hand-align columns

You generate tokens left to right and commit to line 1's column position before
you have seen line 4. Nothing re-flows what you already emitted, so one long
label or a 40-char UUID leaves every following row ragged. Hand-alignment also
dies on narrow terminals, copy-paste into proportional renderers, screen
readers, and CJK or emoji identifiers — you pad by character count, but those
render two cells per character.

Three sanctioned renderings, and no others:

| Rendering | Use for |
|---|---|
| `key: value`, one fact per line | headline values, every structure |
| `- ` list items | detail lines, drivers, checks |
| Markdown table | comparable rows, where the host renders markdown |

A markdown table is safe precisely because **the renderer computes alignment**
— you emit pipes and never count a space. Where markdown will not render (output
being piped, written to a file, pasted into a plain-text ticket), use
`[TAG]`-prefixed lines instead; `formats.md` gives the template. Never
space-pad columns by hand in any destination.

### 4. Copy templates verbatim

Use the exact label text, order, and separators from
[`reference/formats.md`](reference/formats.md). Do not paraphrase `delta:` into
`change:`. The same question asked twice must produce the same shape, or the
format's claim to be scannable is false.

## Size ceilings

Past these, a readout stops being scannable — summarize and add an overflow line
(`... +N more`) rather than continuing.

| Block | Cap |
|---|---|
| `gap:` drivers | 6 |
| `checks:` lines | 8 |
| scan rows | 12 |
| timeline rows | 12 |

## The five structures

Full templates, state vocabulary, and examples in
[`reference/formats.md`](reference/formats.md).

| Structure | Use when |
|---|---|
| **Delta Bridge** | One number became another — corrections, estimate vs actual |
| **Verdict + Receipt** | A single go/no-go, or one dominant value worth auditing |
| **Scan Table** | N comparable items and the reader needs every item's value |
| **Annunciator Stack** | N conditions but the reader needs only what to act on |
| **Sequence of Events** | Ordering plus causality, with real timestamps in hand |

Scan Table and Annunciator Stack overlap. Tie-break: **if you would print a row
the reader will skip, use the Annunciator** — it prints exceptions and collapses
everything healthy into one `status:` block.

## Modes

| Invocation | Effect |
|---|---|
| *(none)* | Auto — readout whenever the classification test passes |
| `/readout` | Force a readout for the next response |

## Check yourself

Before sending, confirm all four:

1. Every number carries a tag, or the block carries one.
2. A `basis:` or equivalent names what produced the values.
3. No hand-aligned columns — pipes, `key:`, or `- ` only.
4. The question was not on the never-emit list.

Wrong, for "how much did the upgrade save?":

> The savings turned out bigger than expected — the old instance was
> over-provisioned, so you're looking at roughly forty dollars a month.

Right:

```
verdict: $39.20/mo saved (measured)

checks:
- old instance: $79.20/mo
- new instance: $40.00/mo

basis: Aug and Sep invoices, line 12 (measured)
```

## Known limitations

- **Provenance tags are self-reported.** Nothing verifies that `(measured)` was
  measured. The tag is a discipline, not a guarantee.
- **Table alignment depends on the host renderer.** Where markdown does not
  render, tables degrade to pipe characters; use the `[TAG]` form instead.
- **No cross-turn state.** A readout preference cannot persist on its own; the
  auto-detect path is the durable behavior.

## Interaction with other terseness modes

Readout governs the **shape of results**. Prose-compression modes (caveman and
similar) govern the **wording of sentences**. They compose: readout owns the
structured block, the compression mode owns any sentence outside it. Neither
compresses a code block, a quoted error string, or a `notes:` line into
ambiguity.
