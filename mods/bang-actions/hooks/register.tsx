import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Gate, Suggestion } from '../types'

import { buttonLabel, commandKey, displayCommand, extractBangCommands, formatRunMessage, mergeCommands } from './parse'

const TIMEOUT_MS = 5 * 60 * 1000

// A command button ignores a press this soon after the previous one, accepted
// or ignored. After a press the focus ring stays in the band, so a double
// Enter, a key repeat or a double click would run the next command, or an
// armed one; a held key repeats faster than this, so none of its presses get
// through.
const DEBOUNCE_MS = 500

// Commands a hook denied on the model's own call, kept for the session: a
// query, which this plugin's checks are, runs no PreToolUse hook, so it
// cannot find that denial again.
const MAX_DENIED = 50

const commands = atom({ plugin: 'bang-actions', key: 'commands' } as const, [])
const armed = atom({ plugin: 'bang-actions', key: 'armed' } as const, null as string | null)
const succeeded = atom({ plugin: 'bang-actions', key: 'succeeded' } as const, [] as string[])
const denied = atom({ plugin: 'bang-actions', key: 'denied' } as const, [] as string[])

// The button beside a command: by its gate, and for the one `confirm`
// command the person armed. No hotkeys: while the band holds the focus every
// letter goes to it, so a hotkey would let typing run commands.
const BUTTON = {
  run: { label: '▶ Run' },
  confirm: { label: '⚠ Run (press twice)' },
  armed: { label: '▶ Press again to run', variant: 'primary' },
} as const
const buttonFor = (s: Suggestion, armedCmd: string | null) => BUTTON[s.cmd === armedCmd ? 'armed' : s.gate]

const running = new Set<string>()
let lastPressAt = Number.NEGATIVE_INFINITY
// Presses are decided one at a time, so a burst of them reads the time the
// first one wrote.
let deciding: Promise<unknown> = Promise.resolve()

const forget = (cmd: string) => (prev: Suggestion[]) => prev.filter(c => c.cmd !== cmd)
const add = (found: Suggestion[]) => (prev: Suggestion[]) => mergeCommands(prev, found)
// A press-time denial tightens the command only while it is listed: one that
// Dismiss or a typed prompt cleared during the check stays gone.
const tighten = (cmd: string) => (prev: Suggestion[]) => (prev.some(c => c.cmd === cmd) ? mergeCommands(prev, [{ cmd, gate: 'confirm' }]) : prev)
const disarm = ($: EngineInterface) => update($, armed, () => null)

// Every write to the list goes through here, so `armed` only ever names a
// listed command: one that leaves the list and comes back is not born armed.
async function setList($: EngineInterface, f: (prev: Suggestion[]) => Suggestion[]): Promise<Suggestion[]> {
  const next = await update($, commands, f)
  await update($, armed, a => (a !== null && !next.some(c => c.cmd === a) ? null : a))

  return next
}

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
    await setList($, forget(cmd))
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
// DEBOUNCE_MS of the previous one does nothing. A `run` command is gated
// again first, since the rules may have changed since the band listed it,
// and runs only if its row is still listed as `run` after that; a `confirm`
// one runs on its second press in a row.
async function decide($: EngineInterface, cmd: string): Promise<boolean> {
  const now = await $.clock.now()
  const isRepeat = now - lastPressAt < DEBOUNCE_MS
  lastPressAt = now
  if (isRepeat) {
    return false
  }

  const entry = (await read($, commands)).find(c => c.cmd === cmd)
  const wasArmed = (await read($, armed)) === cmd
  await disarm($)
  if (entry === undefined) {
    return false
  }
  if (entry.gate === 'confirm') {
    if (!wasArmed) {
      await update($, armed, () => cmd)
    }
    return wasArmed
  }

  if ((await gateOf($, cmd)) === 'confirm') {
    const listed = (await setList($, tighten(cmd))).some(c => c.cmd === cmd)
    if (listed) {
      $.ui.toast('Your permission rules did not allow this command: press twice to run it')
    }
    return false
  }

  // Through `update`: a plain `read` in this dispatch answers from before the
  // check, so a row Dismiss cleared meanwhile would still run.
  return (await update($, commands, prev => prev)).some(c => c.cmd === cmd && c.gate === 'run')
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
      if (fresh.length > 0) {
        await setList($, add(fresh))
      }
      await disarm($)
    }

    return next(e)
  })

  // The model's Bash calls the permission check denied: listed as two-press,
  // and two-press whenever an answer suggests them later. A query (no
  // tool_use_id), such as this plugin's own checks, is not a call.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    const input = e.input as { command?: unknown }
    if (r.decision === 'deny' && e.tool_use_id && typeof input.command === 'string') {
      const cmd = input.command.trim()
      await update($, denied, prev => (prev.includes(cmd) ? prev : [...prev, cmd].slice(-MAX_DENIED)))
      await setList($, add([{ cmd, gate: 'confirm' }]))
    }

    return r
  })

  // A typed prompt: sending one listed command drops that one (with or
  // without its `!`), anything else makes the list stale. Notifications,
  // peers and plugins' prompts, this plugin's runs included, leave it alone.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer') {
      const sent = e.text.trim().replace(/^!\s*/, '')
      const isListed = (await read($, commands)).some(c => c.cmd === sent)
      await setList($, prev => (isListed ? forget(sent)(prev) : []))
      await disarm($)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, commands)
    const armedCmd = await read($, armed)
    if (e.props.hasSurvey || list.length === 0) {
      return next(e)
    }

    const { Box, Button, Code } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {list.map(s => (
          <Box key={`row-${commandKey(s.cmd)}`} flexDirection="row" columnGap={1}>
            <Button key={`run-${commandKey(s.cmd)}`} {...buttonFor(s, armedCmd)} onPress={() => press($, s.cmd)} />
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
            onPress={() => setList($, () => [])}
          />
        </Box>
      </Box>
    )
  })
}
