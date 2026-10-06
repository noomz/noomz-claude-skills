export type SafeText = string & { readonly __safe: true }

export type Scrubbed = { text: SafeText; masked: number }

export type Hygiene = { masked: number; rejected: number }

const LIMIT = 4096
const MASK = '[masked]'
const ELLIPSIS = '\u2026'
const ARMOR = '-----'

type Span = [start: number, end: number]

type Found = { index?: number; [group: number]: string | undefined }

type Finder = { test: (text: string) => boolean; find: (text: string) => Iterable<Found> }

const all = (pattern: RegExp): Finder => ({
  test: text => {
    pattern.lastIndex = 0
    const hit = pattern.test(text)
    pattern.lastIndex = 0
    return hit
  },
  find: text => text.matchAll(pattern),
})

const SCHEME_RUN = /[a-z0-9+.-]+/gi
const HOST_RUN = /[^\s/:@]*/y
const USERINFO_RUN = /[^\s@]*/y

const runEnd = (run: RegExp, text: string, from: number): number => {
  run.lastIndex = from
  run.test(text)
  return run.lastIndex
}

const isAsciiLetter = (c: string | undefined) => c !== undefined && /[A-Za-z]/.test(c)

function* flightdeckUrlCredentials(text: string): Iterable<Found> {
  let after = 0
  const host = { from: -1, to: -1 }
  const userinfo = { from: -1, to: -1 }
  const reach = (run: RegExp, memo: { from: number; to: number }, from: number) => {
    if (from < memo.from || from > memo.to) Object.assign(memo, { from, to: runEnd(run, text, from) })
    return memo.to
  }
  for (const scheme of text.matchAll(SCHEME_RUN)) {
    const runStart = scheme.index
    const schemeEnd = runStart + scheme[0].length
    if (schemeEnd <= after || !text.startsWith('://', schemeEnd)) continue
    let start = -1
    for (let at = Math.max(runStart, after); at < schemeEnd && start < 0; at++) {
      const before = text[at - 1]
      const bounded = at === 0 || (at === runStart ? before !== '_' : before === '+' || before === '.' || before === '-')
      if (bounded && isAsciiLetter(text[at])) start = at
    }
    if (start < 0) continue
    const colon = reach(HOST_RUN, host, schemeEnd + 3)
    if (colon === schemeEnd + 3 || text[colon] !== ':') continue
    const at = reach(USERINFO_RUN, userinfo, colon + 1)
    if (at === colon + 1 || text[at] !== '@') continue
    after = at + 1
    yield Object.assign([text.slice(start, after), text.slice(start, colon + 1)], { index: start })
  }
}

// Vendored from claude-flightdeck f31daca hooks/core.ts redact() (MIT, Copyright (c) 2026 Stephen Casella).
const FLIGHTDECK: readonly [finder: Finder, to: string][] = [
  [all(/(authorization\s*[:=]\s*)(bearer\s+|basic\s+)?\S+/gi), '$1$2•••'],
  [all(/\b(bearer)\s+[A-Za-z0-9._~+/-]{8,}=*/gi), '$1 •••'],
  [all(/\b(sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{8,}/g), '•••'],
  [all(/((?:api[_-]?key|access[_-]?token|token|secret|password|passwd|pwd)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi), '$1•••'],
  [all(/(--(?:token|password|api-key|secret)[= ])\S+/gi), '$1•••'],
  [all(/(\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)=)\S+/g), '$1•••'],
  [{ test: text => text.includes('://'), find: flightdeckUrlCredentials }, '$1•••@'],
]

const TEMPLATES = FLIGHTDECK.map(([finder, to]) => ({
  ...finder,
  groups: [...to.matchAll(/\$(\d)/g)].map(([, n]) => Number(n)),
  literal: to.replace(/\$\d/g, ''),
}))

const sameRun = (a: string, from: number, b: string, at: number, step: 1 | -1, limit: number) => {
  let length = 0
  while (length < limit && a.charCodeAt(from + step * length) === b.charCodeAt(at + step * length)) length++
  return length
}

type Piece = [length: number, origin: number]

class Pieces {
  private readonly out: Piece[] = []
  private at = 0
  private piece = 0
  private offset = 0

  constructor(private readonly from: Piece[]) {}

  copy(to: number) {
    this.advance(to, true)
  }

  skip(to: number) {
    this.advance(to, false)
  }

  insert(length: number) {
    if (length > 0) this.out.push([length, -1])
  }

  done(): Piece[] {
    return this.out
  }

  private advance(to: number, keep: boolean) {
    while (this.at < to) {
      const [length, origin] = this.from[this.piece]!
      const take = Math.min(length - this.offset, to - this.at)
      if (keep) this.out.push([take, origin < 0 ? -1 : origin + this.offset])
      this.at += take
      this.offset += take
      if (this.offset < length) continue
      this.piece += 1
      this.offset = 0
    }
  }
}

const flightdeckSpans = (text: string): Span[] => {
  let shown = text
  let pieces: Piece[] = [[text.length, 0]]
  let changed = false
  for (const { test, find, groups, literal } of TEMPLATES) {
    if (!test(shown)) continue
    const matches = [...find(shown)]
    if (matches.length === 0) continue
    changed = true
    const next = new Pieces(pieces)
    let out = ''
    let at = 0
    for (const found of matches) {
      const whole = found[0]!
      const start = found.index!
      const end = start + whole.length
      let kept = 0
      for (const n of groups) kept += found[n]?.length ?? 0
      const keep = kept + sameRun(literal, 0, whole, kept, 1, Math.min(literal.length, whole.length - kept))
      const room = Math.min(literal.length - (keep - kept), whole.length - keep)
      const tail = sameRun(literal, literal.length - 1, whole, whole.length - 1, -1, room)
      const by = whole.slice(0, kept) + literal
      out += shown.slice(at, start) + by
      next.copy(start + keep)
      next.insert(by.length - keep - tail)
      next.skip(end - tail)
      next.copy(end)
      at = end
    }
    next.copy(shown.length)
    shown = out + shown.slice(at)
    pieces = next.done()
  }
  if (!changed) return []
  const spans: Span[] = []
  let seen = 0
  for (const [length, origin] of pieces) {
    if (origin < 0) continue
    if (origin > seen) spans.push([seen, origin])
    seen = Math.max(seen, origin + length)
  }
  if (seen < text.length) spans.push([seen, text.length])
  return spans
}

const QUOTES: readonly [open: string, close: string][] = [
  ['"""', '"""'],
  ["'''", "'''"],
  ['```', '```'],
  ['\\"', '\\"'],
  ["\\'", "\\'"],
  ['""', '""'],
  ["''", "''"],
  ['``', '``'],
  ['"', '"'],
  ["'", "'"],
  ['`', '`'],
  ['\u201C', '\u201D'],
  ['\u2018', '\u2019'],
  ['\u201A', '\u2018'],
  ['\u201E', '\u201C'],
  ['\u00AB', '\u00BB'],
  ['\u2039', '\u203A'],
  ['\u300C', '\u300D'],
  ['\u300E', '\u300F'],
]

const OPENERS = new Set(QUOTES.map(([open]) => open[0]))

type Quoted = { inner: Span; end: number }

const escaped = (text: string, at: number): boolean => {
  let slashes = 0
  while (text[at - 1 - slashes] === '\\') slashes++
  return slashes % 2 === 1
}

class Reader {
  private readonly seen = new Map<string, { from: number; at: number }>()

  constructor(readonly text: string) {}

  next(needle: string, from: number): number {
    const memo = this.seen.get(needle)
    if (memo && from >= memo.from && (memo.at < 0 || from <= memo.at)) return memo.at
    let at = this.text.indexOf(needle, from)
    if (needle[0] !== '\\') while (at >= 0 && escaped(this.text, at)) at = this.text.indexOf(needle, at + 1)
    this.seen.set(needle, { from, at })
    return at
  }

  wordEnd(from: number): number {
    const space = this.next(' ', from)
    return space < 0 ? this.text.length : space
  }

  quotedAt(at: number): Quoted | null {
    if (!OPENERS.has(this.text[at]!)) return null
    let open: string | undefined
    for (const [opener, closer] of QUOTES) {
      if (!this.text.startsWith(opener, at)) continue
      open ??= opener
      const close = this.next(closer, at + opener.length)
      if (close >= 0) return { inner: [at + opener.length, close], end: close + closer.length }
    }
    return open === undefined ? null : { inner: [at + open.length, this.text.length], end: this.text.length }
  }
}

const WORDY = /[\p{L}\p{N}]/u
const FILLER_WORD = /^is:?$/
const LOOKS_PLAIN = /^[A-Za-z .,;:!?'"()[\]]*$/

const SIGN_IN_WORD = /[A-Za-z][.,;:!?"()[\]]+[A-Za-z]|[A-Za-z]!$/

const looksSecret = (word: string) => word.length >= 20 || !LOOKS_PLAIN.test(word) || SIGN_IN_WORD.test(word)

type Looks = (word: string) => boolean

const value = (reader: Reader, at: number, looks?: Looks): Span | null => {
  const { text } = reader
  if (at >= text.length || text[at] === ' ') return null
  let start = -1
  for (let from = at; ; ) {
    const quoted = reader.quotedAt(from)
    const [innerStart, innerEnd] = quoted ? quoted.inner : [from, reader.wordEnd(from)]
    const end = quoted ? quoted.end : innerEnd
    const inner = text.slice(innerStart, innerEnd)
    const isValue = WORDY.test(inner) && (quoted !== null || !FILLER_WORD.test(inner))
    if (start < 0) start = innerStart
    const span: Span = [start, innerEnd]
    if (!isValue && quoted && reader.quotedAt(end)) from = end
    else if (looks) return isValue && (quoted !== null || looks(inner)) ? span : null
    else if (isValue || text[end] !== ' ' || end + 1 >= text.length) return span
    else from = end + 1
  }
}

const SEPARATOR = /[-=:~>\u2013\u2014\u2192]{1,8}(?![-=:~>\u2013\u2014\u2192])/y
const ENDS_SEPARATOR = /[=:~>\u2013\u2014\u2192]$/

const separatorAt = (text: string, at: number): number => {
  SEPARATOR.lastIndex = at
  const run = SEPARATOR.exec(text)?.[0]
  if (!run || run[0] === '>') return 0
  if (run[0] !== '-') return run.length
  const next = text[at + run.length] ?? ''
  if (run.length === 1 && next !== ' ') return 0
  return ENDS_SEPARATOR.test(run) || !/[A-Za-z0-9]/.test(next) ? run.length : 0
}

type Said = { at: number; assigned: boolean }

const LINKING = /(?:is|was|to)(?=[ :])/y

const linkingAt = (text: string, at: number, prose: boolean): number => {
  if (!prose) return text.startsWith('is', at) && (text[at + 2] === ' ' || text[at + 2] === ':') ? 2 : 0
  LINKING.lastIndex = at
  return LINKING.exec(text)?.[0].length ?? 0
}

const said = (text: string, end: number, bare: boolean, prose = false): Said | null => {
  let at = text[end] === '"' || text[end] === "'" ? end + 1 : end
  const sign = text[at] === ' ' ? at + 1 : at
  if (text[sign] === '=' || text[sign] === ':') return { at: text[sign + 1] === ' ' ? sign + 2 : sign + 1, assigned: true }
  let separators = 0
  for (let next = at; separators < 3; separators++) {
    const start = text[next] === ' ' ? next + 1 : next
    const length = separatorAt(text, start)
    if (!length) break
    at = next = start + length
  }
  const is = text[at] === ' ' ? at + 1 : at
  const linking = separators > 0 || is > at ? linkingAt(text, is, prose) : 0
  if (linking) {
    at = is + linking
    if (text[at] === ':') at++
    if (text[at] === ' ') at++
    const length = separators === 0 ? separatorAt(text, at) : 0
    if (length) at += text[at + length] === ' ' ? length + 1 : length
    return { at, assigned: false }
  }
  if (separators > 0) return { at: text[at] === ' ' ? at + 1 : at, assigned: false }
  return bare && text[end] === ' ' ? { at: end + 1, assigned: false } : null
}

const CLAUSE = ' for '
const CLAUSE_WORDS = 3
const WORD_STOP = /[ :=]/g

const clause = (text: string, end: number): Said | null => {
  WORD_STOP.lastIndex = end + CLAUSE.length
  for (let words = 0; words < CLAUSE_WORDS; words++) {
    const stop = WORD_STOP.exec(text)
    if (!stop) return null
    const linked = said(text, stop.index, false, true)
    if (linked) return { at: linked.at, assigned: false }
    if (stop[0] !== ' ') return null
  }
  return null
}

const spoken = (text: string, end: number, bare: boolean): Said | null =>
  (text.startsWith(CLAUSE, end) ? clause(text, end) : null) ?? said(text, end, bare, true)

type Rule = { pattern: RegExp; spanOf: (reader: Reader, match: RegExpExecArray) => Span | null }

const keyed = (source: string, flags: string, spanOf: (reader: Reader, end: number, key: string, start: number) => Span | null): Rule => ({
  pattern: new RegExp(source, `g${flags}`),
  spanOf: (reader, match) => spanOf(reader, match.index + match[0].length, match[0], match.index),
})

const grouped = (source: string, flags = ''): Rule => ({
  pattern: new RegExp(source, `gd${flags}`),
  spanOf: (_, match) => match.indices?.[1] ?? null,
})

const shaped = (boundary: string, shape: string): Rule => grouped(`(?:${boundary})(${shape})`)

const strong = (reader: Reader, end: number, bare: boolean): Span | null => {
  const was = said(reader.text, end, bare)
  return was && value(reader, was.at)
}

const SCHEME = /^(?:bearer|basic|token) (?=[^ ])/i
const HIDDEN_SCHEME = /^token/i
const BEARER_TOKEN = /^[A-Za-z0-9._~+/-]{8}/
const SPOKEN = /^(?:password|passwd|passphrase)$/i
const SPOKEN_IDENT = /^secret_access_key$/i
const UID = /^\d+:\d+$/
const NAME_ENDS = ['KEY', 'TOKEN', 'SECRET', 'PASSWORD']
const NAME_LAST = new Set(['PAT', 'PASS', 'PASSWD', 'PWD', 'PASSPHRASE'])
const NAME_PART = new Set([...NAME_ENDS, ...NAME_LAST])

const isSecretName = (name: string): boolean => {
  if (NAME_ENDS.some(word => name.endsWith(word))) return true
  const parts = name.split('_')
  return NAME_LAST.has(parts.at(-1)!) || parts.slice(0, -1).some(part => NAME_PART.has(part))
}

const isWordStart = (text: string, at: number) => at === 0 || !/\w/.test(text[at - 1]!)

const USER_RUN = /[^ :'"]{1,256}/y

const userPassword = (reader: Reader, at: number): Span | null => {
  const { text } = reader
  const quoted = reader.quotedAt(at)
  if (quoted) {
    const [start, end] = quoted.inner
    const colon = reader.next(':', start)
    if (colon >= start && colon < end - 1) return UID.test(text.slice(start, end)) ? null : [colon + 1, end]
  }
  USER_RUN.lastIndex = at
  const user = quoted ? text.slice(...quoted.inner) : USER_RUN.exec(text)?.[0]
  const from = quoted ? quoted.end + 1 : at + (user?.length ?? 0) + 1
  if (!user || text[from - 1] !== ':' || from >= text.length || text[from] === ' ') return null
  const password = reader.quotedAt(from)
  const end = password?.end ?? reader.wordEnd(from)
  return UID.test(`${user}:${text.slice(...(password?.inner ?? [from, end]))}`) ? null : [from, end]
}

const emptyUserPassword = (reader: Reader, from: number): Span | null => {
  const at = reader.next('@', from)
  return at > from && at < reader.wordEnd(from) ? [from, at] : null
}

const assigned = (reader: Reader, end: number, looks?: Looks): Span | null => {
  const was = said(reader.text, end, false)
  return was?.assigned ? value(reader, was.at, looks) : null
}

const PROMPTLESS = /^(?:sshpass|login)$/i
const PASSWORD_FLAG = ' -p'
const COMMAND_ENDS = [';', '|', '&']

const flagPassword = (reader: Reader, end: number, spaced: boolean): Span | null => {
  const { text } = reader
  const flag = reader.next(PASSWORD_FLAG, end)
  const endsBefore = (stop: string) => {
    const at = reader.next(stop, end)
    return at >= 0 && at < flag
  }
  if (flag < 0 || COMMAND_ENDS.some(endsBefore)) return null
  const at = flag + PASSWORD_FLAG.length
  if (text[at] !== ' ') return value(reader, at)
  return spaced && text[at + 1] !== '-' ? value(reader, at + 1) : null
}

const KEYED_RULES: readonly Rule[] = [
  keyed(':\\/\\/:', '', (reader, end) => emptyUserPassword(reader, end)),
  grouped(String.raw`-----BEGIN [A-Z ]{0,40}PRIVATE KEY(?: BLOCK)?-----(.*?)(?=-----END|$)`),
  keyed('authorization', 'i', (reader, end) => {
    const was = said(reader.text, end, false)
    if (!was?.assigned) return null
    const scheme = SCHEME.exec(reader.text.slice(was.at, was.at + 8))
    const span = value(reader, scheme ? was.at + scheme[0].length : was.at)
    return span && scheme && HIDDEN_SCHEME.test(scheme[0]) ? [was.at, span[1]] : span
  }),
  keyed(String.raw`\bbearer `, 'i', (reader, end) => value(reader, end, word => looksSecret(word) || BEARER_TOKEN.test(word))),
  keyed(String.raw`(?:^| )(?:-u|--user)(?:[ =]|(?=[^ -]))`, '', (reader, end) => userPassword(reader, end)),
  keyed('--(?:token|password|api-key|secret)', 'i', (reader, end) => strong(reader, end, false) ?? (reader.text[end] === ' ' ? value(reader, end + 1) : null)),
  keyed(
    'api[_-]?key|secret_access_key|access[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|private[_-]?key|github_pat',
    'i',
    (reader, end, key, start) => strong(reader, end, SPOKEN_IDENT.test(key) && reader.text.slice(start - 4, start).toLowerCase() === 'aws_' && isWordStart(reader.text, start - 4)),
  ),
  keyed('token|secret|password|passwd|pwd|passphrase', 'i', (reader, end, key, start) => {
    const was = spoken(reader.text, end, SPOKEN.test(key) && isWordStart(reader.text, start))
    return was && value(reader, was.at, was.assigned ? undefined : looksSecret)
  }),
  keyed(String.raw`\b(?:api|access|secret|private) key\b`, 'i', (reader, end) => {
    const was = spoken(reader.text, end, false)
    return was && value(reader, was.at, looksSecret)
  }),
  keyed(String.raw`[A-Za-z0-9][_-](?:pass|pat)(?![A-Za-z0-9])`, 'i', (reader, end) => assigned(reader, end)),
  keyed(String.raw`(?:^|[^A-Za-z0-9_-])pass(?![A-Za-z0-9_-])`, 'i', (reader, end) => assigned(reader, end, looksSecret)),
  keyed(String.raw`\b(?:sshpass|login|mysql|mysqldump|mysqladmin|mariadb)\b`, 'i', (reader, end, key) => flagPassword(reader, end, PROMPTLESS.test(key))),
  keyed('(?:^|[^A-Za-z0-9_])[A-Z][A-Z0-9_]*(?==)', '', (reader, end, key) => (isSecretName(key.replace(/^[^A-Z]/, '')) ? strong(reader, end, false) : null)),
  grouped(String.raw`[?&;#](?:key|api_?key|sig|signature|token|access_token|x-amz-signature|code|j?session_?id|sid)=([^&#; "']+)`, 'i'),
  grouped(String.raw`https?:\/\/(?:www\.)?(?:hooks\.slack\.com\.?\/|(?:ptb\.|canary\.)?discord(?:app)?\.com\.?\/api\/+(?:v\d+\/+)?webhooks\/)([^ "']+)`, 'i'),
]

const SHAPE_RULES: readonly Rule[] = [
  shaped('^|[^A-Za-z0-9_-]', String.raw`eyJ[A-Za-z0-9_-]{1,256}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*`),
  shaped('^|[^A-Z0-9]', '(?:AKIA|ASIA)[0-9A-Z]{16}(?![A-Z0-9])'),
  shaped('^|[^A-Za-z0-9]', '(?:gh[pousr]|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{8,}'),
  shaped('^|[^A-Za-z0-9_]', '[spr]k[-_][A-Za-z0-9_-]{8,}'),
]

const RULES: readonly Rule[] = [...KEYED_RULES, ...SHAPE_RULES]

const OPEN = MASK.charCodeAt(0)

const maskBefore = (text: string, start: number, reach: number): number => {
  for (let at = start - 1; at >= Math.max(0, start - reach); at--) if (text.charCodeAt(at) === OPEN && text.startsWith(MASK, at)) return at
  return -1
}

const maskAfter = (text: string, end: number): number => {
  for (let at = Math.max(0, end - MASK.length + 1); at <= end; at++) if (text.charCodeAt(at) === OPEN && text.startsWith(MASK, at)) return at + MASK.length
  return -1
}

const onlyMasks = (text: string, [start, end]: Span): boolean => {
  if (end <= start || (end - start) % MASK.length !== 0) return false
  for (let at = start; at < end; at += MASK.length) if (!text.startsWith(MASK, at)) return false
  return true
}

const widen = (text: string, [start, end]: Span): Span => {
  for (let at = maskBefore(text, start, MASK.length); at >= 0; at = maskBefore(text, start, MASK.length)) start = at
  for (let at = maskAfter(text, end); at >= 0; at = maskAfter(text, end)) end = at
  return [start, end]
}

const armorsIn = (text: string): number[] => {
  const at: number[] = []
  for (let i = text.indexOf(ARMOR); i >= 0; i = text.indexOf(ARMOR, i + 1)) at.push(i)
  return at
}

const LEADING_DASHES = /-*/y
const PEM_ARMOR = /-{5,}(?:BEGIN|END)/y

const armorSearchStart = (text: string, start: number): number => {
  PEM_ARMOR.lastIndex = start
  if (PEM_ARMOR.test(text)) return start
  LEADING_DASHES.lastIndex = start
  LEADING_DASHES.test(text)
  return LEADING_DASHES.lastIndex
}

const firstAtOrAfter = (sorted: readonly number[], position: number): number => {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (sorted[mid]! < position) low = mid + 1
    else high = mid
  }
  return low
}

const kept = (text: string, span: Span): Span[] => {
  if (onlyMasks(text, span)) return []
  const wide = widen(text, span)
  return onlyMasks(text, wide) ? [] : [wide]
}

const secretSpans = (text: string): Span[] => {
  let reader: Reader | undefined
  let armors: number[] | undefined
  const spans: Span[] = []
  const keep = (span: Span) => spans.push(...kept(text, span))
  for (const { pattern, spanOf } of RULES) {
    pattern.lastIndex = 0
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const span = spanOf((reader ??= new Reader(text)), match)
      if (!span) continue
      armors ??= armorsIn(text)
      const armor = armors[firstAtOrAfter(armors, armorSearchStart(text, span[0]))]
      const end = armor !== undefined && armor < span[1] ? armor : span[1]
      if (end > span[0]) keep([span[0], end])
    }
  }
  for (const span of flightdeckSpans(text)) keep(span)
  return spans
}

const merge = (spans: Span[]): Span[] => {
  const merged: Span[] = []
  for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

const replaced = (text: string, spans: Span[]): string => {
  let out = ''
  let at = 0
  for (const [start, end] of spans) {
    out += text.slice(at, start) + MASK
    at = end
  }
  return out + text.slice(at)
}

const toOriginal = (found: Span[], spans: Span[]): Span[] => {
  const shownStarts: number[] = []
  const shifts: number[] = []
  let shift = 0
  for (const [start, end] of spans) {
    shownStarts.push(start - shift)
    shifts.push(shift)
    shift += end - start - MASK.length
  }
  shifts.push(shift)
  const position = (at: number, isEnd: boolean): number => {
    const before = firstAtOrAfter(shownStarts, isEnd ? at : at + 1)
    const span = spans[before - 1]
    const maskEnd = shownStarts[before - 1]! + MASK.length
    if (span && (isEnd ? at <= maskEnd : at < maskEnd)) return isEnd ? span[1] : span[0]
    return at + shifts[before]!
  }
  return found.map(([start, end]) => [position(start, false), position(end, true)])
}

const sameSpans = (a: Span[], b: Span[]) => a.length === b.length && a.every(([start, end], i) => start === b[i]![0] && end === b[i]![1])

const MAX_PASSES = 8

type Masked = { text: string; spans: Span[] }

const mask = (text: string, from: Span[] = []): Masked => {
  const tail = text.endsWith(ELLIPSIS) ? ELLIPSIS : ''
  const body = text.slice(0, text.length - tail.length)
  const seeds = from.flatMap(([start, end]): Span[] => (start < body.length ? kept(body, [start, Math.min(end, body.length)]) : []))
  let spans: Span[] = []
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = merge([...seeds, ...spans, ...toOriginal(secretSpans(replaced(body, spans)), spans)])
    if (sameSpans(next, spans)) break
    spans = next
  }
  return { text: replaced(body, spans) + tail, spans }
}

const coerce = (raw: unknown): string =>
  typeof raw === 'string' ? raw : typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint' ? String(raw) : ''

const dropCutWord = (text: string): string => text.slice(0, Math.max(0, text.lastIndexOf(' ')))

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff

const shorten = (text: string, cap: number): string => {
  if (text.length <= cap) return text
  for (let cut = cap - 1; cut >= 0; cut--) {
    const open = maskBefore(text, cut, MASK.length - 1)
    if (open >= 0) cut = open
    if (cut > 0 && isHighSurrogate(text.charCodeAt(cut - 1))) continue
    const head = text.slice(0, cut)
    if (mask(head).spans.length === 0) return head + ELLIPSIS
  }
  return ELLIPSIS
}

type Line = { text: string; from: number[]; to: number[] }

const BREAK = /[\t-\r\u0085\u2028\u2029]/
const SPACE = /\s/
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}]/u
const NON_ASCII = /[^\x00-\x7f]+/g
const COMBINING = /^\p{M}/u

const PLAIN_LINE = /^[!-~]+(?: [!-~]+)*$/
const CHANGED_IN_LINE = /^ | $|  |[^\S ]|[\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}\p{M}\u115F\u1160\u180E\u2800\u3164\uFFA0\u2026]/u

const isPlainLine = (source: string) => PLAIN_LINE.test(source) || (!CHANGED_IN_LINE.test(source) && source.normalize('NFKC') === source)

const shownAs = (c: string): string => {
  const code = c.charCodeAt(0)
  if (code > 0x20 && code < 0x7f) return c
  return code === 0x20 || BREAK.test(c) ? ' ' : INVISIBLE.test(c) ? '' : SPACE.test(c) ? ' ' : c
}

const oneLine = (source: string): Line => {
  const line: Line = { text: '', from: [], to: [] }
  const add = (shown: string, start: number, end: number) => {
    if (shown === '' || (shown === ' ' && (line.text === '' || line.text.endsWith(' ')))) return
    line.text += shown
    for (let unit = 0; unit < shown.length; unit++) {
      line.from.push(start)
      line.to.push(end)
    }
  }
  const put = (piece: string, start: number, end: number) => {
    for (const c of piece) add(shownAs(c), start, end)
  }
  const lead = source.startsWith(ELLIPSIS) ? 1 : 0
  const tail = source.length > lead && source.endsWith(ELLIPSIS) ? 1 : 0
  const middle = source.length - tail
  put(source.slice(0, lead), 0, lead)
  let at = lead
  NON_ASCII.lastIndex = lead
  for (let run = NON_ASCII.exec(source); run && run.index < middle; run = NON_ASCII.exec(source)) {
    const start = Math.max(at, COMBINING.test(run[0]) ? run.index - 1 : run.index)
    const end = Math.min(middle, run.index + run[0].length)
    for (; at < start; at++) add(shownAs(source[at]!), at, at + 1)
    put(source.slice(start, end).normalize('NFKC'), start, end)
    at = end
  }
  for (; at < middle; at++) add(shownAs(source[at]!), at, at + 1)
  put(source.slice(middle), middle, source.length)
  if (line.text.endsWith(' ')) {
    line.text = line.text.slice(0, -1)
    line.from.pop()
    line.to.pop()
  }
  return line
}

const inLine = ({ from, to }: Line, spans: Span[], length: number): Span[] =>
  spans.flatMap(([start, end]): Span[] => {
    const span: Span = [firstAtOrAfter(to, start + 1), Math.min(length, firstAtOrAfter(from, end))]
    return span[1] > span[0] ? [span] : []
  })

const BLANK_FILLER = /[\u115F\u1160\u180E\u2800\u3164\uFFA0]/g
const FILLER = '\u2800'

type Reading = { text: string; from: number[] }

const reading = (line: string, fill: string): Reading => {
  let text = ''
  const from: number[] = []
  for (let at = 0; at < line.length; at++) {
    const c = line[at] === FILLER ? fill : line[at]!
    if (c === '' || (c === ' ' && (text === '' || text.endsWith(' ')))) continue
    text += c
    from.push(at)
  }
  if (text.endsWith(' ')) {
    text = text.slice(0, -1)
    from.pop()
  }
  return { text, from }
}

const maskReadings = (line: string, upstream: Span[]): Masked => {
  const spaced = reading(line, ' ')
  const joined = reading(line, '')
  const inReading = ({ from }: Reading, spans: Span[]): Span[] => spans.map(([start, end]) => [from[start]!, from[end - 1]! + 1])
  const seeds = [...upstream, ...inReading(joined, mask(joined.text).spans)]
  const inSpaced = seeds.map(([start, end]): Span => [firstAtOrAfter(spaced.from, start), firstAtOrAfter(spaced.from, end)])
  return mask(spaced.text, inSpaced.filter(([start, end]) => end > start))
}

export function scrub(raw: unknown, cap: number): Scrubbed {
  const full = coerce(raw)
  const source = full.slice(0, LIMIT)
  const line = isPlainLine(source) ? null : oneLine(source.replace(BLANK_FILLER, FILLER))
  let text = line?.text ?? source
  if (full.length > LIMIT || text.length > LIMIT) text = dropCutWord(text.slice(0, LIMIT))
  const upstream = line === null ? [] : inLine(line, flightdeckSpans(source), text.length)
  const masked = text.includes(FILLER) ? maskReadings(text, upstream) : mask(text, upstream)
  return { text: shorten(masked.text, cap) as SafeText, masked: masked.spans.length }
}
