import type { AgentStatus, ToolCheckResult } from 'claude-code'

import type { Check, Gate, Grant } from '../types'
import type { SafeText } from './hygiene'

export type Subject = string & { readonly __subject: true }

const NEVER_GRANTED: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode', 'Agent', 'Task', 'SendMessage'])

const FILE_PATH_TOOLS: ReadonlySet<string> = new Set(['Read', 'Edit', 'Write', 'NotebookEdit'])
const SEARCH_TOOLS: ReadonlySet<string> = new Set(['Glob', 'Grep'])
const SHELL_TOOLS: ReadonlySet<string> = new Set(['Bash', 'PowerShell'])

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
  if (SHELL_TOOLS.has(tool)) return of(str('command'))
  if (FILE_PATH_TOOLS.has(tool)) return of(str('file_path') ?? str('notebook_path'))
  if (SEARCH_TOOLS.has(tool)) return of(str('path') ?? '', str('pattern'))
  if (tool === 'WebFetch') return of(str('url'))
  const { description: _, ...rest } = input
  return of(stable(rest))
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

const GRANT_ROWS_MAX = 32

export const approve = (g: Gate, id: string, at: number, epoch: string, evicted: readonly string[]): Gate => {
  const c = g.recent.find((r): r is Denial => r.id === id && r.verdict === 'deny')
  if (!c || rowOf(g, c, epoch).status !== 'approvable') return g
  const grant: Grant = { denialId: id, bucket: c.bucket, detail: c.detail, at, uses: 0, epoch }
  return { ...g, grants: [...g.grants.filter(x => !evicted.includes(x.denialId)), grant].slice(-GRANT_ROWS_MAX) }
}

export const markRetried = (g: Gate, id: string, at: number, epoch: string): Gate => {
  const c = g.recent.find((r): r is Denial => r.id === id && r.verdict === 'deny')
  if (!c || c.by !== 'refused' || rowOf(g, c, epoch).status !== 'approved') return g
  return { ...g, recent: g.recent.map(r => (r === c ? { ...c, retriedAt: at } : r)) }
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
const GRANTS_MAX = 32

const capped = <K, V>(m: Map<K, V>, max: number) => {
  while (m.size > max) m.delete(m.keys().next().value as K)
}

const newEpoch = () => Math.random().toString(36).slice(2, 10)

export const grantMemory = () => {
  const pending = new Map<string, Subject>()
  const refused = new Map<string, Subject>()
  const grants = new Map<Subject, string[]>()
  let epoch = newEpoch()
  return {
    get epoch() {
      return epoch
    },
    hold(callId: string, subject: Subject) {
      pending.set(callId, subject)
      capped(pending, PENDING_MAX)
    },
    settle(callId: string, didRun: boolean): boolean {
      const subject = pending.get(callId)
      pending.delete(callId)
      if (subject === undefined || didRun) return false
      refused.set(callId, subject)
      capped(refused, REFUSED_MAX)
      return true
    },
    allows(subject: Subject): string | null {
      return grants.get(subject)?.at(-1) ?? null
    },
    approve(denialId: string): { isApproved: boolean; evicted: string[] } {
      const subject = refused.get(denialId)
      if (subject === undefined) return { isApproved: false, evicted: [] }
      const ids = grants.get(subject) ?? []
      grants.delete(subject)
      grants.set(subject, ids.includes(denialId) ? ids : [...ids, denialId])
      const evicted: string[] = []
      while (grants.size > GRANTS_MAX) {
        const oldest = grants.keys().next().value as Subject
        evicted.push(...(grants.get(oldest) ?? []))
        grants.delete(oldest)
      }
      return { isApproved: true, evicted }
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
