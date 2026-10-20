import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { DEFAULT_GATE, DEFAULT_MAIN, DEFAULT_TURN, DEFAULT_USAGE, adviceLine, refuserOf, consultVia, toolDetail } from '../hooks/core'
import { scrub } from '../hooks/hygiene'
import { flightdeck, stateStoreWithoutRedraw } from './store'
import type { AgentCard, Architect, Check, Gate, Hygiene, LogLine, Main, Turn, Usage } from '../types'
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

describe('scrub misses a --pass= flag mid-line and a PowerShell variable with a braced name or +=', () => {
  rows([
    ['mysqldump --pass=S3cretPass99 db', 'mysqldump --pass=S3cretPass99 db', 0],
    ['run -pass=S3cretPass99 now', 'run -pass=S3cretPass99 now', 0],
    ['${env:API_KEY}="abc123def456"', '${env:API_KEY}="abc123def456"', 0],
    ["$env:PGPASSWORD+='hunter2x'", "$env:PGPASSWORD+='hunter2x'", 0],
  ])
})

describe('scrub leaves a bare glpat- or npm_ token, a PowerShell Set-Item and an unquoted scheme word before a value', () => {
  rows([
    ['glpat-dummyDUMMYdummy1234', 'glpat-dummyDUMMYdummy1234', 0],
    ['npm_dummyDUMMYdummyDUMMYdummy12345678', 'npm_dummyDUMMYdummyDUMMYdummy12345678', 0],
    ['Set-Item -Path env:API_KEY -Value dummySecret123', 'Set-Item -Path env:API_KEY -Value dummySecret123', 0],
    ['AUTH_HEADER=token abc123def456hunter2', 'AUTH_HEADER=token abc123def456hunter2', 0],
  ])
  test('a tool detail shows such a token when the command opens with it', () => {
    const shown = ['glpat-dummyDUMMYdummy1234 x', 'npm_dummyDUMMYdummyDUMMYdummy12345678 i'].map(command => toolDetail('Bash', { command }).text)
    expect(shown).toEqual(['Bash → glpat-dummyDUMMYdummy1234', 'Bash → npm_dummyDUMMYdummyDUMMYdummy12345678'])
  })
})

describe('scrub leaves an Azure connection string, an ApiKey, Digest or Negotiate credential, a table row, a bold label and a JWT glued after an underscore or a hyphen', () => {
  rows([
    ['DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=ZHVtbXlkdW1teQ==', 'DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=ZHVtbXlkdW1teQ==', 0],
    ['Authorization: ApiKey dummycred123456', 'Authorization: [masked] dummycred123456', 1],
    ['Authorization: Digest dummycred123456', 'Authorization: [masked] dummycred123456', 1],
    ['Authorization: Negotiate dummycred123456', 'Authorization: [masked] dummycred123456', 1],
    ['| Password | hunter2xyz |', '| Password | hunter2xyz |', 0],
    ['**Credentials**: admin:hunter2xyz', '**Credentials**: admin:hunter2xyz', 0],
    ['_eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkdW1teSJ9.c2lnZHVtbXlzaWdkdW1teQ_', '_eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkdW1teSJ9.c2lnZHVtbXlzaWdkdW1teQ_', 0],
    ['-eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkdW1teSJ9.c2lnZHVtbXlzaWdkdW1teQ-', '-eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkdW1teSJ9.c2lnZHVtbXlzaWdkdW1teQ-', 0],
  ])
})

describe('scrub shows the rest of a value after a quoted part, and the words after the first of a $(…) value', () => {
  rows([
    ["DB_PASS='hun'ter2", "DB_PASS='[masked]'ter2", 1],
    ["passphrase='correct'' horse9'", "passphrase='[masked]'' horse9'", 1],
    ['PGPASSWORD=$(printf %s hunter2)', 'PGPASSWORD=[masked] %s hunter2)', 1],
  ])
})

test('a tool named after a key shows the value passed as its command', () => {
  expect(toolDetail('mcp__secrets__set_password', { command: 'abc123def456' }).text).toBe('mcp__secrets__set_password → abc123def456')
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
  on('ui.view', () => ({ value: { deny: 'no agent holds the id' } }))
}

const engine = (on: On) => {
  base(on)
  return stateStoreWithoutRedraw(on)
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

type Stored = { log: LogLine[]; agents: AgentCard[]; gate: Gate; architect: Architect; roster: { architectTypes: string[] }; hygiene: Hygiene; usage: Usage; turn: Turn; main: Main }

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

  test('masks a key that Markdown marks wrap or split, after the marks come off', async ($, on) => {
    expect(await advise($, on, '**Password**: hunter2zz')).toBe('Password: [masked]')
    expect(adviceLine('- **DB password**: Pa55w0rd!').text).toBe('DB password: [masked]')
    expect(adviceLine('**api_key**: abc123def456').text).toBe('api_key: [masked]')
    expect(adviceLine('__token__: abc123def456').text).toBe('token: [masked]')
    expect(adviceLine('**DB_PASSWORD**=hunter2zz').text).toBe('DB_PASSWORD=[masked]')
    expect(adviceLine('The **password** is Pa55w0rd!').text).toBe('The password is [masked]')
    expect(adviceLine('pass**word=hunter2').text).toBe('password=[masked]')
    expect(adviceLine('Password**: hunter2xyz').text).toBe('Password: [masked]')
    expect(adviceLine('**Authorization**: Bearer abcdefgh123').text).toBe('Authorization: Bearer [masked]')
  })

  test('masks a key or a token that a leading mark hid, after the mark comes off', async ($, on) => {
    expect(await advise($, on, '-pass=hunter2x is the staging creds')).toBe('pass=[masked] is the staging creds')
    expect(adviceLine('>-eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkdW1teSJ9.c2lnZHVtbXlzaWdkdW1teQ is the session cookie').text).toBe('[masked] is the session cookie')
  })

  test('keeps a bold label that is not a key word, a key in single-underscore emphasis, a bold flag and a JWT after an underscore', () => {
    expect(adviceLine('**Credentials**: admin:hunter2xyz').text).toBe('Credentials: admin:hunter2xyz')
    expect(adviceLine('_Password_: hunter2xyz').text).toBe('_Password_: hunter2xyz')
    expect(adviceLine('**--token** abc123def456').text).toBe('token abc123def456')
    expect(adviceLine('_eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkdW1teSJ9.c2lnZHVtbXlzaWdkdW1teQ_ is the session cookie').text).toBe('_eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkdW1teSJ9.c2lnZHVtbXlzaWdkdW1teQ_ is the session cookie')
    expect(adviceLine('-eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJkdW1teSJ9.c2lnZHVtbXlzaWdkdW1teQ- is the session cookie').text).toBe('[masked] is the session cookie')
  })

  test('masks a bold key mid-sentence, after the marks come off', async ($, on) => {
    expect(await advise($, on, 'Set **PGPASSWORD**=Vckbf2lyk and rerun the migration')).toBe('Set PGPASSWORD=[masked] and rerun the migration')
  })

  test('drawn on a terminal or the desktop, a key that Markdown marks wrapped shows masked', async ($, on) => {
    await advise($, on, '**Password**: hunter2zz is hardcoded in config.ts')
    for (const view of [pane(64), { ...pane(80), surface: 'desktop' as const }]) {
      const ui = await $.ui.mount(view)
      expect(await ui.find({ text: /hunter2zz/ }), view.surface).toBeUndefined()
      expect(await ui.find({ text: /Password: \[masked\]/ }), view.surface).toBeDefined()
      await ui.unmount()
    }
  })
})

describe('the hooks hand on what the next handler returns', () => {
  test('tool.call, turn.start, turn.complete and agent.spawn', async ($, on) => {
    engine(on)
    const ran = { result: { stdout: 'x', stderr: '', interrupted: false }, text: 'x', isError: true as const }
    const started = { model: 'claude-sonnet-5-5', agentId: 'pt1' }
    on('tool.call', () => ran)
    on('agent.spawn', () => started)
    expect(await $.turn.start({ text: 'password=hunter2', turnId: 'P1' })).toEqual({ turnId: 'P1' })
    expect(await $.tool.call({ tool: 'Bash', command: 'ls', tool_use_id: 'pk1' })).toEqual(ran)
    expect(await $.agent.spawn(spawn('general-purpose', 'go'))).toEqual(started)
    expect(await $.turn.complete({ answer: 'done', durationMs: 5, isAborted: false, turnId: 'P1', reason: 'answer' })).toEqual({ text: '' })
  })
})

type CheckVerdict = Awaited<ReturnType<Engine['tool']['check']>>

const PUSH = 'git push origin main'

const gateEngine = (on: On) => {
  const values = engine(on)
  const core: { verdict: CheckVerdict } = { verdict: { decision: 'ask' } }
  on('tool.check', () => core.verdict)
  on('tool.call', () => ({ result: `Error: ${PERSON_NO}`, text: PERSON_NO, isError: true }) as never)
  return { values, core }
}

let callN = 0
const refuse = async ($: Engine, command = PUSH, agentId?: string) => {
  const id = `rf${++callN}`
  await $.tool.check({ tool: 'Bash', input: { command }, tool_use_id: id, ...(agentId ? { agentId } : {}) })
  await $.tool.call({ tool: 'Bash', command, tool_use_id: id, ...(agentId ? { agentId } : {}) } as never)
  return id
}

const pressDenied = async ($: Engine, key: string) => {
  const ui = await $.ui.mount(pane())
  if (!(await ui.find({ key: 'gate-denied', text: /▾/ }))) {
    await ui.press({ key: 'gate-denied' })
    await ui.redraw()
  }
  await ui.press({ key })
  await ui.unmount()
}

const ask = ($: Engine, command = PUSH, ceiling?: 'ask') => $.tool.check({ tool: 'Bash', input: { command }, tool_use_id: `q${++callN}`, ...(ceiling ? { ceiling } : {}) })

describe("flightdeck's tool.check answer", () => {
  test('is unchanged when no grant matches', async ($, on) => {
    gateEngine(on)
    await refuse($)
    expect(await ask($)).toEqual({ decision: 'ask' })
  })

  const denies: [label: string, verdict: CheckVerdict][] = [
    ['a deny with no rule', { decision: 'deny', reason: 'refused' }],
    ['a deny from a settings rule', { decision: 'deny', rule: `Bash(${PUSH})` }],
    ['a deny from a hook', { decision: 'deny', hook: 'PreToolUse' }],
  ]
  const nonPlain: [label: string, verdict: CheckVerdict][] = [
    ['an ask from a settings rule', { decision: 'ask', rule: 'Bash(git push:*)' }],
    ['an ask under a hook', { decision: 'ask', hook: 'PreToolUse' }],
    ["an ask from an option's own check", { decision: 'ask', setting: 'permissions.blockReadsOutsideWorkingDirectories' }],
    ['an ask a hook puts to the person', { decision: 'ask', decider: 'person' }],
    ['an ask under an organization ceiling', { decision: 'ask', ceiling: 'ask' }],
  ]
  for (const [label, verdict] of [...denies, ...nonPlain]) {
    test(`is unchanged for ${label}, though you approved that exact call`, async ($, on) => {
      const { core } = gateEngine(on)
        const id = await refuse($)
      await pressDenied($, `ok-${id}`)
      core.verdict = verdict
      // The engine pins a ceiling to the question's own: the call carries it.
      expect(await ask($, PUSH, verdict.ceiling === 'ask' ? 'ask' : undefined)).toEqual(verdict)
    })
  }

  test('is allow for a plain ask of the exact call you approved, and ask again for one character more', async ($, on) => {
    const { values } = gateEngine(on)
    const id = await refuse($)
    await pressDenied($, `ok-${id}`)
    expect((await ask($)).decision).toBe('allow')
    expect(await ask($, `${PUSH} --force`)).toEqual({ decision: 'ask' })
    expect(state(values).gate.grants.map(g => [g.denialId, g.uses])).toEqual([[id, 1]])
  })

  test('is unchanged in plan mode, though you approved that exact call', async ($, on) => {
    const { values } = gateEngine(on)
    const id = await refuse($)
    await pressDenied($, `ok-${id}`)
    values.set('flightdeck/main/', { value: { ...DEFAULT_MAIN, mode: 'plan' }, version: 9 })
    expect(await ask($)).toEqual({ decision: 'ask' })
  })

  test('no grant exists without a press: a refused call asked again stays an ask', async ($, on) => {
    const { values } = gateEngine(on)
    await refuse($)
    await refuse($)
    expect(await ask($)).toEqual({ decision: 'ask' })
    expect(state(values).gate.grants).toEqual([])
  })

  test('x forgets every approval; the refusal can be approved again', async ($, on) => {
    const { values } = gateEngine(on)
    const id = await refuse($)
    await pressDenied($, `ok-${id}`)
    await pressDenied($, 'gate-forget')
    expect([state(values).gate.grants, await ask($)]).toEqual([[], { decision: 'ask' }])
    await pressDenied($, `ok-${id}`)
    expect((await ask($)).decision).toBe('allow')
  })

  test('a press the gate refuses leaves no grant in memory either, so nothing is allowed that the pane does not show', async ($, on) => {
    const { values } = gateEngine(on)
    const id = await refuse($)
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'gate-denied' })
    await ui.redraw()
    expect(await ui.find({ key: `ok-${id}` })).toBeDefined()
    const stored = values.get('flightdeck/gate/') as { value: Gate; version: number }
    values.set('flightdeck/gate/', { value: { ...stored.value, recent: [] }, version: stored.version + 1 })
    await ui.press({ key: `ok-${id}` })
    await ui.unmount()
    expect([state(values).gate.grants, await ask($)]).toEqual([[], { decision: 'ask' }])
    expect(state(values).log.map(l => l.text).at(-1)).toBe('not approvable now · Bash → git')
  })

  const ends: [label: string, end: ($: Engine) => Promise<unknown>][] = [
    ['session.start', $ => $.session.start({ cwd: '/w', surface: null, isInteractive: false })],
    ['/flightdeck reset', $ => $.command.run({ command: 'flightdeck', args: 'reset' } as never)],
    ...(['clear', 'resume', 'logout', 'prompt_input_exit', 'other'] as const).map(
      (reason): [string, ($: Engine) => Promise<unknown>] => [`session.end (${reason})`, $ => $.session.end({ reason, sessionId: 's' } as never)],
    ),
  ]
  for (const [label, end] of ends) {
    test(`after ${label} no grant is left, in state or in memory`, async ($, on) => {
      const { values } = gateEngine(on)
      on('command.register', (_$, e) => ({ value: { command: e.name } }))
      on('session.start', (_$, e) => ({ cwd: e.cwd }))
        const id = await refuse($)
      await pressDenied($, `ok-${id}`)
      await end($)
      expect([state(values).gate.grants, await ask($)]).toEqual([[], { decision: 'ask' }])
    })
  }
})

describe('a retry', () => {
  test('of a main-loop refusal submits one fixed prompt, and a second press sends nothing', async ($, on) => {
    gateEngine(on)
    const sent: string[] = []
    on('prompt.submit', (_$, e) => {
      sent.push(e.text)
      return { text: e.text }
    })
    const id = await refuse($)
    await pressDenied($, `ok-${id}`)
    const ui = await $.ui.mount(pane())
    await Promise.all([ui.press({ key: `re-${id}` }), ui.press({ key: `re-${id}` }).catch(() => undefined)])
    await ui.unmount()
    await pressDenied($, `re-${id}`).catch(() => undefined)
    expect(sent).toEqual(['flightdeck: the person approved Bash → git for this session after it was refused. If that call is still needed, make it again now, unchanged.'])
  })

  test("of a finished subagent's refusal messages that agent, which resumes it", async ($, on) => {
    const { values } = gateEngine(on)
    const sent: { to: unknown; text: string }[] = []
    on('agent.list', () => ({ value: [{ id: 'ra1', description: 'go', type: 'general-purpose', status: 'completed' }] }) as never)
    on('session.send', (_$, e) => {
      sent.push({ to: e.to, text: e.text })
      return { isDelivered: true }
    })
    const id = await refuse($, PUSH, 'ra1')
    await pressDenied($, `ok-${id}`)
    await pressDenied($, `re-${id}`)
    expect(sent.map(m => m.to)).toEqual(['ra1'])
    expect(state(values).log.map(l => l.text).at(-1)).toBe('retry resumes agent · Bash → git')
  })
})

const retryShown = async ($: Engine, id: string) => {
  const ui = await $.ui.mount(pane())
  if (!(await ui.find({ key: 'gate-denied', text: /▾/ }))) await ui.press({ key: 'gate-denied' })
  await ui.redraw()
  const has = Boolean(await ui.find({ key: `re-${id}` }))
  await ui.unmount()
  return has
}

describe('a retry that is not delivered', () => {
  test('to the main loop is unmarked and logged, so a second press submits again', async ($, on) => {
    const { values } = gateEngine(on)
    const sent: string[] = []
    on('prompt.submit', (_$, e) => {
      sent.push(e.text)
      if (sent.length === 1) throw new Error('queue full')
      return { text: e.text }
    })
    const id = await refuse($)
    await pressDenied($, `ok-${id}`)
    await pressDenied($, `re-${id}`)
    const lastLog = () => state(values).log.map(l => l.text).at(-1)
    for (let i = 0; i < 200 && !lastLog()?.startsWith('retry not delivered'); i++) await Promise.resolve()
    expect(lastLog()).toBe('retry not delivered, press again · Bash → git')
    expect(await retryShown($, id)).toBe(true)
    await pressDenied($, `re-${id}`)
    expect([sent.length, await retryShown($, id)]).toEqual([2, false])
  })

  test('to a subagent is unmarked and logged with the reason', async ($, on) => {
    const { values } = gateEngine(on)
    on('agent.list', () => ({ value: [{ id: 'ra1', description: 'go', type: 'general-purpose', status: 'running' }] }) as never)
    on('session.send', () => ({ isDelivered: false, reason: 'recipient gone' }))
    const id = await refuse($, PUSH, 'ra1')
    await pressDenied($, `ok-${id}`)
    await pressDenied($, `re-${id}`)
    expect(state(values).log.map(l => l.text).at(-1)).toBe('retry not delivered, press again · recipient gone')
    expect(state(values).gate.recent.find(c => c.id === id)).toMatchObject({ retriedAt: null })
    expect(await retryShown($, id)).toBe(true)
  })
})

const PERSON_NO =
  "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed."
const DONT_ASK = "Permission to use Bash has been denied because Claude Code is running in don't ask mode."

describe('refuserOf reads who refused a call, or null when it ran', () => {
  const cases: [label: string, tool: string, result: Parameters<typeof refuserOf>[1], expected: ReturnType<typeof refuserOf>][] = [
    ["a hook's deny", 'Bash', { deny: 'refused' }, 'hook'],
    ["dontAsk mode's error", 'Bash', { text: DONT_ASK, isError: true }, 'dontAsk'],
    ["a person's No", 'Bash', { text: PERSON_NO, isError: true }, 'person'],
    ["a person's No sentence on a result that is not an error", 'Bash', { text: PERSON_NO, isError: false }, null],
    ['the shorter engine sentence', 'Write', { text: 'Permission to use Write denied.', isError: true }, 'dontAsk'],
    ['the engine sentence naming another tool', 'Write', { text: 'Permission to use Bash denied.', isError: true }, null],
    ['an MCP error that opens with the sentence for another tool', 'mcp__s__t', { text: 'Permission to use OtherTool denied. Ask again.', isError: true }, null],
    ['a tool whose name the sentence only starts with', 'Bash', { text: 'Permission to use BashX has been denied', isError: true }, null],
    ['a command that ran and failed', 'Bash', { text: 'Exit code 1\nls: x: No such file or directory', isError: true }, null],
    ['the sentence on a result that is not an error', 'Bash', { text: DONT_ASK }, null],
    ['the sentence quoted inside other output', 'Bash', { text: `Exit code 1\n${DONT_ASK}`, isError: true }, null],
    ['an error with no text', 'Bash', { isError: true }, null],
  ]
  for (const [label, tool, result, expected] of cases) test(label, () => expect(refuserOf(tool, result)).toBe(expected))
})

const askEngine = (on: On, ran: () => unknown) => {
  const values = engine(on)
  on('tool.check', () => ({ decision: 'ask' as const }))
  on('tool.call', () => ran() as never)
  return values
}

const startCallWithoutAwait = async ($: Engine, id: string, agentId?: string) => {
  const who = agentId ? { agentId } : {}
  await $.tool.check({ tool: 'Bash', input: { command: PUSH }, tool_use_id: id, ...who })
  return { pendingCall: $.tool.call({ tool: 'Bash', command: PUSH, tool_use_id: id, ...who } as never) }
}

const turnEnd = ($: Engine, agentId?: string) =>
  $.turn.complete({ answer: '', durationMs: 5, isAborted: true, turnId: `te${++callN}`, reason: 'aborted', ...(agentId ? { agentId } : {}) } as never)

const deniedKeys = async ($: Engine) => {
  const ui = await $.ui.mount(pane())
  await ui.press({ key: 'gate-denied' })
  await ui.redraw()
  const keys = await Promise.all(['ok-n1', 'ok-n2', 'ok-d1', 'ok-f1', 'ok-p1'].map(async k => ((await ui.find({ key: k })) ? k : null)))
  await ui.unmount()
  return keys.filter(k => k !== null)
}

describe('an ask settles as refused', () => {
  test('when its loop ends with the call unanswered; approved, the same plain ask is allowed', async ($, on) => {
    const values = askEngine(on, () => new Promise(() => undefined))
    await startCallWithoutAwait($, 'n1')
    await turnEnd($)
    expect(state(values).gate.recent.map(c => [c.id, c.verdict])).toEqual([['n1', 'deny']])
    expect(await deniedKeys($)).toEqual(['ok-n1'])
    await pressDenied($, 'ok-n1')
    const again = await $.tool.check({ tool: 'Bash', input: { command: PUSH }, tool_use_id: 'n9' })
    expect(again.decision).toBe('allow')
  })

  test("when dontAsk mode answers with the engine's refusal", async ($, on) => {
    const values = askEngine(on, () => ({ result: `Error: ${DONT_ASK}`, text: DONT_ASK, isError: true }))
    await (await startCallWithoutAwait($, 'd1')).pendingCall
    expect(state(values).gate.recent.map(c => [c.id, c.verdict])).toEqual([['d1', 'deny']])
    expect(await deniedKeys($)).toEqual(['ok-d1'])
  })

  test("when a person's No answers the call, with no turn.complete", async ($, on) => {
    const values = askEngine(on, () => ({ result: `Error: ${PERSON_NO}`, text: PERSON_NO, isError: true }))
    await (await startCallWithoutAwait($, 'p1')).pendingCall
    expect(state(values).gate.recent.map(c => [c.id, c.verdict])).toEqual([['p1', 'deny']])
    expect(await deniedKeys($)).toEqual(['ok-p1'])
  })

  test("when a hook denies the call as it is made: blocked, labelled, with nothing to approve", async ($, on) => {
    const values = askEngine(on, () => ({ deny: 'refused' }))
    await (await startCallWithoutAwait($, 'h1')).pendingCall
    const c = state(values).gate.recent[0] as Extract<Check, { by: 'refused' }>
    expect([c.verdict, c.refuser, c.approvable]).toEqual(['deny', 'hook', false])
    const ui = await $.ui.mount(pane())
    await ui.press({ key: 'gate-denied' })
    await ui.redraw()
    expect(await ui.find({ text: /^refused · hook $/ })).toBeDefined()
    expect(await ui.find({ key: 'ok-h1' })).toBeUndefined()
    await ui.unmount()
  })

  test("never for an MCP tool's error that names another tool's refusal: it ran, and is cleared", async ($, on) => {
    const values = askEngine(on, () => ({ result: 'x', text: 'Permission to use OtherTool denied.', isError: true }))
    await $.tool.check({ tool: 'mcp__s__t', input: { q: 1 }, tool_use_id: 'm1' } as never)
    await $.tool.call({ tool: 'mcp__s__t', q: 1, tool_use_id: 'm1' } as never)
    expect(state(values).gate.recent.map(c => [c.id, c.verdict])).toEqual([['m1', 'cleared']])
  })

  test('never for a call that ran and failed: it is cleared and stays out of the denied list', async ($, on) => {
    const values = askEngine(on, () => ({ result: { stdout: '', stderr: 'ls: x', interrupted: false }, text: 'Exit code 1\nls: x: No such file or directory', isError: true }))
    await (await startCallWithoutAwait($, 'f1')).pendingCall
    await turnEnd($)
    expect(state(values).gate.recent.map(c => [c.id, c.verdict])).toEqual([['f1', 'cleared']])
    expect(await deniedKeys($)).toEqual([])
  })

  test("never by another loop's end: agent A ending leaves agent B's ask open", async ($, on) => {
    const values = askEngine(on, () => new Promise(() => undefined))
    await startCallWithoutAwait($, 'n1', 'agA')
    await startCallWithoutAwait($, 'n2', 'agB')
    await turnEnd($, 'agA')
    await turnEnd($)
    expect(state(values).gate.recent.map(c => [c.id, c.verdict])).toEqual([
      ['n1', 'deny'],
      ['n2', 'ask'],
    ])
    await turnEnd($, 'agB')
    await turnEnd($, 'agB')
    expect(state(values).gate.totals.shell).toMatchObject({ ask: 0, deny: 2 })
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
    on('tool.check', () => ({ decision: 'deny' as const, reason: 'rule', rule: 'Bash(curl:*)' }))
    await $.tool.check({ tool: 'Bash', input: { command: 'AKIAABCDEFGHIJKLMNOP' }, tool_use_id: 'dk1' })
    const s = state(values)
    expect([s.gate.recent.map(c => c.detail), s.log.map(l => l.text), s.hygiene.masked]).toEqual([['Bash → [masked]'], ['denied by rule · Bash → [masked]'], 1])
  })

  test("a subagent's command counts 2: its permission check and its tool call each read it", async ($, on) => {
    const values = engine(on)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'mc2' }))
    on('tool.check', () => ({ decision: 'allow' as const }))
    on('tool.call', () => ({ result: {}, text: 'ok' }))
    await $.turn.start({ text: 'go', turnId: 'M2' })
    await $.agent.spawn(spawn('general-purpose', 'migrate'))
    await $.tool.check({ tool: 'Bash', input: { command: 'AKIAABCDEFGHIJKLMNOP' }, tool_use_id: 'sk1' })
    await $.tool.call({ tool: 'Bash', command: 'AKIAABCDEFGHIJKLMNOP', agentId: 'mc2', tool_use_id: 'sk1' } as never)
    const s = state(values)
    expect([s.gate.recent.map(c => c.detail), s.agents[0]?.tools.map(n => n.text), s.hygiene.masked]).toEqual([['Bash → [masked]'], ['Bash → [masked]'], 2])
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

  test("an architect's hand-back counts the mask found once its Markdown marks come off", async ($, on) => {
    const values = engine(on)
    on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'hb2' }))
    on('tool.call', () => ({ result: {}, text: 'ok' }))
    await $.turn.start({ text: 'go', turnId: 'M6' })
    await $.agent.spawn(spawn('architect', 'review'))
    await $.tool.call({ tool: 'SubagentHandback', message: '**Password**: hunter2zz', agentId: 'hb2', tool_use_id: 'hb-2' } as never)
    const s = state(values)
    expect([s.architect.lastAdvice, s.hygiene.masked]).toEqual(['Password: [masked]', 1])
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
    values.set('flightdeck/main/', { value: { ...DEFAULT_MAIN, model: 'claude-opus-5-5', mode: 'plan' }, version: 1 })
    values.set('flightdeck/turn/', { value: { ...DEFAULT_TURN, edits: 3, errors: 2, startedAt: 5 }, version: 1 })
    values.set('flightdeck/gate/', { value: { ...DEFAULT_GATE, totals: { ...DEFAULT_GATE.totals, shell: { rule: 4, granted: 0, ask: 0, cleared: 1, deny: 2 } } }, version: 1 })
    await $.command.run({ command: 'flightdeck', args: 'reset' } as never)
    const s = state(values)
    expect([s.usage, s.turn, s.gate]).toEqual([{ ...usage, pct: null, tokens: null }, DEFAULT_TURN, DEFAULT_GATE])
    expect([s.main.model, s.main.mode]).toEqual(['claude-opus-5-5', 'plan'])
  })

  test('session start on a foreign schema empties the model, mode and rate limits too', async ($, on) => {
    const values = engine(on)
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    values.set('flightdeck/main/', { value: { model: 'UPSTREAM-MODEL-zz9', mode: 'UPSTREAM-MODE-zz9', effort: 'UPSTREAM-EFFORT', steps: 4, isRunning: true }, version: 1 })
    values.set('flightdeck/usage/', { value: { pct: 50, tokens: 9, window: 1000, costUsd: 2, limits: [{ kind: 'UPSTREAM-LIMIT-zz9', pct: 3 }], compactions: 1, lastCompactAt: 5 }, version: 1 })
    await $.session.start({ cwd: '/w', surface: null, isInteractive: false })
    const s = state(values)
    expect([s.main, s.usage]).toEqual([DEFAULT_MAIN, DEFAULT_USAGE])
    const ui = await $.ui.mount(pane(64))
    expect(await ui.find({ text: /UPSTREAM/ })).toBeUndefined()
    await ui.unmount()
  })

  const metas: [label: string, meta: unknown, kept: number][] = [
    ['version 2', { schemaVersion: 2 }, 0],
    ['version 3', { schemaVersion: 3 }, 0],
    ['version 4', { schemaVersion: 4 }, 1],
    ['version 5', { schemaVersion: 5 }, 0],
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

test("a check keeps the loop its tool.check names: the subagent's id, or null for the main loop", async ($, on) => {
  const values = engine(on)
  on('tool.check', () => ({ decision: 'allow' as const }))
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'zk1', agentId: 'ns1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'ls' }, tool_use_id: 'zk2' })
  expect(state(values).gate.recent.map(c => c.agentId)).toEqual(['ns1', null])
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
