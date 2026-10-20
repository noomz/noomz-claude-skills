import type { AgentStatus, ToolCheckResult } from 'claude-code'

import type { Check, Gate, Grant } from '../types'
import type { SafeText } from './hygiene'

export type Subject = string & { readonly __subject: true }

const NEVER_GRANTED: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode', 'Agent', 'Task', 'SendMessage'])

const FILE_PATH_TOOLS: ReadonlySet<string> = new Set(['Read', 'Edit', 'Write', 'NotebookEdit'])
const SEARCH_TOOLS: ReadonlySet<string> = new Set(['Glob', 'Grep'])
const SHELL_TOOLS: ReadonlySet<string> = new Set(['Bash', 'PowerShell'])
const SHELL_HARMLESS: ReadonlySet<string> = new Set(['description', 'timeout', 'run_in_background'])

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export const isPlainAsk = (v: ToolCheckResult): boolean =>
  v.decision === 'ask' && !v.rule && !v.hook && !v.setting && !v.decider && v.ceiling === undefined

const stable = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (isObject(v))
    return `{${Object.keys(v)
      .sort()
      .map(k => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

export const identityOf = (tool: string, input: unknown): Subject | null => {
  if (NEVER_GRANTED.has(tool) || !isObject(input)) return null
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : null)
  const of = (...parts: (string | null)[]) => (parts.every(p => p !== null) ? ([tool, ...parts].join('\0') as Subject) : null)
  if (SHELL_TOOLS.has(tool))
    return str('command') === null ? null : of(stable(Object.fromEntries(Object.entries(input).filter(([k]) => !SHELL_HARMLESS.has(k)))))
  if (FILE_PATH_TOOLS.has(tool)) return of(str('file_path') ?? str('notebook_path'))
  if (SEARCH_TOOLS.has(tool)) return of(str('path') ?? '', str('pattern'))
  if (tool === 'WebFetch') return of(str('url'))
  return of(stable(input))
}

export const markOf = (subject: Subject): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < subject.length; i++) h = Math.imul(h ^ subject.charCodeAt(i), 0x01000193)
  return `#${(h >>> 0).toString(36).padStart(7, '0').slice(-4)}`
}

export const askSubject = (v: ToolCheckResult, tool: string, input: unknown, mode: string): Subject | null =>
  isPlainAsk(v) && mode !== 'plan' ? identityOf(tool, input) : null

export const grantedVerdict = (detail: SafeText): ToolCheckResult => ({
  decision: 'allow',
  reason: `approved in flightdeck for this session (${detail})`,
})

export const retryText = (detail: SafeText) =>
  `flightdeck: the person approved ${detail} for this session after it was refused. If that call is still needed, make it again now, unchanged.`

export type Denial = Extract<Check, { verdict: 'deny' }>

export type DenialStatus = 'blocked' | 'approvable' | 'expired' | 'approved' | 'retried'

export type DenialRow = { check: Denial; status: DenialStatus; grant: Grant | null }

const rowOf = (g: Gate, c: Denial, epoch: string): DenialRow => {
  if (c.by !== 'refused' || !c.approvable) return { check: c, status: 'blocked', grant: null }
  if (c.epoch !== epoch) return { check: c, status: 'expired', grant: null }
  const grant = g.grants.find(x => x.denialId === c.id && x.epoch === epoch) ?? null
  if (!grant) return { check: c, status: 'approvable', grant }
  return { check: c, status: c.retriedAt === null ? 'approved' : 'retried', grant }
}

export const DENIED_ROWS = 4

export const denialRows = (g: Gate, n: number, epoch: string): DenialRow[] =>
  g.recent
    .filter((c): c is Denial => c.verdict === 'deny')
    .slice(-n)
    .reverse()
    .map(c => rowOf(g, c, epoch))

// The memory and the gate keep the same grants, one per approved refusal, in approval order under this
// one cap, so both drop the same oldest one and every grant the memory acts on is drawn and forgettable.
const GRANTS_MAX = 32

export const approve = (g: Gate, id: string, at: number, epoch: string): Gate => {
  const c = g.recent.find((r): r is Denial => r.id === id && r.verdict === 'deny')
  if (!c || rowOf(g, c, epoch).status !== 'approvable') return g
  const grant: Grant = { denialId: id, bucket: c.bucket, detail: c.detail, at, uses: 0, epoch }
  return { ...g, grants: [...g.grants.filter(x => x.epoch === epoch), grant].slice(-GRANTS_MAX) }
}

export const dropGrant = (g: Gate, id: string): Gate => ({ ...g, grants: g.grants.filter(x => x.denialId !== id) })

export const markRetried = (g: Gate, id: string, at: number, epoch: string): Gate => {
  const c = g.recent.find((r): r is Denial => r.id === id && r.verdict === 'deny')
  if (!c || c.by !== 'refused' || rowOf(g, c, epoch).status !== 'approved') return g
  return { ...g, recent: g.recent.map(r => (r === c ? { ...c, retriedAt: at } : r)) }
}

export const unmarkRetried = (g: Gate, id: string, at: number): Gate => {
  const c = g.recent.find((r): r is Denial => r.id === id && r.verdict === 'deny')
  if (!c || c.by !== 'refused' || c.retriedAt !== at) return g
  return { ...g, recent: g.recent.map(r => (r === c ? { ...c, retriedAt: null } : r)) }
}

export const useGrant = (g: Gate, denialId: string): Gate => ({
  ...g,
  grants: g.grants.map(x => (x.denialId === denialId ? { ...x, uses: x.uses + 1 } : x)),
})

export const clearGrants = (g: Gate): Gate => (g.grants.length === 0 ? g : { ...g, grants: [] })

export type RetryPlan =
  | { kind: 'main' }
  | { kind: 'agent'; agentId: string; resumes: boolean }
  | { kind: 'none'; why: 'not approved' | 'already retried' | 'agent gone' }

const ENDED: ReadonlySet<AgentStatus> = new Set(['completed', 'failed', 'killed'])

export const retryPlan = (row: DenialRow, status: AgentStatus | undefined): RetryPlan => {
  if (row.status === 'retried') return { kind: 'none', why: 'already retried' }
  if (row.status !== 'approved') return { kind: 'none', why: 'not approved' }
  const { agentId } = row.check
  if (agentId === null) return { kind: 'main' }
  if (status === undefined) return { kind: 'none', why: 'agent gone' }
  return { kind: 'agent', agentId, resumes: ENDED.has(status) }
}

const PENDING_MAX = 64
const REFUSED_MAX = 16

const capped = <K, V>(m: Map<K, V>, max: number) => {
  while (m.size > max) m.delete(m.keys().next().value as K)
}

const newEpoch = () => Math.random().toString(36).slice(2, 10)

export const grantMemory = () => {
  type Held = { subject: Subject; line: SafeText }
  const pending = new Map<string, Held>()
  const refused = new Map<string, Held>()
  const grants = new Map<string, Subject>()
  let epoch = newEpoch()
  return {
    get epoch() {
      return epoch
    },
    hold(callId: string, subject: Subject, line: SafeText) {
      pending.set(callId, { subject, line })
      capped(pending, PENDING_MAX)
    },
    settle(callId: string, didRun: boolean): boolean {
      const held = pending.get(callId)
      pending.delete(callId)
      if (held === undefined || didRun) return false
      refused.set(callId, held)
      capped(refused, REFUSED_MAX)
      return true
    },
    allows(subject: Subject): string | null {
      let id: string | null = null
      for (const [denialId, s] of grants) if (s === subject) id = denialId
      return id
    },
    lineOf(denialId: string): SafeText | null {
      return refused.get(denialId)?.line ?? null
    },
    holds(denialId: string, at: string): boolean {
      return at === epoch && refused.has(denialId)
    },
    approve(denialId: string, at: string): boolean {
      const held = refused.get(denialId)
      if (at !== epoch || held === undefined) return false
      if (!grants.has(denialId)) grants.set(denialId, held.subject)
      capped(grants, GRANTS_MAX)
      return true
    },
    forgetGrants() {
      grants.clear()
    },
    reset() {
      pending.clear()
      refused.clear()
      grants.clear()
      epoch = newEpoch()
    },
  }
}

export type GrantMemory = ReturnType<typeof grantMemory>
