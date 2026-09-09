# Smoke test

The audit's failure mode is silence: a source that matches nothing prints nothing, exits `0`, and reads as a clean bill of health. Every serious bug this skill has had looked exactly like a clean run.

So this fixture asserts **output text**, never exit status. "It completed without error" passes on the bug — the secrets scanner once missed every root-level file while exiting `0` and printing a tidy `== .`, and an exit-status check would have called that fine and shipped it.

## Contents

- [Safety](#safety)
- [Build the fixture](#build-the-fixture)
- [Assertions](#assertions)
- [What each case is defending](#what-each-case-is-defending)
- [After changing a pattern](#after-changing-a-pattern)

## Safety

**Build this under a scratch directory, never inside a repo you audit.** The fixture deliberately creates `.env` files, a `tmp/` directory, and a conflicted merge. Seeded into a real workspace, they become findings in the next real run — and a skill about not losing work would be shipping a test that dirties the repo under audit. Delete the whole tree afterwards; nothing in it is worth keeping.

## Build the fixture

Six small repos under one root, which also exercises multi-repo discovery. Run it as one block.

```bash
SC=/tmp/ste-fixture            # scratch — NOT your workspace
rm -rf "$SC"; mkdir -p "$SC"; cd "$SC" || exit 1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@e GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@e

# repo-main — secrets at root, in a tracked subdir, AND in a wholly-new
# directory; junk; an uppercase name; prose .md; code with .only/.skip
mkdir -p repo-main/api repo-main/tmp repo-main/newmodule && cd repo-main && git init -q .
echo x > seed.txt && git add seed.txt && git commit -qm seed
printf 'K=1\n' > .env; printf 'K=2\n' > api/.env; printf 'K=3\n' > .env.example
printf 'K=4\n' > newmodule/.env; printf 'code\n' > newmodule/index.js
printf 'K=9\n' > CONFIG.PEM
printf 'j\n' > tmp/junk.txt; printf 'j\n' > nohup.out
printf 'notes about test.skip and TODO here\n' > NOTES.md
printf 'it.only("a",()=>{})\ntest.skip("b",()=>{})\n// TODO wire this\n' > app.js
echo edited >> seed.txt
cd ..

# repo-tracked — a secret already committed
mkdir repo-tracked && cd repo-tracked && git init -q .
printf 'SECRET=abc\n' > .env && git add .env && git commit -qm oops
cd ..

# repo-detached — two commits made while detached
mkdir repo-detached && cd repo-detached && git init -q .
echo a > f && git add f && git commit -qm a
git checkout -q --detach
echo b >> f && git commit -qam b; echo c >> f && git commit -qam c
cd ..

# repo-branches — an empty branch and a branch with real commits, no remote
mkdir repo-branches && cd repo-branches && git init -q .
echo a > f && git add f && git commit -qm a
git checkout -qb feature-empty
git checkout -qb feature-work && echo b >> f && git commit -qam b && echo c >> f && git commit -qam c
cd ..

# repo-midway — a conflicted merge left in progress
mkdir repo-midway && cd repo-midway && git init -q .
echo base > f && git add f && git commit -qm base
git checkout -qb other && echo other > f && git commit -qam other
git checkout -q -; echo main > f && git commit -qam main
git merge other -q 2>/dev/null      # exits 1 on conflict — that is the point
cd ..

# repo-empty — git init and nothing else
mkdir repo-empty && cd repo-empty && git init -q .
cd ..

# repo-stores — the three shapes source F has to see. All three were invisible
# to every source before the depth-bounded probe existed.
mkdir -p repo-stores && cd repo-stores && git init -q .
printf 'vault/\n' > .gitignore            # scratchdir/ stays UNTRACKED, not ignored
echo seed > seed.md && git add seed.md .gitignore && git commit -qm seed
mkdir -p vault/kb && (cd vault/kb && git init -q . && echo secret > note.md \
  && git add note.md && git commit -qm laptop-only && echo dirty >> note.md)
mkdir -p vault/fresh && (cd vault/fresh && git init -q . && echo x > a.md)
mkdir -p scratchdir/proj && (cd scratchdir/proj && git init -q . && echo y > b.md \
  && git add b.md && git commit -qm c)
cd ..
ls -1
```

Then run sources A, B and C from SKILL.md against `$SC` as the root.

## Assertions

Observed output, not predicted. Each line below is what the current skill actually prints.

**Source A** — one line per repo:

```
== repo-branches [feature-work] upstream:(none) unpushed:3 unreachable:0 …
== repo-detached [HEAD]         upstream:(none) unpushed:3 unreachable:2 …
== repo-empty   [no commits yet] nothing committed; sources C and E have nothing to read
== repo-main    [main]          upstream:(none) unpushed:1 unreachable:0 … dirty:11
== repo-midway  [main]          upstream:(none) unpushed:2 unreachable:0 … MIDWAY: MERGE_HEAD
== repo-tracked [main]          upstream:(none) unpushed:1 unreachable:0 …
```

| Must hold | Fails if |
|---|---|
| `repo-detached` shows `unreachable:2` | it shows `0` or blank — detached-HEAD commits are ungraded again |
| `repo-detached` shows `[HEAD]` | branch detection broke |
| `repo-midway` shows `MIDWAY: MERGE_HEAD` | the highest-stakes finding in the skill is invisible |
| `repo-empty` prints its own line | blank numeric fields, which read as a clean repo |
| `repo-main` shows `dirty:11`, not `dirty:1` | `--untracked-files=all` was dropped and directories collapse again |
| every `unpushed:` is a number | a `?` is back, and "no upstream" no longer distinguishes 0 commits from 9 |

**Source B**:

```
== repo-main
  SECRET-IN-TREE [??] .env
  SECRET-IN-TREE [??] CONFIG.PEM
  SECRET-IN-TREE [??] api/.env
  SECRET-IN-TREE [??] newmodule/.env
  JUNK           [??] nohup.out
  JUNK           [??] tmp/junk.txt
== repo-tracked
  ALREADY-TRACKED .env
```

| Must hold | Fails if |
|---|---|
| **both** `.env` and `api/.env` appear | the anchor bug is back — see below |
| `newmodule/.env` appears | `--untracked-files=all` was dropped: porcelain collapses a wholly-new directory to `?? newmodule/` and the secret inside is never scanned |
| `tmp/junk.txt` appears, not `tmp/` | same flag, same collapse, junk half |
| `CONFIG.PEM` appears, **spelled that way** | case handling broke. Matching is lowercased (macOS filesystems are case-insensitive, so `.ENV` is a real possible filename); printing is not, because a remedy naming `config.pem` fails on a case-sensitive filesystem |
| `nohup.out` appears | the junk category is dead at root again |
| `.env.example` appears **nowhere** | `SAFE_SUFFIX` broke and the scanner cries wolf |
| `repo-tracked` prints `ALREADY-TRACKED .env` | the committed-secret path — the highest-consequence branch in the skill — is unexercised |
| status fields (`[??]`, `[A ]`) are present | staged-vs-untracked grading has nothing to read |

**Source C**:

```
== repo-main
  TODO  new NOTES.md:1:notes about test.skip and TODO here
  SKIP  new app.js:1:it.only("a",()=>{})
  SKIP  new app.js:2:test.skip("b",()=>{})
  TODO  new app.js:3:// TODO wire this
```

| Must hold | Fails if |
|---|---|
| `NOTES.md` is labelled **TODO**, never SKIP | prose about skipping tests is graded as a skipped test — the skill flags its own documentation as a blocker |
| `app.js` produces two SKIP lines | `.only`/`.skip` detection broke in code, where it matters |
| no `Binary file … matches` anywhere | `grep -I` was dropped |

**Source F** against `repo-stores`:

```
NESTED-REPO vault/kb [main] upstream:(none) unpushed:1 dirty:1
NESTED-REPO vault/fresh [no commits yet] dirty:1
IGNORED-STORE vault/ text-today:2 text-predating:0
NESTED-REPO scratchdir/proj [main] upstream:(none) unpushed:1 dirty:0
LOCAL-BY-CONVENTION scratchdir/ tracked:0 ondisk:1 predating:0
```

`scratchdir/` must stay out of `.gitignore`. An earlier draft of this fixture ignored it, and `LOCAL-BY-CONVENTION` — one of the three findings the case exists to test — never fired at all while the assertions claimed it did.

| Must hold | Fails if |
|---|---|
| `vault/kb` appears | the nested-repo probe went back to a single `${p}.git` test, which only sees a repo sitting *exactly at* the ignored path. One level deeper it printed nothing, exit 0 — and source A's `-maxdepth 2` misses it too, so a commit on no remote vanished from every source at once |
| `vault/fresh` shows `[no commits yet]` | the unborn-HEAD guard is gone and `unpushed:` prints blank — the same hole source A already guards |
| `scratchdir/proj` appears | repos under *untracked* paths are unprobed |
| `scratchdir/` shows `ondisk:1`, not `ondisk:27` | the counts stopped excluding `.git/`, so the number the dev reasons about is mostly git objects |
| `LOCAL-BY-CONVENTION` prints `tracked:` | the grading table keys on it; without it a grader reads a field that is not there |
| each repo appears exactly **once** | the dedupe is gone — both halves of source F can reach the same repo |

## What each case is defending

Every case here exists because something went wrong, or would have.

- **`.env` *and* `api/.env` together.** The pair is what makes an anchor bug diagnosable. Root-only failing looks like "the regex is broken"; subdirectory-only passing looks like "the regex is fine." Only both at once point at the anchor. This is the direct regression test for the bug where `git status --porcelain`'s two-character status prefix made `(^|/)` unmatchable at root — every root-level secret and the entire junk category went missing while the section printed a partial result and looked healthy.
- **A committed secret.** Exercises the `ALREADY-TRACKED` path and the remediation branch that says the credential is in history and should be treated as exposed. Highest consequence, and otherwise entirely uncovered.
- **A prose `.md` containing `test.skip`.** Measured: an earlier version returned six findings against this skill's own bundle, every one of them documentation. Under the grading table that is a blocker, so the skill declared itself unsafe to exit for describing what it does.
- **Detached HEAD with commits.** Separates a dev who checked out a tag to read something from one who committed four times into limbo. Before `unreachable:`, both graded identically.
- **An empty branch beside a branch with commits.** Both have no upstream. The grading table calls that a blocker, so the count has to be real or an untouched branch grades the same as three commits of unpushed work.
- **A conflicted merge.** The skill's own highest-stakes finding, and the input to the accepted-blocker path in the remediation ladder.
- **The three store shapes.** A repo one level below an ignored path, an ignored repo with no commits, and a repo under an untracked path. All three were invisible to every source at once, and the first is the worst kind: an unpushed commit on no remote, reported nowhere, exit 0.
- **A repo with no commits.** The state of every repo on its first day. `git diff HEAD` fails there and the error is swallowed, so without a guard the whole repo reads as clean.

## Run the blocks, do not retype them

Extract the fenced blocks from SKILL.md and execute those, substituting the fixture path for `/abs/path/to/root`:

```bash
python3 - <<'EOF'
import re
s=open('skills/safe-to-exit/SKILL.md').read()
for b in re.findall(r'```bash\n(.*?)```', s, re.DOTALL):
    if 'SECRET=' in b: open('/tmp/sourceB.sh','w').write(b)
EOF
sed "s|/abs/path/to/root|/tmp/ste-fixture|" /tmp/sourceB.sh | zsh
```

This is not fussiness. A verification run of source B was once reported as passing when the tester had typed `--untracked-files=all` into the command by hand while the flag was absent from the file — so the run proved a version of the skill that did not exist, and the missing flag shipped. Testing a retyped approximation of the code is how a fix gets credited to a file that never received it.

## After changing a pattern

Re-run the fixture whenever you touch `SECRET`, `JUNK`, `SAFE_SUFFIX`, `MARK_TODO`, `MARK_SKIP`, `NOISE`, or any `rev-list`. A denylist edit that looks obviously correct is exactly the kind that quietly stops matching at one anchor position.

Two rules worth keeping when you extend this:

- **Add the failing case before the fix.** Every assertion above began as an observed failure. A case added after the fix only proves the fix exists today; one added before it proves the bug is gone and stays gone.
- **Assert the text, never the exit code.** Repeating the opening point because it is the whole reason this file exists: the bugs this skill has had all exited `0`.
