# Obsidian CLI — Full Command Reference

Complete reference covering every subcommand the `obsidian` CLI exposes, grouped by purpose. Verified against `obsidian help`. When this reference disagrees with your installed version, trust `obsidian help <command>`.

## Contents
- [Argument syntax and common flags](#argument-syntax-and-common-flags)
- [Vault info](#vault-info)
- [Files and folders](#files-and-folders)
- [Reading and editing content](#reading-and-editing-content)
- [Daily notes](#daily-notes)
- [Tasks](#tasks)
- [Tags](#tags)
- [Properties (YAML frontmatter)](#properties-yaml-frontmatter)
- [Search](#search)
- [Link graph](#link-graph)
- [Templates](#templates)
- [Obsidian commands and hotkeys](#obsidian-commands-and-hotkeys)
- [Workspace, tabs, bookmarks, recents](#workspace-tabs-bookmarks-recents)
- [Plugins](#plugins)
- [Themes and CSS snippets](#themes-and-css-snippets)
- [Bases](#bases)
- [Sync and history](#sync-and-history)
- [Meta](#meta)
- [Developer tools](#developer-tools)

## Argument syntax and common flags

All arguments are `key=value` pairs. Standalone words are boolean flags. Quote values with spaces. Use `\n` and `\t` in `content=` for newlines and tabs.

**File targeting** (most read/edit commands accept these):
- `file=<name>` — resolved by name like a wiki-link
- `path=<folder/note.md>` — exact path relative to vault root
- `active` — force the active-file interpretation
- omitted — default to the active file

**Global flags:**
- `vault=<name>` — target a specific vault when several are open
- `format=<fmt>` — structured output (per-command, not universal)
- `total` — return count instead of list (many commands)

## Vault info

| Command | Purpose |
|---|---|
| `obsidian vault info=path\|name\|files\|folders\|size` | Single-value lookup about the active vault |
| `obsidian vaults [verbose] [total]` | List known vaults; `verbose` includes paths |
| `obsidian version` | Obsidian app version |
| `obsidian reload` | Reload the vault |
| `obsidian restart` | Restart the Obsidian app |

```bash
VAULT=$(obsidian vault info=path)     # use in shell scripts
obsidian vault info=size
```

## Files and folders

| Command | Purpose |
|---|---|
| `obsidian files [folder=P] [ext=md] [total]` | List files, optionally filtered |
| `obsidian folders [folder=P] [total]` | List folders |
| `obsidian folder path=P [info=files\|folders\|size]` | Folder info |
| `obsidian file [file=\|path=]` | Show file info |
| `obsidian create name=N [path=P] [content=T] [template=T] [overwrite] [open] [newtab]` | Create a file |
| `obsidian delete [file=\|path=] [permanent]` | Delete (moves to trash unless `permanent`) |
| `obsidian rename [file=\|path=] name=NEW` | Rename a file |
| `obsidian move [file=\|path=] to=DEST` | Move to folder or path |
| `obsidian open [file=\|path=] [newtab]` | Open a file in the UI |
| `obsidian random [folder=P] [newtab]` | Open a random note |
| `obsidian random:read [folder=P]` | Print a random note's contents |
| `obsidian recents [total]` | Recently opened files |

Note: `files` has **no** `sort=`, `limit=`, `--copy`, or `format=`. To get most-recent files, shell out:

```bash
VAULT=$(obsidian vault info=path)
find "$VAULT" -name '*.md' -not -path '*/.obsidian/*' -type f \
  -exec stat -f '%m %N' {} + | sort -rn | head -10 | cut -d' ' -f2-
```

## Reading and editing content

| Command | Purpose |
|---|---|
| `obsidian read [file=\|path=]` | Print file contents (default: active file) |
| `obsidian append [file=\|path=] content=T [inline]` | Append to any file; `inline` = no leading newline |
| `obsidian prepend [file=\|path=] content=T [inline]` | Prepend to any file |
| `obsidian outline [file=\|path=] [format=tree\|md\|json] [total]` | Show headings |
| `obsidian wordcount [file=\|path=] [words\|characters]` | Count words / chars |

```bash
obsidian read path="Projects/Kadnud.md"
obsidian append file="Inbox" content="- captured at $(date)"
obsidian outline active format=md
```

## Daily notes

Defer to [daily-notes.md](daily-notes.md) for patterns. Command surface:

| Command | Purpose |
|---|---|
| `obsidian daily [paneType=tab\|split\|window]` | Open today's daily note |
| `obsidian daily:append content=T [inline] [open]` | Append to today's note |
| `obsidian daily:prepend content=T [inline] [open]` | Prepend to today's note |
| `obsidian daily:read` | Print today's note contents |
| `obsidian daily:path` | Print today's note absolute path |

## Tasks

| Command | Purpose |
|---|---|
| `obsidian tasks [file=\|path=] [done\|todo] [status="X"] [daily] [active] [verbose] [total] [format=json\|tsv\|csv]` | List tasks |
| `obsidian task ref=PATH:LINE [toggle\|done\|todo] [status="X"]` | Modify a single task |

```bash
obsidian tasks daily todo                          # today's incomplete tasks
obsidian tasks path="Projects/Kadnud.md" format=json
obsidian tasks status="/" format=json              # in-progress
obsidian task ref="Projects/Kadnud.md:42" done
```

## Tags

| Command | Purpose |
|---|---|
| `obsidian tags [file=\|active] [counts] [sort=count] [total] [format=json\|tsv\|csv]` | List tags |
| `obsidian tag name=T [total] [verbose]` | Single-tag lookup; `verbose` lists files |

Default format is **tsv**. Use `format=json` for pipelines:

```bash
obsidian tags counts format=json \
  | jq -r '.[] | "\(.count)\t\(.name)"' | sort -rn | head
obsidian tag name="urgent" verbose
```

## Properties (YAML frontmatter)

| Command | Purpose |
|---|---|
| `obsidian properties [file=\|active] [name=N] [counts] [sort=count] [total] [format=yaml\|json\|tsv]` | List properties |
| `obsidian property:read name=N [file=\|path=]` | Read a single property value |
| `obsidian property:set name=N value=V [type=text\|list\|number\|checkbox\|date\|datetime] [file=\|path=]` | Set a property |
| `obsidian property:remove name=N [file=\|path=]` | Remove a property |

```bash
obsidian property:set name=status value=done file="Projects/Kadnud"
obsidian property:set name=tags value="urgent,backend" type=list file="Inbox"
obsidian properties active
```

## Search

| Command | Purpose |
|---|---|
| `obsidian search query=Q [path=F] [limit=N] [case] [total] [format=text\|json]` | Full-text search |
| `obsidian search:context query=Q [path=F] [limit=N] [case] [format=text\|json]` | Search with surrounding line context |
| `obsidian search:open [query=Q]` | Open search view in the UI |

`search` default format is **text**. `format=json` returns an array of match objects.

```bash
obsidian search query="incident response" format=json limit=5
obsidian search query="tag:#retro path:Meetings" format=json
obsidian search:context query="TODO" format=json
```

## Link graph

| Command | Purpose |
|---|---|
| `obsidian links [file=\|path=] [total]` | Outgoing links from a file |
| `obsidian backlinks [file=\|path=] [counts] [total] [format=json\|tsv\|csv]` | Incoming links to a file |
| `obsidian unresolved [counts] [verbose] [total] [format=json\|tsv\|csv]` | Dangling wiki-links vault-wide |
| `obsidian orphans [all] [total]` | Files with no incoming links |
| `obsidian deadends [all] [total]` | Files with no outgoing links |

```bash
obsidian backlinks file="Kadnud" counts format=json
obsidian unresolved verbose format=json
obsidian orphans total
```

## Templates

| Command | Purpose |
|---|---|
| `obsidian templates [total]` | List available templates |
| `obsidian template:read name=T [resolve] [title=T]` | Read a template (`resolve` expands variables) |
| `obsidian template:insert name=T` | Insert a template into the active file |

## Obsidian commands and hotkeys

**Power feature**: `command` executes any entry from Obsidian's command palette, scripting anything the UI can do.

| Command | Purpose |
|---|---|
| `obsidian commands [filter=PREFIX]` | List command IDs |
| `obsidian command id=ID` | Execute a command by ID |
| `obsidian hotkeys [verbose] [all] [total] [format=json\|tsv\|csv]` | List hotkeys |
| `obsidian hotkey id=ID [verbose]` | Show hotkey for a command |

```bash
obsidian commands filter=editor:
obsidian command id=editor:toggle-bold
obsidian command id=workspace:close-others
obsidian command id=app:reload
```

## Workspace, tabs, bookmarks, recents

| Command | Purpose |
|---|---|
| `obsidian workspace [ids]` | Show workspace tree |
| `obsidian tabs [ids]` | List open tabs |
| `obsidian tab:open [group=ID] [file=P] [view=T]` | Open a new tab |
| `obsidian bookmarks [verbose] [total] [format=json\|tsv\|csv]` | List bookmarks |
| `obsidian bookmark [file=\|subpath=\|folder=\|search=\|url=] [title=T]` | Add a bookmark |

## Plugins

| Command | Purpose |
|---|---|
| `obsidian plugins [filter=core\|community] [versions] [format=json\|tsv\|csv]` | List installed plugins |
| `obsidian plugins:enabled [filter=core\|community] [versions] [format=json\|tsv\|csv]` | Enabled plugins |
| `obsidian plugin id=P` | Plugin info |
| `obsidian plugin:enable id=P [filter=core\|community]` | Enable |
| `obsidian plugin:disable id=P [filter=core\|community]` | Disable |
| `obsidian plugin:install id=P [enable]` | Install community plugin |
| `obsidian plugin:uninstall id=P` | Uninstall |
| `obsidian plugin:reload id=P` | Reload (for developers) |
| `obsidian plugins:restrict [on\|off]` | Toggle restricted mode |

See [developer.md](developer.md) for plugin dev workflows.

## Themes and CSS snippets

| Command | Purpose |
|---|---|
| `obsidian themes [versions]` | List installed themes |
| `obsidian theme [name=N]` | Active theme (or details of `name=`) |
| `obsidian theme:set name=N` | Activate a theme; empty name = default |
| `obsidian theme:install name=N [enable]` | Install a community theme |
| `obsidian theme:uninstall name=N` | Uninstall |
| `obsidian snippets` | List installed CSS snippets |
| `obsidian snippets:enabled` | List enabled snippets |
| `obsidian snippet:enable name=N` | Enable a snippet |
| `obsidian snippet:disable name=N` | Disable |

## Bases

Bases are Obsidian's database-like views. Treat each base file as a structured dataset with named views.

| Command | Purpose |
|---|---|
| `obsidian bases` | List all base files |
| `obsidian base:views [file=\|path=]` | List views in a base |
| `obsidian base:query [file=\|path=] [view=V] [format=json\|csv\|tsv\|md\|paths]` | Query a view |
| `obsidian base:create [file=\|path=] [view=V] name=N [content=T] [open] [newtab]` | Create an item in a base |

```bash
obsidian bases
obsidian base:query file="Projects.base" view="Active" format=json
```

## Sync and history

| Command | Purpose |
|---|---|
| `obsidian sync [on\|off]` | Pause / resume Obsidian Sync |
| `obsidian sync:status` | Show sync status |
| `obsidian sync:history [file=\|path=] [total]` | Version history for a file |
| `obsidian sync:read [file=\|path=] version=N` | Read a historical version |
| `obsidian sync:restore [file=\|path=] version=N` | Restore a historical version |
| `obsidian sync:open [file=\|path=]` | Open sync history UI |
| `obsidian sync:deleted [total]` | Deleted files in sync |
| `obsidian history [file=\|path=]` | Local file history versions |
| `obsidian history:list` | Files with local history |
| `obsidian history:open [file=\|path=]` | Open file-recovery UI |
| `obsidian history:read [file=\|path=] [version=N]` | Read a local history version (default version 1) |
| `obsidian history:restore [file=\|path=] version=N` | Restore a local version |
| `obsidian diff [file=\|path=] from=N to=N [filter=local\|sync]` | Diff two version numbers |

Note: `diff` uses **integer version numbers**, not dates. Use `history` or `sync:history` to list available numbers first.

## Meta

| Command | Purpose |
|---|---|
| `obsidian help [command]` | Authoritative reference for the installed version |
| `obsidian version` | App version |
| `obsidian reload` | Reload vault |
| `obsidian restart` | Restart the app |

Always run `obsidian help <command>` when the behavior on your machine differs from this reference.

## Developer tools

Covered in [developer.md](developer.md). Surface:

- `obsidian eval code=<js>` — run JavaScript in the Obsidian process
- `obsidian devtools` — toggle Chromium DevTools
- `obsidian dev:dom`, `dev:css`, `dev:console`, `dev:errors`, `dev:screenshot` — inspection
- `obsidian dev:cdp`, `dev:debug`, `dev:mobile` — advanced
