# Source-inspired presets

Use source names only as input aliases for broad communication traits. Canonical preset IDs end in `-inspired` to distinguish an approximation from an official house style.

## Contents

- [Configuration](#configuration)
- [Media and publication presets](#media-and-publication-presets)
- [`thai-pbs-inspired`](#thai-pbs-inspired)
- [`thairath-news-inspired`](#thairath-news-inspired)
- [`the-standard-inspired`](#the-standard-inspired)
- [`longtunman-inspired`](#longtunman-inspired)
- [`the-matter-inspired`](#the-matter-inspired)
- [`brandthink-inspired`](#brandthink-inspired)
- [`mango-zero-inspired`](#mango-zero-inspired)
- [`wongnai-guide-inspired`](#wongnai-guide-inspired)
- [Generic technology presets](#generic-technology-presets)
- [Generic creator presets](#generic-creator-presets)

## Configuration

Accept either natural language or a compact control block:

```text
use ThaiPBS style
ใช้โทน Thai PBS
voice: thai-pbs-inspired
```

Optional overrides:

```yaml
voice: thai-pbs-inspired
formality: 4       # 1 casual — 5 official
energy: 1          # 1 restrained — 5 exuberant
density: standard  # skim | standard | deep
code_switching: thai-first
emoji: 0
```

Resolve in this order:

1. Normalize spacing, case, punctuation, and Thai/English aliases.
2. Select the profile from the first tier that matches:
   1. a learned profile in the user's `profile_dir` — see `reference/learning.md`
   2. a bundled `-inspired` preset in this file
   3. a generic technology or creator preset in this file
   4. 3–5 improvised traits
3. Load the profile's base, modifiers, and invariants.
4. Apply user overrides except where they conflict with accuracy, attribution, non-impersonation, or channel safety.
5. Generate independently worded Thai. Keep the source name out of bylines, sign-offs, hashtags, and claims of authorship.

A learned profile outranks a bundled preset sharing the same alias — the user inspected that source deliberately. Learned ids end in `-learned` and are selected the same way, for example `voice: some-source-learned`.

For an ordinary known alias, return the requested content without a disclaimer. If the user asks for `exactly`, `เหมือนเป๊ะ`, an official statement, or an endorsement, state briefly that the result will use broad traits rather than impersonate or represent the source.

## Media and publication presets

### `thai-pbs-inspired`

**Aliases:** `ThaiPBS`, `Thai PBS`, `ไทยพีบีเอส`, `ไทย PBS`

**Base:** `ข่าวตรงประเด็น`

**Modifiers:** neutral-formal; event/actor/action first; compact summary; date, source, title, place, and quantity early; restrained punctuation; no emoji; public action only when useful.

**Invariants:** attribute claims close to their source; distinguish confirmed facts, preliminary information, and allegations; preserve timestamps and corrections.

**Exclude:** program names, visual-card labels, institutional slogans, copied headlines, or language implying Thai PBS reported or approved the output.

### `thairath-news-inspired`

**Aliases:** `ThaiRath`, `Thairath`, `ไทยรัฐ`, `ไทยรัฐออนไลน์`

**Base:** `ข่าวไว`

**Modifiers:** direct; recognizable person/event and consequence early; compact clauses; visible update status; moderate headline energy.

**Invariants:** urgency follows evidence; timestamp changing facts; retain attribution and uncertainty.

**Exclude:** sensational harm language, recycled `ด่วน` labels, branded follow blocks, copied hashtags, or outlet attribution.

### `the-standard-inspired`

**Aliases:** `THE STANDARD`, `The Standard`, `เดอะสแตนดาร์ด`

**Base:** `ชวนคิดร่วมสมัย`

**Modifiers:** polished digital editorial; one elegant framing idea; contextual lead; scannable highlights; selective established English; restrained reader invitation.

**Invariants:** clarity before polish; distinguish editorial framing from source facts.

**Exclude:** branded section names, typography as identity, recurring invitation formulas, slogans, or a look-alike headline.

### `longtunman-inspired`

**Aliases:** `Longtunman`, `ลงทุนแมน`

**Base:** `เพื่อนสรุปให้`

**Modifiers:** surprising contrast or genuine question; one-idea lines; simple causal model; concrete numbers or analogy; sparse particles; implication at the end.

**Invariants:** show where numbers come from; answer the information gap; keep sponsored status visible when applicable.

**Exclude:** narrator catchphrases, branded transitions, sign-offs, recurring punctuation quirks, or moral lessons unsupported by the topic.

### `the-matter-inspired`

**Aliases:** `THE MATTER`, `The MATTER`, `The Matter`, `เดอะแมทเทอร์`

**Base:** `ชวนคิดร่วมสมัย`

**Modifiers:** question or paradox first; humane social context; inclusive `เรา` only where genuinely shared; conversational side note; open, thought-provoking landing.

**Invariants:** preserve nuance and contested viewpoints; avoid manufacturing consensus.

**Exclude:** branded campaign language, copied framing lines, source-specific hashtags, or moral superiority.

### `brandthink-inspired`

**Aliases:** `BrandThink`, `Brand Think`, `แบรนด์ธิงค์`

**Base:** `ชวนคิดร่วมสมัย`

**Modifiers:** contemporary and constructive; everyday question widened into a social idea; selective quoted concepts; warm invitation to reflect or act.

**Invariants:** keep promotional status visible; connect optimism to concrete evidence or action.

**Exclude:** campaign names, house slogans, repeated `ชวน...` formulas, branded hashtags, or unsupported uplift.

### `mango-zero-inspired`

**Aliases:** `Mango Zero`, `MangoZero`, `แมงโก้ซีโร่`

**Base:** `แอดมินชวนคุย`

**Modifiers:** accessible pop-culture hook; spoken vocabulary; list-friendly structure; one playful flourish; specific participation prompt.

**Invariants:** explain niche references; lower energy around sensitive subjects.

**Exclude:** signature spellings, repeated-vowel caricature, branded series names, fandom bait, or copied CTA patterns.

### `wongnai-guide-inspired`

**Aliases:** `Wongnai`, `วงใน`, `วงในไกด์`

**Base:** `รีวิวบอกต่อ`

**Modifiers:** verdict early; sensory specifics; price/location/wait or other practical details; clear trade-offs; say who the choice suits.

**Invariants:** distinguish personal experience, attributed user review, editorial synthesis, and sponsorship.

**Exclude:** invented visits or tastings, copied user-review language, platform badges, ranking claims, or undisclosed promotion.

## Generic technology presets

These presets synthesize broad patterns across multiple Thai developer sources. Source names remain research provenance, not selectable identities.

| Preset | Base | Controls |
|---|---|---|
| `thai-code-coach` | `คู่คิดสายเทค` | beginner-aware, goal first, named steps, smallest useful code example, expected result |
| `thai-engineering-explainer` | `คู่คิดสายเทค` | practitioner-to-practitioner, define the model, compare options, state trade-offs and production risk |
| `thai-engineering-retro` | `คู่คิดสายเทค` | symptom or incident, constraint, hypothesis, action, observed result, reusable lesson |

For all three, preserve commands, identifiers, paths, API names, and error text exactly. Let Thai carry the explanation and relationship; let conventional English carry technical identity.

## Generic creator presets

Use these when the user wants a creator-like voice without naming a person:

| Preset | Base | Controls |
|---|---|---|
| `thai-edutainment-creator` | `นักเล่าสาระสนุก` | question-led, spoken pace, visible sources, light audience interaction |
| `thai-lifestyle-creator` | `รีวิวบอกต่อ` | personal observation only if supplied, sensory detail, useful takeaway, warm particles |
| `thai-friend-group-creator` | `แอดมินชวนคุย` | collective energy, short lines, one playful device, concrete CTA |

An individual creator's name never becomes a bundled permanent preset. Resolve it per request into broad traits, and use only details the user supplies or public evidence inspected for that task.

This alias design reduces copying, identity, attribution, and endorsement risk; it is not a guarantee that every use is lawful in every jurisdiction or context.
