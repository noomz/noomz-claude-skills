# Wrap-up phase — /end-meeting

The meeting note is what the team acts on. A wrong "already on prod" or a misheard
figure in a note becomes a wrong release or a wrong decision later, so the note is only
as good as its evidence: every status, money or data claim says whether a source backs
it, and where.

## 1. Stop and transcribe accurately

1. `MEETING stop` — prints `{"name", "dir", "stopped": true}`. If it says "no active
   meeting", the user may mean an earlier meeting; use the name they give, or the newest
   folder with a `meta.json` (`ls` the data root; it is hidden from search). If it
   prints `"stopped": false`, the recorder is still finishing a chunk: run `stop` once
   more, and if that fails too, tell the user the pid and ask before `kill`. Do not
   run `final` while the recorder is alive.
2. Stop re-arming the transcript Monitor (and stop it with TaskStop if still running).
3. `MEETING final <name>` with `run_in_background: true`. It joins the chunks into
   `full.wav` and re-transcribes in 30 s windows (about 4 s per minute of audio on
   Apple Silicon — ~4 min for an hour). Output: `transcript-final.md`, lines
   `[mm:ss | HH:MM:SS] text`. While it runs, read `live-notes.md` and start on the
   🔎 queued checks (step 3).

Check the artifact, not the exit code: `transcript-final.md` exists, its line count is
about duration / 30 s, and few lines are `(missing)` or `(silence)`.

## 2. Read and reconcile

Read `transcript-final.md` in full (≈35 k characters per hour — read it all, it is the
source). Use `transcript-live.md` as a second witness:

- Where the two disagree on a **number, name, date, id or issue number**, the figure is
  uncertain — mark it (?) and quote both.
- ASR does not identify speakers. Attribute a statement only when the speaker is named
  or obvious from context ("พี่สมชาย ช่วยเช็ค…" → the owner is Somchai); otherwise write
  "someone asked".
- Thai ASR spells English loanwords in Thai script ("ดีพลอย" = deploy, "สเตจจิ้ง" =
  staging, "พีอาร์" = PR). Normalize these in the note, never in quotes you use as
  evidence.

## 3. Fact-check every claim that touches status, money or data

List the claims: decisions, figures, rules, dates, "X is already on prod", "X was agreed
before", plus every 🔎 item in `live-notes.md`. For each, search the sources in the
ground-truth order from SKILL.md. Read-only network calls are fine now (`gh pr view`,
`gh issue view`); use the GitHub account the project's instructions name, if any.

Figures that live only in a database: do not query production for a meeting note unless
the user asks — tag them `[meeting only]` and list them as open questions.

Tag each claim `[doc: confirmed path:line]`, `[doc: contradicts path:line]`, or
`[meeting only]`. A recorded decision beats a meeting remark; say so in "Corrections".
When there are more than ~10 claims, hand the list to ONE subagent on a mid-tier model
(brief = claim list + the source order + "return claim | tag | path:line | one-line
note") and keep writing the rest of the note meanwhile. The brief holds claims, not
transcript text, and never goes to an external model CLI.

## 3b. Screen frames (only when `screen.mp4` exists)

Pull frames for the moments the note will cite — each decision, ⚠️ item and action
item, using the wall-clock stamp from the transcript:

```bash
MEETING frame <name> 14:32:10 14:40:00 [--span 10 --step 10]
```

PNGs land in `frames/HHMMSS.png`, accurate to about ±1 s. Use `--span` when the slide
may have changed just before or after the words. In app mode, check `recorder.log` for
`window not found` spans: frames inside one repeat the last image and must not be cited
as what was on screen then. `Read` a frame only when you need its content for the note
(a figure on a slide, the page under discussion); otherwise just link it. Check what a
frame shows before linking it: if it shows personal data or an unrelated window, do not
link it and say so in the readout.

## 4. Write the note

Write `<root>/<name>/summary.md` from `assets/note-template.md` in this skill. If
`summary.md` already exists, write `summary-v2.md` and list the changes at the bottom —
never overwrite a note.

- Times come from the wall-clock half of the final transcript stamps.
- Keep the exact figure as spoken next to the normalized one when they differ.
- Write in the language the user works in (plain English B1–B2 by default), domain
  terms kept in English. Names and quotes stay as spoken.
- Cite issues as repo + number + plain title, never a bare `#N`.
- Empty sections: write "none heard" rather than dropping the heading, so a reader
  knows it was checked.

**Proposed follow-ups**: memory updates, plan edits and issues for new or reversed
decisions. One line each, no personal data. Put them in the note's table only. Never
write memory, plans or the issue tracker from this skill — the user approves first.

## 5. Report back in chat

A short readout:
- note path, meeting length, number of decisions / action items / open questions
- fact-check counts: confirmed / contradicts / meeting-only / uncertain (?)
- every `[doc: contradicts]` item, one line each — these need the user's attention
- the proposed follow-ups, and ask (AskUserQuestion) which to apply
- one line: raw audio (and `screen.mp4`, if recorded) location and size (private
  material; the user decides when to delete)

Then stop. Sending the note to chat, email or an issue tracker is a separate request.
