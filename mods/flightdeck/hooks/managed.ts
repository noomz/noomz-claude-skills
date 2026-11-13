import { scrub } from './hygiene'
import type { SafeText } from './hygiene'

export const MANAGED_LIMIT = 2
export const MANAGED_PROMPT_CAP = 4_000
/** The long ones carry the answer, which Flightdeck never reads: a partial line past this is dropped. */
export const MANAGED_LINE_CAP = 8_192

export type ManagedProvider = 'pi-bolt'
export type ManagedStatus = 'starting' | 'live' | 'cancel-requested' | 'completed' | 'failed' | 'unavailable'
export type ManagedActivity = {
  spawnKey: string
  provider: ManagedProvider
  status: ManagedStatus
  sessionId: SafeText | null
  phase: SafeText | null
  exitCode: number | null
  signal: string | null
  startedAt: number
  lastAt: number
  endedAt: number | null
}

const PHASES = new Set(['session', 'agent_start', 'turn_start', 'turn_end', 'agent_end', 'agent_settled'])

export function managedPrompt(args: string): string | null {
  const prompt = args.trim()
  if (!prompt || prompt.length > MANAGED_PROMPT_CAP || /[\u0000-\u001f\u007f]/.test(prompt)) return null
  return prompt
}

export function managedArgv(prompt: string): readonly string[] {
  return ['pi-bolt', '--mode', 'json', '--no-session', '--no-tools', '--offline', '--', prompt]
}

export function managedHeader(text: string): { sessionId: SafeText } | null {
  const line = text.split('\n', 1)[0] ?? ''
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed) || parsed.type !== 'session' || !('id' in parsed)) return null
  const id = parsed.id
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return null
  const safe = scrub(id, 64).text
  return safe === id ? { sessionId: safe } : null
}

export function managedPhase(text: string): SafeText | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed) || typeof parsed.type !== 'string' || !PHASES.has(parsed.type)) return null
  const safe = scrub(parsed.type, 40).text
  return safe === parsed.type ? safe : null
}

export function startManaged(spawnKey: string, at: number): ManagedActivity {
  return { spawnKey, provider: 'pi-bolt', status: 'starting', sessionId: null, phase: null, exitCode: null, signal: null, startedAt: at, lastAt: at, endedAt: null }
}

const same = (activity: ManagedActivity, spawnKey: string) => activity.spawnKey === spawnKey

export function identifyManaged(activity: ManagedActivity, spawnKey: string, sessionId: SafeText, at: number): ManagedActivity {
  if (!same(activity, spawnKey) || activity.status !== 'starting') return activity
  return { ...activity, status: 'live', sessionId, phase: scrub('session', 40).text, lastAt: at }
}

export function advanceManaged(activity: ManagedActivity, spawnKey: string, phase: SafeText, at: number): ManagedActivity {
  if (!same(activity, spawnKey) || (activity.status !== 'live' && activity.status !== 'cancel-requested')) return activity
  return { ...activity, phase, lastAt: at }
}

export function requestCancelManaged(activity: ManagedActivity, spawnKey: string, at: number): ManagedActivity {
  if (!same(activity, spawnKey) || activity.endedAt !== null || activity.status === 'unavailable') return activity
  return { ...activity, status: 'cancel-requested', lastAt: at }
}

export function finishManaged(activity: ManagedActivity, spawnKey: string, exitCode: number | null, signal: string | null, at: number): ManagedActivity {
  if (!same(activity, spawnKey) || activity.endedAt !== null) return activity
  if (activity.status === 'cancel-requested') return { ...activity, status: 'unavailable', exitCode, signal, endedAt: at, lastAt: at }
  if (activity.status !== 'live') return { ...activity, status: 'unavailable', sessionId: null, phase: null, exitCode, signal, endedAt: at, lastAt: at }
  return { ...activity, status: exitCode === 0 && signal === null ? 'completed' : 'failed', exitCode, signal, endedAt: at, lastAt: at }
}

export function failManaged(activity: ManagedActivity, spawnKey: string, at: number): ManagedActivity {
  if (!same(activity, spawnKey) || activity.endedAt !== null) return activity
  return { ...activity, status: 'unavailable', sessionId: null, phase: null, endedAt: at, lastAt: at }
}

export function managedLabel(activity: ManagedActivity): 'live' | 'completed' | 'unavailable' {
  if (activity.status === 'live' || activity.status === 'cancel-requested') return 'live'
  if (activity.status === 'completed') return 'completed'
  return 'unavailable'
}
