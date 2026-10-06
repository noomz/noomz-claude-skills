import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Gate, Suggestion } from '../types'

import { buttonLabel, commandKey, displayCommand, drawnRows, extractBangCommands, formatRunMessage, mergeCommands } from './parse'

const TIMEOUT_MS = 5 * 60 * 1000

// A command button ignores a press this soon after the previous one started
// or finished, accepted or ignored. After a press the focus ring stays in the
// band, so a double Enter, a key repeat or a double click would run the next
// command, or an armed one; a held key repeats faster than this, so none of
// its presses get through, and one queued behind a slow permission check
// lands inside the window too.
const DEBOUNCE_MS = 500

// Commands a hook denied on the model's own call, kept for the session: a
// query, which this plugin's checks are, runs no PreToolUse hook, so it
// cannot find that denial again.
const MAX_DENIED = 200

// Tallest command a one-press button stands beside, in drawn rows. A taller
// one can scroll out of the band, so it runs on two presses: one press would
// run steps the person never saw.
const MAX_SHOWN_LINES = 8

const commands = atom({ plugin: 'bang-actions', key: 'commands' } as const, [])
const succeeded = atom({ plugin: 'bang-actions', key: 'succeeded' } as const, [] as string[])
const denied = atom({ plugin: 'bang-actions', key: 'denied' } as const, [] as string[])

// The button beside a command: by its gate, and for the one two-press
// command the person armed. No hotkeys: while the band holds the focus every
// letter goes to it, so a hotkey would let typing run commands.
const BUTTON = {
  run: { label: '▶ Run' },
  confirm: { label: '⚠ Run (press twice)' },
  armed: { label: '▶ Press again to run', variant: 'primary' },
} as const

// Cells a row spends before its code: the widest label as the terminal draws
// it, `[ label ]`, one more in case the terminal draws the glyph two cells
// wide, and the gap.
const BUTTON_COLUMNS = Math.max(...Object.values(BUTTON).map(b => b.label.length)) + 6

// The band as last drawn: the cells a command gets beside its button, and the
// rows one may take and still show whole. A press always follows a render,
// so the value a reload starts from only has to err toward two-press.
let band = { columns: 50, rows: MAX_SHOWN_LINES }

// The gate a press honours: the entry's own, or two-press when the band as
// drawn cannot show the whole command.
const effectiveGate = (s: Suggestion): Gate => (s.gate === 'confirm' || drawnRows(s.cmd, band.columns) > band.rows ? 'confirm' : 'run')
const buttonFor = (s: Suggestion) => BUTTON[s.isArmed ? 'armed' : effectiveGate(s)]

const running = new Set<string>()
let lastPressAt = Number.NEGATIVE_INFINITY
// Presses are decided one at a time, so a burst of them reads the time the
// first one wrote.
let deciding: Promise<unknown> = Promise.resolve()

const unarmed = (s: Suggestion): Suggestion => (s.isArmed ? { cmd: s.cmd, gate: s.gate } : s)
const forget = (cmd: string) => (prev: Suggestion[]) => prev.filter(c => c.cmd !== cmd)
const add = (found: Suggestion[]) => (prev: Suggestion[]) => mergeCommands(prev, found)
// A press-time denial tightens the command only while it is listed: one that
// Dismiss or a typed prompt cleared during the check stays gone.
const tighten = (cmd: string) => (prev: Suggestion[]) => (prev.some(c => c.cmd === cmd) ? mergeCommands(prev, [{ cmd, gate: 'confirm' }]) : prev)
const disarm = ($: EngineInterface) => update($, commands, prev => prev.map(unarmed))

// The gate a suggestion gets: two-press when a hook denied the command on the
// model's call this session, when the session's Bash permission rules deny
// it, or when the check itself fails.
async function gateOf($: EngineInterface, cmd: string): Promise<Gate> {
  if ((await read($, denied)).includes(cmd)) {
    return 'confirm'
  }

  return $.tool.check({ tool: 'Bash', input: { command: cmd } }).then(r => (r.decision === 'deny' ? 'confirm' : 'run'), () => 'confirm')
}

// Runs a command as the person's own `! cmd` would, in the session's cwd,
// then submits the output as this plugin's prompt: Claude's next turn starts
// on it, and the transcript keeps it as a row.
async function run($: EngineInterface, cmd: string) {
  if (running.has(cmd)) {
    return
  }
  running.add(cmd)
  try {
    $.ui.status(`running: ${buttonLabel(cmd)}`)
    const r = await $.process.run(['/bin/bash', '-c', cmd], { stdin: '', timeoutMs: TIMEOUT_MS })
    await update($, commands, forget(cmd))
    if (r.exitCode === 0) {
      await update($, succeeded, prev => [...prev, cmd])
    }

    const sent = await $.prompt.submit({ text: formatRunMessage(cmd, r) }).catch(() => undefined)
    if (!sent || sent.drop !== undefined) {
      $.ui.toast('Ran, but the output did not reach Claude')
    }
  } catch (err) {
    $.ui.toast(`Could not run: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    running.delete(cmd)
    $.ui.status(undefined)
  }
}

// Whether a press on a command's button runs it now. A press within
// DEBOUNCE_MS of the previous one, started or finished, does nothing. A
// two-press command arms on its first press and runs on the next, both read
// and written in one write of the list, so a row that Dismiss, a typed
// prompt or a new answer cleared meanwhile neither arms nor runs. A one-press
// command is gated again first, since the rules may have changed since the
// band listed it, and runs only if its row is still listed as one-press after
// that. Every read of the list goes through `update`: a plain `read` in this
// dispatch answers from before the clock, so a row cleared since would count.
async function decide($: EngineInterface, cmd: string): Promise<boolean> {
  const now = await $.clock.now()
  const isRepeat = now - lastPressAt < DEBOUNCE_MS
  lastPressAt = now
  if (isRepeat) {
    return false
  }

  try {
    const entry = (await update($, commands, prev => prev)).find(c => c.cmd === cmd)
    if (entry !== undefined && effectiveGate(entry) === 'confirm') {
      let wasArmed = false
      await update($, commands, prev => prev.map(c => {
        if (c.cmd !== cmd || effectiveGate(c) !== 'confirm') {
          return unarmed(c)
        }
        wasArmed = c.isArmed === true
        return wasArmed ? unarmed(c) : { ...c, isArmed: true }
      }))
      return wasArmed
    }

    await disarm($)
    if (entry === undefined) {
      return false
    }
    if ((await gateOf($, cmd)) === 'confirm') {
      const listed = (await update($, commands, tighten(cmd))).some(c => c.cmd === cmd)
      if (listed) {
        $.ui.toast('Your permission rules did not allow this command: press twice to run it')
      }
      return false
    }

    return (await update($, commands, prev => prev)).some(c => c.cmd === cmd && effectiveGate(c) === 'run')
  } finally {
    // The next queued press starts after this one returns, however long the
    // check took, so the window counts from here too.
    lastPressAt = await $.clock.now()
  }
}

async function press($: EngineInterface, cmd: string) {
  const decision = deciding.then(() => decide($, cmd))
  deciding = decision.catch(() => undefined)
  if (await decision) {
    await run($, cmd)
  }
}

export const register: Register = on => {
  // Each suggestion is listed with the rules' verdict on it, so a denied one
  // draws the two-press button from the start. A command that ran with exit 0
  // since the last answer is not listed: Claude's reply to a run usually
  // quotes the command again.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.reason === 'answer') {
      const found = await Promise.all(extractBangCommands(e.answer)
        .map(async (cmd): Promise<Suggestion> => ({ cmd, gate: await gateOf($, cmd) })))
      // Taken after the checks, through `update`: a plain `read` in this
      // dispatch answers from before them, so a run that exited 0 while they
      // were pending would be lost.
      let ran: string[] = []
      await update($, succeeded, prev => { ran = prev; return [] })
      const fresh = found.filter(s => !ran.includes(s.cmd))
      await update($, commands, prev => add(fresh)(prev).map(unarmed))
    }

    return next(e)
  })

  // The model's Bash calls the permission check denied: listed as two-press,
  // and two-press whenever an answer suggests them later. A query (no
  // tool_use_id), such as this plugin's own checks, is not a call. A repeat
  // denial counts as the newest, so one the hook keeps giving is never the
  // oldest when the cap drops one.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    const input = e.input as { command?: unknown }
    if (r.decision === 'deny' && e.tool_use_id && typeof input.command === 'string') {
      const cmd = input.command.trim()
      await update($, denied, prev => [...prev.filter(c => c !== cmd), cmd].slice(-MAX_DENIED))
      await update($, commands, add([{ cmd, gate: 'confirm' }]))
    }

    return r
  })

  // A typed prompt: sending one listed command drops that one (with or
  // without its `!`), anything else makes the list stale. Notifications,
  // peers and plugins' prompts, this plugin's runs included, leave it alone.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer') {
      const sent = e.text.trim().replace(/^!\s*/, '')
      await update($, commands, prev => (prev.some(c => c.cmd === sent) ? forget(sent)(prev) : []).map(unarmed))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The band scrolls a tree taller than `maxRows` in a window one row
    // shorter (the `n more` row), so a command drawn over more rows than that
    // is never wholly on screen, however far the person scrolls.
    band = { columns: e.props.bodyColumns - BUTTON_COLUMNS, rows: Math.min(MAX_SHOWN_LINES, e.props.maxRows - 1) }
    const list = await read($, commands)
    if (e.props.hasSurvey || list.length === 0) {
      return next(e)
    }

    const { Box, Button, Code } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {list.map(s => (
          <Box key={`row-${commandKey(s.cmd)}`} flexDirection="row" columnGap={1}>
            <Button key={`run-${commandKey(s.cmd)}`} {...buttonFor(s)} onPress={() => press($, s.cmd)} />
            <Box flexGrow={1} flexShrink={1}>
              <Code source={displayCommand(s.cmd)} language="bash" />
            </Box>
          </Box>
        ))}
        <Box flexDirection="row" justifyContent="flex-end">
          <Button
            key="dismiss"
            label="Dismiss"
            hotkey="x"
            role="dismiss"
            dimColor
            onPress={() => update($, commands, () => [])}
          />
        </Box>
      </Box>
    )
  })
}
