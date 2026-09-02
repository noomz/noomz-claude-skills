# Research note: natural Thai posting voices

Last researched: 2026-09-02 (Asia/Bangkok)

This note maps public Thai-language posts into reusable linguistic patterns for the `thai-natural-voice` skill. It is a descriptive snapshot, not an endorsement, ranking, or license to impersonate any person or publisher. Named accounts are evidence sources; output profiles use the generic archetype names proposed below. Convenience input aliases may name a publication only when they resolve to an explicitly `-inspired`, high-level preset and never become an output identity.

## Contents

- [Executive findings](#executive-findings)
- [Scope and method](#scope-and-method)
- [Linguistic corroboration](#linguistic-corroboration)
- [Observed source families](#observed-source-families)
- [Cross-source language patterns](#cross-source-language-patterns)
- [Recommended archetypes](#recommended-archetypes)
- [Naturalness controls for the skill](#naturalness-controls-for-the-skill)
- [Open-source, copyright, and persona safeguards](#open-source-copyright-and-persona-safeguards)
- [Source log](#source-log)

## Executive findings

1. Natural Thai is not a single "casual" register. The strongest voices consistently coordinate distance, rhythm, stance, and interaction. A playful creator, a business explainer, and a public-service newsroom can all sound native while making opposite choices on those axes.
2. The most reusable device is rhythm. Thai social writing frequently alternates a short hook, one-idea lines, a turn introduced by words such as `แต่`, `แล้ว`, or `เพราะ`, and a compact landing. Literal English paragraph structure is a larger source of robotic tone than vocabulary alone.
3. Pronouns and polite particles should be deliberate, not sprayed onto every sentence. Natural posts often omit subjects once context is established; use `เรา`, a channel name, or a speaker name only when it clarifies stance. `ครับ`/`ค่ะ` encode the speaker's presented voice, while `นะ`, `นะครับ`, `นะคะ`, `ล่ะ`, `เลย`, and `สิ` also shape interpersonal force.
4. Hooks are genre-specific: hard news leads with the event; explainers use a question or surprising contrast; reflective creators begin with a moment, feeling, or sensory detail; playful creators use reunion energy, exaggeration, and audience inclusion.
5. "Premium" Thai editorial voice is not the same as formal Thai. It mixes polished vocabulary with short framing sentences, selective English labels, quoted concepts, and invitations such as `ชวนสำรวจ` or `ชวนเข้าใจ`.
6. For an open-source skill, expose generic archetypes and composable controls. A convenience phrase such as `use ThaiPBS style` may resolve to a clearly labeled `thai-pbs-inspired` bundle of abstract traits; it is not an exact-style mode. Do not ship copied catchphrases, post corpora, or few-shot examples lifted from public posts.
7. Developer-facing Thai uses a useful division of labor: English preserves technical identity, while Thai carries causality, confidence, trade-offs, and action guidance. Coding agents should keep literals exact and make the surrounding reasoning natural and explicit.

## Scope and method

- Sampled first-party public pages and posts from recognizable Thai newsrooms, digital media publishers, developer educators, engineering-team publications, practitioners, business explainers, and creators. Sources include official websites, official publication pages, an official Facebook post, and verified official YouTube uploads.
- Inspected visible headlines, dek/lead text, paragraphing, pronouns, particles, punctuation, emoji, hashtags, calls to action, and recurring structural moves. Observations below are inferences from those samples unless identified as an official rule.
- Prioritized source diversity over exhaustive analysis of any one account. Styles vary by desk, author, sponsor, platform, and year; the skill should therefore treat each pattern as a tunable archetype rather than a fixed identity.
- Used only short functional fragments where needed to name a linguistic feature. No post is reproduced as training data or as a reusable template.

## Linguistic corroboration

The public-post observations align with research on Thai online communication. Sonkaew's three-month Facebook corpus found language choice to be fluid, audience-dependent, and multimodal; participants switched languages and scripts and used Thai particles, `555`, and romanized Thai for context-specific purposes. Tagg and Seargeant likewise found code/script switching and orthographic variation performing interpersonal and identity work in Thai-English online exchanges. An Instagram study of 40 Thai users identified lexical insertion, translation, repetition, specialized features, and net-culture switching, with code-mixing used to express emotion and identity. These findings support treating code-switching, spelling play, emoji, and particles as relationship-bearing controls rather than generic decorations.

A Thai sociolinguistic review also describes online Thai as changing with speaker status, social context, technology, sound play, compounding, shortening, borrowing, and shifts in meaning. The practical consequence is not to imitate every nonstandard form, but to make register and audience accommodation explicit in the skill.

## Observed source families

### 1. Public-service straight news

Evidence: Thai PBS News article pages and Thai PBS's own professional-ethics materials.

- **Register:** neutral-formal, institutionally distant, low authorial self-display.
- **Hook and structure:** an event-first headline with a strong verb; a short summary; then `วันนี้ (date)` and attributed details. Time, office, title, full name, and quantities arrive early.
- **Rhythm:** medium-length factual sentences, chronological or source-by-source sequencing, little conversational suspense.
- **Pronouns and particles:** usually omitted. No need to manufacture `เรา` or add politeness particles to reporting sentences.
- **Punctuation and decoration:** quotation marks for attributed or contested wording; numerals and abbreviations carry information. Emoji and conversational CTA are absent.
- **Headline convention:** actor/action/consequence, sometimes prefixed by an attention verb such as `จับตา` or `เปิด`.
- **Safety lesson:** a newsroom tone must include reporting discipline, not just headline texture. Thai PBS states that facts, accuracy, language, content, and presentation should be handled carefully and checked; its newer toolkit is explicitly presented as standards and practice for journalism.

Reusable essence: **facts first, attribution close to claims, no invented warmth, no suspense that obscures certainty.**

### 2. Mass-market breaking/news-update voice

Evidence: Thai Rath news and video pages.

- **Register:** direct and high-energy while remaining news-like.
- **Hook:** urgency verbs and superlative stakes (`เกาะติด`, `ล่าสุด`, `ครบ`, `ทุก...`), followed by the key people/event.
- **Rhythm:** compact clauses; hyphens can compress a process or sequence; update markers make the post feel live.
- **Pronouns and particles:** largely absent; the outlet may self-reference as a reporting team.
- **Punctuation and social layer:** exclamation marks appear in video headlines; hashtags and a subscribe/follow block often sit after the news description.
- **Headline convention:** consequence and recognizable proper nouns are pulled forward; verbs do more work than abstract nouns.

Reusable essence: **fast orientation and visible update status**, without inheriting sensationalism or unverified certainty.

### 3. Polished digital editorial voice

Evidence: THE STANDARD feature and news-explainer pages.

- **Register:** polished but reader-facing, often switching between Thai and established English category/brand terms.
- **Hook and structure:** crafted headline, highlight block, contextual lead, then an explicit editorial invitation (`ชวนสำรวจ` is common in the sample). A question or contrast often frames why the topic matters now.
- **Rhythm:** longer descriptive sentences are balanced by short section headings and highlight bullets.
- **Pronouns:** organization name for editorial stance; `คุณ` appears selectively in lifestyle/service framing; `เรา` is not required in every paragraph.
- **Punctuation:** Thai single quotation marks emphasize a concept or phrase; parentheses add a light aside; numerals and English labels help scanning.
- **CTA:** usually an invitation to explore or understand, less often a hard command.

Reusable essence: **curated context + one elegant framing idea + scannable highlights.** Avoid copying branded editorial formulas or typography wholesale.

### 4. Step-by-step business explainer

Evidence: Longtunman article pages.

- **Register:** plainspoken, confident, analytical, designed to make finance feel close to daily life.
- **Hook:** `ทำไม...`, `เกิดอะไรขึ้น...`, or a surprising comparison; several short setup lines create an information gap before the explanation.
- **Rhythm:** highly segmented one-idea lines; rhetorical question; a pivot; numbered factors or a worked example; final lesson.
- **Pronouns:** inclusive `เรา`, broad audience nouns such as `หลายคน`, and an occasional brand self-reference as narrator.
- **Particles:** sparse. Accessibility comes from syntax and examples rather than chat particles.
- **Punctuation:** question marks, ellipses in older samples, quoted key concepts, numerals, and simple list structures.
- **CTA:** a recurring branded transition/sign-off and, in sponsored material, a clear offer block.

Reusable essence: **question → simple model → concrete analogy → implication.** Replace any recognizable catchphrase with a generic transition such as `ลองไล่ดูทีละข้อ`.

### 5. Social/culture "friend who makes you think"

Evidence: THE MATTER and BrandThink pages.

- **Register:** semi-formal and contemporary, with editorial curiosity rather than newsroom detachment.
- **Hook:** a direct question, paradox, or `เมื่อ...` frame; abstract public issues are translated into a question a reader might actually ask.
- **Rhythm:** alternating short questions with explanatory paragraphs; parentheses and quoted concepts create conversational side notes.
- **Pronouns:** inclusive `เรา`; direct `คุณ` when inviting reflection. This builds shared inquiry without pretending personal intimacy.
- **Lexicon:** common Thai alongside current English loans when they are already natural in the topic (`ไวบ์`, `Connect`, `AI` in the observed pages).
- **CTA:** `ชวนเข้าใจ`, `ชวนทบทวน`, or a final open question; hashtags may identify a campaign.

Reusable essence: **shared question + humane context + a thought-provoking landing.** Do not confuse warmth with unsupported advocacy.

### 6. Research-backed edutainment creator

Evidence: verified Point of View YouTube uploads.

- **Register:** energetic spoken Thai wrapped around researched subject matter.
- **Hook and packaging:** titles frequently ask `ทำไม...` or `...ยังไง`; recurring series labels make the audience recognize the format.
- **Structure:** question-led opening; story or competing versions; explicit analysis; evidence/reference list; chapter timestamps; follow/further-work links.
- **Pronouns and particles:** creator name as first-person self-reference; audience as `ทุกคน`; light endings such as `ค่า` in CTA text.
- **Interaction:** viewers are invited to submit questions in a recognizable hashtag format.
- **Credibility:** an informal surface coexists with visible references. This combination is more important than speed or catchphrases.

Reusable essence: **curious question + brisk story beats + show the sources + invite the next question.** Use a neutral narrator identity, not the creator's name or series label.

### 7. Playful friend-group creator

Evidence: verified Kaykai Salaider YouTube upload announcing the group's return.

- **Register:** intimate, youthful, high-affect, intentionally nonstandard in small doses.
- **Hook and rhythm:** a declaration/reunion hook; isolated short lines; repeated words and stretched vowels for performed excitement.
- **Pronouns:** `พวกเรา`, `เพื่อนๆ`, and `ทุกคน` make the channel feel like a group the audience can join.
- **Particles and spelling:** elongated endings such as a playful `นะค้า`; comic wordplay and sound-based misspelling; these are identity signals, not general Thai defaults.
- **Emoji and punctuation:** a small number of expressive emoji and multiple exclamation marks reinforce energy.
- **CTA:** direct follow/subscribe goal framed as something to reach together.

Reusable essence: **shared excitement + compact lines + one playful flourish + collective CTA.** Cap exaggeration; repeated vowel stretching or deliberate misspelling quickly becomes caricature.

### 8. Personal experience / lifestyle narrator

Evidence: a public first-person Facebook post by creator Kate Ozmen, used only as a structural sample.

- **Register:** conversational and self-aware, with polite `ค่ะ/นะคะ` alongside colloquial intensifiers and jokes.
- **Hook:** invites the reader into a topic, states a common misunderstanding, then introduces a named recurring segment.
- **Structure:** personal anecdote → explanation/list → vivid everyday comparisons → question or invitation.
- **Pronouns:** creator name or nickname can replace `ฉัน`; `หลายๆ คน` and direct invitation keep the reader nearby.
- **Punctuation:** parentheses for asides, quotation marks around segment names, numeral-led list, and a single reaction emoji.
- **Risk:** individual lexical quirks are highly identifying. The skill should retain only the generic diary-to-explainer structure.

Reusable essence: **lived moment + what I learned + useful takeaway**, using the agent's configured persona rather than a real person's mannerisms.

### 9. Beginner-friendly developer tutorial

Evidence: BorntoDev tutorials on Conventional Commits and GitLab CI/CD.

- **Register:** conversational, encouraging, and instructional; the reader is treated as capable but possibly new to the tool.
- **Code-switching:** canonical terms such as `Commit`, `Scope`, `Body`, `build`, `test`, `deploy`, and `Codebase` stay in English while Thai explains their purpose and relationship.
- **Structure:** short motivation or familiar problem → named parts or steps → code/example → plain-language explanation → practical result.
- **Rhythm:** headings and numbered components carry progress; direct questions and occasional particles soften instruction without obscuring the procedure.
- **Agent lesson:** give the smallest useful command or code block, explain what each part changes, and state what the user should observe next.

Reusable essence: **goal first + exact technical artifact + stepwise explanation + observable result.**

### 10. Engineering-team explainer

Evidence: KBTG Life articles about building an AI assistant and AI-driven software development.

- **Register:** a knowledgeable teammate reasoning in public rather than a textbook or corporate announcement.
- **Code-switching:** Thai carries the argument; conventional terms such as `Agent`, `Tool`, `API`, `Endpoint`, `Production`, `Deployment`, `User Story`, and `Context` remain stable.
- **Structure:** relatable use case or industry question → working model → contrasted approaches → workflow/phases → engineering caveats → takeaway.
- **Rhythm:** medium explanatory paragraphs broken by headings, lists, comparisons, and occasional light humor.
- **Agent lesson:** explain why a choice fits before implementation, contrast alternatives explicitly, and name human-review or production risks.

Reusable essence: **shared technical context + model + trade-offs + accountable recommendation.**

### 11. Practitioner lesson and retrospective

Evidence: odds.team essays on polyglot programming and release planning.

- **Register:** experienced colleague recounting real work, including uncertainty, mistakes, and changes of mind.
- **Code-switching:** dense technical vocabulary such as `library`, `framework`, `build`, `CI`, `deploy`, `rollback`, and `automated test` sits naturally inside colloquial Thai reasoning.
- **Structure:** concrete situation → constraint or failure → hypothesis or team decision → action → observed result → lesson.
- **Rhythm:** first-person chronology, short moments of dialogue, candid qualification, and restrained humor.
- **Agent lesson:** debugging reports and retrospectives become easier to trust when they separate what was observed, what was inferred, what was tried, and what happened.

Reusable essence: **evidence → hypothesis → action → result → next-time lesson**, without inventing a first-hand incident.

## Cross-source language patterns

### Register and stance

| Dimension | Low end | High end | Natural choice rule |
|---|---|---|---|
| Social distance | institutional | close friend | Match relationship and task; never infer intimacy from Thai language alone. |
| Formality | spoken | official | High-stakes facts favor neutral-formal; social captions can relax syntax. |
| Energy | restrained | exuberant | Express energy through line length and verbs before adding punctuation/emoji. |
| Subjectivity | attributed | personal | News attributes; creators own feelings with first-person framing. |
| Certainty | exploratory | declarative | Use evidence to set certainty, not the chosen archetype. |
| Code-switching | Thai-first | mixed Thai/English | Keep established domain terms; do not insert English merely to sound modern. |

### Technical discourse

- Preserve code identifiers, commands, filenames, paths, API names, version strings, and error text exactly; format them as literals rather than translating or transliterating them.
- Use Thai for relationships between technical facts: cause, contrast, uncertainty, impact, trade-off, and next action.
- Keep English technical nouns uninflected and use Thai word order and classifiers around them, such as `test ผ่าน 42 เคส`.
- Introduce an unfamiliar acronym or term once when the audience needs it. Do not repeatedly gloss vocabulary an expert reader already uses.
- Keep one English form for each concept within a response; avoid alternating `deploy`, `ดีพลอย`, and `นำขึ้นระบบ` unless a distinction is intentional.
- For implementation updates, prefer outcome → changed surface → verification → remaining risk. For diagnosis, prefer symptom → evidence → hypothesis → check → result.
- Mark verification honestly: `test ผ่าน`, `ยังไม่ได้รัน test`, and `ตรวจเฉพาะ...` describe different states and should never collapse into `เรียบร้อยแล้ว`.

### Sentence rhythm

- Prefer one communicative move per sentence or line in social copy.
- Use a short opener, then vary line length. Five equally polished, equally long sentences read like translation or corporate boilerplate.
- Thai transitions that often sound smoother than literal English connectors include `แต่`, `ทีนี้`, `พอ...`, `เลย`, `เพราะงั้น`, `ส่วน...`, and `ถ้าถามว่า...`; select them by register.
- A question should open a real information gap. Do not add rhetorical questions to every section.
- Let the landing answer the hook or tell the reader what to do next.

### Pronouns and particles

- Drop the subject when it is recoverable. Repeating `ผม/ฉัน/เรา/คุณ` in every sentence is conspicuously un-Thai.
- Treat `เรา` carefully: it can mean the speaker, the speaker's team, or speaker-plus-reader. Rewrite when inclusion matters.
- Use `คุณ` for necessary direct address, not as a translation of every English "you."
- Configure the speaker presentation before using `ครับ` or `ค่ะ`. If unconfigured, neutral endings and occasional `นะ` are safer than alternating genders.
- Particles modify force: `นะ` softens or seeks alignment; `เลย` adds immediacy/result; `ล่ะ` marks a turn or question; `สิ` can encourage or press. They are pragmatic choices, not decorative suffixes.
- Reduplication should follow Thai orthography (`จริง ๆ`, `ต่าง ๆ`, `เพื่อน ๆ`) in neutral/formal output. Deliberate compressed forms (`จริงๆ`) are common online but should be a platform/register option. The Office of the Royal Society provides the formal punctuation and spacing baseline.

### Punctuation, emoji, and layout

- Thai does not need an English-style period after every sentence. Paragraph breaks and spacing often carry the cadence.
- Avoid imported em-dash density. Thai posts more often use a new line, colon, parentheses, or a short connective clause.
- Use `?` and `!` as energy controls. One is normally enough outside a deliberately playful mode.
- Emoji should have a job: mood cue, section marker, or CTA marker. A default of zero is appropriate for news and professional answers; one or two may suit social/playful modes.
- Hashtags belong at the end unless the hashtag itself names a recurring audience prompt. Use only topic/campaign tags that are relevant; never copy a source's branded tag.

### Headline and hook patterns worth generalizing

- **Event first:** `[actor] + [action] + [immediate consequence]`
- **Why now:** `ทำไม [familiar thing] ถึง [surprising result]`
- **What happened:** `เกิดอะไรขึ้นกับ [topic]`
- **Contrast:** `[old assumption] แต่ [new reality]`
- **Reader situation:** `ถ้า [situation] ควรเริ่มตรงไหน`
- **Moment-led:** `วันนี้ลอง [experience] แล้วเพิ่งเข้าใจว่า...`
- **Guide/list:** `[number] เรื่องที่ควรรู้ก่อน [action]`

These are common rhetorical structures, not proprietary phrases. Vary the wording and make the body independently authored.

## Recommended archetypes

Use these descriptive names for output profiles. Source brands may appear in research provenance and convenience input aliases, but not as output identities, bylines, endorsements, or claims of official house style.

| Safe archetype | Best for | Core settings | Avoid |
|---|---|---|---|
| `ข่าวตรงประเด็น` | updates, public information | neutral-formal, event-first, attributed, no emoji | clickbait certainty |
| `ข่าวไว` | live/social news summaries | terse, urgency markers, timestamp/status | sensational harm language |
| `เพื่อนสรุปให้` | business, technology, concepts | question → model → example → takeaway | copied narrator catchphrase |
| `นักเล่าสาระสนุก` | educational scripts/posts | brisk story beats, visible sources, light particles | mimicking a host or series |
| `ชวนคิดร่วมสมัย` | culture, society, reflection | inclusive `เรา`, open question, humane context | false intimacy or preaching |
| `รีวิวบอกต่อ` | travel, lifestyle, products | verdict, sensory detail, trade-offs, practical fit | invented life experience |
| `แอดมินชวนคุย` | youth/social captions | short lines, high energy, at most one wordplay flourish | vowel-stretch spam, forced slang |
| `มืออาชีพเป็นกันเอง` | work and service messages | action first, explicit owner/time, polite-softening | institutional padding |
| `คู่คิดสายเทค` | coding agents, debugging, architecture, code review | outcome/evidence first, exact literals, explicit verification | translated identifiers, unverified success |
| `คุยรู้เรื่อง` | default agent conversation | warm-neutral, pronoun-light, direct answer first | essay cadence, constant `ครับ/ค่ะ` |

Archetypes should be composable. A user can ask for `เพื่อนสรุปให้` with lower energy and no English, or `คุยรู้เรื่อง` with formal politeness. This is safer and more useful than selecting a famous name.

## Naturalness controls for the skill

The skill should infer or accept the following controls:

1. **Purpose:** chat answer, coding update, diagnosis, code explanation, design review, caption, thread, explainer, news brief, script, or CTA.
2. **Relationship:** unknown reader, customer, colleague, community, follower, or close friend.
3. **Speaker presentation:** neutral, `ครับ`, `ค่ะ`, or user-specified persona. Never alternate accidentally.
4. **Formality:** 1 spoken/casual to 5 official.
5. **Energy:** 1 restrained to 5 exuberant.
6. **Density:** skim, standard, or deep.
7. **Code-switching:** Thai-first, domain terms only, or contemporary mixed.
8. **Decoration:** emoji count, hashtag policy, punctuation intensity.
9. **Evidence mode:** personal, attributed, sourced, or newsroom.

Suggested default for ordinary assistant replies: `คุยรู้เรื่อง`, warm-neutral, formality 3, energy 2, Thai-first with established technical terms, no emoji unless the user uses them, direct answer first, and no more than one softening particle per paragraph.

Suggested default for coding-agent replies: `คู่คิดสายเทค`, warm-neutral, formality 3, energy 1, exact technical literals, outcome first, explicit test status, and no decorative emoji.

### Anti-robotic pass

Before returning Thai prose, check:

- Does the first sentence answer or orient, rather than announce that an answer is coming?
- Can any repeated subject pronoun be dropped?
- Did a literal English nominalization survive (`การทำ...ของ...เกี่ยวกับ...` chains)? Convert it to a verb.
- Are sentence lengths varied?
- Is every connective necessary, especially `นอกจากนี้`, `อย่างไรก็ตาม`, `ดังนั้น`, and `ในส่วนของ`?
- Are particles consistent with the speaker and relationship?
- Are identifiers, commands, paths, and error text unchanged and visually distinct from the Thai explanation?
- Does the copy contain a claim, experience, or feeling the agent does not actually have? Attribute or reframe it.
- Do emoji, hashtags, and exclamation marks match the platform and archetype?
- Would a Thai reader know what to do or understand after the final line?

## Open-source, copyright, and persona safeguards

### What the law/source material supports

- Thailand's Department of Intellectual Property says copyrightable work must be an original expression and not copied from another person; it lists writings and audiovisual works among protected categories. It also says ideas, procedures, systems, principles, and mere daily-news facts are not registrable as copyright material. This supports extracting abstract communication principles, not copying the wording or creative selection/arrangement of posts.
- WIPO likewise explains that copyright protects expression rather than ideas, procedures, or methods, while articles and advertisements can be protected works. Public availability is not permission to reproduce a text.
- The U.S. Copyright Office's 2024 digital-replicas report says artistic style is not a separately protected element under U.S. copyright law, but explicitly recognizes creator, market, attribution, and identity harms from AI imitation. It also notes that similar writing style can still contribute to the overall similarity analysis between works. This is a reason to set a higher ethical/product bar than "style is not copyright."
- ETDA's official Generative AI governance guideline identifies risks around privacy, misinformation, intellectual-property similarity, and unauthorized use of a person's identity or distinctive attributes, and recommends human involvement, validation, risk assessment, and accountability. This directly supports a high-level-traits-only design.
- Thailand's Office of the Consumer Protection Board warns that advertising which uses celebrities, influencers, or AI-generated imagery can mislead people about a product or service. Commercial output therefore needs a stricter rule: never fabricate a testimonial, sponsorship, approval, or endorsement by the referenced source.
- Thailand's PDPA regulates collection, use, and disclosure of personal data and applies additional protection to sensitive categories. Public visibility is not a general license to compile private messages, comments, contact details, behavioral profiles, or inferred sensitive traits into skill assets.
- These are general research findings, not legal advice. Rights and remedies differ by jurisdiction, and trademark, passing-off/unfair-competition, privacy, contract, and personality/publicity issues can apply separately.

### Safe implementation boundary

Ship:

- abstract features such as hook type, line length, pronoun distance, particle density, emoji budget, evidence structure, and CTA strength;
- generic archetype names and independently written miniature examples;
- source links and an explicit statement that named sources are research inspirations only;
- publication aliases ending in `-inspired` that resolve only to the generic profiles and abstract controls above;
- a refusal/redirect rule for requests to imitate a living person or identifiable outlet closely: offer the nearest generic archetype and list the chosen high-level traits;
- an originality check that removes distinctive catchphrases, branded hashtags, names, slogans, and unusually close sequencing;
- a commercial-content check that rejects fabricated endorsements and makes genuine sponsorship/advertising status explicit when relevant.

Do not ship:

- scraped post corpora, screenshots, transcripts, or large excerpts;
- a permanent preset named after an individual creator, show, recurring segment, mascot, or signature persona;
- a publication alias presented as the source's actual style, official preset, authorship, or endorsement;
- copied catchphrases, branded CTA formulas, hashtags, signature misspellings, or signature emoji combinations;
- instructions to claim or imply that output was written, approved, or reported by the source;
- invented first-person experiences, reporting, interviews, or feelings merely because an archetype commonly uses them;
- private messages, non-public material, contact data, inferred sensitive traits, or biometric/voice/face assets.

### Recommended redirect behavior

If asked to "write exactly like [named creator/outlet]", the agent should say briefly that it can capture broad traits without impersonating the source, then map the request to 3–5 attributes. Example mapping: "fast educational storytelling, question-led hook, short spoken sentences, visible references, light audience interaction." It should then write original text with no source names or signature phrases.

### Release checklist

- [ ] All output profiles have generic names; publication aliases end in `-inspired` and remain input selectors only.
- [ ] All examples are newly authored for the skill.
- [ ] No source excerpt is needed at runtime.
- [ ] No distinctive phrase or branded hashtag is embedded in prompts.
- [ ] Development-time similarity QA flags long exact overlaps with source wording; any numeric threshold is a heuristic, not a legal safe harbor.
- [ ] A named-style request resolves only to high-level attributes, whether through a known preset or an on-demand mapping.
- [ ] News-like output preserves attribution and uncertainty.
- [ ] Personal-style output never fabricates lived experience.
- [ ] Commercial output never fabricates an endorsement or testimonial.
- [ ] No private or sensitive personal data is included in skill assets.
- [ ] Repository license covers only original skill text/code, not linked source content.

## Source log

All URLs were accessed 2026-09-02. Dates below are publication/upload dates shown by the source or search index; undated resources are marked accordingly.

### News and media publishers

1. Thai PBS News, [“กรมเจรจาฯ” ลุยถก FTA อียู เกาหลีใต้ ตั้งเป้าสรุปผลปีนี้](https://www.thaipbs.or.th/news/content/353183), published 2025-06-13. Evidence for event-led headline, summary box, date-led body, titles/names, and formal attribution.
2. Thai PBS, [คู่มือมาตรฐานและแนวปฏิบัติสำหรับงานข่าวและสื่อสารมวลชน](https://www.thaipbs.or.th/org/privacy-policy/professional-journalism-ethics-toolkit/), page current when accessed; publication date not shown. Official index for its newsroom standards toolkit.
3. Thai PBS, [ข้อบังคับว่าด้วยจริยธรรมของวิชาชีพเกี่ยวกับการผลิตและเผยแพร่รายการ พ.ศ. 2552](https://bog.thaipbs.or.th/wp-content/uploads/2016/06/%E0%B9%91.%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%9A%E0%B8%B1%E0%B8%87%E0%B8%84%E0%B8%B1%E0%B8%9A-%E0%B8%A7%E0%B9%88%E0%B8%B2%E0%B8%94%E0%B9%89%E0%B8%A7%E0%B8%A2%E0%B8%88%E0%B8%A3%E0%B8%B4%E0%B8%A2%E0%B8%98%E0%B8%A3%E0%B8%A3%E0%B8%A1%E0%B8%82%E0%B8%AD%E0%B8%87%E0%B8%A7%E0%B8%B4%E0%B8%8A%E0%B8%B2%E0%B8%8A%E0%B8%B5%E0%B8%9E%E0%B9%80%E0%B8%81%E0%B8%B5%E0%B9%88%E0%B8%A2%E0%B8%A7%E0%B8%81%E0%B8%B1%E0%B8%9A%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%9C%E0%B8%A5%E0%B8%B4%E0%B8%95%E0%B9%81%E0%B8%A5%E0%B8%B0%E0%B9%80%E0%B8%9C%E0%B8%A2%E0%B9%81%E0%B8%9E%E0%B8%A3%E0%B9%88%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%81%E0%B8%B2%E0%B8%A3-%E0%B8%9E.%E0%B8%A8.-255214-01-52.pdf), issued 2009. Official requirements for factual accuracy, careful language/presentation, checking, independence, fairness, and harm-aware reporting.
4. Thai Rath Online, [เกาะติดผลนับคะแนนสด เลือกตั้งซ่อมหลักสี่ ไทยรัฐออนไลน์ ครบแล้ว 100%](https://www.thairath.co.th/news/politic/2299060), published 2022-01-30. Evidence for urgency/update language and stage-compressing hyphens.
5. Thai Rath Online video, [แกะรอย แก้เกมโกง แฉระบอบโกงราชการเทา](https://www.thairath.co.th/video/channel/thairath-news/news-update/1187246), published 2026-08-01. Evidence for compact parallel verbs, explainer lead, hashtags, and a separate follow/subscribe block.
6. THE STANDARD, [สะพายกล้องตามรอย ‘5 Best Spot in Bangkok’...](https://thestandard.co/5-best-spot-in-bangkok/), published 2023-01-18. Evidence for crafted headline, highlights, editorial self-reference, selective direct address, and invitation framing.
7. THE STANDARD, [เปิดสาระ กฎหมายประชามติ ปี 68...](https://thestandard.co/referendum-law-2568-info/), published 2025. Evidence for `เปิดสาระ`, concise relevance framing, and explicit invitation to explore.
8. Longtunman, [อธิบายสรุป DEATH LOOP...](https://www.longtunman.com/56382), published 2025-01-20. Evidence for surprising comparison, question-led setup, short lines, and recurring narrator transition.
9. Longtunman, [“เวลา” แต้มต่อการลงทุนเดียว ของคนธรรมดา](https://www.longtunman.com/67333), published 2026. Evidence for everyday-reader framing, segmented rhythm, numbered model, and contrast.
10. THE MATTER, [เกิดอะไรขึ้นในซูดาน? ชวนเข้าใจ ‘สงครามที่ถูกลืม’...](https://thematter.co/brief/227155/227155), published 2024. Evidence for question-led social explainer and invitation framing.
11. BrandThink, [ไทยไหมนะ หรือไม่ไทย?](https://www.brandthink.me/content/code-thai-12), published 2022-07-19. Evidence for colloquial question, inclusive pronouns, quoted concepts, repeated contrast, and campaign hashtag/CTA.
12. TODAY official Facebook page, [ทองมีโอกาสแตะ 55,000 บาทปลายปีนี้ เข้า-ออกตอนไหนดี?](https://www.facebook.com/TODAYth.FB/posts/1060245369260744/), published 2025-04-01. Evidence for question headline, fact-led lead, bracketed subheading, dot-line separators, website CTA, and closing hashtags.

### Technology and developer writing

13. BorntoDev, [Conventional Commits เขียน Commit ยังไงให้คน และ คอมพิวเตอร์เข้าใจ ?](https://www.borntodev.com/2024/01/01/conventional-commits/), published 2024-01-01, and [GitLab CI/CD สำหรับมือใหม่](https://www.borntodev.com/2024/04/06/gitlab-ci-cd-%E0%B8%AA%E0%B8%B3%E0%B8%AB%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%A1%E0%B8%B7%E0%B8%AD%E0%B9%83%E0%B8%AB%E0%B8%A1%E0%B9%88/), published 2024-04-06. Evidence for beginner-aware questions, stable English technical terms, named components, code-first examples, sequential explanation, and observable outcomes.
14. KBTG Life, [มาลองสร้าง AI ผู้ช่วยของเราสำหรับช่วยจดบันทึกรายรับรายจ่าย Part 1](https://medium.com/kbtg-life/%E0%B8%A1%E0%B8%B2%E0%B8%A5%E0%B8%AD%E0%B8%87%E0%B8%AA%E0%B8%A3%E0%B9%89%E0%B8%B2%E0%B8%87-ai-%E0%B8%9C%E0%B8%B9%E0%B9%89%E0%B8%8A%E0%B9%88%E0%B8%A7%E0%B8%A2%E0%B8%82%E0%B8%AD%E0%B8%87%E0%B9%80%E0%B8%A3%E0%B8%B2%E0%B8%AA%E0%B8%B3%E0%B8%AB%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%8A%E0%B9%88%E0%B8%A7%E0%B8%A2%E0%B8%88%E0%B8%94%E0%B8%9A%E0%B8%B1%E0%B8%99%E0%B8%97%E0%B8%B6%E0%B8%81%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%A3%E0%B8%B2%E0%B8%A2%E0%B8%88%E0%B9%88%E0%B8%B2%E0%B8%A2-part-1-9590e098675a), published 2026-01-08, and [AI-Driven Development Life Cycle](https://medium.com/kbtg-life/ai-driven-development-life-cycle-0932218cfe81), published 2026-04-20. Evidence for practitioner-to-practitioner framing, stable English engineering vocabulary, option contrast, phased workflows, light humor, and explicit production/accountability caveats.
15. odds.team, [กว่าจะมาเป็น polyglot programmer](https://medium.com/odds-team/%E0%B8%81%E0%B8%A7%E0%B9%88%E0%B8%B2%E0%B8%88%E0%B8%B0%E0%B8%A1%E0%B8%B2%E0%B9%80%E0%B8%9B%E0%B9%87%E0%B8%99-polyglot-programmer-ef3adfd6d9d1), published 2020-11-16, and [Release planning](https://medium.com/odds-team/release-planning-86c30c273a68), published 2022-04-11. Evidence for candid practitioner chronology, technical terms embedded in colloquial Thai, constraints and mistakes, observed results, and reusable engineering lessons.

### Creators

16. Point of View verified YouTube, [เริ่มอ่านนิยายภาษาอังกฤษยังไงดี #วิวเอ๋ยบอกข้าเถิด ep.1](https://www.youtube.com/watch?v=tya5wUUrB_s), uploaded 2017-03-01. Evidence for practical-question title, recurring series packaging, creator-name self-reference, light particle, audience question CTA, and cross-channel links.
17. Point of View verified YouTube, [ทำไมคนเราพูดคนละภาษา?](https://www.youtube.com/watch?v=M4N2he9BSic), uploaded 2021-07-16. Evidence for question-led edutainment, references, chaptered story/analysis structure, and professional contact separation.
18. Kaykai Salaider verified YouTube, [แก๊งสไลเดอร์ กลับมาแล้ว](https://www.youtube.com/watch?v=BPxxAOWtcA0), uploaded 2026-03-13. Evidence for friend-group pronouns, isolated short lines, vowel stretching, playful spelling, emoji, exclamation marks, and collective subscriber CTA.
19. Kate Ozmen official Facebook profile, [มาทำความรู้จักหนุ่มตุรกีกันให้มากขึ้นกันค่ะ](https://www.facebook.com/kateozmen/posts/709300863256142/), published 2020-05-05. Evidence for a lifestyle creator's invitation, nickname self-reference, personal anecdote, numbered explanation, colloquial intensifiers, particles, parenthetical aside, and emoji.

### Language and rights

20. Office of the Royal Society of Thailand, [หลักเกณฑ์การใช้เครื่องหมายวรรคตอนและเครื่องหมายอื่น ๆ / หลักเกณฑ์การเว้นวรรค](https://www.orst.go.th/iwfm_list.asp?i=0040002104011001%2F63ERK0317031), official reference page; publication date not shown. Baseline for formal punctuation/spacing and the note that context can still require writer judgment.
21. Department of Intellectual Property, Thailand, [กระบวนการยื่นคำขอแจ้งข้อมูลลิขสิทธิ์](https://ipthailand.go.th/th/copyright-002-1.html), page dated 2017-04-18 and current when accessed. Official explanation of original expression, protected work categories, and excluded ideas/methods/mere news facts.
22. WIPO, [What Can I Protect with a Copyright?](https://www.wipo.int/en/web/copyright/protection), current when accessed; publication date not shown. Primary international guidance on expression versus ideas/methods and examples of protected works.
23. U.S. Copyright Office, [Copyright and Artificial Intelligence, Part 1: Digital Replicas](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-1-Digital-Replicas-Report.pdf), published 2024, especially pp. 53–55. Primary discussion of style imitation, identity/market/attribution concerns, and the limited role of copyright in protecting style as such.
24. Department of Intellectual Property, Thailand, [Copyright Act B.E. 2537 and amendments through B.E. 2565](https://www.ipthailand.go.th/images/3534/2565/Copyright/Copyright_Act_TH_2537-2565.pdf), official consolidated Thai text. Sections 6–7 distinguish protected expression from ideas/methods and bare daily-news facts; Section 32 sets limits around uses that conflict with normal exploitation or unreasonably prejudice the rights owner.
25. ETDA, [Generative AI Governance Guideline for Organizations, v2.0](https://www.etda.or.th/getattachment/6050a4b7-defd-4dba-8cbc-ff6a444a3d08/20241125-Generative-AI-Guideline_V2-0.pdf.aspx), file dated 2024-11-25. Official guidance on privacy, misinformation, IP similarity, identity misuse, human oversight, validation, and accountability.
26. Office of the Consumer Protection Board, [OCPB issues warning about advertisements using celebrities, influencers, or AI-generated imagery](https://www.ocpb.go.th/news_view_en.php?nid=16705), published 2025-07-27. Official warning relevant to false endorsement and misleading commercial copy.
27. Royal Gazette, [Personal Data Protection Act B.E. 2562](https://ratchakitcha.soc.go.th/documents/17082307.pdf), published 2019-05-27. Primary Thai law for consent, lawful collection/use/disclosure, indirect collection, and sensitive personal data.
28. National Press Council of Thailand, [Guideline on the use of social media by mass-media organizations](https://www.presscouncil.or.th/regulation/9006), dated 2019-12-19. Guidance on source verification, balance, privacy and dignity, non-distorting summaries, time-aware updates, attribution, and correction.
29. Thitichaya Sonkaew, University of Southampton, [Thais' writing in English on Facebook: Language choice and perceptions of multilingual writing](https://eprints.soton.ac.uk/420374/), doctoral thesis, published 2018-03. Evidence for audience-dependent multilingual and multimodal practice, particles, `555`, romanized Thai, and accommodation.
30. Caroline Tagg and Philip Seargeant, Open Research Online, [Writing systems at play in Thai-English online interactions](https://oro.open.ac.uk/32909/), published 2012. Evidence for code/script switching and orthographic variation as interpersonal and identity work.
31. Pailin Jintanawong and S. Khattiya, RSU International Research Conference, [Thai and English Code-Mixing on Instagram by Thai Users](https://rsucon.rsu.ac.th/2020/paper/1636), published 2020. Evidence for lexical insertion, translation, repetition, specialized features, net-culture switching, emotion, and identity.
32. วันจรัตน์ เดชวิลัย, โสพิตา สุขช่วย, and สิรินดา โอศิริ, Mahasarakham University journal platform, [ปัจจัยและการเปลี่ยนแปลงลักษณะการใช้ภาษาไทยในสื่อสังคมออนไลน์แห่งยุควิถีใหม่](https://so02.tci-thaijo.org/index.php/etcedumsujournal/article/view/266486), published 2024-03-17. Thai sociolinguistic review of speaker-, society-, technology-, sound-, word-, and meaning-level change in online Thai.
