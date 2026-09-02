# The five readout structures

Each entry gives the template to copy verbatim, a worked example, and the failure
mode that tells you when to reach for something else.

Rules from `SKILL.md` bind all five: provenance on every number, a reserved
`notes:` line for full sentences, no hand-aligned columns, verbatim label text.

## State vocabulary

Used by Scan Table and Annunciator Stack. Do not invent states outside these.

| State | Meaning |
|---|---|
| `OK` | Within limit |
| `HI` | Above limit |
| `LO` | Below limit |
| `FAIL` | Item errored — distinct from being out of range |
| `NODATA` | Item failed to report. **Not the same as zero.** Print the row with `--` |

A state is a judgement against a limit, so it requires a real limit. Where none
exists, print `--` in both the `limit` and `st` columns — the row then carries a
value and no verdict, which is honest. See the threshold rule under Scan Table.

Severity keywords, highest first. Raise one only when the threshold came from a
real source — an SLO, a config value, a documented limit.

| Keyword | Meaning |
|---|---|
| `WARN` | Acting now prevents impact, or impact is already occurring |
| `CAUT` | Will need action, not yet urgent |
| `ADVY` | Worth knowing, no action implied |

---

## 1. Delta Bridge

**Use when** one number became another: a correction to something you stated
earlier, estimate vs actual, forecast variance, a benchmark rerun that disagrees
with the first run, or "why did this change" **with the evidence in hand**.

The point is that the gap is **itemized and must sum**. A flat before/after
leaves the reader asking where the difference came from; the bridge walks it.
`gap:` is a because-decomposition — this is the structure that legitimately
answers a "why" question, provided you read the source.

### Template

```
was: <value> (<provenance>, <basis>)
now: <value> (<provenance>, <basis>)
delta: <signed value> (<percent>) (<provenance>)

gap:
- <driver>: <signed value> (<provenance>)
- <driver>: <signed value> (<provenance>)

notes: <sentence, only if a fact changes how the numbers read>
```

Max 6 drivers; past that, group the tail into one `- other:` line.

### Example

```
was: $40.00/mo (est., guessed from RAM size)
now: $79.20/mo (measured, Aug invoice lines 12-14)
delta: +$39.20/mo (+98%) (est., inherits the estimated prior)

gap:
- sizing: assumed 1 vCPU, actual 2 vCPU: +$24.00 (measured)
- backups: weekly paid plan uncounted: +$8.00 (measured)
- VAT 10%: +$7.20 (measured)

notes: the prior figure was a guess, not a stated fact — this is correction of
an estimate, not measured drift.
```

`delta:` is tagged `(est.)` because a derived value inherits the weakest status
of its inputs, and `was:` was a guess.

**Failure mode.** Ceremony for trivia: a six-line bridge correcting a typo reads
as performative self-audit. Worse, computing a precise offset against a prior
that was an admitted guess dresses "made it up, then measured" as a calibration
event — the `notes:` line above exists to defuse exactly that. Use the full
bridge only when the prior was asserted as fact, or the gap has two or more
drivers worth naming.

---

## 2. Verdict + Receipt

**Use when** the answer is a single go/no-go, or one dominant value the reader
asked for and may want to audit afterwards: is this upgrade safe, how much is the
RDS bill, how long does CI take, did the migration succeed.

Verdict sits at fixed top-left so a skim catches it without reading a sentence.
The receipt below is opt-in depth.

### Template

```
verdict: <answer> — <one clause of consequence>

checks:
- <check>: <result>
- <check>: <result>

basis: <what produced this> (<provenance>)
```

For a numeric answer, `verdict:` carries the number and unit welded together and
the receipt carries the decomposition; the `— <clause>` is then optional. Max 8
check lines.

### Example — decision

```
verdict: SAFE — react 18.2 -> 19.0, 2 call-sites need fixes, 3h (est.)

checks:
- breaking, ref-as-prop removed: 2 uses (Login.tsx, Modal.tsx)
- breaking, legacy context API: 0 uses
- peer, react-dom mismatch: none

basis: npx react-codemod dry-run, 2026-09-02 (measured)
```

### Example — value

```
verdict: $486.20/mo RDS prod, $534.82 incl VAT

checks:
- compute: $364.32
- storage: $92.00
- backup: $29.88
- range: $461.00 floor .. $511.40 peak-IO

basis: Aug 2026 invoice lines 41-47 (measured)
```

**`basis:` is mandatory.** An instrument that reports a reading without its
measurement conditions is not reporting, it is asserting.

**Failure mode.** Manufactures a scalar where the truth is a distribution or a
conditional. Printing `$486.20` when the real answer is "$300–900 depending on
whether you keep the read replica" is a lie with two decimal places of
confidence — use the `range:` check line, or drop to prose. The one-word verdict
also reads as more audited than it is: if the checklist missed a case, a
confident `SAFE` is more dangerous than hedged prose.

---

## 3. Scan Table

**Use when** N comparable items each carry a value and a state, **and the reader
needs every item's value**: test suites, service fleets, migration batches,
dependency audits, per-region rollout.

If the reader only needs to know what to act on, use the Annunciator Stack
instead. Tie-break: if you would print a row the reader will skip, it is an
Annunciator.

Max 12 rows; past that, sort worst-first and close with `... +N more`.

### Template — markdown host

The headline and tally are plain lines; only the table is markdown. Emit the
three parts contiguously, not as separate fenced blocks.

```
exceptions: <worst items, named>

| tag | value | limit | st |
|---|---|---|---|
| <name> | <value> | <limit> | <state> |

<n> points: <n> OK, <n> HI, <n> LO, <n> NODATA (<provenance>)
```

### Template — plain-text destination

For output being piped, written to a file, or pasted into a plain-text ticket,
where markdown will not render. One fact per line, no hand-aligned columns.

```
exceptions: <worst items, named>

[POINT] <name>: <value> (limit <limit>) <state>
[POINT] <name>: <value> (limit <limit>) <state>

<n> points: <n> OK, <n> HI, <n> LO, <n> NODATA (<provenance>)
```

### Example

exceptions: billing HI, worker-pool LO, search NODATA

| tag | value | limit | st |
|---|---|---|---|
| billing | 884 ms | 500 | HI |
| worker-pool | 3/8 ready | 8 | LO |
| search | -- | 500 | NODATA |
| api-gateway | 210 ms | 500 | OK |
| redis | 41 %mem | 85 | OK |

5 points: 2 OK, 1 HI, 1 LO, 1 NODATA (measured)

### Three rules that make or break it

- **Sort worst-first.** Alphabetical order forces the reader to scan all N rows
  to find the one that matters — destroying the only advantage the format has.
- **`NODATA` is not `0`.** A point that failed to report is a different fact from
  one reporting zero. Print the row with `--`; never omit it.
- **Every `limit` must come from a real source** — an SLO, a config value, a
  documented cap, a published spec. This is the Annunciator's "no real threshold,
  no keyword" rule applied to the column that carries the verdict. You do not
  have calibrated thresholds, so an invented limit silently manufactures an `HI`
  or `LO`, and `st` is the column the reader acts on. With no real limit, print
  `--` for both `limit` and `st`, and say where the limit came from in `notes:`
  when it is guidance rather than an enforced cap.

**Failure mode.** A table for two rows is pure overhead — the header costs more
than it returns. Columns must be decided up front, so heterogeneous answers fit
badly. And the table shows *what*, never *why*: a regression row gives no causal
thread, so pair it with a Delta Bridge or drop to prose for the explanation.

---

## 4. Annunciator Stack

**Use when** reporting across many conditions and **the reader needs only what to
act on**: "is prod okay", "anything wrong with this PR", "state of the cluster".
Questions whose honest answer is "three things, ranked".

Borrowed from the dark-cockpit principle: an unlit panel means healthy, so **any
line you print is by definition actionable**. Severity lives in a fixed left-hand
keyword, not in wording, so the eye sorts before it reads. Healthy readings
collapse into `status:` below the alarms, never interleaved.

### Template

```
WARN <condition>: <reading vs threshold>
CAUT <condition>: <reading vs threshold>
ADVY <condition>: <reading vs threshold>

status:
- <metric>: <value> (limit <limit>)

(<provenance>, <scope>, <timestamp>)
```

Clean case is one line plus the status block:

```
ALL NORMAL

status:
- api p99: 188 ms (limit 500)
- error rate: 0.02% (limit 1.0)
- nodes ready: 6/6

(measured, prod, 2026-09-02 14:02 UTC)
```

### Example

```
WARN db conn pool: 184/200 in use, 92% of max
CAUT deploy drift: staging is 3 commits behind main
ADVY cert expiry: api.example.com expires in 14d

status:
- api p99: 210 ms (limit 500)
- error rate: 0.04% (limit 1.0)
- queue depth: 12 (limit 5000)
- nodes ready: 6/6

(measured, prod, 2026-09-02 14:02 UTC)
```

**Failure mode.** Alarm flood. You do not have calibrated thresholds, so you will
invent them, and every observation becomes `WARN` — at which point the ranking is
noise and the dark-cockpit contract is broken. No real threshold, no keyword: put
the reading in `status:` instead. Also wrong for single-fact questions; "does
this repo use pnpm" does not want a severity column.

---

## 5. Sequence of Events

**Use when** the answer's shape is ordering plus causality **and you have read
the actual log**: post-incident narrative, log triage, cascade failures, bisect
results.

Relative timestamps beat absolute for reading a cascade — the gaps are the story.
Recovery sits on the same timeline, so duration falls out of the data instead of
being claimed. Max 12 rows.

### Template

```
sequence: <subject>

T+00:00.0 *FIRST OUT* <event>
T+<mm:ss.s> <event>
T+<mm:ss.s> <event>, RECOVERED

duration: <elapsed>
impact: <scope> (<provenance>)
causal: <single cause | multiple | undetermined>
```

### Example

```
sequence: incident 2026-09-01, checkout 5xx

T+00:00.0 *FIRST OUT* cfg deploy 8f21ac, POOL_MAX 200 -> 20
T+00:12.4 pool saturated, waiters 0 -> 1412
T+00:13.1 p99 210 ms -> 9.8 s
T+00:41.7 LB health fail, 3/6 nodes out of rotation
T+01:02.0 5xx rate 0.04% -> 38%
T+06:38.0 rollback 8f21ac
T+07:04.9 5xx rate < 0.1%, RECOVERED

duration: 7m 05s
impact: ~41k requests, 3 regions (measured)
causal: single cause, confirmed by revert
```

`~41k` is a rounded display of a measured count, not a hedge — see the precision
rule in `SKILL.md`.

### Hard guard on `*FIRST OUT*`

`*FIRST OUT*` claims that this event caused everything below it. It is the
strongest assertion available in any of these five structures.

**Emit it only when you have read real ordered timestamps from a log, trace, or
command output in this session.** Reconstructing a timeline from memory or a
partial log and marking a first-out pins blame on a correlated symptom and sends
the reader to debug the wrong subsystem with instrument-grade confidence behind
them.

Without real ordered data: drop the marker, retitle the block
`sequence (reconstructed):`, and set `causal: undetermined`.

**Failure mode.** Beyond the first-out risk: bucket and threshold choices shape
the story, and a timeline answers *when*, not *why*. Pair with a Delta Bridge
when the reader needs causal decomposition rather than ordering.
