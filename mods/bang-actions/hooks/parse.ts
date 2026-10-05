export const MAX_COMMANDS = 5

// Longest command a Run button takes: past it the label wraps out of view, so
// the command goes to review (fill only) instead.
export const MAX_RUN_CHARS = 200

const FENCE = /^[ \t]*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm
const BANG_LINE = /^[ \t]*![ \t]+(\S.*)$/
const INLINE = /`![ \t]+([^`\n]+)`/g

// A command written to explain the syntax, not to be run: `! cmd`,
// `! <command>`, `! ...`.
const PLACEHOLDER = /^(cmd|command|your[-_ ]command)$|<[a-z][\w -]*>|\.\.\.|…/i

// Characters that let a label read differently from what bash runs: controls
// (tab aside), bidi and zero-width format characters, and spaces bash does not
// split on.
const DECEPTIVE = /[\u0000-\u0008\u000A-\u001F\u007F-\u009F\p{Cf}\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/u

const ANSI = /\u001B\[[0-?]*[ -/]*[@-~]|\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)|\u001B[@-_]/g
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g

// Commands the reply asks the person to run with the `!` prefix, in order of
// appearance: `! cmd` inline code, and fenced blocks made only of `! cmd`
// lines (blank and `#` lines aside), so a script's `! grep -q` negation or a
// `\`-continued command never becomes a half command.
export function extractBangCommands(text: string): string[] {
  const hits: { at: number; cmd: string }[] = []

  for (const fence of text.matchAll(FENCE)) {
    const lines = (fence[2] ?? '').split('\n').filter(l => l.trim() !== '' && !l.trim().startsWith('#'))
    const cmds = lines.map(l => BANG_LINE.exec(l)?.[1])
    if (cmds.length > 0 && cmds.every(c => c !== undefined && !c.trimEnd().endsWith('\\'))) {
      cmds.forEach((cmd, i) => hits.push({ at: fence.index + i, cmd: cmd ?? '' }))
    }
  }

  const prose = text.replace(FENCE, m => ' '.repeat(m.length))
  for (const inline of prose.matchAll(INLINE)) {
    hits.push({ at: inline.index, cmd: inline[1] ?? '' })
  }

  hits.sort((a, b) => a.at - b.at)

  return mergeCommands([], hits.map(h => h.cmd))
}

// Adds a batch after the current list: the batch's first MAX_COMMANDS, then
// the oldest current entries dropped to stay within MAX_COMMANDS. Placeholders
// and commands carrying deceptive characters never enter.
export function mergeCommands(current: string[], incoming: string[]): string[] {
  const merged = [...current]
  let added = 0
  for (const raw of incoming) {
    const cmd = raw.trim()
    if (added < MAX_COMMANDS && cmd && !PLACEHOLDER.test(cmd) && !DECEPTIVE.test(cmd) && !merged.includes(cmd)) {
      merged.push(cmd)
      added += 1
    }
  }

  return merged.slice(-MAX_COMMANDS)
}

// Whole command on one line, never cut: a button that runs on press must show
// everything it will run.
export function buttonLabel(cmd: string): string {
  return cmd.replace(/\s+/g, ' ').trim()
}

// A key that names the command, not its position, so a press always reaches
// the command whose label the person read, however the list shifts.
export function commandKey(cmd: string): string {
  let h = 5381
  for (let i = 0; i < cmd.length; i++) {
    h = ((h << 5) + h + cmd.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

// The last lines of output as the band can draw them: no ANSI escapes, a `\r`
// progress line shown as its final redraw, no other control characters, each
// line capped.
export function outputTail(output: string, lines = 5, width = 200): string {
  return output
    .replace(ANSI, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => (l.split('\r').pop() ?? '').replace(CONTROL, ''))
    .map(l => (l.length > width ? `${l.slice(0, width - 1)}…` : l))
    .join('\n')
    .trimEnd()
    .split('\n')
    .slice(-lines)
    .join('\n')
}
