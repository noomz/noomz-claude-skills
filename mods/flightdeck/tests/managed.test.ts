import { expect, mock, test } from 'claude-code/testing'
import { advanceManaged, failManaged, finishManaged, identifyManaged, managedArgv, managedHeader, managedLabel, managedPhase, managedPrompt, requestCancelManaged, startManaged } from '../hooks/managed'
import { flightdeck, stateStoreWithoutRedraw } from './store'
import type { On } from './store'

const header = (id = '11111111-1111-4111-8111-111111111111') => `{"type":"session","version":3,"id":"${id}","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/secret/path"}\n`
const event = (type: string, extra = '') => `{"type":"${type}"${extra}}\n`

test('accepts one bounded prompt and builds only the verified pi-bolt vector', () => {
  expect(managedPrompt('pong')).toBe('pong')
  expect(managedPrompt('  pong  ')).toBe('pong')
  expect(managedPrompt('')).toBe(null)
  expect(managedPrompt('pong\nid')).toBe(null)
  expect(managedPrompt('x'.repeat(4001))).toBe(null)
  expect(managedArgv('pong')).toEqual(['pi-bolt', '--mode', 'json', '--no-session', '--no-tools', '--offline', '--', 'pong'])
})

test('reads only an early session header and named phase types', () => {
  expect(managedHeader(header())?.sessionId).toBe('11111111-1111-4111-8111-111111111111')
  expect(managedHeader('{"type":"agent_start"}\n')).toBe(null)
  expect(managedHeader('not json\n')).toBe(null)
  expect(managedHeader(header('ghp_abcdefghijklmnop'))).toBe(null)
  expect(managedHeader(header('bad id'))).toBe(null)
  expect(managedPhase(event('turn_start'))).toBe('turn_start')
  expect(managedPhase(event('message_update', ',"delta":"the answer password=hunter2"'))).toBe(null)
  expect(managedPhase('{"cwd":"/secret"}')).toBe(null)
})

test('keeps live, completed and unavailable distinct without treating process exit as success', () => {
  const started = startManaged('spawn-1', 1)
  expect(managedLabel(started)).toBe('unavailable')
  const missing = finishManaged(started, 'spawn-1', 0, null, 2)
  expect(missing.status).toBe('unavailable')
  expect(missing.sessionId).toBe(null)
  const id = managedHeader(header())?.sessionId
  if (!id) throw new Error('header missing')
  const live = identifyManaged(started, 'spawn-1', id, 2)
  expect(managedLabel(live)).toBe('live')
  const phased = advanceManaged(live, 'spawn-1', managedPhase(event('turn_start')) ?? id, 3)
  expect(phased.phase).toBe('turn_start')
  expect(managedLabel(finishManaged(phased, 'spawn-1', 0, null, 4))).toBe('completed')
  expect(finishManaged(phased, 'spawn-1', 2, null, 4).status).toBe('failed')
  expect(managedLabel(finishManaged(phased, 'spawn-1', 2, null, 4))).toBe('unavailable')
  const cancelling = requestCancelManaged(phased, 'spawn-1', 5)
  expect(managedLabel(cancelling)).toBe('live')
  expect(finishManaged(cancelling, 'spawn-1', 0, null, 6).status).toBe('unavailable')
  expect(finishManaged(requestCancelManaged(started, 'spawn-1', 5), 'spawn-1', null, 'SIGTERM', 6).sessionId).toBe(null)
})

test('a managed command launches pi-bolt only while enabled and retains no prompt or answer', async ($, on) => {
  const values = stateStoreWithoutRedraw(on)
  mock.clock(on)
  const launched: string[][] = []
  const stopped: string[] = []
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('process.spawn', async function* (_$, e) {
    launched.push([...e.argv])
    try {
      yield { stream: 'stdout' as const, text: header() }
      yield { stream: 'stdout' as const, text: event('message_update', ',"delta":"answer password=hunter2"') }
      yield { stream: 'stdout' as const, text: event('turn_start') }
      return { value: { code: 0, signal: null } }
    } finally {
      stopped.push(e.argv[0] ?? '')
    }
  })
  await $.session.start({ cwd: '/work' } as never)
  expect((await $.command.run({ command: 'flightdeck', args: 'managed pong' } as never)).text).toMatch(/managed is off/)
  expect(launched).toEqual([])
  await $.command.run({ command: 'flightdeck', args: 'managed on' } as never)
  const started = await $.command.run({ command: 'flightdeck', args: 'managed pong password=hunter2' } as never)
  expect(started.text).toMatch(/completed/)
  expect(launched[0]?.slice(0, 7)).toEqual(['pi-bolt', '--mode', 'json', '--no-session', '--no-tools', '--offline', '--'])
  expect(launched[0]?.at(-1)).toBe('pong password=hunter2')
  const stored = JSON.stringify(flightdeck(values))
  expect(stored.includes('hunter2')).toBe(false)
  expect(stored.includes('pong')).toBe(false)
  expect(stored.includes('/secret')).toBe(false)
  await $.command.run({ command: 'flightdeck', args: 'audit' } as never)
  expect(stopped).toEqual(['pi-bolt'])
})

test('a missing header and a nonzero exit stay unavailable, and reset keeps no managed text', async ($, on) => {
  const values = stateStoreWithoutRedraw(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  let exitCode = 1
  let emitHeader = false
  on('process.spawn', async function* () {
    if (emitHeader) yield { stream: 'stdout' as const, text: header() }
    yield { stream: 'stdout' as const, text: event('message_end', ',"message":{"content":"password=hunter2"}') }
    return { value: { code: exitCode, signal: null } }
  })
  await $.session.start({ cwd: '/work' } as never)
  await $.command.run({ command: 'flightdeck', args: 'managed on' } as never)
  expect((await $.command.run({ command: 'flightdeck', args: 'managed pong' } as never)).text).toMatch(/unavailable/)
  emitHeader = true
  expect((await $.command.run({ command: 'flightdeck', args: 'managed pong' } as never)).text).toMatch(/unavailable/)
  exitCode = 0
  expect((await $.command.run({ command: 'flightdeck', args: 'managed pong' } as never)).text).toMatch(/completed/)
  const during = await $.ui.mount({ plugin: 'flightdeck', component: 'Pane', requestId: 'flightdeck', surface: 'terminal', props: { title: 'Flightdeck', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } })
  const found = await during.find({ text: /managed pi-bolt/ }).catch(() => undefined)
  if (!found) throw new Error(JSON.stringify(await during.drawn()).slice(0, 900))
  await during.unmount()
  expect((await $.command.run({ command: 'flightdeck', args: 'managed cancel' } as never)).text).toMatch(/nothing running/)
  await $.command.run({ command: 'flightdeck', args: 'reset' } as never)
  expect(JSON.stringify(flightdeck(values)).includes('hunter2')).toBe(false)
  expect(JSON.stringify(flightdeck(values)).includes('11111111')).toBe(false)
  const ui = await $.ui.mount({ plugin: 'flightdeck', component: 'Pane', requestId: 'flightdeck', surface: 'terminal', props: { title: 'Flightdeck', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } })
  expect(await ui.find({ text: /managed pi-bolt/ }).catch(() => undefined)).toBeUndefined()
  await ui.unmount()
})

test('a partial event line past the cap is dropped and never takes the session header slot', async ($, on) => {
  const values = stateStoreWithoutRedraw(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('process.spawn', async function* () {
    yield { stream: 'stdout' as const, text: `{"type":"message_update","delta":"${'password=hunter2 '.repeat(800)}` }
    yield { stream: 'stdout' as const, text: 'tail"}\n' }
    yield { stream: 'stdout' as const, text: header() }
    yield { stream: 'stdout' as const, text: event('turn_start') }
    return { value: { code: 0, signal: null } }
  })
  await $.session.start({ cwd: '/work' } as never)
  await $.command.run({ command: 'flightdeck', args: 'managed on' } as never)
  const started = await $.command.run({ command: 'flightdeck', args: 'managed pong' } as never)
  expect(started.text).toMatch(/managed pi-bolt completed/)
  expect(started.text?.includes('hunter2')).toBe(false)
  expect(JSON.stringify(flightdeck(values)).includes('hunter2')).toBe(false)
})

test('two live runs fill the limit and a third prompt is refused', { timeoutMs: 20_000 }, async ($, on) => {
  const values = stateStoreWithoutRedraw(on)
  mock.clock(on)
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('process.spawn', async function* () {
    yield { stream: 'stdout' as const, text: header() }
    await gate
    return { value: { code: 0, signal: null } }
  })
  await $.session.start({ cwd: '/work' } as never)
  await $.command.run({ command: 'flightdeck', args: 'managed on' } as never)
  const first = $.command.run({ command: 'flightdeck', args: 'managed one' } as never)
  const second = $.command.run({ command: 'flightdeck', args: 'managed two' } as never)
  for (let i = 0; i < 200 && !JSON.stringify(flightdeck(values)).includes('11111111'); i++) await Promise.resolve()
  const third = await $.command.run({ command: 'flightdeck', args: 'managed three' } as never)
  expect(third.text).toMatch(/two sessions are already running/)
  release()
  expect((await first).text).toMatch(/completed/)
  expect((await second).text).toMatch(/completed/)
})

test('turning managed activity off aborts a live child and drops its row', { timeoutMs: 20_000 }, async ($, on) => {
  const values = stateStoreWithoutRedraw(on)
  mock.clock(on)
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  const stopped: string[] = []
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('process.spawn', async function* (_$, e) {
    try {
      yield { stream: 'stdout' as const, text: header() }
      await gate
      return { value: { code: 0, signal: null } }
    } finally {
      stopped.push(e.argv[0] ?? '')
    }
  })
  await $.session.start({ cwd: '/work' } as never)
  await $.command.run({ command: 'flightdeck', args: 'managed on' } as never)
  const live = $.command.run({ command: 'flightdeck', args: 'managed pong' } as never)
  for (let i = 0; i < 200; i++) await Promise.resolve()
  const off = await $.command.run({ command: 'flightdeck', args: 'managed off' } as never)
  expect(off.text).toMatch(/managed activity off/)
  release()
  const finished = await live
  expect(finished.text).toMatch(/unavailable/)
  expect(stopped.length).toBeGreaterThan(0)
  expect(JSON.stringify(flightdeck(values)).includes('11111111')).toBe(false)
})

test('a clear aborts a live child and leaves no managed row', { timeoutMs: 20_000 }, async ($, on) => {
  const values = stateStoreWithoutRedraw(on)
  mock.clock(on)
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('process.spawn', async function* () {
    yield { stream: 'stdout' as const, text: header() }
    await gate
    return { value: { code: 0, signal: null } }
  })
  await $.session.start({ cwd: '/work' } as never)
  await $.command.run({ command: 'flightdeck', args: 'managed on' } as never)
  const live = $.command.run({ command: 'flightdeck', args: 'managed pong' } as never)
  for (let i = 0; i < 200; i++) await Promise.resolve()
  await $.session.end({ reason: 'clear', sessionId: '11111111-1111-4111-8111-111111111111' } as never)
  release()
  expect((await live).text).toMatch(/unavailable/)
  expect(JSON.stringify(flightdeck(values)).includes('11111111')).toBe(false)
})

const blockedManaged = (on: On, launched: string[] = []) => {
  let release: () => void = () => undefined
  const gate = new Promise<void>(resolve => { release = resolve })
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('process.spawn', async function* (_$, e) {
    launched.push(e.argv.at(-1) ?? '')
    yield { stream: 'stdout' as const, text: header() }
    await gate
    return { value: { code: 0, signal: null } }
  })
  return () => release()
}

const managedPane = (bodyColumns: number, placement: 'dock' | 'inline' = 'dock') => ({
  plugin: 'flightdeck',
  component: 'Pane' as const,
  requestId: 'flightdeck',
  surface: 'terminal' as const,
  props: { title: 'Flightdeck', isFocused: true, bodyColumns, placement, scroll: { offset: 0, bodyRows: 70 }, view: {} },
})

test('an open pane redraws when a managed run starts, changes and is turned off', { timeoutMs: 20_000 }, async ($, on) => {
  stateStoreWithoutRedraw(on)
  mock.clock(on)
  const release = blockedManaged(on)
  await $.session.start({ cwd: '/work' } as never)
  await $.command.run({ command: 'flightdeck', args: 'managed on' } as never)
  const ui = await $.ui.mount(managedPane(120))
  expect(await ui.find({ text: /^managed / })).toBeUndefined()
  const live = $.command.run({ command: 'flightdeck', args: 'managed pong' } as never)
  for (let i = 0; i < 200; i++) await Promise.resolve()
  expect(await ui.find({ text: /^managed pi-bolt · live/ })).toBeDefined()
  await $.command.run({ command: 'flightdeck', args: 'managed off' } as never)
  expect(await ui.find({ text: /^managed / })).toBeUndefined()
  release()
  await live
  await ui.unmount()
})

test('concurrent managed prompts never launch more than the limit', { timeoutMs: 20_000 }, async ($, on) => {
  stateStoreWithoutRedraw(on)
  mock.clock(on)
  const launched: string[] = []
  const release = blockedManaged(on, launched)
  await $.session.start({ cwd: '/work' } as never)
  await $.command.run({ command: 'flightdeck', args: 'managed on' } as never)
  const runs = ['one', 'two', 'three'].map(p => $.command.run({ command: 'flightdeck', args: `managed ${p}` } as never))
  for (let i = 0; i < 200; i++) await Promise.resolve()
  expect(launched.length).toBe(2)
  release()
  const texts = (await Promise.all(runs)).map(r => r.text)
  expect(texts.filter(t => /two sessions are already running/.test(t ?? '')).length).toBe(1)
  expect(launched.length).toBe(2)
})

test('the mini layout keeps managed runs inside its three agent rows and counts the rest', { timeoutMs: 20_000 }, async ($, on) => {
  stateStoreWithoutRedraw(on)
  mock.clock(on)
  const release = blockedManaged(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `a${++n}` }))
  await $.session.start({ cwd: '/work' } as never)
  await $.command.run({ command: 'flightdeck', args: 'managed on' } as never)
  const runs = ['one', 'two'].map(p => $.command.run({ command: 'flightdeck', args: `managed ${p}` } as never))
  for (let i = 0; i < 200; i++) await Promise.resolve()
  for (const d of ['first', 'second', 'third']) {
    await $.agent.spawn({ prompt: d, description: d, subagentType: 'general-purpose', tool_use_id: `tu-${d}`, provider: { plugin: 'engine', tier: 'core' as const }, parentModel: 'claude-opus-5-5', background: true, fork: false })
  }
  const mini = await $.ui.mount(managedPane(80, 'inline'))
  expect(await mini.find({ text: /^managed / })).toBeUndefined()
  expect(await mini.find({ text: /^\+2 more agents · / })).toBeDefined()
  await mini.unmount()
  release()
  await Promise.all(runs)
})

test('a managed prompt racing a reset launches nothing', { timeoutMs: 20_000 }, async ($, on) => {
  stateStoreWithoutRedraw(on)
  mock.clock(on)
  const launched: string[] = []
  const release = blockedManaged(on, launched)
  on('ui.close', () => ({ value: undefined }))
  await $.session.start({ cwd: '/work' } as never)
  await $.command.run({ command: 'flightdeck', args: 'managed on' } as never)
  const raced = $.command.run({ command: 'flightdeck', args: 'managed pong' } as never)
  const reset = $.command.run({ command: 'flightdeck', args: 'reset' } as never)
  release()
  await reset
  expect((await raced).text).toMatch(/Nothing was launched/)
  expect(launched).toEqual([])
})
