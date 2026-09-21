#!/usr/bin/env python3
"""UserPromptSubmit hook: one-line domain-gloss reminder.

Silent unless CLAUDE_GLOSS_HOOK (trimmed, case-insensitive) equals "on" and every
other guard in reminder() passes. Any error or odd input also stays silent, exit 0.
"""
import json
import os
import re
import sys

TAG = re.compile(r"[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*")
CONTROL = re.compile("[\x00-\x1f\x7f-\x9f  ]")
LEADING = re.compile("^[\\s﻿]+")  # whitespace and BOM before the prompt proper
ENGLISH = {"en", "eng", "english"}
LINE = ('domain-gloss ON (%s): keep each domain term in English; gloss Band 2 on first use '
        'and Band 3 false friends once per answer as "term (gloss)". Chat prose only — '
        'never in code, commits, files on disk, or text sent to tools or other agents.')


def clean(value):
    # Env content must not smuggle extra lines into the model's context.
    return CONTROL.sub("", value).strip()


def reminder(payload, env):
    """Return the reminder line, or "" when the hook must stay silent."""
    if env.get("CLAUDE_GLOSS_HOOK", "").strip().lower() != "on":
        return ""
    chain = clean(env.get("CLAUDE_GLOSS_LANG", ""))
    if len(chain) > 80:  # validate the whole chain; never truncate a bad one into a good one
        return ""
    entries = [e.strip() for e in chain.split(",")]
    if not all(TAG.fullmatch(e) for e in entries) or entries[0].split("-")[0].lower() in ENGLISH:
        return ""
    lang = ",".join(entries)
    if "agent_id" in payload:  # presence, not truthiness: an empty id is still a subagent
        return ""
    prompt = payload.get("prompt")
    if not isinstance(prompt, str):
        return ""
    prompt = LEADING.sub("", prompt)
    marker = env.get("CLAUDE_GLOSS_SUBAGENT_MARKER", "").strip()
    if marker and prompt.startswith(marker):
        return ""
    if prompt.startswith("/"):
        command = prompt.split(None, 1)[0]
        if command != "/domain-gloss" and not command.endswith(":domain-gloss"):
            return ""
    skip = clean(env.get("CLAUDE_GLOSS_SKIP", ""))[:80]
    return LINE % (lang + "; skip: " + skip if skip else lang)


def main():
    try:
        payload = json.loads(sys.stdin.buffer.read())
        out = reminder(payload, os.environ) if isinstance(payload, dict) else ""
        if out:
            sys.stdout.reconfigure(encoding="utf-8")
            print(out)
            sys.stdout.flush()
    except Exception:
        # A hook must never break the user's prompt. Point stdout at devnull so a closed
        # pipe cannot raise again in the interpreter's final flush (exit 120, stderr noise).
        try:
            os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        except Exception:
            pass


if __name__ == "__main__":
    main()
