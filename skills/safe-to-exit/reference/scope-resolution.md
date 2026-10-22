# Scope resolution — Step 0.5 detail

The script that resolves the root and counts repos, the three options to offer when scope is ambiguous, and why the gate is hard.

## The script

```bash
WS=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$WS" || exit 1
# Did `git rev-parse` actually resolve, or did we fall back to `pwd`? These are
# very different situations and the fallback is the one that goes wrong.
INREPO=$(git rev-parse --is-inside-work-tree 2>/dev/null || echo false)
echo "root:   $WS"
echo "inrepo: $INREPO"
echo "now:    $(date '+%F %H:%M')"
REPOS=$(find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort)
echo "repos:  $(printf '%s\n' "$REPOS" | grep -c .)"
printf '%s\n' "$REPOS" | head -20
```

## Asking which scope

When you have to ask, offer these three and wait:

- **this session's writes only** — the repos holding files you actually created or edited this session. Usually what the dev means, and the cheapest. There is no single command for it: take the paths this session wrote, resolve each to its repo with `git -C <dir> rev-parse --show-toplevel`, and run the sources once per distinct root.
- **one named repo** — they name it.
- **all N** — an explicit, informed sweep.

## Why this is a hard gate rather than a judgement call

Launched from a directory that is not itself a repo — `~/Projects`, `~/work`, any workspace parent — `git rev-parse --show-toplevel` fails, `WS` becomes `pwd`, and every project underneath is a legitimate `find` hit. Measured: 19 repos, five sources each, and the dev interrupted the run before any verdict appeared. An exit check that has to be interrupted has failed completely — it produced no answer at all, at the one moment its answer was wanted. Cost is a safety property here, not an efficiency concern.

Whatever scope is chosen, **name it in the readout header and in `basis:`** — `1 repo (this session's writes)` reads very differently from `19 repos`, and a scope the dev cannot see is one they cannot correct.
