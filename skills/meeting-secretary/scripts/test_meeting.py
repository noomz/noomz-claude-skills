#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import datetime as dt
import io
import unittest
import wave
import meeting

SCRIPT = pathlib.Path(meeting.__file__)


class CleanTests(unittest.TestCase):
    def test_numbers_survive(self):
        for text in ("budget is 10000 baht", "งบ 100000 บาท", "5555 ตลกมาก", "ราคา 1,000,000 บาท",
                     "1.5 1.5 1.5 1.5"):
            self.assertEqual(meeting.clean(text), text)

    def test_spaced_loop_is_cut(self):
        self.assertEqual(meeting.clean("ok ok ok ok ok fine"), "ok [repeat cut] fine")

    def test_thai_loop_without_spaces_is_cut(self):
        self.assertEqual(meeting.clean("ครับครับครับครับครับ"), "ครับ [repeat cut]")

    def test_three_repeats_are_kept(self):
        self.assertEqual(meeting.clean("no no no"), "no no no")

    def test_prompt_echo_becomes_silence(self):
        self.assertEqual(meeting.clean(",".join(["deploy"] * 10)), "(silence — prompt echo)")

    def test_thai_latin_boundary_gets_a_space(self):
        self.assertEqual(meeting.clean("คุยเรื่องdeployครับ"), "คุยเรื่อง deploy ครับ")


class NameTests(unittest.TestCase):
    def test_accepts_dated_slug(self):
        self.assertEqual(meeting.meeting_name("2026-10-20-sprint-review"), "2026-10-20-sprint-review")

    def test_rejects_paths_and_dot_names(self):
        for bad in ("../x", "a/b", ".hidden", "..", "", "ACTIVE.json", "snap-window.png"):
            with self.assertRaises(argparse.ArgumentTypeError):
                meeting.meeting_name(bad)


class VocabTests(unittest.TestCase):
    def test_comments_blanks_and_duplicates_dropped(self):
        with tempfile.TemporaryDirectory() as d:
            f = pathlib.Path(d) / "v.txt"
            f.write_text("# header\nAlpha\n\n  Beta  \nAlpha\n")
            self.assertEqual(meeting.read_terms(f), ["Alpha", "Beta", "Alpha"])
            self.assertEqual(meeting.read_terms(pathlib.Path(d) / "missing.txt"), [])


class SpeechWindowTests(unittest.TestCase):
    def test_short_pause_merges(self):
        self.assertEqual(meeting.speech_windows([(1, 2), (2.5, 3)], 10, pad=0.2), [(0.8, 3.2)])

    def test_long_pause_splits(self):
        self.assertEqual(meeting.speech_windows([(1, 2), (4, 5)], 10, pad=0.2), [(0.8, 2.2), (3.8, 5.2)])

    def test_long_run_is_hard_split(self):
        wins = meeting.speech_windows([(0, 40)], 40, pad=0)
        self.assertEqual(wins, [(0, 15), (15, 30), (30, 40)])

    def test_merge_stops_at_max_length(self):
        wins = meeting.speech_windows([(0, 10), (10.3, 20)], 20, pad=0)
        self.assertEqual(wins, [(0, 10), (10.3, 20)])

    def test_refused_merge_does_not_overlap_previous_window(self):
        wins = meeting.speech_windows([(0, 10), (10.3, 20)], 20, pad=0.2)
        self.assertEqual(wins, [(0, 10.2), (10.2, 20)])

    def test_pad_clamps_to_audio(self):
        self.assertEqual(meeting.speech_windows([(0.1, 9.9)], 10, pad=0.5), [(0, 10)])


class LiveWindowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.saved = meeting.vad_segments, meeting.transcribe_one
        self.calls = []
        meeting.transcribe_one = lambda wav, prompt, lang: self.calls.append(wave.open(str(wav)).getnframes()
                                                                             / meeting.RATE) or f"text{len(self.calls)}"
        self.out = io.StringIO()
        self.live = meeting.LiveWindows(pathlib.Path(self.tmp.name), dt.datetime(2026, 1, 1, 10, 0, 0),
                                        self.out, io.StringIO(), "", "th")

    def tearDown(self):
        meeting.vad_segments, meeting.transcribe_one = self.saved
        self.tmp.cleanup()

    def pcm(self, seconds):
        return b"\0\0" * int(seconds * meeting.RATE)

    def test_window_across_chunk_boundary_is_transcribed_once(self):
        # speech 18-26 s: reaches the end of chunk 1 (20 s), so it is held and finished in chunk 2
        meeting.vad_segments = lambda wav: [(18, 20)] if wave.open(str(wav)).getnframes() == 20 * meeting.RATE \
            else [(0, 6)]
        self.live.feed(self.pcm(20))
        self.assertEqual(self.out.getvalue(), "")
        self.assertEqual(self.calls, [])
        self.live.feed(self.pcm(20))  # carry (18-20) + 20 s = 22 s buffer, speech ends at 6 s
        self.assertEqual(self.out.getvalue(), "[10:00:17] text1\n")
        self.assertEqual(len(self.calls), 1)
        self.assertAlmostEqual(self.calls[0], 6.2, places=1)

    def test_silent_chunk_writes_one_line_and_skips_the_model(self):
        meeting.vad_segments = lambda wav: []
        self.live.feed(self.pcm(20))
        self.assertEqual(self.out.getvalue(), "[10:00:00] (silence)\n")
        self.live.feed(self.pcm(20))
        self.assertEqual(self.out.getvalue().splitlines()[-1], "[10:00:20] (silence)")
        self.assertEqual(self.calls, [])

    def test_stamps_follow_real_chunk_length(self):
        meeting.vad_segments = lambda wav: [(1, 2)]
        self.live.feed(self.pcm(17.9))
        self.live.feed(self.pcm(17.9))
        self.assertEqual(self.out.getvalue(), "[10:00:00] text1\n[10:00:17] text2\n")

    def test_vad_error_keeps_carry_and_retries(self):
        meeting.vad_segments = lambda wav: [(15, 20)] if wave.open(str(wav)).getnframes() == 20 * meeting.RATE \
            else [(0, 5)]
        self.live.feed(self.pcm(20))
        def boom(wav):
            raise RuntimeError("x")
        meeting.vad_segments = boom
        self.live.feed(self.pcm(20))
        self.assertEqual(self.calls, [])
        meeting.vad_segments = lambda wav: [(0.2, 4)]
        self.live.feed(self.pcm(20))
        self.assertEqual(self.out.getvalue(), "[10:00:14] text1\n")

    def test_carry_with_no_speech_is_flushed(self):
        meeting.vad_segments = lambda wav: [(15, 20)] if wave.open(str(wav)).getnframes() == 20 * meeting.RATE \
            else []
        self.live.feed(self.pcm(20))
        self.live.feed(self.pcm(20))
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.out.getvalue(), "[10:00:14] text1\n")

    def test_unreadable_chunk_advances_clock(self):
        meeting.vad_segments = lambda wav: [(1, 2)]
        self.live.skip(20)
        self.live.feed(self.pcm(10))
        self.assertEqual(self.out.getvalue(), "[10:00:20] text1\n")

    def test_no_temp_files_left(self):
        meeting.vad_segments = lambda wav: [(1, 2)]
        self.live.feed(self.pcm(10))
        self.assertEqual(list(pathlib.Path(self.tmp.name).iterdir()), [])

    def frames(self, wav):
        return wave.open(str(wav)).getnframes() / meeting.RATE

    def test_speech_at_chunk_end_is_rescored_with_next_chunk(self):
        # speech from 19.8 s is too short for VAD in chunk 1; the kept 1 s of context lets chunk 2 catch it
        meeting.vad_segments = lambda wav: [] if self.frames(wav) == 20 else [(0.8, 3.0)]
        self.live.feed(self.pcm(20))
        self.assertEqual(self.out.getvalue(), "[10:00:00] (silence)\n")
        self.live.feed(self.pcm(20))
        self.assertEqual(self.out.getvalue(), "[10:00:00] (silence)\n[10:00:19] text1\n")
        self.assertAlmostEqual(self.calls[0], 2.6, places=1)

    def test_held_speech_survives_when_vad_reports_only_new_audio(self):
        meeting.vad_segments = lambda wav: {20: [(18, 20)], 12.2: [(9.6, 12)]}.get(round(self.frames(wav), 1), [])
        self.live.feed(self.pcm(20))  # window 17.8-20 held, carry 2.2 s
        self.live.feed(self.pcm(10))  # buffer 12.2 s; VAD sees only 9.6-12
        self.assertEqual(self.out.getvalue(), "[10:00:17] text1\n")
        self.assertAlmostEqual(self.calls[0], 2.4, places=1)
        self.live.flush()
        self.assertEqual(len(self.calls), 2)
        self.assertEqual(self.out.getvalue().splitlines()[1], "[10:00:27] text2")

    def test_nothing_is_emitted_twice(self):
        meeting.vad_segments = lambda wav: [(2, 5)]
        self.live.feed(self.pcm(20))
        self.live.feed(self.pcm(20))  # context carry holds no speech at 2-5 s of its own buffer
        self.live.flush()
        stamps = [l.split("]")[0] for l in self.out.getvalue().splitlines()]
        self.assertEqual(len(stamps), len(set(stamps)))

    def test_flush_emits_held_window(self):
        meeting.vad_segments = lambda wav: [(15, 20)] if wave.open(str(wav)).getnframes() == 20 * meeting.RATE \
            else [(0, 5)]
        self.live.feed(self.pcm(20))
        self.assertEqual(self.calls, [])
        self.live.flush()
        self.assertEqual(self.out.getvalue(), "[10:00:14] text1\n")


class TapPlumbingTests(unittest.TestCase):
    def test_capture_cmd_without_tap_is_unchanged(self):
        self.assertEqual(meeting.capture_cmd("default")[1:], ["--device", "default"])

    def test_capture_cmd_with_tap(self):
        self.assertEqual(meeting.capture_cmd("Mic", "Microsoft Teams", "UID1")[1:],
                         ["--device", "Mic", "--tap-app", "Microsoft Teams", "--tap-clock", "UID1"])
        self.assertNotIn("--tap-clock", meeting.capture_cmd("Mic", "Zoom"))

    def test_start_passes_tap_to_daemon_and_meta(self):
        from unittest import mock
        with tempfile.TemporaryDirectory() as d:
            root = pathlib.Path(d)
            ns = argparse.Namespace(name="m1", device=["default"], replay=None, rate=1.0, started=None, lang="th",
                                    screen=None, screen_crop=None, app=None, window=None,
                                    tap_app="Microsoft Teams", tap_clock="UID1")
            with mock.patch.object(meeting, "ROOT", root), mock.patch.object(meeting, "ACTIVE", root / "ACTIVE.json"), \
                    mock.patch.object(meeting, "preflight"), mock.patch.object(meeting, "ensure_root"), \
                    mock.patch.object(meeting.subprocess, "Popen") as popen, mock.patch("builtins.print"):
                popen.return_value.pid = 1
                meeting.cmd_start(ns)
            argv = popen.call_args[0][0]
            self.assertEqual(argv[argv.index("--tap-app") + 1], "Microsoft Teams")
            self.assertEqual(argv[argv.index("--tap-clock") + 1], "UID1")
            meta = json.loads((root / "m1" / "meta.json").read_text())
            self.assertEqual((meta["tap_app"], meta["tap_clock"]), ("Microsoft Teams", "UID1"))

    def test_daemon_runs_capture_with_tap(self):
        from unittest import mock
        with tempfile.TemporaryDirectory() as d:
            mdir = pathlib.Path(d)
            (mdir / "meta.json").write_text(json.dumps({"started": dt.datetime.now().isoformat()}))
            seen = []

            class Stop(Exception):
                pass

            def fake_popen(cmd, **kw):
                seen.append(cmd)
                raise Stop

            with mock.patch.object(meeting.subprocess, "Popen", fake_popen), \
                    mock.patch.object(meeting, "vocab_prompt", return_value=""):
                with self.assertRaises(Stop):
                    meeting.run_daemon(mdir, ["default"], None, 1.0, tap_app="Microsoft Teams")
            self.assertIn("--tap-app", seen[0])
            self.assertEqual(seen[0][seen[0].index("--tap-app") + 1], "Microsoft Teams")


class CliTests(unittest.TestCase):
    def run_cli(self, *args, home):
        env = dict(os.environ, MEETING_HOME=home)
        return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, env=env)

    def test_start_rejects_traversal_name(self):
        with tempfile.TemporaryDirectory() as d:
            r = self.run_cli("start", "../escape", "--replay", "x.wav", home=d)
            self.assertNotEqual(r.returncode, 0)
            self.assertIn("bad meeting name", r.stderr)

    def test_final_without_meetings_exits_cleanly(self):
        with tempfile.TemporaryDirectory() as d:
            r = self.run_cli("final", home=str(pathlib.Path(d) / "none"))
            if "missing:" in r.stderr:
                self.skipTest("transcribe.cpp not installed")
            self.assertIn("no meetings under", r.stderr)
            self.assertNotIn("Traceback", r.stderr)

    def test_vocab_reports_files(self):
        with tempfile.TemporaryDirectory() as d:
            r = self.run_cli("vocab", home=d)
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertGreater(json.loads(r.stdout)["unique_terms"], 0)


if __name__ == "__main__":
    unittest.main()
