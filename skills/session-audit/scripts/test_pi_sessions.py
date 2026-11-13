import contextlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path

import pi_sessions
import session_audit


def stamp(n):
    return "2026-09-10T%02d:%02d:00.000Z" % (n // 60, n % 60)


def header(sid="sess", cwd="/proj", version=3, **extra):
    head = {"type": "session", "id": sid, "timestamp": stamp(0), "cwd": cwd}
    if version is not None:
        head["version"] = version
    head.update(extra)
    return head


def message(eid, parent, role, content, n=1, **extra):
    body = {"role": role, "content": content}
    body.update(extra)
    return {"type": "message", "id": eid, "parentId": parent, "timestamp": stamp(n), "message": body}


def call(name, **args):
    return {"type": "toolCall", "id": "c", "name": name, "arguments": args}


def write(path, lines):
    path.write_text("\n".join(x if isinstance(x, str) else json.dumps(x) for x in lines) + "\n")
    return path


def tokens(i, o, r=0, w=0):
    return {"input": i, "output": o, "cacheRead": r, "cacheWrite": w}


def linear(count, tool=None, prefix="e", tools_per_turn=1):
    """user, then `count` assistant turns, each (optionally) with a tool call; ids prefix0, prefix1, ..."""
    out = [message(prefix + "0", None, "user", "do the work", 1)]
    for i in range(1, count + 1):
        blocks = [{"type": "text", "text": "thinking about step %d of the work here" % i}]
        if tool:
            blocks += [tool(i)] * tools_per_turn
        out.append(message("%s%d" % (prefix, i), "%s%d" % (prefix, i - 1), "assistant", blocks, 1 + i, model="m1"))
    return out


class PiCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(os.path.realpath(self.tmp.name))
        self.project = self.root / "proj"
        self.project.mkdir()
        self.store = self.root / "store"
        self.store.mkdir()
        self.cwd = os.getcwd()
        self.addCleanup(os.chdir, self.cwd)

    def run_cli(self, *argv, json_name="out.json", min_turns="1"):
        out_path = self.root / json_name
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            session_audit.main(list(argv) + ["--min-turns", min_turns, "--json", str(out_path)])
        return buffer.getvalue(), json.loads(out_path.read_text())

    def pi(self, *argv, **kw):
        return self.run_cli("--harness", "pi", *argv, **kw)

    def detectors(self, data, index=0):
        return {r["detector"]: r for r in data["sessions"][index]["detectors"]}


class ReaderTests(PiCase):
    def test_dir_encoding(self):
        self.assertEqual(pi_sessions.encode_project_dir("/Users/a/.config"), "--Users-a-.config--")
        self.assertEqual(pi_sessions.encode_project_dir("C:\\Users\\a"), "--C--Users-a--")

    def test_default_store_uses_pi_coding_agent_dir(self):
        old = os.environ.get("PI_CODING_AGENT_DIR")
        self.addCleanup(lambda: os.environ.__setitem__("PI_CODING_AGENT_DIR", old) if old is not None else os.environ.pop("PI_CODING_AGENT_DIR", None))
        os.environ["PI_CODING_AGENT_DIR"] = str(self.root / "agent")
        self.assertEqual(pi_sessions.default_store("/a/b"), self.root / "agent" / "sessions" / "--a-b--")

    def test_default_leaf_is_last_appended_and_abandoned_branch_not_counted(self):
        lines = [header(), message("r", None, "user", "go", 1),
                 message("a1", "r", "assistant", [call("bash", command="old")], 2),
                 message("b1", "r", "assistant", [call("bash", command="new"), call("read", path="x")], 3)]
        res = pi_sessions.load_file(write(self.store / "a.jsonl", lines))
        path, info = pi_sessions.select_path(res)
        self.assertEqual([e["id"] for e in path], ["r", "b1"])
        self.assertEqual((info["leaf_id"], info["leaf_source"], info["abandoned_entries"]), ("b1", "last-appended", 1))
        session = session_audit.Session("s", "pi")
        for rec in pi_sessions.to_records(res, path):
            session.add(rec, [], [])
        self.assertEqual([t["name"] for t in session.tools], ["bash", "read"])

    def test_explicit_leaf_and_leaf_not_found(self):
        lines = [header(), message("r", None, "user", "go", 1), message("a1", "r", "assistant", [call("bash", command="x")], 2), message("b1", "r", "assistant", "hi", 3)]
        res = pi_sessions.load_file(write(self.store / "a.jsonl", lines))
        path, info = pi_sessions.select_path(res, leaf="a1")
        self.assertEqual(([e["id"] for e in path], info["leaf_source"]), (["r", "a1"], "explicit"))
        res = pi_sessions.load_file(self.store / "a.jsonl")
        self.assertIsNone(pi_sessions.select_path(res, leaf="zzz")[0])
        self.assertEqual(res.unavailable, "leaf_not_found")

    def test_malformed_last_line_is_leaf_unknown_but_explicit_leaf_works(self):
        lines = [header(), message("r", None, "user", "go", 1), message("a1", "r", "assistant", "hello there friend", 2), "{not json"]
        write(self.store / "a.jsonl", lines)
        res = pi_sessions.load_file(self.store / "a.jsonl")
        self.assertTrue(res.last_line_malformed)
        self.assertIsNone(pi_sessions.select_path(res)[0])
        self.assertEqual(res.unavailable, "leaf_unknown")
        res = pi_sessions.load_file(self.store / "a.jsonl")
        self.assertIsNotNone(pi_sessions.select_path(res, leaf="a1")[0])

    def test_malformed_middle_line_audits_incomplete(self):
        lines = [header(), message("r", None, "user", "go", 1), "{broken", message("a1", "r", "assistant", "hello there friend", 2)]
        res = pi_sessions.load_file(write(self.store / "a.jsonl", lines))
        path, _ = pi_sessions.select_path(res)
        self.assertEqual(len(path), 2)
        self.assertFalse(res.complete)
        self.assertEqual(res.malformed, 1)

    def test_broken_parent_and_cycle_are_unavailable(self):
        res = pi_sessions.load_file(write(self.store / "a.jsonl", [header(), message("a1", "ghost", "assistant", "x", 1)]))
        self.assertIsNone(pi_sessions.select_path(res)[0])
        self.assertEqual(res.unavailable, "broken_lineage")
        self.assertIn("ghost", res.problems[-1]["detail"])
        res = pi_sessions.load_file(write(self.store / "b.jsonl", [header(), message("a", "b", "user", "x", 1), message("b", "a", "assistant", "y", 2)]))
        pi_sessions.select_path(res)
        self.assertEqual(res.unavailable, "lineage_cycle")

    def test_v1_linear_never_migrated_and_leaf_rejected(self):
        v1 = [header(version=None), {"type": "message", "timestamp": stamp(1), "message": {"role": "user", "content": "go"}},
              {"type": "message", "timestamp": stamp(2), "message": {"role": "hookMessage", "content": "ignore me"}},
              {"type": "message", "timestamp": stamp(3), "message": {"role": "assistant", "content": [{"type": "text", "text": "a reply of decent length"}]}}]
        path = write(self.store / "a.jsonl", v1)
        before = path.read_bytes()
        res = pi_sessions.load_file(path)
        entries, info = pi_sessions.select_path(res)
        self.assertEqual((len(entries), info["leaf_source"]), (3, "v1-linear"))
        kinds = [r["type"] for r in pi_sessions.to_records(res, entries)]
        self.assertEqual(kinds, ["user", "assistant"])
        self.assertEqual(path.read_bytes(), before)
        res = pi_sessions.load_file(path)
        self.assertIsNone(pi_sessions.select_path(res, leaf="x")[0])
        self.assertEqual(res.unavailable, "leaf_unsupported_v1")

    def test_unsupported_version(self):
        for version in (9, "3", 2.5):
            res = pi_sessions.load_file(write(self.store / "a.jsonl", [header(version=version)]))
            self.assertEqual(res.unavailable, "unsupported_version")

    def test_missing_header_and_unreadable(self):
        res = pi_sessions.load_file(write(self.store / "a.jsonl", [message("r", None, "user", "x", 1)]))
        self.assertEqual(res.unavailable, "missing_header")
        res = pi_sessions.load_file(self.store / "nope.jsonl")
        self.assertEqual(res.unavailable, "unreadable")

    def test_missing_fields_never_crash(self):
        entries = [header(),
                   {"type": "message", "id": "r", "parentId": None, "timestamp": stamp(1), "message": {"role": "user"}},
                   {"type": "message", "id": "m", "parentId": "r", "timestamp": stamp(2)},
                   {"type": "message", "id": "t", "parentId": "m", "message": {"role": "assistant", "content": "an answer long enough"}},
                   {"type": "message", "parentId": "t", "timestamp": stamp(3), "message": {"role": "user", "content": "no id"}},
                   {"type": "message", "id": "p", "timestamp": stamp(4), "message": {"role": "user", "content": "no parent"}},
                   message("leaf", "t", "assistant", "final", 5)]
        res = pi_sessions.load_file(write(self.store / "a.jsonl", entries))
        path, _ = pi_sessions.select_path(res)
        pi_sessions.to_records(res, path)
        fields = {p["detail"].split("field ")[1].split(" ")[0] for p in res.problems if p["kind"] == "missing_field"}
        self.assertTrue({"id", "parentId", "timestamp", "content", "message"} <= fields | {"message"}, fields)
        self.assertTrue({"id", "parentId", "timestamp", "content"} <= fields, fields)
        self.assertFalse(res.complete)
        # entry whose message key is absent
        res = pi_sessions.load_file(write(self.store / "b.jsonl", [header(), {"type": "message", "id": "x", "parentId": None, "timestamp": stamp(1)}]))
        path, _ = pi_sessions.select_path(res)
        pi_sessions.to_records(res, path)
        self.assertIn("message", " ".join(p["detail"] for p in res.problems))

    def test_problem_details_hold_no_transcript_text(self):
        secret = "SECRET-PROMPT-TEXT"
        lines = [header(), message("r", None, "user", secret, 1), "{" + secret, message("a", "r", "assistant", secret, 2)]
        res = pi_sessions.load_file(write(self.store / "a.jsonl", lines))
        pi_sessions.select_path(res)
        pi_sessions.to_records(res, res.entries)
        self.assertNotIn(secret, json.dumps(res.problems))

    def test_usage_scopes_buckets_and_no_double_count(self):
        def use(i, o, r, w):
            return {"input": i, "output": o, "cacheRead": r, "cacheWrite": w}
        lines = [header(), message("r", None, "user", "go", 1),
                 message("a1", "r", "assistant", "step one is done now", 2, model="m1", usage=use(1, 2, 3, 4)),
                 message("t1", "a1", "toolResult", [], 3, usage=use(100, 100, 100, 100)),
                 {"type": "compaction", "id": "c1", "parentId": "t1", "timestamp": stamp(4), "usage": use(10, 20, 30, 40), "summary": "s"},
                 {"type": "usage", "id": "u1", "parentId": "c1", "timestamp": stamp(5), "kind": "cache_warm", "model": "m2", "usage": use(0, 0, 50, 0)},
                 {"type": "branch_summary", "id": "bs", "parentId": "r", "timestamp": stamp(6), "fromId": "a1", "usage": use(5, 5, 5, 5)},
                 message("a2", "bs", "assistant", "other branch answer", 7, model="m1", usage=use(7, 0, 0, 0))]
        res = pi_sessions.load_file(write(self.store / "a.jsonl", lines))
        path, _ = pi_sessions.select_path(res)
        usage = pi_sessions.usage_totals(res, path)
        self.assertEqual([e["id"] for e in path], ["r", "bs", "a2"])
        self.assertEqual(usage["path"]["total"], {"input_tokens": 12, "output_tokens": 5, "cache_read_input_tokens": 5, "cache_creation_input_tokens": 5})
        self.assertEqual(sorted(usage["path"]["buckets"]), ["assistant", "branch_summary"])
        file_total = usage["file"]["total"]
        self.assertEqual(file_total, {"input_tokens": 1 + 10 + 0 + 5 + 7, "output_tokens": 2 + 20 + 0 + 5, "cache_read_input_tokens": 3 + 30 + 50 + 5, "cache_creation_input_tokens": 4 + 40 + 5})
        self.assertEqual(usage["file"]["buckets"]["usage_entry"]["by_kind"]["cache_warm"]["cache_read_input_tokens"], 50)
        self.assertEqual(usage["file"]["buckets"]["assistant"]["by_model"]["m1"]["input_tokens"], 8)
        self.assertEqual(usage["file"]["buckets"]["usage_entry"]["by_model"]["m2"]["cache_read_input_tokens"], 50)
        self.assertEqual(usage["file"]["tool_result (not in totals)"]["total"]["input_tokens"], 100)
        self.assertNotIn("tool_result (not in totals)", usage["file"]["buckets"])
        self.assertNotIn("tool_result (not in totals)", usage["path"])

    def test_usage_unavailable_when_absent(self):
        res = pi_sessions.load_file(write(self.store / "a.jsonl", [header(), message("r", None, "user", "go", 1), message("a", "r", "assistant", "hi", 2)]))
        path, _ = pi_sessions.select_path(res)
        usage = pi_sessions.usage_totals(res, path)
        self.assertEqual((usage["path"]["total"], usage["file"]["total"], usage["path"]["buckets"]), ("unavailable", "unavailable", {}))


class CliTests(PiCase):
    def test_default_project_dir_and_cwd_mismatch_excluded_in_shared_dir(self):
        old = os.environ.get("PI_CODING_AGENT_DIR")
        self.addCleanup(lambda: os.environ.__setitem__("PI_CODING_AGENT_DIR", old) if old is not None else os.environ.pop("PI_CODING_AGENT_DIR", None))
        os.environ["PI_CODING_AGENT_DIR"] = str(self.root / "agent")
        os.chdir(self.project)
        cwd = os.getcwd()
        shared = pi_sessions.default_store(cwd)
        shared.mkdir(parents=True)
        write(shared / "mine.jsonl", [header("mine", cwd)] + linear(2))
        write(shared / "other.jsonl", [header("other", "/somewhere/else")] + linear(2))
        out, data = self.pi()
        self.assertEqual((data["harness"], data["selection"], data["project"]), ("pi", "default-project-dir", cwd))
        self.assertEqual([s["session_id"] for s in data["sessions"]], ["mine"])
        self.assertEqual(data["files"]["excluded_other_project"], 1)
        self.assertIn("harness: pi", out)
        self.assertIn("selection: default-project-dir", out)

    def test_project_flag_with_explicit_store(self):
        other = self.root / "other-project"
        other.mkdir()
        write(self.store / "a.jsonl", [header("a", str(other))] + linear(2))
        write(self.store / "b.jsonl", [header("b", str(self.project))] + linear(2))
        _, data = self.pi("--store", str(self.store), "--project", str(other))
        self.assertEqual(([s["session_id"] for s in data["sessions"]], data["selection"], data["files"]["excluded_other_project"]), (["a"], "explicit-dir", 1))
        _, data = self.pi("--store", str(self.store), "--project", str(self.root / "nobody"))
        self.assertTrue(data["no_usable_sessions"])
        self.assertEqual(data["reasons"], {"excluded_other_project": 2})

    def test_store_scan_is_not_recursive(self):
        (self.store / "sub").mkdir()
        write(self.store / "sub" / "deep.jsonl", [header("deep", str(self.project))] + linear(2))
        _, data = self.pi("--store", str(self.store), "--project", str(self.project))
        self.assertTrue(data["no_usable_sessions"])
        self.assertEqual(data["files"]["found"], 0)

    def test_session_file_skips_cwd_check_and_leaf_selects_branch(self):
        lines = [header("sf", "/not/the/project"), message("r", None, "user", "go", 1), message("a1", "r", "assistant", [call("bash", command="one")], 2), message("b1", "r", "assistant", [call("read", path="x"), call("read", path="y")], 3)]
        path = write(self.store / "x.jsonl", lines)
        _, data = self.pi("--session-file", str(path))
        self.assertEqual((data["selection"], data["project"], data["sessions"][0]["lineage"]["leaf_id"]), ("explicit-files", None, "b1"))
        self.assertEqual(data["sessions"][0]["lineage"]["cwd"], "/not/the/project")
        _, data = self.pi("--session-file", str(path), "--leaf", "a1")
        lineage = data["sessions"][0]["lineage"]
        self.assertEqual((lineage["leaf_id"], lineage["leaf_source"], lineage["path_entries"], lineage["abandoned_entries"]), ("a1", "explicit", 2, 1))

    def test_argument_errors(self):
        path = write(self.store / "x.jsonl", [header()] + linear(1))
        cases = [["--harness", "claude", "--session-file", str(path)], ["--harness", "claude", "--leaf", "x"], ["--harness", "claude", "--project", "/x"],
                 ["--harness", "pi", "--leaf", "x"], ["--harness", "pi", "--session-file", str(path), "--session-file", str(path), "--leaf", "x"],
                 ["--harness", "pi", "--session-file", str(path), "--store", str(self.store)]]
        for argv in cases:
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as ctx:
                session_audit.main(argv)
            self.assertEqual(ctx.exception.code, 2)

    def test_fork_reported_and_excluded_from_aggregate(self):
        usage = {"input": 10, "output": 1, "cacheRead": 0, "cacheWrite": 0}
        base = [message("r", None, "user", "go", 1), message("a", "r", "assistant", "an answer of some length", 2, model="m", usage=usage)]
        write(self.store / "parent.jsonl", [header("parent", str(self.project))] + base)
        write(self.store / "fork.jsonl", [header("fork", str(self.project), parentSession="/elsewhere/parent.jsonl")] + base)
        out, data = self.pi("--store", str(self.store), "--project", str(self.project))
        by_id = {s["session_id"]: s for s in data["sessions"]}
        self.assertEqual((by_id["fork"]["lineage"]["parent_session"], by_id["fork"]["lineage"]["lineage_followed"]), ("/elsewhere/parent.jsonl", False))
        agg = data["aggregates"]["usage"]
        self.assertEqual(agg["total"]["input_tokens"], 10)
        self.assertEqual([x["session_id"] for x in agg["excluded_forks"]], ["fork"])
        self.assertEqual(agg["label"], "aggregate path usage (excluding 1 forked sessions)")
        note = "1 forked sessions include copied history; detector rates may double-count"
        self.assertIn(note, out)
        self.assertIn(note, data["aggregates"]["notes"])

    def test_detector_applicability_and_d1_write(self):
        lines = [header("d", str(self.project)), message("r", None, "user", "go", 1)]
        parent = "r"
        for i in range(16):
            block = call("write", path="/p/.planning/STATE.md", content="x") if i == 2 else call("bash", command="echo %d" % i)
            lines.append(message("a%d" % i, parent, "assistant", [{"type": "text", "text": "narrating this step in detail"}, block], 2 + i, model="m"))
            parent = "a%d" % i
        write(self.store / "d.jsonl", lines)
        _, data = self.pi("--store", str(self.store), "--project", str(self.project))
        rows = self.detectors(data)
        self.assertEqual(rows["D1"]["status"], "PASS")
        self.assertEqual(rows["D2"]["status"], "PASS")
        for d in ("D3", "D5", "D6", "D7", "D8"):
            self.assertEqual((rows[d]["status"], rows[d]["reason"]), ("UNAVAILABLE", "no Pi delegation evidence model"))
        self.assertEqual(rows["D4"]["status"], "N/A")
        # late write fails D1 only when no write lands in the first six calls
        late = [header("e", str(self.project)), message("r", None, "user", "go", 1)]
        parent = "r"
        for i in range(16):
            block = call("edit", path=".planning/STATE.md") if i == 10 else call("bash", command="echo %d" % i)
            late.append(message("a%d" % i, parent, "assistant", [block], 2 + i, model="m"))
            parent = "a%d" % i
        write(self.store / "d.jsonl", late)
        _, data = self.pi("--store", str(self.store), "--project", str(self.project))
        self.assertEqual(self.detectors(data)["D1"]["status"], "FAIL")

    def test_pi_tool_names_are_not_renamed_for_d3(self):
        lines = [header("many", str(self.project)), message("r", None, "user", "go", 1)]
        parent = "r"
        for i in range(105):
            lines.append(message("a%d" % i, parent, "assistant", [call("bash", command="c%d" % i)], 2 + i % 50, model="m"))
            parent = "a%d" % i
        write(self.store / "m.jsonl", lines)
        _, data = self.pi("--store", str(self.store), "--project", str(self.project))
        self.assertEqual(self.detectors(data)["D3"]["status"], "UNAVAILABLE")

    def test_grind_becomes_unknown_and_d9_unavailable(self):
        lines = [header("g", str(self.project)), message("r", None, "user", "go", 1)]
        parent = "r"
        for i in range(40):
            lines.append(message("a%d" % i, parent, "assistant", [call("bash", command="cmd%d" % i)], 2 + i, model="m"))
            parent = "a%d" % i
        write(self.store / "g.jsonl", lines)
        out, data = self.pi("--store", str(self.store), "--project", str(self.project))
        self.assertEqual([p["label"] for p in data["prompts"]], ["UNKNOWN"])
        row = self.detectors(data)["D9"]
        self.assertEqual(row["status"], "UNAVAILABLE")
        self.assertIn("UNKNOWN", out)
        self.assertNotIn("GRIND |", out.split("stall label")[1].split("worst")[0])

    def test_loop_still_fails_d9(self):
        lines = [header("l", str(self.project)), message("r", None, "user", "go", 1)]
        parent = "r"
        for i in range(15):
            lines.append(message("a%d" % i, parent, "assistant", [call("bash", command="same")], 2 + i, model="m"))
            parent = "a%d" % i
        write(self.store / "l.jsonl", lines)
        out, data = self.pi("--store", str(self.store), "--project", str(self.project))
        self.assertEqual(self.detectors(data)["D9"]["status"], "FAIL")
        self.assertIn("LOOP", out)

    def test_no_zero_or_empty_values_where_pi_has_no_evidence(self):
        write(self.store / "a.jsonl", [header("a", str(self.project))] + linear(3, tool=lambda i: call("bash", command="c%d" % i)))
        out, data = self.pi("--store", str(self.store), "--project", str(self.project))
        agg = data["aggregates"]
        for key in ("agent_calls", "agent_calls_with_model", "off_claude", "tokens_per_model", "token_fields_per_model", "subagent_tokens_per_model"):
            self.assertIsNone(agg[key], key)
            self.assertIn(key, agg["unavailable"])
        self.assertEqual(agg["usage"]["total"], "unavailable")
        self.assertEqual(data["sessions"][0]["usage"]["path"]["total"], "unavailable")
        for prompt in data["prompts"]:
            self.assertIsNone(prompt["agents"])
            self.assertIsNone(prompt["tokens"])
        self.assertIn("unavailable (pi)", out)
        self.assertNotIn("Agent calls total", out)

    def test_prompt_tokens_computed_from_pi_assistant_usage(self):
        lines = [header("t", str(self.project)), message("r", None, "user", "go", 1),
                 message("a", "r", "assistant", "an answer of some length", 2, model="m", usage={"input": 9, "output": 3, "cacheRead": 9, "cacheWrite": 4})]
        write(self.store / "t.jsonl", lines)
        _, data = self.pi("--store", str(self.store), "--project", str(self.project))
        self.assertEqual(data["prompts"][0]["tokens"], 7)

    def test_incomplete_and_unavailable_are_reported(self):
        write(self.store / "ok.jsonl", [header("ok", str(self.project))] + linear(2))
        write(self.store / "bad.jsonl", [header("bad", str(self.project))] + linear(2)[:2] + ["{oops"] + linear(2)[2:])
        write(self.store / "v9.jsonl", [header("v9", str(self.project), version=9)])
        write(self.store / "last.jsonl", [header("last", str(self.project))] + linear(2) + ["{oops"])
        out, data = self.pi("--store", str(self.store), "--project", str(self.project))
        kinds = {(p["kind"], os.path.basename(p["path"])) for p in data["problems"]}
        self.assertIn(("malformed_lines", "bad.jsonl"), kinds)
        self.assertIn(("unsupported_version", "v9.jsonl"), kinds)
        self.assertIn(("leaf_unknown", "last.jsonl"), kinds)
        self.assertEqual(data["files"]["incomplete"], sum(not s["complete"] for s in data["sessions"]))
        self.assertGreaterEqual(data["files"]["incomplete"], 1)
        self.assertEqual({os.path.basename(u["path"]): u["kind"] for u in data["files"]["unavailable"]}, {"v9.jsonl": "unsupported_version", "last.jsonl": "leaf_unknown"})
        self.assertIn("problems", out)
        self.assertIn("incomplete:", out)
        self.assertIn("lineage", out)

    def test_nothing_usable_exits_cleanly(self):
        write(self.store / "v9.jsonl", [header("v9", str(self.project), version=9)])
        out, data = self.pi("--store", str(self.store), "--project", str(self.project))
        self.assertIn("no usable sessions", out)
        self.assertEqual((data["no_usable_sessions"], data["reasons"], data["sessions"]), (True, {"unsupported_version": 1}, []))
        out, data = self.pi("--store", str(self.root / "missing"), "--project", str(self.project))
        self.assertEqual(data["reasons"], {"store_not_found": 1})

    def test_store_is_read_only(self):
        paths = [write(self.store / "a.jsonl", [header("a", str(self.project))] + linear(3)),
                 write(self.store / "v1.jsonl", [header("v1", str(self.project), version=None), {"type": "message", "timestamp": stamp(1), "message": {"role": "user", "content": "go"}}]),
                 write(self.store / "bad.jsonl", [header("bad", str(self.project)), "{oops"])]
        for p in paths:
            os.utime(p, (1_700_000_000, 1_700_000_000))
        before = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in paths}
        names = sorted(os.listdir(self.store))
        self.pi("--store", str(self.store), "--project", str(self.project))
        self.pi("--session-file", str(paths[0]), "--leaf", "e2")
        self.assertEqual({p: (p.read_bytes(), p.stat().st_mtime_ns) for p in paths}, before)
        self.assertEqual(sorted(os.listdir(self.store)), names)

    def test_pi_usage_text_labels(self):
        usage = {"input": 1, "output": 2, "cacheRead": 3, "cacheWrite": 4}
        write(self.store / "u.jsonl", [header("u", str(self.project)), message("r", None, "user", "go", 1), message("a", "r", "assistant", "an answer of some length", 2, model="m", usage=usage)])
        out, _ = self.pi("--store", str(self.store), "--project", str(self.project))
        self.assertIn("path (entries on the selected leaf-to-root path)", out)
        self.assertIn("file (every entry in this file)", out)
        self.assertIn("aggregate path usage (excluding 0 forked sessions)", out)


class GapTests(PiCase):
    """Cross-harness gaps left after T5: project isolation, lineage shapes, usage scope, filters."""

    def audit(self, path):
        sessions, counts = session_audit.scan_pi([path], None, False, [], [])
        return sessions[0], counts

    def in_store(self, *argv, **kw):
        return self.pi("--store", str(self.store), "--project", str(self.project), *argv, **kw)

    def kinds(self, data):
        return {(p["kind"], os.path.basename(p["path"])) for p in data["problems"]}

    def test_three_projects_in_one_store_are_isolated(self):
        dirs = {name: self.root / name for name in ("A", "B", "C")}
        for d in dirs.values():
            d.mkdir()
        write(self.store / "a1.jsonl", [header("a1", str(dirs["A"]))] + linear(2))
        write(self.store / "a2.jsonl", [header("a2", str(dirs["A"]) + "/")] + linear(2))
        write(self.store / "b1.jsonl", [header("b1", str(dirs["B"]))] + linear(2))
        write(self.store / "c1.jsonl", [header("c1", str(dirs["C"]))] + linear(2))
        for name, ids in (("A", ["a1", "a2"]), ("B", ["b1"]), ("C", ["c1"])):
            with self.subTest(project=name):
                _, data = self.pi("--store", str(self.store), "--project", str(dirs[name]))
                self.assertEqual(sorted(s["session_id"] for s in data["sessions"]), ids)
                self.assertEqual((data["files"]["found"], data["files"]["excluded_other_project"]), (4, 4 - len(ids)))

    def test_cwd_missing_excluded_in_dir_mode_but_audited_as_file(self):
        head = header("nocwd")
        del head["cwd"]
        path = write(self.store / "n.jsonl", [head] + linear(2))
        write(self.store / "ok.jsonl", [header("ok", str(self.project))] + linear(2))
        out, data = self.in_store()
        self.assertEqual([s["session_id"] for s in data["sessions"]], ["ok"])
        self.assertEqual(data["files"]["excluded_other_project"], 1)
        self.assertIn(("cwd_missing", "n.jsonl"), self.kinds(data))
        self.assertIn("cwd_missing", out)
        _, data = self.pi("--session-file", str(path))
        self.assertEqual([s["session_id"] for s in data["sessions"]], ["nocwd"])
        self.assertIsNone(data["sessions"][0]["lineage"]["cwd"])
        self.assertNotIn("cwd_missing", {p["kind"] for p in data["problems"]})

    def test_duplicate_session_id_both_audited_with_suffix(self):
        write(self.store / "a.jsonl", [header("dup", str(self.project))] + linear(2))
        write(self.store / "b.jsonl", [header("dup", str(self.project))] + linear(2, prefix="f"))
        out, data = self.in_store()
        self.assertEqual([s["session_id"] for s in data["sessions"]], ["dup", "dup~2"])
        self.assertIn(("duplicate_session_id", "b.jsonl"), self.kinds(data))
        self.assertIn("duplicate_session_id", out)

    def test_compaction_keeps_earlier_history_on_the_path(self):
        lines = [header("cmp", str(self.project)), message("u1", None, "user", "go", 1),
                 message("a1", "u1", "assistant", [call("write", path=".planning/STATE.md", content="x")], 2, model="m", usage=tokens(1, 2)),
                 message("k1", "a1", "user", "kept from here", 3),
                 {"type": "compaction", "id": "c1", "parentId": "k1", "timestamp": stamp(4), "summary": "s", "firstKeptEntryId": "k1", "tokensBefore": 999, "usage": tokens(10, 20)},
                 message("u2", "c1", "user", "continue", 5)]
        parent = "u2"
        for i in range(15):
            lines.append(message("b%d" % i, parent, "assistant", [call("bash", command="echo %d" % i)], 6 + i, model="m", **({"usage": tokens(3, 4)} if i == 0 else {})))
            parent = "b%d" % i
        path = write(self.store / "c.jsonl", lines)
        session, _ = self.audit(path)
        self.assertEqual(len(session.tools), 16)
        self.assertEqual(session.tools[0]["name"], "write")
        self.assertEqual(session.lineage["abandoned_entries"], 0)
        _, data = self.in_store()
        self.assertEqual(self.detectors(data)["D1"]["status"], "PASS")
        scope = data["sessions"][0]["usage"]["path"]
        self.assertEqual(scope["buckets"]["assistant"]["total"]["input_tokens"], 1 + 3)
        self.assertEqual(scope["buckets"]["compaction"]["total"]["output_tokens"], 20)
        self.assertEqual(scope["total"]["input_tokens"], 1 + 3 + 10)

    def test_context_edit_is_not_applied(self):
        lines = [header("ce", str(self.project)), message("u1", None, "user", "go", 1),
                 message("a1", "u1", "assistant", [call("read", path="x.txt")], 2, model="m", usage=tokens(5, 6)),
                 {"type": "context_edit", "id": "x1", "parentId": "a1", "timestamp": stamp(3), "targetId": "a1", "replacement": None},
                 message("u2", "x1", "user", "next", 4), message("a2", "u2", "assistant", "an answer of some length", 5, model="m")]
        path = write(self.store / "e.jsonl", lines)
        session, _ = self.audit(path)
        self.assertEqual([t["name"] for t in session.tools], ["read"])
        _, data = self.in_store()
        scope = data["sessions"][0]["usage"]["path"]
        self.assertEqual((scope["total"]["input_tokens"], scope["total"]["output_tokens"]), (5, 6))
        self.assertEqual(data["prompts"][0]["tokens"], 6)

    def test_mid_session_usage_entry_stays_on_the_path(self):
        lines = [header("ue", str(self.project)), message("u1", None, "user", "go", 1),
                 message("a1", "u1", "assistant", "first answer of some length", 2, model="m", usage=tokens(1, 1)),
                 {"type": "usage", "id": "w1", "parentId": "a1", "timestamp": stamp(3), "kind": "cache_warm", "model": "m", "usage": tokens(0, 0, 50)},
                 message("a2", "w1", "assistant", "second answer of some length", 4, model="m", usage=tokens(2, 2))]
        write(self.store / "u.jsonl", lines)
        _, data = self.in_store()
        session = data["sessions"][0]
        self.assertEqual((session["lineage"]["abandoned_entries"], session["lineage"]["path_entries"]), (0, 4))
        bucket = session["usage"]["path"]["buckets"]["usage_entry"]
        self.assertEqual(bucket["by_kind"]["cache_warm"]["cache_read_input_tokens"], 50)
        self.assertEqual(session["usage"]["path"]["total"]["cache_read_input_tokens"], 50)

    def test_branch_summary_on_path_and_abandoned_branch_file_scope_only(self):
        lines = [header("bs", str(self.project)), message("u1", None, "user", "go", 1),
                 message("a1", "u1", "assistant", [call("bash", command="old")], 2, model="m", usage=tokens(100, 100)),
                 {"type": "branch_summary", "id": "s1", "parentId": "u1", "timestamp": stamp(3), "fromId": "a1", "summary": "s", "usage": tokens(5, 5, 5, 5)},
                 message("a2", "s1", "assistant", [call("read", path="x")], 4, model="m", usage=tokens(1, 1))]
        path = write(self.store / "b.jsonl", lines)
        session, _ = self.audit(path)
        self.assertEqual([t["name"] for t in session.tools], ["read"])
        usage = session.usage
        self.assertEqual(usage["path"]["total"], {"input_tokens": 6, "output_tokens": 6, "cache_read_input_tokens": 5, "cache_creation_input_tokens": 5})
        self.assertEqual(usage["path"]["buckets"]["branch_summary"]["total"]["input_tokens"], 5)
        self.assertEqual(usage["path"]["buckets"]["assistant"]["total"]["input_tokens"], 1)
        self.assertEqual(usage["file"]["buckets"]["assistant"]["total"]["input_tokens"], 101)
        self.assertEqual(session.lineage["abandoned_entries"], 1)

    def test_second_root_appended_last_becomes_leaf(self):
        first = [message("r1", None, "user", "go", 1), message("a1", "r1", "assistant", [call("bash", command="x")], 2)]
        res = pi_sessions.load_file(write(self.store / "r.jsonl", [header()] + first + [message("r2", None, "user", "again", 3)]))
        path, info = pi_sessions.select_path(res)
        self.assertEqual(([e["id"] for e in path], info["leaf_id"], info["abandoned_entries"]), (["r2"], "r2", 2))
        lines = [header()] + first + [message("r2", None, "user", "again", 3), message("a2", "r2", "assistant", [call("read", path="y")], 4)]
        session, _ = self.audit(write(self.store / "r.jsonl", lines))
        self.assertEqual((session.lineage["path_entries"], session.lineage["abandoned_entries"]), (2, 2))
        self.assertEqual([t["name"] for t in session.tools], ["read"])

    def test_version_2_tree_with_custom_and_hook_message(self):
        lines = [header("v2", str(self.project), version=2), message("u1", None, "user", "go", 1),
                 {"type": "custom", "id": "cu", "parentId": "u1", "timestamp": stamp(2), "customType": "ext", "data": {}},
                 message("hm", "cu", "hookMessage", "hook text that must not become a prompt", 3),
                 message("a1", "hm", "assistant", [call("bash", command="x")], 4, model="m")]
        write(self.store / "v2.jsonl", lines)
        out, data = self.in_store()
        lineage = data["sessions"][0]["lineage"]
        self.assertEqual((lineage["version"], lineage["leaf_source"], lineage["path_entries"], lineage["abandoned_entries"]), (2, "last-appended", 4, 0))
        self.assertEqual([p["prompt"] for p in data["prompts"]], ["go"])
        self.assertTrue(data["sessions"][0]["complete"])
        self.assertIn("| v2 |", out)

    def test_since_and_min_turns_filter_pi_sessions(self):
        write(self.store / "recent.jsonl", [header("recent", str(self.project))] + linear(3))
        old = [header("old", str(self.project))] + linear(3, prefix="o")
        for entry in old:
            entry["timestamp"] = "2020-01-01T00:00:00.000Z"
        write(self.store / "old.jsonl", old)
        write(self.store / "short.jsonl", [header("short", str(self.project))] + linear(1, prefix="s"))
        for argv, min_turns, ids in ((["--since", "2026-01-01"], "1", ["recent", "short"]), ([], "2", ["old", "recent"]), (["--since", "2026-01-01"], "2", ["recent"])):
            with self.subTest(argv=argv, min_turns=min_turns):
                out, data = self.in_store(*argv, min_turns=min_turns)
                self.assertEqual(sorted(s["session_id"] for s in data["sessions"]), ids)
                self.assertEqual((data["files"]["found"], data["files"]["audited"]), (3, len(ids)))
                self.assertIn("files audited: %d" % len(ids), out)
                self.assertIn("sessions kept: %d main" % len(ids), out)

    def test_fork_and_parent_in_one_dir_aggregate_parent_only(self):
        base = [message("r", None, "user", "go", 1), message("a", "r", "assistant", "an answer of some length", 2, model="m", usage=tokens(10, 1))]
        write(self.store / "parent.jsonl", [header("parent", str(self.project))] + base)
        more = [message("u2", "a", "user", "more", 3), message("a2", "u2", "assistant", "the fork's own reply", 4, model="m", usage=tokens(7, 2))]
        write(self.store / "fork.jsonl", [header("fork", str(self.project), parentSession=str(self.store / "parent.jsonl"))] + base + more)
        out, data = self.in_store()
        by_id = {s["session_id"]: s for s in data["sessions"]}
        agg = data["aggregates"]["usage"]
        self.assertEqual(agg["total"], by_id["parent"]["usage"]["path"]["total"])
        self.assertNotEqual(agg["total"], by_id["fork"]["usage"]["path"]["total"])
        self.assertEqual(by_id["fork"]["lineage"]["lineage_followed"], False)
        note = "1 forked sessions include copied history; detector rates may double-count"
        self.assertIn("note: " + note, out)
        self.assertEqual(data["aggregates"]["notes"], [note])

    def test_assistant_without_usage_is_not_zero(self):
        lines = [header("mix", str(self.project)), message("u1", None, "user", "first ask", 1),
                 message("a1", "u1", "assistant", "an answer without usage", 2, model="m"),
                 message("a2", "a1", "assistant", "an answer with usage", 3, model="m", usage=tokens(2, 3, 4, 5)),
                 message("u2", "a2", "user", "second ask", 4),
                 message("a3", "u2", "assistant", "another answer without usage", 5, model="m")]
        write(self.store / "m.jsonl", lines)
        _, data = self.in_store()
        scope = data["sessions"][0]["usage"]["path"]
        self.assertEqual(scope["total"], {"input_tokens": 2, "output_tokens": 3, "cache_read_input_tokens": 4, "cache_creation_input_tokens": 5})
        self.assertEqual(scope["buckets"]["assistant"]["entries"], 1)
        self.assertEqual([(p["prompt"], p["tokens"]) for p in data["prompts"]], [("first ask", 8), ("second ask", None)])


    def buckets(self, f):
        return f["audited"] + f["excluded_other_project"] + len(f["unavailable"]) + f["below_min_turns"] + f["before_since"] + f["workers_excluded"]

    def test_below_min_turns_is_counted_and_buckets_sum_to_found(self):
        write(self.store / "long.jsonl", [header("long", str(self.project))] + linear(3))
        write(self.store / "short.jsonl", [header("short", str(self.project))] + linear(1, prefix="s"))
        write(self.store / "other.jsonl", [header("other", "/elsewhere")] + linear(3, prefix="x"))
        write(self.store / "v9.jsonl", [header("v9", str(self.project), version=9)])
        out, data = self.in_store(min_turns="2")
        f = data["files"]
        self.assertEqual((f["found"], f["audited"], f["below_min_turns"], f["before_since"]), (4, 1, 1, 0))
        self.assertEqual(self.buckets(f), f["found"])
        self.assertIn("below min turns: 1 (--min-turns 2)\nbefore since: 0\n", out)
        self.assertLess(out.index("excluded other project"), out.index("below min turns"))
        self.assertTrue(all(s["kind"] == "main" for s in data["sessions"]))

    def test_worker_sessions_are_counted_when_excluded(self):
        write(self.store / "main.jsonl", [header("main", str(self.project))] + linear(2))
        write(self.store / "w.jsonl", [header("w", str(self.project)), message("w0", None, "user", "You are a subagent. do the work", 1)] + linear(2, prefix="w")[1:])
        out, data = self.in_store()
        f = data["files"]
        self.assertEqual((f["found"], f["audited"], f["workers_excluded"]), (2, 1, 1))
        self.assertEqual(self.buckets(f), f["found"])
        self.assertIn("workers excluded: 1\n", out)
        _, data = self.in_store("--include-workers")
        self.assertEqual((data["files"]["audited"], data["files"]["workers_excluded"]), (2, 0))
        write(self.store / "main.jsonl", [header("main", "/elsewhere")] + linear(2))
        out, data = self.in_store()
        self.assertIn("no usable sessions", out)
        self.assertEqual(data["reasons"], {"excluded_other_project": 1, "workers_excluded": 1})
        self.assertEqual(data["files"]["workers_excluded"], 1)

    def test_session_file_below_threshold_reports_no_usable_sessions(self):
        path = write(self.root / "short.jsonl", [header("short", str(self.project))] + linear(1))
        out, data = self.pi("--session-file", str(path), min_turns="2")
        self.assertIn("no usable sessions", out)
        self.assertIn("below_min_turns=1", out)
        self.assertEqual((data["no_usable_sessions"], data["reasons"], data["sessions"]), (True, {"below_min_turns": 1}, []))
        self.assertEqual((data["files"]["found"], data["files"]["audited"], data["files"]["below_min_turns"], data["files"]["before_since"]), (1, 0, 1, 0))

    def test_since_counts_before_since_and_both_failures_count_once(self):
        old = [header("old", str(self.project))] + linear(3, prefix="o")
        for entry in old:
            entry["timestamp"] = "2020-01-01T00:00:00.000Z"
        write(self.store / "old.jsonl", old)
        write(self.store / "new.jsonl", [header("new", str(self.project))] + linear(3))
        out, data = self.in_store("--since", "2026-01-01")
        f = data["files"]
        self.assertEqual((f["found"], f["audited"], f["below_min_turns"], f["before_since"]), (2, 1, 0, 1))
        self.assertEqual(self.buckets(f), f["found"])
        self.assertIn("before since: 1", out)
        out, data = self.in_store("--since", "2026-01-01", min_turns="9")
        self.assertEqual((data["files"]["below_min_turns"], data["files"]["before_since"], data["reasons"]), (2, 0, {"below_min_turns": 2}))

    def test_since_excluding_everything_takes_no_usable_path(self):
        old = [header("old", str(self.project))] + linear(3, prefix="o")
        for entry in old:
            entry["timestamp"] = "2020-01-01T00:00:00.000Z"
        write(self.store / "old.jsonl", old)
        out, data = self.in_store("--since", "2026-01-01")
        self.assertIn("no usable sessions", out)
        self.assertEqual((data["reasons"], data["files"]["before_since"]), ({"before_since": 1}, 1))


class ReviewFixTests(PiCase):
    def test_non_finite_usage_is_a_malformed_line_not_a_crash(self):
        for literal in ("NaN", "Infinity", "-Infinity"):
            with self.subTest(literal=literal):
                good = json.dumps(message("a1", "u", "assistant", "done", 2, usage=tokens(1, 2)))
                bad = good.replace('"output": 2', '"output": ' + literal)
                path = write(self.store / "n.jsonl", [header("nan", str(self.project)), message("u", None, "user", "go", 1), good.replace('"a1"', '"a0"'), bad])
                out, data = self.pi("--session-file", str(path), "--leaf", "a0")
                self.assertFalse(data["sessions"][0]["complete"])
                self.assertIn("malformed_lines", [p["kind"] for p in data["problems"]])

    def test_relative_and_trailing_slash_project_resolve_to_pi_dir(self):
        old = os.environ.get("PI_CODING_AGENT_DIR")
        self.addCleanup(lambda: os.environ.__setitem__("PI_CODING_AGENT_DIR", old) if old is not None else os.environ.pop("PI_CODING_AGENT_DIR", None))
        os.environ["PI_CODING_AGENT_DIR"] = str(self.root / "agent")
        store = pi_sessions.default_store(str(self.project))
        store.mkdir(parents=True)
        write(store / "s.jsonl", [header("rel", str(self.project))] + linear(2))
        os.chdir(self.project)
        for project in (".", str(self.project) + "/"):
            with self.subTest(project=project):
                _, data = self.pi("--project", project)
                self.assertEqual((data["store"], data["project"], len(data["sessions"])), (str(store), str(self.project), 1))

    def test_project_with_session_file_is_rejected(self):
        path = write(self.store / "x.jsonl", [header()] + linear(1))
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as ctx:
            session_audit.main(["--harness", "pi", "--project", str(self.project), "--session-file", str(path)])
        self.assertEqual(ctx.exception.code, 2)

    def test_duplicate_id_last_wins_and_bad_copy_does_not_poison_kept_entry(self):
        good = [header("dup", str(self.project)), message("r", None, "user", "go", 1), message("x", "r", "assistant", "first", 2)]
        bad_first = dict(message("x", 5, "assistant", "broken", 3))
        res = pi_sessions.load_file(write(self.store / "a.jsonl", good[:2] + [bad_first] + good[2:]))
        path, info = pi_sessions.select_path(res)
        self.assertEqual(([e["id"] for e in path], info["leaf_id"]), (["r", "x"], "x"))
        self.assertIn("duplicate_id", [p["kind"] for p in res.problems])
        self.assertFalse(res.complete)
        res = pi_sessions.load_file(write(self.store / "b.jsonl", good + [message("x", "r", "assistant", "second", 3)]))
        path, _ = pi_sessions.select_path(res)
        self.assertEqual(path[-1]["message"]["content"], "second")

    def test_lineage_and_usage_print_full_session_ids(self):
        write(self.store / "a.jsonl", [header("abc12345-one", str(self.project))] + linear(2))
        write(self.store / "b.jsonl", [header("abc12345-two", str(self.project))] + linear(2))
        out, _ = self.pi("--store", str(self.store), "--project", str(self.project))
        self.assertIn("abc12345-one", out)
        self.assertIn("abc12345-two", out)


class ClaudeCompatTests(PiCase):
    def test_claude_report_names_harness_and_keeps_keys(self):
        records = [{"type": "user", "sessionId": "c", "timestamp": "2026-09-10T00:00:00Z", "message": {"content": "go"}},
                   {"type": "assistant", "sessionId": "c", "timestamp": "2026-09-10T00:01:00Z", "message": {"id": "m1", "model": "x", "content": [], "usage": {"output_tokens": 5}}}]
        write(self.store / "c.jsonl", records)
        out, data = self.run_cli("--store", str(self.store))
        self.assertTrue(out.startswith("harness: claude\n"))
        self.assertEqual((data["harness"], data["sessions"][0]["harness"], data["problems"]), ("claude", "claude", []))
        self.assertEqual(data["aggregates"]["tokens_per_model"], {"x": 5})
        self.assertNotIn("problems\n", out)
        self.assertNotIn("below min turns", out)
        self.assertNotIn("files", data)


if __name__ == "__main__":
    unittest.main()
