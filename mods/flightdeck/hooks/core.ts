// Pure data: defaults, reducers, formatting and layout math. Nothing here touches `$`, so every
// behaviour is testable directly (the test kit cannot raise a subagent's tool call or a
// permission check inside a call; these functions are what the hooks apply).
import type { ToolCheckResult } from 'claude-code'

import type {
  AgentCard,
  Architect,
  Bucket,
  Check,
  Consult,
  Gate,
  Grant,
  Layout,
  LogLine,
  Loop,
  Main,
  Moment,
  Receipt,
  Roster,
  Tally,
  ToolNote,
  Turn,
  Usage,
  Verdict,
  View,
} from '../types'
import { scrub } from './hygiene'
import type { Hygiene, SafeText, Scrubbed } from './hygiene'

export const SCHEMA_VERSION = 4

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export const isCurrentSchema = (meta: unknown) => isObject(meta) && meta.schemaVersion === SCHEMA_VERSION

export const CAP = { description: 80, name: 40, detail: 64, advice: 160, who: 40, line: 160, cause: 40, viewDeny: 64 } as const

export const NO_TEXT = '' as SafeText

const UNCUT = Number.MAX_SAFE_INTEGER

export const kept = (raw: unknown, cap: number, derive: (masked: SafeText) => string = s => s): Scrubbed => {
  const whole = scrub(raw, UNCUT)
  const text = derive(whole.text)
  if (text === whole.text && text.length <= cap) return { text: text as SafeText, masked: whole.masked }
  const again = scrub(text, cap)
  return { text: again.text, masked: whole.masked + again.masked }
}

// ---------------------------------------------------------------- defaults

export const DEFAULT_MAIN: Main = { model: '', effort: '', mode: '', steps: 0, isRunning: false, speed: null }
export const DEFAULT_USAGE: Usage = {
  pct: null,
  tokens: null,
  window: 0,
  costUsd: null,
  limits: [],
  compactions: 0,
  lastCompactAt: null,
}
export const DEFAULT_ARCHITECT: Architect = { consults: [], ids: [], seen: [], lastAdvice: NO_TEXT }
const ZERO: Tally = { rule: 0, granted: 0, ask: 0, cleared: 0, deny: 0 }
export const DEFAULT_GATE: Gate = { recent: [], totals: { file: ZERO, shell: ZERO, other: ZERO }, grants: [] }
export const DEFAULT_TURN: Turn = { edits: 0, errorStreak: 0, errors: 0, isReviewing: false, startedAt: 0, costAtStart: null }
export const DEFAULT_VIEW: View = { expanded: null, viewDeny: null, gateOpen: null, layout: null }
export const DEFAULT_ROSTER: Roster = { architectTypes: [] }
export const DEFAULT_HYGIENE: Hygiene = { masked: 0, rejected: 0 }

/** A stored object merged over its defaults, so a value saved under an older shape still reads. */
export const normalize = <T extends object>(def: T, stored: unknown): T =>
  isObject(stored) ? ({ ...def, ...stored } as T) : def

/** A stored list, or empty when what is stored is not a list. */
export const listOf = <T>(stored: unknown): T[] => (Array.isArray(stored) ? (stored as T[]) : [])

export const normalizeGate = (stored: unknown): Gate => {
  const g = normalize(DEFAULT_GATE, stored)
  const totals = normalize(DEFAULT_GATE.totals, g.totals)
  return {
    recent: listOf<Check>(g.recent),
    totals: { file: normalize(ZERO, totals.file), shell: normalize(ZERO, totals.shell), other: normalize(ZERO, totals.other) },
    grants: listOf<Grant>(g.grants),
  }
}

export const normalizeCard = (stored: unknown): AgentCard =>
  normalize<AgentCard>(
    {
      id: '',
      type: 'agent' as SafeText,
      model: '',
      description: NO_TEXT,
      status: 'running',
      spawnedAt: 0,
      endedAt: null,
      durationMs: null,
      ctx: 0,
      out: 0,
      steps: 0,
      lastStop: null,
      tools: [],
    },
    stored,
  )

export const normalizeLog = (stored: unknown): LogLine[] =>
  listOf<Record<string, unknown>>(stored).map(l => ({
    at: typeof l.at === 'number' ? l.at : 0,
    who: String(l.who ?? '') as SafeText,
    text: String(l.text ?? '') as SafeText,
    agentId: typeof l.agentId === 'string' ? l.agentId : null,
    kind: l.kind === 'error' || l.kind === 'consult' || l.kind === 'done' ? l.kind : 'info',
  }))

// ---------------------------------------------------------------- config

export type Panel = 'main' | 'architect' | 'gate' | 'agents' | 'loops' | 'receipt' | 'log'
const PANELS: readonly Panel[] = ['main', 'architect', 'gate', 'agents', 'loops', 'receipt', 'log']

export type Config = {
  architect: RegExp
  architectLabel: string
  gateLabel: string
  panels: Panel[]
  motion: boolean
  moments: boolean
  matchDescriptions: boolean
  maxCards: number
  layout: Layout
  palette: Palette
  openOnStart: boolean
  statusLine: boolean
}

const safeRegExp = (source: string, fallback: string) => {
  try {
    return new RegExp(source || fallback, 'i')
  } catch {
    return new RegExp(fallback, 'i')
  }
}

/** The plugin's `/config` values, read leniently: anything malformed falls back to the default. */
export const parseConfig = (o: Readonly<Record<string, unknown>>): Config => {
  const str = (k: string, d: string) => (typeof o[k] === 'string' && o[k] !== '' ? (o[k] as string) : d)
  const bool = (k: string, d: boolean) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : d)
  const panels = str('panels', PANELS.join(','))
    .split(',')
    .map(s => s.trim())
    .filter((p): p is Panel => (PANELS as readonly string[]).includes(p))
  const layout = str('layout', 'auto')
  const max = typeof o.maxCards === 'number' ? Math.round(o.maxCards) : 3
  return {
    architect: safeRegExp(str('architectPattern', ''), 'advisor|architect'),
    architectLabel: str('architectLabel', 'ARCHITECT'),
    gateLabel: str('gateLabel', 'GATE'),
    panels: panels.length > 0 ? [...new Set(panels)] : [...PANELS],
    motion: str('motion', 'while-active') !== 'off',
    moments: bool('moments', true),
    matchDescriptions: bool('matchDescriptions', false),
    maxCards: Math.min(6, Math.max(1, max)),
    layout: layout === 'compact' || layout === 'wide' || layout === 'mini' ? layout : 'auto',
    palette: str('palette', 'theme') === 'pastel' ? 'pastel' : 'theme',
    openOnStart: bool('openOnStart', true),
    statusLine: bool('statusLine', true),
  }
}

// ---------------------------------------------------------------- palette

export type Palette = 'theme' | 'pastel'
export type Colors = Record<'main' | 'agent' | 'gate' | 'cleared' | 'arch' | 'amber' | 'warn' | 'dim' | 'faint' | 'text', string>

/**
 * `theme` names the person's own theme colours (they follow light, dark and colour-blind themes);
 * `pastel` is fixed hex tuned for dark terminals.
 */
export const PALETTES: Record<Palette, Colors> = {
  theme: {
    main: 'claude',
    agent: 'suggestion',
    gate: 'success',
    cleared: 'permission',
    arch: 'merged',
    amber: 'warning',
    warn: 'error',
    dim: 'inactive',
    faint: 'subtle',
    text: 'text',
  },
  pastel: {
    main: '#7dd3fc',
    agent: '#93c5fd',
    gate: '#86efac',
    cleared: '#5eead4',
    arch: '#c4b5fd',
    amber: '#fcd34d',
    warn: '#fca5a5',
    dim: '#6b7280',
    faint: '#3f4654',
    text: '#e5e7eb',
  },
}

/** SVG cannot name theme keys: mid-tone colours that read on light and dark backgrounds. */
export const SVG_COLORS = { running: '#3b82f6', done: '#16a34a', failed: '#dc2626', other: '#8b5cf6', label: '#6b7280' }

// ---------------------------------------------------------------- formatting

/** `claude-opus-5-5` → `Opus 5.5`; anything else is shown as given. */
/**
 * A model id as people say it, from any provider's spelling: `claude-opus-5-5[1m]` → `Opus 5.5 1M`,
 * `us.anthropic.claude-sonnet-4-5-20250929-v1:0` → `Sonnet 4.5`, `claude-3-5-haiku-20241022` →
 * `Haiku 3.5`. Anything else is shown as given, cut to 22 characters.
 */
export const prettyModel = (id: string) => {
  if (!id) return '—'
  const cap = (f: string) => f.charAt(0).toUpperCase() + f.slice(1)
  const big = /\[1m\]|-1m\b/i.test(id) ? ' 1M' : ''
  const now = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?![\d])/i.exec(id)
  if (now?.[1] && !/^\d/.test(now[1])) return `${cap(now[1].toLowerCase())} ${now[2]}${now[3] ? `.${now[3]}` : ''}${big}`
  const old = /claude-(\d+)(?:-(\d))?-([a-z]+)/i.exec(id)
  if (old?.[3]) return `${cap(old[3].toLowerCase())} ${old[1]}${old[2] ? `.${old[2]}` : ''}${big}`
  return shorten(id, 22)
}

const MASK = '[masked]'

export const shorten = (s: string, n: number) => {
  const one = s.replace(/\s+/g, ' ').trim()
  if (n <= 0) return ''
  if (one.length <= n) return one
  let at = Math.max(0, n - 1)
  const open = one.lastIndexOf('[', at - 1)
  if (open >= 0 && open + MASK.length > at && one.startsWith(MASK, open)) at = open
  return `${one.slice(0, at).trimEnd()}…`
}

export const kTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

/** A running clock as the live cards draw it: m:ss, or XhYY past an hour. */
export const fmtTimer = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

export const fmtClock = (ms: number) => (ms > 0 ? new Date(ms).toTimeString().slice(0, 8) : '--:--:--')

/** `1 error`, `2 errors`. */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const fmtUsd = (n: number) => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`)

/**
 * How fast a request answered, from three readings of the clock: when it was sent, when its first
 * piece of response arrived, and when it stopped. Null when no response came. `tokPerS` is null
 * when there is no usage or no time between the first piece and the stop to divide by.
 */
export const stepSpeed = (sentAt: number, firstAt: number | null, stopAt: number, outTokens: number | null) => {
  if (firstAt === null) return null
  const decodeMs = stopAt - firstAt
  return {
    ttftMs: Math.max(0, firstAt - sentAt),
    tokPerS: outTokens !== null && outTokens > 0 && decodeMs > 0 ? (outTokens * 1000) / decodeMs : null,
  }
}

/** A stored speed, or null when what is stored is not one: the pane draws only numbers from state. */
export const speedOf = (stored: unknown): NonNullable<Main['speed']> | null => {
  if (!isObject(stored) || !Number.isFinite(stored.ttftMs)) return null
  const tokPerS = Number.isFinite(stored.tokPerS) ? (stored.tokPerS as number) : null
  return { ttftMs: stored.ttftMs as number, tokPerS }
}

/** `ttft 0.8s · 42 tok/s`; the rate is left off when it is unknown. */
export const fmtSpeed = (s: { ttftMs: number; tokPerS: number | null }) =>
  `ttft ${(s.ttftMs / 1000).toFixed(1)}s` + (s.tokPerS !== null ? ` · ${Math.round(s.tokPerS)} tok/s` : '')

/** A gauge of `width` cells: ▰ filled, ▱ empty. */
export const gauge = (pct: number, width: number) => {
  const full = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return { on: '▰'.repeat(full), off: '▱'.repeat(width - full) }
}

/** A rate-limit reading as the pane keeps it, its ISO reset time turned into ms since the epoch. */
export const limitOf = (r: { kind: string; percentUsed: number; resetsAt?: string }) => {
  const at = r.resetsAt ? Date.parse(r.resetsAt) : NaN
  return { kind: r.kind, pct: r.percentUsed, resetsAt: Number.isFinite(at) ? at : null }
}

/** Time left until a window resets, its two largest units: `25m`, `3h10m`, `4d2h`; empty when unknown or past. */
export const fmtResetIn = (resetsAt: unknown, now: number) => {
  if (typeof resetsAt !== 'number' || !Number.isFinite(resetsAt) || resetsAt <= now) return ''
  const m = Math.max(1, Math.floor((resetsAt - now) / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return `${d}d${h}h`
  return h > 0 ? `${h}h${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

/** A rate-limit window's short name: `five_hour` → `5h`, `seven_day_opus` → `7d opus`. */
export const limitLabel = (kind: string) =>
  kind
    .replace(/five[_ -]?hours?/i, '5h')
    .replace(/seven[_ -]?days?/i, '7d')
    .replace(/[_-]+/g, ' ')
    .trim()

// ---------------------------------------------------------------- tools and gate

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit', 'Glob', 'Grep'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

export const bucketOf = (tool: string): Bucket =>
  FILE_TOOLS.has(tool) ? 'file' : SHELL_TOOLS.has(tool) ? 'shell' : 'other'

const lastSegments = (path: string, n: number) => path.split(/[\\/]/).filter(Boolean).slice(-n).join('/')

const OPENING_PROGRAM = /^[ \t\r\n]*([\w./][\w./-]*)(?=[ \t\r\n]|$)/

const programOf = (command: string) => OPENING_PROGRAM.exec(command)?.[1] ?? ''

const HOST = /^[a-z0-9._-]+$|^\[[0-9a-f:.]+\]$/i

/**
 * A URL's parsed host, when its authority reads as `host` or `user:pass@host`: a user name or
 * password with a percent-encoded character (a space, a quote, an `=`, a second `@`) is prose
 * the parser split at an `@`, and a host outside the DNS or IP shape is not a host. A URL holding a
 * tab or a line break has no host, since the parser drops those and can glue a credential into one.
 */
const hostOf = (url: string) => {
  try {
    if (/[\t\n\r]/.test(url)) return ''
    const u = new URL(url)
    if (u.username.includes('%') || u.password.includes('%') || !HOST.test(u.hostname)) return ''
    const at = url.toLowerCase().indexOf(u.hostname)
    return at < 0 ? u.hostname : url.slice(at, at + u.hostname.length)
  } catch {
    return ''
  }
}

const KEY_MARK = /[=:'"`\s]|--/
const DRIVE = /^[A-Za-z]:[\\/]/
const FRAME = ' → '
const SLASH = /[\\/]/

const programPart = (word: SafeText) => (SLASH.test(word) ? lastSegments(word, 1) : word)

const pathSegments = (path: SafeText) => lastSegments(path, 2)

const TOOL_NAMES = new Map<string, Scrubbed>()

const toolName = (tool: string): Scrubbed => {
  const known = TOOL_NAMES.get(tool)
  if (known) return known
  if (TOOL_NAMES.size >= 64) TOOL_NAMES.clear()
  const name = scrub(tool, CAP.detail)
  TOOL_NAMES.set(tool, name)
  return name
}

const detailOf = (tool: string, part: string, derive?: (masked: SafeText) => string): Scrubbed => {
  const name = toolName(tool)
  const room = CAP.detail - name.text.length - FRAME.length
  if (!part || room < 1) return name
  const shown = kept(part, room, derive)
  return shown.text ? { text: `${name.text}${FRAME}${shown.text}` as SafeText, masked: name.masked + shown.masked } : name
}

export const toolDetail = (tool: string, input: unknown): Scrubbed => {
  const i = isObject(input) ? input : {}
  const str = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  const path = str('file_path') || str('notebook_path') || str('path')
  if (str('command')) return detailOf(tool, programOf(str('command')), programPart)
  if (!path) return detailOf(tool, hostOf(str('url')))
  const holdsKey = KEY_MARK.test(DRIVE.test(path) ? path.slice(2) : path)
  return holdsKey ? detailOf(tool, path, pathSegments) : detailOf(tool, lastSegments(path, 2))
}

const isApprovable = (c: Check) => (c.verdict === 'ask' || (c.verdict === 'deny' && c.by === 'refused')) && c.approvable

const KEPT_APPROVABLE = 8

const isDeniedApprovable = (c: Check) => c.verdict === 'deny' && isApprovable(c)

const retained = (list: Check[]): Set<Check> => new Set(list.filter(isDeniedApprovable).slice(-KEPT_APPROVABLE))

export const trimRecent = (list: Check[], max: number): Check[] => {
  let extra = list.length - max
  if (extra <= 0) return list
  const keptApprovable = retained(list)
  const isPending = (c: Check) => c.verdict === 'ask'
  const out: Check[] = []
  for (const c of list) {
    if (extra > 0 && !isPending(c) && !keptApprovable.has(c)) {
      extra -= 1
      continue
    }
    out.push(c)
  }
  return out.slice(-max * 2)
}

const counted = (g: Gate, bucket: Bucket, plus: Verdict, minus?: Verdict) => {
  const t = g.totals[bucket]
  const next: Tally = { ...t, [plus]: t[plus] + 1 }
  if (minus) next[minus] = Math.max(0, t[minus] - 1)
  return { ...g.totals, [bucket]: next }
}

export const recordCheck = (g: Gate, c: Check): Gate => ({
  ...g,
  recent: trimRecent([...g.recent, c], 80),
  totals: counted(g, c.bucket, c.verdict),
})

export const denyCause = (v: ToolCheckResult) => v.rule ?? v.hook ?? ''

export const checkOf = (
  base: { id: string; bucket: Bucket; detail: SafeText; agentId: string | null; at: number },
  v: ToolCheckResult,
  o: { isGranted: boolean; approvable: boolean; cause: SafeText },
): Check => {
  if (o.isGranted) return { ...base, verdict: 'granted' }
  if (v.decision === 'allow') return { ...base, verdict: 'rule' }
  if (v.decision === 'ask') return { ...base, verdict: 'ask', approvable: o.approvable }
  return { ...base, verdict: 'deny', by: v.rule ? 'rule' : v.hook ? 'hook' : 'policy', cause: o.cause }
}

export type Settle = { didRun: true } | { didRun: false; isHeld: boolean; epoch: string }

// The engine's two sentences for a call nobody let run, as Claude Code 2.1.304 words them: dontAsk's
// "Permission to use <tool> denied" and a person's No, "The user doesn't want to proceed". A rewording
// fails safe: the call reads as ran, so its row is cleared and never approvable.
const ENGINE_REFUSAL = /^(?:Permission to use \S+ (?:has been )?denied|The user doesn't want to proceed with this tool use)/

export const isRefusal = (r: { deny?: string; isError?: boolean; text?: string }) =>
  r.deny !== undefined || (r.isError === true && ENGINE_REFUSAL.test(r.text ?? ''))

/**
 * The asks still open in one loop (`null` for the main loop). A loop's turn cannot end while it has a
 * dialog open or a tool running, so at its turn.complete each of these was refused: a backstop for a
 * refusal whose text isRefusal does not match.
 */
export const pendingAsks = (g: Gate, agentId: string | null) => g.recent.filter(c => c.verdict === 'ask' && c.agentId === agentId)

export const settleCheck = (g: Gate, id: string, s: Settle): Gate => {
  const c = g.recent.find(r => r.id === id && r.verdict === 'ask')
  if (!c || c.verdict !== 'ask') return g
  const { approvable: wasPlain, ...base } = c
  const next: Check = s.didRun
    ? { ...base, verdict: 'cleared' }
    : { ...base, verdict: 'deny', by: 'refused', approvable: wasPlain && s.isHeld, epoch: s.epoch, retriedAt: null }
  return {
    ...g,
    recent: g.recent.map(r => (r === c ? next : r)),
    totals: counted(g, c.bucket, next.verdict, 'ask'),
  }
}

export const gateSummary = (g: Gate) => {
  const all = (['file', 'shell', 'other'] as const).reduce(
    (s, k) => ({
      rule: s.rule + g.totals[k].rule,
      granted: s.granted + g.totals[k].granted,
      ask: s.ask + g.totals[k].ask,
      cleared: s.cleared + g.totals[k].cleared,
      deny: s.deny + g.totals[k].deny,
    }),
    { ...ZERO },
  )
  return { ...all, total: all.rule + all.granted + all.ask + all.cleared + all.deny }
}

// ---------------------------------------------------------------- turn and architect

/**
 * The turn after one tool call. Errors count in the main loop only (a subagent's failure is its
 * own); edits count from every loop, so delegated work still reaches "before done".
 */
export const afterCall = (t: Turn, c: { inSubagent: boolean; hasFailed: boolean; isEdit: boolean }): Turn => ({
  ...t,
  errorStreak: c.inSubagent ? t.errorStreak : c.hasFailed ? t.errorStreak + 1 : 0,
  errors: t.errors + (!c.inSubagent && c.hasFailed ? 1 : 0),
  edits: t.edits + (c.isEdit ? 1 : 0),
})

/** Which of the architect's three moments a consult falls at: an inference over this turn so far. */
export const momentOf = (t: Pick<Turn, 'edits' | 'errorStreak'>): Moment =>
  t.errorStreak >= 2 ? 'error repeats' : t.edits === 0 ? 'before a plan' : 'before done'

export const startConsult = (a: Architect, c: Omit<Consult, 'endAt'>): Architect =>
  a.consults.some(x => x.id === c.id) ? a : { ...a, consults: [...a.consults, { ...c, endAt: null }].slice(-40) }

/** Ends the open consult (the latest without an end), or the one named. */
export const endConsult = (a: Architect, at: number, advice: SafeText | null, id?: string): Architect => {
  const open = [...a.consults].reverse().find(c => c.endAt === null && (id === undefined || c.id === id))
  return {
    ...a,
    consults: a.consults.map(c => (c === open ? { ...c, endAt: at } : c)),
    lastAdvice: advice ?? a.lastAdvice,
  }
}

export const isAdvising = (a: Architect) => a.consults.some(c => c.endAt === null)

/** A one-row timeline of consults across `width` cells: ◆ a consult, ━ while it ran. */
export const consultTimeline = (a: Architect, now: number, width: number) => {
  if (a.consults.length === 0 || width < 4) return '─'.repeat(Math.max(0, width))
  const first = a.consults[0]?.at ?? now
  const span = Math.max(1, now - first)
  const cells = Array.from({ length: width }, () => '─')
  for (const c of a.consults) {
    const from = Math.min(width - 1, Math.floor(((c.at - first) / span) * (width - 1)))
    const to = Math.min(width - 1, Math.floor((((c.endAt ?? now) - first) / span) * (width - 1)))
    for (let i = from + 1; i <= to; i += 1) cells[i] = '━'
    cells[from] = '◆'
  }
  return cells.join('')
}

export const receiptOf = (t: Turn, o: { durationMs: number; agentsSince: number; costNow: number | null; reason: string }): Receipt => ({
  durationMs: o.durationMs,
  agents: o.agentsSince,
  edits: t.edits,
  errors: t.errors,
  costDelta: o.costNow !== null && t.costAtStart !== null && o.costNow - t.costAtStart >= 0.005 ? o.costNow - t.costAtStart : null,
  reason: o.reason,
})

// ---------------------------------------------------------------- agents and loops

type StepUsage = { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number } | null

/** A card after one of its model requests: its context is the latest step's whole input; output adds up. */
export const applyStep = (c: AgentCard, s: { model: string; usage: StepUsage; stopReason: string | null }): AgentCard => {
  const u = s.usage ?? {}
  const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return {
    ...c,
    model: c.model || s.model,
    steps: c.steps + 1,
    ctx: ctx > 0 ? ctx : c.ctx,
    out: c.out + (u.output_tokens ?? 0),
    lastStop: s.stopReason,
  }
}

export const noteTool = (c: AgentCard, n: ToolNote): AgentCard => ({ ...c, tools: [...c.tools, n].slice(-3) })

export const stepLoop = (loops: Loop[], id: string, at: number): Loop[] => {
  const found = loops.find(l => l.id === id)
  const next = found
    ? loops.map(l => (l === found ? { ...l, steps: l.steps + 1, lastAt: at } : l))
    : [...loops, { id, steps: 1, firstAt: at, lastAt: at, isDone: false }]
  return next.slice(-60)
}

export const LOOP_ACTIVE_MS = 15_000
export const isLoopActive = (l: Loop, now: number) => !l.isDone && now - l.lastAt < LOOP_ACTIVE_MS

/** Swimlane geometry: each agent's bar on one shared axis from the first spawn to now. */
export const lanes = (cards: AgentCard[], now: number, width: number) => {
  const start = Math.min(...cards.map(c => c.spawnedAt).filter(n => n > 0), now)
  const span = Math.max(1, now - start)
  return cards.map(c => {
    const from = Math.floor(((Math.max(c.spawnedAt, start) - start) / span) * width)
    const to = Math.max(from + 1, Math.ceil((((c.endedAt ?? now) - start) / span) * width))
    return { id: c.id, before: Math.min(from, width), bar: Math.min(to, width) - Math.min(from, width), after: width - Math.min(to, width) }
  })
}

// ---------------------------------------------------------------- layout

/** How many log lines fit: what the other panels leave, never fewer than 4 nor more than 8. */
export const logRows = (bodyRows: number, used: number) => Math.max(4, Math.min(8, bodyRows - used - 3))

/** Legend items that fit on one row of `width` cells, in order; the rest are dropped. */
export const fitLegend = <T extends { label: string }>(items: T[], width: number) => {
  const out: T[] = []
  let used = 0
  for (const it of items) {
    const w = it.label.length + 4
    if (used + w > width) break
    out.push(it)
    used += w
  }
  return out
}

/** A card's title row: the task in the agent's own words, the type only when there is none. */
export const cardTitle = (c: AgentCard): SafeText => c.description || c.type

/** A title split over two rows at a word boundary: `first` cells on row one, `rest` on row two. */
export const titleLines = (title: string, first: number, rest: number): [string, string] => {
  const t = title.replace(/\s+/g, ' ').trim()
  if (t.length <= first) return [t, '']
  const cut = t.lastIndexOf(' ', first)
  const at = cut > 0 ? cut : first
  return [t.slice(0, at).trim(), shorten(t.slice(at), rest)]
}

const ENGINE_TURNS = new Map<string, string>([
  ['system', 'message delivered'],
  ['loop_wakeup', 'loop wakeup'],
  ['schedule_wakeup', 'scheduled task'],
  ['poll_event', 'event delivered'],
])

export const isEngineTurn = (source: string | undefined): source is string => source !== undefined && ENGINE_TURNS.has(source)

const promptKey = (text: string) => {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

const PENDING_MAX = 32
const TYPED_MAX = 4096

/** Keyed by prompt text: UserPromptSubmit carries no turn id, and turn.start carries only the text. */
export const promptSources = () => {
  const pending = new Map<number, string>()
  let typed: Set<number> | 'overflowed' = new Set()
  return {
    submit(text: string, source: string | undefined) {
      const key = promptKey(text)
      if (isEngineTurn(source)) {
        pending.set(key, source)
        if (pending.size > PENDING_MAX) pending.delete(pending.keys().next().value as number)
      } else if (typed !== 'overflowed' && !typed.has(key)) {
        if (typed.size < TYPED_MAX) typed.add(key)
        else typed = 'overflowed'
      }
    },
    start(text: string) {
      const key = promptKey(text)
      const source = pending.get(key)
      pending.delete(key)
      return typed === 'overflowed' || typed.has(key) ? undefined : source
    },
  }
}

export const promptLine = (text: string, source: string | undefined): { who: string; text: string } => {
  const engine = source === undefined ? undefined : ENGINE_TURNS.get(source)
  return engine ? { who: 'engine', text: engine } : { who: 'you', text: `new turn · ${plural([...text].length, 'char')}` }
}

/**
 * A subagent's hand-back message: who sent it and the first line of what it said. The report
 * follows a framing header in the message; without one, the first line after the opening tag.
 */
export const handbackOf = (text: string): { from: string; body: string } | null => {
  const from = /^\s*<agent-message\s+from="([^"]+)"/.exec(text)?.[1]
  if (!from) return null
  const afterHeader = text.split(/The report follows:\s*\n/)[1]
  const rest = afterHeader ?? text.replace(/^\s*<agent-message[^>]*>/, '')
  const body =
    rest
      .split('\n')
      .map(l => l.trim())
      .find(l => l && !l.startsWith('[') && !l.startsWith('<') && !l.startsWith('</')) ?? ''
  return body ? { from, body } : null
}

export const adviceLine = (report: string): Scrubbed => {
  for (const line of report.split('\n')) {
    const raw = line.trim()
    if (!raw || raw.startsWith('[') || raw.startsWith('<')) continue
    const found = kept(raw, CAP.advice, masked => masked.replace(/\*\*|__/g, '').replace(/^[#>*\s-]+/, ''))
    if (found.text) return found
  }
  return { text: NO_TEXT, masked: 0 }
}

export const consultVia = (subagentType: string): Scrubbed => kept(subagentType, CAP.name, masked => masked.slice(masked.lastIndexOf(':') + 1))

export const elapsedOf = (c: AgentCard, now: number) => (c.endedAt ?? now) - c.spawnedAt

type Held = { log: LogLine[]; agents: AgentCard[]; gate: Gate; architect: Architect; roster: Roster; view: View }

export const textFields = (h: Held): { path: string; length: number }[] =>
  [
    ...h.log.flatMap((l, i) => [[`log.${i}.who`, l.who], [`log.${i}.text`, l.text]] as const),
    ...h.agents.flatMap((c, i) => [
      [`agents.${i}.type`, c.type] as const,
      [`agents.${i}.description`, c.description] as const,
      ...c.tools.map((n, j) => [`agents.${i}.tools.${j}.text`, n.text] as const),
    ]),
    ...h.gate.recent.flatMap((c, i) => [
      [`gate.recent.${i}.detail`, c.detail] as const,
      ...(c.verdict === 'deny' && c.by !== 'refused' ? [[`gate.recent.${i}.cause`, c.cause] as const] : []),
    ]),
    ...h.gate.grants.map((g, i) => [`gate.grants.${i}.detail`, g.detail] as const),
    ['view.viewDeny', h.view.viewDeny ?? ''] as const,
    ['architect.lastAdvice', h.architect.lastAdvice] as const,
    ...h.architect.consults.map((c, i) => [`architect.consults.${i}.via`, c.via] as const),
    ...h.roster.architectTypes.map((t, i) => [`roster.architectTypes.${i}`, t] as const),
  ]
    .filter(([, text]) => text.length > 0)
    .map(([path, text]) => ({ path, length: text.length }))
