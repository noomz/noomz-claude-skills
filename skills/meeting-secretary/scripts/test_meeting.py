#!/usr/bin/env python3
import argparse
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
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
