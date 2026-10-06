/** Text that went through scrub() in hooks/hygiene.ts; the same brand, restated because a contract imports nothing. */
export type SafeText = string & { readonly __safe: true }

export type Hygiene = { masked: number; rejected: number }

export type Moment = 'before a plan' | 'error repeats' | 'before done'

export type Bucket = 'file' | 'shell' | 'other'

/** rule: settings allowed it. ask: put to the decider, outcome pending. cleared: asked, then ran. deny: refused. */
export type Verdict = 'rule' | 'ask' | 'cleared' | 'deny'

export type Main = { model: string; effort: string; mode: string; steps: number; isRunning: boolean }

export type Usage = {
  pct: number | null
  tokens: number | null
  window: number
  costUsd: number | null
  limits: { kind: string; pct: number }[]
  compactions: number
  lastCompactAt: number | null
}

export type Consult = { id: string; at: number; endAt: number | null; moment: Moment; via: SafeText }

export type Architect = { consults: Consult[]; ids: string[]; seen: string[]; lastAdvice: SafeText }

export type Check = {
  id: string
  tool: string
  bucket: Bucket
  verdict: Verdict
  inSubagent: boolean
  detail: SafeText
  at: number
}

export type Tally = { rule: number; ask: number; cleared: number; deny: number }

export type Gate = { recent: Check[]; totals: Record<Bucket, Tally> }

export type ToolNote = { tool: string; text: SafeText; isError: boolean }

export type AgentCard = {
  id: string
  type: SafeText
  model: string
  description: SafeText
  status: string
  spawnedAt: number
  endedAt: number | null
  /** How long its loop ran, from its turn.complete. */
  durationMs: number | null
  /** The agent's context now: input + cache read + cache write of its latest step. */
  ctx: number
  /** Output tokens summed over its steps. */
  out: number
  steps: number
  lastStop: string | null
  tools: ToolNote[]
}

/** A model loop whose id matches no card: a workflow agent, a compaction or a memory fork. */
export type Loop = { id: string; steps: number; firstAt: number; lastAt: number; isDone: boolean }

export type LogLine = {
  at: number
  who: SafeText
  text: SafeText
  agentId: string | null
  kind: 'info' | 'error' | 'consult' | 'done'
}

export type Turn = {
  edits: number
  errorStreak: number
  errors: number
  isReviewing: boolean
  startedAt: number
  costAtStart: number | null
}

export type Receipt = {
  durationMs: number
  agents: number
  edits: number
  errors: number
  costDelta: number | null
  reason: string
}

export type Layout = 'auto' | 'compact' | 'wide' | 'mini'

export type View = { expanded: string | null; gateOpen: Bucket | null; layout: Layout | null }

export type Roster = { architectTypes: SafeText[] }

declare module 'claude-code' {
  interface PluginState {
    'flightdeck': {
      meta: { schemaVersion: number }
      main: Main
      usage: Usage
      architect: Architect
      gate: Gate
      agents: AgentCard[]
      loops: Loop[]
      log: LogLine[]
      turn: Turn
      receipt: Receipt | null
      view: View
      roster: Roster
      hygiene: Hygiene
    }
  }
}
