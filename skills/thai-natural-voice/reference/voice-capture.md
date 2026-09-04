# Capturing a source voice

The `/capture-thai-voice <src>` pipeline. The skill captures the voice; it does not teach Thai to the user.

**Freedom level: low.** This pipeline fetches external content and writes files outside the repository. Follow the steps in order. Do not improvise the confirm gate or the file write.

## Contents

- [Boundary](#boundary)
- [Storage](#storage)
- [Selector placement](#selector-placement)
- [Pipeline](#pipeline)
- [Profile file format](#profile-file-format)
- [Failure handling](#failure-handling)
- [Do](#do)
- [Don't](#dont)
- [Verification](#verification)

## Boundary

This pipeline acquires a source, extracts broad voice traits, and stores them. It does not schedule re-capture, sync profiles between machines, share or publish profiles, or fetch anything the user did not name in the current request.

Learned profiles never enter the distributed skill. They live in user storage only, and the rule in `reference/source-inspired-presets.md` against bundling an individual creator as a permanent preset applies here unchanged.

## Storage

Default root `~/.claude/thai-voice/`. It sits outside the plugin because `/plugin marketplace update` followed by `/reload-plugins` overwrites the skill directory and would destroy anything stored inside it.

```
~/.claude/thai-voice/
  config.yaml
  profiles/
    index.md              # one row per profile
    <slug>-captured.md     # one profile per file
```

Config, created on first capture. Every key optional; the listed value is the default.

```yaml
profile_dir: ~/.claude/thai-voice/profiles   # override target directory
on_conflict: ask        # ask | overwrite | version
auto_apply: true        # apply the fresh profile to the next request
min_samples: 3          # refuse to emit a profile below this
min_words: 150          # refuse below this total word count across samples
```

`on_conflict: version` writes `<slug>-captured-2.md`, `-3`, and so on, leaving earlier profiles intact.

Captured ids end in `-captured`, for the same reason bundled ids end in `-inspired`: the suffix marks an approximation so a captured profile can never read as an official house style.

## Selector placement

A captured profile is selected by `voice: <slug>-captured`, or by any alias recorded in its own `Aliases` field.

The resolve order that governs which profile wins is defined once, in `reference/source-inspired-presets.md`, under Configuration. Read it there. Do not restate it here — two copies drift.

## Pipeline

### S1 — Classify `<src>`

`url` if it parses as one. `path` if it exists on disk, file or directory. Otherwise `name`.

### S2 — Resolve to samples

| Kind | Action |
|---|---|
| `url` | Fetch. If the page is an index or feed, select 3–5 recent items and fetch those instead of the index. |
| `path` | Read the file. If a directory, glob `*.md` and `*.txt`, read up to 10. |
| `name` | Check `profiles/index.md` first, then bundled aliases, then WebSearch. |

For `name`, present 2–4 candidates through AskUserQuestion, each showing its real URL and one line of evidence. Never auto-pick a single search hit — a name that matches one result is still a guess.

If the name already resolves to a bundled alias, say so and offer two paths: use the bundled preset, or capture a fresh profile anyway.

### S3 — Confirm gate

Before writing or fetching beyond the samples, show:

- resolved source label and URLs
- sample count and total word count
- proposed profile id
- whether that id already exists, and which `on_conflict` branch applies

Stop for the user's answer. Honor `on_conflict`.

### S4 — Screen the samples

Run before any trait extraction. Each check stops the pipeline; none of them is advisory.

1. **Volume** — at or above `min_samples` and `min_words`. Three forty-word posts cannot support a judgment about density or rhythm.
2. **Language** — the samples are predominantly Thai. A source in another language produces a profile whose controls describe that language's rhythm.
3. **Prose** — the samples are continuous writing, not a cookie banner, consent wall, paywall stub, login page, navigation list, or error body. A cookie wall returns text and will otherwise be captured as a voice.

Report which check failed and what would satisfy it. Do not proceed on partial evidence.

### S5 — Extract traits

Fill exactly these fields, in the skill's existing vocabulary, so the result drops into the current selector:

- **Base** — one profile from `reference/voice-profiles.md`
- **Contract** — audience, relationship, channel, job
- **Structure** — opening move, paragraph rhythm, line-break policy, closing move
- **Surface** — `formality` 1–5, `energy` 1–5, `density` skim|standard|deep, particle policy, pronoun policy, `emoji` rate, `code_switching`
- **Lexicon** — recurring vocabulary *categories*, never the distinctive words themselves
- **Invariants** — the accuracy and attribution rules the genre demands
- **Exclude** — observed identity markers, described as patterns rather than quoted

A field with no evidence reads `not observed`. Never fill a field by inference from the source's topic or reputation.

### S6 — Write

Write `<slug>-captured.md`, append a row to `index.md`, report the path. If `auto_apply` is true, apply the profile to the next request in the session and say so.

## Profile file format

```markdown
# <slug>-captured

**Aliases:** <selectors the user may type>

**Base:** <profile from voice-profiles.md>

**Modifiers:** <structure and surface traits, one clause each>

**Invariants:** <accuracy and attribution rules>

**Exclude:** <identity markers, as shapes>

## Controls

formality: 3
energy: 2
density: standard
particles: <policy>
pronouns: <policy>
emoji: 0
code_switching: thai-first

## Provenance

source: <label>
urls: <list>
captured: <YYYY-MM-DD>
samples: <n>
words: <n>
```

An excluded signature is described as a shape, never reproduced. `a two-word rhyming sign-off`, `a bracketed urgency tag repeated in headlines`, `a recurring three-emoji divider` — each tells the model what to avoid without a copy existing on disk.

## Failure handling

| Failure | Response |
|---|---|
| WebSearch or WebFetch unavailable | Say so. Ask for a pasted document or a local path. Do not fall back to reputation or memory of the source. |
| URL returns a paywall, consent wall, or JS-only shell | S4 prose check stops it. Report what came back and ask for a direct article URL or pasted text. |
| Samples are not predominantly Thai | Stop. Report the detected language. Offer to capture structural traits only, with every Thai-specific control left `not observed`. |
| Below `min_samples` or `min_words` | Stop. Report both counts and the thresholds. Ask for more samples rather than emitting a thin profile. |
| `profile_dir` missing | Create it. Report the path created. |
| `profile_dir` unwritable | Stop before extraction. Report the path and the error. Offer an alternate directory. |
| `config.yaml` malformed | Use defaults for every key. Report which keys failed to parse and leave the file untouched. |
| Profile id already exists | Apply `on_conflict`. Under `ask`, show the existing profile's provenance line so the user can compare before deciding. |
| `index.md` missing while profiles exist | Rebuild it from the profile files. Report that it was rebuilt. |
| Write succeeds, index append fails | Report the profile path and the index failure separately. The profile is usable; the index is stale. |

## Do

- Reuse the `-inspired` schema so captured and bundled profiles are interchangeable at the selector.
- Record provenance in every profile: source label, URLs, date captured, sample count, word count.
- Describe an excluded signature as a shape, so the model can avoid it without storing it.
- Keep every path forward-slashed.

## Don't

- Don't store, quote, or echo source sentences — not in the profile, not in the index, not in the confirm gate beyond a bare title.
- Don't write anything before S3 confirms and S4 passes.
- Don't let a captured profile relax the skill's invariants. No affiliation claims, no bylines, no copied slogans, hashtags, or sign-offs, no reproduction of a passage's distinctive sequence. Capturing a source never upgrades the output's authority.
- Don't treat `reference/research.md` as a sample source. It is provenance for the bundled profiles; sources researched there are not sources this user captured.
- Don't fill an unobserved field.

## Verification

After a capture completes, confirm all of these:

1. The profile file exists at the reported path and parses as the format above.
2. Every field is present. Unobserved fields read `not observed` rather than a plausible guess.
3. No sentence in the profile appears in the samples.
4. The `index.md` row matches the filename, source label, and date.
5. Provenance counts match what S4 screened.

Round-trip test: run the same drafting request twice, once with the default `คุยรู้เรื่อง` and once with `voice: <slug>-captured`. The outputs must differ in structure or surface controls, not only in wording. Identical outputs mean the profile carries no usable signal — report that rather than leaving it in place.
