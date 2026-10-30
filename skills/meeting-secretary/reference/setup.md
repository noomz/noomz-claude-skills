# Setup — first run and permission errors

macOS and Claude Code only: the mic is captured by a small native helper (`scripts/capture/meeting-capture.swift`,
built on first live start with `swiftc` from the Xcode command line tools; ffmpeg's `avfoundation` input drops ~12%
of audio), window capture uses `screencapture` and CoreGraphics. Apple Silicon is assumed for speed.
Speech windows come from Silero VAD: `curl -L -o ~/.local/share/transcribe.cpp/models/silero-vad-v6.2-F32.gguf https://huggingface.co/handy-computer/silero-vad-v6.2-gguf/resolve/main/silero-vad-v6.2-F32.gguf`.

## Install

1. ffmpeg: `brew install ffmpeg`
2. transcribe.cpp (the local recognizer), built into `~/.local/share/transcribe.cpp` by
   default (anywhere else works with `TCPP_HOME`):

   ```bash
   git clone https://github.com/handy-computer/transcribe.cpp ~/.local/share/transcribe.cpp
   cd ~/.local/share/transcribe.cpp && cmake -B build && cmake --build build -j
   ```

3. The model (2.2 GB):

   ```bash
   mkdir -p ~/.local/share/transcribe.cpp/models
   curl -L -o ~/.local/share/transcribe.cpp/models/Qwen3-ASR-1.7B-Q8_0.gguf \
     https://huggingface.co/handy-computer/Qwen3-ASR-1.7B-gguf/resolve/main/Qwen3-ASR-1.7B-Q8_0.gguf
   ```

`MEETING start` and `MEETING final` check for `build/bin/transcribe-cli` and the model
and print these steps when either is missing.

## Environment variables

| Variable | Default | Use |
|---|---|---|
| `TCPP_HOME` | `~/.local/share/transcribe.cpp` | where transcribe.cpp is built |
| `MEETING_HOME` | `<project>/.meetings` | data root for all meetings |
| `MEETING_DEVICE` | `default` (the system input) | default audio input when `--device` is not given |

## Permissions

The terminal app that runs Claude Code (Terminal, iTerm2, Ghostty, ...) needs, in
System Settings → Privacy & Security:

- **Microphone** — without it the recorder exits at once and `recorder.log` says
  `ERROR recorder exited by itself`.
- **Screen Recording** — only for screen video. Without it `snap` returns
  `blank: true` and `windows` shows no titles. Restart the terminal after granting.

## Recording the other side of an online call

The mic alone picks up remote speakers faintly from the speakers, and not at all on
headphones. Install a system-audio loopback device (BlackHole, eqMac or Loopback),
route the call's output through it (or into an aggregate device with the mic), and record that
one device: two live mics mixed give steady noise, so `--device` twice is refused.

## Test without a meeting

Replay any recording through the live pipeline (`--rate 4` plays it 4× faster):

```bash
MEETING start test-replay --replay ~/some-call.wav --rate 4
MEETING status
MEETING stop && MEETING final test-replay
```

Delete `<root>/test-replay/` afterwards.
