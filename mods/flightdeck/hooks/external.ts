import type { ExternalCard, ExternalNotice, ExternalProvider, ExternalState } from '../types'
import { scrub } from './hygiene'

const FORBIDDEN_OPTIONS = new Set(['--help', '-h', '--version', '-V', '--background', '--bg', '--detach', '-d'])
export const EXTERNAL_LIMIT = 30
export const EMPTY_EXTERNAL: ExternalState = { cards: [], notices: [] }

// Splits a Bash command line into its simple commands, as words with redirects removed. It lexes only what is needed to
// find each command's leading words: substitutions stay opaque words, heredoc bodies are skipped. Returns null when the
// line cannot be read (an unterminated quote, substitution or heredoc, or a redirect without a target).
export function simpleCommands(command: string): string[][] | null {
  const commands: string[][] = []
  const heredocs: { delimiter: string; strip: boolean }[] = []
  let words: string[] = []
  let word = ''
  let started = false
  let target: 'file' | 'heredoc' | 'heredoc-strip' | null = null
  let i = 0
  const endWord = () => {
    if (!started) return
    if (target === 'file') target = null
    else if (target) {
      heredocs.push({ delimiter: word, strip: target === 'heredoc-strip' })
      target = null
    } else words.push(word)
    word = ''
    started = false
  }
  const endCommand = () => {
    endWord()
    if (target) return false
    if (words.length) commands.push(words)
    words = []
    return true
  }
  // Consumes a `$(...)` or backtick substitution starting at i; returns the index after it, or -1 when unterminated.
  const substitution = (at: number) => {
    if (command[at] === '`') {
      for (let j = at + 1; j < command.length; j++) {
        if (command[j] === '\\') j++
        else if (command[j] === '`') return j + 1
      }
      return -1
    }
    let depth = 1
    let quote: string | null = null
    for (let j = at + 1; j < command.length; j++) {
      const c = command[j]
      if (quote) {
        if (c === '\\' && quote === '"') j++
        else if (c === quote) quote = null
      } else if (c === '\\') j++
      else if (c === "'" || c === '"') quote = c
      else if (c === '(') depth++
      else if (c === ')' && --depth === 0) return j + 1
    }
    return -1
  }
  const skipHeredocBodies = () => {
    for (const { delimiter, strip } of heredocs.splice(0)) {
      for (;;) {
        if (i >= command.length) return false
        const end = command.indexOf('\n', i)
        const line = command.slice(i, end === -1 ? command.length : end)
        i = end === -1 ? command.length : end + 1
        if ((strip ? line.replace(/^\t+/, '') : line) === delimiter) break
      }
    }
    return true
  }
  while (i < command.length) {
    const char = command[i] ?? ''
    if (char === '\\') {
      if (command[i + 1] !== '\n') {
        word += command[i + 1] ?? ''
        started = true
      }
      i += 2
    } else if (char === "'") {
      const end = command.indexOf("'", i + 1)
      if (end === -1) return null
      word += command.slice(i + 1, end)
      started = true
      i = end + 1
    } else if (char === '"') {
      started = true
      i++
      for (;;) {
        const c = command[i]
        if (c === undefined) return null
        if (c === '"') { i++; break }
        if (c === '\\') {
          if (command[i + 1] !== '\n') word += command[i + 1] ?? ''
          i += 2
        } else if ((c === '$' && command[i + 1] === '(') || c === '`') {
          const end = substitution(c === '$' ? i + 1 : i)
          if (end === -1) return null
          word += command.slice(i, end)
          i = end
        } else {
          word += c
          i++
        }
      }
    } else if ((char === '$' && command[i + 1] === '(') || char === '`') {
      const end = substitution(char === '$' ? i + 1 : i)
      if (end === -1) return null
      word += command.slice(i, end)
      started = true
      i = end
    } else if (char === '#' && !started) {
      const end = command.indexOf('\n', i)
      i = end === -1 ? command.length : end
    } else if (char === '\n') {
      if (!endCommand()) return null
      i++
      if (!skipHeredocBodies()) return null
    } else if (/\s/.test(char)) {
      endWord()
      i++
    } else if (char === '<' || char === '>' || (char === '&' && command[i + 1] === '>')) {
      if (/^\d+$/.test(word)) { word = ''; started = false }
      endWord()
      if (target) return null
      const op = /^(<<<|<<-|<<|<>|<&|>>|>&|>\||&>>|&>|<|>)/.exec(command.slice(i))?.[0] ?? char
      i += op.length
      const dup = (op === '>&' || op === '<&') ? /^(\d+|-)/.exec(command.slice(i))?.[0] : undefined
      if (dup) i += dup.length
      else target = op === '<<' ? 'heredoc' : op === '<<-' ? 'heredoc-strip' : 'file'
    } else if (';&|()'.includes(char)) {
      if (!endCommand()) return null
      i++
    } else {
      word += char
      started = true
      i++
    }
  }
  if (!endCommand() || heredocs.length) return null
  return commands
}

const PROVIDER_FLAGS: Record<'pi' | 'grok', string[]> = {
  pi: ['--print', '-p'],
  grok: ['--single', '-p', '--prompt-file', '--prompt-json'],
}
const hasFlag = (args: string[], flags: string[]) => args.some(a => flags.includes(a.split('=')[0] ?? ''))

function commandProvider(command: string[]): ExternalProvider | null {
  const start = command.findIndex(w => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w))
  if (start === -1) return null
  const words = command.slice(start)
  if (words.some(w => FORBIDDEN_OPTIONS.has(w.split('=')[0] ?? ''))) return null
  const [path = '', sub, ...rest] = words
  const bin = path.slice(path.lastIndexOf('/') + 1)
  if (bin === 'codex' && (sub === 'exec' || sub === 'e') && rest.length > 0) return 'codex'
  if (bin === 'pi' && hasFlag(words, PROVIDER_FLAGS.pi) && words.length > 2) return 'pi'
  if (bin === 'hermes' && sub === 'chat' && words.includes('--oneshot') && rest.length > 1) return 'hermes'
  if (bin === 'grok' && hasFlag(words, PROVIDER_FLAGS.grok) && words.length > 2) return 'grok'
  return null
}

// The provider of the first simple command in the line that launches an external agent headless.
export function externalProvider(command: unknown): ExternalProvider | null {
  if (typeof command !== 'string' || command.length > 64_000) return null
  const commands = simpleCommands(command)
  if (!commands) return null
  for (const words of commands) {
    const provider = commandProvider(words)
    if (provider) return provider
  }
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
