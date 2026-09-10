#!/usr/bin/env python3
import json, sys
from pick_agent import aub, pick, states, write_stamp

def main():
    try: sys.stdin.read()
    except Exception: pass
    data = aub(False)
    if data is None: return 0
    account = __import__("os").environ.get("AGENT_ROUTER_CLAUDE_ACCOUNT", "work")
    ss = states(data, account); write_stamp(data, ss)
    bits = []
    for key in ("claude", "codex", "grok", "gemini", "ollama", "lmstudio", "llamacpp", "ccs"):
        if ss[key]["colour"] == "ABSENT": continue
        label = f"claude/{account} 7d" if key == "claude" else key
        st = ss[key]
        if key == "claude" and st["windows"]:
            w = next((x for x in st["windows"] if x["name"] == "7d"), st["windows"][-1]); bits.append(f"{label} {round(w['remaining']*100):g}% {w['colour']}")
        elif st["colour"] == "RED" and key == "gemini": bits.append("gemini RED(stale)")
        else: bits.append(f"{label} {round(st['remaining']*100):g}% {st['colour']}")
    t2, _, _ = pick("T2", data, account); t0, _, _ = pick("T0", data, account)
    picks = f"T2→{t2[0]} {t2[1]}" if t2 else "T2→none"
    picks += f", T0→{t0[0]} {t0[1]}" if t0 else ", T0→none"
    asof = data.get("asOf", "")
    time = asof[11:16] + "Z" if len(asof) >= 16 else "?"
    msg = "agent-router quota: " + " · ".join(bits) + " · pick: " + picks + f" (as of {time}, cached)"
    print(json.dumps({"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":msg}}, separators=(",", ":")))
    return 0
if __name__ == "__main__": sys.exit(main())
