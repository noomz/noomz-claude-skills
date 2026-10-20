# Live phase — /start-meeting

## 1. Pre-flight (one short exchange, then go)

1. `MEETING status` — if a meeting is already recording, say so and stop; the user
   probably wants /end-meeting first.
2. `MEETING vocab` — if `<project>/.claude/meeting-vocab.txt` does not exist, say in
   one line that `/meeting-vocab` would teach the recognizer this project's names. Do
   not block on it.
3. Settle these. Take them from the user's message when present; otherwise ask ONE
   AskUserQuestion with these as questions, defaults first:
   - **Name**: `YYYY-MM-DD-<topic-slug>` (today's date). It becomes the folder.
   - **Audio input**:
     - In-room meeting → the built-in mic (default `MacBook Pro Microphone`, or
       `$MEETING_DEVICE`).
     - Online call (Teams/Zoom/Meet) → mic **plus** a system-audio loopback device
       (BlackHole, eqMac, Loopback), so remote speakers are recorded clearly: pass
       `--device` twice.
     - List devices if unsure: `ffmpeg -hide_banner -f avfoundation -list_devices true -i ""`.
   - **Language**: `--lang th` is the default and handles Thai with English terms
     mixed in. Pass another code (`en`, `ja`, ...) for a meeting in that language.
   - **Screen video** (optional, default off): 1 fps video (~35 MB/hour) so
     /end-meeting can show what was on screen at each decision. Useful for online
     calls with slides or a shared screen; skip for in-room talk. Two modes:
     - **One app window** (preferred): `--app "Microsoft Teams" [--window <title
       substring or id>]`. Records only that window's pixels — even when other windows
       cover it or it sits on another space — so chat apps and other work never get
       in. `MEETING windows` lists windows; call apps have several (chat, activity,
       the call), so pick the call window by title or id once the call is open.
       Without `--window` it takes the app's largest visible window.
     - **Whole display**: `--screen N` (`0` = main, `1` = second). Records everything
       on it; crop with `--screen-crop` if needed.
   - **Topic hints** (optional): agenda, people, product names, issue numbers. Write
     extra terms one per line to `<root>/<name>/vocab-extra.txt` *before* starting —
     they bias the recognizer toward those spellings.
4. Load a little context now, not during the meeting: the project's instruction file,
   memory index (if loaded), and the plans, handoffs and runbooks for the topic. Note
   which ones are relevant.

## 2. Start

With screen video, preview first — this checks Screen Recording permission and shows
exactly what will be captured:

```bash
MEETING snap --app "<app>" [--window <title|id>]   # → JSON {png, window, width, height, blank}
MEETING snap <N> [--screen-crop W:H:X:Y]           # → JSON {png, width, height, blank}
```

`Read` the PNG and tell the user in one line what is visible. `blank: true` (or no
window titles in `windows`) means the terminal app lacks Screen Recording permission
(permissions are in `reference/setup.md`). For `--screen` crops, read the area off the
full-resolution snap (`width`×`height` are real screen pixels, Retina = 2× the point
size) as `W:H:X:Y` (width, height, left, top) and re-snap. Confirm with the user
before starting.

```bash
MEETING start <name> [--device "MacBook Pro Microphone" --device "BlackHole 2ch"] [--lang th] \
                     [--app "<app>" [--window <title|id>] | --screen <N> [--screen-crop W:H:X:Y]]
```

App mode re-finds the window every 30 s and whenever a grab fails, so a call window
that is closed and reopened is picked up again; `recorder.log` says `window not found`
/ `window back`. While the window is missing the video repeats the last frame.

`start` prints JSON with `transcript` and `log` paths and returns immediately (the
recorder is a detached background process). Then arm the stream with the **Monitor**
tool (load it with ToolSearch `select:Monitor` if deferred):

```
command: tail -n 0 -F <transcript> <log> 2>/dev/null | grep --line-buffered -E '^\[|ERROR|stopped|Traceback'
description: meeting <name> transcript
timeout_ms: 1800000
```

Monitors expire after 30 min. On the expiry notice, re-arm the same command (keep
`-n 0` so old lines are not replayed) unless the transcript ended with `[END]`.
Tell the user in one line: recording, which inputs, how to stop (`/end-meeting`).

If the first chunk line has not arrived ~40 s after start, check `<log>`: an
`ERROR ffmpeg exited by itself` almost always means the terminal app lacks microphone
permission. An `ERROR screen ffmpeg exited` / `ERROR window ffmpeg exited` line means
the video stopped but audio continues; tell the user once. A `window not found` line
during the call means the picked window went away — tell the user once and suggest
`--window` if the call moved to a new window.

Do not pull frames during the meeting (each image costs ~1.5k tokens of context);
note the stamp in `live-notes.md` and /end-meeting pulls them.

## 3. During the meeting — one reply per chunk

Each event is one line `[HH:MM:SS] text` (wall clock), roughly every 20 s. The user
sees something for every chunk, so always reply — but make the reply as small as its
value. Pick the first row that applies:

| Heard | Reply |
|---|---|
| A question, explicit or implied ("is it on prod yet", "how many", "who approved it", "what did we agree", "ขึ้น prod หรือยัง", "ใช่ไหม") that project sources can answer | `❓ <the question in 1 line> → <answer>` + evidence `path:line`. Answer even though nobody asked Claude — that is the job. |
| A status, figure, date or decision that **contradicts** a known decision or document | `⚠️ heard "<quote>" — <source> says <X>` + `path:line`. Say plainly if the mismatch may be ASR noise. |
| A status, figure or rule that a source **confirms** | `✅ <claim> — <path:line>` |
| A new decision, action item, owner or deadline | `📌 <who> → <what> (<when>)` |
| A document, PR, issue or runbook someone needs and the repo has | `📎 <what> — <path or repo#N + title>` |
| Nothing actionable | `· HH:MM <gist in ≤12 words>` |

Combine rows when a chunk holds several. Keep each reply to a few lines — the user is
reading while listening. Cite issues as repo + number + plain title
(`web#12 login page copy`), never a bare `#N`.

**Stay fast.** A reply that arrives three chunks late is noise. Chunks arrive every
20 s, so budget ~15 s per reply. When several chunk events queued up while you were
working, answer them together in one message (one block per stamp, `·` lines merged)
instead of falling further behind. Use `rg` / `Read` on known paths only. No
subagents, no wide sweeps, no network calls (`gh`, ssh, web), no database queries
during the meeting. If a check needs more than ~30 s of digging, reply
`🔎 queued: <claim>` and leave it for /end-meeting.

Ground truth follows the order in SKILL.md. Database-only figures (counts, amounts)
always go to `🔎`.

**ASR is imperfect, especially for numbers and names.** Before flagging a
contradiction on a single heard number, consider whether it is a mishearing; say
"(heard once — may be ASR)" when unsure. Names in the vocab files are the known
people; a near-miss spelling is probably one of them.

**Keep the running log.** Append every ❓ ⚠️ ✅ 📌 📎 🔎 item (not the `·` gist lines) to
`<root>/<name>/live-notes.md` as `- [HH:MM:SS] <emoji> <text> — <evidence>`.
/end-meeting builds on it, and it survives a context compaction.

## 4. While it runs

- If the user types a question in chat mid-meeting, answer it first; the transcript
  lines keep queueing.
- When the transcript ends with `[END]` or the user says the meeting is over, stop
  re-arming the monitor and point to `/end-meeting`.
