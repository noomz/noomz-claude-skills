#!/usr/bin/env python3
import hashlib, json, os, sys, time
from pathlib import Path
from pick_agent import STAMP

def main():
    try: item = json.load(sys.stdin)
    except Exception: return 0
    tool = item.get("tool_name", ""); inp = item.get("tool_input") or {}; warnings = []; unpinned = False
    if tool in ("Agent", "Task"):
        prompt = inp.get("prompt", "")
        inherited = {"fork", "general-purpose", "Explore", "Plan", "claude"}
        unpinned = not inp.get("model") and (not inp.get("subagent_type") or inp.get("subagent_type") in inherited)
        if unpinned:
            warnings.append("no model pinned — inherits the main-loop model; pick with: python3 " + str(Path(__file__).with_name("pick_agent.py")) + " T2")
        size = len(prompt.encode("utf-8"))
        if size > 7000: warnings.append(f"brief is {size} bytes; ~8 KB kills spawns silently — move it to a file")
    if tool == "Workflow" and "agent(" in str(inp.get("script", "")) and "model:" not in str(inp.get("script", "")):
        unpinned = True
        warnings.append("Workflow agent() without model: inherits the main-loop model")
    sid = str(item.get("session_id", "")); session = Path(os.path.expanduser("~/.cache/agent-router/sessions")) / hashlib.sha256(sid.encode()).hexdigest()
    if tool in ("Agent", "Task", "Workflow"):
        try: count = int(session.read_text()) + 1
        except (OSError, ValueError): count = 1
        try: session.parent.mkdir(parents=True, exist_ok=True); session.write_text(str(count))
        except OSError: pass
        try:
            stamp = json.loads(STAMP.read_text()); age = (time.time() - __import__("datetime").datetime.fromisoformat(stamp["as_of"].replace("Z", "+00:00")).timestamp()) / 60
            if count >= 3 and age > 15: warnings.append(f"quota snapshot is stale ({round(age)}m) — run pick_agent.py --fresh before a fan-out")
            if unpinned:
                red = [k for k,v in stamp.get("providers", {}).items() if v == "RED"]
                if red: warnings.append("RED providers: " + ", ".join(red))
        except (OSError, ValueError, KeyError, TypeError):
            pass
    if warnings: print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":"agent-router: " + "; ".join(warnings)}}, separators=(",", ":")))
    return 0
if __name__ == "__main__": sys.exit(main())
