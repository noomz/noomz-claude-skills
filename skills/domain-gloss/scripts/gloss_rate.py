#!/usr/bin/env python3
"""Measure how often domain terms in main-conversation answers carry a non-ASCII gloss.

Read-only over Claude Code JSONL transcripts. Stdlib only.
Unit = one main-conversation assistant text answer (code stripped) containing a term.
Glossed = a "(" opens within --window chars after a term and its content has a non-ASCII letter.
"""
import argparse, datetime as dt, json, os, re, sys
from pathlib import Path

LEAK_NEEDLE = "domain-gloss ON ("
HOOK_ATTACHMENTS = ("hook_success", "hook_additional_context")
BUCKETS = ("1", "2-3", "4-10", "11-30", "31+")
WORKER_DIRS = {"worker", "workers", "team", "teams"}
PAREN_LIMIT = 80
FENCE = re.compile(r"```.*?(?:```|\Z)", re.S)
INLINE = re.compile(r"`[^`\n]*`")
NOTE = "note: simple-en glosses (ASCII) are not detectable by this method."


def default_store(cwd):
    """Claude Code folds every non-alphanumeric char of the cwd to '-'; older '/'-only slug is the fallback."""
    slugs = [re.sub(r"[^A-Za-z0-9]", "-", cwd), cwd.replace("/", "-")]
    base = os.environ.get("CLAUDE_CONFIG_DIR")
    roots = ([Path(base) / "projects"] if base else []) + [Path.home() / ".claude" / "projects"]
    candidates = [root / slug for root in roots for slug in slugs]
    return next((c for c in candidates if c.exists()), candidates[0])


def is_subagent(rel):
    return rel.name.startswith("agent-") or "subagents" in rel.parts[:-1]


def read_records(path):
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try: rec = json.loads(line)
                except ValueError: continue
                if isinstance(rec, dict): yield rec
    except OSError:
        return


def assistant_text(message):
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str): return content
    if not isinstance(content, list): return ""
    return "\n".join(str(b.get("text") or "") for b in content if isinstance(b, dict) and b.get("type") == "text")


def is_prompt(message):
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, str): return True
    return isinstance(content, list) and any(isinstance(b, dict) and b.get("type") == "text" for b in content)


def strip_code(text):
    return INLINE.sub(" ", FENCE.sub(" ", text))


def term_regex(terms):
    parts = []
    for term in sorted(set(terms), key=len, reverse=True):
        body = re.escape(term)
        parts.append(r"(?<![A-Za-z0-9])%s(?![A-Za-z0-9])" % body if term.isascii() else body)
    return re.compile("|".join(parts), re.I)


def parse_terms(value):
    if value.startswith("@"):
        lines = Path(value[1:]).read_text(encoding="utf-8").splitlines()
        return [x.strip() for x in lines if x.strip() and not x.strip().startswith("#")]
    return [x.strip() for x in value.split(",") if x.strip()]


def paren_content(text, open_index):
    depth, out = 1, []
    for ch in text[open_index + 1:open_index + 1 + PAREN_LIMIT]:
        depth += (ch == "(") - (ch == ")")
        if depth == 0: break
        out.append(ch)
    return "".join(out)


def is_glossed(text, end, window):
    i = text.find("(", end, end + window)
    return i >= 0 and any(ch.isalpha() and ord(ch) > 127 for ch in paren_content(text, i))


def analyze(text, rx, window=60):
    """None if no term; else (any occurrence glossed, every term's first occurrence glossed)."""
    text = strip_code(text); first = {}; any_gloss = False
    for m in rx.finditer(text):
        glossed = is_glossed(text, m.end(), window)
        first.setdefault(m.group(0).lower(), glossed); any_gloss = any_gloss or glossed
    return (any_gloss, all(first.values())) if first else None


def position_bucket(n):
    return BUCKETS[0] if n <= 1 else BUCKETS[1] if n <= 3 else BUCKETS[2] if n <= 10 else BUCKETS[3] if n <= 30 else BUCKETS[4]


def collect(store, rx, window=60, since=None):
    root, units, prompts, seen = Path(store), {}, {}, set()
    for path in sorted(root.rglob("*.jsonl")):
        rel = path.relative_to(root)
        if is_subagent(rel) or WORKER_DIRS & {p.lower() for p in rel.parts[:-1]}: continue
        for rec in read_records(path):
            uid = rec.get("uuid")
            if uid:
                if uid in seen: continue
                seen.add(uid)
            if rec.get("isSidechain"): continue
            sid, kind, msg = rec.get("sessionId") or path.stem, rec.get("type"), rec.get("message")
            if kind == "user" and is_prompt(msg) and not rec.get("isMeta"):
                prompts[sid] = prompts.get(sid, 0) + 1
            elif kind == "assistant":
                text = assistant_text(msg)
                if not text: continue
                mid = msg.get("id") if isinstance(msg, dict) else None
                # one turn can span several records sharing message.id: merge them into one answer
                unit = units.setdefault((sid, mid) if mid else (sid, None, len(units)), [sid, prompts.get(sid, 0), str(rec.get("timestamp") or ""), []])
                unit[3].append(text)
    answers = []
    for sid, position, ts, texts in units.values():
        if since and ts[:10] < since: continue
        found = analyze("\n".join(texts), rx, window)
        if found: answers.append({"session": sid, "position": position, "glossed": found[0], "first_use": found[1]})
    return answers


def summarize(answers):
    out = {"answers": len(answers), "glossed": sum(a["glossed"] for a in answers), "first_use_glossed": sum(a["first_use"] for a in answers),
           "buckets": {}, "sessions": {"0%": 0, "1-49%": 0, "50-99%": 0, "100%": 0}}
    for b in BUCKETS:
        rows = [a for a in answers if position_bucket(a["position"]) == b]
        out["buckets"][b] = {"answers": len(rows), "glossed": sum(a["glossed"] for a in rows)}
    per = {}
    for a in answers: per.setdefault(a["session"], []).append(a["glossed"])
    for flags in per.values():
        if len(flags) < 3: continue
        hit = sum(flags)
        out["sessions"]["0%" if hit == 0 else "100%" if hit == len(flags) else "1-49%" if 2 * hit < len(flags) else "50-99%"] += 1
    return out


def pct(n, d):
    return "%5.1f%%" % (100.0 * n / d) if d else "  n/a"


def render(s):
    lines = ["%-22s %8s %8s %7s" % ("", "answers", "glossed", "rate"),
             "%-22s %8d %8d %7s" % ("any-use gloss", s["answers"], s["glossed"], pct(s["glossed"], s["answers"])),
             "%-22s %8d %8d %7s" % ("first-use gloss", s["answers"], s["first_use_glossed"], pct(s["first_use_glossed"], s["answers"])),
             "", "by prompt position"]
    for b, row in s["buckets"].items():
        lines.append("%-22s %8d %8d %7s" % ("  " + b, row["answers"], row["glossed"], pct(row["glossed"], row["answers"])))
    lines += ["", "sessions with 3+ term answers, by glossed share"] + ["  %-8s %d" % kv for kv in s["sessions"].items()]
    return "\n".join(lines + ["", NOTE])


def leak_check(store):
    """Hook-output attachment records (subagent transcript or sidechain) carrying the reminder -> {path: records}."""
    root, hits = Path(store), {}
    for path in sorted(root.rglob("*.jsonl")):
        sub = is_subagent(path.relative_to(root))
        try:
            with path.open("r", encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    if LEAK_NEEDLE in line and _is_leak(line, sub): hits[str(path)] = hits.get(str(path), 0) + 1
        except OSError:
            continue
    return hits


def _is_leak(line, in_subagent_file):
    """Injected hook output is an attachment record; tool results or assistant text merely quoting the line are not leaks."""
    try: rec = json.loads(line)
    except ValueError: return False
    att = rec.get("attachment") if isinstance(rec, dict) else None
    if not isinstance(att, dict) or att.get("type") not in HOOK_ATTACHMENTS: return False
    return (in_subagent_file or rec.get("isSidechain") is True) and LEAK_NEEDLE in json.dumps(att, ensure_ascii=False)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--store", help="transcript dir (default: this cwd's project under CLAUDE_CONFIG_DIR or ~/.claude)")
    ap.add_argument("--terms", help="comma list, or @file with one term per line (# comments)")
    ap.add_argument("--since", help="only answers on/after YYYY-MM-DD")
    ap.add_argument("--window", type=int, default=60, help="chars after a term in which a gloss paren may open")
    ap.add_argument("--json", dest="json_out", help="write machine-readable summary here")
    ap.add_argument("--leak-check", action="store_true", help="exit 1 if hook output in a subagent carries the reminder line")
    args = ap.parse_args(argv)
    if not args.leak_check and not args.terms: ap.error("--terms is required unless --leak-check")
    store = Path(args.store) if args.store else default_store(os.getcwd())
    if not store.is_dir():
        print("store not found: %s" % store, file=sys.stderr); return 2
    if args.leak_check:
        hits = leak_check(store)
        print("leak-check: %d subagent record(s) in %d file(s) contain %r" % (sum(hits.values()), len(hits), LEAK_NEEDLE))
        for path in hits: print("  " + path)
        return 1 if hits else 0
    terms = parse_terms(args.terms)
    if not terms: ap.error("--terms is empty")
    since = dt.date.fromisoformat(args.since).isoformat() if args.since else None
    answers = collect(store, term_regex(terms), args.window, since)
    print("store: %s\nterms: %s\nwindow: %d chars%s" % (store, ", ".join(terms), args.window, "; since " + since if since else ""))
    if not answers: print("\nno main-conversation answers use these terms.\n" + NOTE)
    else: print("\n" + render(summarize(answers)))
    if args.json_out:
        payload = {"store": str(store), "terms": terms, "window": args.window, "since": since, **summarize(answers)}
        Path(args.json_out).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
