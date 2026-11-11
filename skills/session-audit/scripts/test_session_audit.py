import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
import session_audit

# Sample vocabulary for the D4 fixtures. The scanner ships no defaults on purpose --
# money_terms and truth_paths are per-repo config -- so the tests supply their own.
MONEY = ["premium", "surrender", "surrender value", "cash value", "CV", "NFO", "maturity", "ANB"]
TRUTH = ["truth-repo", "docs/kb", "wiki_query"]

def rec(kind, sid, stamp, content, side=False):
    return {"type": kind, "sessionId": sid, "timestamp": stamp, "isSidechain": side, "message": {"content": content}}

def assistant(sid, stamp, blocks, side=False):
    return rec("assistant", sid, stamp, blocks, side)

def tool(name, **inp):
    return {"type": "tool_use", "name": name, "input": inp}

class AuditTests(unittest.TestCase):
    def run_fixture(self, records):
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            sessions = session_audit.scan(td, 1, None, ["premium"], ["truth"])
            return sessions[0].prompts()[0]["label"]

    def test_loop(self):
        blocks = [tool("Bash", command="same")]
        records = [rec("user", "loop", "2026-09-10T00:00:00Z", "repeat")]
        records += [assistant("loop", "2026-09-10T00:%02d:00Z" % (i % 60), blocks) for i in range(15)]
        records += [rec("user", "loop", "2026-09-10T01:00:00Z", "done")]
        self.assertEqual(self.run_fixture(records), "LOOP")

    def test_grind(self):
        records = [rec("user", "grind", "2026-09-10T00:00:00Z", "work")]
        for i in range(40): records.append(assistant("grind", "2026-09-10T00:%02d:00Z" % (i % 60), [tool("Bash", command="cmd%d" % i)]))
        records += [rec("user", "grind", "2026-09-10T01:00:00Z", "done")]
        self.assertEqual(self.run_fixture(records), "GRIND")

    def test_ok(self):
        records = [rec("user", "ok", "2026-09-10T00:00:00Z", "work"), assistant("ok", "2026-09-10T00:01:00Z", [ {"type":"text", "text":"I checked the result and will continue."}, tool("Read", file_path="x")]), rec("user", "ok", "2026-09-10T00:02:00Z", "done")]
        self.assertEqual(self.run_fixture(records), "OK")

    def test_prompt_unwrap(self):
        records = [rec("user", "unwrap", "2026-09-10T00:00:00Z", "<local-command-caveat>ignore</local-command-caveat>\nreal ask here"), assistant("unwrap", "2026-09-10T00:01:00Z", [])]
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            session = session_audit.scan(td, 1, None, MONEY, TRUTH)[0]
            self.assertEqual(session.first_prompt, "real ask here")
            self.assertEqual(session.prompts()[0]["prompt"], "real ask here")

    def test_worker_excluded_unless_requested(self):
        records = [rec("user", "worker", "2026-09-10T00:00:00Z", "<teammate-message role='x'>You are a subagent..."), assistant("worker", "2026-09-10T00:01:00Z", [])]
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            self.assertEqual(session_audit.scan(td, 1, None, ["premium"], ["truth"]), [])
            included = session_audit.scan(td, 1, None, ["premium"], ["truth"], True)
            self.assertEqual(included[0].kind, "worker")

    def test_d1_bash_checklist_in_first_six_passes(self):
        records = [rec("user", "d1", "2026-09-10T00:00:00Z", "work")]
        for i in range(15):
            command = "cat > .planning/STATE-x.md <<'EOF'" if i == 4 else "echo %d" % i
            records.append(assistant("d1", "2026-09-10T00:%02d:00Z" % (i + 1), [tool("Bash", command=command)]))
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            session = session_audit.scan(td, 1, None, ["premium"], ["truth"])[0]
            status = {r["detector"]: r["status"] for r in session_audit.detector_rows(session, session_audit.DEFAULT_WINDOWS)}["D1"]
            self.assertEqual(status, "PASS")

    def test_workflow_script_model_counts(self):
        records = [rec("user", "wf", "2026-09-10T00:00:00Z", "work"), assistant("wf", "2026-09-10T00:01:00Z", [tool("Workflow", script="model: 'haiku'\nsteps: []")])]
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            session = session_audit.scan(td, 1, None, ["premium"], ["truth"])[0]
            self.assertEqual(session.agent_with_model, 1)

    def test_money_boundaries_in_prompts(self):
        records = [rec("user", "bounds", "2026-09-10T00:00:00Z", "please check the info and the reserved seats"), assistant("bounds", "2026-09-10T00:01:00Z", [])]
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            session = session_audit.scan(td, 1, None, MONEY, TRUTH)[0]
            self.assertEqual(session.prompt_hits, 0)

    def test_topic_terms_from_assistant_text(self):
        records = [rec("user", "topic", "2026-09-10T00:00:00Z", "work"), assistant("topic", "2026-09-10T00:01:00Z", [{"type": "text", "text": "the NFO table and the CV formula and the surrender value"}])]
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            session = session_audit.scan(td, 1, None, MONEY, TRUTH)[0]
            self.assertEqual(session.topic_terms, {"nfo", "cv", "surrender value"})

    def test_d4_topic_threshold_and_truth_path(self):
        text = "premium premium NFO NFO CV CV surrender value surrender value cash value cash value ANB ANB"
        base = [rec("user", "d4", "2026-09-10T00:00:00Z", "issue"), assistant("d4", "2026-09-10T00:01:00Z", [{"type": "text", "text": text}])]
        with tempfile.TemporaryDirectory() as td:
            path = Path(td, "x.jsonl"); path.write_text("\n".join(json.dumps(r) for r in base))
            session = session_audit.scan(td, 1, None, MONEY, TRUTH)[0]
            self.assertEqual(session.topic_hits, 12)
            self.assertEqual({r["status"] for r in session_audit.detector_rows(session, session_audit.DEFAULT_WINDOWS) if r["detector"] == "D4"}, {"FAIL"})
            with path.open("a") as fh: fh.write("\n" + json.dumps(assistant("d4", "2026-09-10T00:02:00Z", [tool("Bash", command="grep truth-repo/ file")])))
            session = session_audit.scan(td, 1, None, MONEY, TRUTH)[0]
            self.assertEqual({r["status"] for r in session_audit.detector_rows(session, session_audit.DEFAULT_WINDOWS) if r["detector"] == "D4"}, {"PASS"})

    def test_d4_is_na_without_configured_topics(self):
        records = [rec("user", "d4na", "2026-09-10T00:00:00Z", "issue"),
                   assistant("d4na", "2026-09-10T00:01:00Z", [{"type": "text", "text": "premium " * 20}])]
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            session = session_audit.scan(td, 1, None, session_audit.DEFAULT_MONEY, session_audit.DEFAULT_TRUTH)[0]
            rows = {r["detector"]: r["status"] for r in session_audit.detector_rows(session, session_audit.DEFAULT_WINDOWS)}
            self.assertEqual(rows["D4"], "N/A")
            self.assertNotEqual(rows["D2"], "N/A")

    def test_empty_windows_keep_every_detector_applicable(self):
        records = [rec("user", "old", "2020-01-01T00:00:00Z", "work"), assistant("old", "2020-01-01T00:01:00Z", [])]
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            session = session_audit.scan(td, 1, None, MONEY, TRUTH)[0]
            rows = {r["detector"]: r["status"] for r in session_audit.detector_rows(session, session_audit.DEFAULT_WINDOWS)}
            self.assertNotIn("N/A", [rows[d] for d in session_audit.DETECTORS])
            windowed = {r["detector"]: r["status"] for r in session_audit.detector_rows(session, {"D2": "2026-08-26"})}
            self.assertEqual(windowed["D2"], "N/A")

    def test_null_bash_command_does_not_crash_d6(self):
        records = [rec("user", "null", "2026-09-10T00:00:00Z", "work"),
                   assistant("null", "2026-09-10T00:01:00Z", [tool("Agent", prompt="go", model="haiku"),
                                                              {"type": "tool_use", "name": "Bash", "input": {"command": None}}])]
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            session = session_audit.scan(td, 1, None, MONEY, TRUTH)[0]
            rows = {r["detector"]: r["status"] for r in session_audit.detector_rows(session, session_audit.DEFAULT_WINDOWS)}
            self.assertEqual(rows["D6"], "FAIL")

class ClaudeProblemTests(unittest.TestCase):
    def test_malformed_line_is_counted_and_rest_audits(self):
        records = [rec("user", "bad", "2026-09-10T00:00:00Z", "work"), assistant("bad", "2026-09-10T00:01:00Z", [])]
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text(json.dumps(records[0]) + "\n{not json\n\n" + json.dumps(records[1]) + "\n")
            problems = []
            sessions = session_audit.scan(td, 1, None, MONEY, TRUTH, problems=problems)
            self.assertEqual(sessions[0].assistant, 1)
            self.assertEqual([(p["kind"], p["detail"]) for p in problems], [("malformed_lines", "1 line(s) skipped")])

# Keys the Claude JSON report carried before Pi support (T5); Claude output must keep them.
PRE_T5_TOP = {"store", "sessions", "prompts", "aggregates"}
PRE_T5_SESSION = {"session_id", "kind", "assistant_turns", "money_hits", "prompt_hits", "topic_hits", "topic_terms", "truth_paths", "detectors"}
PRE_T5_AGGREGATES = {"labels", "agent_calls", "agent_calls_with_model", "off_claude", "tokens_per_model", "token_fields_per_model", "subagent_tokens_per_model"}

class ClaudeCliTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(os.path.realpath(tmp.name))
        self.addCleanup(os.chdir, os.getcwd())

    def run_main(self, *argv):
        out_path = self.root / "out.json"
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            session_audit.main(list(argv) + ["--min-turns", "1", "--json", str(out_path)])
        return buffer.getvalue(), json.loads(out_path.read_text())

    def write_session(self, directory, sid):
        directory.mkdir(parents=True, exist_ok=True)
        records = [rec("user", sid, "2026-09-10T00:00:00Z", "work"),
                   {"type": "assistant", "sessionId": sid, "timestamp": "2026-09-10T00:01:00Z",
                    "message": {"id": "m-" + sid, "model": "x", "content": [{"type": "text", "text": "the work is done now"}], "usage": {"input_tokens": 1, "output_tokens": 5}}}]
        path = directory / (sid + ".jsonl")
        path.write_text("\n".join(json.dumps(r) for r in records) + "\n")
        return path

    def test_default_store_is_current_project_under_claude_config_dir(self):
        old = os.environ.get("CLAUDE_CONFIG_DIR")
        self.addCleanup(lambda: os.environ.__setitem__("CLAUDE_CONFIG_DIR", old) if old is not None else os.environ.pop("CLAUDE_CONFIG_DIR", None))
        config = self.root / "config"
        os.environ["CLAUDE_CONFIG_DIR"] = str(config)
        project_a, project_b = self.root / "projA", self.root / "projB"
        project_a.mkdir()
        project_b.mkdir()
        os.chdir(project_a)
        store_a = config / "projects" / os.getcwd().replace("/", "-")
        self.write_session(store_a, "sa")
        self.write_session(config / "projects" / str(project_b).replace("/", "-"), "sb")
        out, data = self.run_main()
        self.assertEqual([s["session_id"] for s in data["sessions"]], ["sa"])
        self.assertEqual((data["harness"], data["store"]), ("claude", str(store_a)))
        self.assertTrue(out.startswith("harness: claude\n"))

    @unittest.skipIf(hasattr(os, "geteuid") and os.geteuid() == 0, "root can read a chmod 000 file")
    def test_unreadable_file_is_a_problem_and_rest_audits(self):
        store = self.root / "store"
        self.write_session(store, "good")
        locked = self.write_session(store, "locked")
        os.chmod(locked, 0)
        self.addCleanup(os.chmod, locked, 0o600)
        out, data = self.run_main("--store", str(store))
        self.assertEqual([s["session_id"] for s in data["sessions"]], ["good"])
        self.assertEqual(data["problems"], [{"kind": "unreadable", "path": str(locked), "detail": "file could not be read"}])
        self.assertIn("unreadable", out)

    def test_claude_json_keeps_pre_t5_shape(self):
        store = self.root / "store"
        self.write_session(store, "one")
        self.write_session(store, "two")
        _, data = self.run_main("--store", str(store))
        self.assertTrue(PRE_T5_TOP <= set(data), set(data))
        self.assertEqual(set(data["aggregates"]), PRE_T5_AGGREGATES)
        for key in PRE_T5_AGGREGATES:
            self.assertIsNotNone(data["aggregates"][key], key)
        self.assertEqual(data["aggregates"]["tokens_per_model"], {"x": 10})
        for session in data["sessions"]:
            self.assertTrue(PRE_T5_SESSION <= set(session), set(session))
            for key in PRE_T5_SESSION:
                self.assertIsNotNone(session[key], key)
            self.assertNotIn("lineage", session)
        self.assertEqual(data["problems"], [])
        self.assertNotIn("files", data)

if __name__ == "__main__": unittest.main()
