---
name: thai-natural-voice
description: Rewrites, drafts, and localizes Thai so it sounds audience-native rather than translated or machine-written. Adapts register, rhythm, terminology, pronouns, particles, and structure for agent replies, coding and debugging updates, technical explanations, work messages, social posts, and news. Use when the user asks for natural Thai, smoother Thai, less robotic Thai, Thai copy editing, transcreation, Thai developer communication, a Thai creator/media/news voice, or a source-inspired preset such as "use ThaiPBS style." Resolves named presets to non-identifying high-level traits and produces original wording without claiming affiliation. Also learns a new voice profile from a link, a searched-and-confirmed name, or a local document when the user asks to learn a style or runs /learn-thai-style.
---

# Thai Natural Voice

Write from the Thai communicative intent, not from the source sentence order. Preserve facts, commitments, uncertainty, and requested format while changing the social texture of the language.

**Freedom level:** medium for drafting — apply the workflow every time and tune individual choices to audience, relationship, channel, and stakes. Low for the learning pipeline — follow its steps exactly.

## Workflow

### 1. Lock the communication contract

Infer or identify these four variables before drafting:

| Variable | Decide |
|---|---|
| Audience | one person, colleagues, customers, general public, specialist community |
| Relationship | intimate, peer, service, professional, institutional |
| Channel | chat, terminal, code review, documentation, email, caption, thread, article, alert, script |
| Job | inform, explain, diagnose, implement, verify, persuade, reassure, entertain, recommend, request action |

Preserve the user's established pronouns and gendered particles. When they are unknown, prefer pronoun-light phrasing and gender-neutral sentence endings over guessing.

### 2. Choose one voice

Use `คุยรู้เรื่อง` by default. If the task is technical, a post, or a publication, read [reference/voice-profiles.md](reference/voice-profiles.md) and select the closest profile:

- `คุยรู้เรื่อง` — natural conversation and general assistance
- `มืออาชีพเป็นกันเอง` — work chat, email, service communication
- `คู่คิดสายเทค` — coding, debugging, architecture, code review, and implementation updates
- `เพื่อนสรุปให้` — accessible explainers and business/knowledge posts
- `นักเล่าสาระสนุก` — researched educational posts and spoken scripts
- `ข่าวตรงประเด็น` — neutral news and institutional updates
- `ข่าวไว` — developing-event updates
- `ชวนคิดร่วมสมัย` — culture, society, ideas, reflective posts
- `รีวิวบอกต่อ` — food, travel, product, and experience reviews
- `แอดมินชวนคุย` — light community and entertainment posts

Blend at most two profiles. Give one profile ownership of structure and the other ownership of surface tone.

If the user names a publication or media brand, read [reference/source-inspired-presets.md](reference/source-inspired-presets.md). Resolve a known alias such as `ThaiPBS` to its canonical `-inspired` preset and apply its base profile plus modifiers. For an unknown source or an individual creator, map the request to 3–5 broad traits such as `สั้น`, `ขี้เล่น`, `ข้อมูลแน่น`, `ถามนำ`, or `เว้นบรรทัดถี่` and generate a fresh profile.

Treat source names as input selectors, not output identities. Do not reproduce signature phrases, recurring slogans, proprietary labels, branded hashtags, or a passage's distinctive sequence. Apply known broad presets without interrupting the user with a disclaimer; explain the boundary only when they ask for exact imitation, official authorship, or endorsement.

### 3. Draft Thai-first

Draft from a short Thai intent outline. Treat any source-language copy as facts and purpose, not as syntax to preserve.

- Put the point, situation, or time cue where a Thai reader expects it.
- Omit subjects and pronouns recoverable from context.
- Prefer concrete verbs over noun-heavy constructions.
- Use particles to manage relationship, not to decorate every sentence.
- Keep English only when the target community commonly uses that term or when translating it would reduce precision.
- In technical output, preserve code identifiers, commands, paths, API names, filenames, and error text exactly. Put them in backticks or code blocks.
- Use Thai for cause, uncertainty, trade-offs, and next actions. Keep established team vocabulary such as `build`, `deploy`, `test`, and `rollback` consistent instead of alternating translations.
- Put Thai grammar and classifiers around English technical nouns, for example `test ผ่าน 42 เคส`.
- Let line breaks carry pacing in social posts; let paragraphs carry argument in articles.

For the full transformation guide and robot-smell patterns, read [reference/naturalness.md](reference/naturalness.md).

### 4. Tune the social temperature

Adjust these controls deliberately:

| Control | Cooler / formal | Warmer / casual |
|---|---|---|
| Reference | role, organization, full name | omitted subject, เรา, ทุกคน, kin term when authentic |
| Ending | neutral written ending | ครับ/ค่ะ/นะ/เลย/ล่ะ used selectively |
| Rhythm | complete compact paragraphs | fragments, short beats, conversational turns |
| Emphasis | ordering and evidence | repetition, sound play, one expressive marker |
| Reader address | indirect or absent | question, invitation, shared experience |

Move only as warm as the relationship permits. Public-service, crisis, health, legal, and financial copy stays clear before it becomes lively.

### 5. Run the native-ear pass

Read the result as if spoken to the intended reader. Revise until all are true:

1. The first two lines reveal the point or earn the next line.
2. Pronouns, particles, and honorifics fit one consistent relationship.
3. No connector or sentence frame repeats mechanically.
4. Each paragraph does one job and varies naturally in length.
5. Slang, emoji, elongation, and English each have a channel-specific reason.
6. Removing one sentence would remove meaning, tone, or necessary pacing.
7. The text could plausibly come from a Thai speaker without pretending to be a named source.

If the text still smells translated, rebuild the weakest paragraph from its intent rather than swapping synonyms.

## Learning a new source

`/learn-thai-style <src>` builds a reusable profile from a real source. `<src>` is a link, a name to search and confirm, or a local document.

This pipeline fetches external content and writes files under `~/.claude/thai-voice/`, outside this repository. Read [reference/learning.md](reference/learning.md) and follow it exactly before fetching or writing anything. Do not act on this summary.

## Known limitations

A profile is a snapshot. Sources change their voice, and a learned profile records one reading on the date in its provenance line.

Trait extraction sees only what the samples show. Narrow samples produce profiles with `not observed` fields — the correct outcome, not a defect.

## Output behavior

Return the finished Thai first. Explain voice decisions only when the user asks, when an exact or unknown named-style request had to be generalized, or when a high-stakes wording choice needs a caveat.

Keep factual uncertainty unchanged. Naturalness never licenses stronger claims, invented familiarity, fake first-hand experience, or unsupported urgency.

## References

- [Voice profiles](reference/voice-profiles.md) — structures, tone controls, and failure modes for each profile
- [Thai naturalness](reference/naturalness.md) — Thai-first transformations and the robot-smell detector
- [Originality and attribution](reference/originality.md) — safe handling of named styles, source text, and impersonation
- [Learning a source voice](reference/learning.md) — the `/learn-thai-style` pipeline, its storage contract, failure handling, and verification
- [Source-inspired presets](reference/source-inspired-presets.md) — configurable aliases such as `ThaiPBS` mapped to broad, original voice controls
- [Research](reference/research.md) — public-source observations and methodology behind the profiles
- [Before/after examples](examples/before-after.md) — original examples across common channels
