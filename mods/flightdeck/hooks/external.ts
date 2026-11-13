import type { ExternalCard, ExternalNotice, ExternalProvider, ExternalState } from '../types'
import { scrub } from './hygiene'

const FORBIDDEN_OPTIONS = new Set(['--help', '-h', '--version', '-V', '--background', '--bg', '--detach', '-d'])
export const EXTERNAL_LIMIT = 30
export const EMPTY_EXTERNAL: ExternalState = { cards: [], notices: [] }

export function externalProvider(command: unknown): ExternalProvider | null {
  if (typeof command !== 'string' || command.length > 20_000 || /[\r\n\\`$]/.test(command)) return null
  const words: string[] = []
  let word = ''
  let quote: "'" | '"' | null = null
  let started = false
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = null
      else word += char
    } else if (char === "'" || char === '"') {
      quote = char
      started = true
    } else if (/\s/.test(char)) {
      if (started) words.push(word)
      word = ''
      started = false
    } else if ('|&;()<>#'.includes(char)) {
      return null
    } else {
      word += char
      started = true
    }
  }
  if (quote) return null
  if (started) words.push(word)
  if (words.some(w => FORBIDDEN_OPTIONS.has(w.split('=')[0] ?? ''))) return null
  const [bin, sub, ...rest] = words
  if (bin === 'codex' && sub === 'exec' && rest.length > 0) return 'codex'
  if (bin === 'pi' && words.includes('--print') && words.length > 2) return 'pi'
  if (bin === 'hermes' && sub === 'chat' && words.includes('--oneshot') && rest.length > 1) return 'hermes'
  if (bin === 'grok' && sub === '--single' && rest.length > 0) return 'grok'
  return null
}

export function externalLanes(cards: ExternalCard[], width: number) {
  const finished = cards.filter(c => c.endedAt !== null)
  if (!finished.length) return cards.map(() => null)
  const start = Math.min(...finished.map(c => c.startedAt))
  const end = Math.max(start + 1, ...finished.map(c => c.endedAt ?? start))
  return cards.map(c => {
    if (c.endedAt === null) return null
    const before = Math.max(0, Math.min(width - 1, Math.floor(((c.startedAt - start) / (end - start)) * width)))
    const bar = Math.max(1, Math.min(width - before, Math.ceil(((c.endedAt - c.startedAt) / (end - start)) * width)))
    return { before, bar }
  })
}

export function externalId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(value)) return null
  const safe = scrub(value, 64).text
  return safe === value ? safe : null
}

export function externalNotice(text: unknown, at: number): ExternalNotice | null {
  if (typeof text !== 'string' || text.length > 20_000) return null
  const envelopes = [...text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)]
  if (envelopes.length !== 1) return null
  const body = envelopes[0]?.[1] ?? ''
  const field = (name: string) => {
    const values = [...body.matchAll(new RegExp(`<${name}>([^<>]*)</${name}>`, 'g'))]
    return values.length === 1 ? values[0]?.[1] : undefined
  }
  const id = externalId(field('tool-use-id'))
  const taskId = externalId(field('task-id'))
  const status = field('status')
  if (!id || !taskId || (status !== 'completed' && status !== 'failed' && status !== 'killed')) return null
  return { id, taskId, status: status === 'killed' ? 'cancelled' : status, at }
}

const applyNotices = (card: ExternalCard, notices: ExternalNotice[]): ExternalCard => {
  if (!card.taskId) return card
  const matches = notices.filter(n => n.id === card.id && n.taskId === card.taskId && n.at >= card.startedAt)
  if (!matches.length) return card
  if (card.status === 'failed' && matches.some(n => n.status !== 'failed')) return { ...card, status: 'unknown', endedAt: null }
  const kinds = new Set(matches.map(n => n.status))
  if (kinds.size > 1) return { ...card, status: 'unknown', endedAt: null }
  const last = matches[matches.length - 1]
  if (!last) return card
  return { ...card, status: last.status === 'completed' ? 'handed-off' : last.status, endedAt: last.at }
}

export const startExternal = (state: ExternalState, card: ExternalCard): ExternalState => ({
  ...state,
  cards: [...state.cards.filter(c => c.id !== card.id), card].slice(-EXTERNAL_LIMIT),
})

export const finishExternal = (state: ExternalState, id: string, sequence: number, startedAt: number, taskId: ExternalCard['taskId'], failed: boolean, at: number): ExternalState => ({
  ...state,
  cards: state.cards.map(c => {
    if (c.id !== id || c.sequence !== sequence || c.startedAt !== startedAt) return c
    if (failed) return { ...c, taskId, status: 'failed', endedAt: at }
    return applyNotices({ ...c, taskId, status: 'handed-off', endedAt: taskId ? null : at }, state.notices)
  }),
})

export const abortExternal = (state: ExternalState, id: string, sequence: number, startedAt: number): ExternalState => ({
  ...state,
  cards: state.cards.map(c => c.id === id && c.sequence === sequence && c.startedAt === startedAt ? { ...c, status: 'unknown', endedAt: null } : c),
})

export const noticeExternal = (state: ExternalState, notice: ExternalNotice): ExternalState => {
  if (!state.cards.some(c => c.id === notice.id && notice.at >= c.startedAt)) return state
  const notices = [...state.notices, notice].slice(-EXTERNAL_LIMIT)
  return { notices, cards: state.cards.map(c => applyNotices(c, notices)) }
}
