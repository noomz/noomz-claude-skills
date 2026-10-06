import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Gate, Suggestion } from '../types'

import {
  buttonLabel, commandKey, displayCommand, extractBangCommands, formatRunMessage, mergeCommands, outputTail, parseRunMessage,
} from './parse'

const TIMEOUT_MS = 5 * 60 * 1000

const commands = atom({ plugin: 'bang-actions', key: 'commands' } as const, [])
const armed = atom({ plugin: 'bang-actions', key: 'armed' } as const, null as string | null)

// The button beside a command: by its gate, and for the one `confirm`
// command the person armed. No hotkeys: while the band holds the focus every
// letter goes to it, so a hotkey would let typing run commands.
const BUTTON = {
  run: { label: '▶ Run' },
  confirm: { label: '⚠ Run (denied, press twice)' },
  armed: { label: '▶ Press again to run', variant: 'primary' },
} as const
const buttonFor = (s: Suggestion, armedCmd: string | null) => BUTTON[s.cmd === armedCmd ? 'armed' : s.gate]

const running = new Set<string>()

const forget = (cmd: string) => (prev: Suggestion[]) => prev.filter(c => c.cmd !== cmd)
const regate = (cmd: string, gate: Gate) => (prev: Suggestion[]) => mergeCommands(prev, [{ cmd, gate }])
const disarm = ($: EngineInterface) => update($, armed, () => null)

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

// A press on a command's button. A `run` command is checked against the
// session's Bash permission rules again first, since they may have changed
// since the band listed it; a `confirm` one runs on its second press in a row.
async function press($: EngineInterface, cmd: string) {
  const entry = (await read($, commands)).find(c => c.cmd === cmd)
  const wasArmed = (await read($, armed)) === cmd
  await disarm($)
  if (entry === undefined) {
    return
  }
  if (entry.gate === 'confirm') {
    if (wasArmed) {
      return run($, cmd)
    }
    await update($, armed, () => cmd)
    return
  }

  const verdict = await $.tool.check({ tool: 'Bash', input: { command: cmd } })
  if (verdict.decision === 'deny') {
    await update($, commands, regate(cmd, 'confirm'))
    $.ui.toast('Your permission rules deny this command: press twice to run it')
    return
  }

  return run($, cmd)
}

export const register: Register = on => {
  // Each suggestion is listed with the rules' verdict on it, so a denied one
  // draws the two-press button from the start.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.reason === 'answer') {
      const found = await Promise.all(extractBangCommands(e.answer).map(async (cmd): Promise<Suggestion> => {
        const { decision } = await $.tool.check({ tool: 'Bash', input: { command: cmd } })
        return { cmd, gate: decision === 'deny' ? 'confirm' : 'run' }
      }))
      if (found.length > 0) {
        await update($, commands, prev => mergeCommands(prev, found))
      }
      await disarm($)
    }

    return next(e)
  })

  // The model's Bash calls the permission check denied: listed as two-press.
  // A query (no tool_use_id), such as this plugin's own checks, is not a call.
  on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
    const r = await next(e)
    const input = e.input as { command?: unknown }
    if (r.decision === 'deny' && e.tool_use_id && typeof input.command === 'string') {
      await update($, commands, regate(input.command, 'confirm'))
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
      await update($, commands, prev => (isListed ? forget(sent)(prev) : []))
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
            onPress={async () => {
              await update($, commands, () => [])
              await disarm($)
            }}
          />
        </Box>
      </Box>
    )
  })

  // A run's row in the transcript: one line with the verdict, the command and
  // the exit code, then the output's tail. ctrl+o shows the whole message.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'plugin', name: 'bang-actions' } } }, async ($, e, next) => {
    const r = parseRunMessage(e.props.text)
    if (e.props.isExpanded || r === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const ok = r.exitCode === 0
    const tail = outputTail(r.output)

    return (
      <Box flexDirection="column">
        <Text color={ok ? 'green' : 'red'}>{`${ok ? '✓' : '✗'} ! ${buttonLabel(r.cmd)}  (exit ${r.exitCode})`}</Text>
        {tail !== '' && <Text dimColor>{tail}</Text>}
      </Box>
    )
  })
}
