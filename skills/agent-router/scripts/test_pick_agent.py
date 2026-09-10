#!/usr/bin/env python3
import copy
import io
import json
import subprocess
import sys
import unittest
from datetime import datetime, timezone
import pick_agent

FIXTURE = {
    "asOf": "2026-09-10T04:37:49Z",
    "providers": [
        {"id":"claude","status":"ok","accounts":[{"name":"work","quota":{"remaining":.17,"limit":1},"quotaWindows":[{"name":"5h","resetsAt":"2099-09-10T09:10:00Z","utilization":.05},{"name":"7d","resetsAt":"2099-09-12T14:00:00Z","utilization":.83}]}]},
        {"id":"codex","status":"ok","quota":{"remaining":1,"limit":1},"quotaWindows":[{"name":"primary","resetsAt":"2099-09-10T09:15:49Z","utilization":0},{"name":"secondary","resetsAt":"2099-09-16T11:08:40Z","utilization":0}]},
        {"id":"grok","status":"ok","quota":{"remaining":24,"limit":100},"quotaWindows":[{"name":"billing","resetsAt":"2099-09-14T04:26:15Z","utilization":.76}]},
        {"id":"gemini","status":"stale"}
    ]
}

class PickTests(unittest.TestCase):
    def setUp(self):
        self.old = pick_agent.STAMP
        pick_agent.STAMP = __import__("pathlib").Path("/tmp/agent-router-test-stamp.json")
    def tearDown(self):
        pick_agent.STAMP = self.old
    def test_fixture_picks_codex_luna_and_astra(self):
        self.assertEqual(pick_agent.pick("T2", FIXTURE, "work")[0][1], "gpt-5.6-luna")
        self.assertEqual(pick_agent.pick("T0", FIXTURE, "work")[0][1], "gpt-6-astra")
    def test_green_grok_beats_red_codex(self):
        data = copy.deepcopy(FIXTURE)
        for p in data["providers"]:
            if p["id"] == "codex": p["status"] = "stale"
            if p["id"] == "grok": p["quotaWindows"][0]["utilization"] = .2
        self.assertEqual(pick_agent.pick("T2", data, "work")[0][0], "grok")
    def test_all_red_warns(self):
        data = copy.deepcopy(FIXTURE)
        for p in data["providers"]:
            p["status"] = "stale"
        chosen, ss, _ = pick_agent.pick("T2", data, "work")
        self.assertEqual(ss[chosen[0]]["colour"], "RED")
        self.assertIn("WARNING", pick_agent.render_text("T2", chosen, ss, [], data, "work"))
    def test_pace_degrades(self):
        now = datetime.now(timezone.utc)
        reset = now.replace(microsecond=0) + __import__("datetime").timedelta(days=6)
        c, _ = pick_agent.classify(.5, .5, reset.isoformat(), "7d", now)
        self.assertEqual(c, "AMBER")

    def test_absent_ollama_is_not_picked_or_skipped(self):
        chosen, _, skipped = pick_agent.pick("T3", FIXTURE, "work")
        self.assertNotEqual(chosen[0], "ollama")
        self.assertNotIn("ollama", " ".join(skipped))

    def test_unknown_ccs_and_green_claude_sonnet(self):
        data = copy.deepcopy(FIXTURE)
        for p in data["providers"]:
            if p["id"] == "codex": p["status"] = "stale"
            if p["id"] == "grok": p["status"] = "stale"
            if p["id"] == "claude":
                p["accounts"][0]["quotaWindows"][0]["utilization"] = .05
                p["accounts"][0]["quotaWindows"][1]["utilization"] = .05
        chosen, ss, _ = pick_agent.pick("T2", data, "work")
        self.assertEqual((chosen[0], chosen[1]), ("claude", "sonnet"))
        self.assertIn("ccs: UNKNOWN", pick_agent.explain_text("T3", pick_agent.states(data, "work")))

    def test_guard_model_warning_respects_plugin_agent_types(self):
        guard = __import__("pathlib").Path(__file__).with_name("agent_call_guard.py")
        def run(subagent_type):
            item = {"tool_name": "Agent", "tool_input": {"prompt": "x", "subagent_type": subagent_type}, "session_id": "t"}
            return subprocess.run([sys.executable, str(guard)], input=json.dumps(item), text=True, capture_output=True, check=True).stdout
        self.assertIn("no model pinned", run("Explore"))
        self.assertNotIn("no model pinned", run("oh-my-claudecode:executor"))

if __name__ == "__main__": unittest.main()
