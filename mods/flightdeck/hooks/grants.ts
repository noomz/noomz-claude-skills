// The only place flightdeck may turn a verdict into allow, and everything that decides it. Pure but
// for grantMemory, which holds the calls' identities: they live in module memory only, never in
// state and never drawn, so a command's text cannot leak through the pane or the store.
import type { AgentStatus, ToolCheckResult } from 'claude-code'

import type { Check, Gate, Grant } from '../types'
import type { SafeText } from './hygiene'

/** A call's exact identity, the thing a grant matches on. Memory only: never stored, never drawn. */
export type Subject = string & { readonly __subject: true }

/**
 * Tools no grant may lift: a question or a plan approval needs the person (the engine ignores a hook's
 * allow there anyway), and an agent or a message carries a task nobody saw in full.
 */
const NEVER_GRANTED: ReadonlySet<string> = new Set(['AskUserQuestion', 'ExitPlanMode', 'Agent', 'Task', 'SendMessage'])

const FILE_PATH_TOOLS: ReadonlySet<string> = new Set(['Read', 'Edit', 'Write', 'NotebookEdit'])
const SEARCH_TOOLS: ReadonlySet<string> = new Set(['Glob', 'Grep'])
const SHELL_TOOLS: ReadonlySet<string> = new Set(['Bash', 'PowerShell'])

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * True when core's verdict is an ask nobody configured: no settings rule, no hook, no option's own
 * check, no hook demanding a person, no organization ceiling. Never true for allow or deny, so no
 * grant can lift a deny of any origin.
 */
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

/**
 * The identity a grant matches on; null when the call is never grantable.
 * - Bash, PowerShell: the command exactly as given, so `git push` does not cover `git push --force`.
 * - Read, Edit, Write, NotebookEdit: the path; a retried edit's content always differs.
 * - Glob, Grep: the path and the pattern. WebFetch: the exact URL.
 * - Any other tool: its whole input as stable JSON, less its `description`.
 */
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

/** The subject flightdeck may answer allow for: a plain ask outside plan mode, of a grantable call. */
export const askSubject = (v: ToolCheckResult, tool: string, input: unknown, mode: string): Subject | null =>
  isPlainAsk(v) && mode !== 'plan' ? identityOf(tool, input) : null

/** The verdict for a call you approved; the reason is what the transcript shows. */
export const grantedVerdict = (detail: SafeText): ToolCheckResult => ({
  decision: 'allow',
  reason: `approved in flightdeck for this session (${detail})`,
})

/** The fixed text a retry sends, built only from the scrubbed detail, so no session text leaves in it. */
export const retryText = (detail: SafeText) =>
  `flightdeck: the person approved ${detail} for this session after it was refused. If that call is still needed, make it again now, unchanged.`

export type Denial = Extract<Check, { verdict: 'deny' }>

/**
 * Where a refusal stands. blocked: core refused it, or the ask came from configuration, so it is
 * shown and never approvable. expired: its identity was held by another load or before a reset.
 */
export type DenialStatus = 'blocked' | 'approvable' | 'expired' | 'approved' | 'retried'

export type DenialRow = { check: Denial; status: DenialStatus; grant: Grant | null }

const rowOf = (g: Gate, c: Denial, epoch: string): DenialRow => {
  if (c.by !== 'refused' || !c.approvable) return { check: c, status: 'blocked', grant: null }
  if (c.epoch !== epoch) return { check: c, status: 'expired', grant: null }
  const grant = g.grants.find(x => x.denialId === c.id && x.epoch === epoch) ?? null
  if (!grant) return { check: c, status: 'approvable', grant }
  return { check: c, status: c.retriedAt === null ? 'approved' : 'retried', grant }
}

/** The denied list as drawn: newest first, at most `n`. */
export const denialRows = (g: Gate, n: number, epoch: string): DenialRow[] =>
  g.recent
    .filter((c): c is Denial => c.verdict === 'deny')
    .slice(-n)
    .reverse()
    .map(c => rowOf(g, c, epoch))

const GRANT_ROWS_MAX = 32

/**
 * Records your approval of denial `id`, after the memory granted it: a no-op unless the row is
 * approvable in this epoch, so approving twice keeps one. Drops the grants the memory evicted.
 */
export const approve = (g: Gate, id: string, at: number, epoch: string, evicted: readonly string[]): Gate => {
  const c = g.recent.find((r): r is Denial => r.id === id && r.verdict === 'deny')
  if (!c || rowOf(g, c, epoch).status !== 'approvable') return g
  const grant: Grant = { denialId: id, bucket: c.bucket, detail: c.detail, at, uses: 0, epoch }
  return { ...g, grants: [...g.grants.filter(x => !evicted.includes(x.denialId)), grant].slice(-GRANT_ROWS_MAX) }
}

/** Marks denial `id` retried; a no-op unless it is approved and not yet retried, so a double press sends once. */
export const markRetried = (g: Gate, id: string, at: number, epoch: string): Gate => {
  const c = g.recent.find((r): r is Denial => r.id === id && r.verdict === 'deny')
  if (!c || c.by !== 'refused' || rowOf(g, c, epoch).status !== 'approved') return g
  return { ...g, recent: g.recent.map(r => (r === c ? { ...c, retriedAt: at } : r)) }
}

/** Counts one call your grant for denial `denialId` allowed. */
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

/** How to retry a refusal, given its loop's status in `$.agent.list()` (undefined: not listed). */
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

/**
 * The identities behind plain asks (by call id), behind their refusals (by denial id, which is the
 * call id), and the grants you made. `epoch` names this generation: a reset starts a new one, so a
 * denial or grant recorded under another reads as expired, its identity gone.
 */
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
    /** Settles a held ask; true when it was refused and its identity is kept for an approval. */
    settle(callId: string, didRun: boolean): boolean {
      const subject = pending.get(callId)
      pending.delete(callId)
      if (subject === undefined || didRun) return false
      refused.set(callId, subject)
      capped(refused, REFUSED_MAX)
      return true
    },
    /** The denial whose grant allows this call, or null when none does. */
    allows(subject: Subject): string | null {
      return grants.get(subject)?.at(-1) ?? null
    },
    /**
     * Grants the call refused as `denialId`. Approving twice keeps one grant. `evicted` names the
     * denials whose grant the cap dropped; isApproved is false when no identity is held for it.
     */
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
