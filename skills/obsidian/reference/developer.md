# Developer and Plugin Commands

Commands for plugin authors, theme authors, and anyone scripting Obsidian's internals. All require Obsidian to be running. `devtools`, `dev:cdp`, and `dev:debug` require Obsidian's developer mode to be enabled.

## Contents
- [Enabling developer mode](#enabling-developer-mode)
- [command / commands](#command--commands)
- [eval](#eval)
- [devtools](#devtools)
- [plugin:reload (and the plugin family)](#pluginreload-and-the-plugin-family)
- [dev:dom](#devdom)
- [dev:css](#devcss)
- [dev:console](#devconsole)
- [dev:errors](#deverrors)
- [dev:screenshot](#devscreenshot)
- [dev:cdp and dev:debug](#devcdp-and-devdebug)
- [dev:mobile](#devmobile)
- [Safety notes](#safety-notes)

## Enabling developer mode

`devtools`, `dev:cdp`, and `dev:debug` need developer mode on. Toggle it under `Settings → About → Advanced` (exact path varies by version), or launch Obsidian with `--debug`. Check availability with `obsidian help devtools`.

## command / commands

`obsidian command` is the single most powerful automation primitive — it runs **any** entry from Obsidian's command palette, so every UI action is scriptable.

```bash
obsidian commands                          # list every command ID
obsidian commands filter=editor:           # only editor commands
obsidian command id=editor:toggle-bold     # execute a command
obsidian command id=workspace:close-others
obsidian command id=app:reload
```

Discover plugin-provided commands by filtering on the plugin's prefix:

```bash
obsidian commands filter=dataview:
obsidian commands filter=templater-obsidian:
```

## eval

Executes arbitrary JavaScript in the Obsidian main thread. The `code=` argument is required.

```bash
obsidian eval code="app.vault.getName()"
obsidian eval code="app.workspace.activeLeaf.view.file.path"
obsidian eval code="app.vault.getMarkdownFiles().length"
```

Handy recipes:

```bash
# list enabled plugin IDs
obsidian eval code="Object.keys(app.plugins.plugins)"

# list pinned file paths
obsidian eval code="app.workspace.getLeavesOfType('markdown').filter(l => l.pinned).map(l => l.view.file.path)"

# force metadata cache refresh for a file
obsidian eval code="app.metadataCache.trigger('resolve', app.vault.getAbstractFileByPath('Inbox.md'))"
```

### Return values

`eval` returns the value of the last expression. `await` is supported at the top level:

```bash
obsidian eval code="await app.vault.read(app.vault.getAbstractFileByPath('Inbox.md'))"
```

### Multi-statement scripts

For non-trivial scripts, keep them in `.js` files and read them into `code=`:

```bash
obsidian eval code="$(cat scripts/migrate-tags.js)"
```

### eval vs command

If a command palette entry already exists, prefer `obsidian command id=X` — it's safer, self-documenting, and does not require knowing internal API. Reach for `eval` only when no command exists.

## devtools

Toggles Chromium DevTools attached to the running Obsidian window — equivalent to `Ctrl+Shift+I` / `Cmd+Option+I`.

```bash
obsidian devtools
```

Useful for debugging theme CSS, inspecting the DOM, profiling slow editor operations.

## plugin:reload (and the plugin family)

Reload a plugin without restarting Obsidian — essential during development.

```bash
obsidian plugin:reload id=my-plugin-id
```

The argument is the plugin's `id` from its `manifest.json`, not its display name. List installed IDs:

```bash
obsidian plugins filter=community format=json | jq -r '.[].id'
```

Wire reload into your build script:

```json
{
  "scripts": {
    "dev": "esbuild --watch src/main.ts --bundle --outfile=dist/main.js --external:obsidian --platform=node",
    "reload": "obsidian plugin:reload id=my-plugin-id"
  }
}
```

Related family:
- `plugin:enable id=X`, `plugin:disable id=X`
- `plugin:install id=X [enable]`, `plugin:uninstall id=X`
- `plugins:restrict on|off` — toggle Obsidian's restricted mode
- `plugin id=X` — inspect a plugin

## dev:dom

Query the DOM. Returns first match by default; `all` returns every match.

```bash
obsidian dev:dom selector=".workspace-leaf.mod-active"
obsidian dev:dom selector="[data-type=file-explorer]"
obsidian dev:dom selector=".cm-line" all total
obsidian dev:dom selector=".nav-file-title" text            # text content only
obsidian dev:dom selector=".nav-file" attr=data-path         # attribute values
obsidian dev:dom selector=".cm-editor" css=font-family       # computed CSS property
obsidian dev:dom selector=".some-class" inner                # innerHTML vs outerHTML
```

## dev:css

Inspect computed CSS for a selector, with source-file locations for each rule.

```bash
obsidian dev:css selector=".cm-line"
obsidian dev:css selector=".nav-file-title.is-active" prop=color
```

## dev:console

Show captured browser-console messages from the running app.

```bash
obsidian dev:console                    # last 50 messages
obsidian dev:console limit=200
obsidian dev:console level=error
obsidian dev:console clear              # reset the buffer
```

## dev:errors

Captured JavaScript errors. Use when a plugin "just doesn't work" silently.

```bash
obsidian dev:errors
obsidian dev:errors | tail -20
obsidian dev:errors clear
```

Tail during development:

```bash
watch -n 2 'obsidian dev:errors | tail -5'
```

## dev:screenshot

Capture a PNG of the Obsidian window.

```bash
obsidian dev:screenshot path=obsidian.png
obsidian dev:screenshot path=/tmp/vault-state.png
```

Note: the argument is `path=`, not `file=`. Combine with `command` / `eval` to snapshot the app in a known state.

## dev:cdp and dev:debug

Raw Chrome DevTools Protocol access — niche, useful for automating complex interactions.

```bash
obsidian dev:debug on                                 # attach debugger
obsidian dev:cdp method=Page.navigate params='{"url":"app://obsidian.md/"}'
obsidian dev:debug off
```

`params=` takes a JSON string. Refer to the CDP spec for available methods.

## dev:mobile

Toggle mobile emulation (phone viewport / touch events) for testing responsive plugins and themes.

```bash
obsidian dev:mobile on
# ... test ...
obsidian dev:mobile off
```

## Safety notes

- **`eval` is arbitrary code execution** in the Obsidian process. Never interpolate untrusted input into `code=`.
- **`command id=X`** will run any palette command, including destructive ones (`app:reload`, `app:quit`, `workspace:close-others`, `editor:delete-file`). Confirm before invoking on the user's behalf.
- **Plugin reload state** — some plugins leak listeners or timers on reload. If the app misbehaves after many reloads, use `obsidian restart`.
- **Multi-vault machines** — before `dev:*` or `eval`, confirm the active vault with `obsidian vault info=name`.
- **Screenshots of private notes** — set a predictable path and clean up after capture; don't leave vault content on disk or in CI artifacts.
