import { expect, test } from 'claude-code/testing'

import { buttonLabel, commandKey } from '../hooks/parse'

const SURFACES = ['terminal', 'desktop'] as const
const BAND = { plugin: 'bang-actions', component: 'AbovePrompt', props: {
  hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 }, view: {},
} } as const
const PLUGIN_ORIGIN = { kind: 'plugin', name: 'bang-actions' } as const

const ANSWER = 'I cannot log in for you. Run `! gcloud auth login` and tell me when done.'
const RUN_LOGIN = `run-${commandKey('gcloud auth login')}`
const RUN = '▶ Run'
const TWICE = '⚠ Run (denied, press twice)'
const AGAIN = '▶ Press again to run'

const turnDone = (answer: string, agentId?: string) => ({
  answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' as const, ...(agentId ? { agentId } : {}),
})
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })

type TestBody = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type Engine = Parameters<TestBody>[0]
type On = Parameters<TestBody>[1]

// Stands in for the engine beneath the plugin: answers, draws its own rows,
// decides Bash permissions from `deny` (a list the test may grow), and records
// runs, submitted prompts, prompt fills and toasts.
function engine(on: On, { exitCode = 0, deny = [] as string[], stdout = 'hello\n', drop = undefined as string | undefined } = {}) {
  const runs: (readonly string[])[] = []
  const submitted: { text: string; origin: unknown }[] = []
  const filled: string[] = []
  const toasts: string[] = []
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => {
    if (e.origin.kind !== 'plugin') return { text: e.text }
    submitted.push({ text: e.text, origin: e.origin })
    return drop === undefined ? { text: e.text } : { drop }
  })
  on('ui.render', ($, e) => { const { Box } = $.ui.resolve(e); return <Box key="engine" /> })
  on('tool.check', (_$, e) => {
    const { command } = e.input as { command: string }
    return { decision: deny.includes(command) ? 'deny' : 'allow' }
  })
  on('process.run', (_$, e) => {
    runs.push(e.argv)
    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.fill', (_$, e) => { filled.push(e.text); return { isFilled: true } })
  return { runs, submitted, filled, toasts, deny }
}

type Found = { text?: string }
type Drawing = { findAll: (q: { type: 'Button' | 'Code' }) => Promise<Found[]> }

// The band as the person reads it, one entry per row: the button's label, two
// spaces, the command as its Code shows it on one line; then `Dismiss`.
const rows = async (ui: Drawing) => {
  const codes = (await ui.findAll({ type: 'Code' })).map(c => buttonLabel(c.text ?? ''))
  return (await ui.findAll({ type: 'Button' })).map(b => (b.text === 'Dismiss' ? 'Dismiss' : `${b.text}  ${codes.shift()}`))
}

// The transcript row of a prompt the plugin submitted, as the engine asks the
// plugins to draw it.
const transcriptRow = ($: Engine, text: string, surface: (typeof SURFACES)[number] = 'terminal', isExpanded = false) =>
  $.ui.mount({ plugin: 'bang-actions', surface, component: 'UserMessage', props: { text, origin: PLUGIN_ORIGIN, isExpanded } })

for (const surface of SURFACES) {
  test(`${surface}: a suggested \`! cmd\` runs on press, its output starts Claude's next turn and stays as a transcript row`, async ($, on) => {
    const { runs, submitted, filled, toasts } = engine(on)

    await $.turn.complete(turnDone(ANSWER))
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await rows(ui)).toEqual([`${RUN}  gcloud auth login`, 'Dismiss'])
    expect(runs).toHaveLength(0)

    await ui.press({ key: RUN_LOGIN })
    expect(runs).toEqual([['/bin/bash', '-c', 'gcloud auth login']])
    expect(filled).toEqual([])
    expect(submitted).toEqual([{ origin: PLUGIN_ORIGIN, text: expect.stringContaining('\n! gcloud auth login\n') }])
    expect(submitted[0]?.text).toContain('(exit 0)')
    expect(submitted[0]?.text).toContain('hello')
    expect(toasts).toEqual([])
    expect(await rows(ui)).toEqual(['Dismiss'])

    const row = await transcriptRow($, submitted[0]?.text ?? '', surface)
    expect(await row.find({ type: 'Text', text: '✓ ! gcloud auth login  (exit 0)' })).toMatchObject({ props: { color: 'green' } })
    expect(await row.find({ type: 'Text', text: 'hello' })).toBeDefined()
    expect(await row.find({ key: 'engine' })).toBeUndefined()

    await ui.press({ key: 'dismiss' })
    expect(await rows(ui)).toEqual([])
  })

  test(`${surface}: a Bash call the rules deny draws a two-press button; the first press arms it, the second runs it`, async ($, on) => {
    const { runs, submitted, filled } = engine(on, { deny: ['sudo make install', 'ls'] })
    const key = `run-${commandKey('sudo make install')}`

    await $.tool.check({ tool: 'Bash', input: { command: 'sudo make install' }, tool_use_id: 'tu1' })
    await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await rows(ui)).toEqual([`${TWICE}  sudo make install`, 'Dismiss'])

    await ui.press({ key })
    expect(runs).toHaveLength(0)
    expect(await rows(ui)).toEqual([`${AGAIN}  sudo make install`, 'Dismiss'])

    await ui.press({ key })
    expect(runs).toEqual([['/bin/bash', '-c', 'sudo make install']])
    expect(filled).toEqual([])
    expect(submitted.map(s => s.origin)).toEqual([PLUGIN_ORIGIN])
    expect(await rows(ui)).toEqual(['Dismiss'])
  })
}

test('a suggestion the rules deny draws the two-press button from the start', async ($, on) => {
  const { runs } = engine(on, { deny: ['gcloud auth login'] })

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await rows(ui)).toEqual([`${TWICE}  gcloud auth login`, 'Dismiss'])

  await ui.press({ key: RUN_LOGIN })
  expect(runs).toHaveLength(0)
})

test('a suggestion the rules come to deny by press time switches to the two-press button instead of running or filling', async ($, on) => {
  const { runs, submitted, filled, toasts, deny } = engine(on)

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await rows(ui)).toEqual([`${RUN}  gcloud auth login`, 'Dismiss'])

  deny.push('gcloud auth login')
  await ui.press({ key: RUN_LOGIN })
  expect(runs).toHaveLength(0)
  expect(filled).toEqual([])
  expect(submitted).toEqual([])
  expect(toasts).toEqual([expect.stringContaining('press twice')])
  expect(await rows(ui)).toEqual([`${TWICE}  gcloud auth login`, 'Dismiss'])

  await ui.press({ key: RUN_LOGIN })
  await ui.press({ key: RUN_LOGIN })
  expect(runs).toEqual([['/bin/bash', '-c', 'gcloud auth login']])
})

test('arming clears on any other press, a typed prompt, a new answer and Dismiss', async ($, on) => {
  const { runs } = engine(on, { deny: ['a'] })
  const RUN_A = `run-${commandKey('a')}`
  const RUN_B = `run-${commandKey('b')}`

  await $.turn.complete(turnDone('Run `! a`, `! b` and `! c`.'))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: RUN_A })
  expect(await rows(ui)).toEqual([`${AGAIN}  a`, `${RUN}  b`, `${RUN}  c`, 'Dismiss'])
  await ui.press({ key: RUN_B })
  expect(runs).toEqual([['/bin/bash', '-c', 'b']])
  expect(await rows(ui)).toEqual([`${TWICE}  a`, `${RUN}  c`, 'Dismiss'])

  await ui.press({ key: RUN_A })
  await $.prompt.submit(typed('! c'))
  await ui.redraw()
  expect(await rows(ui)).toEqual([`${TWICE}  a`, 'Dismiss'])

  await ui.press({ key: RUN_A })
  await $.turn.complete(turnDone('Run `! d`.'))
  await ui.redraw()
  expect(await rows(ui)).toEqual([`${TWICE}  a`, `${RUN}  d`, 'Dismiss'])

  await ui.press({ key: RUN_A })
  await ui.press({ key: 'dismiss' })
  await $.turn.complete(turnDone('Run `! a`.'))
  await ui.redraw()
  expect(await rows(ui)).toEqual([`${TWICE}  a`, 'Dismiss'])
  expect(runs).toHaveLength(1)
})

test('command buttons carry no hotkey, so typing into a focused band never runs a command; Dismiss keeps x', async ($, on) => {
  engine(on, { deny: ['rm -rf build'] })

  await $.turn.complete(turnDone(ANSWER))
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'tu1' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: `run-${commandKey('rm -rf build')}` })
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map(b => [b.text, b.props.hotkey])).toEqual([[RUN, undefined], [AGAIN, undefined], ['Dismiss', 'x']])
})

test('a run whose prompt a hook drops tells the person the output did not reach Claude', async ($, on) => {
  const { runs, toasts } = engine(on, { drop: 'blocked by policy' })

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: RUN_LOGIN })
  expect(runs).toHaveLength(1)
  expect(toasts).toEqual([expect.stringContaining('did not reach Claude')])
})

test('a command too long to show in full is never listed, so a button never runs text it did not show', async ($, on) => {
  engine(on)
  const long = `echo ${'x'.repeat(9_000)}`

  await $.turn.complete(turnDone(`Run \`! ${long}\` or \`! ls\`.`))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await rows(ui)).toEqual([`${RUN}  ls`, 'Dismiss'])
})

test('a failing command draws its exit code in red in the transcript row; ANSI output is cleaned', async ($, on) => {
  const esc = String.fromCodePoint(0x1b)
  const { submitted } = engine(on, { exitCode: 2, stdout: `${esc}[31mboom${esc}[0m\n` })

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: RUN_LOGIN })
  const row = await transcriptRow($, submitted[0]?.text ?? '')
  expect(await row.find({ type: 'Text', text: '✗ ! gcloud auth login  (exit 2)' })).toMatchObject({ props: { color: 'red' } })
  expect(await row.find({ type: 'Text', text: 'boom' })).toBeDefined()
  expect(JSON.stringify(await row.drawn())).not.toContain(esc)
})

test('ctrl+o shows the whole run message: an expanded row is left to the engine', async ($, on) => {
  const { submitted } = engine(on)

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: RUN_LOGIN })
  const expanded = await transcriptRow($, submitted[0]?.text ?? '', 'terminal', true)
  expect(await expanded.find({ key: 'engine' })).toBeDefined()
  expect(await expanded.find({ type: 'Text', text: '✓ ! gcloud auth login' })).toBeUndefined()
})

test('a user row from another plugin, or a bang-actions prompt that is not a run, is left to the engine', async ($, on) => {
  engine(on)

  const other = await $.ui.mount({ plugin: 'bang-actions', surface: 'terminal', component: 'UserMessage', props: {
    text: 'The person pressed a bang-actions button, which ran this command (exit 0):\n! ls\nno fence',
    origin: { kind: 'plugin', name: 'other-plugin' }, isExpanded: false,
  } })
  expect(await other.find({ key: 'engine' })).toBeDefined()

  const notARun = await transcriptRow($, 'hello from a later version')
  expect(await notARun.find({ key: 'engine' })).toBeDefined()
})

test('a typed prompt clears the band; dismiss clears it too', async ($, on) => {
  engine(on)

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await rows(ui)).toHaveLength(2)

  await $.prompt.submit(typed('done, continue'))
  await ui.redraw()
  expect(await rows(ui)).toEqual([])

  await $.turn.complete(turnDone(ANSWER))
  await ui.redraw()
  await ui.press({ key: 'dismiss' })
  expect(await rows(ui)).toEqual([])
})

test('sending one listed command drops only it; non-typed prompts keep the list', async ($, on) => {
  engine(on)

  await $.turn.complete(turnDone('Run `! a` and `! b`.'))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await $.prompt.submit({ text: 'background task done', wait: false, origin: { kind: 'task-notification' } })
  await ui.redraw()
  expect(await rows(ui)).toEqual([`${RUN}  a`, `${RUN}  b`, 'Dismiss'])

  await $.prompt.submit(typed('! a'))
  await ui.redraw()
  expect(await rows(ui)).toEqual([`${RUN}  b`, 'Dismiss'])
})

test('subagent answers and interrupted turns add nothing', async ($, on) => {
  engine(on)

  await $.turn.complete(turnDone(ANSWER, 'agent-1'))
  await $.turn.complete({ ...turnDone(ANSWER), reason: 'aborted', isAborted: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await rows(ui)).toEqual([])
})

test('a long chained command shows one step per line beside a short Run button', async ($, on) => {
  engine(on)
  const cmd = 'export T=$(gh auth token --user a); gh pr ready 1 -R o/r && gh pr merge 1 -R o/r --merge'

  await $.turn.complete(turnDone(`Run \`! ${cmd}\`.`))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Code' })).map(c => c.text)).toEqual([
    'export T=$(gh auth token --user a);\n  gh pr ready 1 -R o/r &&\n  gh pr merge 1 -R o/r --merge',
  ])
  expect(await rows(ui)).toEqual([`${RUN}  ${cmd}`, 'Dismiss'])
})
