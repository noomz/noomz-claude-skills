/** Text that went through scrub() in hooks/hygiene.ts; the same brand, restated because a contract imports nothing. */
export type SafeText = string & { readonly __safe: true }

export type Hygiene = { masked: number; rejected: number }

export type Moment = 'before a plan' | 'error repeats' | 'before done'

export type Bucket = 'file' | 'shell' | 'other'

export type Refuser = 'person' | 'dontAsk' | 'hook'

export type Main = {
  model: string
  effort: string
  mode: string
  steps: number
  isRunning: boolean
  /** The main loop's last answered request: time to its first piece of response, and output tokens
   *  per second from that piece to the stop. Null until one is measured, absent in older state. */
  speed?: { ttftMs: number; tokPerS: number | null } | null
}

export type Usage = {
  pct: number | null
  tokens: number | null
  window: number
  costUsd: number | null
  /** `resetsAt`: when the window resets, in ms since the epoch; null when the API gave no time,
   *  absent in state saved before it was kept. */
  limits: { kind: string; pct: number; resetsAt?: number | null }[]
  compactions: number
  lastCompactAt: number | null
}

export type Consult = { id: string; at: number; endAt: number | null; moment: Moment; via: SafeText }

export type Architect = { consults: Consult[]; ids: string[]; seen: string[]; lastAdvice: SafeText }

export type CheckBase = {
  /** The call's tool_use_id; a refusal's id is its call's. */
  id: string
  bucket: Bucket
  detail: SafeText
  /** The loop the call ran in; null for the main loop. */
  agentId: string | null
  at: number
}

/**
 * rule: core allowed it. granted: allowed because you approved it here. cleared: asked, then ran.
 * ask: put to the decider, pending; `approvable` when the ask was plain and its identity is held.
 * deny by rule, hook or policy: core refused it; `cause` names the rule or hook. deny refused: asked,
 * then refused; approvable only in the `epoch` (the memory generation) that holds its identity and only
 * when the refuser is not a hook. `refuser` is null when the loop's end settled it, with no sentence to read.
 */
export type Check =
  | (CheckBase & { verdict: 'rule' | 'cleared' | 'granted' })
  | (CheckBase & { verdict: 'ask'; approvable: boolean })
  | (CheckBase & { verdict: 'deny'; by: 'rule' | 'hook' | 'policy'; cause: SafeText })
  | (CheckBase & { verdict: 'deny'; by: 'refused'; refuser: Refuser | null; approvable: boolean; epoch: string; retriedAt: number | null })

export type Verdict = Check['verdict']

export type Tally = Record<Verdict, number>

/** One approval, as drawn: the refusal it came from and what you saw. The call itself is never kept. */
export type Grant = { denialId: string; bucket: Bucket; detail: SafeText; at: number; uses: number; epoch: string }

export type Gate = { recent: Check[]; totals: Record<Bucket, Tally>; grants: Grant[] }

export type ToolNote = { text: SafeText; isError: boolean }

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

/** `expanded`: the card whose summary shows because Claude Code would not show its transcript, and why. */
export type View = { expanded: string | null; viewDeny: SafeText | null; gateOpen: Bucket | 'denied' | null; layout: Layout | null }

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
