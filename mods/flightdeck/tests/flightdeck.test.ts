import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import {
  DEFAULT_ARCHITECT,
  DEFAULT_GATE,
  DEFAULT_TURN,
  afterCall,
  applyStep,
  consultTimeline,
  endConsult,
  fitLegend,
  gateSummary,
  lanes,
  limitLabel,
  logRows,
  momentOf,
  normalizeCard,
  normalizeGate,
  normalizeLog,
  titleLines,
  parseConfig,
  prettyModel,
  promptLine,
  handbackOf,
  adviceLine,
  receiptOf,
  recordCheck,
  settleCheck,
  trimRecent,
  startConsult,
  toolDetail,
} from '../hooks/core'
import type { Check, LogLine } from '../types'
import { scrub } from '../hooks/hygiene'
import { flightdeck, leaves, stateStore } from './store'
import type { Engine } from './store'

// ---------------------------------------------------------------- pure behaviour

test('a Bash or PowerShell detail shows the program of a simple command: plain NAME=value words, then a plain word', () => {
  expect(toolDetail('Bash', { command: 'curl -u admin:s3cr3t https://h.example/x?sig=abc' })).toEqual({ text: 'Bash → curl', masked: 0 })
  expect(toolDetail('Bash', { command: '  /usr/local/bin/psql postgres://bob:hunter2@db/x' }).text).toBe('Bash → psql')
  expect(toolDetail('Bash', { command: 'DB_HOST=db.local PORT=5432 ./deploy.sh --go' }).text).toBe('Bash → deploy.sh')
  expect(toolDetail('Bash', { command: 'export OPENAI_API_KEY=sk-proj-1234567890abcdef' }).text).toBe('Bash → export')
  expect(toolDetail('Bash', { command: 'PGPASSWORD=hunter2 psql -h db' })).toEqual({ text: 'Bash → psql', masked: 0 })
  expect(toolDetail('Bash', { command: 'echo $((1+2)) x' }).text).toBe('Bash → echo')
  expect(toolDetail('Bash', { command: 'git\tstatus' }).text).toBe('Bash → git')
  expect(toolDetail('Bash', { command: 'make' }).text).toBe('Bash → make')
  expect(toolDetail('Bash', { command: 'AKIAABCDEFGHIJKLMNOP x' })).toEqual({ text: 'Bash → [masked]', masked: 1 })
  expect(toolDetail('PowerShell', { command: 'Get-ChildItem -Recurse' }).text).toBe('PowerShell → Get-ChildItem')
})

test('a Bash or PowerShell detail shows the tool name alone for any command outside the simple form', () => {
  const failClosed = [
    ['Bash', 'PGPASSWORD=$(echo "a) hunter2xyz") psql'],
    ['Bash', "PGPASSWORD=$(echo 'Pa)ss w0rdxyz') psql"],
    ['Bash', "PGPASSWORD=$(printf %s $(printf pre\\)) 'correct horse9') psql"],
    ['Bash', 'PGPASSWORD=$(echo \\) hunter2zz) psql'],
    ['Bash', 'PGPASSWORD+=hunter2zz psql'],
    ['Bash', 'X=$(case $k in a) hunter2zz;; esac) psql'],
    ['Bash', 'PGPASSWORD=`printf %s \\`echo hunter2x\\`` psql'],
    ['Bash', 'PGPASSWORD="`echo "hunter 2x"`" psql'],
    ['Bash', 'PGPASSWORD=$(printf %s $(printf pre) hunter2) psql'],
    ['Bash', 'PGPASSWORD=$(echo hunter2) psql -h db'],
    ['Bash', 'TOKEN=`echo abc123def456` ./deploy'],
    ['Bash', 'PGPASSWORD="correct horse battery staple" psql -h db'],
    ['Bash', "API_KEY='Winter 2024!' mysql -u root"],
    ['Bash', 'DB_PASS=hunter2 GITHUB_TOKEN=abc "/opt/tool/run" --go'],
    ['Bash', 'API_KEY=(abc123def456) run'],
    ['Bash', 'A=x{hunter2} run'],
    ['Bash', 'A=x\u00a0hunter2 psql'],
    ['Bash', 'A=1;hunter2 psql'],
    ['Bash', 'A=1\nhunter2 psql'],
    ['Bash', 'pass"word=hunter2"'],
    ['Bash', 'p\\assword=hunter2 x'],
    ['Bash', 'run\\ me.sh --token abc12345'],
    ['Bash', "'/opt/my tool/run' --go"],
    ['Bash', '$(echo hunter2) deploy'],
    ['Bash', 'foo(bar) baz'],
    ['Bash', 'hunter2;ls'],
    ['Bash', '--token=abc/def123'],
    ['Bash', 'postgres://app:S3cr/et@db'],
    ['Bash', 'AWS_SECRET_ACCESS_KEY=notARealKey/exampleOnly+fakeValue00000000'],
    ['PowerShell', "${env:PGPASSWORD}='hunter2zz'; psql -h db"],
    ['PowerShell', '${env:DB_PASS}="S3cretPass99"; ./deploy'],
    ['PowerShell', "$env:PGPASSWORD+='hunter2'; psql"],
    ['PowerShell', "$env:PGPASSWORD=(Write-Output 'hunter2'); psql"],
    ['PowerShell', "$env:TOKEN='abc123def456'; gh pr list"],
    ['PowerShell', "$cred='hunter2xyz'; psql"],
    ['PowerShell', "[Environment]::SetEnvironmentVariable('API_KEY','abc123def456')"],
    ['PowerShell', '& "C:\\Program Files\\tool.exe" --go'],
  ] as const
  expect(failClosed.map(([tool, command]) => toolDetail(tool, { command }))).toEqual(failClosed.map(([tool]) => ({ text: tool, masked: 0 })))
})

test('an assignment value that reads as running on into the next word ends the search', () => {
  for (const command of ['password= hunter2 run', 'PASSWORD=is hunter2 run', 'PASSWORD=-- hunter2 run', 'X=--secret= abc123xyz run', 'X=key: abc123xyz run', 'X=--password abc123xyz run', 'Authorization=Basic xyz987 curl', 'AUTH=Bearer abc123def456ghi curl x', 'X=bearer abcdefgh12345678 ./run', 'HTTP_AUTHORIZATION=Basic abc123 curl'])
    expect(toolDetail('Bash', { command }).text).toBe('Bash')
})

test('an assignment whose name ends in Authorization ends the search', () => {
  expect(toolDetail('Bash', { command: 'X_AUTHORIZATION=token abc123def curl x' }).text).toBe('Bash')
})

test('a tool detail with a long tool name is cut to 64 characters in all', () => {
  const shown = toolDetail('mcp__deploy_server__run_command', { command: 'x'.repeat(100) }).text
  expect([shown.length, shown.startsWith('mcp__deploy_server__run_command → x'), shown.endsWith('…')]).toEqual([64, true, true])
})

test('a file tool detail keeps the last two path segments and drops the pattern', () => {
  expect(toolDetail('Read', { file_path: 'C:\\Users\\me\\proj\\src\\main.ts' }).text).toBe('Read → src/main.ts')
  expect(toolDetail('Read', { file_path: '/home/me/password=hunter2/notes.txt' }).text).toBe('Read → me/password=[masked]')
  expect(toolDetail('Grep', { pattern: 'password=hunter2', path: '/repo/src/auth' }).text).toBe('Grep → src/auth')
  expect(toolDetail('Grep', { pattern: 'AKIAABCDEFGHIJKLMNOP' }).text).toBe('Grep')
  expect(toolDetail('Grep', { path: '/repo/postgres://u:pw@h/db' }).text).toBe('Grep → u:[masked]@h/db')
  expect(toolDetail('Read', { file_path: 'https://u:hunter2zz@h.example/a' }).text).toBe('Read → u:[masked]@h.example/a')
  expect(toolDetail('Grep', { path: '/repo/Authorization: Bearer fakeTokenForTests/notReal/000000000000000' }).text).toBe('Grep → repo/Authorization: Bearer [masked]')
  expect(toolDetail('Grep', { path: '/repo/db_password=\\"XqObGXO7f\\"' }).text).toBe('Grep → repo/db_password=[masked]')
  expect(toolDetail('Read', { file_path: '/a/password=hun/ter2/y' }).text).toBe('Read → a/password=[masked]')
  expect(toolDetail('Grep', { path: '/repo/gh --token abc12345/x/y' }).text).toBe('Grep → repo/gh --token [masked]')
  expect(toolDetail('Read', { file_path: '/Users/me/My Project/src/main.ts' }).text).toBe('Read → src/main.ts')
})

test('a URL tool detail keeps the host alone', () => {
  expect(toolDetail('WebFetch', { url: 'https://bob:hunter2@docs.example.com:8443/a/b?token=abc#frag', prompt: 'summarise' }).text).toBe('WebFetch → docs.example.com')
  expect(toolDetail('WebFetch', { url: 'not a url' }).text).toBe('WebFetch')
  expect(toolDetail('WebFetch', { url: 'https://API_KEY=`P@ssw0rd`' }).text).toBe('WebFetch')
  expect(toolDetail('WebFetch', { url: 'https://MY_SECRET="Qa:p@user--QbPWD' }).text).toBe('WebFetch')
  expect(toolDetail('WebFetch', { url: 'https://export NPM_TOKEN=TR!bh@wmZgIO.' }).text).toBe('WebFetch')
  expect(toolDetail('WebFetch', { url: 'https://user%40x.com:pw@host.example/a' }).text).toBe('WebFetch')
  expect(toolDetail('WebFetch', { url: 'https://[::1]:8080/x' }).text).toBe('WebFetch → [::1]')
  expect(toolDetail('WebFetch', { url: 'https://--secret:@api.x.com/v1' }).text).toBe('WebFetch → api.x.com')
  expect(toolDetail('WebFetch', { url: 'https://AKIAABCDEFGHIJKLMNOP.example.com/x' }).text).toBe('WebFetch → [masked].example.com')
  expect(toolDetail('WebFetch', { url: 'https://Docs.Example.COM/x' }).text).toBe('WebFetch → Docs.Example.COM')
  expect(toolDetail('WebFetch', { url: 'https://Bearer\tP@ssw0rd.example/x' }).text).toBe('WebFetch')
  expect(toolDetail('WebFetch', { url: 'https://docs.example.com/a\nb' }).text).toBe('WebFetch')
  expect(toolDetail('WebFetch', { url: 'https://docs.example.com/a\rb' }).text).toBe('WebFetch')
  expect(toolDetail('WebSearch', { query: 'my password is hunter2' }).text).toBe('WebSearch')
})

const check = (id: string, verdict: Check['verdict'], bucket: Check['bucket'] = 'shell'): Check => ({
  id,
  bucket,
  verdict,
  inSubagent: false,
  detail: toolDetail('Bash', { command: 'ls' }).text,
  at: 1,
})

test('an ask is settled by the call that follows: cleared if it ran, deny if refused', () => {
  let g = recordCheck(DEFAULT_GATE, check('a', 'ask'))
  g = recordCheck(g, check('b', 'ask'))
  g = recordCheck(g, check('c', 'rule', 'file'))
  g = settleCheck(g, 'a', true)
  g = settleCheck(g, 'b', false)
  g = settleCheck(g, 'zzz', true) // not an ask: unchanged
  const s = gateSummary(g)
  expect([s.rule, s.ask, s.cleared, s.deny, s.total]).toEqual([1, 0, 1, 1, 3])
  expect(g.recent.map(c => c.verdict)).toEqual(['cleared', 'deny', 'rule'])
})

test('the gate tallies a mixed run of verdicts per family', () => {
  let g = DEFAULT_GATE
  g = recordCheck(g, check('r1', 'rule', 'file'))
  g = recordCheck(g, check('a1', 'ask', 'shell'))
  g = recordCheck(g, check('a2', 'ask', 'shell'))
  g = recordCheck(g, check('d1', 'deny', 'other'))
  g = settleCheck(g, 'a1', true)
  g = settleCheck(g, 'a2', false)
  expect(g.totals.file).toEqual({ rule: 1, ask: 0, cleared: 0, deny: 0 })
  expect(g.totals.shell).toEqual({ rule: 0, ask: 0, cleared: 1, deny: 1 })
  expect(g.totals.other.deny).toBe(1)
  expect(gateSummary(g)).toEqual({ rule: 1, ask: 0, cleared: 1, deny: 2, total: 4 })
  expect(gateSummary(DEFAULT_GATE).total).toBe(0)
})

test('a v1-shaped gate reads as empty, then records normally', () => {
  const g = normalizeGate({ file: { allow: 3, ask: 1, deny: 0, cleared: 2 }, shell: null })
  expect(gateSummary(g).total).toBe(0)
  const next = recordCheck(g, check('n1', 'rule', 'file'))
  expect(next.totals.file.rule).toBe(1)
  expect(next.recent.length).toBe(1)
})

test('a pending ask is never trimmed out before it settles', () => {
  let g = recordCheck(DEFAULT_GATE, check('old-ask', 'ask'))
  for (let i = 0; i < 120; i += 1) g = recordCheck(g, check(`r${i}`, 'rule', 'file'))
  expect(g.recent.length).toBe(80)
  expect(g.recent.some(c => c.id === 'old-ask')).toBe(true)
  g = settleCheck(g, 'old-ask', true)
  expect(gateSummary(g).ask).toBe(0)
  expect(trimRecent([check('a', 'rule'), check('b', 'rule')], 5).length).toBe(2)
})

test('edits count from every loop; errors only from the main loop', () => {
  const t = { ...DEFAULT_TURN, errorStreak: 1 }
  expect(afterCall(t, { inSubagent: true, hasFailed: false, isEdit: true }).edits).toBe(1)
  expect(afterCall(t, { inSubagent: true, hasFailed: true, isEdit: false }).errorStreak).toBe(1)
  expect(afterCall(t, { inSubagent: false, hasFailed: true, isEdit: false })).toEqual({ ...t, errorStreak: 2, errors: 1 })
  expect(momentOf(afterCall(DEFAULT_TURN, { inSubagent: true, hasFailed: false, isEdit: true }))).toBe('before done')
  expect(momentOf({ edits: 0, errorStreak: 2 })).toBe('error repeats')
})

test("a card's context is its latest step's whole input; output adds up", () => {
  let c = normalizeCard({ id: 'x' })
  c = applyStep(c, { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 2_000, output_tokens: 500 }, stopReason: 'tool_use' })
  c = applyStep(c, { model: 'claude-sonnet-5-5', usage: { input_tokens: 5, cache_read_input_tokens: 40_000, output_tokens: 700 }, stopReason: 'max_tokens' })
  expect([c.ctx, c.out, c.steps, c.lastStop, c.model]).toEqual([40_005, 1200, 2, 'max_tokens', 'claude-sonnet-5-5'])
})

const VIA = scrub('advisor tool', 40).text

test('consults open, close by id, and draw on a shared timeline', () => {
  let a = startConsult(DEFAULT_ARCHITECT, { id: 's1', at: 0, moment: 'before a plan', via: VIA })
  a = startConsult(a, { id: 's1', at: 5, moment: 'before a plan', via: VIA }) // same id: ignored
  a = endConsult(a, 10, null, 's1')
  a = startConsult(a, { id: 's2', at: 90, moment: 'before done', via: VIA })
  expect(a.consults.length).toBe(2)
  expect(a.consults[0]?.endAt).toBe(10)
  const tl = consultTimeline(a, 100, 11)
  expect(tl.length).toBe(11)
  expect(tl.startsWith('◆━')).toBe(true)
  expect(tl.split('◆').length - 1).toBe(2)
})

test('config is read leniently: bad values fall back to defaults', () => {
  const d = parseConfig({})
  expect([d.maxCards, d.layout, d.motion, d.moments, d.panels.length]).toEqual([3, 'auto', true, true, 7])
  expect(d.architect.test('fable-advisor:fable-advisor')).toBe(true)
  const c = parseConfig({ architectPattern: '([', maxCards: 99, layout: 'diagonal', panels: 'log, gate ,nope,gate', motion: 'off' })
  expect(c.architect.test('advisor')).toBe(true) // invalid regex → default
  expect([c.maxCards, c.layout, c.motion]).toEqual([6, 'auto', false])
  expect(c.panels).toEqual(['log', 'gate'])
})

test('state saved under an older shape still reads', () => {
  expect(normalizeLog([{ at: '08:00:00', who: 'jev', text: 'x' }])[0]).toEqual({ at: 0, who: 'jev', text: 'x', agentId: null, kind: 'info' })
  const g = normalizeGate({ file: { allow: 1 } }) // v1 gate shape
  expect(g.recent).toEqual([])
  expect(g.totals.shell.rule).toBe(0)
  expect(normalizeCard({ id: 'a', status: 'done' }).tools).toEqual([])
})

test('layout math: lanes share one axis, the log gets 4-8 rows, the legend never wraps', () => {
  const cards = [
    { ...normalizeCard({}), id: 'a', spawnedAt: 1000, endedAt: 1050 },
    { ...normalizeCard({}), id: 'b', spawnedAt: 1050, endedAt: null },
  ]
  const [a, b] = lanes(cards, 1100, 20)
  expect(a).toEqual({ id: 'a', before: 0, bar: 10, after: 10 })
  expect(b?.before).toBe(10)
  expect((b?.before ?? 0) + (b?.bar ?? 0) + (b?.after ?? 0)).toBe(20)
  expect([logRows(10, 40), logRows(50, 40), logRows(200, 40)]).toEqual([4, 7, 8])
  expect(fitLegend([{ label: 'main' }, { label: 'agents' }, { label: 'architect' }], 20).map(x => x.label)).toEqual(['main', 'agents'])
  expect(limitLabel('five_hour')).toBe('5h')
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(prettyModel('us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('Sonnet 4.5')
  expect(prettyModel('claude-3-5-haiku-20241022')).toBe('Haiku 3.5')
  expect(prettyModel('claude-opus-4-20250514')).toBe('Opus 4')
  expect(prettyModel('claude-3-opus-20240229')).toBe('Opus 3')
  expect(prettyModel('z-ai/glm-5.3-flash-with-a-long-name')).toBe('z-ai/glm-5.3-flash-wi…')
  expect(prettyModel('')).toBe('—')
  expect(promptLine('fix the parser', 'user')).toEqual({ who: 'you', text: 'new turn · 14 chars' })
  expect(promptLine('fix the parser', undefined)).toEqual({ who: 'you', text: 'new turn · 14 chars' })
  expect(promptLine('<instructions> rotate the creds </instructions>', 'user')).toEqual({ who: 'you', text: 'new turn · 47 chars' })
  expect(promptLine('<note> db creds from="hunter2pw" ok', 'sdk')).toEqual({ who: 'you', text: 'new turn · 35 chars' })
  expect(promptLine('<task-notification from="ab12">password=hunter2</task-notification>', 'system')).toEqual({ who: 'engine', text: 'message delivered' })
  expect(promptLine('anything', 'loop_wakeup')).toEqual({ who: 'engine', text: 'loop wakeup' })
  expect(promptLine('anything', 'schedule_wakeup')).toEqual({ who: 'engine', text: 'scheduled task' })
  expect(promptLine('anything', 'future_source')).toEqual({ who: 'you', text: 'new turn · 8 chars' })
  const hb = '<agent-message from="a1940a83d593229d5">\n[Subagent hand-back] The text below is the final report. The report follows:\n  Add gate tests: redaction edge cases.\n  - more\n</agent-message>'
  expect(handbackOf(hb)).toEqual({ from: 'a1940a83d593229d5', body: 'Add gate tests: redaction edge cases.' })
  expect(handbackOf('<agent-message from="x">\nPlain report line\n</agent-message>')).toEqual({ from: 'x', body: 'Plain report line' })
  expect(handbackOf('fix the parser')).toBe(null)
  expect(adviceLine('## Ship it after one more gate test.\n- details').text).toBe('Ship it after one more gate test.')
  expect(adviceLine('[Subagent hand-back] header\n\n**Fix card overflow first**').text).toBe('Fix card overflow first')
  expect(adviceLine('').text).toBe('')
  expect(receiptOf({ ...DEFAULT_TURN, costAtStart: 5 }, { durationMs: 1, agentsSince: 0, costNow: 5, reason: 'answer' }).costDelta).toBe(null)
  expect(titleLines('Write tinyqueue test suite', 13, 16)).toEqual(['Write', 'tinyqueue test…'])
  expect(titleLines('Short', 13, 16)).toEqual(['Short', ''])
  expect(receiptOf({ ...DEFAULT_TURN, costAtStart: 1, edits: 2 }, { durationMs: 1000, agentsSince: 3, costNow: 1.5, reason: 'answer' }).costDelta).toBe(0.5)
})

test('a source named after an object property is a typed prompt', () => {
  for (const source of ['__proto__', 'constructor', 'toString', 'weird', undefined]) {
    expect(promptLine('password=hunter2 deploy', source), String(source)).toEqual({ who: 'you', text: 'new turn · 23 chars' })
  }
})

// ---------------------------------------------------------------- drawing

const engine = (on: On) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
}

const pane = (bodyColumns: number) => ({
  plugin: 'flightdeck',
  component: 'Pane' as const,
  requestId: 'flightdeck',
  props: {
    title: 'Flightdeck',
    isFocused: true,
    bodyColumns,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 70 },
    view: {},
  },
})

let spawnN = 0
const spawn = (subagentType: string, description: string) => ({
  prompt: description,
  description,
  subagentType,
  tool_use_id: `tu${++spawnN}`,
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
})

test('a fresh session draws on every surface and width, empty panels hidden', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    for (const cols of [40, 60, 86, 120]) {
      const ui = await $.ui.mount({ ...pane(cols), surface })
      expect(await ui.find({ text: /· main$/ })).toBeDefined()
      expect(await ui.find({ text: /session log/ })).toBeDefined()
      expect(await ui.find({ text: /agents ·/ })).toBeUndefined() // no subagents: no agents panel
      expect(await ui.find({ text: /permissions/ })).toBeUndefined() // no checks yet: no gate panel
      await ui.unmount()
    }
  }
})

test('inline above the prompt, the pane is a summary of at most 8 rows', async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `m${++n}` }))
  on('tool.check', () => ({ decision: 'allow' }))
  await $.turn.start({ text: 'go', turnId: 'M1' })
  for (const d of ['one', 'two', 'three', 'four', 'five']) await $.agent.spawn(spawn('general-purpose', `task ${d}`))
  await $.tool.check({ tool: 'Read', input: { file_path: '/a' }, tool_use_id: 'm-k1' })
  for (const surface of ['terminal', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...pane(80), props: { ...pane(80).props, placement: 'inline' as const }, surface })
    const root = (await ui.drawn()) as { children?: unknown[] }
    expect((root.children ?? []).filter(Boolean).length <= 8).toBe(true)
    expect(await ui.find({ text: /\+2 more agents/ })).toBeDefined()
    expect(await ui.find({ text: /1 allowed/ })).toBeDefined()
    expect(await ui.find({ text: /session log/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('/clear starts the pane fresh', async ($, on) => {
  engine(on)
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'c1' }))
  await $.turn.start({ text: 'go', turnId: 'C1' })
  await $.agent.spawn(spawn('Explore', 'look around'))
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /look around/ })).toBeUndefined()
  await ui.unmount()
})

test('colours come from the theme by default, raw hex only when asked', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  const title = await ui.find({ text: /· main$/ })
  expect(title?.props.color).toBe('claude')
  await ui.unmount()
})

test('pastel keeps the fixed dark-terminal colours', { options: { palette: 'pastel' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect((await ui.find({ text: /· main$/ }))?.props.color).toBe('#7dd3fc')
  await ui.unmount()
})

test('subagents become cards, then swimlanes past the card limit; a card expands on its hotkey', async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `ag${++n}` }))
  await $.turn.start({ text: 'fan out', turnId: 'T1' })
  await $.agent.spawn(spawn('general-purpose', 'Write the parser tests'))
  await $.agent.spawn(spawn('Explore', 'Map the call sites'))

  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /Write the parser/ })).toBeDefined()
  expect(await ui.find({ text: /Sonnet 5\.5/ })).toBeDefined() // differs from main: shown
  await ui.press({ key: 'card-ag1' })
  expect(await ui.find({ text: /^Write the parser tests$/ })).toBeDefined() // the expanded panel, full title
  await ui.unmount()

  await $.agent.spawn(spawn('general-purpose', 'Implement the parser'))
  await $.agent.spawn(spawn('general-purpose', 'Review the parser'))
  for (const surface of ['terminal', 'desktop'] as const) {
    const lanesUi = await $.ui.mount({ ...pane(64), surface })
    expect(await lanesUi.find({ text: /4 total/ })).toBeDefined()
    expect(await lanesUi.find({ text: /━/ })).toBeDefined()
    await lanesUi.unmount()
  }
})

test('the server-side advisor is read from assistant rows: consulting, then on call', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'plan it', turnId: 'T2' })
  const row = (content: unknown[]) =>
    $.session
      .append({
        message: { type: 'assistant', role: 'assistant', content: content as never },
        door: 'response',
        origin: { kind: 'model', model: 'claude-opus-5-5' } as never,
        uuid: `u${++spawnN}`,
      })
      .catch(() => undefined) // the test has no transcript to store rows in
  await row([{ type: 'server_tool_use', id: 'srv1', name: 'advisor', input: {} }])
  const mid = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await mid.find({ text: /ARCHITECT · advising/ })).toBeDefined()
  expect(await mid.find({ text: /◆ before a plan/ })).toBeDefined()
  await mid.unmount()

  await row([{ type: 'advisor_tool_result', tool_use_id: 'srv1', content: { type: 'advisor_redacted_result' } }])
  const after = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await after.find({ text: /ARCHITECT · on call/ })).toBeDefined()
  expect(await after.find({ text: /^1$/ })).toBeDefined()
  await after.unmount()
})

test('the gate strip fills from checks and a row opens its drill-down, which names the program alone', async ($, on) => {
  engine(on)
  on('tool.check', (_$, e) => ({ decision: e.tool === 'Read' ? 'allow' : 'ask' }))
  await $.tool.check({ tool: 'Read', input: { file_path: '/a/b.ts' }, tool_use_id: 'k1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'curl -H "Authorization: Bearer abcdefgh12345" api' }, tool_use_id: 'k2' })
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /2 checks/ })).toBeDefined()
  expect(await ui.find({ text: /1 pending/ })).toBeDefined()
  await ui.press({ key: 'gate-shell' })
  expect(await ui.find({ text: /Bash → curl/ })).toBeDefined()
  expect(await ui.find({ text: /abcdefgh12345|Authorization/ })).toBeUndefined()
  await ui.unmount()
})

test('config changes labels, hides panels and turns the moments off', { options: { architectLabel: 'REVIEWER', panels: 'main,architect,agents,log', moments: false } }, async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: `r${++n}` }))
  await $.turn.start({ text: 'review it', turnId: 'T3' })
  await $.agent.spawn(spawn('fable-advisor:fable-advisor', 'final review'))
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /REVIEWER · advising/ })).toBeDefined()
  expect(await ui.find({ text: /permissions/ })).toBeUndefined()
  expect(await ui.find({ text: /before a plan/ })).toBeUndefined()
  await ui.unmount()
})

test('a consult whose start and result share one row closes, and its review flag with it', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.turn.start({ text: 'go', turnId: 'T4' })
  // An edit first, so the consult is inferred as "before done" and sets the review flag.
  await $.tool.call({ tool: 'Edit', file_path: '/x.ts', old_string: 'a', new_string: 'b' } as never)
  await $.session
    .append({
      message: {
        type: 'assistant',
        role: 'assistant',
        content: [
          { type: 'server_tool_use', id: 'srv9', name: 'advisor', input: {} },
          { type: 'advisor_tool_result', tool_use_id: 'srv9', content: { type: 'advisor_redacted_result' } },
        ] as never,
      },
      door: 'response',
      origin: { kind: 'model', model: 'claude-opus-5-5' } as never,
      uuid: 'one-row',
    })
    .catch(() => undefined)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /ARCHITECT · on call/ })).toBeDefined()
  expect(await ui.find({ text: /◆ before done/ })).toBeDefined()
  expect(await ui.find({ text: /reviewing before done/ })).toBeUndefined()
  await ui.unmount()
})

test('with no architect anywhere, the panel, legend entry and status field stay hidden', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /ARCHITECT/ })).toBeUndefined()
  expect(await ui.find({ text: /^ architect$/ })).toBeUndefined()
  await ui.unmount()
})

test('cards that cannot fit the pane fall back to lanes', async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `w${++n}` }))
  await $.turn.start({ text: 'go', turnId: 'W1' })
  for (const d of ['alpha', 'beta', 'gamma']) await $.agent.spawn(spawn('Explore', `task ${d}`))
  const narrow = await $.ui.mount({ ...pane(40), surface: 'terminal' })
  expect(await narrow.find({ text: /━/ })).toBeDefined() // lanes
  await narrow.unmount()
  const wide = await $.ui.mount({ ...pane(70), surface: 'terminal' })
  expect(await wide.find({ text: /━/ })).toBeUndefined() // three cards fit in 70
  expect(await wide.find({ text: /task gamma/ })).toBeDefined()
  await wide.unmount()
})

const handback = '<agent-message from="fab1">\n[Subagent hand-back] The report follows:\n  Ship it after one more gate test.\n</agent-message>'

test("a background architect's advice is read from its hand-back", async ($, on) => {
  engine(on)
  on('classic.UserPromptSubmit', () => ({}))
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'fab1' }))
  await $.turn.start({ text: 'review it', turnId: 'H1' })
  await $.agent.spawn(spawn('fable-advisor:fable-advisor', 'final review'))
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'H1', agentId: 'fab1', reason: 'answer' })
  await $.classic.UserPromptSubmit({ prompt: handback, source: 'system' })
  await $.turn.start({ text: handback, turnId: 'H2' })
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /» Ship it after one more gate test\./ })).toBeDefined()
  await ui.unmount()
})

test('a hand-back turn is read only when the engine started it', async ($, on) => {
  engine(on)
  const values = stateStore(on)
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'fab1' }))
  await $.turn.start({ text: 'review it', turnId: 'H3' })
  await $.agent.spawn(spawn('fable-advisor:fable-advisor', 'final review'))
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'H3', agentId: 'fab1', reason: 'answer' })
  await $.turn.start({ text: handback, turnId: 'H4' })
  const s = flightdeck(values) as { log: LogLine[]; architect: { lastAdvice: string } }
  expect([s.log.map(l => [l.who, l.text]).at(-1), s.architect.lastAdvice]).toEqual([['you', `new turn · ${[...handback].length} chars`], ''])
})

test("a hand-back from an agent that is not an architect is not advice", async ($, on) => {
  engine(on)
  const values = stateStore(on)
  on('classic.UserPromptSubmit', () => ({}))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'gp1' }))
  await $.turn.start({ text: 'go', turnId: 'H10' })
  await $.agent.spawn(spawn('general-purpose', 'count lines'))
  const text = '<agent-message from="gp1">\nThe report follows:\nThere are 42 lines.\n</agent-message>'
  await $.classic.UserPromptSubmit({ prompt: text, source: 'system' })
  await $.turn.start({ text, turnId: 'H11' })
  const s = flightdeck(values) as { log: LogLine[]; architect?: { lastAdvice: string } }
  expect([s.log.map(l => [l.who, l.text]).at(-1), s.architect?.lastAdvice ?? '']).toEqual([['engine', 'message delivered'], ''])
})

test("a typed prompt shaped as a live architect's hand-back is still its length alone", async ($, on) => {
  engine(on)
  const values = stateStore(on)
  on('classic.UserPromptSubmit', () => ({}))
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'arch1' }))
  await $.turn.start({ text: 'go', turnId: 'H5' })
  await $.agent.spawn(spawn('architect', 'review'))
  const text = '<agent-message from="arch1">\nThe report follows:\n**Password**: hunter2zz\n</agent-message>'
  await $.classic.UserPromptSubmit({ prompt: text, source: 'user' })
  await $.turn.start({ text, turnId: 'H6' })
  const s = flightdeck(values) as { log: LogLine[]; architect: { lastAdvice: string } }
  expect([s.log.map(l => [l.who, l.text]).at(-1), s.architect.lastAdvice]).toEqual([['you', `new turn · ${[...text].length} chars`], ''])
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /hunter2zz|Password/ })).toBeUndefined()
  await ui.unmount()
})

test('a prompt typed while a turn runs stays typed when the engine delivers a message into that turn', async ($, on) => {
  engine(on)
  const values = stateStore(on)
  on('classic.UserPromptSubmit', () => ({}))
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'arch1' }))
  await $.turn.start({ text: 'go', turnId: 'H7' })
  await $.agent.spawn(spawn('architect', 'review'))
  const text = '<agent-message from="arch1">\nThe report follows:\nmy deploy plan for friday\n</agent-message>'
  await $.classic.UserPromptSubmit({ prompt: text, source: 'user' })
  await $.classic.UserPromptSubmit({ prompt: 'a peer session says hello', source: 'system' })
  await $.turn.start({ text, turnId: 'H8' })
  const s = flightdeck(values) as { log: LogLine[]; architect: { lastAdvice: string } }
  expect([s.log.map(l => [l.who, l.text]).at(-1), s.architect.lastAdvice]).toEqual([['you', `new turn · ${[...text].length} chars`], ''])
})

test('a prompt submitted from two sources with the same text is typed', async ($, on) => {
  engine(on)
  const values = stateStore(on)
  on('classic.UserPromptSubmit', () => ({}))
  await $.classic.UserPromptSubmit({ prompt: 'same words', source: 'user' })
  await $.classic.UserPromptSubmit({ prompt: 'same words', source: 'system' })
  await $.turn.start({ text: 'same words', turnId: 'H9' })
  expect((flightdeck(values).log as LogLine[]).map(l => [l.who, l.text])).toEqual([['you', 'new turn · 10 chars']])
})

const architectAt = async ($: Engine, on: On) => {
  engine(on)
  const values = stateStore(on)
  on('classic.UserPromptSubmit', () => ({}))
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'arch1' }))
  await $.turn.start({ text: 'go', turnId: 'A0' })
  await $.agent.spawn(spawn('architect', 'review'))
  return () => flightdeck(values) as { log: LogLine[]; architect: { lastAdvice: string } }
}
const archReport = (body: string) => `<agent-message from="arch1">\nThe report follows:\n${body}\n</agent-message>`

test('a prompt once typed stays typed after 32 other submits and an engine delivery of the same text', async ($, on) => {
  const now = await architectAt($, on)
  const text = archReport('my typed words for friday')
  await $.classic.UserPromptSubmit({ prompt: text, source: 'user' })
  for (let i = 0; i < 32; i++) await $.classic.UserPromptSubmit({ prompt: `peer ${i}`, source: 'system' })
  await $.classic.UserPromptSubmit({ prompt: text, source: 'system' })
  await $.turn.start({ text, turnId: 'A1' })
  expect([now().log.map(l => [l.who, l.text]).at(-1), now().architect.lastAdvice]).toEqual([['you', `new turn · ${[...text].length} chars`], ''])
})

test("an engine delivery's source is read by the one turn it starts", async ($, on) => {
  const now = await architectAt($, on)
  const text = archReport('ship it')
  await $.classic.UserPromptSubmit({ prompt: text, source: 'system' })
  await $.turn.start({ text, turnId: 'A1' })
  await $.turn.start({ text, turnId: 'A2' })
  expect(now().log.slice(-2).map(l => l.who)).toEqual(['architect', 'you'])
})

test('the source map remembers the last 32 engine deliveries', async ($, on) => {
  const now = await architectAt($, on)
  const kept = archReport('kept advice')
  const dropped = archReport('dropped advice')
  await $.classic.UserPromptSubmit({ prompt: kept, source: 'system' })
  for (let i = 0; i < 31; i++) await $.classic.UserPromptSubmit({ prompt: `peer ${i}`, source: 'system' })
  await $.turn.start({ text: kept, turnId: 'A1' })
  await $.classic.UserPromptSubmit({ prompt: dropped, source: 'system' })
  for (let i = 0; i < 32; i++) await $.classic.UserPromptSubmit({ prompt: `more ${i}`, source: 'system' })
  await $.turn.start({ text: dropped, turnId: 'A2' })
  expect(now().log.slice(-2).map(l => l.who)).toEqual(['architect', 'you'])
})

test('once 4096 typed texts fill its memory, every later turn reads as typed', async ($, on) => {
  const now = await architectAt($, on)
  for (let i = 0; i < 4097; i++) await $.classic.UserPromptSubmit({ prompt: `typed ${i}`, source: 'user' })
  const text = archReport('late advice')
  await $.classic.UserPromptSubmit({ prompt: text, source: 'system' })
  await $.turn.start({ text, turnId: 'A1' })
  expect(now().log.at(-1)?.who).toBe('you')
})

test('a typed prompt shows in the log as its length alone', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'password=hunter2 rotate the API keys', turnId: 'P1' })
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /^you$/ })).toBeDefined()
  expect(await ui.find({ text: /^new turn · 36 chars$/ })).toBeDefined()
  expect(await ui.find({ text: /hunter2|rotate/ })).toBeUndefined()
  await ui.unmount()
})

test('a typed prompt that opens with a tag, or holds from="…", is still its length alone', async ($, on) => {
  engine(on)
  const values = stateStore(on)
  on('classic.UserPromptSubmit', () => ({}))
  const text = '<instructions> db creds from="hunter2pw" ok </instructions>'
  await $.classic.UserPromptSubmit({ prompt: text, source: 'user' })
  await $.turn.start({ text, turnId: 'P2' })
  expect((flightdeck(values).log as LogLine[]).map(l => [l.who, l.text])).toEqual([['you', 'new turn · 59 chars']])
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /instructions|hunter2|from/ })).toBeUndefined()
  await ui.unmount()
})

test('a turn the engine started is logged as a fixed label for its source, never its text', async ($, on) => {
  engine(on)
  const values = stateStore(on)
  on('classic.UserPromptSubmit', () => ({}))
  const text = '<task-notification from="ab12cd">password=hunter2 done</task-notification>'
  await $.classic.UserPromptSubmit({ prompt: text, source: 'system' })
  await $.turn.start({ text, turnId: 'P3' })
  await $.turn.start({ text: 'then this one is typed', turnId: 'P4' })
  expect((flightdeck(values).log as LogLine[]).map(l => [l.who, l.text])).toEqual([
    ['engine', 'message delivered'],
    ['you', 'new turn · 22 chars'],
  ])
})

test('a denied PowerShell call that sets a variable never keeps the value', async ($, on) => {
  engine(on)
  const values = stateStore(on)
  on('tool.check', () => ({ decision: 'deny' as const, reason: 'rule' }))
  await $.tool.check({ tool: 'PowerShell', input: { command: "[Environment]::SetEnvironmentVariable('API_KEY','abc123def456')" }, tool_use_id: 'ps1' })
  expect(leaves(flightdeck(values)).filter(([, text]) => text.includes('abc1'))).toEqual([])
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /abc1/ })).toBeUndefined()
  await ui.unmount()
})

test('a finished card keeps its status and duration, never its answer', async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'd1' }))
  await $.turn.start({ text: 'go', turnId: 'D1' })
  await $.agent.spawn(spawn('general-purpose', 'Count the lines'))
  await $.turn.complete({ answer: 'There are 42 lines.', durationMs: 75_000, isAborted: false, turnId: 'D2', agentId: 'd1', reason: 'answer' })
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  await ui.press({ key: 'card-d1' })
  expect(await ui.find({ text: /· done · 1m15s ·/ })).toBeDefined()
  expect(await ui.find({ text: /42 lines/ })).toBeUndefined()
  await ui.unmount()
})

test('an agent description is masked and cut to 80 characters, its name to 40', async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'j1' }))
  await $.turn.start({ text: 'go', turnId: 'J1' })
  await $.agent.spawn({ ...spawn('general-purpose', `deploy eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln ${'x'.repeat(120)}`), name: 'n'.repeat(300) })
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  await ui.press({ key: 'card-j1' })
  const full = await ui.find({ text: /^deploy \[masked\] x+…$/ })
  expect(full?.text.length).toBe(80)
  expect(await ui.find({ text: new RegExp(`^${'n'.repeat(39)}… · `) })).toBeDefined()
  await ui.unmount()
})

for (const [path, fire] of [
  ['its turn.complete answer', ($: Engine) => $.turn.complete({ answer: 'Rotate ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA first', durationMs: 5, isAborted: false, turnId: 'A2', agentId: 'arc1', reason: 'answer' })],
  [
    'its hand-back turn',
    async ($: Engine) => {
      const text = '<agent-message from="arc1">\nThe report follows:\nRotate ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA first\n</agent-message>'
      await $.classic.UserPromptSubmit({ prompt: text, source: 'system' })
      return $.turn.start({ text, turnId: 'A3' })
    },
  ],
  ['its SubagentHandback call', ($: Engine) => $.tool.call({ tool: 'SubagentHandback', message: 'Rotate ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA first', agentId: 'arc1', tool_use_id: 'h1' } as never)],
] as const) {
  test(`architect advice from ${path} is masked`, async ($, on) => {
    engine(on)
    on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'arc1' }))
    on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
    on('classic.UserPromptSubmit', () => ({}))
    await $.turn.start({ text: 'review it', turnId: 'A1' })
    await $.agent.spawn(spawn('architect', 'final review'))
    await fire($)
    const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
    expect(await ui.find({ text: /» Rotate \[masked\] first/ })).toBeDefined()
    expect(await ui.find({ text: /ghp_/ })).toBeUndefined()
    await ui.unmount()
  })
}

const SESSION_TEXT_KEYS = ['log', 'agents', 'gate', 'architect', 'roster'] as const

const textFields = (values: Map<string, { value: unknown }>) => {
  const state = flightdeck(values)
  return SESSION_TEXT_KEYS.flatMap(key => leaves(state[key], key)).filter(([, text]) => text !== '')
}

for (const [how, end] of [
  ['/flightdeck reset', ($: Engine) => $.command.run({ command: 'flightdeck', args: 'reset' } as never)],
  ['session.end on resume', ($: Engine) => $.session.end({ reason: 'resume', sessionId: 's' } as never)],
] as const) {
  test(`${how} empties every text field, roster and meta included, and a second run changes nothing`, async ($, on) => {
    const values = stateStore(on)
    engine(on)
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)
    on('agent.offer', () => ({ isOffered: true }) as never)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'z1' }))
    await $.agent.offer({ agent: 'architect', description: 'reviews', source: 'plugin', provider: { plugin: 'engine', tier: 'core' } } as never)
    await $.turn.start({ text: 'go', turnId: 'Z1' })
    await $.agent.spawn(spawn('Explore', 'look around'))
    expect(textFields(values).length).toBeGreaterThan(0)
    expect((flightdeck(values).roster as { architectTypes: string[] }).architectTypes).toEqual(['architect'])
    await $.command.run({ command: 'flightdeck', args: 'layout wide' } as never).catch(() => undefined)
    await end($)
    const once = JSON.stringify(flightdeck(values))
    expect(textFields(values)).toEqual([])
    expect(flightdeck(values).roster).toEqual({ architectTypes: [] })
    expect(flightdeck(values).meta).toEqual({ schemaVersion: 3 })
    expect(flightdeck(values).hygiene).toEqual({ masked: 0, rejected: 0 })
    await end($)
    expect(JSON.stringify(flightdeck(values))).toBe(once)
  })
}

const auditSession = async ($: Engine, on: On) => {
  const values = stateStore(on)
  const logged: string[] = []
  engine(on)
  on('ui.log', (_$, e) => {
    logged.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'q1' }))
  await $.turn.start({ text: 'password=hunter2 deploy', turnId: 'Q1' })
  await $.agent.spawn(spawn('general-purpose', 'ship with token=abc123 now'))
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'Q1', reason: 'answer' })
  return { values, logged }
}

test('/flightdeck audit lists each stored text field by path and length, never a value, to the person alone', async ($, on) => {
  const { values, logged } = await auditSession($, on)
  const answer = await $.command.run({ command: 'flightdeck', args: 'audit' } as never)
  expect(answer.text).toBeUndefined()
  const masked = (flightdeck(values).hygiene as { masked: number }).masked
  expect(masked).toBe(1)
  expect(logged).toEqual([
    `flightdeck audit · 6 stored text fields · ${masked} masked · lengths in UTF-16 units`,
    'log: 0.who 3, 0.text 19, 1.who 12, 1.text 25',
    'agents: 0.type 15, 0.description 28',
  ])
  for (const row of logged) for (const value of ['\n', 'ship with', 'token=', '[masked]', 'new turn', 'general-purpose']) expect(row).not.toContain(value)
})

test('/flightdeck audit after /flightdeck reset reports 0 stored text fields', async ($, on) => {
  const { logged } = await auditSession($, on)
  await $.command.run({ command: 'flightdeck', args: 'reset' } as never)
  await $.command.run({ command: 'flightdeck', args: 'audit' } as never)
  expect(logged).toEqual(['flightdeck audit · 0 stored text fields · 0 masked · lengths in UTF-16 units'])
})

for (const placement of ['dock', 'inline'] as const) {
  test(`the ${placement} pane shows the masked count the audit reports`, async ($, on) => {
    const { values } = await auditSession($, on)
    const ui = await $.ui.mount({ ...pane(80), props: { ...pane(80).props, placement }, surface: 'terminal' })
    const masked = (flightdeck(values).hygiene as { masked: number }).masked
    expect(await ui.find({ text: `hygiene · ${masked} masked` })).toBeDefined()
    await ui.unmount()
  })
}

test('a count of one reads singular: 1 check, 1 step, +1 more agent, 1 agent on the axis', async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `s${++n}` }))
  on('tool.check', () => ({ decision: 'allow' }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } } as never
  })
  await $.turn.start({ text: 'go', turnId: 'S1' })
  await $.agent.spawn(spawn('general-purpose', 'only one'))
  await $.tool.check({ tool: 'Read', input: { file_path: '/a' }, tool_use_id: 's-k1' })
  for await (const _ of $.turn.step({ turnId: 'S1', index: 0, messageCount: 1, agentId: 's1', model: 'claude-sonnet-5-5' }));
  const dock = await $.ui.mount({ ...pane(64), surface: 'desktop' })
  expect(await dock.find({ text: /^1 check$/ })).toBeDefined()
  await dock.press({ key: 'card-s1' })
  expect(await dock.find({ text: /· 1 step$/ })).toBeDefined()
  const svg = await dock.find({ type: 'Svg' })
  expect(svg?.props.alt).toBe('1 agent on a time axis')
  await dock.unmount()
  for (const d of ['two', 'three', 'four']) await $.agent.spawn(spawn('general-purpose', d))
  const mini = await $.ui.mount({ ...pane(80), props: { ...pane(80).props, placement: 'inline' as const }, surface: 'terminal' })
  expect(await mini.find({ text: /^\+1 more agent · / })).toBeDefined()
  await mini.unmount()
})
