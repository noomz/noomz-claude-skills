import { expect, mock, test } from 'claude-code/testing'
import { EMPTY_EXTERNAL, EXTERNAL_LIMIT, abortExternal, externalId, externalLanes, externalNotice, externalProvider, finishExternal, noticeExternal, startExternal } from '../hooks/external'
import type { ExternalCard, ExternalState } from '../types'
import { flightdeck, stateStoreWithoutRedraw } from './store'

const id = (value: string) => {
  const result = externalId(value)
  if (!result) throw new Error('invalid test id')
  return result
}
const card = (call: string, sequence = 1): ExternalCard => ({ kind: 'external', id: id(call), taskId: null, provider: 'codex', status: 'running', sequence, startedAt: 1, endedAt: null })
const notification = (call: string, task: string, status: string) => `<task-notification><task-id>${task}</task-id><tool-use-id>${call}</tool-use-id><status>${status}</status><summary>password=hunter2</summary></task-notification>`

test('recognizes the observed standalone agent launch shapes', () => {
  expect(externalProvider('codex exec --skip-git-repo-check "Reply OK only."')).toBe('codex')
  expect(externalProvider('pi --print --no-session --no-tools "Reply OK only."')).toBe('pi')
  expect(externalProvider('hermes chat --oneshot -q "Reply OK only."')).toBe('hermes')
  expect(externalProvider('grok --single "Reply OK only."')).toBe('grok')
})

test('recognizes launches wrapped in redirects, chains and substitutions', () => {
  // The two worker launches from a real session that drew no card before.
  expect(externalProvider('codex exec -m gpt-6.1-sol -s workspace-write -C . -o .planning/workers/codex-backend.out "$(cat .planning/workers/codex-backend.md)" > .planning/workers/codex-backend.log 2>&1; echo "codex exit $?"; tail -30 .planning/workers/codex-backend.out')).toBe('codex')
  expect(externalProvider('grok -m grok-4.7 --permission-mode acceptEdits --allow "Bash(node --check:*)" --no-subagents --disable-web-search --prompt-file .planning/workers/grok-ui.md > .planning/workers/grok-ui.out 2>&1; echo "grok exit $?"')).toBe('grok')
  for (const [command, provider] of [
    ['cd /tmp && codex exec --skip-git-repo-check -s read-only "reply OK" 2>&1 | tail -3', 'codex'],
    ['codex e x &', 'codex'],
    ['codex exec `cat brief`', 'codex'],
    ['codex exec x\necho done', 'codex'],
    ['codex exec \\\n  -m m x', 'codex'],
    ['/opt/homebrew/bin/codex exec x >>log', 'codex'],
    ['OPENAI_LOG=0 codex exec x', 'codex'],
    ["codex exec - <<'EOF'\ngrok --help \"unbalanced\nEOF\necho done", 'codex'],
    ['cat brief | pi -p --no-session', 'pi'],
    ['pi --model deepseek/x -p "$(cat brief)" &>out', 'pi'],
    ['hermes chat --oneshot --query-file brief.md', 'hermes'],
    ['grok -p "hi" </dev/null', 'grok'],
    ['# worker\ngrok --prompt-json \'{"a":1}\'', 'grok'],
  ] as const) expect(externalProvider(command), command).toBe(provider)
})

test('rejects unreadable shell, wrappers and non-agent commands', () => {
  for (const command of [
    'codex exec --help', 'codex exec --version', 'codex exec --bg x', 'codex --version', 'codex exec',
    'echo codex exec x', 'env codex exec x', 'sh -c "codex exec x"', 'rg "codex exec" .', 'git commit -m "grok -p x"',
    'which codex grok pi; codex --version 2>&1 | head -1',
    'codex exec "unterminated', 'codex exec "$(cat brief"', 'codex exec x >', "codex exec - <<EOF\nno end",
    'pi --help', 'pi -p', 'hermes chat -q hello', 'grok --help', 'grok -m grok-4.7', 'A=1 B=2',
  ]) expect(externalProvider(command), command).toBe(null)
})

test('correlates early notifications by both observed IDs without keeping output', () => {
  const notice = externalNotice(notification('call1', 'task1', 'completed'), 4)
  if (!notice) throw new Error('notice missing')
  let state = startExternal(EMPTY_EXTERNAL, card('call1'))
  state = noticeExternal(state, notice)
  state = finishExternal(state, 'call1', 1, 1, id('task1'), false, 5)
  expect(state.cards[0]?.status).toBe('handed-off')
  expect(JSON.stringify(state).includes('hunter2')).toBe(false)
  const mismatch = finishExternal(startExternal(state, card('call2')), 'call2', 1, 1, id('task2'), false, 5)
  expect(mismatch.cards.find(c => c.id === 'call2')?.status).toBe('handed-off')
})

test('handles failures, cancellation, conflicting notices and reset races conservatively', () => {
  const failed = finishExternal(startExternal(EMPTY_EXTERNAL, card('call1')), 'call1', 1, 1, null, true, 2)
  expect(failed.cards[0]?.status).toBe('failed')
  const running = finishExternal(startExternal(EMPTY_EXTERNAL, card('call1')), 'call1', 1, 1, id('task1'), false, 2)
  const killed = externalNotice(notification('call1', 'task1', 'killed'), 3)
  const done = externalNotice(notification('call1', 'task1', 'completed'), 4)
  if (!killed || !done) throw new Error('notice missing')
  expect(noticeExternal(running, killed).cards[0]?.status).toBe('cancelled')
  expect(noticeExternal(noticeExternal(running, killed), done).cards[0]?.status).toBe('unknown')
  expect(abortExternal(running, 'call1', 1, 1).cards[0]?.status).toBe('unknown')
  const afterReset = startExternal(EMPTY_EXTERNAL, card('call1', 2))
  expect(finishExternal(afterReset, 'call1', 1, 1, null, true, 9).cards[0]?.status).toBe('running')
})

test('rejects missing, malformed, secret-like and conflicting identifiers', () => {
  expect(externalNotice(notification('call1', '', 'completed'), 0)).toBe(null)
  expect(externalNotice(notification('call1', 'task1', 'running'), 0)).toBe(null)
  expect(externalId('ghp_abcdefghijklmnop')).toBe(null)
  expect(externalNotice(notification('call1', 'task1', 'completed').replace('</task-id>', '</task-id><task-id>other</task-id>'), 0)).toBe(null)
})

test('bounds external cards and notices', () => {
  let state = EMPTY_EXTERNAL
  for (let n = 0; n < EXTERNAL_LIMIT + 5; n++) {
    state = startExternal(state, card(`call${n}`))
    const notice = externalNotice(notification(`call${n}`, `task${n}`, 'completed'), n)
    if (!notice) throw new Error('notice missing')
    state = noticeExternal(state, notice)
  }
  expect([state.cards.length, state.notices.length]).toEqual([EXTERNAL_LIMIT, EXTERNAL_LIMIT])
})

test('external cards and lanes do not take Claude navigation keys', async ($, on) => {
  const values = stateStoreWithoutRedraw(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  let views = 0
  on('ui.view', () => { views++; return { value: {} } })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'claude1' }))
  await $.agent.spawn({ prompt: 'task', description: 'native agent', subagentType: 'general-purpose', tool_use_id: 'spawn1', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'claude-opus-5-5', background: true, fork: false })
  const external = Array.from({ length: 4 }, (_, n) => ({ ...card(`call${n}`, n), provider: n === 0 ? 'pi' as const : 'codex' as const, status: 'handed-off' as const }))
  values.set('flightdeck/external/', { value: { cards: external, notices: [] }, version: 1 })
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const width of [40, 120]) {
      const ui = await $.ui.mount({ plugin: 'flightdeck', component: 'Pane', requestId: 'flightdeck', surface, props: { title: 'Flightdeck', isFocused: true, bodyColumns: width, placement: 'dock', scroll: { offset: 0, bodyRows: 70 }, view: {} } })
      expect(await ui.find({ text: /external agents · 4 total/ })).toBeDefined()
      expect(await ui.find({ text: /pi · handed off/ })).toBeDefined()
      expect((await ui.findAll({ type: 'Button' })).some(b => String(b.props.key).includes('call0'))).toBe(false)
      await ui.press({ key: 'card-claude1' })
      await ui.unmount()
    }
  }
  expect(views).toBe(4)
  await $.command.run({ command: 'flightdeck', args: 'layout mini' } as never)
  const mini = await $.ui.mount({ plugin: 'flightdeck', component: 'Pane', requestId: 'flightdeck', surface: 'terminal', props: { title: 'Flightdeck', isFocused: true, bodyColumns: 40, placement: 'inline', scroll: { offset: 0, bodyRows: 8 }, view: {} } })
  expect(await mini.find({ text: /external codex · handed off/ })).toBeDefined()
  const root = await mini.drawn() as { children?: unknown[] }
  expect((root.children ?? []).filter(Boolean).length <= 8).toBe(true)
  await mini.unmount()
})

test('external lanes show only observed intervals', () => {
  const finished = { ...card('call1'), status: 'failed' as const, startedAt: 10, endedAt: 20 }
  expect(externalLanes([finished, card('call2')], 10)).toEqual([{ before: 0, bar: 10 }, null])
})

test('the live hook correlates a Bash background result and notification without retaining its prompt or output', async ($, on) => {
  const values = stateStoreWithoutRedraw(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', () => ({ result: { backgroundTaskId: 'task1', stdout: 'password=hunter2' }, text: 'password=hunter2' }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  await $.tool.call({ tool: 'Bash', command: 'codex exec "password=hunter2"', tool_use_id: 'call1' } as never)
  const get = () => flightdeck(values).external as ExternalState
  expect(get().cards[0]?.status).toBe('handed-off')
  await $.prompt.submit({ text: notification('call1', 'task1', 'completed'), origin: { kind: 'task-notification' }, wait: false })
  expect(get().cards[0]?.status).toBe('handed-off')
  expect(JSON.stringify(get()).includes('hunter2')).toBe(false)
  await $.command.run({ command: 'flightdeck', args: 'reset' } as never)
  expect(get()).toEqual(EMPTY_EXTERNAL)
})

test('a failed foreground launch stays failed and a resume makes in-flight work unknown', async ($, on) => {
  const values = stateStoreWithoutRedraw(on)
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', () => ({ result: {}, text: 'password=hunter2', isError: true }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  await $.tool.call({ tool: 'Bash', command: 'codex exec "password=hunter2"', tool_use_id: 'call1' } as never)
  const state = () => flightdeck(values).external as ExternalState
  expect(state().cards[0]?.status).toBe('failed')
  values.set('flightdeck/external/', { value: startExternal(state(), card('call2')), version: 99 })
  values.set('flightdeck/meta/', { value: { schemaVersion: 7 }, version: 1 })
  await $.session.start({ cwd: '/w', surface: null, isInteractive: false })
  expect(state().cards.find(c => c.id === 'call2')?.status).toBe('unknown')
  expect(JSON.stringify(state()).includes('hunter2')).toBe(false)
})

