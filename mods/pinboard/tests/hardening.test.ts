import { describe, expect, test } from 'claude-code/testing'

import type { Pinboard } from '../types'
import { parsePin, parseUpdate } from '../hooks/register'
import { stateStore } from './state-store'

const TOOL = 'mcp__pinboard__update'
const UNCHECKED = 'The update could not be checked, so it was refused.'
const SCRUB_CRASH = '--token=•'

const throwing = (message: string) => new Proxy({}, { ownKeys: () => { throw new TypeError(message) } })

describe('an update the checks cannot finish', () => {
  test('parseUpdate refuses it with a fixed reason that holds neither the input nor the error', () => {
    expect(parseUpdate(throwing('password=hunter2'))).toEqual({ ok: false, error: UNCHECKED })
    const items = new Proxy(['a'], { get: (target, key) => (key === 'length' ? (() => { throw new TypeError('hunter2') })() : Reflect.get(target, key)) })
    expect(parseUpdate({ add_todos: items })).toEqual({ ok: false, error: UNCHECKED })
  })

  test('the tool call settles, and a refusal is the fixed reason counted once as rejected', async ($, on) => {
    const { value } = stateStore(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const outcome = await $.tool.call({ tool: TOOL, add_todos: [SCRUB_CRASH] })
    const stored = value('board') as Pinboard
    if ('deny' in outcome) {
      expect(outcome).toEqual({ deny: UNCHECKED })
      expect(stored).toEqual({ todos: [], decisions: [], hygiene: { masked: 0, rejected: 1 } })
    } else {
      expect(stored.hygiene.rejected).toBe(0)
    }
    expect(JSON.stringify([outcome, stored])).not.toContain('•')
  })

  test('its transcript row draws instead of failing', async $ => {
    const row = await $.ui.mount({
      plugin: 'pinboard',
      surface: 'terminal',
      component: 'ToolUse',
      props: { tool_use_id: 'u1', tool: TOOL, input: { add_todos: [SCRUB_CRASH] }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    expect(['Pinboard: update rejected', 'Pinboard: +1 todo']).toContain((await row.findAll({ type: 'Text' })).map(t => t.text).join(''))
  })
})

describe('a link the checks cannot finish', () => {
  test('parsePin answers null instead of throwing', () => {
    expect(parsePin('https://h.example/--token%3D%E2%80%A2')).toBeNull()
    expect(parsePin({ get length(): number { throw new TypeError('boom') } } as unknown as string)).toBeNull()
  })

  test('a making command whose output holds one returns its result unchanged, and the other links still pin', async ($, on) => {
    const { value } = stateStore(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    let runs = 0
    const text = 'https://h.example/--token%3D%E2%80%A2\nhttps://github.com/o/r/pull/5\n'
    const ran = { result: { stdout: text, stderr: '', interrupted: false }, text }
    on('tool.call', { tool: 'Bash' }, () => {
      runs += 1
      return ran
    })
    expect(await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })).toEqual(ran)
    expect(runs).toBe(1)
    expect(value('links')).toEqual([{ href: 'https://github.com/o/r/pull/5', label: 'r PR #5' }])
  })
})
