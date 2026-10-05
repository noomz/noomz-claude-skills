import { expect, test } from 'claude-code/testing'

import { commandKey } from '../hooks/parse'

const SURFACES = ['terminal', 'desktop'] as const
const BAND = { plugin: 'bang-actions', component: 'AbovePrompt', props: {
  hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 }, view: {},
} } as const

const ANSWER = 'I cannot log in for you. Run `! gcloud auth login` and tell me when done.'
const RUN_LOGIN = `run-${commandKey('gcloud auth login')}`

const turnDone = (answer: string, agentId?: string) => ({
  answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' as const, ...(agentId ? { agentId } : {}),
})
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })

type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]

// Stands in for the engine beneath the plugin: answers, draws its own band,
// decides Bash permissions from `deny`, and records runs and prompt fills.
function engine(on: On, { exitCode = 0, draft = '', deny = [] as string[], stdout = 'hello\n' } = {}) {
  const runs: (readonly string[])[] = []
  const filled: string[] = []
  on('ui.toast', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box key="engine" /> })
  on('tool.check', (_$, e) => {
    const { command } = e.input as { command: string }
    return { decision: deny.includes(command) ? 'deny' : 'allow' }
  })
  on('process.run', (_$, e) => {
    runs.push(e.argv)
    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.append', (_$, e) => ({ message: e.message, uuid: e.uuid }))
  on('prompt.read', () => ({ value: { text: draft, cursor: draft.length } }))
  on('prompt.fill', (_$, e) => { filled.push(e.text); return { isFilled: true } })
  return { runs, filled }
}

type Found = { text?: string; props?: Record<string, unknown> }
const buttons = async (ui: { findAll: (q: { type: 'Button' }) => Promise<Found[]> }) => ui.findAll({ type: 'Button' })
const labels = async (ui: { findAll: (q: { type: 'Button' }) => Promise<Found[]> }) => (await buttons(ui)).map(b => b.text)

for (const surface of SURFACES) {
  test(`${surface}: a suggested \`! cmd\` runs on press and shows its result in the band`, async ($, on) => {
    const { runs, filled } = engine(on)

    await $.turn.complete(turnDone(ANSWER))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await labels(ui)).toEqual(['▶ gcloud auth login', 'Dismiss'])
    expect(runs).toHaveLength(0)

    await ui.press({ key: RUN_LOGIN })
    expect(runs).toEqual([['/bin/bash', '-c', 'gcloud auth login']])
    expect(filled).toEqual([])
    expect(await ui.find({ type: 'Text', text: '✓ ! gcloud auth login  (exit 0)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'hello' })).toBeDefined()
    expect(await labels(ui)).toEqual(['Dismiss'])

    await ui.press({ key: 'dismiss' })
    expect(await labels(ui)).toEqual([])
  })

  test(`${surface}: a permission-denied Bash call only fills the prompt, never runs`, async ($, on) => {
    const { runs, filled } = engine(on, { deny: ['sudo make install', 'ls'] })

    await $.tool.check({ tool: 'Bash', input: { command: 'sudo make install' }, tool_use_id: 'tu1' })
    await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await labels(ui)).toEqual(['sudo make install', 'Dismiss'])

    await ui.press({ key: `fill-${commandKey('sudo make install')}` })
    expect(filled).toEqual(['! sudo make install'])
    expect(runs).toHaveLength(0)
  })
}

test('Run buttons carry no hotkey, so typing into a focused band never runs a command', async ($, on) => {
  engine(on, { deny: ['rm -rf build'] })

  await $.turn.complete(turnDone(ANSWER))
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'tu1' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('"label":"▶ gcloud auth login"}')
  expect(drawn).toContain('"label":"rm -rf build","hotkey":"a"')
})

test('a suggestion the permission rules deny at press time moves to Review and only fills', async ($, on) => {
  const { runs, filled } = engine(on, { deny: ['gcloud auth login'] })

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: RUN_LOGIN })
  expect(runs).toHaveLength(0)
  expect(filled).toEqual(['! gcloud auth login'])
  expect(await labels(ui)).toEqual(['gcloud auth login', 'Dismiss'])
})

test('a suggestion already denied this session never becomes a Run button', async ($, on) => {
  engine(on, { deny: ['gcloud auth login'] })

  await $.tool.check({ tool: 'Bash', input: { command: 'gcloud auth login' }, tool_use_id: 'tu1' })
  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await labels(ui)).toEqual(['gcloud auth login', 'Dismiss'])
})

test('a suggestion too long to show in full goes to Review', async ($, on) => {
  engine(on)
  const long = `echo ${'x'.repeat(250)}`

  await $.turn.complete(turnDone(`Run \`! ${long}\`.`))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await labels(ui)).toEqual([long, 'Dismiss'])
})

test('a failing command shows its exit code; ANSI output is cleaned for the band', async ($, on) => {
  const esc = String.fromCodePoint(0x1b)
  engine(on, { exitCode: 2, stdout: `${esc}[31mboom${esc}[0m\n` })

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: RUN_LOGIN })
  expect(await ui.find({ type: 'Text', text: '✗ ! gcloud auth login  (exit 2)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'boom' })).toBeDefined()
})

test('filling a blocked command never overwrites a draft the person is typing', async ($, on) => {
  const { filled } = engine(on, { draft: 'half-written question', deny: ['rm -rf build'] })

  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'tu1' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: `fill-${commandKey('rm -rf build')}` })
  expect(filled).toEqual([])
})

test('a typed prompt clears the band; dismiss clears it too', async ($, on) => {
  engine(on)

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await labels(ui)).toHaveLength(2)

  await $.prompt.submit(typed('done, continue'))
  await ui.redraw()
  expect(await labels(ui)).toEqual([])

  await $.turn.complete(turnDone(ANSWER))
  await ui.redraw()
  await ui.press({ key: 'dismiss' })
  expect(await labels(ui)).toEqual([])
})

test('sending one listed command drops only it; non-typed prompts keep the list', async ($, on) => {
  engine(on)

  await $.turn.complete(turnDone('Run `! a` and `! b`.'))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await $.prompt.submit({ text: 'background task done', wait: false, origin: { kind: 'task-notification' } })
  await ui.redraw()
  expect(await labels(ui)).toEqual(['▶ a', '▶ b', 'Dismiss'])

  await $.prompt.submit(typed('! a'))
  await ui.redraw()
  expect(await labels(ui)).toEqual(['▶ b', 'Dismiss'])
})

test('subagent answers and interrupted turns add nothing', async ($, on) => {
  engine(on)

  await $.turn.complete(turnDone(ANSWER, 'agent-1'))
  await $.turn.complete({ ...turnDone(ANSWER), reason: 'aborted', isAborted: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await labels(ui)).toEqual([])
})
