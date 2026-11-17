import { expect, mock, test } from 'claude-code/testing'
import { paneLayout } from '../hooks/layout'
import type { Layout } from '../types'
import { flightdeck, leaves, stateStoreWithoutRedraw } from './store'

const pane = (bodyColumns: number, bodyRows: number, placement: 'dock' | 'inline' = 'dock') => ({
  plugin: 'flightdeck',
  component: 'Pane' as const,
  requestId: 'flightdeck',
  surface: 'terminal' as const,
  props: { title: 'Flightdeck', isFocused: true, bodyColumns, placement, scroll: { offset: 0, bodyRows }, view: {} },
})

const choose = (columns: number, rows: number, layout: Layout = 'auto', placement: 'dock' | 'inline' = 'dock', screenRows = 40) =>
  paneLayout({ layout, ...pane(columns, rows, placement), viewport: { columns: 160, rows: screenRows } })

test('terminal layout respects the measured body, not the wider viewport', () => {
  for (const width of [0, 1, 39]) expect(choose(width, 70)).toEqual({ kind: 'hidden' })
  expect(choose(40, 24)).toEqual({ kind: 'compact', columns: 40, columnWidth: 40 })
  expect(choose(109, 24).kind).toBe('compact')
  expect(choose(110, 24)).toEqual({ kind: 'wide', columns: 110, columnWidth: 54 })
  expect(choose(110, 24, 'compact').kind).toBe('compact')
  expect(choose(109, 24, 'wide').kind).toBe('compact')
})

test('short terminals hide or summarize without changing the selected layout', () => {
  for (const layout of ['auto', 'compact', 'wide', 'mini'] as const) {
    expect(choose(80, 70, layout, 'dock', 15).kind).toBe('hidden')
    expect(choose(80, 1, layout).kind).toBe('hidden')
  }
  expect(choose(80, 2)).toEqual({ kind: 'mini', columns: 80, rows: 2 })
  expect(choose(80, 23).kind).toBe('mini')
  expect(choose(80, 24).kind).toBe('compact')
  expect(choose(120, 23, 'wide').kind).toBe('wide')
})

test('inline summaries take at most a quarter of the screen and never exceed their body', () => {
  expect(choose(80, 20, 'auto', 'inline', 16)).toEqual({ kind: 'mini', columns: 80, rows: 4 })
  expect(choose(80, 20, 'auto', 'inline', 28)).toEqual({ kind: 'mini', columns: 80, rows: 7 })
  expect(choose(80, 20, 'auto', 'inline', 32)).toEqual({ kind: 'mini', columns: 80, rows: 8 })
  expect(choose(80, 3, 'mini', 'inline')).toEqual({ kind: 'mini', columns: 80, rows: 3 })
  expect(paneLayout({ layout: 'auto', ...pane(80, 8, 'inline') })).toEqual({ kind: 'mini', columns: 80, rows: 8 })
})

test('terminal size thresholds do not hide remote surfaces', () => {
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    expect(paneLayout({ layout: 'auto', ...pane(30, 10), surface, viewport: { columns: 30, rows: 10 } }).kind).toBe('compact')
  }
})

test('a busy summary fits every row budget and keeps its hygiene row', async ($, on) => {
  stateStoreWithoutRedraw(on)
  mock.clock(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.tool_use_id }))
  on('tool.check', () => ({ decision: 'deny', reason: 'rule' }) as never)
  for (let i = 0; i < 5; i++) {
    await $.agent.spawn({ prompt: 'work', description: `responsive task ${i}`, subagentType: 'general-purpose', tool_use_id: `responsive-${i}`, provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false } as never)
  }
  await $.tool.check({ tool: 'Read', input: { file_path: '/repo/a' }, tool_use_id: 'responsive-check' })
  for (const placement of ['inline', 'dock'] as const) {
    for (let rows = 2; rows <= 8; rows++) {
      const ui = await $.ui.mount(pane(80, rows, placement))
      const root = await ui.drawn() as { children?: unknown[] }
      expect((root.children ?? []).filter(Boolean).length, `${placement} fits ${rows} rows including its footer`).toBe(Math.min(rows, 7))
      const agentRows = leaves(root).filter(([, text]) => /^responsive task /.test(text))
      expect(agentRows.length).toBe(Math.min(3, Math.max(0, rows - 4)))
      expect(await ui.find({ text: /masked/ })).toBeDefined()
      expect(await ui.find({ text: /session log/ })).toBeUndefined()
      if (rows >= 4) expect(await ui.find({ text: new RegExp(`^\\+${5 - agentRows.length} more agents`) })).toBeDefined()
      await ui.unmount()
    }
  }
})

test('hide, shrink and grow renders preserve session state and restore the dashboard', async ($, on) => {
  const values = stateStoreWithoutRedraw(on)
  mock.clock(on)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  await $.turn.start({ text: 'go', turnId: 'responsive-turn' })
  const before = JSON.stringify(flightdeck(values))
  for (const [columns, rows, hidden, mini] of [[120, 70, false, false], [39, 70, true, false], [80, 4, false, true], [0, 0, true, false], [120, 70, false, false]] as const) {
    const ui = await $.ui.mount(pane(columns, rows))
    expect(Boolean(await ui.find({ text: /working/ }))).toBe(!hidden)
    expect(Boolean(await ui.find({ text: /session log/ }))).toBe(!hidden && !mini)
    await ui.unmount()
  }
  expect(JSON.stringify(flightdeck(values))).toBe(before)
})
