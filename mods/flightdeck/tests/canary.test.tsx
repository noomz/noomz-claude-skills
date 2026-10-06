import { expect, mock, test } from 'claude-code/testing'

import { flightdeck, leaves, stateStore } from './store'
import type { Engine, On } from './store'

const SURFACES = ['terminal', 'desktop'] as const
const LAYOUTS = ['auto', 'compact', 'wide', 'mini'] as const

const ESC = String.fromCodePoint(0x1b)
const RLO = String.fromCodePoint(0x202e)
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln'
const PROMPT = 'password=hunter2 aws_secret_access_key ABCDEFGHIJKLMNOPQRST'
const ANSWER = 'All set, the key is sk-ant-api03-AAAAAAAAAAAAAAAAAAAA and the ANSWERMARK'
const ADVICE = 'Use ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA then ADVICEMARK'
const COMMAND = 'curl -u admin:s3cr3t https://h.example/x?sig=abc'

const SECRETS = ['hunter2', 'ABCDEFGHIJKLMNOPQRST', 'eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'sk-ant-', 'ghp_', 's3cr3t', 'sig=abc']
const SESSION_TEXT = ['aws_secret_access_key', 'All set', 'ANSWERMARK', 'admin:', 'h.example/x']
const HIDDEN = /[\u001b\u009b\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/

const CAPS: [path: RegExp, cap: number][] = [
  [/^agents\.\d+\.description$/, 80],
  [/^agents\.\d+\.type$/, 40],
  [/^agents\.\d+\.tools\.\d+\.text$/, 64],
  [/^gate\.recent\.\d+\.detail$/, 64],
  [/^architect\.lastAdvice$/, 160],
  [/^architect\.consults\.\d+\.via$/, 40],
  [/^roster\.architectTypes\.\d+$/, 40],
  [/^log\.\d+\.who$/, 40],
  [/^log\.\d+\.text$/, 160],
]

const spawnArgs = (n: number, subagentType: string, description: string, name?: string) => ({
  prompt: 'do the task',
  description,
  subagentType,
  ...(name === undefined ? {} : { name }),
  tool_use_id: `spawn${n}`,
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
})

async function seed($: Engine, on: On) {
  const values = stateStore(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.offer', () => ({ isOffered: true }) as never)
  on('tool.check', () => ({ decision: 'deny' as const, reason: 'rule' }) as never)
  on('tool.call', () => ({ result: { stdout: '', stderr: 'boom', interrupted: false }, text: 'boom', isError: true }) as never)
  let n = 0
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.subagentType === 'architect' ? 'arch1' : `ag${++n}` }) as never)

  await $.agent.offer({ agent: `architect-${'r'.repeat(290)}`, description: 'reviews plans', source: 'plugin', provider: { plugin: 'engine', tier: 'core' } } as never)
  await $.turn.start({ text: PROMPT, turnId: 'T1' })
  await $.turn.start({ text: `<agent-message from="${JWT}">\nThe report follows:\n${PROMPT}\n</agent-message>`, turnId: 'T2' })
  await $.agent.spawn(spawnArgs(1, 'general-purpose', `deploy ${JWT} ${ESC}[31mred${RLO}evil`, 'N'.repeat(300)) as never)
  await $.tool.check({ tool: 'Bash', input: { command: COMMAND }, tool_use_id: 'k1' })
  await $.tool.call({ tool: 'Bash', command: COMMAND, agentId: 'ag1', tool_use_id: 'c1' } as never)
  await $.turn.complete({ answer: ANSWER, durationMs: 1200, isAborted: false, turnId: 'T3', agentId: 'ag1', reason: 'answer' } as never)
  await $.agent.spawn(spawnArgs(2, 'architect', 'review the plan') as never)
  await $.tool.call({ tool: 'SubagentHandback', message: ADVICE, agentId: 'arch1', tool_use_id: 'c2' } as never)
  await $.turn.start({ text: `<agent-message from="arch1">\nThe report follows:\n${ADVICE} two\n</agent-message>`, turnId: 'T4' })
  await $.turn.complete({ answer: `${ADVICE} three`, durationMs: 900, isAborted: false, turnId: 'T5', agentId: 'arch1', reason: 'answer' } as never)
  await $.command.run({ command: 'flightdeck', args: 'open' } as never)
  return values
}

const stored = (values: Map<string, { value: unknown }>) => leaves(flightdeck(values))

const panes = async ($: Engine, surface: (typeof SURFACES)[number]) => {
  const out: [string, string][] = []
  for (const layout of LAYOUTS) {
    await $.command.run({ command: 'flightdeck', args: `layout ${layout}` } as never)
    for (const placement of ['dock', 'inline'] as const) {
      const ui = await $.ui.mount({
        plugin: 'flightdeck',
        component: 'Pane',
        requestId: 'flightdeck',
        surface,
        props: { title: 'Flightdeck', isFocused: true, bodyColumns: 120, placement, scroll: { offset: 0, bodyRows: 70 }, view: {} },
      })
      for (const card of ['card-ag1', 'gate-shell']) await ui.press({ key: card }).catch(() => undefined)
      leaves(await ui.drawn(), `${layout}.${placement}`, out)
      await ui.unmount()
    }
  }
  return out
}

const expectClean = (strings: [string, string][]) => {
  for (const [path, text] of strings) {
    for (const secret of SECRETS) expect(text.includes(secret), `${path} holds ${secret}`).toBe(false)
    for (const words of SESSION_TEXT) expect(text.includes(words), `${path} holds session text ${words}`).toBe(false)
    expect(HIDDEN.test(text), `${path} holds an ESC or bidi character`).toBe(false)
  }
}

test('state holds no canary secret, no prompt or answer text, and no ESC or bidi character', async ($, on) => {
  const values = await seed($, on)
  const strings = stored(values)
  expect(strings.length).toBeGreaterThan(0)
  expectClean(strings)
})

test('every stored text field stays inside its cap', async ($, on) => {
  const values = await seed($, on)
  const strings = stored(values)
  for (const [pattern] of CAPS) expect(strings.some(([path]) => pattern.test(path)), `no stored ${pattern}`).toBe(true)
  for (const [path, text] of strings) {
    const cap = CAPS.find(([pattern]) => pattern.test(path))?.[1]
    if (cap !== undefined) expect(text.length <= cap, `${path} is ${text.length} long, cap ${cap}`).toBe(true)
  }
})

for (const surface of SURFACES) {
  test(`${surface}: every layout draws no canary secret, no session text, and no ESC or bidi character`, async ($, on) => {
    await seed($, on)
    const strings = await panes($, surface)
    expect(strings.length).toBeGreaterThan(0)
    expectClean(strings)
  })
}
