import json
import tempfile
import unittest
from pathlib import Path
import session_audit

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
            session = session_audit.scan(td, 1, None, session_audit.DEFAULT_MONEY, session_audit.DEFAULT_TRUTH)[0]
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
            session = session_audit.scan(td, 1, None, session_audit.DEFAULT_MONEY, session_audit.DEFAULT_TRUTH)[0]
            self.assertEqual(session.prompt_hits, 0)

    def test_topic_terms_from_assistant_text(self):
        records = [rec("user", "topic", "2026-09-10T00:00:00Z", "work"), assistant("topic", "2026-09-10T00:01:00Z", [{"type": "text", "text": "the NFO table and the CV formula and the surrender value"}])]
        with tempfile.TemporaryDirectory() as td:
            Path(td, "x.jsonl").write_text("\n".join(json.dumps(r) for r in records))
            session = session_audit.scan(td, 1, None, session_audit.DEFAULT_MONEY, session_audit.DEFAULT_TRUTH)[0]
            self.assertEqual(session.topic_terms, {"nfo", "cv", "surrender value"})

    def test_d4_topic_threshold_and_truth_path(self):
        text = "premium premium NFO NFO CV CV surrender value surrender value cash value cash value ANB ANB"
        base = [rec("user", "d4", "2026-09-10T00:00:00Z", "issue"), assistant("d4", "2026-09-10T00:01:00Z", [{"type": "text", "text": text}])]
        with tempfile.TemporaryDirectory() as td:
            path = Path(td, "x.jsonl"); path.write_text("\n".join(json.dumps(r) for r in base))
            session = session_audit.scan(td, 1, None, session_audit.DEFAULT_MONEY, session_audit.DEFAULT_TRUTH)[0]
            self.assertEqual(session.topic_hits, 12)
            self.assertEqual({r["status"] for r in session_audit.detector_rows(session, session_audit.DEFAULT_WINDOWS) if r["detector"] == "D4"}, {"FAIL"})
            with path.open("a") as fh: fh.write("\n" + json.dumps(assistant("d4", "2026-09-10T00:02:00Z", [tool("Bash", command="grep clife-core/ file")])))
            session = session_audit.scan(td, 1, None, session_audit.DEFAULT_MONEY, session_audit.DEFAULT_TRUTH)[0]
            self.assertEqual({r["status"] for r in session_audit.detector_rows(session, session_audit.DEFAULT_WINDOWS) if r["detector"] == "D4"}, {"PASS"})

if __name__ == "__main__": unittest.main()
