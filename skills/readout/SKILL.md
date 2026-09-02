---
name: readout
description: Formats operational results as terse machine readouts — delta bridges, scan tables, verdict blocks, alarm stacks, event sequences — instead of narrative prose. Use when reporting costs, savings, counts, durations, benchmarks, diffs, deploy or service status, test and build results, dependency upgrades, resource inventories, incident timelines, or corrections to a previously stated figure. Triggers on "readout", "machine mode", "just the numbers", "give me the result", "stop explaining", "table it", "how much", "how many", "what changed", "what is the status". Does not apply to explanations, causal questions, tradeoffs, recommendations, security warnings, or destructive-action confirmations.
---

# Readout

Report results the way an instrument reports them: values first, structured, no
narrative. The reader wants the number, not the story of how it was found.

Prose forces the reader to parse sentences to extract facts. A readout puts
facts in fixed positions so the eye lands on them directly. This costs the model
nothing and saves the reader every time.

**Read [`reference/formats.md`](reference/formats.md) for the five structures,
their verbatim templates, and worked examples.** This file covers when to emit a
readout at all, and the rules that apply to every structure.

## The classification test

Before writing, ask: **could a dumb machine screen display this answer?** Is the
answer a set of named values?

| Response is… | Format |
|---|---|
| Named values — amounts, counts, states, durations, deltas | Readout |
| Causal explanation — why something happens, how it works | Prose |
| A judgement, tradeoff, or recommendation | Prose |
| Values **plus** a reason they are surprising | Readout, then ≤2 prose lines below |

In doubt, with three or more numbers or states: readout.

## Never emit a readout for these

This list overrides keyword overlap and overrides sticky mode. A question can
contain money, counts, and units and still belong to this list.

- **"Why…"** — why the bill jumped, why the test broke, why latency rose. A
  readout has no line for *because*. Answering with a Was/Now block answers a
  question that was not asked.
- **"Should I…"**, "is it worth", "which should we use" — asks for judgement.
- **"Explain…"**, "how does X work", "what's the difference" — asks for a model,
  not a measurement.
- **"Is this normal?"** — wants a yes/no plus context, not the value restated.
- **Security warnings and irreversible-action confirmations** — these must read
  as sentences a human cannot skim past.
- Any request where the user explicitly asked for an explanation.

## Four rules, every structure

### 1. Provenance tag on every number

Not optional, not a `~` applied by feel. Every value carries its epistemic
status, because a machine-looking readout implies measurement and will lend
instrument authority to a guess.

| Tag | Meaning |
|---|---|
| `(measured)` | Read from a real source this session — command output, file, API response, invoice |
| `(est.)` | Computed or extrapolated from something measured |
| `(inferred)` | Reasoned from background knowledge; not observed here |

Tag the block once when every value shares a status; tag per-line when they differ.

**Before publishing a readout.** A `basis:` or `notes:` line will often name a
real identifier — an invoice line, an internal path, a hostname, a ticket number.
That is correct inside the session; it is what makes the value auditable. Check
the block before pasting a readout into a public issue, PR, or chat.

### 2. Reserved `notes:` line for full sentences

A `key: value` line structurally caps how much qualification can attach to a
fact — so caveats get silently dropped, which is the failure that matters most.
Anything longer than one noun phrase goes on a `notes:` line at the bottom. Never
cram a sentence into parentheses in the value slot.

### 3. Never compute multi-space padding

You generate tokens left to right and commit to line 1's column position before
you have seen line 4. Nothing re-flows what you already emitted, so one long
label or a 40-char UUID leaves every following row visibly ragged. Padding also
dies on: narrow terminals, copy-paste into anything proportional, screen readers,
and CJK or emoji in identifiers (you pad by character count; those render two
cells per character).

Use `key: value` with a single colon-space, or `- ` list items, or a real table
per the next section. No line's correctness may depend on another line's width.

### 4. Copy templates verbatim

Use the exact label text, exact order, and exact separators from
[`reference/formats.md`](reference/formats.md). Do not paraphrase `delta:` into
`change:`. The same question asked twice must produce the same shape, or the
format's claim to be scannable is false.

## Tables: pick the rendering by host

One structure — Scan Table — genuinely needs columns, because column position
*is* the retrieval key. Two ways to get them:

**Host renders markdown (Claude Code, claude.ai, most chat UIs) — preferred.**
Emit a markdown table. The renderer computes alignment, so you never count a
space and rule 3 cannot be violated. Cell content may be any width.

```
| tag | value | limit | st |
|---|---|---|---|
| billing | 884 ms | 500 | HI |
| search | -- | 500 | NODATA |
```

**Plain-text destination** — output being piped, written to a file, pasted into a
commit message or a plain-text ticket. Space-aligned columns, but only when
**≤8 rows and all identifiers ≤20 chars**. Past either limit, fall back to
`[TAG]`-prefixed lines, one fact per line.

Either way, restate the exceptions in a prose headline above the table, so the
answer survives even if the layout does not.

## The five structures

Full templates and examples in [`reference/formats.md`](reference/formats.md).

| Structure | Use when |
|---|---|
| **Delta Bridge** | One number became another — corrections, estimate vs actual, cost variance |
| **Verdict + Receipt** | A single go/no-go or one dominant value the reader may want to audit |
| **Scan Table** | N comparable items, each with a value and a pass/fail |
| **Annunciator Stack** | Health across many conditions where most are fine |
| **Sequence of Events** | Ordering plus causality — incidents, cascades, bisects |

## Modes

| Invocation | Effect |
|---|---|
| *(none)* | Auto — readout whenever the classification test passes |
| `/readout` | Force readout for the next response |
| `/readout on` | Sticky — every eligible response until turned off |
| `/readout off` | Back to auto |

Sticky mode never overrides the never-emit list.

## Interaction with other terseness modes

Readout governs the **shape of results**. Prose-compression modes (caveman and
similar) govern the **wording of sentences**. They compose: readout owns the
structured block, the compression mode owns any sentence outside it. Neither
compresses a code block, a quoted error string, or a `notes:` line into
ambiguity.
