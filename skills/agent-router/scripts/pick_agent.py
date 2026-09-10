#!/usr/bin/env python3
"""Pick a quota-aware agent. Python standard library only."""
import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

WINDOW_HOURS = {"5h": 5, "7d": 24 * 7, "primary": 5, "secondary": 24 * 7, "billing": 24 * 7}
COLOURS = ["RED", "AMBER", "UNKNOWN", "GREEN"]
TIERS = {
    "T0": [("codex", "gpt-6-astra", "frontier", 'codex exec -m gpt-6-astra - < brief.md')],
    "T1": [("codex", "gpt-5.6-terra", "reasoning", 'codex exec -m gpt-5.6-terra - < brief.md'), ("claude", "opus", "reasoning", "Agent model: opus")],
    "T2": [("ollama", "local", "local", "ollama"), ("lmstudio", "local", "local", "lmstudio"), ("llamacpp", "local", "local", "llamacpp"), ("grok", "grok-4.6", "cheap", "grok --prompt-file brief.md -m grok-4.6 --permission-mode auto --max-turns 40 --output-format json --cwd DIR"), ("codex", "gpt-5.6-luna", "cheap", 'codex exec -m gpt-5.6-luna - < brief.md'), ("codex", "gpt-5.6-sol", "cheap", 'codex exec -m gpt-5.6-sol - < brief.md'), ("claude", "sonnet", "mid", "Agent model: sonnet"), ("gemini", "default", "mid", "gemini")],
    "T3": [("ollama", "local", "local", "ollama"), ("lmstudio", "local", "local", "lmstudio"), ("llamacpp", "local", "local", "llamacpp"), ("ccs", "glm", "cheap", 'ccs glm -p "..."'), ("ccs", "kimi", "cheap", 'ccs kimi -p "..."'), ("grok", "grok-4.6", "cheap", "grok --prompt-file brief.md -m grok-4.6 --permission-mode auto --max-turns 40 --output-format json --cwd DIR"), ("codex", "gpt-5.6-luna", "cheap", 'codex exec -m gpt-5.6-luna -c model_reasoning_effort=low - < brief.md'), ("claude", "haiku", "cheap", "Agent model: haiku")],
}
STAMP = Path(os.path.expanduser("~/.cache/agent-router/last_read.json"))

def aub(fresh=False):
    cmd = ["/Users/noomz/.local/bin/aub"]
    if not fresh: cmd.append("--cached")
    cmd += ["--json", "--provider", "all"]
    try:
        p = subprocess.run(cmd, text=True, capture_output=True, timeout=2)
        if p.returncode: return None
        return json.loads(p.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None

def parse_time(value):
    try: return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError, TypeError): return None

def degrade(colour): return {"GREEN": "AMBER", "UNKNOWN": "AMBER", "AMBER": "RED", "RED": "RED"}[colour]

def classify(remaining, utilisation, resets, name, now):
    colour = "GREEN" if remaining >= .40 else "AMBER" if remaining >= .15 else "RED"
    hours = WINDOW_HOURS.get(name)
    reset = parse_time(resets)
    if hours and reset:
        elapsed = 1 - max(0, (reset - now).total_seconds()) / (hours * 3600)
        elapsed = min(1, max(.05, elapsed))
        if utilisation is not None and utilisation / elapsed > 1.2: colour = degrade(colour)
    return colour, reset

def provider_state(provider, account_name, now):
    if not provider: return {"colour": "ABSENT", "windows": [], "remaining": 0, "reset": None}
    if provider.get("status") != "ok": return {"colour": "RED", "windows": [], "remaining": 0, "reset": None}
    if provider.get("id") == "claude":
        accounts = provider.get("accounts", [])
        provider = next((a for a in accounts if a.get("name") == account_name), None)
        if not provider: return {"colour": "RED", "windows": [], "remaining": 0, "reset": None}
    windows = provider.get("quotaWindows") or []
    quota = provider.get("quota") or {}
    default_remaining = quota.get("remaining")
    limit = quota.get("limit") or 1
    if default_remaining is not None: default_remaining = float(default_remaining) / float(limit)
    if not windows:
        if default_remaining is None:
            return {"colour": "UNKNOWN", "windows": [], "remaining": 1, "reset": None}
        c, _ = classify(default_remaining, 1 - default_remaining, None, "", now)
        return {"colour": c, "windows": [], "remaining": default_remaining, "reset": None}
    out = []
    for w in windows:
        util = float(w.get("utilization", 0))
        name = w.get("name", "?")
        c, reset = classify(1 - util, util, w.get("resetsAt"), name, now)
        hours = WINDOW_HOURS.get(name)
        elapsed = None
        if hours and reset:
            elapsed = 1 - max(0, (reset - now).total_seconds()) / (hours * 3600)
            elapsed = min(1, max(.05, elapsed))
        out.append({"name": name, "remaining": 1 - util, "colour": c, "reset": reset,
                    "pace": util / elapsed if elapsed else None})
    worst = min(out, key=lambda x: COLOURS.index(x["colour"]))
    return {"colour": worst["colour"], "windows": out, "remaining": worst["remaining"], "reset": worst["reset"]}

def states(data, account):
    now = datetime.now(timezone.utc)
    providers = {p.get("id"): p for p in (data or {}).get("providers", [])}
    result = {}
    for i in ("claude", "codex", "grok", "gemini", "ollama", "lmstudio", "llamacpp", "ccs"):
        result[i] = {"colour": "UNKNOWN", "windows": [], "remaining": 1, "reset": None} if i == "ccs" and i not in providers else provider_state(providers.get(i), account, now)
    return result

def fmt_duration(reset):
    if not reset: return "?"
    seconds = max(0, int((reset - datetime.now(timezone.utc)).total_seconds()))
    days, rem = divmod(seconds, 86400); hours, minutes = divmod(rem, 3600); minutes //= 60
    return (f"{days}d" if days else "") + (f"{hours}h" if hours else "") + (f"{minutes}m" if minutes or not days and not hours else "")

def display_state(state):
    wins = state["windows"]
    if not wins: return f"{round(state['remaining'] * 100):g}% {state['colour']}"
    return "/".join(f"{round(w['remaining']*100):g}%" for w in wins) + " " + state["colour"]

def pick(tier, data, account):
    ss = states(data, account)
    candidates = [c for c in TIERS[tier] if ss[c[0]]["colour"] not in ("ABSENT", "RED")]
    greens = [c for c in candidates if ss[c[0]]["colour"] == "GREEN"]
    if greens: chosen = greens[0]
    else:
        unknown = [c for c in candidates if ss[c[0]]["colour"] == "UNKNOWN"]
        if unknown: chosen = unknown[0]
        elif candidates:
            chosen = sorted(candidates, key=lambda c: (ss[c[0]]["reset"] is None, ss[c[0]]["reset"] or datetime.max.replace(tzinfo=timezone.utc)))[0]
        else: chosen = None
    if not chosen:
        all_rows = [c for c in TIERS[tier] if ss[c[0]]["colour"] == "RED"]
        chosen = max(all_rows, key=lambda c: ss[c[0]]["remaining"]) if all_rows else None
    skipped = []
    for provider in dict.fromkeys(c[0] for c in TIERS[tier]):
        st = ss[provider]
        if st["colour"] != "ABSENT" and (not chosen or provider != chosen[0]):
            skipped.append(f"{provider} {st['colour']} {round(st['remaining']*100):g}% (resets {fmt_duration(st['reset'])})")
    return chosen, ss, skipped

def render_text(tier, chosen, ss, skipped, data, account):
    provider, model, _, invoke = chosen; st = ss[provider]
    line = f"{tier} → {provider} {model} [{display_state(st)}, resets {fmt_duration(st['reset'])}]"
    if skipped: line += "  skipped: " + ", ".join(skipped)
    if st["colour"] == "RED":
        line = "WARNING " + line
        previous = {"T3": "T2", "T2": "T1", "T1": "T0"}.get(tier)
        if previous:
            up, up_states, _ = pick(previous, data, account)
            if up and up_states[up[0]]["colour"] == "GREEN":
                line += f"; suggest {previous} {up[0]} {up[1]}"
    return line + "\ninvoke: " + invoke + "   # verify with: git -C <dir> diff --stat"

def explain_text(tier, ss):
    lines = []
    for provider in dict.fromkeys(c[0] for c in TIERS[tier]):
        st = ss[provider]
        if st["colour"] == "ABSENT":
            continue
        if st["windows"]:
            details = ", ".join(
                f"windows={w['name']} {round(w['remaining'] * 100):g}% (resets {fmt_duration(w['reset'])}, pace {w['pace']:.2f})"
                if w["pace"] is not None else
                f"windows={w['name']} {round(w['remaining'] * 100):g}% (resets {fmt_duration(w['reset'])}, pace ?)"
                for w in st["windows"])
        else:
            details = f"windows=? {round(st['remaining'] * 100):g}% (resets {fmt_duration(st['reset'])}, pace ?)"
        lines.append(f"  {provider}: {st['colour']} {details}")
    return "\n".join(lines)

def write_stamp(data, ss):
    try:
        STAMP.parent.mkdir(parents=True, exist_ok=True)
        STAMP.write_text(json.dumps({"as_of": (data or {}).get("asOf"), "providers": {k: v["colour"] for k, v in ss.items() if v["colour"] != "ABSENT"}}, separators=(",", ":")))
    except OSError: pass

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("tier", choices=TIERS); ap.add_argument("--fresh", action="store_true"); ap.add_argument("--json", action="store_true"); ap.add_argument("--claude-account", default=os.getenv("AGENT_ROUTER_CLAUDE_ACCOUNT", "work")); ap.add_argument("--explain", action="store_true")
    a = ap.parse_args(); data = aub(a.fresh)
    if data is None: return 0
    chosen, ss, skipped = pick(a.tier, data, a.claude_account); write_stamp(data, ss)
    if not chosen: return 0
    provider, model, _, invoke = chosen; st = ss[provider]; warning = st["colour"] == "RED"
    result = {"tier": a.tier, "provider": provider, "model": model, "colour": st["colour"], "remaining": st["remaining"], "resets_in": fmt_duration(st["reset"]), "invoke": invoke, "skipped": skipped, "as_of": data.get("asOf")}
    if a.json: print(json.dumps(result, separators=(",", ":"))); return 0
    rendered = render_text(a.tier, chosen, ss, skipped, data, a.claude_account)
    if a.explain:
        lines = rendered.splitlines()
        print(lines[0]); print(explain_text(a.tier, ss)); print("\n".join(lines[1:]))
    else:
        print(rendered)
    return 0

if __name__ == "__main__": sys.exit(main())
