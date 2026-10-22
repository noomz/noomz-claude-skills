# Sources A, B and C — git state, secrets, unfinished markers

The exact blocks for the first three sources of Step 1, with the reasoning behind each field and pattern. Substitute the literal root from Step 0.5 for `/abs/path/to/root`; each fenced block runs in its own shell.

## Source A — git state: what would be lost

```bash
cd /abs/path/to/root || exit 1
NOISE='(^|/)node_modules/|(^|/)\.venv/|__pycache__/|(^|/)dist/|(^|/)build/|(^|/)target/|(^|/)\.next/|(^|/)\.worktrees/|\.DS_Store|\.log$'
find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort |
while IFS= read -r r; do
  # A repo with no commits yet: every rev-list below returns empty, which would
  # print blank fields and read as clean. Say what it is and move on.
  if ! git -C "$r" rev-parse --verify -q HEAD >/dev/null 2>&1; then
    printf '== %s [no commits yet] nothing committed; sources C and E have nothing to read\n' "$r"
    continue
  fi
  b=$(git -C "$r" rev-parse --abbrev-ref HEAD 2>/dev/null)
  g=$(git -C "$r" rev-parse --absolute-git-dir 2>/dev/null)
  up=$(git -C "$r" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)
  # Commits on no remote at all — the true "exists only on this laptop" count,
  # correct whether or not the branch has an upstream. Never "?".
  unpushed=$(git -C "$r" rev-list --count HEAD --not --remotes 2>/dev/null)
  # Commits reachable from HEAD and from no branch or remote — exactly what goes
  # unreachable at the next checkout. Non-zero here is what makes detached HEAD bite.
  loose=$(git -C "$r" rev-list --count HEAD --not --branches --remotes 2>/dev/null)
  if [ -n "$up" ]; then
    behind=$(git -C "$r" rev-list --count 'HEAD..@{u}' 2>/dev/null)
  else
    up="(none)"; behind="?"
  fi
  st_n=$(git -C "$r" stash list 2>/dev/null | grep -c .)
  st_old=$(git -C "$r" stash list --date=short --format='%ad' 2>/dev/null | tail -1)
  mid=""
  for f in rebase-merge rebase-apply MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD BISECT_LOG; do
    [ -e "$g/$f" ] && mid="$mid $f"
  done
  # --untracked-files=all: porcelain otherwise collapses a wholly-untracked
  # directory to one line, hiding every file inside it from every grader.
  all=$(git -C "$r" status --porcelain --untracked-files=all 2>/dev/null)
  kept=$(printf '%s\n' "$all" | grep -Ev "$NOISE")
  printf '== %s [%s] upstream:%s unpushed:%s unreachable:%s behind:%s stash:%s%s staged:%s dirty:%s filtered:%s%s\n' \
    "$r" "$b" "$up" "$unpushed" "$loose" "$behind" \
    "$st_n" "${st_old:+ (oldest $st_old)}" \
    "$(git -C "$r" diff --cached --name-only 2>/dev/null | grep -c .)" \
    "$(printf '%s\n' "$kept" | grep -c .)" \
    "$(( $(printf '%s\n' "$all" | grep -c .) - $(printf '%s\n' "$kept" | grep -c .) ))" \
    "${mid:+ MIDWAY:$mid}"
  printf '%s\n' "$kept" | grep -E '.' | head -20
done
exit 0
```

Read every field; each maps to a different way work disappears. `dirty` is edits that exist on this disk and nowhere else — the most common thing lost at exit. `upstream:(none)` is a branch nobody else can see and no backup holds. `unpushed:N` counts commits that exist on **no remote**, via `rev-list --not --remotes` rather than against an upstream: the obvious `@{u}..HEAD` returns nothing exactly when there is no upstream, which is the case the grading table calls a blocker, so an empty new branch and a branch carrying nine unpushed commits would otherwise print identically. `unreachable:N` counts commits on no branch and no remote — it separates a dev who checked out a tag to read something (`0`) from one who committed four times into limbo, and read together with a `[HEAD]` branch name it is what makes a detached HEAD dangerous.

`MIDWAY:` is an interrupted rebase, merge, cherry-pick, revert, or bisect — the highest-stakes finding on the list, because the repo looks broken tomorrow and the cold-start reflex is `git reset --hard`, which destroys the very work the rebase was moving. `filtered:N` prints even when it is the only thing on the line: a repo printing nothing at all has not been checked, while one printing `dirty:0 filtered:12` has.

The `exit 0` is deliberate: the last `grep` returns 1 when it matches nothing, and a non-zero exit here reads as failure when the output is fine. **Judge this step by its output, never by its exit status.**

## Source B — secrets and junk about to be committed

The costliest exit mistake is not lost work, it is a credential that leaves with a push. Untracked is bad; already tracked is worse, because it is one commit from public.

```bash
cd /abs/path/to/root || exit 1
# Bracket classes, no backslashes — these are passed through `awk -v`.
SECRET='(^|/)[.]env($|[.])|[.]pem$|[.]p12$|[.]pfx$|(^|/)id_(rsa|dsa|ecdsa|ed25519)$|[.]key$|(^|/)[.]npmrc$|(^|/)[.]netrc$|credentials?([.]json)?$|service.account.*[.]json$|(^|/)[.]aws/|secrets?[.]ya?ml$|secrets?[.]json$|secrets?[.]toml$'
SAFE_SUFFIX='[.]example$|[.]sample$|[.]template$|[.]dist$|[.]md$'
JUNK='(^|/)(scratch|tmp|temp)/|[.]orig$|[.]rej$|[.]bak$|(^|/)nohup[.]out$|(^|/)core$|[.]swp$|(^|/)untitled'
find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort |
while IFS= read -r r; do
  echo "== $r"
  # Match the PATH, not the porcelain line — see the warning below.
  # --untracked-files=all for the same reason as source A: a wholly-untracked
  # directory otherwise collapses to `?? newmodule/` and the secret inside it
  # is never seen. tolower() because the ls-files half below uses grep -Ei,
  # and macOS filesystems are case-insensitive, so .ENV is a real filename.
  git -C "$r" status --porcelain --untracked-files=all 2>/dev/null |
    awk -v s="$SECRET" -v j="$JUNK" -v k="$SAFE_SUFFIX" '
      { st=substr($0,1,2); p=substr($0,4); sub(/^.* -> /,"",p); gsub(/^"|"$/,"",p)
        f=tolower(p)      # match lowercased, PRINT the real name
        if (f ~ s && f !~ k) { print "  SECRET-IN-TREE [" st "] " p; next }
        if (f ~ j)           { print "  JUNK           [" st "] " p } }'
  git -C "$r" ls-files 2>/dev/null | grep -Ei "$SECRET" | grep -Ev "$SAFE_SUFFIX" | sed 's/^/  ALREADY-TRACKED /'
done
exit 0
```

**Match the path, never the raw `git status --porcelain` line.** Porcelain prefixes every path with a two-character status field and a space, so a `(^|/)`-anchored pattern can never match a file at the repo root — every root-level `.env` and the whole junk category go missing while the section prints a partial result and reads as clean. The `awk` above extracts the path into `p` and matches on that alone. The fixture in [reference/smoke-test.md](smoke-test.md) asserts both halves of the pair for exactly this reason.

A collapsed directory is the same bug one level up: porcelain reports a wholly-untracked directory as a single `?? newmodule/`, so a `.env` inside a brand-new module never reaches the scanner. Hence `--untracked-files=all` in both A and B.

Four details in that awk worth keeping. `st` is preserved and printed because grading needs it — a staged secret is a blocker, an untracked one a warning. `sub(/^.* -> /,"",p)` resolves a rename to the path that would actually be committed. Patterns use bracket classes, not backslashes, because `awk -v` processes escape sequences in the value. And `f` is a lowercased copy of `p` used only for matching — the path is printed as it really is, since a remedy naming `config.pem` fails on a case-sensitive filesystem for a file called `CONFIG.PEM`.

`SAFE_SUFFIX` exists because `.env.example` and `credentials.md` are normal committed files, and a checker that cries wolf on them gets ignored on the day it is right. A hit is a **question, not a verdict** — `config.key` may be a keyboard mapping. Check the file before calling it a leak, and never print its contents.

## Source C — unfinished work markers

Two different questions: what did *this session* leave half-built, and what does the plan still say is open.

```bash
cd /abs/path/to/root || exit 1
# Bracket classes, NOT backslashes — see the warning below. Two patterns, not
# one, because the grading table treats their hits differently.
MARK_TODO='TODO|FIXME|XXX|HACK|WIP|PLACEHOLDER|STUB|unimplemented'
MARK_SKIP='test[.]skip|test[.]only|describe[.]only|it[.]only|[.]skip[(]|pytest[.]mark[.]skip|NotImplementedError'
DOCS='[.]md$|[.]rst$|[.]txt$|[.]adoc$'
NOISE='(^|/)node_modules/|(^|/)[.]venv/|__pycache__/|(^|/)dist/|(^|/)build/|(^|/)target/|(^|/)[.]next/|(^|/)[.]worktrees/'
find . -maxdepth 2 -name .git 2>/dev/null | sed 's|/\.git$||; s|^\./||; s|^$|.|' | sort |
while IFS= read -r r; do
  echo "== $r"
  # lines this session ADDED to files git already tracks
  git -C "$r" diff HEAD --unified=0 2>/dev/null |
    awk -v t="$MARK_TODO" -v k="$MARK_SKIP" -v d="$DOCS" '
      /^\+\+\+ /{f=substr($0,7)}
      /^\+[^+]/{ ln=substr($0,2)
        if (f !~ d && ln ~ k) { print "  SKIP  changed " f ": " ln; next }
        if (ln ~ t)           { print "  TODO  changed " f ": " ln } }' | head -25
  # brand-new files: every line is new, and NONE of them appear in the diff above
  git -C "$r" ls-files --others --exclude-standard 2>/dev/null | grep -Ev "$NOISE" |
  while IFS= read -r f; do
    case "$f" in
      *.md|*.rst|*.txt|*.adoc) ;;
      *) grep -InE "$MARK_SKIP" "$r/$f" 2>/dev/null | sed "s|^|  SKIP  new $f:|" | head -3 ;;
    esac
    grep -InE "$MARK_TODO" "$r/$f" 2>/dev/null | sed "s|^|  TODO  new $f:|" | head -3
  done | head -20
done
exit 0
```

Four things this block gets wrong if you rewrite it casually.

**`awk -v` processes escape sequences, so a regex with backslashes arrives mangled.** Measured: `\.skip\(` reached awk as `.skip(` — an unbalanced paren — and awk died once per file while the scan silently found nothing. Bracket classes survive `-v` untouched. Any pattern passed through `-v` must contain no backslashes at all.

**A prose file that discusses skipping tests is not a skipped test.** The untracked half greps whole files, so without a guard it reports documentation as a finding — measured on this skill's own bundle, six hits, every one of them the text you are reading. Under the grading table a skip marker is a blocker, so a new `.md` would produce NOT SAFE for describing `test.skip`. Hence `DOCS`, the `case` guard that keeps `MARK_SKIP` away from `.md`/`.rst`/`.txt`/`.adoc`, the reuse of source A's `NOISE`, and `grep -I` so a binary cannot print `Binary file X matches` dressed up as a finding.

**Untracked files never appear in `git diff HEAD`.** A brand-new module full of stubs is invisible to the diff scan, which is exactly the file most likely to hold them. `ls-files --others --exclude-standard` is the second half, and it greps whole files on purpose: in a file git has never seen, every line is new. The read-only alternative would be `git add -N`, which mutates the index — not available to this skill.

**Both halves stay scoped to this session; neither ever widens to the whole repo.** A repo-wide `grep TODO` returns years of accumulated backlog, buries the three lines you added an hour ago, and trains the dev to skim past this section forever. The one legitimate widening is unpushed commits: if the session also committed, extend the first half to `git diff '@{u}'...HEAD` — but only where source A reported an upstream, since that ref errors out on exactly the `upstream:(none)` repos the table grades as blockers. Say that you widened.

Then the plan side:

```bash
find /abs/path/to/root -maxdepth 3 -type f -mtime -1 \
  \( -path '*/.planning/*' -o -path '*/notes/*' -o -name 'STATE*.md' -o -name 'HANDOFF*.md' -o -name 'TODO.md' \) \
  -name '*.md' 2>/dev/null | head -10
```

Open what it finds and pull the checkboxes out **untailed** — unchecked boxes are the live work, and in a large state file they sit far above the last heading:

```bash
grep -nE '^[[:space:]]*[-*+0-9.]*[[:space:]]*\[[ xX]\]' /abs/path/to/file.md
```

If nothing turns up, print `(none)` and move on. Many repos keep no planning notes, and that is not a finding.

**The absence of a note is itself a finding when there is unfinished work.** If source A shows real in-progress edits and no STATE or HANDOFF file was touched today, tomorrow's recap has nothing to resume from. That is a NOTE and it belongs in CARRY FORWARD.
