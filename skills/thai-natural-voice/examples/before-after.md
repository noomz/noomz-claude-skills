# Before and after

All examples are original and illustrate transformations, not source imitation.

## General assistant

**Prompt:** Tell the user that you found the cause and can fix it after they confirm the intended behavior.

**Translation-shaped:**

> ฉันได้ทำการค้นพบสาเหตุของปัญหาเรียบร้อยแล้ว อย่างไรก็ตาม ก่อนที่จะดำเนินการแก้ไข ฉันต้องการให้คุณยืนยันพฤติกรรมที่คุณคาดหวังเสียก่อน

**Natural:**

> เจอสาเหตุแล้วครับ แต่ก่อนแก้ ขอเช็กพฤติกรรมที่ต้องการให้ตรงกันก่อนนิดหนึ่ง

**Why it moves:** drops ceremonial verbs and repeated pronouns; preserves the dependency between confirmation and action.

## Work chat

**Prompt:** Ask a colleague to review a file by Friday because Monday's launch depends on it.

**Translation-shaped:**

> โปรดดำเนินการตรวจสอบไฟล์ดังกล่าวภายในวันศุกร์ เนื่องจากการเปิดตัวในวันจันทร์ขึ้นอยู่กับการตรวจสอบของคุณ ขอบคุณสำหรับความร่วมมือ

**Natural:**

> รบกวนช่วยรีวิวไฟล์นี้ภายในวันศุกร์นะครับ จะได้แก้รอบสุดท้ายทันก่อนปล่อยวันจันทร์ ขอบคุณครับ

**Why it moves:** asks directly, gives a practical reason, and uses particles at the request and close.

## Coding-agent update

**Prompt:** Explain that the empty-user bug is fixed and report the verification status.

**Translation-shaped:**

> ฉันได้ดำเนินการแก้ไขปัญหาที่เกิดขึ้นกับผู้ใช้งานที่มีค่าว่างเป็นที่เรียบร้อยแล้ว โดยได้ทำการปรับปรุงกระบวนการแปลงข้อมูลและเพิ่มการทดสอบที่เกี่ยวข้อง ผลการทดสอบทั้งหมดประสบความสำเร็จ

**Natural:**

> แก้แล้วครับ สาเหตุคือ `userId` ถูกแปลงเป็น number ก่อนตรวจค่าว่าง ทำให้ `''` กลายเป็น `0` ตอนนี้ย้าย validation มาไว้ก่อนแปลงค่า และเพิ่ม test สำหรับเคสนี้แล้ว—ชุด test ผ่านทั้งหมด

**Why it moves:** leads with status, preserves the identifier and input exactly, connects cause to change, and names what was actually verified.

## Explainer post

**Prompt:** Explain that a feature with high usage can still be a poor business investment.

**Translation-shaped:**

> ในยุคดิจิทัลปัจจุบัน ปฏิเสธไม่ได้ว่าจำนวนผู้ใช้งานเป็นตัวชี้วัดที่มีความสำคัญ อย่างไรก็ตาม การมีจำนวนผู้ใช้งานสูงไม่ได้หมายความว่าฟีเจอร์นั้นจะสร้างคุณค่าทางธุรกิจได้เสมอไป

**Natural:**

> คนใช้เยอะ ไม่ได้แปลว่าควรลงทุนต่อเสมอไป
>
> ต้องดูอีกสองเรื่อง: คนกลุ่มนั้นยอมจ่ายไหม และฟีเจอร์ช่วยให้ธุรกิจเก็บลูกค้าไว้ได้นานขึ้นหรือเปล่า ถ้าคำตอบคือไม่ ยอดใช้งานสูงก็อาจเป็นแค่ความคึกคักที่ไม่กลายเป็นรายได้

**Why it moves:** leads with the contrast, names the decision criteria, and replaces abstract praise with observable business effects.

## Neutral update

**Prompt:** Announce a two-hour service outage caused by maintenance.

**Translation-shaped:**

> เราขอแจ้งให้ผู้ใช้งานทุกท่านทราบว่า ระบบจะไม่สามารถใช้งานได้เป็นการชั่วคราวเนื่องจากมีการดำเนินการบำรุงรักษาระบบตามกำหนดการ

**Natural:**

> ระบบจะปิดปรับปรุงวันที่ 12 ต.ค. เวลา 01.00–03.00 น. ระหว่างนี้จะเข้าสู่ระบบและบันทึกข้อมูลไม่ได้ ข้อมูลเดิมไม่สูญหาย และจะเปิดให้ใช้งานอีกครั้งหลัง 03.00 น.

**Why it moves:** replaces institutional padding with time, impact, reassurance, and recovery.

## Culture caption

**Prompt:** Introduce a post about why people rewatch old series.

**Translation-shaped:**

> ในโลกที่เต็มไปด้วยคอนเทนต์ใหม่ ๆ มากมาย การกลับไปดูซีรีส์เรื่องเดิมอาจเป็นมากกว่าเพียงความบันเทิง แต่ยังเป็นการเชื่อมโยงกับความทรงจำและความรู้สึกในอดีตอีกด้วย

**Natural:**

> มีซีรีส์ใหม่ให้ดูทุกสัปดาห์ แต่สุดท้ายเราก็กดกลับไปหาเรื่องเดิม
>
> อาจไม่ใช่เพราะไม่มีอะไรดู แต่อยากกลับไปอยู่กับความรู้สึกที่เดาได้—รู้ว่าใครจะมา รู้ว่าตอนไหนจะร้องไห้ และรู้ว่าคราวนี้เราจะผ่านมันไปได้

**Why it moves:** starts from a recognizable action, limits the contrast template to one useful turn, and closes on a concrete emotional implication.

## Review

**Prompt:** Review a compact keyboard that is pleasant to type on but awkward for spreadsheets.

**Translation-shaped:**

> คีย์บอร์ดนี้มอบประสบการณ์การพิมพ์ที่ยอดเยี่ยมและมีดีไซน์ที่สวยงาม อย่างไรก็ตาม อาจไม่ตอบโจทย์ผู้ใช้งานที่ต้องใช้งานสเปรดชีตเป็นประจำ

**Natural:**

> พิมพ์สนุก เสียงไม่ดัง และวางบนโต๊ะเล็กได้พอดี แต่ตัดปุ่มตัวเลขออกไป คนที่ทำสเปรดชีตทั้งวันน่าจะหงุดหงิด เหมาะกับงานเขียนกับแชตมากกว่า

**Why it moves:** replaces generic evaluation with observable qualities and a clear fit judgment.
