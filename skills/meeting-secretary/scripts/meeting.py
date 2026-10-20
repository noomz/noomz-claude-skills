#!/usr/bin/env python3
"""Meeting recorder + transcriber for the meeting-secretary skill (/start-meeting, /end-meeting).

  meeting.py start NAME [--device default ...] [--lang th]
                        [--screen N [--screen-crop W:H:X:Y] | --app NAME [--window TITLE]] [--replay WAV --rate 1]
  meeting.py windows                                    list app windows (id, app, title, size)
  meeting.py snap (N [--screen-crop W:H:X:Y] | --app NAME [--window TITLE]) [--out PNG]
                                                        one preview frame (permission + what gets captured)
  meeting.py status
  meeting.py stop
  meeting.py frame NAME HH:MM:SS ... [--span S --step S] PNGs from screen.mp4 at wall-clock times
  meeting.py final [NAME]
  meeting.py vocab [NAME]                               the vocab files in play, their terms, prompt size

Engine: transcribe.cpp + Qwen3-ASR-1.7B Q8_0 with the vocab prompt — best of 7 engines on a real
Thai/English meeting. Everything runs locally; no audio leaves the Mac.

Data root: $MEETING_HOME, else <project>/.meetings/ (project = git top level of the cwd, else the
cwd). The root gets a `.gitignore` of `*` on first use, so audio and transcripts never get committed.

Vocab prompt, merged in order, duplicates dropped:
  <skill>/assets/vocab.txt              generic terms
  <project>/.claude/meeting-vocab.txt   the project's names and terms (written by /meeting-vocab)
  <NAME>/vocab-extra.txt                one meeting's agenda terms

Layout under the data root:
  ACTIVE.json                  the running session (absent = nothing running)
  <NAME>/chunks/00000.wav      20 s mic chunks, 16 kHz mono
  <NAME>/transcript-live.md    one line per chunk: [HH:MM:SS] text   (wall clock of chunk start)
  <NAME>/recorder.log          recorder status + errors
  <NAME>/screen.mp4            optional video, 1 fps, ~35 MB/hour (fragmented: crash-safe):
                               --screen = one display (<=1920 wide); --app = one app window only, even when
                               covered, letterboxed to 1920x1080
  <NAME>/frames/HHMMSS.png     frames pulled with `frame`
  <NAME>/full.wav              all chunks joined            (final)
  <NAME>/transcript-final.md   30 s re-pass: [mm:ss | HH:MM:SS] text  (final)
"""
import argparse, datetime as dt, json, os, pathlib, re, signal, subprocess, sys, threading, time

def project_dir():
    try:
        r = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True)
        top = r.stdout.strip() if r.returncode == 0 else ""
    except OSError:  # no git installed
        top = ""
    return pathlib.Path(top or os.getcwd()).resolve()


def meeting_dir(name):
    mdir = ROOT / name
    if not (mdir / "meta.json").exists():
        sys.exit(f"no meeting folder: {mdir}")
    return mdir


PROJECT = project_dir()
ROOT = pathlib.Path(os.environ.get("MEETING_HOME") or PROJECT / ".meetings").expanduser().resolve()
BASE_VOCAB = pathlib.Path(__file__).resolve().parents[1] / "assets/vocab.txt"
PROJECT_VOCAB = PROJECT / ".claude/meeting-vocab.txt"
ACTIVE = ROOT / "ACTIVE.json"
DEFAULT_DEVICE = os.environ.get("MEETING_DEVICE", "default")  # avfoundation: the system input
TCPP = pathlib.Path(os.environ.get("TCPP_HOME", pathlib.Path.home() / ".local/share/transcribe.cpp")).expanduser()
CLI = TCPP / "build/bin/transcribe-cli"
MODEL = TCPP / "models/Qwen3-ASR-1.7B-Q8_0.gguf"
LIVE_SECONDS = 20
FINAL_SECONDS = 30
MIN_CHUNK_BYTES = 64_000  # < 2 s of 16 kHz mono s16


def ensure_root():
    ROOT.mkdir(parents=True, exist_ok=True)
    ignore = ROOT / ".gitignore"
    if not ignore.exists():
        ignore.write_text("# meeting audio and transcripts: never commit\n*\n")


def vocab_files(mdir):
    return [BASE_VOCAB, PROJECT_VOCAB] + ([mdir / "vocab-extra.txt"] if mdir else [])


def read_terms(f):
    # one term per line; blank lines and # comments skipped
    if not f.exists():
        return []
    return [t.strip() for t in f.read_text().splitlines() if t.strip() and not t.lstrip().startswith("#")]


def vocab_prompt(mdir):
    return ",".join(dict.fromkeys(t for f in vocab_files(mdir) for t in read_terms(f)))


THAI, LATIN = r"฀-๿", r"A-Za-z0-9"

def clean(text):
    # On silence Qwen sometimes reads back the comma-separated vocab prompt. Real speech output
    # had <= 4 commas per window on a real hour-long meeting; every echo had dozens.
    if text.count(",") >= 8:
        return "(silence — prompt echo)"
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(rf"([{THAI}])([{LATIN}])", r"\1 \2", text)
    text = re.sub(rf"([{LATIN}])([{THAI}])", r"\1 \2", text)
    # decoder loop guard: a unit repeated 4+ times, spaced or not (Thai loops run together).
    # A numeric unit (10000, 1.5, 1,000) is a number, never a loop.
    return re.sub(r"(\S+?)(?:\s*\1){3,}",
                  lambda m: m[0] if re.fullmatch(r"\d[\d.,]*", m[1]) else f"{m[1]} [repeat cut]", text)


def transcribe_one(wav, prompt, lang):
    out = wav.with_suffix(".txt")
    args = [str(CLI), "-q", "-m", str(MODEL), "-l", lang, "-o", str(out), str(wav)]
    if prompt:
        args[1:1] = ["--prompt", prompt]
    r = subprocess.run(args, capture_output=True, text=True, errors="replace")
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[-300:])
    return clean(out.read_text(errors="replace")) if out.exists() else ""


def preflight():
    missing = [p for p in (CLI, MODEL) if not p.exists()]
    if missing:
        sys.exit("missing: " + ", ".join(map(str, missing)) +
                 f"\nbuild: cd {TCPP} && cmake -B build && cmake --build build -j"
                 f"\nmodel: curl -L -o {MODEL} "
                 "https://huggingface.co/handy-computer/Qwen3-ASR-1.7B-gguf/resolve/main/Qwen3-ASR-1.7B-Q8_0.gguf"
                 "\n(set TCPP_HOME if transcribe.cpp lives elsewhere)")


# 1 fps h264; -g 5 so the fragmented mp4 flushes every ~5 s and survives a crash
VIDEO_OUT = ["-r", "1", "-c:v", "h264_videotoolbox", "-b:v", "300k", "-g", "5",
             "-movflags", "+frag_keyframe+empty_moov+default_base_moof"]


def screen_input(screen, crop):
    # avfoundation ignores -framerate 1 for screens, so capture at 5 and drop to 1 fps on output.
    # Select by name: device indices shift when an iPhone camera connects.
    vf = (f"crop={crop}," if crop else "") + "scale='min(1920,iw)':-2,format=yuv420p"
    return (["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "avfoundation", "-framerate", "5",
             "-pixel_format", "nv12", "-capture_cursor", "0", "-i", f"Capture screen {screen}:none"], ["-vf", vf])


WINDOWS_JXA = r"""ObjC.import('CoreGraphics');
const raw = $.CGWindowListCopyWindowInfo($.kCGWindowListOptionAll | $.kCGWindowListExcludeDesktopElements, $.kCGNullWindowID);
JSON.stringify(ObjC.deepUnwrap(ObjC.castRefToObject(raw)).filter(w => w.kCGWindowLayer === 0).map(w => ({
  id: w.kCGWindowNumber, app: w.kCGWindowOwnerName, title: w.kCGWindowName || '', onscreen: !!w.kCGWindowIsOnscreen,
  w: w.kCGWindowBounds.Width, h: w.kCGWindowBounds.Height})));"""


def list_windows():
    r = subprocess.run(["osascript", "-l", "JavaScript", "-e", WINDOWS_JXA], capture_output=True, text=True)
    return [w for w in json.loads(r.stdout or "[]") if w["w"] >= 100 and w["h"] >= 100]


def find_window(app, title=None):
    # the app's largest window; titles need Screen Recording permission to be visible
    cands = [w for w in list_windows() if app.lower() in w["app"].lower()
             and (not title or title.lower() in w["title"].lower() or title == str(w["id"]))]
    return max(cands, key=lambda w: (w["onscreen"], w["w"] * w["h"]), default=None)


def grab_window(wid, out, fmt="jpg"):
    # screencapture -l grabs only that window's pixels, even when other windows cover it
    out.unlink(missing_ok=True)
    r = subprocess.run(["screencapture", "-x", "-o", "-l", str(wid), "-t", fmt, str(out)], capture_output=True)
    return r.returncode == 0 and out.exists()


def capture_app(mdir, app, title, log, stop, meta):
    # Window frames change size when the window is resized, so letterbox into a fixed 1920x1080.
    # Timestamps are wall clock; while the window is missing, cfr repeats the last frame.
    ff = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe",
                           "-use_wallclock_as_timestamps", "1", "-c:v", "mjpeg", "-i", "-",
                           "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
                                  "pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
                           "-fps_mode", "cfr"] + VIDEO_OUT + [str(mdir / "screen.mp4")],
                          stdin=subprocess.PIPE, stderr=log)
    tmp = mdir / "window-latest.jpg"  # screencapture refuses dot-file names (and still exits 0)
    wid, missing, resolve_at, tick = None, False, 0.0, time.time()
    while not stop.is_set():
        now = time.time()
        if wid is None or now >= resolve_at:  # re-resolve: a call app may swap its meeting window
            w = find_window(app, title)
            wid, resolve_at = (w["id"] if w else None), now + 30
        if wid is not None and grab_window(wid, tmp):
            if "screen_started" not in meta:  # video t=0 is the first frame, not the start command
                meta["screen_started"] = dt.datetime.fromtimestamp(now).isoformat(timespec="milliseconds")
                (mdir / "meta.json").write_text(json.dumps(meta))
            try:
                ff.stdin.write(tmp.read_bytes())
                ff.stdin.flush()
            except BrokenPipeError:
                log.write(f"{dt.datetime.now():%H:%M:%S} ERROR window ffmpeg exited — audio continues\n")
                return
            if missing:
                log.write(f"{dt.datetime.now():%H:%M:%S} window back: {app}\n")
                missing = False
        else:
            wid = None
            if not missing:
                log.write(f"{dt.datetime.now():%H:%M:%S} window not found: {app} {title or ''} "
                          "(closed, minimised, or no Screen Recording permission)\n")
                missing = True
        tick += 1
        stop.wait(max(0.0, tick - time.time()))
    ff.stdin.close()
    ff.wait(timeout=30)
    tmp.unlink(missing_ok=True)


# --- recorder daemon ------------------------------------------------------------------

def run_daemon(mdir, devices, replay, rate, screen=None, crop=None, app=None, window=None):
    chunks = mdir / "chunks"
    chunks.mkdir(parents=True, exist_ok=True)
    log = (mdir / "recorder.log").open("a", buffering=1)
    out = (mdir / "transcript-live.md").open("a", buffering=1)
    meta = json.loads((mdir / "meta.json").read_text())
    started = dt.datetime.fromisoformat(meta["started"])
    prompt, lang = vocab_prompt(mdir), meta.get("lang", "th")

    seg =["-ac", "1", "-ar", "16000", "-f", "segment", "-segment_time", str(LIVE_SECONDS),
           "-reset_timestamps", "1", str(chunks / "%05d.wav")]
    if replay:
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-readrate", str(rate), "-i", replay] + seg
    else:
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error"]
        for d in devices:
            cmd += ["-f", "avfoundation", "-i", f":{d}"]
        if len(devices) > 1:
            cmd += ["-filter_complex", f"amix=inputs={len(devices)}:normalize=0"]
        cmd += seg
    rec = subprocess.Popen(cmd, stderr=log)
    log.write(f"{dt.datetime.now():%H:%M:%S} recording pid={rec.pid} devices={devices or replay}\n")

    vid = None
    if screen is not None and not replay:
        inp, vf = screen_input(screen, crop)
        vid = subprocess.Popen(inp + vf + VIDEO_OUT + [str(mdir / "screen.mp4")], stderr=log)
        meta["screen_started"] = dt.datetime.now().isoformat(timespec="milliseconds")
        (mdir / "meta.json").write_text(json.dumps(meta))
        log.write(f"{dt.datetime.now():%H:%M:%S} screen pid={vid.pid} screen={screen} crop={crop}\n")

    stop_app, cap = threading.Event(), None
    if app and not replay:
        cap = threading.Thread(target=capture_app, args=(mdir, app, window, log, stop_app, meta), daemon=True)
        cap.start()
        log.write(f"{dt.datetime.now():%H:%M:%S} window capture app={app!r} title={window!r}\n")

    stopping = False
    def on_term(*_):
        nonlocal stopping
        stopping = True
        rec.terminate()
        stop_app.set()
        if vid:
            vid.terminate()
    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)

    done = set()
    def drain(final=False):
        files = sorted(chunks.glob("*.wav"))
        for f in (files if final else files[:-1]):  # newest chunk is still being written
            if f.name in done:
                continue
            done.add(f.name)
            if f.stat().st_size < MIN_CHUNK_BYTES:
                continue
            stamp = (started + dt.timedelta(seconds=int(f.stem) * LIVE_SECONDS)).strftime("%H:%M:%S")
            try:
                text = transcribe_one(f, prompt, lang)
            except Exception as e:
                log.write(f"{stamp} ERROR chunk {f.name}: {e}\n")
                continue
            out.write(f"[{stamp}] {text or '(silence)'}\n")

    vid_dead = False
    while rec.poll() is None:
        drain()
        if vid and not vid_dead and vid.poll() is not None and not stopping:
            vid_dead = True
            log.write(f"{dt.datetime.now():%H:%M:%S} ERROR screen ffmpeg exited — audio continues; "
                      "check Screen Recording permission for the terminal app\n")
        time.sleep(1)
    if vid:
        vid.terminate()
        vid.wait(timeout=15)
    if cap:
        stop_app.set()
        cap.join(timeout=40)
    drain(final=True)
    if not stopping and not replay:
        log.write("ERROR ffmpeg exited by itself — check microphone permission for the terminal app\n")
    log.write(f"{dt.datetime.now():%H:%M:%S} stopped\n")
    out.write("[END]\n" if stopping or replay else "")


# --- commands -------------------------------------------------------------------------

def cmd_start(a):
    preflight()
    if a.screen is not None and a.app:
        sys.exit("pick one: --screen N or --app NAME")
    if ACTIVE.exists():
        s = json.loads(ACTIVE.read_text())
        if pid_alive(s["pid"]):
            sys.exit(f"already recording: {s['name']} (pid {s['pid']}). Run: meeting.py stop")
        ACTIVE.unlink()
    ensure_root()
    mdir = ROOT / a.name
    if (mdir / "transcript-live.md").exists():
        sys.exit(f"refuse: {mdir}/transcript-live.md exists — pick a new NAME")
    mdir.mkdir(parents=True, exist_ok=True)
    started = dt.datetime.now().replace(microsecond=0)
    if a.started:  # replaying an old recording: stamps should show the real meeting clock
        h, m = map(int, a.started.split(":"))
        started = started.replace(hour=h, minute=m, second=0)
    (mdir / "meta.json").write_text(json.dumps({"name": a.name, "started": started.isoformat(),
                                                "devices": a.device, "replay": a.replay, "lang": a.lang,
                                                "screen": a.screen, "screen_crop": a.screen_crop,
                                                "app": a.app, "window": a.window}))
    args = [sys.executable, __file__, "_daemon", a.name, "--rate", str(a.rate)]
    for d in a.device:
        args += ["--device", d]
    if a.screen is not None:
        args += ["--screen", str(a.screen)] + (["--screen-crop", a.screen_crop] if a.screen_crop else [])
    if a.app:
        args += ["--app", a.app] + (["--window", a.window] if a.window else [])
    if a.replay:
        args += ["--replay", str(pathlib.Path(a.replay).resolve())]
    p = subprocess.Popen(args, start_new_session=True, stdout=subprocess.DEVNULL, stderr=(mdir / "recorder.log").open("a"))
    ACTIVE.write_text(json.dumps({"name": a.name, "dir": str(mdir), "pid": p.pid, "started": started.isoformat()}))
    print(json.dumps({"name": a.name, "dir": str(mdir), "pid": p.pid,
                      "transcript": str(mdir / "transcript-live.md"), "log": str(mdir / "recorder.log")}))


def pid_alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def cmd_status(_):
    if not ACTIVE.exists():
        print("no active meeting")
        return
    s = json.loads(ACTIVE.read_text())
    mdir = pathlib.Path(s["dir"])
    n = len(list((mdir / "chunks").glob("*.wav")))
    lines = (mdir / "transcript-live.md").read_text().splitlines() if (mdir / "transcript-live.md").exists() else []
    video = mdir / "screen.mp4"
    vinfo = f" screen.mp4={video.stat().st_size // 1024}K" if video.exists() else ""
    print(f"{s['name']} pid={s['pid']} alive={pid_alive(s['pid'])} chunks={n} lines={len(lines)}{vinfo}")
    print("\n".join(lines[-3:]))


def frame_stats(png):
    r = subprocess.run(["ffprobe", "-v", "error", "-f", "lavfi", "-i", f"movie={png},signalstats",
                        "-show_entries", "stream=width,height:frame_tags=lavfi.signalstats.YMAX",
                        "-of", "json"], capture_output=True, text=True)
    j = json.loads(r.stdout or "{}")
    st = (j.get("streams") or [{}])[0]
    ymax = int((j.get("frames") or [{}])[0].get("tags", {}).get("lavfi.signalstats.YMAX", 0))
    return st.get("width"), st.get("height"), ymax


def cmd_windows(_):
    for w in sorted(list_windows(), key=lambda w: (w["app"].lower(), -w["w"] * w["h"])):
        if not w["onscreen"] and not w["title"]:  # popups and helpers nobody records
            continue
        print(f"{w['id']:>7}  {w['app']} | {w['title'][:60]}  {w['w']}x{w['h']}{'' if w['onscreen'] else '  (hidden)'}")


def cmd_snap(a):
    if (a.screen is None) == (a.app is None):
        sys.exit("snap needs a screen number N or --app NAME")
    ensure_root()
    if a.app:
        w = find_window(a.app, a.window)
        if not w:
            sys.exit(f"no window for app {a.app!r} title {a.window!r} — run: meeting.py windows")
        out = pathlib.Path(a.out or ROOT / "snap-window.png")
        out.parent.mkdir(parents=True, exist_ok=True)
        if not grab_window(w["id"], out, "png"):
            sys.exit(f"screencapture failed for window {w['id']} ({w['app']})")
        width, height, ymax = frame_stats(out)
        print(json.dumps({"png": str(out), "window": w, "width": width, "height": height, "blank": ymax < 20}))
        return
    out = pathlib.Path(a.out or ROOT / f"snap-screen{a.screen}.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    inp, _ = screen_input(a.screen, None)
    vf = ["-vf", f"crop={a.screen_crop}"] if a.screen_crop else []
    # full resolution (no scale) so crop coordinates can be read off the preview
    r = subprocess.run(inp + vf + ["-frames:v", "3", "-update", "1", str(out)], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"snap failed for 'Capture screen {a.screen}' (list: ffmpeg -f avfoundation -list_devices true -i \"\"): "
                 + r.stderr.strip().splitlines()[-1])
    w, h, ymax = frame_stats(out)
    print(json.dumps({"png": str(out), "width": w, "height": h,
                      "blank": ymax < 20, "hint": "blank=true → grant Screen Recording to the terminal app"}))


def cmd_frame(a):
    mdir = ROOT / a.name
    if not (mdir / "meta.json").exists():
        sys.exit(f"no meeting folder: {mdir}")
    meta = json.loads((mdir / "meta.json").read_text())
    video = mdir / "screen.mp4"
    if not video.exists() or "screen_started" not in meta:
        sys.exit(f"no screen video in {mdir}")
    base = dt.datetime.fromisoformat(meta["screen_started"])
    fdir = mdir / "frames"
    fdir.mkdir(exist_ok=True)
    made, skipped = [], []
    for t in a.times:
        target = dt.datetime.combine(base.date(), dt.time.fromisoformat(t))
        if target < base - dt.timedelta(hours=12):  # meeting ran past midnight
            target += dt.timedelta(days=1)
        center = (target - base).total_seconds()
        offs = [center] if not a.span else \
            [center + d for d in range(-a.span, a.span + 1, a.step)]
        for off in offs:
            if off < 0:
                skipped.append(t)
                continue
            stamp = (base + dt.timedelta(seconds=off)).strftime("%H%M%S")
            png = fdir / f"{stamp}.png"
            png.unlink(missing_ok=True)
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{off:.1f}",
                            "-i", str(video), "-frames:v", "1", str(png)])
            if png.exists():
                made.append(str(png))
            else:
                skipped.append(stamp)  # past the end of the video so far
    print(json.dumps({"frames": made, "skipped": skipped}))


def cmd_stop(_):
    if not ACTIVE.exists():
        sys.exit("no active meeting")
    s = json.loads(ACTIVE.read_text())
    if pid_alive(s["pid"]):
        os.kill(s["pid"], signal.SIGTERM)
        deadline = time.time() + 120  # last chunk still has to be transcribed
        while pid_alive(s["pid"]) and time.time() < deadline:
            time.sleep(0.5)
    if pid_alive(s["pid"]):  # keep ACTIVE.json: status/stop must still find the recorder
        print(json.dumps({"name": s["name"], "dir": s["dir"], "stopped": False, "pid": s["pid"]}))
        sys.exit(f"recorder pid {s['pid']} still running after 120 s — run stop again, "
                 f"or `kill {s['pid']}` and then stop")
    ACTIVE.unlink()
    print(json.dumps({"name": s["name"], "dir": s["dir"], "stopped": True}))


def cmd_final(a):
    preflight()
    if a.name:
        mdir = meeting_dir(a.name)
    elif ACTIVE.exists():
        sys.exit("a meeting is still recording — run stop first")
    else:
        found = [d for d in ROOT.iterdir() if (d / "meta.json").exists()] if ROOT.is_dir() else []
        if not found:
            sys.exit(f"no meetings under {ROOT}")
        mdir = max(found, key=lambda d: (d / "meta.json").stat().st_mtime)
    out = mdir / "transcript-final.md"
    if out.exists():
        sys.exit(f"refuse: {out} exists")
    meta = json.loads((mdir / "meta.json").read_text())
    started = dt.datetime.fromisoformat(meta["started"])
    chunks = sorted(c for c in (mdir / "chunks").glob("*.wav") if c.stat().st_size >= MIN_CHUNK_BYTES)
    full = mdir / "full.wav"
    if not full.exists():
        lst = mdir / "chunks.txt"
        q = "'\\''"  # concat-list quoting for a ' in the path
        lst.write_text("".join(f"file '{str(c).replace(chr(39), q)}'\n" for c in chunks))
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
                        "-i", str(lst), "-c", "copy", str(full)], check=True)
    fdir = mdir / "final-chunks"
    fdir.mkdir(exist_ok=True)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(full), "-f", "segment",
                    "-segment_time", str(FINAL_SECONDS), "-reset_timestamps", "1", str(fdir / "%04d.wav")], check=True)
    files = sorted(fdir.glob("*.wav"))
    batch = fdir / "batch.list"
    batch.write_text("\n".join(map(str, files)) + "\n")
    t0 = time.time()
    r = subprocess.run([str(CLI), "-q", "-m", str(MODEL), "-l", meta.get("lang", "th"), "--prompt", vocab_prompt(mdir),
                        "--batch", str(batch), "--batch-jsonl"], capture_output=True, text=True, errors="replace")
    if r.returncode:
        sys.exit(r.stderr[-1000:])
    texts = {}
    for line in r.stdout.splitlines():
        if line.startswith("{"):
            j = json.loads(line)
            if "file" in j:
                texts[j["file"]] = clean(j.get("text", ""))
    # offsets are exact only when chunks have no gaps (one continuous recording)
    rows = [f"# Final transcript — {meta['name']} — Qwen3-ASR-1.7B + vocab, {FINAL_SECONDS} s windows, "
            f"{time.time() - t0:.0f} s; [audio offset | wall clock]"]
    for i, f in enumerate(files):
        off = i * FINAL_SECONDS
        wall = (started + dt.timedelta(seconds=off)).strftime("%H:%M:%S")
        rows.append(f"[{off // 60:02d}:{off % 60:02d} | {wall}] {texts.get(str(f), '(missing)') or '(silence)'}")
    out.write_text("\n".join(rows) + "\n")
    print(json.dumps({"dir": str(mdir), "final": str(out), "windows": len(files), "seconds": round(time.time() - t0)}))


def cmd_vocab(a):
    mdir = ROOT / a.name if a.name else None  # may not exist yet: vocab-extra.txt is written before start
    files =[{"path": str(f), "exists": f.exists(), "terms": len(read_terms(f))} for f in vocab_files(mdir)]
    prompt = vocab_prompt(mdir)
    print(json.dumps({"files": files, "unique_terms": len(prompt.split(",")) if prompt else 0,
                      "prompt_chars": len(prompt)}, ensure_ascii=False))


def meeting_name(name):
    # a folder name under the data root: no path separators, no leading dot, and no
    # .json/.png ending, which would collide with ACTIVE.json and snap-*.png beside it
    if not re.fullmatch(r"[\w][\w.-]*", name) or name.lower().endswith((".json", ".png")):
        raise argparse.ArgumentTypeError(f"bad meeting name {name!r}: use letters, digits, '-', '_', '.'")
    return name


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("start"); p.add_argument("name", type=meeting_name); p.add_argument("--device", action="append", default=[])
    p.add_argument("--replay"); p.add_argument("--rate", type=float, default=1.0)
    p.add_argument("--started", help="HH:MM wall clock of the recording start (for --replay)")
    p.add_argument("--lang", default="th", help="language code passed to the recognizer (default th)")
    p.add_argument("--screen", type=int, help="also record 'Capture screen N' at 1 fps")
    p.add_argument("--screen-crop", help="W:H:X:Y in full-resolution screen pixels (see snap)")
    p.add_argument("--app", help="record only this app's largest window (substring of the app name)")
    p.add_argument("--window", help="with --app: window title substring, or a window id from `windows`")
    p = sub.add_parser("snap"); p.add_argument("screen", type=int, nargs="?"); p.add_argument("--out")
    p.add_argument("--screen-crop"); p.add_argument("--app"); p.add_argument("--window")
    sub.add_parser("windows"); sub.add_parser("status"); sub.add_parser("stop")
    p = sub.add_parser("frame"); p.add_argument("name", type=meeting_name); p.add_argument("times", nargs="+", help="HH:MM:SS")
    p.add_argument("--span", type=int, default=0, help="also take frames ±S seconds around each time")
    p.add_argument("--step", type=int, default=10)
    p = sub.add_parser("final"); p.add_argument("name", nargs="?", type=meeting_name)
    p = sub.add_parser("vocab"); p.add_argument("name", nargs="?", type=meeting_name)
    p = sub.add_parser("_daemon"); p.add_argument("name", type=meeting_name); p.add_argument("--device", action="append", default=[])
    p.add_argument("--replay"); p.add_argument("--rate", type=float, default=1.0)
    p.add_argument("--screen", type=int); p.add_argument("--screen-crop")
    p.add_argument("--app"); p.add_argument("--window")
    a = ap.parse_args()
    if a.cmd == "start" and not a.device and not a.replay:
        a.device = [DEFAULT_DEVICE]
    if a.cmd == "_daemon":
        run_daemon(ROOT / a.name, a.device, a.replay, a.rate, a.screen, a.screen_crop, a.app, a.window)
    else:
        {"start": cmd_start, "status": cmd_status, "stop": cmd_stop, "snap": cmd_snap, "windows": cmd_windows,
         "frame": cmd_frame, "final": cmd_final, "vocab": cmd_vocab}[a.cmd](a)


if __name__ == "__main__":
    main()
