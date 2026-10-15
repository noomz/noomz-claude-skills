import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Gate, Run, Suggestion } from '../types'

import { buttonLabel, commandKey, displayCommand, drawnRows, extractBangCommands, formatRunMessage, keepTail, mergeCommands, outputTail } from './parse'
import type { RunOutput } from './parse'
import { askpassEnv, detached } from './terminal'

// Lines of a running command's output the band shows under it.
const OUTPUT_ROWS = 6
// Characters of the combined output kept to cut those lines from.
const OUTPUT_KEPT_CHARS = 4_000

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
const runs = atom({ plugin: 'bang-actions', key: 'runs' } as const, [] as Run[])

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

// The entry's own gate, or two-press when the band as last measured cannot
// show the whole command.
const bandGate = (s: Suggestion): Gate => (s.gate === 'confirm' || drawnRows(s.cmd, band.columns) > band.rows ? 'confirm' : 'run')

// What stops each running command, by command. A module variable: a reload
// kills the children, so `session.start` clears their rows.
const stops = new Map<string, () => void>()
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

// Runs a command as the person's own `! cmd` would, in the session's cwd
// but away from the terminal, with any `sudo` password asked in a desktop
// dialog. While it runs, the band shows the last lines it wrote and a Cancel
// button; when it ends or is cancelled, the output is submitted as this
// plugin's prompt: Claude's next turn starts on it, and the transcript keeps
// it as a row. No time limit: a command that waits on the person (a browser
// login) runs until it ends or they cancel it.
async function run($: EngineInterface, cmd: string) {
  if (stops.has(cmd)) {
    return
  }
  let isStopped = false
  let child: ReturnType<typeof $.process.spawn> | undefined
  stops.set(cmd, () => {
    isStopped = true
    void child?.return({ code: null, signal: null }).catch(() => undefined)
  })
  try {
    await update($, commands, forget(cmd))
    await update($, runs, prev => [...prev.filter(r => r.cmd !== cmd), { cmd, output: '' }])
    $.ui.status(`running: ${buttonLabel(cmd)}`)
    const env = await askpassEnv($, cmd)
    const out: RunOutput = { ending: 'it ran until the person cancelled it', stdout: '', stderr: '', isCut: false }
    let shown = ''
    if (!isStopped) {
      child = $.process.spawn({ argv: detached(['/bin/bash', '-c', cmd]), env })
      try {
        for (;;) {
          const step = await child.next()
          if (step.done) {
            // An exit of its own counts even when Cancel landed just after.
            if (!isStopped || step.value.code !== null) {
              out.ending = step.value.signal !== null ? `killed by ${step.value.signal}` : `exit ${step.value.code}`
            }
            break
          }
          const kept = keepTail(out[step.value.stream], step.value.text)
          out[step.value.stream] = kept.text
          out.isCut ||= kept.isCut
          shown = (shown + step.value.text).slice(-OUTPUT_KEPT_CHARS)
          const output = outputTail(shown, OUTPUT_ROWS)
          await update($, runs, prev => prev.map(r => (r.cmd === cmd ? { cmd, output } : r)))
        }
      } catch (err) {
        if (!isStopped) {
          throw err
        }
      }
    }

    // Cancelled before it started: nothing ran, so there is nothing to tell.
    if (child === undefined) {
      return
    }
    if (out.ending === 'exit 0') {
      await update($, succeeded, prev => [...prev, cmd])
    }
    const sent = await $.prompt.submit({ text: formatRunMessage(cmd, out) }).catch(() => undefined)
    if (!sent || sent.drop !== undefined) {
      $.ui.toast('Ran, but the output did not reach Claude')
    }
  } catch (err) {
    $.ui.toast(`Could not run: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    stops.delete(cmd)
    await update($, runs, prev => prev.filter(r => r.cmd !== cmd)).catch(() => undefined)
    $.ui.status(undefined)
  }
}

// Stops a running command: its child and everything it started get TERM. A
// row with nothing behind it (left from before a reload) just goes.
async function cancel($: EngineInterface, cmd: string) {
  const stop = stops.get(cmd)
  if (stop !== undefined) {
    stop()
  } else {
    await update($, runs, prev => prev.filter(r => r.cmd !== cmd))
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
async function decide($: EngineInterface, cmd: string, drawn: Gate): Promise<boolean> {
  // Never looser than the button the person pressed: the band may be measured
  // anew between that draw and this press.
  const effectiveGate = (s: Suggestion): Gate => (drawn === 'confirm' ? 'confirm' : bandGate(s))
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

// The run goes on after the press returns: a press hook has a budget of
// seconds, and a run may wait on the person for minutes.
async function press($: EngineInterface, cmd: string, drawn: Gate) {
  const decision = deciding.then(() => decide($, cmd, drawn))
  deciding = decision.catch(() => undefined)
  if (await decision) {
    void run($, cmd).catch(() => undefined)
  }
}

export const register: Register = on => {
  // A reload ends the children of the copy before, so their rows go too.
  on('session.start', async ($, e, next) => {
    await update($, runs, () => [])
    return next(e)
  })

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
    const live = await read($, runs)
    if (e.props.hasSurvey || (list.length === 0 && live.length === 0)) {
      return next(e)
    }

    const { Box, Button, Code, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {live.map(r => (
          <Box key={`live-${commandKey(r.cmd)}`} flexDirection="column">
            <Box flexDirection="row" columnGap={1}>
              <Button key={`cancel-${commandKey(r.cmd)}`} label="■ Cancel" onPress={() => cancel($, r.cmd)} />
              <Box flexGrow={1} flexShrink={1}>
                <Code source={displayCommand(r.cmd)} language="bash" />
              </Box>
            </Box>
            <Box key={`output-${commandKey(r.cmd)}`} borderStyle="round" borderDimColor paddingX={1}>
              <Text dimColor={r.output === ''} wrap="truncate-end">{r.output === '' ? 'running…' : r.output}</Text>
            </Box>
          </Box>
        ))}
        {list.map(s => {
          const drawn = bandGate(s)
          return (
            <Box key={`row-${commandKey(s.cmd)}`} flexDirection="row" columnGap={1}>
              <Button key={`run-${commandKey(s.cmd)}`} {...BUTTON[s.isArmed ? 'armed' : drawn]} onPress={() => press($, s.cmd, drawn)} />
              <Box flexGrow={1} flexShrink={1}>
                <Code source={displayCommand(s.cmd)} language="bash" />
              </Box>
            </Box>
          )
        })}
        {list.length > 0 && <Box flexDirection="row" justifyContent="flex-end">
          <Button
            key="dismiss"
            label="Dismiss"
            hotkey="x"
            role="dismiss"
            dimColor
            onPress={() => update($, commands, () => [])}
          />
        </Box>}
      </Box>
    )
  })
}
