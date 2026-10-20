---
name: meeting-secretary
description: Records and transcribes a live meeting fully on-device (macOS, Thai and English by default, transcribe.cpp with Qwen3-ASR) and acts as the user's real-time meeting secretary — every 20 s chunk of speech lands in the chat, and Claude answers questions people ask (even when nobody asks Claude), checks statuses, figures and decisions against the project's own sources, flags contradictions, and logs action items. When the meeting ends, it re-transcribes the recording, fact-checks every claim, and writes a meeting note with path:line evidence. Also builds the project's speech-recognition vocabulary. Trigger on "/start-meeting", "/end-meeting", "/meeting-vocab", "start the meeting", "record this meeting", "transcribe this call live", "be my secretary for this call", "listen in on this meeting", "meeting is over", "stop recording", "write up the meeting", "meeting notes please", "summarize the meeting", "update the meeting vocab", or any request to transcribe, assist during, or write up a live meeting or call.
---

# meeting-secretary — live transcript, real-time secretary, fact-checked note

The user is in a meeting and watches this chat on a side screen. Your job is what a
sharp secretary who knows the whole project would do: hear everything, and when
something comes up that the project already knows — a status, a figure, a decision, a
PR, a runbook — put it in front of the user *while it still matters*. Afterwards, write
the note the team acts on, with every claim checked against a source.

Recording and transcription run locally (transcribe.cpp + Qwen3-ASR-1.7B, biased by a
vocab prompt). No audio leaves the Mac.

## Pick the phase

| The user wants | Read and follow |
|---|---|
| To start recording / be the live secretary (`/start-meeting`) | [reference/live.md](reference/live.md) |
| To stop and get the meeting note, or a note for an earlier meeting (`/end-meeting`) | [reference/wrap-up.md](reference/wrap-up.md) |
| To build or refresh the recognizer vocabulary (`/meeting-vocab`) | [reference/vocab.md](reference/vocab.md) |
| First run, or the script reports `missing:` / a permission error | [reference/setup.md](reference/setup.md) |

Read only the file for the phase at hand; the live phase is time-critical.

## The script

`scripts/meeting.py` in this skill's base directory does all recording and
transcription. Below, `MEETING` means `python3 <skill base dir>/scripts/meeting.py`,
with the absolute path written out. Run it from the project root: it puts meeting data
under the project it finds there.

| Command | Does |
|---|---|
| `MEETING status` | Is a meeting recording; chunk and line counts; last 3 lines |
| `MEETING start NAME [--device D]... [--lang th] [--app APP [--window T] \| --screen N [--screen-crop W:H:X:Y]]` | Start the detached recorder; prints JSON with `transcript` and `log` paths |
| `MEETING windows` | List app windows (id, app, title, size) for `--app` / `--window` |
| `MEETING snap (N \| --app APP [--window T])` | One preview frame; JSON with `png` and `blank` |
| `MEETING stop` | Stop the recorder; waits for the last chunk's transcript |
| `MEETING final [NAME]` | Join chunks and re-transcribe in 30 s windows → `transcript-final.md` |
| `MEETING frame NAME HH:MM:SS... [--span S --step S]` | PNGs from `screen.mp4` at wall-clock times |
| `MEETING vocab [NAME]` | Vocab files in play, term counts, prompt size |
| `MEETING start NAME --replay WAV [--rate 4] [--started HH:MM]` | Feed a recording through the live pipeline (testing, or a meeting recorded elsewhere) |

Run every command from the same project directory: the data root and the running
meeting are found from it, so a `stop` from elsewhere reports "no active meeting"
while the recorder keeps going. Env vars (`MEETING_HOME`, `MEETING_DEVICE`,
`TCPP_HOME`) are in [reference/setup.md](reference/setup.md).

## Where things live

Data root: `$MEETING_HOME`, else `<project>/.meetings/` (project = git top level). The
script writes a `.gitignore` of `*` into the root on first use, so audio and
transcripts never get committed. Each meeting is `<root>/<NAME>/`:

- `chunks/*.wav` (20 s, 16 kHz mono), `full.wav` — raw audio
- `transcript-live.md` — `[HH:MM:SS] text`, one line per chunk, wall clock
- `transcript-final.md` — `[mm:ss | HH:MM:SS] text`, the accurate 30 s re-pass
- `live-notes.md` — your running log of flags during the meeting
- `recorder.log`, `meta.json`, optional `screen.mp4` and `frames/`
- `vocab-extra.txt` — this meeting's extra terms; `summary.md` — the note

Never copy transcripts, audio or frames into tracked project folders.

## Project sources and ground truth

Before the meeting, learn what this workspace keeps: `CLAUDE.md` / `AGENTS.md`, the
README, `docs/`, plans and handoffs (`.planning/`, `plans/`, ADRs), the memory index if
one is loaded, a wiki, the code on the default branch, and earlier notes in the data
root. Use what exists; do not invent sources.

For "is it live / what does it do / what was agreed", trust sources in this order:

1. Code on the default branch (usually what production runs) and release tags
2. Deploy and release records (changelogs, release notes, deploy memory or runbooks)
3. Reference docs, runbooks, ADRs
4. Plans, handoffs, wiki pages
5. A remark in an earlier meeting

Counts and amounts that live only in a database or dashboard are never answered from
notes or memory: queue them for the user.

## Boundaries

- Meeting audio is private conversation and may contain personal data. Never post to
  Slack, email, an issue tracker or any outside service from this skill, and never
  paste transcript text into a prompt for an external model CLI (codex, gemini, and
  the like). Sending the note anywhere is a separate request from the user.
- Edit nothing outside the meeting folder, except the vocab files in
  [reference/vocab.md](reference/vocab.md) when asked to build them.
- ASR is imperfect, worst on numbers and names. Say so when a flag rests on one
  heard number or name.
