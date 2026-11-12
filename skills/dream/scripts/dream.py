#!/usr/bin/env python3
"""Mechanical half of the dream skill: lint, repair and rule-check Claude Code memory folders.

  dream.py lint [FILTER]                 report per project; detail when FILTER, --memory or --workspace is given
  dream.py propose [FILTER]              write a rebuilt MEMORY.md draft to a staging folder
  dream.py apply [FILTER] [--apply]      rebuild MEMORY.md in place (dry run without --apply)
  dream.py fix-links [FILTER] [--apply]  rewrite [[links]] that resolve to exactly one note
  dream.py retire [FILTER] --note N      move notes to archive/ and drop their index lines (dry run without --apply)
  dream.py snapshot [FILTER]             write a tar.gz of the memory folder to memory-backups/
  dream.py rules [PATH]                  check the caps written in PATH/.claude/dream.toml (or PATH/dream.toml)

Memory root: --root, then $DREAM_MEMORY_ROOT, then $CLAUDE_CONFIG_DIR/projects, then
~/.claude/projects (first that exists).
apply, fix-links and retire write nothing without --apply; propose writes its staging file and snapshot its archive.
Never deletes a note (retire moves it to archive/). Never prints a secret value.
"""
import argparse
import fnmatch
import glob
import hashlib
import os
import posixpath
import re
import statistics
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
from datetime import datetime

MAX_BYTES, MAX_LINES = 25_000, 200
LINE_BUDGET = 150
DEEP_PAGE_MIN = 10
TOPIC_PAGES_ADVISED = 150

LINK = re.compile(r"\]\(<?((?:[^()\[\]<>#\n]|\([^()\n]*\))+?\.md)>?(?:#[^)]*)?\)")
WIKI = re.compile(r"\[\[([^\]|#]+)([^\]]*)\]\]")
CODE = re.compile(r"^ {0,3}(`{3,}|~{3,})[^\n]*\n.*?(?:^ {0,3}\1[`~]*[ \t]*\r?$|\Z)|`[^`\n]+`", re.S | re.M)
FOLDED = ("", ">", "|", ">-", "|-")

SECRETS = [
    ("private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("URL or DSN with credentials", re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s:/@]+:[^\s@/]+@")),
    ("AWS access key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("API token", re.compile(r"\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})")),
    ("JWT", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}")),
    ("password assignment", re.compile(
        r"(?i)\b(?:password|passwd|pwd)\b[\"']?\s*[:=]\s*[\"']?(?=[^\s\"']*[0-9!@#%^&*_+=/-])[^\s\"'<>{}$*]{4,}")),
    ("secret or token assignment", re.compile(
        r"(?i)\b(?:api[_-]?key|secret|token)\b[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9_\-+/=]{16,}")),
]


class Die(Exception):
    pass


def norm(s):
    return re.sub(r"[-_\s]+", "-", s.strip().lower())


def read(path):
    with open(path, "rb") as fh:
        return fh.read().decode("utf-8", "replace")


def split_lines(text):
    lines = text.split("\n")
    if lines[-1] == "":
        lines.pop()
    return lines


class Notes(dict):
    """rel -> (frontmatter, text), plus what the files looked like when read."""

    def __init__(self):
        super().__init__()
        self.digest = {}
        self.locked = {}


def read_tracked(mem, rel, notes):
    path = os.path.join(mem, rel)
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError as e:
        notes.locked[rel] = "broken symlink" if os.path.islink(path) else (e.strerror or "unreadable")
        return None
    notes.digest[rel] = hashlib.sha256(data).hexdigest()
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        notes.locked[rel] = "not valid UTF-8"
        text = data.decode("utf-8", "replace")
    if os.path.islink(path):
        notes.locked.setdefault(rel, "symlink")
    return text


def frontmatter(text):
    text = text.lstrip("\ufeff")
    if not text.startswith("---"):
        return {}
    end = text.find("\n---", 3)
    if end < 0:
        return {}
    lines, out, i = text[3:end].splitlines(), {}, 0
    while i < len(lines):
        m = re.match(r"\s*([A-Za-z_][\w-]*):\s*(.*)", lines[i])
        i += 1
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val in FOLDED:
            cont = []
            while i < len(lines) and lines[i].startswith((" ", "\t")) and not re.match(r"\s*[\w-]+:(\s|$)", lines[i]):
                cont.append(lines[i].strip())
                i += 1
            val = " ".join(cont)
        out.setdefault(key, val.strip("\"'"))
    return out


def wiki_links(text):
    code = [m.span() for m in CODE.finditer(text)]
    return [m for m in WIKI.finditer(text) if not any(a <= m.start() < b for a, b in code)]


def shown(s):
    return "(secret-like, not shown)" if secret_kinds(s) else s


def stem(rel):
    return rel[:-3] if rel.endswith(".md") else rel


def load(mem):
    notes = Notes()
    for d, dirs, files in os.walk(mem):
        dirs[:] = sorted(x for x in dirs if x != "archive" and not x.startswith("."))
        for f in sorted(files):
            rel = os.path.relpath(os.path.join(d, f), mem).replace(os.sep, "/")
            if f.endswith(".md") and rel != "MEMORY.md":
                text = read_tracked(mem, rel, notes)
                if text is not None:
                    notes[rel] = (frontmatter(text), text)
    index = read_tracked(mem, "MEMORY.md", notes) if os.path.lexists(os.path.join(mem, "MEMORY.md")) else None
    return notes, index


def archived_stems(mem):
    base = os.path.join(mem, "archive")
    out = set()
    for d, dirs, files in os.walk(base):
        dirs[:] = [x for x in dirs if not x.startswith(".")]
        for f in files:
            if f.endswith(".md"):
                out.add(stem(os.path.relpath(os.path.join(d, f), base).replace(os.sep, "/")))
    return out


def note_keys(rel, fm):
    return {k for k in (stem(rel), posixpath.basename(stem(rel)), fm.get("name", "")) if k}


def secret_kinds(text):
    return sorted({kind for kind, rx in SECRETS if rx.search(text)})


def index_targets(line):
    return [posixpath.normpath(t) for t in LINK.findall(line) if "://" not in t]


def lint(mem):
    notes, index = load(mem)
    r = {"notes": len(notes), "has_index": index is not None, "bytes": 0, "lines": 0,
         "long": [], "cut": [], "orphans": [], "missing": [], "dead": [], "fixable": [], "secrets": [], "locked": dict(notes.locked)}
    listed = set()
    if index is not None:
        r["bytes"] = len(index.encode())
        used, inside = 0, set()
        for n, raw in enumerate(split_lines(index), 1):
            line = raw.rstrip("\r")
            used += len(raw.encode()) + 1
            past = used > MAX_BYTES or n > MAX_LINES
            if len(line) > LINE_BUDGET:
                r["long"].append((len(line), "(secret-like, not shown)" if secret_kinds(line) else line[:70]))
            for target in index_targets(line):
                listed.add(target)
                if target not in notes:
                    r["missing"].append(target)
                elif past:
                    r["cut"].append(target)
                else:
                    inside.add(target)
            r["lines"] = n
        r["cut"] = [x for x in dict.fromkeys(r["cut"]) if x not in inside]
        listed |= {f for f in notes if re.search(r"(?<![\w/-])" + re.escape(f), index)}
    r["orphans"] = [f for f in notes if f not in listed]
    deep = set()
    for page in listed & notes.keys():
        text = notes[page][1]
        refs = {f for f in r["orphans"] if f in text or posixpath.basename(f) in text
                or f"[[{stem(f)}]]" in text or f"[[{notes[f][0].get('name') or f}]]" in text}
        if len(refs) >= DEEP_PAGE_MIN or re.match(r"topic[_-]", posixpath.basename(page), re.I):
            deep |= refs
    r["deep"] = sorted(deep)
    r["orphans"] = [f for f in r["orphans"] if f not in deep]
    plan = link_plan(notes, archived_stems(mem))
    r["fixable"] = [(f, old) for f, old, _ in plan["fix"]]
    r["dead"] = [(f, old) for f, old, _ in plan["unresolved"]]
    for f, (_, text) in notes.items():
        kinds = secret_kinds(text)
        if kinds:
            r["secrets"].append((f, kinds))
    if index is not None:
        kinds = secret_kinds(index)
        if kinds:
            r["secrets"].append(("MEMORY.md", kinds))
    return r, notes, index


def link_plan(notes, archived=frozenset()):
    exact, by_norm, basenames = {"MEMORY"}, {}, {}
    for rel, (fm, _) in notes.items():
        basenames[posixpath.basename(stem(rel))] = basenames.get(posixpath.basename(stem(rel)), 0) + 1
        for key in note_keys(rel, fm):
            exact.add(key)
            by_norm.setdefault(norm(key), set()).add(rel)
    fix, unresolved = [], []
    for rel, (_, text) in notes.items():
        for target in sorted({m.group(1).strip() for m in wiki_links(text)}):
            if target in exact:
                continue
            if target.startswith("archive/"):
                if stem(target[len("archive/"):]) not in archived:
                    unresolved.append((rel, target, "no such archived note"))
                continue
            cands = sorted(by_norm.get(norm(target), ()))
            if len(cands) == 1:
                base = posixpath.basename(stem(cands[0]))
                fix.append((rel, target, base if basenames[base] == 1 else stem(cands[0])))
            else:
                why = "ambiguous: " + ", ".join(cands) if cands else "no such note"
                unresolved.append((rel, target, why))
    return {"fix": fix, "unresolved": unresolved}


def rewrite_links(text, mapping):
    out, last = [], 0
    for m in wiki_links(text):
        old = m.group(1).strip()
        if old in mapping:
            out += [text[last:m.start()], f"[[{mapping[old]}{m.group(2)}]]"]
            last = m.end()
    return "".join(out) + text[last:]


def clip(s, n):
    s = " ".join(s.split())
    return s if len(s) <= n else s[:n - 1].rsplit(" ", 1)[0].rstrip(" ,;:.—-") + "…"


def first_body_line(text):
    text = text.lstrip("\ufeff")
    end = text.find("\n---", 3) + 4 if text.startswith("---") and text.find("\n---", 3) > 0 else 0
    for line in text[end:].splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            return line
    return ""


def unmatched(first, notes, seen):
    if first.startswith("archive/"):
        return "archived"
    if first.startswith("../") or first == ".." or posixpath.isabs(first):
        return "outside the folder"
    if first not in notes:
        return "missing"
    return "duplicate" if first in seen else None


def propose(notes, index, kept=None):
    """Keep every line and its order; rebuild only live lines over budget; append unlisted notes.

    Lines that point at no live note are kept as they are and appended to `kept` as (line number, reason, line)."""
    out, seen, need = [], set(), []
    old = split_lines(index or "")
    eol = "\r" if "\r\n" in (index or "") else ""

    def entry(rel, title=None):
        fm, text = notes[rel]
        title = title or fm.get("name") or stem(rel)
        hook = fm.get("description") or first_body_line(text)
        if secret_kinds(hook):
            hook = ""
        if not hook:
            need.append(rel)
            hook = "NEEDS HOOK"
        head = f"- [{title}]({rel}) — "
        return head + clip(hook, max(40, LINE_BUDGET - len(head)))

    for n, raw in enumerate(old, 1):
        line = raw.rstrip("\r")
        targets = index_targets(line)
        why = unmatched(targets[0], notes, seen) if targets else None
        if why and kept is not None:
            kept.append((n, why, line))
        if targets and not why and len(line) > LINE_BUDGET:
            m = re.search(r"\[([^\]]+)\]\(", line)
            out.append(entry(targets[0], m.group(1) if m else None) + raw[len(line):])
        else:
            out.append(raw)
        seen.update(x for x in targets if x in notes)
    for rel in notes:
        if rel not in seen:
            out.append(entry(rel) + eol)
    return "".join(x + "\n" for x in out), need


def git_toplevel(path):
    r = subprocess.run(["git", "-C", path, "rev-parse", "--show-toplevel"], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else None


def git_dirty(mem, rel):
    def git(*a):
        return subprocess.run(["git", "-C", mem, *a], capture_output=True, text=True).returncode
    return git("ls-files", "--error-unmatch", "--", rel) != 0 or git("diff", "--quiet", "HEAD", "--", rel) != 0


def snapshot(mem):
    dest = os.path.join(os.path.dirname(os.path.abspath(mem)), "memory-backups")
    os.makedirs(dest, exist_ok=True)
    base = os.path.join(dest, "memory-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
    path, n = base + ".tar.gz", 1
    while True:
        try:
            tar = tarfile.open(path, "x:gz")
            break
        except FileExistsError:
            n += 1
            path = f"{base}-{n}.tar.gz"
    try:
        with tar:
            tar.add(mem, arcname="memory")
    except OSError as e:
        os.unlink(path)
        raise Die(f"snapshot failed, nothing was written: {e}")
    os.chmod(path, 0o600)
    return path


def prepare_write(mem, files, force):
    """Refuse when a git-tracked folder has uncommitted changes in the files, else return a fresh snapshot path."""
    if git_toplevel(mem):
        dirty = [f for f in files if os.path.exists(os.path.join(mem, f)) and git_dirty(mem, f)]
        if dirty and not force:
            raise Die(f"{mem} is a git repo and {len(dirty)} file(s) to change are uncommitted or untracked "
                      f"({', '.join(dirty[:5])}{' ...' if len(dirty) > 5 else ''}). Commit first, or pass --force.")
    return snapshot(mem)


def sha(path):
    try:
        with open(path, "rb") as fh:
            return hashlib.sha256(fh.read()).hexdigest()
    except FileNotFoundError:
        return None


def replace_file(path, data):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".dream-", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        try:
            mode = stat.S_IMODE(os.stat(path).st_mode)
        except FileNotFoundError:
            mode = 0o644
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def write_files(mem, build, loaded, force):
    """build(notes, index) -> (contents, moves). Returns the (file, reason) pairs it did not write.

    Snapshot first, then read again, so the bytes written are built from what the snapshot holds
    and each file is checked against that read right before it is replaced."""
    contents, moves = build(*loaded)
    snap = prepare_write(mem, list(contents) + list(moves), force)
    print(f"  snapshot: {snap}")
    notes, index = load(mem)
    contents, moves = build(notes, index)

    def stale(rel):
        return sha(os.path.join(mem, rel)) != notes.digest.get(rel)

    skipped = [(rel, notes.locked[rel]) for rel in contents if rel in notes.locked]
    skipped += [(rel, "changed since it was read") for rel in contents if rel not in notes.locked and stale(rel)]
    for src, dst in moves.items():
        if stale(src):
            skipped.append((src, "changed since it was read"))
        top = os.path.dirname(os.path.join(mem, dst))
        while not os.path.lexists(top):
            top = os.path.dirname(top)
        if os.path.lexists(os.path.join(mem, dst)) or not os.path.isdir(top):
            skipped.append((src, f"cannot move to {dst}"))
    if moves and skipped:
        raise Die("nothing moved: " + "; ".join(f"{rel} ({why})" for rel, why in skipped))
    blocked = {rel for rel, _ in skipped}
    moved = []
    try:
        for src, dst in moves.items():
            os.makedirs(os.path.dirname(os.path.join(mem, dst)), exist_ok=True)
            if os.path.lexists(os.path.join(mem, dst)):
                raise Die(f"{dst} appeared meanwhile")
            os.rename(os.path.join(mem, src), os.path.join(mem, dst))
            moved.append((src, dst))
        for rel, text in contents.items():
            if rel in blocked:
                continue
            if stale(rel):
                if moves:
                    raise Die(f"{rel} changed since it was read")
                skipped.append((rel, "changed since it was read"))
            else:
                replace_file(os.path.join(mem, rel), text.encode("utf-8"))
    except (OSError, Die) as e:
        for src, dst in reversed(moved):
            os.rename(os.path.join(mem, dst), os.path.join(mem, src))
        raise Die(f"{e}" + (f"; {len(moved)} moved note(s) put back" if moved else "")) from e
    for rel, why in skipped:
        print(f"  skipped {rel}: {why}")
    return skipped


def memory_root(arg):
    explicit = arg or os.environ.get("DREAM_MEMORY_ROOT")
    if explicit:
        p = os.path.realpath(os.path.expanduser(explicit))
        if not os.path.isdir(p):
            raise Die(f"memory root does not exist: {p}")
        return p
    cands = []
    if os.environ.get("CLAUDE_CONFIG_DIR"):
        cands.append(os.path.join(os.environ["CLAUDE_CONFIG_DIR"], "projects"))
    cands.append("~/.claude/projects")
    for c in cands:
        p = os.path.realpath(os.path.expanduser(c))
        if os.path.isdir(p):
            return p
    raise Die("no memory root found; pass --root or set DREAM_MEMORY_ROOT")


def find_config(path):
    path = os.path.abspath(os.path.expanduser(path))
    if os.path.isfile(path):
        d = os.path.dirname(path)
        return path, (os.path.dirname(d) if os.path.basename(d) == ".claude" else d)
    for cand in (os.path.join(path, ".claude", "dream.toml"), os.path.join(path, "dream.toml")):
        if os.path.isfile(cand):
            return cand, path
    return None, path


def read_toml(path):
    try:
        import tomllib
    except ImportError:
        raise Die("dream.toml needs Python 3.11+ (tomllib)")
    with open(path, "rb") as fh:
        try:
            return tomllib.load(fh)
        except tomllib.TOMLDecodeError as e:
            raise Die(f"{path}: {e}")


def targets(a):
    if a.memory:
        mem = os.path.realpath(os.path.expanduser(a.memory))
        if not os.path.isdir(mem):
            raise Die(f"not a folder: {mem}")
        return [(os.path.basename(os.path.dirname(mem)) or mem, mem)], True
    if a.workspace:
        cfg_path, ws = find_config(a.workspace)
        cfg = read_toml(cfg_path) if cfg_path else {}
        validate_config(cfg, cfg_path)
        slug = re.sub(r"[^A-Za-z0-9]", "-", ws)
        mem = os.path.join(memory_root(a.root), slug, "memory")
        if cfg.get("memory"):
            mem = os.path.join(ws, cfg["memory"])
            inside = os.path.commonpath([os.path.realpath(ws), os.path.realpath(mem)]) == os.path.realpath(ws)
            if os.path.isabs(cfg["memory"]) or cfg["memory"].startswith("~") or not inside:
                raise Die(f"{cfg_path}: memory must be a path inside the workspace; "
                          "for a folder elsewhere pass --memory")
        if not os.path.isdir(mem):
            raise Die(f"no memory folder for workspace {ws}: {mem}")
        return [(slug, os.path.realpath(mem))], True
    root = memory_root(a.root)
    pat = a.filter or ""
    rows, seen = [], set()
    for d in sorted(os.listdir(root)):
        mem = os.path.join(root, d, "memory")
        real = os.path.realpath(mem)
        if pat in d and os.path.isdir(mem) and real not in seen:
            seen.add(real)
            rows.append((d, real))
    return rows, bool(pat)


def short(label):
    return re.sub(r"^-(?:Users|home)-[^-]+-", "", label)


def cmd_lint(a):
    rows, detail = targets(a)
    results = [(d, mem) + lint(mem) for d, mem in rows]
    print(f"{'project':52} {'notes':>5} {'idxB':>6} {'ln':>4} {'long':>4} {'cut':>4} {'deep':>4} "
          f"{'orph':>4} {'miss':>4} {'dead':>4} {'fix':>4} {'sec':>3}")
    for d, mem, r, notes, index in results:
        if not r["notes"] and not r["has_index"]:
            continue
        flag = " OVER" if r["bytes"] > MAX_BYTES or r["lines"] > MAX_LINES else ("" if r["has_index"] else " NOINDEX")
        print(f"{short(d)[-52:]:52} {r['notes']:5} {r['bytes']:6} {r['lines']:4} {len(r['long']):4} "
              f"{len(r['cut']):4} {len(r['deep']):4} {len(r['orphans']):4} {len(r['missing']):4} "
              f"{len(r['dead']):4} {len(r['fixable']):4} {len(r['secrets']):3}{flag}")
    if not detail:
        return 0
    for d, mem, r, notes, index in results:
        print(f"\n== {d}\n  {mem}")
        for k in ("cut", "orphans", "missing"):
            if r[k]:
                print(f"  {k} ({len(r[k])}): " + ", ".join(r[k][:12]) + (" …" if len(r[k]) > 12 else ""))
        for n, head in sorted(r["long"], reverse=True)[:5]:
            print(f"  long line {n:5}: {head}")
        for k in ("fixable", "dead"):
            for f, t in r[k][:8]:
                print(f"  {k} link: {f} -> [[{shown(t)}]]")
            if len(r[k]) > 8:
                print(f"  … {len(r[k]) - 8} more {k} links")
        for f, why in sorted(r["locked"].items()):
            print(f"  not rewritable by write commands: {f} ({why})")
        for f, kinds in r["secrets"]:
            print(f"  secret-like content in {f}: {', '.join(kinds)} (value not shown)")
        if r["notes"] >= TOPIC_PAGES_ADVISED:
            print(f"  {r['notes']} notes: too many for a flat index, use topic pages")
    return 0


def cmd_propose(a):
    rows, _ = targets(a)
    for d, mem in rows:
        notes, index = load(mem)
        if not notes and index is None:
            continue
        text, need = propose(notes, index)
        dest = os.path.join(a.out, d) if a.out else os.path.join(os.path.dirname(mem), "dream-staging")
        os.makedirs(dest, mode=0o700, exist_ok=True)
        target = os.path.join(dest, "MEMORY.md")
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        os.chmod(target, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        print(describe_index(d, text, need) + f" -> {target}")
        if secret_kinds(text):
            print(f"  secret-like content in the proposed index: {', '.join(secret_kinds(text))} (a curated line, value not shown)")
    return 0


def describe_index(label, text, need):
    lines = split_lines(text)
    longest = max((len(x.rstrip("\r")) for x in lines), default=0)
    over = " OVER LIMIT" if len(text.encode()) > MAX_BYTES or len(lines) > MAX_LINES else ""
    extra = f", {len(need)} notes need a hook" if need else ""
    return f"{short(label)}: proposed index {len(text.encode())} B, {len(lines)} lines, longest {longest}{over}{extra}"


def cmd_apply(a):
    rows, _ = targets(a)
    status = 0
    for d, mem in rows:
        notes, index = load(mem)
        if not notes and index is None:
            continue
        odd = []
        text, need = propose(notes, index, odd)
        print(describe_index(d, text, need) + f" (was {len((index or '').encode())} B)")
        for n, why, line in odd:
            print(f"  kept as is, line {n} ({why}): " + ("(secret-like, not shown)" if secret_kinds(line) else line[:100]))
        if text == index:
            print("  no change")
        elif not a.apply:
            print("  dry run: nothing written (pass --apply)")
        else:
            status |= guarded(lambda: write_files(
                mem, lambda n, i: ({"MEMORY.md": propose(n, i)[0]}, {}), (notes, index), a.force))
    return status


def guarded(fn):
    try:
        return 1 if fn() else 0
    except Die as e:
        print(f"  refused: {e}")
        return 1


def cmd_fix_links(a):
    rows, _ = targets(a)
    status = 0
    for d, mem in rows:
        notes, _ = load(mem)
        plan = link_plan(notes, archived_stems(mem))
        if not plan["fix"] and not plan["unresolved"]:
            continue
        print(f"== {short(d)}: {len(plan['fix'])} fixable, {len(plan['unresolved'])} unresolved")
        for f, old, new in plan["fix"]:
            print(f"  {f}: [[{shown(old)}]] -> [[{new}]]")
        for f, old, why in plan["unresolved"]:
            print(f"  unresolved {f}: [[{shown(old)}]] ({shown(why)})")
        if not plan["fix"]:
            continue
        if not a.apply:
            print("  dry run: nothing written (pass --apply)")
            continue
        def build(n, i):
            per_file = {}
            for f, old, new in link_plan(n, archived_stems(mem))["fix"]:
                per_file.setdefault(f, {})[old] = new
            return {f: rewrite_links(n[f][1], m) for f, m in per_file.items()}, {}
        status |= guarded(lambda: write_files(mem, build, (notes, None), a.force))
    return status


def retire_plan(mem, notes, index, names):
    moves = {}
    for n in dict.fromkeys(names):
        if not n.endswith(".md") and os.path.isfile(os.path.join(mem, n)):
            raise Die(f"cannot retire {n}: only .md notes can be retired")
        rel = posixpath.normpath(n if n.endswith(".md") else n + ".md")
        if rel not in notes:
            raise Die(f"no such note in {mem}: {n}")
        if rel in moves:
            continue
        dst, k = "archive/" + rel, 1
        while os.path.exists(os.path.join(mem, dst)) or dst in moves.values():
            k += 1
            dst = f"archive/{stem(rel)}-{k}.md"
        moves[rel] = dst
    contents, dropped = {}, 0
    if index is not None:
        parts = index.split("\n")
        kept = [x for x in parts if not (index_targets(x) and index_targets(x)[0] in moves)]
        dropped = len(parts) - len(kept)
        if dropped:
            contents["MEMORY.md"] = "\n".join(kept)
    return contents, moves, dropped


def cmd_retire(a):
    rows, _ = targets(a)
    if len(rows) != 1:
        raise Die(f"retire needs exactly one project, found {len(rows)}; narrow the filter or pass --memory")
    d, mem = rows[0]
    notes, index = load(mem)
    contents, moves, dropped = retire_plan(mem, notes, index, a.note)
    print(f"== {short(d)}: retire {len(moves)} note(s), drop {dropped} index line(s)")
    for src, dst in moves.items():
        print(f"  {src} -> {dst}")
    gone = {norm(k) for rel in moves for k in note_keys(rel, notes[rel][0])}
    linking = sorted(f for f, (_, text) in notes.items()
                     if f not in moves and any(norm(m.group(1)) in gone for m in wiki_links(text)))
    if linking:
        print(f"  note: {len(linking)} note(s) still link to these by [[name]] and will show as dead links "
              f"after the move: {', '.join(linking[:8])}")
    if not a.apply:
        print("  dry run: nothing written (pass --apply)")
        return 0
    return guarded(lambda: write_files(
        mem, lambda n, i: retire_plan(mem, n, i, a.note)[:2], (notes, index), a.force))


def cmd_snapshot(a):
    rows, _ = targets(a)
    for d, mem in rows:
        print(f"{short(d)}: {snapshot(mem)}")
    return 0


RULE_KEYS = {
    "file_cap": {"path", "max_lines", "max_bytes"},
    "row_cap": {"path", "max_bytes"},
    "index_count": {"index", "folder"},
    "required_field": {"path", "field"},
    "superseded": {"path"},
    "stale_label": {"path", "statuses", "max_age_days", "date_field"},
}
INT_OPTIONS = {"max_lines", "max_bytes", "max_age_days"}
STR_OPTIONS = {"path", "index", "folder", "field", "date_field"}
RULE_REQUIRED = {
    "file_cap": [("path",), ("max_lines", "max_bytes")], "row_cap": [("path",), ("max_bytes",)], "index_count": [("index",), ("folder",)],
    "required_field": [("path",), ("field",)], "superseded": [("path",)],
    "stale_label": [("path",), ("statuses",), ("max_age_days",)],
}
ROW = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+")
TABLE_SEPARATOR = re.compile(r"^\s*\|[\s:\-|]+\|?\s*$")


def validate_config(cfg, path):
    problems = []
    for key, val in cfg.items():
        if key in ("goal", "memory"):
            if not isinstance(val, str):
                problems.append(f"{key} must be a string")
        elif key not in RULE_KEYS:
            problems.append(f"unknown key or table [{key}]")
        elif not (isinstance(val, list) and all(isinstance(x, dict) for x in val)):
            problems.append(f"[{key}] must be an array of tables, written [[{key}]]")
    for kind, keys in RULE_KEYS.items():
        for i, rule in enumerate(cfg.get(kind, []) if isinstance(cfg.get(kind), list) else [], 1):
            for bad in sorted(set(rule) - keys):
                problems.append(f"[[{kind}]] #{i}: unknown option {bad}")
            for opt, val in rule.items():
                if opt in INT_OPTIONS and (not isinstance(val, int) or isinstance(val, bool) or val < 0):
                    problems.append(f"[[{kind}]] #{i}: {opt} must be a non-negative integer")
                if opt in STR_OPTIONS and not isinstance(val, str):
                    problems.append(f"[[{kind}]] #{i}: {opt} must be a string")
                if opt == "statuses" and not (isinstance(val, list) and all(isinstance(x, str) for x in val)):
                    problems.append(f"[[{kind}]] #{i}: statuses must be a list of strings")
            for group in RULE_REQUIRED[kind]:
                if not any(k in rule for k in group):
                    problems.append(f"[[{kind}]] #{i}: needs {' or '.join(group)}")
    if problems:
        raise Die(f"{path}: " + "; ".join(problems))


def expand(root, pattern):
    return sorted(p for p in glob.glob(os.path.join(root, pattern), recursive=True) if os.path.isfile(p))


def rel(root, p):
    return os.path.relpath(p, root).replace(os.sep, "/")


def check_file_cap(root, rule):
    out = []
    files = expand(root, rule["path"])
    if not files:
        return [(False, f"{rule['path']}: no file matches")]
    for p in files:
        with open(p, "rb") as fh:
            data = fh.read()
        lines, size = len(split_lines(data.decode("utf-8", "replace"))), len(data)
        bad = []
        if "max_lines" in rule and lines > rule["max_lines"]:
            bad.append(f"{lines} lines > {rule['max_lines']}")
        if "max_bytes" in rule and size > rule["max_bytes"]:
            bad.append(f"{size} B > {rule['max_bytes']}")
        out.append((not bad, f"{rel(root, p)}: " + (", ".join(bad) if bad else f"{lines} lines, {size} B")))
    return out


def check_row_cap(root, rule):
    out = []
    files = expand(root, rule["path"])
    if not files:
        return [(False, f"{rule['path']}: no file matches")]
    for p in files:
        sizes = [len(x.rstrip("\n").encode()) for x in read(p).splitlines(keepends=True)
                 if (x.lstrip().startswith("|") and not TABLE_SEPARATOR.match(x)) or ROW.match(x)]
        over = sum(1 for s in sizes if s > rule["max_bytes"])
        if not sizes:
            out.append((True, f"{rel(root, p)}: no rows"))
            continue
        out.append((over == 0, f"{rel(root, p)}: {over} of {len(sizes)} rows over {rule['max_bytes']} B "
                               f"(median {int(statistics.median(sizes))}, max {max(sizes)})"))
    return out


def check_index_count(root, rule):
    index = os.path.join(root, rule["index"])
    folder = os.path.join(root, rule["folder"])
    if not os.path.isfile(index) or not os.path.isdir(folder):
        return [(False, f"{rule['index']}: index file or folder {rule['folder']} missing")]
    pages = {rel(root, p) for p in glob.glob(os.path.join(folder, "**", "*.md"), recursive=True)
             if os.path.abspath(p) != os.path.abspath(index)}
    by_name = {}
    for p in pages:
        by_name.setdefault(norm(posixpath.basename(stem(p))), set()).add(p)
    text, base = read(index), posixpath.dirname(rel(root, index))
    linked, dead = set(), []
    for t in LINK.findall(text):
        if "://" in t:
            continue
        target = posixpath.normpath(posixpath.join(base, t))
        if target in pages:
            linked.add(target)
        elif not os.path.exists(os.path.join(root, target)):
            dead.append(t)
    for name in {m.group(1).strip() for m in wiki_links(text)}:
        hit = by_name.get(norm(posixpath.basename(name)), set())
        if hit:
            linked |= hit
        else:
            dead.append(f"[[{name}]]")
    unlinked = sorted(pages - linked)
    msg = f"{rule['index']} links {len(linked)} of {len(pages)} pages in {rule['folder']}"
    if unlinked:
        msg += f"; unlinked: {', '.join(unlinked[:10])}{' ...' if len(unlinked) > 10 else ''}"
    if dead:
        msg += f"; dead links: {', '.join(sorted(set(dead))[:10])}"
    return [(not unlinked and not dead, msg)]


def check_required_field(root, rule):
    files = expand(root, rule["path"])
    if not files:
        return [(False, f"{rule['path']}: no file matches")]
    missing = [rel(root, p) for p in files if not frontmatter(read(p)).get(rule["field"])]
    msg = f"{rule['path']}: {len(files) - len(missing)} of {len(files)} files have {rule['field']}"
    if missing:
        msg += f"; missing: {', '.join(missing[:10])}{' ...' if len(missing) > 10 else ''}"
    return [(not missing, msg)]


SUPERSEDED_TEXT = re.compile(r"superseded[^\n`]*?\bby\s+`([^`\n]+)`", re.I)


def check_superseded(root, rule):
    files = expand(root, rule["path"])
    if not files:
        return [(False, f"{rule['path']}: no file matches")]
    pointers, broken = 0, []
    for p in files:
        text = read(p)
        raw = frontmatter(text).get("superseded_by")
        if raw and raw.strip().lower() in ("null", "~", "[]"):
            raw = None
        if not raw:
            m = SUPERSEDED_TEXT.search(text)
            raw = m.group(1) if m else None
        if not raw:
            continue
        pointers += 1
        target = re.sub(r":\d+(?:-\d+)?$", "", re.sub(r"#.*$", "", raw.strip("`[] \"'")))
        here = os.path.dirname(p)
        found = any(os.path.exists(os.path.join(base, t))
                    for base in (here, root) for t in (target, target + ".md"))
        if not found:
            broken.append(f"{rel(root, p)} -> {target}")
    msg = f"{rule['path']}: {pointers} superseded pointers, {len(broken)} broken"
    if broken:
        msg += "; " + "; ".join(broken[:10])
    return [(not broken, msg)]


def check_stale_label(root, rule):
    files = expand(root, rule["path"])
    if not files:
        return [(False, f"{rule['path']}: no file matches")]
    wanted = {s.lower() for s in rule["statuses"]}
    stale, labelled = [], 0
    for p in files:
        fm = frontmatter(read(p))
        if fm.get("status", "").lower() not in wanted:
            continue
        labelled += 1
        try:
            when = datetime.strptime(fm[rule.get("date_field", "date")][:10], "%Y-%m-%d").timestamp()
        except (KeyError, ValueError):
            when = os.path.getmtime(p)
        age = int((time.time() - when) // 86400)
        if age > rule["max_age_days"]:
            stale.append(f"{rel(root, p)} ({fm['status']}, {age} d)")
    msg = f"{rule['path']}: {labelled} files labelled {'/'.join(rule['statuses'])}, {len(stale)} older than {rule['max_age_days']} d"
    if stale:
        msg += "; " + ", ".join(stale[:10]) + (" ..." if len(stale) > 10 else "")
    return [(not stale, msg)]


CHECKS = {"file_cap": check_file_cap, "row_cap": check_row_cap, "index_count": check_index_count,
          "required_field": check_required_field, "superseded": check_superseded, "stale_label": check_stale_label}


def cmd_rules(a):
    cfg_path, root = find_config(a.path or ".")
    if not cfg_path:
        raise Die(f"no dream.toml under {root} (looked for .claude/dream.toml and dream.toml)")
    cfg = read_toml(cfg_path)
    validate_config(cfg, cfg_path)
    print(f"config: {cfg_path}")
    if cfg.get("goal"):
        print(f"goal: {cfg['goal'].strip()}")
    if cfg.get("memory"):
        print(f"memory: {cfg['memory']}")
    failures = 0
    for kind, fn in CHECKS.items():
        for rule in cfg.get(kind, []):
            for ok, msg in fn(root, rule):
                failures += not ok
                print(f"{'ok  ' if ok else 'FAIL'} {kind:15} {msg}")
    print(f"{failures} failing check(s)")
    return 1 if failures else 0


def build_parser():
    p = argparse.ArgumentParser(prog="dream.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    def scoped(name, fn, writes=False):
        s = sub.add_parser(name)
        s.add_argument("filter", nargs="?", help="substring of the project folder name")
        s.add_argument("--root", help="folder holding one folder per project")
        s.add_argument("--memory", help="one memory folder, skipping the root")
        s.add_argument("--workspace", help="a workspace path: memory from its dream.toml, else derived from the path")
        if writes:
            s.add_argument("--apply", action="store_true", help="write changes (default is a dry run)")
            s.add_argument("--force", action="store_true", help="write even when the files have uncommitted changes in git")
        s.set_defaults(fn=fn)
        return s

    scoped("lint", cmd_lint)
    scoped("propose", cmd_propose).add_argument("--out", help="staging folder (default: dream-staging next to memory/)")
    scoped("apply", cmd_apply, writes=True)
    scoped("fix-links", cmd_fix_links, writes=True)
    scoped("retire", cmd_retire, writes=True).add_argument(
        "--note", action="append", required=True, help="note to move to archive/ (repeatable)")
    scoped("snapshot", cmd_snapshot)
    r = sub.add_parser("rules")
    r.add_argument("path", nargs="?", help="workspace folder or config file (default: current folder)")
    r.set_defaults(fn=cmd_rules)
    return p


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return args.fn(args)
    except Die as e:
        print(f"dream: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
