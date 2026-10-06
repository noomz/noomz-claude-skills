import { expect, mock, test } from 'claude-code/testing'

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
const TWICE = '⚠ Run (press twice)'
const AGAIN = '▶ Press again to run'

// A command button ignores a press this soon after the previous one.
const DEBOUNCE_MS = 500

const turnDone = (answer: string, agentId?: string) => ({
  answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' as const, ...(agentId ? { agentId } : {}),
})
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })

type TestBody = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
type On = Parameters<TestBody>[1]

type EngineOptions = {
  exitCode?: number
  stdout?: string
  drop?: string
  // Bash commands the permission rules deny, on a call and on a query alike.
  deny?: string[]
  // Bash commands a PreToolUse hook denies: a call (with `tool_use_id`) is
  // denied, a query on the same command is allowed, as the engine answers.
  denyCalls?: string[]
  // Bash commands whose permission check fails outright.
  rejects?: string[]
  // How long every permission check takes, on the mocked clock.
  checkDelayMs?: number
}

// Stands in for the engine beneath the plugin: the clock, answers, its own
// rows, Bash permissions, and a record of runs, submitted prompts, prompt
// fills and toasts. `press` presses a command button once the debounce window
// since the previous press has passed.
function engine(on: On, {
  exitCode = 0, stdout = 'hello\n', drop, deny = [], denyCalls = [], rejects = [], checkDelayMs = 0,
}: EngineOptions = {}) {
  const clock = mock.clock(on)
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
  on('tool.check', async (_$, e) => {
    const { command } = e.input as { command: string }
    if (checkDelayMs > 0) await clock.sleep(checkDelayMs)
    if (rejects.includes(command)) throw new Error(`check failed: ${command}`)
    const denied = deny.includes(command) || (e.tool_use_id !== undefined && denyCalls.includes(command))
    return { decision: denied ? 'deny' : 'allow' }
  })
  on('process.run', (_$, e) => {
    runs.push(e.argv)
    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('prompt.fill', (_$, e) => { filled.push(e.text); return { isFilled: true } })
  const press = async (ui: Pressable, key: string) => {
    await clock.advance(DEBOUNCE_MS)
    await ui.press({ key })
  }
  return { runs, submitted, filled, toasts, deny, clock, press }
}

type Found = { text?: string }
type Drawing = { findAll: (q: { type: 'Button' | 'Code' }) => Promise<Found[]> }
type Pressable = { press: (target: { key: string }) => Promise<unknown> }

// The band as the person reads it, one entry per row: the button's label, two
// spaces, the command as its Code shows it on one line; then `Dismiss`.
const rows = async (ui: Drawing) => {
  const codes = (await ui.findAll({ type: 'Code' })).map(c => buttonLabel(c.text ?? ''))
  return (await ui.findAll({ type: 'Button' })).map(b => (b.text === 'Dismiss' ? 'Dismiss' : `${b.text}  ${codes.shift()}`))
}

for (const surface of SURFACES) {
  test(`${surface}: a suggested \`! cmd\` runs on press and its output starts Claude's next turn as the plugin's prompt`, async ($, on) => {
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
    expect(await rows(ui)).toEqual([])
  })

  test(`${surface}: a Bash call the rules deny draws a two-press button; the first press arms it, the second runs it`, async ($, on) => {
    const { runs, submitted, filled, press } = engine(on, { deny: ['sudo make install', 'ls'] })
    const key = `run-${commandKey('sudo make install')}`

    await $.tool.check({ tool: 'Bash', input: { command: 'sudo make install' }, tool_use_id: 'tu1' })
    await $.tool.check({ tool: 'Bash', input: { command: 'ls' } })
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await rows(ui)).toEqual([`${TWICE}  sudo make install`, 'Dismiss'])

    await press(ui, key)
    expect(runs).toHaveLength(0)
    expect(await rows(ui)).toEqual([`${AGAIN}  sudo make install`, 'Dismiss'])

    await press(ui, key)
    expect(runs).toEqual([['/bin/bash', '-c', 'sudo make install']])
    expect(filled).toEqual([])
    expect(submitted.map(s => s.origin)).toEqual([PLUGIN_ORIGIN])
    expect(await rows(ui)).toEqual([])
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
  const { runs, submitted, filled, toasts, deny, press } = engine(on)

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await rows(ui)).toEqual([`${RUN}  gcloud auth login`, 'Dismiss'])

  deny.push('gcloud auth login')
  await press(ui, RUN_LOGIN)
  expect(runs).toHaveLength(0)
  expect(filled).toEqual([])
  expect(submitted).toEqual([])
  expect(toasts).toEqual([expect.stringContaining('press twice')])
  expect(await rows(ui)).toEqual([`${TWICE}  gcloud auth login`, 'Dismiss'])

  await press(ui, RUN_LOGIN)
  await press(ui, RUN_LOGIN)
  expect(runs).toEqual([['/bin/bash', '-c', 'gcloud auth login']])
})

test('a press-time denial never re-lists a command Dismiss cleared while the check was pending', async ($, on) => {
  const { runs, toasts, deny, clock, press } = engine(on, { checkDelayMs: 10 })

  const answered = $.turn.complete(turnDone(ANSWER))
  await clock.advance(10)
  await answered
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await rows(ui)).toEqual([`${RUN}  gcloud auth login`, 'Dismiss'])

  deny.push('gcloud auth login')
  const pressed = press(ui, RUN_LOGIN)
  await clock.settle()
  await ui.press({ key: 'dismiss' })
  await clock.advance(10)
  await pressed
  expect(runs).toHaveLength(0)
  expect(toasts).toEqual([])
  await ui.redraw()
  expect(await rows(ui)).toEqual([])
})

test('a two-press button never drops to one press when a later check allows the command: a query runs no PreToolUse hook', async ($, on) => {
  const { runs, press } = engine(on, { denyCalls: ['sudo make install'] })
  const key = `run-${commandKey('sudo make install')}`

  await $.tool.check({ tool: 'Bash', input: { command: 'sudo make install' }, tool_use_id: 'tu1' })
  await $.turn.complete(turnDone('Run `! sudo make install` yourself.'))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await rows(ui)).toEqual([`${TWICE}  sudo make install`, 'Dismiss'])

  await press(ui, key)
  expect(runs).toHaveLength(0)
  expect(await rows(ui)).toEqual([`${AGAIN}  sudo make install`, 'Dismiss'])
})

test('a suggestion whose permission check fails lists as two-press, and the rest of the batch survives', async ($, on) => {
  engine(on, { rejects: ['b'] })

  await $.turn.complete(turnDone('Run `! a`, `! b` and `! c`.'))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await rows(ui)).toEqual([`${RUN}  a`, `${TWICE}  b`, `${RUN}  c`, 'Dismiss'])
})

test('a second press within the debounce window is ignored, for every gate, so a key repeat never runs the next command or an armed one', async ($, on) => {
  const { runs, clock } = engine(on, { deny: ['a'] })
  const RUN_A = `run-${commandKey('a')}`
  const RUN_B = `run-${commandKey('b')}`

  await $.turn.complete(turnDone('Run `! a` and `! b`.'))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await ui.press({ key: RUN_B })
  await ui.press({ key: RUN_A })
  expect(runs).toEqual([['/bin/bash', '-c', 'b']])
  expect(await rows(ui)).toEqual([`${TWICE}  a`, 'Dismiss'])

  await clock.advance(DEBOUNCE_MS - 1)
  await ui.press({ key: RUN_A })
  expect(await rows(ui)).toEqual([`${TWICE}  a`, 'Dismiss'])

  await clock.advance(1)
  await ui.press({ key: RUN_A })
  expect(await rows(ui)).toEqual([`${AGAIN}  a`, 'Dismiss'])
  await ui.press({ key: RUN_A })
  expect(runs).toHaveLength(1)
  expect(await rows(ui)).toEqual([`${AGAIN}  a`, 'Dismiss'])

  await clock.advance(DEBOUNCE_MS)
  await ui.press({ key: RUN_A })
  expect(runs).toEqual([['/bin/bash', '-c', 'b'], ['/bin/bash', '-c', 'a']])
})

test('a command taller than the band can show enters as two-press, since one press would run steps the person never saw', async ($, on) => {
  const { runs, press } = engine(on)
  const steps = (n: number) => Array.from({ length: n }, (_, i) => `step${i}`).join(' && ')
  const tall = steps(9)
  const fits = steps(8)

  await $.turn.complete(turnDone(`Run \`! ${tall}\` or \`! ${fits}\`.`))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await rows(ui)).toEqual([`${TWICE}  ${tall}`, `${RUN}  ${fits}`, 'Dismiss'])

  await press(ui, `run-${commandKey(tall)}`)
  expect(runs).toHaveLength(0)
  await press(ui, `run-${commandKey(tall)}`)
  expect(runs).toEqual([['/bin/bash', '-c', tall]])
})

test('a command that just ran with exit 0 is not listed again when the next answer quotes it; the answer after that may', async ($, on) => {
  const { runs, press } = engine(on)

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await press(ui, RUN_LOGIN)
  expect(runs).toHaveLength(1)

  await $.turn.complete(turnDone('`! gcloud auth login` succeeded. Now run `! gh auth status`.'))
  await ui.redraw()
  expect(await rows(ui)).toEqual([`${RUN}  gh auth status`, 'Dismiss'])

  await $.turn.complete(turnDone(ANSWER))
  await ui.redraw()
  expect(await rows(ui)).toEqual([`${RUN}  gh auth status`, `${RUN}  gcloud auth login`, 'Dismiss'])
})

test('a command that failed is listed again when the next answer quotes it, since a retry after a fix is legitimate', async ($, on) => {
  const { runs, press } = engine(on, { exitCode: 1 })

  await $.turn.complete(turnDone(ANSWER))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await press(ui, RUN_LOGIN)
  expect(runs).toHaveLength(1)

  await $.turn.complete(turnDone('That failed. Fix the config, then run `! gcloud auth login` again.'))
  await ui.redraw()
  expect(await rows(ui)).toEqual([`${RUN}  gcloud auth login`, 'Dismiss'])
})

test('arming clears on any other press, a typed prompt, a new answer and Dismiss', async ($, on) => {
  const { runs, press } = engine(on, { deny: ['a'] })
  const RUN_A = `run-${commandKey('a')}`
  const RUN_B = `run-${commandKey('b')}`

  await $.turn.complete(turnDone('Run `! a`, `! b` and `! c`.'))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await press(ui, RUN_A)
  expect(await rows(ui)).toEqual([`${AGAIN}  a`, `${RUN}  b`, `${RUN}  c`, 'Dismiss'])
  await press(ui, RUN_B)
  expect(runs).toEqual([['/bin/bash', '-c', 'b']])
  expect(await rows(ui)).toEqual([`${TWICE}  a`, `${RUN}  c`, 'Dismiss'])

  await press(ui, RUN_A)
  await $.prompt.submit(typed('! c'))
  await ui.redraw()
  expect(await rows(ui)).toEqual([`${TWICE}  a`, 'Dismiss'])

  await press(ui, RUN_A)
  await $.turn.complete(turnDone('Run `! d`.'))
  await ui.redraw()
  expect(await rows(ui)).toEqual([`${TWICE}  a`, `${RUN}  d`, 'Dismiss'])

  await press(ui, RUN_A)
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
