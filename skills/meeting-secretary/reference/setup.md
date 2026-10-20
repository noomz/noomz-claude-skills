# Setup — first run and permission errors

macOS only: recording uses ffmpeg's `avfoundation` input, window capture uses
`screencapture` and CoreGraphics. Apple Silicon is assumed for speed.

## Install

1. ffmpeg: `brew install ffmpeg`
2. transcribe.cpp (the local recognizer), built into `~/Projects/Opensources/transcribe.cpp`
   by default:

   ```bash
   git clone https://github.com/handy-computer/transcribe.cpp ~/Projects/Opensources/transcribe.cpp
   cd ~/Projects/Opensources/transcribe.cpp && cmake -B build && cmake --build build -j
   ```

3. The model (2.2 GB):

   ```bash
   mkdir -p ~/Projects/Opensources/transcribe.cpp/models
   curl -L -o ~/Projects/Opensources/transcribe.cpp/models/Qwen3-ASR-1.7B-Q8_0.gguf \
     https://huggingface.co/handy-computer/Qwen3-ASR-1.7B-gguf/resolve/main/Qwen3-ASR-1.7B-Q8_0.gguf
   ```

`MEETING start` and `MEETING final` check for `build/bin/transcribe-cli` and the model
and print these steps when either is missing.

## Environment variables

| Variable | Default | Use |
|---|---|---|
| `TCPP_HOME` | `~/Projects/Opensources/transcribe.cpp` | where transcribe.cpp is built |
| `MEETING_HOME` | `<project>/.meetings` | data root for all meetings |
| `MEETING_DEVICE` | `MacBook Pro Microphone` | default audio input when `--device` is not given |

## Permissions

The terminal app that runs Claude Code (Terminal, iTerm2, Ghostty, ...) needs, in
System Settings → Privacy & Security:

- **Microphone** — without it ffmpeg exits at once and `recorder.log` says
  `ERROR ffmpeg exited by itself`.
- **Screen Recording** — only for screen video. Without it `snap` returns
  `blank: true` and `windows` shows no titles. Restart the terminal after granting.

## Recording the other side of an online call

The mic alone picks up remote speakers faintly from the speakers, and not at all on
headphones. Install a system-audio loopback device (BlackHole, eqMac or Loopback),
route the call's output through it, and pass it as a second `--device`; the script
mixes the inputs.

## Test without a meeting

Replay any recording through the live pipeline (`--rate 4` plays it 4× faster):

```bash
MEETING start test-replay --replay ~/some-call.wav --rate 4
MEETING status
MEETING stop && MEETING final test-replay
```

Delete `<root>/test-replay/` afterwards.
