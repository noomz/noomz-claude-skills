# Developer and Plugin Commands

These commands exist for plugin authors and power users working inside Obsidian's Chromium runtime. Most require Obsidian to be running and some require developer mode to be enabled in Obsidian's settings.

## Contents
- [Enabling developer mode](#enabling-developer-mode)
- [`devtools`](#devtools)
- [`plugin:reload`](#pluginreload)
- [`dev:errors`](#deverrors)
- [`dev:screenshot`](#devscreenshot)
- [`dev:css`](#devcss)
- [`dev:dom`](#devdom)
- [`eval`](#eval)
- [Safety notes](#safety-notes)

## Enabling developer mode

Before using any `dev:*` command or `devtools`, verify developer mode is active in Obsidian. It is typically under `Settings → About → Advanced` or enabled automatically when Obsidian is launched with `--debug`. The exact path varies by platform and version — check `obsidian help dev:errors` for the current requirement.

## `devtools`

Opens Chromium DevTools attached to the running Obsidian window.

```bash
obsidian devtools
```

Equivalent to `Ctrl+Shift+I` / `Cmd+Option+I` inside Obsidian. Use when diagnosing plugin crashes, inspecting the DOM, or profiling slow editor operations.

## `plugin:reload`

Reloads a plugin without restarting Obsidian. Essential during plugin development — saves 2–5 seconds per iteration.

```bash
obsidian plugin:reload my-plugin-id
```

The argument is the plugin's **id** (as declared in `manifest.json`), not its display name. List installed plugins:

```bash
obsidian eval "app.plugins.plugins && Object.keys(app.plugins.plugins)"
```

Wire the reload into your plugin's build script so every `npm run build` hot-reloads:

```json
{
  "scripts": {
    "dev": "esbuild --watch --define:process.env.NODE_ENV='\"development\"' && obsidian plugin:reload my-plugin-id"
  }
}
```

## `dev:errors`

Prints the running app's JavaScript error log. Use when a plugin "just doesn't work" but logs nothing visible.

```bash
obsidian dev:errors
obsidian dev:errors | tail -20
```

Pipe into a watch loop during development:

```bash
watch -n 2 'obsidian dev:errors | tail -5'
```

## `dev:screenshot`

Captures a screenshot of the Obsidian window.

```bash
obsidian dev:screenshot file=obsidian.png
obsidian dev:screenshot file=vault-state.png
```

Useful for automated visual regression in plugin CI and for reproducing bug reports. Combine with `eval` to set the app into a known state before capturing.

## `dev:css`

Inspects computed CSS for elements matching a selector.

```bash
obsidian dev:css selector=".cm-line"
obsidian dev:css selector=".nav-file-title.is-active"
```

Use to debug theme or snippet issues without opening DevTools.

## `dev:dom`

Queries the DOM, returning matched elements' markup.

```bash
obsidian dev:dom selector=".workspace-leaf.mod-active"
obsidian dev:dom selector="[data-type=file-explorer]"
```

Pair with `dev:css` to fully reason about a rendered element.

## `eval`

Executes arbitrary JavaScript in the Obsidian main thread. Every Obsidian Plugin API is reachable via `app`, `this.app`, or `window.app`.

```bash
obsidian eval "app.vault.getName()"
obsidian eval "app.workspace.activeLeaf.view.file.path"
obsidian eval "app.commands.executeCommandById('editor:toggle-bold')"
```

Useful recipes:

```bash
# count notes in the vault
obsidian eval "app.vault.getMarkdownFiles().length"

# list pinned files
obsidian eval "app.workspace.getLeavesOfType('markdown').filter(l => l.pinned).map(l => l.view.file.path)"

# force a metadata cache refresh
obsidian eval "app.metadataCache.trigger('resolve', app.vault.getAbstractFileByPath('Inbox.md'))"
```

### Return values

`eval` returns the result of the last expression. Promises are awaited if the expression is an `await` form:

```bash
obsidian eval "await app.vault.read(app.vault.getAbstractFileByPath('Inbox.md'))"
```

### Multi-statement scripts

For non-trivial scripts, keep them in `.js` files and read them in:

```bash
obsidian eval "$(cat scripts/migrate-tags.js)"
```

## Safety notes

- **`eval` is arbitrary code execution** in the Obsidian process. Never pass untrusted input. Never commit an `eval` call that interpolates a shell variable sourced from the network or a user argument without sanitizing.
- **Plugin reload state** — some plugins leak listeners or timers on reload. If Obsidian starts behaving strangely after many reloads, restart the app.
- **`devtools` and `dev:*` commands require the running Obsidian to be the one you expect** — on a machine with multiple vaults, confirm the active vault with `obsidian eval "app.vault.getName()"` before inspecting.
- **Automated screenshotting** of private notes leaks content to disk; set a predictable output directory and clean up after capture.
