# Voice profiles

## Contents

- [How to select](#how-to-select)
- [คุยรู้เรื่อง](#คุยรู้เรื่อง)
- [มืออาชีพเป็นกันเอง](#มืออาชีพเป็นกันเอง)
- [คู่คิดสายเทค](#คู่คิดสายเทค)
- [เพื่อนสรุปให้](#เพื่อนสรุปให้)
- [นักเล่าสาระสนุก](#นักเล่าสาระสนุก)
- [ข่าวตรงประเด็น](#ข่าวตรงประเด็น)
- [ข่าวไว](#ข่าวไว)
- [ชวนคิดร่วมสมัย](#ชวนคิดร่วมสมัย)
- [รีวิวบอกต่อ](#รีวิวบอกต่อ)
- [แอดมินชวนคุย](#แอดมินชวนคุย)
- [Blending profiles](#blending-profiles)

## How to select

Choose by the reader's contract with the text, not by topic alone.

| Reader expects… | Profile |
|---|---|
| a clear, human answer | `คุยรู้เรื่อง` |
| a competent colleague or service person | `มืออาชีพเป็นกันเอง` |
| a technical teammate who shows evidence and next action | `คู่คิดสายเทค` |
| to understand a complex story quickly | `เพื่อนสรุปให้` |
| researched learning with spoken energy | `นักเล่าสาระสนุก` |
| verified facts without performance | `ข่าวตรงประเด็น` |
| the newest confirmed development | `ข่าวไว` |
| an idea worth pausing over | `ชวนคิดร่วมสมัย` |
| a useful first-hand-style assessment | `รีวิวบอกต่อ` |
| participation and light entertainment | `แอดมินชวนคุย` |

Do not infer a first-hand experience merely because the review profile is selected. If the writer did not experience the thing, frame the text as a recommendation, summary, or synthesis.

## คุยรู้เรื่อง

**Contract:** sound like a thoughtful Thai peer who gets to the point without becoming blunt.

**Shape:** answer → necessary context → next step.

**Language controls:**

- Use ordinary verbs and compact paragraphs.
- Omit obvious subjects.
- Use `ครับ/ค่ะ` at the relational edges if the user's register calls for it.
- Prefer `ถ้า…`, `ลอง…`, `ตรงนี้…`, `สรุปคือ…` over formal transitions.
- Ask a follow-up only when the missing information changes the answer materially.

**Avoid:** customer-service cheerfulness, constant `คุณ`, essay conclusions, unnecessary headings.

**Micro-example:**

> ได้ครับ ส่งไฟล์มาได้เลย เดี๋ยวช่วยเกลาให้เป็นไทยธรรมชาติขึ้น โดยคงความหมายและระดับความสุภาพเดิมไว้

## มืออาชีพเป็นกันเอง

**Contract:** make the action easy while protecting face and accountability.

**Shape:** purpose/action → essential detail → deadline or owner → warm close.

**Language controls:**

- Put the request or decision near the top.
- Use names, roles, dates, and owners when ambiguity would create work.
- Soften with reason or choice, not with layers of ceremonial wording.
- Use `รบกวน`, `ขอ`, and `ช่วย` only where a real request exists.
- Keep apology proportional: acknowledge impact, state repair, give the next update.

**Avoid:** `ทางทีมได้ดำเนินการ`, `เรียนมาเพื่อโปรดทราบ`, repeated `นะครับ/นะคะ`, vague `โดยเร็วที่สุด` when a date is available.

**Micro-example:**

> ขอเลื่อนรีวิวจากบ่ายสองเป็นสี่โมงครับ ข้อมูลยอดขายรอบสุดท้ายจะเข้าตอนบ่ายสาม ถ้าเวลานี้ไม่สะดวก ส่งคอมเมนต์ไว้ในไฟล์ก่อนได้เลย

## คู่คิดสายเทค

**Contract:** collaborate like a capable Thai engineering teammate: lead with the outcome, keep technical literals exact, and make the evidence easy to inspect.

**Shape:** outcome or status → cause/evidence → change or command → verification, risk, or next action.

**Language controls:**

- Use Thai for reasoning, causality, uncertainty, and decisions; retain established English technical terms when they are more precise.
- Wrap identifiers, commands, filenames, paths, API names, and error text in backticks or code blocks. Never transliterate them into Thai.
- Fit retained English nouns into Thai grammar and counting, such as `test ผ่าน 42 เคส`.
- Separate observation from inference: `เจอว่า...` for evidence, `น่าจะเกิดจาก...` for a hypothesis, and `ยืนยันแล้วว่า...` only after a check.
- For teaching, use term → purpose → smallest useful example → expected result.
- For debugging, use symptom → cause → fix → verification. State plainly when tests were not run or a result remains uncertain.
- Keep particles at conversational edges, not after every status line or bullet.

**Avoid:** ceremonial progress reports, translating canonical names inconsistently, claiming success before verification, dumping raw logs without interpretation, or explaining familiar terms to an expert audience.

**Micro-example:**

> เจอสาเหตุแล้วครับ: `userId` ถูกแปลงเป็น number ก่อนตรวจค่าว่าง ทำให้ `''` กลายเป็น `0` แก้ให้ตรวจ input ก่อนแปลงและเพิ่ม test สำหรับค่าว่างแล้ว ตอนนี้ชุด test ผ่านทั้งหมด

## เพื่อนสรุปให้

**Contract:** turn a dense topic into a story the reader can follow and retell.

**Shape:** concrete hook → why it matters → facts in causal order → implication.

**Language controls:**

- Start with a number, contrast, familiar situation, or one genuine question.
- Keep one main idea per paragraph.
- Explain technical terms at first use without slowing the story.
- Use rhetorical questions as hinges, normally no more than two in a short post.
- Let numbers and examples do the persuasive work.
- End on the consequence for the reader, market, or next decision.

**Avoid:** suspense that hides the answer too long, a branded catchphrase, false certainty, motivational moral pasted onto unrelated facts.

**Micro-example:**

> ค่าส่งถูกลง แต่ทำไมยอดสั่งยังไม่โต?
>
> เพราะลูกค้าไม่ได้ติดที่ราคาอย่างเดียว รอบนี้สิ่งที่หายไปคือร้านใกล้บ้าน: จำนวนร้านในรัศมี 3 กิโลเมตรลดลงเกือบครึ่ง ต่อให้ค่าส่งดีขึ้น ตัวเลือกก็ยังไม่พอให้กดสั่ง

## นักเล่าสาระสนุก

**Contract:** carry researched material with the pace and curiosity of a good Thai host.

**Shape:** audience question → quick orientation → story beats or competing explanations → evidence → answer → next curiosity.

**Language controls:**

- Write for the ear: short setup, clear turns, and occasional recap before a dense point.
- Address `ทุกคน` only at openings, transitions, or invitations where the audience relationship needs it.
- Explain sources naturally in the flow, then provide a visible reference list when the format allows.
- Use a light particle or aside to keep spoken warmth; let evidence carry authority.
- Mark chapters, questions, or beats when drafting a script.

**Avoid:** borrowing a host's self-name, show label, intro, sign-off, catchphrase, or audience hashtag; treating energy as permission to simplify away uncertainty.

**Micro-example:**

> ทำไมแผนที่บางฉบับถึงทำให้ประเทศใกล้เส้นศูนย์สูตรดูเล็กกว่าความจริง?
>
> คำตอบไม่ได้อยู่ที่คนวาด แต่อยู่ที่โจทย์ยากตั้งแต่ต้น: เรากำลังพยายามคลี่โลกทรงกลมลงบนกระดาษแผ่นเดียว พอรักษาทิศทางไว้ ขนาดก็ต้องยอมเพี้ยน—และแต่ละวิธีเลือกเพี้ยนไม่เหมือนกัน

## ข่าวตรงประเด็น

**Contract:** help the public know what happened, who says so, and what it changes.

**Shape:** actor + action + impact → source/time → evidence/context → what follows.

**Language controls:**

- Put a specific verb in the headline or first sentence.
- Attribute information early: `กระทรวง…ระบุ`, `ศาลมีคำสั่ง`, `จากข้อมูล ณ…`.
- Use exact dates, places, quantities, and status.
- Separate source claims from the newsroom's synthesis.
- Use neutral written endings; omit emoji and promotional CTA.
- Include public action only when useful: where to check, whom to contact, what to avoid.

**Avoid:** anonymous authority (`มีรายงานว่า`) when a source exists, emotional adjectives, clickbait questions, treating an allegation as fact.

**Micro-example:**

> กทม.ปิดสะพานข้ามแยก A คืนวันที่ 8–10 ต.ค. เพื่อซ่อมผิวจราจร
>
> การปิดทางเริ่มเวลา 22.00–05.00 น. ผู้ใช้รถสามารถเลี่ยงไปใช้ถนน B ได้ตามแผนที่ที่ กทม.เผยแพร่

## ข่าวไว

**Contract:** deliver the newest confirmed fact without making a developing event sound settled.

**Shape:** update label/time → newest fact → source → known/unknown → next checkpoint.

**Language controls:**

- Lead with `ล่าสุด` or `อัปเดต [เวลา]` only when the information is genuinely new.
- Time-stamp changing numbers.
- Prefer `ยืนยัน`, `ระบุเบื้องต้น`, `อยู่ระหว่างตรวจสอบ`, `ยังไม่พบข้อมูล` according to evidence status.
- Keep background to the minimum needed to understand the update.
- Correct visibly when facts change.

**Avoid:** `ด่วน!` as decoration, prediction, casualty totals without time/source, recycling the same update with a new headline.

**Micro-example:**

> อัปเดต 18.20 น. เจ้าหน้าที่เปิดใช้ถนนฝั่งขาเข้าแล้ว 1 ช่องทาง ส่วนฝั่งขาออกยังปิดระหว่างเคลื่อนย้ายรถ เฝ้ารอประกาศถัดไปจากตำรวจจราจร

## ชวนคิดร่วมสมัย

**Contract:** begin with lived experience, widen the frame, and leave the reader with a sharper question.

**Shape:** recognizable moment → tension or question → social/cultural context → open implication.

**Language controls:**

- Use `เรา` when the experience is plausibly shared, not to force consensus.
- Alternate conversational observations with precise explanation.
- Use one clean metaphor or contrast rather than decorating every paragraph.
- Quote key terms when examining their meaning, not for general emphasis.
- Let the ending resonate or invite thought; it need not resolve everything.

**Avoid:** vague uplift, excessive single quotes around ordinary words, moral superiority, stacking `ในวันที่…` and `สุดท้ายแล้ว…` frames.

**Micro-example:**

> เราเปิดแชตเพื่อคุยกับคนอื่น แต่หลายครั้งกลับจบที่การอ่านข้อความเก่าของตัวเอง
>
> ฟีเจอร์ค้นหาไม่ได้แค่ช่วยจำ มันกำลังเปลี่ยนบทสนทนาให้กลายเป็นคลังชีวิต—และทำให้คำถามเรื่อง “ลืม” ยากขึ้นกว่าเดิม

## รีวิวบอกต่อ

**Contract:** give a verdict a reader can use before spending time or money.

**Shape:** verdict + condition → concrete experience/evidence → trade-off → practical details → fit.

**Language controls:**

- Name sensory or observable specifics instead of `ดีมาก` alone.
- Distinguish taste from fact: `เราชอบ`, `สำหรับคนที่…`, `ถ้าคาดหวัง…`.
- Include price, location, wait, durability, or setup when relevant.
- Use emoji only as section markers when the channel expects them.
- Say who will enjoy it and who may not.

**Avoid:** fake first-person experience, universal claims from one visit, superlatives without comparison, hiding sponsorship or material drawbacks.

**Micro-example:**

> กาแฟเด่นกว่าขนม เอสเปรสโซโทนถั่วชัดแต่ไม่ขมปลาย ร้านนั่งสบายช่วงเช้า พอบ่ายคนแน่นและเสียงค่อนข้างก้อง เหมาะกับแวะคุยมากกว่านั่งประชุมยาว ๆ

## แอดมินชวนคุย

**Contract:** make participation feel easy, current, and socially safe.

**Shape:** playful hook → shared reference → prompt → concrete action.

**Language controls:**

- Use spoken vocabulary and one playful device: exaggeration, sound play, parenthetical aside, or elongation.
- Ask a question people can answer without expertise.
- Match fandom or community vocabulary only when its meaning is clear.
- Keep the CTA specific: comment with one answer, vote, save a date, share a photo.
- Dial playfulness down around conflict, grief, health, money, and power imbalance.

**Avoid:** forced slang, pileups of exclamation marks, baiting communities against each other, sexualized or demeaning nicknames, engagement prompts on sensitive news.

**Micro-example:**

> เปิดโหวตเมนูที่ควรกลับมาแบบถาวร 👀
>
> ทีม A หรือทีม B เลือกได้คนละหนึ่งเมนู พร้อมเหตุผลสั้น ๆ เดี๋ยวแอดมินรวมคะแนนให้พรุ่งนี้เที่ยง

## Blending profiles

Blend only when the channel truly needs two contracts.

- `ข่าวตรงประเด็น` structure + `คุยรู้เรื่อง` surface: explain public information in chat.
- `คู่คิดสายเทค` structure + `คุยรู้เรื่อง` surface: report a small implementation clearly without sounding like a changelog.
- `คู่คิดสายเทค` structure + `เพื่อนสรุปให้` surface: teach a technical concept to a mixed-skill audience.
- `เพื่อนสรุปให้` structure + `ชวนคิดร่วมสมัย` surface: accessible ideas article.
- `มืออาชีพเป็นกันเอง` structure + `แอดมินชวนคุย` surface: low-stakes community announcement.
- `รีวิวบอกต่อ` structure + `คุยรู้เรื่อง` surface: concise recommendation in a conversation.

Do not blend `ข่าวไว` with playful engagement during emergencies. Evidence status and public safety own the tone.
