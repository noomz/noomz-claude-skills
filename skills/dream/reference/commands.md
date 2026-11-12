# dream.py reference

## Contents

- Commands
- Scoping
- The lint table
- Safety rules
- The dream.toml format
- Checks

## Commands

```
dream.py lint [FILTER]                 report per project; detail with FILTER, --memory or --workspace
dream.py propose [FILTER] [--out DIR]  write a rebuilt MEMORY.md draft to a staging folder
dream.py apply [FILTER] [--apply]      rebuild MEMORY.md in place (dry run without --apply)
dream.py fix-links [FILTER] [--apply]  rewrite [[links]] that resolve to exactly one note
dream.py retire [FILTER] --note N ...  move notes to archive/ and drop their index lines
dream.py snapshot [FILTER]             tar.gz of the memory folder into memory-backups/
dream.py rules [PATH]                  run the checks written in PATH/.claude/dream.toml
```

Exit code: 0 clean, 1 a check failed or a write was refused or skipped, 2 bad input.

## Scoping

- `FILTER`: substring of the project folder name under the memory root. Without it, `lint` prints one row per project and the write commands act on every project, so always filter before a write.
- `--root DIR`: folder holding one folder per project (each with a `memory/` folder). Default: `$DREAM_MEMORY_ROOT`, then `$CLAUDE_CONFIG_DIR/projects`, then `~/.claude/projects`.
- `--memory DIR`: one memory folder, skipping the root.
- `--workspace PATH`: a workspace path. The memory folder comes from its `dream.toml` (`memory`, a path inside the workspace), else from the path under the memory root.
- `retire` needs exactly one project.

## The lint table

| Column | Meaning |
|---|---|
| notes | note files, not counting `MEMORY.md`, `archive/` or dot folders |
| idxB, ln | index bytes and lines; `OVER` when past 25,000 bytes or 200 lines |
| long | index lines over 150 characters |
| cut | notes whose only index line sits past the load limit |
| deep | notes reachable only through another listed page, not orphans. A listed page counts as an index page when its file is named `topic_*` or `topic-*`, or when it names 10 or more unlisted notes |
| orph | notes no index line or topic page mentions |
| miss | index links to notes that do not exist |
| dead | `[[links]]` that resolve to nothing, or to more than one note; `[[archive/<stem>]]` counts only when `archive/<stem>.md` does not exist |
| fix | `[[links]]` that resolve to exactly one note after dash, underscore and case normalisation |
| sec | notes that look like they hold a password, token or credentialed URL; name and kind only |

## Safety rules

- `apply`, `fix-links` and `retire` write nothing without `--apply`. `propose` always writes its draft to the staging folder (folder mode 0700, file mode 0600; a curated line that looks secret is copied as is and reported by kind), and `snapshot` always writes its archive.
- Before any write the script writes a timestamped tar.gz of the whole memory folder to a sibling `memory-backups/` folder (mode 0600) and prints the path. It does this even when the folder is a git repo.
- In a git repo, a write is refused when a file it would change has uncommitted modifications or is untracked, unless `--force`.
- Notes are never deleted. `retire` moves a note to `archive/` (same relative path; a name clash gets a `-2` suffix) and drops the index lines pointing at it. `lint` ignores `archive/`. `retire` is all or nothing: every destination and source is checked before the first move, and if a move or the index write then fails, the moves already made are put back. A note named twice is moved once. Other notes that link to a retired note by `[[name]]` are listed in the output; those links show as dead afterwards.
- Secret values are never printed and never copied into a proposed index; a hook that looks secret is replaced by `NEEDS HOOK`.
- `fix-links` rewrites `[[target]]` only when it resolves to exactly one existing note after dash, underscore and case normalisation, matching both file stems and frontmatter `name`s. The new target is always the note's file stem (file name without `.md`), never its `name`; when another note has the same base name, it is the full stem (`sub/a`) so the link stays unique. Links inside fenced code blocks and inline code are not links: they are neither reported nor rewritten. Links in the frontmatter are fixed like those in the body. A link that already equals a file stem or a `name` exactly is valid and untouched. Ambiguous and unresolved links are listed and left alone. Aliases (`[[x|alias]]`) are kept.
- `[[archive/<stem>]]` and `[[archive/<stem>.md]]` are valid when that archived note exists and dead when it does not. `fix-links` never rewrites an `archive/` link and never points a plain link into `archive/`. Archived notes are excluded from every other lint count.
- `retire` only moves `.md` notes. Any other file (for example `MEMORY.md.migrated-from-work`) is refused by name with "only .md notes can be retired", exit 2, nothing moved.
- `apply` never drops an index line. Every existing line stays, in order, byte for byte (line endings included); it only appends lines for unlisted notes and rebuilds live lines over 150 characters. Lines that point at no live note (`archive/` links, missing notes, links outside the folder, a second line for a note already listed) are kept as they are and listed, with the reason, in the dry run and in the `--apply` output, so you can decide. A second `apply` changes nothing. To refresh one line from its note, delete that line from `MEMORY.md` and run `apply` again: the note is unlisted, so it is appended with its current `description`.
- Files keep their bytes outside the edited spans: line endings and encoding are unchanged. A file that is not valid UTF-8, or a symlink, is never rewritten; it is skipped, reported by name, and the exit code is 1.
- The snapshot is taken before the files that get written are read again. Right before each file is replaced, its content is compared with what was read; if another session changed it, that file is skipped, reported, and the exit code is 1 after the rest are done. Writes are atomic (temp file in the same folder, then rename) and keep the file's mode. Symlinks are stored in the snapshot as links, which is why the write commands never rewrite through one. A snapshot that cannot be completed (for example an unreadable file) leaves no partial archive, writes nothing else and exits 2.

## The dream.toml format

Looked for at `PATH/.claude/dream.toml`, then `PATH/dream.toml`. Python 3.11+ reads it. Unknown keys and wrong types are rejected with exit 2. Paths in checks are relative to the workspace and may use `**` globs.

```toml
goal = "What memory is for in this project."   # optional, printed by `rules`
memory = "notes/memory"                         # optional, a folder inside the workspace; use --memory for one elsewhere

[[file_cap]]
path = "STATUS.md"
max_lines = 60            # and/or max_bytes

[[row_cap]]
path = "docs/decisions.md"
max_bytes = 300           # per table row or list item

[[index_count]]
index = "wiki/index.md"
folder = "wiki"

[[required_field]]
path = "handoffs/*.md"
field = "status"

[[superseded]]
path = "handoffs/*.md"

[[stale_label]]
path = "handoffs/*.md"
statuses = ["open", "active"]
max_age_days = 30
date_field = "date"       # optional, default "date"; falls back to file mtime
```

Complete examples ship in the skill: `examples/workspace/dream.toml` and `examples/single-repo/dream.toml`.

## Checks

| Table | Reports |
|---|---|
| `file_cap` | files over the line and/or byte cap |
| `row_cap` | per file: rows over the cap, of how many; median and maximum row size |
| `index_count` | pages in the folder the index does not link, and index links to missing pages |
| `required_field` | files matching the glob without that frontmatter field (an indented key, such as `type:` under `metadata:`, counts) |
| `superseded` | pointers (`superseded_by:` or the text "SUPERSEDED ... by `path`") whose target file does not exist |
| `stale_label` | files whose `status` is in the list and whose date is older than the limit |

A glob that matches no file is a failing check, because a rule that checks nothing is a broken rule.
