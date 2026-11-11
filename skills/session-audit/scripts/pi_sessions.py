#!/usr/bin/env python3
"""Read-only reader for Pi session JSONL files (versions 1-3).

Files are opened with open(..., "r") only: nothing here writes, renames, or migrates a store.
Problem details carry paths, ids, counts, and versions, never transcript text.
"""
import datetime as dt
import json
import os
import re
from collections import Counter
from pathlib import Path

SUPPORTED_VERSIONS = (1, 2, 3)
# A session with any of these problems is audited but reported `complete: false`.
INCOMPLETE_KINDS = ("malformed_lines", "missing_field", "duplicate_id")
USAGE_FIELDS = (("input", "input_tokens"), ("output", "output_tokens"), ("cacheRead", "cache_read_input_tokens"), ("cacheWrite", "cache_creation_input_tokens"))
TOOL_RESULT_BUCKET = "tool_result (not in totals)"
SCOPE_LABELS = {"path": "entries on the selected leaf-to-root path", "file": "every entry in this file"}


def encode_project_dir(cwd):
    """Pi's session directory name: strip one leading separator, map / \\ : to -, wrap in --."""
    text = str(cwd)
    if text[:1] in ("/", "\\"):
        text = text[1:]
    return "--%s--" % re.sub(r"[/\\:]", "-", text)


def default_store(cwd):
    base = Path(os.environ.get("PI_CODING_AGENT_DIR") or "~/.pi/agent").expanduser()
    return base / "sessions" / encode_project_dir(cwd)


class PiFile:
    def __init__(self, path):
        self.path = str(path)
        self.header = None
        self.version = None
        self.cwd = None
        self.parent_session = None
        self.entries = []
        self.malformed = 0
        self.last_line_malformed = False
        self.last_entry = None
        self.problems = []
        self.unavailable = None

    def problem(self, kind, detail):
        self.problems.append({"kind": kind, "detail": detail})

    def fail(self, kind, detail):
        self.problem(kind, detail)
        self.unavailable = kind

    @property
    def usable(self):
        return self.unavailable is None

    @property
    def complete(self):
        return self.malformed == 0 and not any(p["kind"] in INCOMPLETE_KINDS for p in self.problems)

    @property
    def session_id(self):
        sid = (self.header or {}).get("id")
        return sid if isinstance(sid, str) and sid else Path(self.path).stem


def load_file(path):
    result = PiFile(path)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if not line.strip():
                    continue
                try:
                    obj = json.loads(line)
                except (ValueError, RecursionError):
                    obj = None
                valid = isinstance(obj, dict)
                result.last_line_malformed = not valid
                result.last_entry = obj if valid else None
                if not valid:
                    result.malformed += 1
                elif result.header is None and obj.get("type") == "session":
                    result.header = obj
                else:
                    result.entries.append(obj)
    except OSError as exc:
        result.fail("unreadable", exc.__class__.__name__)
        return result
    if result.header is None:
        result.fail("missing_header", "no session header line")
        return result
    version = result.header.get("version", 1)
    if type(version) is not int or version not in SUPPORTED_VERSIONS:
        shown = version if type(version) is int else type(version).__name__
        result.fail("unsupported_version", "version %s" % shown)
        return result
    result.version = version
    cwd = result.header.get("cwd")
    result.cwd = cwd if isinstance(cwd, str) else None
    parent = result.header.get("parentSession")
    result.parent_session = parent if isinstance(parent, str) and parent else None
    if not isinstance(result.header.get("id"), str) or not result.header.get("id"):
        result.problem("missing_field", "header: field id")
    if result.malformed:
        result.problem("malformed_lines", "%d line(s) skipped" % result.malformed)
    return result


def _ref(entry, index):
    eid = entry.get("id")
    return (eid[:40] if isinstance(eid, str) else "#%d" % index)


def select_path(result, leaf=None):
    """Return (path_entries, info); path_entries is None when the session is unavailable."""
    info = {"leaf_id": None, "leaf_source": None, "path_entries": 0, "abandoned_entries": 0}

    def unavailable(kind, detail):
        result.fail(kind, detail)
        return None, info

    if not result.usable:
        return None, info
    if result.version == 1:
        if leaf is not None:
            return unavailable("leaf_unsupported_v1", "version 1 files are linear; --leaf needs version 2 or 3")
        info.update(leaf_source="v1-linear", path_entries=len(result.entries))
        return list(result.entries), info
    index, bad_parent = {}, set()
    for i, entry in enumerate(result.entries):
        eid = entry.get("id")
        if not isinstance(eid, str):
            result.problem("missing_field", "entry #%d: field id" % i)
            continue
        if "parentId" not in entry or not (entry["parentId"] is None or isinstance(entry["parentId"], str)):
            result.problem("missing_field", "entry %s: field parentId" % _ref(entry, i))
            bad_parent.add(eid)
        if eid in index:
            result.problem("duplicate_id", "entry %s: repeated id" % _ref(entry, i))
            continue
        index[eid] = entry
    if leaf is not None:
        if leaf not in index:
            return unavailable("leaf_not_found", "no entry with id %s" % str(leaf)[:40])
        leaf_id, info["leaf_source"] = leaf, "explicit"
    else:
        last = result.last_entry
        if result.last_line_malformed:
            return unavailable("leaf_unknown", "last line is malformed; pass --leaf to choose a leaf")
        if not result.entries:
            info["leaf_source"] = "last-appended"
            return [], info
        if last is result.header or not isinstance(last.get("id"), str) or last["id"] not in index:
            return unavailable("leaf_unknown", "last entry has no usable id; pass --leaf to choose a leaf")
        leaf_id, info["leaf_source"] = last["id"], "last-appended"
    path, seen, current, child = [], set(), leaf_id, leaf_id
    while current is not None:
        if current in seen:
            return unavailable("lineage_cycle", "cycle at entry %s" % current[:40])
        entry = index.get(current)
        if entry is None:
            return unavailable("broken_lineage", "entry %s names missing parent %s" % (child[:40], current[:40]))
        if current in bad_parent:
            return unavailable("broken_lineage", "entry %s has no valid parentId" % current[:40])
        seen.add(current)
        path.append(entry)
        child, current = current, entry["parentId"]
    path.reverse()
    info.update(leaf_id=leaf_id, path_entries=len(path), abandoned_entries=len(index) - len(seen))
    return path, info


def _stamp(value):
    """Return an aware ISO string for a parseable timestamp, else None."""
    if not isinstance(value, str):
        return None
    try:
        when = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (when if when.tzinfo else when.replace(tzinfo=dt.timezone.utc)).isoformat()


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def to_records(result, path_entries):
    """Map path entries to the records Session.add consumes. Records missing fields on the result."""
    records = []
    for i, entry in enumerate(path_entries):
        ref = _ref(entry, i)
        stamp = _stamp(entry.get("timestamp"))
        if stamp is None:
            reason = "missing" if not isinstance(entry.get("timestamp"), str) else "unparseable"
            result.problem("missing_field", "entry %s: field timestamp (%s)" % (ref, reason))
        if entry.get("type") != "message":
            continue
        message = entry.get("message")
        if not isinstance(message, dict):
            result.problem("missing_field", "entry %s: field message" % ref)
            continue
        role, content = message.get("role"), message.get("content")
        if role in ("user", "assistant", "toolResult") and not isinstance(content, (str, list)):
            result.problem("missing_field", "entry %s: field content" % ref)
            content = ""
        if role == "user":
            records.append({"type": "user", "timestamp": stamp, "message": {"content": content}})
        elif role == "toolResult":
            records.append({"type": "user", "timestamp": stamp, "message": {"content": [{"type": "tool_result"}]}})
        elif role == "assistant":
            blocks = []
            for block in ([{"type": "text", "text": content}] if isinstance(content, str) else content):
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "text":
                    blocks.append({"type": "text", "text": block.get("text") if isinstance(block.get("text"), str) else ""})
                elif block.get("type") == "toolCall":
                    args = block.get("arguments")
                    blocks.append({"type": "tool_use", "name": str(block.get("name", "")), "input": args if isinstance(args, dict) else {}})
            usage = message.get("usage") if isinstance(message.get("usage"), dict) else {}
            parts = [_number(usage.get("output")), _number(usage.get("cacheWrite"))]
            tokens = int(sum(p for p in parts if p is not None)) if any(p is not None for p in parts) else None
            body = {"content": blocks}
            if isinstance(message.get("model"), str):
                body["model"] = message["model"]
            records.append({"type": "assistant", "timestamp": stamp, "message": body, "_tokens": tokens})
    return records


def _usage_source(entry):
    """(bucket, model, kind, usage) for an entry that may carry usage, else None."""
    kind = entry.get("type")
    if kind == "message":
        message = entry.get("message")
        if not isinstance(message, dict) or message.get("role") not in ("assistant", "toolResult"):
            return None
        bucket = "assistant" if message["role"] == "assistant" else TOOL_RESULT_BUCKET
        return bucket, message.get("model"), None, message.get("usage")
    if kind == "usage":
        return "usage_entry", entry.get("model"), entry.get("kind"), entry.get("usage")
    if kind in ("compaction", "branch_summary"):
        return kind, entry.get("model"), None, entry.get("usage")
    return None


def _add(target, usage):
    for src, dst in USAGE_FIELDS:
        target[dst] += int(_number(usage.get(src)) or 0)


def _scope(entries, name):
    seen, buckets, total, counted = set(), {}, Counter(), False
    for entry in entries:
        key = entry["id"] if isinstance(entry.get("id"), str) else id(entry)
        if key in seen:
            continue
        seen.add(key)
        source = _usage_source(entry)
        if source is None or not isinstance(source[3], dict):
            continue
        bucket, model, kind, usage = source
        slot = buckets.setdefault(bucket, {"entries": 0, "by_model": {}, "total": Counter()})
        slot["entries"] += 1
        _add(slot["by_model"].setdefault(model if isinstance(model, str) and model else "<unknown>", Counter()), usage)
        _add(slot["total"], usage)
        if bucket == "usage_entry":
            _add(slot.setdefault("by_kind", {}).setdefault(kind if isinstance(kind, str) and kind else "<unknown>", Counter()), usage)
        if bucket != TOOL_RESULT_BUCKET:
            counted = True
            _add(total, usage)

    def plain(value):
        return {k: plain(v) for k, v in value.items()} if isinstance(value, (dict, Counter)) else value
    tool_result = buckets.pop(TOOL_RESULT_BUCKET, None)
    scope = {"scope": name, "label": SCOPE_LABELS[name], "buckets": plain(buckets), "total": dict(total) if counted else "unavailable"}
    if tool_result is not None:
        scope[TOOL_RESULT_BUCKET] = plain(tool_result)
    return scope


def usage_totals(result, path_entries):
    """Usage for the `path` and `file` scopes. Neither claims to equal Pi's own session statistics."""
    return {"path": _scope(path_entries, "path"), "file": _scope(result.entries, "file")}
