import contextlib
import io
import json
import os
import tempfile
import unittest
from unittest import mock
from itertools import count
from pathlib import Path

import gloss_rate

_uid = count(1)
GLOSSED = "The premium (เบี้ยประกันภัย) is due."


def rec(kind, sid, content, ts="2026-09-10T00:00:00Z", side=False, uuid=None):
    return {"type": kind, "sessionId": sid, "timestamp": ts, "isSidechain": side, "uuid": uuid or "u%d" % next(_uid),
            "message": {"content": content}}


def hook(sid, text, kind="hook_success", side=True):
    body = [text] if kind == "hook_additional_context" else text
    att = {"type": kind, "hookEvent": "UserPromptSubmit", "content": body, "stdout": text}
    return {"type": "attachment", "sessionId": sid, "isSidechain": side, "uuid": "u%d" % next(_uid), "attachment": att}


def user(sid, text="hi", **kw):
    return rec("user", sid, text, **kw)


def answer(sid, text, mid=None, **kw):
    r = rec("assistant", sid, [{"type": "text", "text": text}], **kw)
    if mid: r["message"]["id"] = mid
    return r


def write(root, name, records, raw=()):
    path = Path(root, name)
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(r, ensure_ascii=False) for r in records] + list(raw)
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def run(*argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = gloss_rate.main(list(argv))
    return code, out.getvalue()


RX = gloss_rate.term_regex(["premium", "claim"])


class AnalyzeTests(unittest.TestCase):
    def test_thai_paren_within_window_is_glossed(self):
        self.assertEqual(gloss_rate.analyze(GLOSSED, RX), (True, True))

    def test_ascii_paren_is_not_glossed(self):
        self.assertEqual(gloss_rate.analyze("The premium (the price you pay) is due.", RX), (False, False))

    def test_paren_beyond_window_is_not_glossed(self):
        text = "premium " + "word " * 20 + "(เบี้ย)"
        self.assertEqual(gloss_rate.analyze(text, RX), (False, False))
        self.assertEqual(gloss_rate.analyze(text, RX, window=200), (True, True))

    def test_non_ascii_beyond_paren_limit_is_ignored(self):
        self.assertEqual(gloss_rate.analyze("premium (" + "a" * 85 + "เบี้ย)", RX), (False, False))

    def test_term_only_in_code_is_not_counted(self):
        self.assertIsNone(gloss_rate.analyze("```\npremium (เบี้ย)\n```", RX))
        self.assertIsNone(gloss_rate.analyze("call `premium` here", RX))
        self.assertIsNone(gloss_rate.analyze("```\nunterminated premium", RX))

    def test_word_boundary_for_ascii_terms(self):
        self.assertIsNone(gloss_rate.analyze("premiums and preclaim", RX))
        self.assertEqual(gloss_rate.analyze("PREMIUM (เบี้ย)", RX), (True, True))

    def test_first_use_is_stricter_than_any_use(self):
        self.assertEqual(gloss_rate.analyze("The premium (เบี้ย) and the claim.", RX), (True, False))
        self.assertEqual(gloss_rate.analyze("claim now" + " filler" * 15 + ", later claim (เคลม)", RX), (True, False))
        self.assertEqual(gloss_rate.analyze("premium (เบี้ย), claim (เคลม)", RX), (True, True))
        self.assertEqual(gloss_rate.analyze("premium (เบี้ย) then premium again", RX), (True, True))

    def test_position_buckets(self):
        got = [gloss_rate.position_bucket(n) for n in (0, 1, 2, 3, 4, 10, 11, 30, 31, 500)]
        self.assertEqual(got, ["1", "1", "2-3", "2-3", "4-10", "4-10", "11-30", "11-30", "31+", "31+"])

    def test_session_split(self):
        def sess(sid, flags):
            return [{"session": sid, "position": 1, "glossed": f, "first_use": f} for f in flags]
        answers = (sess("a", [False] * 3) + sess("b", [True, False, False]) + sess("c", [True, True, False])
                   + sess("d", [True] * 3) + sess("e", [True, True]))
        self.assertEqual(gloss_rate.summarize(answers)["sessions"], {"0%": 1, "1-49%": 1, "50-99%": 1, "100%": 1})


class StoreTests(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.root = self._td.name

    def collect(self, **kw):
        return gloss_rate.collect(self.root, RX, **kw)

    def test_subagent_and_sidechain_ignored(self):
        write(self.root, "s1.jsonl", [user("s1"), answer("s1", GLOSSED), answer("s1", GLOSSED, side=True)])
        write(self.root, "s1/subagents/agent-abc.jsonl", [answer("s1", GLOSSED, side=True)])
        write(self.root, "agent-top.jsonl", [answer("s1", GLOSSED)])
        write(self.root, "workers/w.jsonl", [answer("w", GLOSSED)])
        self.assertEqual(len(self.collect()), 1)

    def test_code_only_answer_not_counted_in_store(self):
        write(self.root, "s.jsonl", [user("s"), answer("s", "```\npremium (เบี้ย)\n```"), answer("s", "premium (x)")])
        answers = self.collect()
        self.assertEqual((len(answers), answers[0]["glossed"]), (1, False))

    def test_prompt_position_skips_tool_results_and_sidechain(self):
        write(self.root, "s.jsonl", [
            user("s"), rec("user", "s", [{"type": "tool_result", "content": "x"}]), user("s", side=True),
            rec("user", "s", [{"type": "text", "text": "second"}]), user("s"), answer("s", GLOSSED)])
        self.assertEqual(self.collect()[0]["position"], 3)

    def test_meta_user_records_do_not_count_as_prompts(self):
        meta = user("s")
        meta["isMeta"] = True
        write(self.root, "s.jsonl", [user("s"), meta, answer("s", GLOSSED)])
        self.assertEqual(self.collect()[0]["position"], 1)

    def test_records_sharing_message_id_are_one_answer(self):
        write(self.root, "a.jsonl", [user("s"), answer("s", "premium (เบี้ย)", mid="m1"), answer("s", "premium again", mid="m1")])
        answers = self.collect()
        self.assertEqual((len(answers), answers[0]["glossed"]), (1, True))
        write(self.root, "b.jsonl", [user("t"), answer("t", "premium", mid="m2"), answer("t", "(เบี้ย)", mid="m2"),
                                     answer("t", "premium (x)", mid="m3")])
        self.assertEqual([a["glossed"] for a in self.collect() if a["session"] == "t"], [True, False])

    def test_duplicate_uuid_counted_once(self):
        dup = answer("s", GLOSSED, uuid="same")
        write(self.root, "a.jsonl", [user("s"), dup])
        write(self.root, "b.jsonl", [dup])
        self.assertEqual(len(self.collect()), 1)

    def test_malformed_lines_skipped(self):
        write(self.root, "s.jsonl", [user("s"), answer("s", GLOSSED)], raw=["not json", "{", "[1, 2]", '"str"', ""])
        self.assertEqual(len(self.collect()), 1)

    def test_since_filter(self):
        write(self.root, "s.jsonl", [user("s"), answer("s", GLOSSED, ts="2026-09-01T10:00:00Z"),
                                      answer("s", GLOSSED, ts="2026-09-09T10:00:00Z")])
        self.assertEqual(len(self.collect()), 2)
        self.assertEqual(len(self.collect(since="2026-09-05")), 1)
        out = Path(self.root, "out.json")
        code, _ = run("--store", self.root, "--terms", "premium", "--since", "2026-09-05", "--json", str(out))
        data = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual((code, data["answers"], data["since"]), (0, 1, "2026-09-05"))


class CliTests(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.root = self._td.name

    def test_terms_file_with_comments(self):
        write(self.root, "s.jsonl", [user("s"), answer("s", "The claim (เคลม) is filed."), answer("s", "premium (x)")])
        terms = Path(self.root, "terms.txt")
        terms.write_text("# domain terms\nclaim\n\n  \n", encoding="utf-8")
        self.assertEqual(gloss_rate.parse_terms("@" + str(terms)), ["claim"])
        out = Path(self.root, "out.json")
        code, text = run("--store", self.root, "--terms", "@" + str(terms), "--json", str(out))
        data = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual((code, data["answers"], data["glossed"]), (0, 1, 1))
        self.assertIn("simple-en", text)
        self.assertIn("first-use", text)

    def test_empty_store_exits_zero_with_message(self):
        code, text = run("--store", self.root, "--terms", "premium")
        self.assertEqual(code, 0)
        self.assertIn("no main-conversation answers", text)

    def test_terms_required_without_leak_check(self):
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as ctx:
            gloss_rate.main(["--store", self.root])
        self.assertEqual(ctx.exception.code, 2)

    def test_leak_check_hit_in_subagent_hook_attachment(self):
        for i, kind in enumerate(("hook_success", "hook_additional_context")):
            path = write(self.root, "s/subagents/agent-%d.jsonl" % i, [hook("s", "domain-gloss ON (th): keep terms", kind)])
        code, text = run("--store", self.root, "--leak-check")
        self.assertEqual(code, 1)
        self.assertIn(str(path), text)
        self.assertIn("2 subagent record(s) in 2 file(s)", text)

    def test_leak_check_hit_in_sidechain_attachment(self):
        write(self.root, "s.jsonl", [hook("s", "domain-gloss ON (th)", side=True)])
        self.assertEqual(run("--store", self.root, "--leak-check")[0], 1)

    def test_leak_check_main_session_attachment_is_not_a_leak(self):
        write(self.root, "s.jsonl", [hook("s", "domain-gloss ON (th): reminder", side=False), answer("s", "ok")])
        write(self.root, "s/subagents/agent-1.jsonl", [answer("s", "clean", side=True)], raw=["garbage"])
        code, text = run("--store", self.root, "--leak-check")
        self.assertEqual(code, 0)
        self.assertIn("0 subagent record(s) in 0 file(s)", text)

    def test_leak_check_quoted_needle_in_subagent_is_not_a_leak(self):
        needle = "domain-gloss ON (th): keep terms"
        quoted = rec("user", "s", [{"type": "tool_result", "content": needle}], side=True)
        skill_listing = hook("s", needle, kind="skill_listing")
        write(self.root, "s/subagents/agent-1.jsonl", [quoted, answer("s", "I read: " + needle, side=True), skill_listing])
        code, text = run("--store", self.root, "--leak-check")
        self.assertEqual(code, 0)
        self.assertIn("0 subagent record(s) in 0 file(s)", text)

    def test_missing_store_is_an_error_in_both_modes(self):
        missing = str(Path(self.root, "nope"))
        for extra in (["--terms", "premium"], ["--leak-check"]):
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                code, out = run("--store", missing, *extra)
            self.assertEqual((code, out), (2, ""))
            self.assertIn("store not found", err.getvalue())


class DefaultStoreTests(unittest.TestCase):
    def setUp(self):
        self._td = tempfile.TemporaryDirectory()
        self.addCleanup(self._td.cleanup)
        self.projects = Path(self._td.name, "projects")
        env = mock.patch.dict(os.environ, {"CLAUDE_CONFIG_DIR": self._td.name})
        env.start()
        self.addCleanup(env.stop)

    def test_folds_every_non_alphanumeric_char(self):
        (self.projects / "-tmp-my-proj-x-y--hidden").mkdir(parents=True)
        self.assertEqual(gloss_rate.default_store("/tmp/my.proj_x y/.hidden"), self.projects / "-tmp-my-proj-x-y--hidden")

    def test_falls_back_to_slash_only_slug(self):
        (self.projects / "-tmp-my.proj").mkdir(parents=True)
        self.assertEqual(gloss_rate.default_store("/tmp/my.proj"), self.projects / "-tmp-my.proj")

    def test_prefers_folded_slug_and_defaults_to_it_when_none_exist(self):
        (self.projects / "-tmp-a-b").mkdir(parents=True)
        (self.projects / "-tmp-a.b").mkdir()
        self.assertEqual(gloss_rate.default_store("/tmp/a.b"), self.projects / "-tmp-a-b")
        self.assertEqual(gloss_rate.default_store("/tmp/none.x"), self.projects / "-tmp-none-x")


if __name__ == "__main__":
    unittest.main()
