import type { AgentStatus } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import { askSubject, grantMemory, grantedVerdict, identityOf, isPlainAsk, retryPlan, retryText } from '../hooks/grants'
import type { Subject } from '../hooks/grants'
import { scrub } from '../hooks/hygiene'

type Verdict = Parameters<typeof isPlainAsk>[0]

const COMMAND = 'git push origin main'
const call = { tool: 'Bash', input: { command: COMMAND } }

/** What flightdeck's tool.check answers for core's verdict, given what the memory holds. */
const answer = (memory: ReturnType<typeof grantMemory>, v: Verdict, tool: string, input: unknown, mode = 'default'): Verdict => {
  const subject = askSubject(v, tool, input, mode)
  return subject !== null && memory.allows(subject) !== null ? grantedVerdict(scrub('Bash → git', 64).text) : v
}

/** A memory where the call was asked plainly, refused, and approved. */
const granted = () => {
  const memory = grantMemory()
  const subject = identityOf(call.tool, call.input) as Subject
  memory.hold('d1', subject)
  expect(memory.settle('d1', false)).toBe(true)
  expect(memory.approve('d1').isApproved).toBe(true)
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

  test('any other tool keys on its whole input in any key order, less its description', () => {
    expect(identityOf('mcp__s__t', { a: 1, b: { c: 2, d: 3 }, description: 'one' })).toBe(identityOf('mcp__s__t', { b: { d: 3, c: 2 }, a: 1, description: 'two' }))
    expect(identityOf('mcp__s__t', { a: 1 })).not.toBe(identityOf('mcp__s__t', { a: 2 }))
  })
})

describe('the memory', () => {
  test('a plain ask that ran leaves nothing to approve', () => {
    const memory = grantMemory()
    memory.hold('c1', identityOf(call.tool, call.input) as Subject)
    expect(memory.settle('c1', true)).toBe(false)
    expect(memory.approve('c1').isApproved).toBe(false)
  })

  test('a refusal with no held identity cannot be approved', () => {
    const memory = grantMemory()
    expect(memory.settle('c2', false)).toBe(false)
    expect(memory.approve('c2').isApproved).toBe(false)
  })

  test('approving twice keeps one grant', () => {
    const memory = granted()
    expect(memory.approve('d1')).toEqual({ isApproved: true, evicted: [] })
    expect(memory.allows(identityOf(call.tool, call.input) as Subject)).toBe('d1')
  })

  test('forgetting grants keeps the refusal approvable; a reset forgets both and starts a new epoch', () => {
    const memory = granted()
    const subject = identityOf(call.tool, call.input) as Subject
    memory.forgetGrants()
    expect(memory.allows(subject)).toBeNull()
    expect(memory.approve('d1').isApproved).toBe(true)
    const before = memory.epoch
    memory.reset()
    expect([memory.allows(subject), memory.approve('d1').isApproved, memory.epoch === before]).toEqual([null, false, false])
    expect(answer(memory, { decision: 'ask' }, call.tool, call.input)).toEqual({ decision: 'ask' })
  })

  test('past 32 grants the oldest is dropped and named', () => {
    const memory = grantMemory()
    const subject = (i: number) => identityOf('Bash', { command: `echo ${i}` }) as Subject
    const evicted = Array.from({ length: 33 }, (_, i) => {
      memory.hold(`d${i}`, subject(i))
      memory.settle(`d${i}`, false)
      return memory.approve(`d${i}`).evicted
    })
    expect([evicted.slice(0, 32).flat(), evicted[32]]).toEqual([[], ['d0']])
    expect([memory.allows(subject(0)), memory.allows(subject(1))]).toEqual([null, 'd1'])
  })
})

describe('a retry', () => {
  type Plan = [label: string, d: Parameters<typeof retryPlan>[0], status: AgentStatus | undefined, plan: ReturnType<typeof retryPlan>]
  const plans: Plan[] = [
    ['not approved', { agentId: null, isApproved: false, retriedAt: null }, undefined, { kind: 'none', why: 'not approved' }],
    ['already retried', { agentId: null, isApproved: true, retriedAt: 5 }, undefined, { kind: 'none', why: 'already retried' }],
    ['the main loop', { agentId: null, isApproved: true, retriedAt: null }, undefined, { kind: 'main' }],
    ['an agent not listed', { agentId: 'a1', isApproved: true, retriedAt: null }, undefined, { kind: 'none', why: 'agent gone' }],
    ...(['pending', 'running', 'waiting', 'idle', 'completed', 'failed', 'killed'] as const).map((s): Plan => {
      const resumes = s === 'completed' || s === 'failed' || s === 'killed'
      return [`a ${s} agent${resumes ? ' resumes' : ''}`, { agentId: 'a1', isApproved: true, retriedAt: null }, s, { kind: 'agent', agentId: 'a1', resumes }]
    }),
  ]
  for (const [label, d, status, plan] of plans) test(label, () => expect(retryPlan(d, status)).toEqual(plan))

  test('the text holds the scrubbed detail and nothing else from the session', () => {
    const detail = scrub('Bash → curl', 64).text
    expect(retryText(detail)).toBe(
      'flightdeck: the person approved Bash → curl for this session after it was refused. If that call is still needed, make it again now, unchanged.',
    )
  })
})
