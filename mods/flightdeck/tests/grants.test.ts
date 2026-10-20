import type { AgentStatus } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_GATE, recordCheck, settleCheck } from '../hooks/core'
import { approve, askSubject, clearGrants, dropGrant, DENIED_ROWS, denialRows, grantMemory, grantedVerdict, identityOf, isPlainAsk, markRetried, retryPlan, retryText, unmarkRetried, useGrant } from '../hooks/grants'
import type { DenialRow, RetryPlan, Subject } from '../hooks/grants'
import { scrub } from '../hooks/hygiene'
import type { Check, Gate, Refuser } from '../types'

type Verdict = Parameters<typeof isPlainAsk>[0]

const COMMAND = 'git push origin main'
const LINE = scrub('Bash #0000 → git push origin main', 120).text
const call = { tool: 'Bash', input: { command: COMMAND } }

const answer = (memory: ReturnType<typeof grantMemory>, v: Verdict, tool: string, input: unknown, mode = 'default'): Verdict => {
  const subject = askSubject(v, tool, input, mode)
  return subject !== null && memory.allows(subject) !== null ? grantedVerdict(scrub('Bash → git', 64).text) : v
}

const granted = () => {
  const memory = grantMemory()
  const subject = identityOf(call.tool, call.input) as Subject
  memory.hold('d1', subject, LINE)
  expect(memory.settle('d1', false)).toBe(true)
  expect(memory.approve('d1', memory.epoch)).toBe(true)
  return memory
}

describe('a grant never changes a verdict but a plain ask outside plan mode', () => {
  const unchanged: [label: string, verdict: Verdict, mode?: string][] = [
    ['allow', { decision: 'allow' }],
    ['deny with no rule', { decision: 'deny', reason: 'refused' }],
    ['deny from a settings rule', { decision: 'deny', rule: `Bash(${COMMAND})` }],
    ['deny from a hook', { decision: 'deny', hook: 'PreToolUse' }],
    ['ask from a settings rule', { decision: 'ask', rule: 'Bash(git push:*)' }],
    ['ask under a hook', { decision: 'ask', hook: 'PreToolUse' }],
    ["ask from an option's own check", { decision: 'ask', setting: 'permissions.blockReadsOutsideWorkingDirectories' }],
    ['ask a hook puts to the person', { decision: 'ask', decider: 'person' }],
    ['ask a host answers', { decision: 'ask', decider: 'host' }],
    ['ask under an organization ceiling', { decision: 'ask', ceiling: 'ask' }],
    ['plain ask in plan mode', { decision: 'ask' }, 'plan'],
  ]
  for (const [label, verdict, mode] of unchanged) {
    test(`${label}: unchanged, though a grant for the exact call exists`, () => {
      expect(answer(granted(), verdict, call.tool, call.input, mode)).toEqual(verdict)
    })
  }

  test('a plain ask with a grant for the exact call becomes allow', () => {
    expect(answer(granted(), { decision: 'ask' }, call.tool, call.input).decision).toBe('allow')
  })

  test('a plain ask with no grant is unchanged', () => {
    expect(answer(grantMemory(), { decision: 'ask' }, call.tool, call.input)).toEqual({ decision: 'ask' })
  })

  const near: [label: string, command: string][] = [
    ['one character more', `${COMMAND}x`],
    ['one character different', COMMAND.replace('main', 'mainz')],
    ['a trailing space', `${COMMAND} `],
    ['a chained command', `${COMMAND} && rm -rf /`],
    ['a prefix of it', 'git push'],
  ]
  for (const [label, command] of near) {
    test(`${label} is asked again`, () => {
      expect(answer(granted(), { decision: 'ask' }, 'Bash', { command })).toEqual({ decision: 'ask' })
    })
  }

  test('the same command with the sandbox turned off is asked again', () => {
    expect(answer(granted(), { decision: 'ask' }, 'Bash', { ...call.input, dangerouslyDisableSandbox: true })).toEqual({ decision: 'ask' })
  })

  test('the same command with another description, timeout or background flag is allowed', () => {
    const input = { ...call.input, description: 'Push main', timeout: 5000, run_in_background: true }
    expect(answer(granted(), { decision: 'ask' }, 'Bash', input).decision).toBe('allow')
  })

  test('an MCP call whose description differs is asked again', () => {
    const memory = grantMemory()
    memory.hold('m1', identityOf('mcp__s__post', { channel: 'c', description: 'hello' }) as Subject, LINE)
    memory.settle('m1', false)
    memory.approve('m1', memory.epoch)
    expect(answer(memory, { decision: 'ask' }, 'mcp__s__post', { channel: 'c', description: 'hello' }).decision).toBe('allow')
    expect(answer(memory, { decision: 'ask' }, 'mcp__s__post', { channel: 'c', description: 'rm -rf' })).toEqual({ decision: 'ask' })
  })

  test('the same command under another shell tool is asked again', () => {
    expect(answer(granted(), { decision: 'ask' }, 'PowerShell', call.input)).toEqual({ decision: 'ask' })
  })
})

describe('which calls have an identity', () => {
  for (const tool of ['AskUserQuestion', 'ExitPlanMode', 'Agent', 'Task', 'SendMessage']) {
    test(`${tool} is never grantable`, () => expect(identityOf(tool, { prompt: 'x', command: 'x' })).toBeNull())
  }

  test('an input that is not an object, or a shell call with no command, has none', () => {
    expect([identityOf('Bash', 'ls'), identityOf('Bash', null), identityOf('Bash', {}), identityOf('Read', { path: 3 })]).toEqual([null, null, null, null])
  })

  test('a file tool keys on its path, so an edit with other content matches', () => {
    expect(identityOf('Edit', { file_path: '/a.ts', old_string: 'x', new_string: 'y' })).toBe(identityOf('Edit', { file_path: '/a.ts', old_string: 'p', new_string: 'q' }))
    expect(identityOf('Edit', { file_path: '/a.ts' })).not.toBe(identityOf('Write', { file_path: '/a.ts' }))
    expect(identityOf('Edit', { file_path: '/a.ts' })).not.toBe(identityOf('Edit', { file_path: '/b.ts' }))
  })

  test('a search keys on path and pattern, a fetch on the exact URL', () => {
    expect(identityOf('Grep', { pattern: 'x', path: '/r' })).not.toBe(identityOf('Grep', { pattern: 'y', path: '/r' }))
    expect(identityOf('WebFetch', { url: 'https://a.example/x', prompt: 'p' })).toBe(identityOf('WebFetch', { url: 'https://a.example/x', prompt: 'q' }))
    expect(identityOf('WebFetch', { url: 'https://a.example/x' })).not.toBe(identityOf('WebFetch', { url: 'https://a.example/x?y' }))
  })

  test('any other tool keys on its whole input in any key order, its description included', () => {
    expect(identityOf('mcp__s__t', { a: 1, b: { c: 2, d: 3 } })).toBe(identityOf('mcp__s__t', { b: { d: 3, c: 2 }, a: 1 }))
    expect(identityOf('mcp__s__t', { a: 1, description: 'one' })).not.toBe(identityOf('mcp__s__t', { a: 1, description: 'two' }))
    expect(identityOf('mcp__s__t', { a: 1 })).not.toBe(identityOf('mcp__s__t', { a: 2 }))
  })
})

describe('the memory', () => {
  test('a plain ask that ran leaves nothing to approve', () => {
    const memory = grantMemory()
    memory.hold('c1', identityOf(call.tool, call.input) as Subject, LINE)
    expect(memory.settle('c1', true)).toBe(false)
    expect(memory.approve('c1', memory.epoch)).toBe(false)
  })

  test('a refusal with no held identity cannot be approved', () => {
    const memory = grantMemory()
    expect(memory.settle('c2', false)).toBe(false)
    expect(memory.approve('c2', memory.epoch)).toBe(false)
  })

  test('approving twice keeps one grant', () => {
    const memory = granted()
    expect(memory.approve('d1', memory.epoch)).toBe(true)
    expect(memory.allows(identityOf(call.tool, call.input) as Subject)).toBe('d1')
  })

  test('forgetting grants keeps the refusal approvable; a reset forgets both and starts a new epoch', () => {
    const memory = granted()
    const subject = identityOf(call.tool, call.input) as Subject
    memory.forgetGrants()
    expect(memory.allows(subject)).toBeNull()
    expect(memory.approve('d1', memory.epoch)).toBe(true)
    const before = memory.epoch
    memory.reset()
    expect([memory.allows(subject), memory.approve('d1', memory.epoch), memory.epoch === before]).toEqual([null, false, false])
    expect(answer(memory, { decision: 'ask' }, call.tool, call.input)).toEqual({ decision: 'ask' })
  })

  test('past 32 grants the oldest is dropped', () => {
    const memory = grantMemory()
    const subject = (i: number) => identityOf('Bash', { command: `echo ${i}` }) as Subject
    for (let i = 0; i < 33; i++) {
      memory.hold(`d${i}`, subject(i), LINE)
      memory.settle(`d${i}`, false)
      memory.approve(`d${i}`, memory.epoch)
    }
    expect([memory.allows(subject(0)), memory.allows(subject(1))]).toEqual([null, 'd1'])
  })

  test('an approval for an earlier epoch is not granted', () => {
    const memory = grantMemory()
    memory.hold('d1', identityOf(call.tool, call.input) as Subject, LINE)
    memory.settle('d1', false)
    expect([memory.holds('d1', 'stale'), memory.approve('d1', 'stale')]).toEqual([false, false])
    expect(memory.allows(identityOf(call.tool, call.input) as Subject)).toBeNull()
  })
})

const EPOCH = 'e1'
const DETAIL = scrub('Bash → git', 64).text

const refusedGate = (id: string, o: { agentId?: string | null; isHeld?: boolean; isPlain?: boolean; refuser?: Refuser | null } = {}) => {
  const ask: Check = { id, bucket: 'shell', detail: DETAIL, agentId: o.agentId ?? null, at: 1, verdict: 'ask', approvable: o.isPlain ?? true }
  return settleCheck(recordCheck(DEFAULT_GATE, ask), id, { didRun: false, isHeld: o.isHeld ?? true, epoch: EPOCH, refuser: o.refuser ?? 'person' })
}

const rowOf = (g: Gate, epoch = EPOCH) => denialRows(g, DENIED_ROWS, epoch)[0] as DenialRow

describe('a refusal in the denied list', () => {
  test('a plain ask refused with its identity held is approvable; approving it records one grant, twice still one', () => {
    const g = refusedGate('d1')
    expect(rowOf(g).status).toBe('approvable')
    const once = approve(g, 'd1', 5, EPOCH)
    expect([rowOf(once).status, once.grants]).toEqual(['approved', [{ denialId: 'd1', bucket: 'shell', detail: DETAIL, at: 5, uses: 0, epoch: EPOCH }]])
    expect(approve(once, 'd1', 6, EPOCH)).toBe(once)
  })

  const blocked: [label: string, g: Gate][] = [
    ['a refusal of a non-plain ask', refusedGate('d1', { isPlain: false })],
    ['a refusal whose identity the memory did not keep', refusedGate('d1', { isHeld: false })],
    ['a refusal a hook gave when the call was made', refusedGate('d1', { refuser: 'hook' })],
    ['a deny from a settings rule', recordCheck(DEFAULT_GATE, { id: 'd1', bucket: 'shell', detail: DETAIL, agentId: null, at: 1, verdict: 'deny', by: 'rule', cause: scrub('Bash(git push:*)', 40).text })],
    ['a deny from a hook', recordCheck(DEFAULT_GATE, { id: 'd1', bucket: 'shell', detail: DETAIL, agentId: null, at: 1, verdict: 'deny', by: 'hook', cause: scrub('PreToolUse', 40).text })],
    ['a deny from the mode or a check', recordCheck(DEFAULT_GATE, { id: 'd1', bucket: 'shell', detail: DETAIL, agentId: null, at: 1, verdict: 'deny', by: 'policy', cause: scrub('', 40).text })],
  ]
  for (const [label, g] of blocked) {
    test(`${label} is blocked, and approve leaves the gate as it was`, () => {
      expect(rowOf(g).status).toBe('blocked')
      expect(approve(g, 'd1', 5, EPOCH)).toBe(g)
    })
  }

  test('a refusal or a grant from another epoch reads as expired and cannot be approved or retried', () => {
    const g = approve(refusedGate('d1'), 'd1', 5, EPOCH)
    expect(rowOf(g, 'e2').status).toBe('expired')
    expect(approve(refusedGate('d1'), 'd1', 5, 'e2')).toEqual(refusedGate('d1'))
    expect(markRetried(g, 'd1', 9, 'e2')).toBe(g)
  })

  test('a retry is marked once: the second press finds it retried', () => {
    const g = approve(refusedGate('d1'), 'd1', 5, EPOCH)
    const once = markRetried(g, 'd1', 9, EPOCH)
    expect(rowOf(once).status).toBe('retried')
    expect(markRetried(once, 'd1', 10, EPOCH)).toBe(once)
    expect(markRetried(refusedGate('d1'), 'd1', 9, EPOCH)).toEqual(refusedGate('d1'))
  })

  test('a failed delivery unmarks only its own press, never a later one', () => {
    const g0 = approve(refusedGate('d1'), 'd1', 5, EPOCH)
    const later = markRetried(g0, 'd1', 9, EPOCH)
    expect(unmarkRetried(later, 'd1', 7)).toBe(later)
    expect(unmarkRetried(later, 'd1', 9)).toEqual(g0)
  })

  test('uses count up, a dropped grant is gone, and clearing empties them', () => {
    let g = approve(refusedGate('d1'), 'd1', 5, EPOCH)
    g = useGrant(useGrant(g, 'd1'), 'd1')
    expect(g.grants.map(x => x.uses)).toEqual([2])
    expect([dropGrant(g, 'd1').grants, clearGrants(g).grants]).toEqual([[], []])
  })

  test('the memory and the gate keep the same grants, so every grant the memory acts on is drawn', () => {
    const memory = grantMemory()
    let g: Gate = DEFAULT_GATE
    const commands = Array.from({ length: 45 }, (_, i) => `echo ${i % 30}`)
    commands.forEach((command, i) => {
      const id = `d${i}`
      memory.hold(id, identityOf('Bash', { command }) as Subject, LINE)
      memory.settle(id, false)
      const ask: Check = { id, bucket: 'shell', detail: DETAIL, agentId: null, at: i, verdict: 'ask', approvable: true }
      g = settleCheck(recordCheck(g, ask), id, { didRun: false, isHeld: true, epoch: memory.epoch, refuser: 'person' })
      const after = approve(g, id, i, memory.epoch)
      if (after !== g) memory.approve(id, memory.epoch)
      g = after
    })
    const unique = [...new Set(commands)]
    const allowed = unique.map(command => memory.allows(identityOf('Bash', { command }) as Subject)).filter(id => id !== null)
    const drawn = new Set(g.grants.map(x => x.denialId))
    expect(allowed.length).toBeGreaterThan(0)
    expect(allowed.filter(id => !drawn.has(id))).toEqual([])
    memory.forgetGrants()
    expect(unique.some(command => memory.allows(identityOf('Bash', { command }) as Subject) !== null)).toBe(false)
  })
})

describe('a retry', () => {
  const approved = (agentId: string | null) => rowOf(approve(refusedGate('d1', { agentId }), 'd1', 5, EPOCH))
  type Plan = [label: string, row: DenialRow, status: AgentStatus | undefined, plan: RetryPlan]
  const plans: Plan[] = [
    ['not approved', rowOf(refusedGate('d1')), undefined, { kind: 'none', why: 'not approved' }],
    ['blocked', rowOf(refusedGate('d1', { isPlain: false })), undefined, { kind: 'none', why: 'not approved' }],
    ['expired', rowOf(approve(refusedGate('d1'), 'd1', 5, EPOCH), 'e2'), undefined, { kind: 'none', why: 'not approved' }],
    ['already retried', rowOf(markRetried(approve(refusedGate('d1'), 'd1', 5, EPOCH), 'd1', 9, EPOCH)), undefined, { kind: 'none', why: 'already retried' }],
    ['the main loop', approved(null), undefined, { kind: 'main' }],
    ['an agent not listed', approved('a1'), undefined, { kind: 'none', why: 'agent gone' }],
    ...(['pending', 'running', 'waiting', 'idle', 'completed', 'failed', 'killed'] as const).map((s): Plan => {
      const resumes = s === 'completed' || s === 'failed' || s === 'killed'
      return [`a ${s} agent${resumes ? ' resumes' : ''}`, approved('a1'), s, { kind: 'agent', agentId: 'a1', resumes }]
    }),
  ]
  for (const [label, row, status, plan] of plans) test(label, () => expect(retryPlan(row, status)).toEqual(plan))

  test('the text holds the scrubbed detail and nothing else from the session', () => {
    const detail = scrub('Bash → curl', 64).text
    expect(retryText(detail)).toBe(
      'flightdeck: the person approved Bash → curl for this session after it was refused. If that call is still needed, make it again now, unchanged.',
    )
  })
})
