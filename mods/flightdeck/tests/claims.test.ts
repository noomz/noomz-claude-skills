import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { DEFAULT_GATE, DEFAULT_TURN, adviceLine, consultVia } from '../hooks/core'
import { scrub } from '../hooks/hygiene'
import { flightdeck, stateStore } from './store'
import type { AgentCard, Architect, Gate, Hygiene, LogLine, Turn, Usage } from '../types'
import type { Engine } from './store'

type Row = [input: string, text: string, masked: number]

const rows = (cases: Row[]) => {
  for (const [input, text, masked] of cases) test(JSON.stringify(input), () => expect(scrub(input, 200)).toEqual({ text, masked }))
}

describe('scrub masks the README examples as written', () => {
  rows([
    ['"DB_PASS": "hunter2"', '"DB_PASS": "[masked]"', 1],
    ['GH_PAT: abc123', 'GH_PAT: [masked]', 1],
    ['Db_Pass=hunter2', 'Db_Pass=[masked]', 1],
    ['access key is abc123def456', 'access key is [masked]', 1],
    ['redis://:p4ssw0rd@cache:6379', 'redis://:[masked]@cache:6379', 1],
    ['mariadb -u root -phunter2', 'mariadb -u root -p[masked]', 1],
    ['password\u3164hunter2', 'password [masked]', 1],
    ['pass\u3164word=s3cret', 'pass word=[masked]', 1],
    ['password: \u249c hunter2', 'password: [masked] hunter2', 1],
    ['\u24df\u24d0\u24e2\u24e2\u24e6\u24de\u24e1\u24d3=hunter2', 'password=[masked]', 1],
    ['Bearer abcdefgh', 'Bearer [masked]', 1],
    ['Bearer abc1', 'Bearer [masked]', 1],
    ['Bearer abcdefg', 'Bearer abcdefg', 0],
    ['curl -u 1000:1000 x', 'curl -u 1000:1000 x', 0],
    ['curl --user "admin":"hunter2" x', 'curl --user "admin":[masked] x', 1],
    ['Bearer ab!', 'Bearer [masked]', 1],
    ['Bearer abc', 'Bearer abc', 0],
    ['API key: abc123def456', 'API key: [masked]', 1],
    ['private key = abc123def456', 'private key = [masked]', 1],
    ['secret key -> abc123def456', 'secret key -> [masked]', 1],
    ['API key is abc123def456', 'API key is [masked]', 1],
  ])
})

describe('scrub misses the curl -u forms the README lists', () => {
  rows([
    ['curl -u "ad"min:hunter2 x', 'curl -u "ad"min:hunter2 x', 0],
    ['curl -u :hunter2 x', 'curl -u :hunter2 x', 0],
    ['curl -u "":hunter2 x', 'curl -u "":hunter2 x', 0],
    ['curl -u "":"hunter2" x', 'curl -u "":"hunter2" x', 0],
    ['curl -u "admin:hun"ter2 x', 'curl -u "admin:[masked]"ter2 x', 1],
    ['curl -u "ad:min":"pw" x', 'curl -u "ad:[masked]":"pw" x', 1],
  ])
})

describe('scrub masks a value after a space for password, passwd and passphrase, and misses it after api key, pwd, token and secret', () => {
  rows([
    ['passwd abc123def456', 'passwd [masked]', 1],
    ['passphrase abc123def456', 'passphrase [masked]', 1],
    ['api key abc123def456', 'api key abc123def456', 0],
    ['pwd abc123def456', 'pwd abc123def456', 0],
    ['token abc123def456', 'token abc123def456', 0],
    ['secret abc123def456', 'secret abc123def456', 0],
  ])
})

describe('scrub leaves a PASS or PAT value that starts with a PEM armor word', () => {
  rows([
    ['DB_PASS=-----BEGINhunter2!', 'DB_PASS=-----BEGINhunter2!', 0],
    ['DB_PASS=-----ENDhunter2!', 'DB_PASS=-----ENDhunter2!', 0],
    ['GH_PAT: -----BEGINabc', 'GH_PAT: -----BEGINabc', 0],
  ])
})

describe('scrub shows two masks for one Authorization value behind a blank filler or zero-width character', () => {
  rows([
    ['Authorization = Basic abc', 'Authorization = Basic [masked]', 1],
    ['Authorization =\u2800Basic abc', 'Authorization =[masked] [masked]', 2],
    ['Authorization =\u3164Basic abc', 'Authorization =[masked] [masked]', 2],
    ['Authorization =\u200bBasic abc', 'Authorization =[masked] [masked]', 2],
  ])
})

describe('scrub keeps an input [masked], and an input bullet only as a URL password', () => {
  rows([
    ['password=[masked]', 'password=[masked]', 0],
    ['--token=[masked]', '--token=[masked]', 0],
    ['https://u:[masked]@h', 'https://u:[masked]@h', 0],
    ['https://u:\u2022@h', 'https://u:\u2022@h', 0],
    ['password=\u2022', 'password=[masked]', 1],
    ['API_KEY=\u2022', 'API_KEY=[masked]', 1],
    ['Authorization: \u2022', 'Authorization: [masked]', 1],
  ])
})

describe('scrub keeps a private-use character inside a key name, which splits the key', () => {
  rows([
    ['pass\ue000word=hunter2', 'pass\ue000word=hunter2', 0],
    ['pass\ue000\udf89word=hunter2', 'pass\ue000word=hunter2', 0],
  ])
})

const base = (on: On) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('agent.offer', () => ({ isOffered: true }))
}

const engine = (on: On) => {
  base(on)
  return stateStore(on)
}

const pane = (bodyColumns = 64) => ({
  plugin: 'flightdeck',
  component: 'Pane' as const,
  requestId: 'flightdeck',
  surface: 'terminal' as const,
  props: { title: 'Flightdeck', isFocused: true, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 70 }, view: {} },
})

let n = 0
const spawn = (subagentType: string, description: string, name?: string) => ({
  prompt: description,
  description,
  subagentType,
  ...(name === undefined ? {} : { name }),
  tool_use_id: `cl${++n}`,
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
})

type Stored = { log: LogLine[]; agents: AgentCard[]; gate: Gate; architect: Architect; roster: { architectTypes: string[] }; hygiene: Hygiene; usage: Usage; turn: Turn }

const state = (values: Map<string, { value: unknown }>) => flightdeck(values) as Stored

describe('the names flightdeck keeps are masked and cut to 40 characters', () => {
  test("an agent's name, or its type when it has no name", async ($, on) => {
    const values = engine(on)
    let id = 0
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `nm${++id}` }))
    await $.turn.start({ text: 'go', turnId: 'N1' })
    await $.agent.spawn(spawn('general-purpose', 'one', `password=hunter2 ${'n'.repeat(60)}`))
    await $.agent.spawn(spawn(`token=abc123 ${'t'.repeat(60)}`, 'two'))
    expect(state(values).agents.map(c => c.type)).toEqual([`password=[masked] ${'n'.repeat(21)}…`, `token=[masked] ${'t'.repeat(24)}…`])
  })

  test("a consult's agent type", async ($, on) => {
    const values = engine(on)
    on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'cv1' }))
    await $.turn.start({ text: 'go', turnId: 'N2' })
    await $.agent.spawn(spawn(`plugin:architect token=abc123 ${'v'.repeat(40)}`, 'review'))
    const s = state(values)
    expect([s.architect.consults.map(c => c.via), s.hygiene.masked]).toEqual([[`architect token=[masked] ${'v'.repeat(14)}…`], 1])
  })

  test("a consult's agent type keeps a mask whose key sits before the last colon", async ($, on) => {
    const values = engine(on)
    on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'cv2' }))
    await $.turn.start({ text: 'go', turnId: 'N3' })
    await $.agent.spawn(spawn('password:hunter2architect', 'review'))
    expect(state(values).architect.consults.map(c => c.via)).toEqual(['[masked]'])
    expect(consultVia('architect:password:hunter2zz').text).toBe('[masked]')
  })

  test('an architect roster entry', async ($, on) => {
    const values = engine(on)
    await $.agent.offer({ agent: `architect-token=abc123 ${'r'.repeat(60)}`, description: 'reviews', source: 'plugin', provider: { plugin: 'engine', tier: 'core' } })
    expect(state(values).roster.architectTypes).toEqual([`architect-token=[masked] ${'r'.repeat(14)}…`])
  })
})

describe("an architect's advice", () => {
  const advise = async ($: Engine, on: On, answer: string) => {
    const values = engine(on)
    on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'av1' }))
    await $.turn.start({ text: 'go', turnId: 'V1' })
    await $.agent.spawn(spawn('architect', 'review'))
    await $.turn.complete({ answer, durationMs: 5, isAborted: false, turnId: 'V2', agentId: 'av1', reason: 'answer' })
    return state(values).architect.lastAdvice
  }

  test('keeps its first line alone', async ($, on) => {
    expect(await advise($, on, '\n## Ship it\nthen rotate password=hunter2\n')).toBe('Ship it')
  })

  test('skips a line that opens with [ or < and drops Markdown marks', async ($, on) => {
    expect(await advise($, on, '[Subagent hand-back]\n<note>\n> - **Ship** __it__ now')).toBe('Ship it now')
  })

  test('is cut to 160 characters', async ($, on) => {
    expect(await advise($, on, 'a'.repeat(300))).toBe(`${'a'.repeat(159)}…`)
  })

  test('masks a flag value at the start of the line', async ($, on) => {
    expect(await advise($, on, '--token abc12345xyz is hardcoded in deploy.sh; move it to the environment')).toBe('token [masked] is hardcoded in deploy.sh; move it to the environment')
  })

  test('masks a flag value after a bullet or a quote mark, a token split by __, and a glued PEM block', () => {
    expect(adviceLine('- --api-key MVzE-MV2n0').text).toBe('api-key [masked]')
    expect(adviceLine('> --secret abc123def456').text).toBe('secret [masked]')
    expect(adviceLine('ghp__abcdefghijkl12 leaked').text).toBe('[masked] leaked')
    expect(adviceLine('-----BEGIN PRIVATE KEY-----MIIEvQIBADANBgkqhkiG9w0BAQEFAASC-----END PRIVATE KEY-----').text).toBe('BEGIN PRIVATE KEY-----[masked]-----END PRIVATE KEY-----')
  })

  test('keeps a value whose key sits on a skipped or earlier line, since each line is masked on its own', () => {
    expect(adviceLine('[x] password:\nhunter2 rotate it').text).toBe('hunter2 rotate it')
    expect(adviceLine("[architect] PGPASSWORD='Vckb\nf2lyk'").text).toBe("f2lyk'")
  })

  test('skips a line that is only marks', async ($, on) => {
    expect(await advise($, on, '---\n**\nShip it')).toBe('Ship it')
  })
})

describe('the hooks hand on what the next handler returns', () => {
  test('tool.check, tool.call, turn.start, turn.complete and agent.spawn', async ($, on) => {
    engine(on)
    const verdict = { decision: 'ask' as const, reason: 'rule' }
    const ran = { result: { stdout: 'x', stderr: '', interrupted: false }, text: 'x', isError: true as const }
    const started = { model: 'claude-sonnet-5-5', agentId: 'pt1' }
    on('tool.check', () => verdict)
    on('tool.call', () => ran)
    on('agent.spawn', () => started)
    expect(await $.turn.start({ text: 'password=hunter2', turnId: 'P1' })).toEqual({ turnId: 'P1' })
    expect(await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'pk1' })).toEqual(verdict)
    expect(await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'pk1' })).toEqual(ran)
    expect(await $.agent.spawn(spawn('general-purpose', 'go'))).toEqual(started)
    expect(await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 'P1', reason: 'answer' })).toEqual({ text: '' })
  })
})

const fill = async ($: Engine, on: On) => {
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'fl1' }))
  on('tool.check', () => ({ decision: 'allow' }))
  await $.turn.start({ text: 'password=hunter2', turnId: 'F1' })
  await $.agent.spawn(spawn('general-purpose', 'token=abc123 go'))
  await $.tool.check({ tool: 'Read', input: { file_path: '/a/b.ts' }, tool_use_id: 'fk1' })
}

describe('the masked count adds the masks scrub() finds each time flightdeck reads text for a field it keeps', () => {
  test('an agent description counts 1: the log row title cut from the masked card adds nothing', async ($, on) => {
    const values = engine(on)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'mc1' }))
    await $.turn.start({ text: 'go', turnId: 'M1' })
    await $.agent.spawn(spawn('general-purpose', 'token=abc123 go'))
    const s = state(values)
    expect([s.agents.map(c => c.description), s.log.map(l => l.who), s.hygiene.masked]).toEqual([['token=[masked] go'], ['you', 'token=…'], 1])
  })

  test('a denied check counts 1: the gate detail, and the denial row built from it adds nothing', async ($, on) => {
    const values = engine(on)
    on('tool.check', () => ({ decision: 'deny' as const, reason: 'rule' }))
    await $.tool.check({ tool: 'Bash', input: { command: 'postgres://app:pw1234@db' }, tool_use_id: 'dk1' })
    const s = state(values)
    expect([s.gate.recent.map(c => c.detail), s.log.map(l => l.text), s.hygiene.masked]).toEqual([['Bash → app:[masked]@db'], ['denied by rule · Bash → app:[masked]@db'], 1])
  })

  test("a subagent's command counts 2: its permission check and its tool call each read it", async ($, on) => {
    const values = engine(on)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'mc2' }))
    on('tool.check', () => ({ decision: 'allow' as const }))
    on('tool.call', () => ({ result: {}, text: 'ok' }))
    await $.turn.start({ text: 'go', turnId: 'M2' })
    await $.agent.spawn(spawn('general-purpose', 'migrate'))
    await $.tool.check({ tool: 'Bash', input: { command: 'postgres://app:pw1234@db' }, tool_use_id: 'sk1' })
    await $.tool.call({ tool: 'Bash', command: 'postgres://app:pw1234@db', agentId: 'mc2', tool_use_id: 'sk1' } as never)
    const s = state(values)
    expect([s.gate.recent.map(c => c.detail), s.agents[0]?.tools.map(n => n.text), s.hygiene.masked]).toEqual([['Bash → app:[masked]@db'], ['Bash → app:[masked]@db'], 2])
  })

  test('an offered architect type counts 1, once, however often it is offered', async ($, on) => {
    const values = engine(on)
    const offer = { agent: 'architect-token=abc123', description: 'reviews', source: 'plugin' as const, provider: { plugin: 'engine', tier: 'core' as const } }
    await $.agent.offer(offer)
    await $.agent.offer(offer)
    const s = state(values)
    expect([s.roster.architectTypes, s.hygiene.masked]).toEqual([['architect-token=[masked]'], 1])
  })

  test("a main loop's call that ran counts 0: nothing of it is kept", async ($, on) => {
    const values = engine(on)
    on('tool.call', () => ({ result: {}, text: 'ok' }))
    await $.tool.call({ tool: 'Bash', command: 'postgres://app:pw1234@db', tool_use_id: 'mk2' } as never)
    const s = state(values)
    expect([s.log ?? [], s.hygiene?.masked ?? 0]).toEqual([[], 0])
  })

  test("an architect's hand-back through SubagentHandback counts its masks", async ($, on) => {
    const values = engine(on)
    on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'hb1' }))
    on('tool.call', () => ({ result: {}, text: 'ok' }))
    await $.turn.start({ text: 'go', turnId: 'M5' })
    await $.agent.spawn(spawn('architect', 'review'))
    await $.tool.call({ tool: 'SubagentHandback', message: 'rotate password=hunter2 first', agentId: 'hb1', tool_use_id: 'hb-1' } as never)
    const s = state(values)
    expect([s.architect.lastAdvice, s.hygiene.masked]).toEqual(['rotate password=[masked] first', 1])
  })

  test("an architect's advice line counts its masks", async ($, on) => {
    const values = engine(on)
    on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'mc3' }))
    await $.turn.start({ text: 'go', turnId: 'M3' })
    await $.agent.spawn(spawn('architect', 'review'))
    await $.turn.complete({ answer: 'Rotate password=hunter2 and token=abc123 now', durationMs: 5, isAborted: false, turnId: 'M4', agentId: 'mc3', reason: 'answer' })
    const s = state(values)
    expect([s.architect.lastAdvice, s.hygiene.masked]).toEqual(['Rotate password=[masked] and token=[masked] now', 2])
  })
})

test('the masked count keeps a mask the 80-character description cap cuts away', async ($, on) => {
  const values = engine(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'mk1' }))
  await $.turn.start({ text: 'go', turnId: 'K1' })
  await $.agent.spawn(spawn('general-purpose', `${'a'.repeat(79)} password=hunter2`))
  const s = state(values)
  expect([s.agents.map(c => c.description), s.hygiene.masked]).toEqual([[`${'a'.repeat(79)}…`], 1])
})

describe('what a reset empties and keeps', () => {
  test('/clear empties every text field and the masked count', async ($, on) => {
    const values = engine(on)
    await fill($, on)
    expect(state(values).hygiene.masked).toBe(1)
    await $.session.end({ reason: 'clear', sessionId: 's' } as never)
    const s = state(values)
    expect([s.log, s.agents, s.gate.recent, s.architect.lastAdvice, s.roster.architectTypes, s.hygiene.masked]).toEqual([[], [], [], '', [], 0])
  })

  test('/flightdeck reset empties the turn and the check totals, and keeps the cost, the rate limits and the compactions', async ($, on) => {
    const values = engine(on)
    const usage = { pct: 40, tokens: 400, window: 1000, costUsd: 1.5, limits: [{ kind: 'five_hour', pct: 12 }], compactions: 2, lastCompactAt: 7 }
    values.set('flightdeck/usage/', { value: usage, version: 1 })
    values.set('flightdeck/turn/', { value: { ...DEFAULT_TURN, edits: 3, errors: 2, startedAt: 5 }, version: 1 })
    values.set('flightdeck/gate/', { value: { ...DEFAULT_GATE, totals: { ...DEFAULT_GATE.totals, shell: { rule: 4, ask: 0, cleared: 1, deny: 2 } } }, version: 1 })
    await $.command.run({ command: 'flightdeck', args: 'reset' } as never)
    const s = state(values)
    expect([s.usage, s.turn, s.gate]).toEqual([{ ...usage, pct: null, tokens: null }, DEFAULT_TURN, DEFAULT_GATE])
  })

  const metas: [label: string, meta: unknown, kept: number][] = [
    ['version 2', { schemaVersion: 2 }, 0],
    ['version 3', { schemaVersion: 3 }, 1],
    ['version 4', { schemaVersion: 4 }, 0],
    ['no meta, as upstream flightdeck wrote it', undefined, 0],
    ['an empty meta', {}, 0],
    ['a meta that is not an object', 'v3', 0],
  ]
  for (const [label, meta, kept] of metas) {
    test(`session start ${kept ? 'keeps' : 'empties'} state stored under ${label}`, async ($, on) => {
      const values = engine(on)
      on('command.register', (_$, e) => ({ value: { command: e.name } }))
      on('session.start', (_$, e) => ({ cwd: e.cwd }))
      if (meta !== undefined) values.set('flightdeck/meta/', { value: meta, version: 1 })
      values.set('flightdeck/log/', { value: [{ at: 0, who: 'you', text: 'old', kind: 'info', agentId: null }], version: 1 })
      await $.session.start({ cwd: '/w', surface: null, isInteractive: false })
      expect(state(values).log.length).toBe(kept)
    })
  }
})

test('a log row built from an engine value is masked and cut to 160 characters', async ($, on) => {
  const values = engine(on)
  const messages = [{ role: 'user', text: 'hi', toolUses: [] }]
  on('session.compact', () => ({ messages } as never))
  await $.session.compact({ trigger: `password=hunter2 ${'x'.repeat(300)}`, messages } as never)
  const [row] = state(values).log
  expect(row?.text.startsWith('context compacted (password=[masked]')).toBe(true)
  expect(row?.text.length).toBe(160)
})

test("/flightdeck audit lists a card's tool notes", async ($, on) => {
  const values = engine(on)
  const logged: string[] = []
  on('ui.log', (_$, e) => {
    logged.push(e.text)
    return { value: undefined }
  })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'at1' }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.turn.start({ text: 'go', turnId: 'A1' })
  await $.agent.spawn(spawn('general-purpose', 'read it'))
  await $.tool.call({ tool: 'Read', file_path: '/d/f.ts', agentId: 'at1', tool_use_id: 'at-1' } as never)
  await $.command.run({ command: 'flightdeck', args: 'audit' } as never)
  expect(state(values).agents[0]?.tools.map(n => n.text)).toEqual(['Read → d/f.ts'])
  expect(logged.filter(row => row.startsWith('agents:'))).toEqual(['agents: 0.type 15, 0.description 7, 0.tools.0.text 13'])
})

test('with matchDescriptions, an offered type whose description matches joins the roster and spawns as a consult', { options: { matchDescriptions: true } }, async ($, on) => {
  const values = engine(on)
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'rd1' }))
  await $.agent.offer({ agent: 'reviewer-bot', description: 'the architect of plans', source: 'plugin', provider: { plugin: 'engine', tier: 'core' } })
  await $.turn.start({ text: 'go', turnId: 'R1' })
  await $.agent.spawn(spawn('reviewer-bot', 'review'))
  const s = state(values)
  expect([s.roster.architectTypes, s.architect.ids, s.agents ?? []]).toEqual([['reviewer-bot'], ['rd1'], []])
})

test('a check made inside a subagent call is marked as such, and the gate draws it dim', async ($, on) => {
  const values = engine(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'ns1' }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', async (_$, e) => {
    await $.tool.check({ tool: e.tool, input: { command: 'ls' }, tool_use_id: e.tool_use_id })
    return { result: {}, text: 'ok' }
  })
  await $.turn.start({ text: 'go', turnId: 'Z1' })
  await $.agent.spawn(spawn('general-purpose', 'list'))
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'ns1', tool_use_id: 'zk1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'zk2' } as never)
  expect(state(values).gate.recent.map(c => c.inSubagent)).toEqual([true, false])
})

test('/flightdeck audit lists the text fields under gate, architect and roster too', async ($, on) => {
  const values = engine(on)
  const logged: string[] = []
  on('ui.log', (_$, e) => {
    logged.push(e.text)
    return { value: undefined }
  })
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'au1' }))
  on('tool.check', () => ({ decision: 'allow' }))
  await $.agent.offer({ agent: 'architect', description: 'reviews', source: 'plugin', provider: { plugin: 'engine', tier: 'core' } })
  await $.turn.start({ text: 'go', turnId: 'U1' })
  await $.agent.spawn(spawn('architect', 'review'))
  await $.turn.complete({ answer: 'Ship it', durationMs: 5, isAborted: false, turnId: 'U2', agentId: 'au1', reason: 'answer' })
  await $.tool.check({ tool: 'Read', input: { file_path: '/a/b.ts' }, tool_use_id: 'uk1' })
  await $.command.run({ command: 'flightdeck', args: 'audit' } as never)
  expect(state(values).gate.recent.length).toBe(1)
  expect(logged.filter(row => /^(gate|architect|roster):/.test(row))).toEqual([
    'gate: recent.0.detail 13',
    'architect: lastAdvice 7, consults.0.via 9',
    'roster: architectTypes.0 9',
  ])
})

describe('what an expanded card and a drill-down show', () => {
  test("a card shows its agent's last 3 tool calls", async ($, on) => {
    base(on)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'tc1' }))
    on('tool.call', () => ({ result: {}, text: 'ok' }))
    await $.turn.start({ text: 'go', turnId: 'C1' })
    await $.agent.spawn(spawn('general-purpose', 'read'))
    for (const f of ['f1', 'f2', 'f3', 'f4']) await $.tool.call({ tool: 'Read', file_path: `/d/${f}.ts`, agentId: 'tc1', tool_use_id: `tc-${f}` } as never)
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'card-tc1' })
    for (const f of ['f2', 'f3', 'f4']) expect(await ui.find({ text: new RegExp(`d/${f}\\.ts`) }), f).toBeDefined()
    expect(await ui.find({ text: /d\/f1\.ts/ })).toBeUndefined()
    await ui.unmount()
  })

  test("a gate row's drill-down shows its family's last 5 checks", async ($, on) => {
    base(on)
    on('tool.check', () => ({ decision: 'allow' }))
    for (let i = 1; i <= 6; i++) await $.tool.check({ tool: 'Read', input: { file_path: `/d/g${i}.ts` }, tool_use_id: `gk${i}` })
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'gate-file' })
    for (let i = 2; i <= 6; i++) expect(await ui.find({ text: new RegExp(`d/g${i}\\.ts`) }), `g${i}`).toBeDefined()
    expect(await ui.find({ text: /d\/g1\.ts/ })).toBeUndefined()
    await ui.unmount()
  })
})
