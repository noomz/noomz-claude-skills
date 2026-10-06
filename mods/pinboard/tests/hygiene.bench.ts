declare const process: { argv: string[]; exit(code: number): never }
declare const console: { log(...items: unknown[]): void; error(...items: unknown[]): void }
declare const Bun: {
  nanoseconds(): number
  plugin(spec: { setup(build: { module(id: string, load: () => { exports: Record<string, unknown>; loader: 'object' }): void }): void }): void
}

const ROUNDS = 20
const CALLS = 1000
const BOARD_P99_RATIO = 3
const BOARD_P99_MS = 1
const SCRUB_P99_MS = 2
const SHORT_P99_US = 5

const flag = process.argv.indexOf('--upstream')
const upstreamDir = flag > 0 ? process.argv[flag + 1] : undefined
if (!upstreamDir) {
  console.error('usage: bun hygiene.bench.ts --upstream <path to a sirkitree/pinboard checkout>')
  process.exit(2)
}

Bun.plugin({
  setup(build) {
    const engine = { atom: (ref: unknown, initial: unknown) => ({ ref, initial }), read: async () => undefined, update: async () => undefined }
    build.module('claude-code', () => ({ exports: engine, loader: 'object' }))
    build.module('react/jsx-dev-runtime', () => ({ exports: { jsxDEV: () => null, Fragment: null }, loader: 'object' }))
    build.module('react/jsx-runtime', () => ({ exports: { jsx: () => null, jsxs: () => null, Fragment: null }, loader: 'object' }))
  },
})

type Board = { todos: { id: string; text: string; isDone: boolean; isActive?: boolean }[]; decisions: { id: string; text: string }[] }
type Describe = (board: Board) => string

const head = (await import('../hooks/register')) as unknown as { describeBoard: Describe }
const upstream = (await import(`${upstreamDir}/hooks/register.tsx`)) as { describeBoard: Describe }
const { scrub } = await import('../hooks/hygiene')

const board: Board = {
  todos: Array.from({ length: 50 }, (_, i) => ({
    id: `t${i + 1}`,
    text: `Add the health check route step ${i + 1} and verify it with a request`,
    isDone: i < 20,
    isActive: i === 20,
  })),
  decisions: Array.from({ length: 20 }, (_, i) => ({ id: `d${i + 1}`, text: `Should step ${i + 1} ship behind a flag?` })),
}

const fill = (unit: string) => unit.repeat(Math.ceil(4096 / unit.length)).slice(0, 4096)
const ending = (text: string) => text.slice(0, 4090) + ' tail'
const CORPUS: Record<string, string> = {
  'normal prose': fill('Plan four steps to add a health check route, track them on the pinboard, and start the first. '),
  'a x4096': 'a'.repeat(4096),
  'password= then =': 'password=' + '='.repeat(4087),
  '-----BEGIN repeated': fill('-----BEGIN '),
  'A x4096': 'A'.repeat(4096),
  'sk- repeated': fill('sk-'),
  'eyJ- repeated': fill('eyJ-'),
  'scheme://u: repeated': fill('a://b:'),
  'long word cut at 4096': 'a'.repeat(4094) + ' b' + 'c'.repeat(100),
  'X1 a-a://b:': ending(('a-'.repeat(15) + 'a://b:').repeat(140)),
  'X2 eyJ- no 2nd dot': ending('eyJ-'.repeat(64) + '.' + 'eyJ-'.repeat(1100)),
  'X3 NAME="A..': ending(('A'.repeat(63) + '="' + 'A'.repeat(255)).repeat(14)),
  'KEY_ x1024': 'KEY_'.repeat(1024),
  'PASS_ x819': 'PASS_'.repeat(819),
  'TOKEN_ x682': 'TOKEN_'.repeat(682),
  'SECRET_ x585': 'SECRET_'.repeat(585),
  'API_KEY=x x409': fill('API_KEY=x '),
  '?token=a&sig=b& x273': fill('?token=a&sig=b&'),
  'password=a&b x341': fill('password=a&b'),
  'scheme x. then ://': ending('x.'.repeat(2000) + '://h:' + 'y'.repeat(80)),
  'url creds x512': fill('a://b:c@'),
  'filler mix': fill('password\u3164x9 pass\u3164word=a '),
  'secrets mix': fill('rotate password=hunter2 AKIAABCDEFGHIJKLMNOP now '),
  'password: " unclosed': 'password: "' + 'x '.repeat(2100),
  'password= then masks': fill('password=[masked]x '),
  'NFKC fullwidth =': fill('password\uFF1D'),
  'secret flags repeated': fill('--token x '),
}

const SHORT = ['git', 'src/app.ts', 'h.example', 'packages/web/src/components/Board.tsx:42', 'npm test', 'Bash']

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
const summary = (samples: number[]) => {
  const sorted = [...samples].sort((a, b) => a - b)
  return { p50: percentile(sorted, 50), p99: percentile(sorted, 99) }
}
let sink = 0
const timed = (fn: () => string, into: number[]) => {
  const start = performance.now()
  const out = fn()
  into.push(performance.now() - start)
  sink += out.length
}

const sides = { upstream: [] as number[], head: [] as number[] }
for (let round = 0; round < ROUNDS; round++) {
  for (let call = 0; call < CALLS; call++) {
    const pair = [() => timed(() => upstream.describeBoard(board), sides.upstream), () => timed(() => head.describeBoard(board), sides.head)]
    for (const run of call % 2 === 0 ? pair : pair.reverse()) run()
  }
}

const scrubbed: Record<string, number[]> = Object.fromEntries(Object.keys(CORPUS).map(name => [name, []]))
for (let round = 0; round < ROUNDS; round++) {
  for (let call = 0; call < CALLS; call++) {
    for (const [name, input] of Object.entries(CORPUS)) timed(() => scrub(input, 200).text, scrubbed[name]!)
  }
}

const short: number[] = []
for (let round = 0; round < ROUNDS; round++) {
  for (let call = 0; call < CALLS; call++) {
    const start = Bun.nanoseconds()
    sink += scrub(SHORT[call % SHORT.length], 200).text.length
    short.push((Bun.nanoseconds() - start) / 1000)
  }
}

const ms = (n: number) => `${n.toFixed(4)} ms`
const up = summary(sides.upstream)
const hd = summary(sides.head)
const failures: string[] = []
console.log(`describeBoard, 50 todos + 20 decisions, ${ROUNDS} rounds x ${CALLS} calls, upstream and head alternating`)
console.log(`  upstream  p50 ${ms(up.p50)}  p99 ${ms(up.p99)}`)
console.log(`  head      p50 ${ms(hd.p50)}  p99 ${ms(hd.p99)}`)
if (hd.p99 > BOARD_P99_RATIO * up.p99) failures.push(`head describeBoard p99 is over ${BOARD_P99_RATIO}x upstream`)
if (hd.p99 > BOARD_P99_MS) failures.push(`head describeBoard p99 is over ${BOARD_P99_MS} ms`)

console.log(`scrub(input, 200), inputs of 4096 characters and more, ${ROUNDS} rounds x ${CALLS} calls`)
for (const [name, samples] of Object.entries(scrubbed)) {
  const s = summary(samples)
  console.log(`  ${name.padEnd(22)} p50 ${ms(s.p50)}  p99 ${ms(s.p99)}`)
  if (s.p99 > SCRUB_P99_MS) failures.push(`scrub p99 for "${name}" is over ${SCRUB_P99_MS} ms`)
}

const shortSummary = summary(short)
console.log(`scrub(input, 200) on short tool details, timed per call`)
console.log(`  p50 ${shortSummary.p50.toFixed(3)} us  p99 ${shortSummary.p99.toFixed(3)} us`)
if (shortSummary.p99 > SHORT_P99_US) failures.push(`scrub p99 per call on short text is over ${SHORT_P99_US} us`)

const [header, ...items] = head.describeBoard(board).split('\n')
const QUOTED_ITEM = /^(?:t\d+ \[[ x>]\]|d\d+ \[\?\]) "[^"\\]*"$/
if (!header?.startsWith('Pinboard (') || items.length !== 70 || !items.every(line => QUOTED_ITEM.test(line))) failures.push('describeBoard did not write one JSON-quoted line per item under the header')
if (upstream.describeBoard(board).split('\n').length !== 71) failures.push('upstream describeBoard changed shape')
if (scrub('rotate creds password=hunter2 AKIAABCDEFGHIJKLMNOP', 200).text !== 'rotate creds password=[masked] [masked]') failures.push('scrub did not mask the canary')
for (const [name, input] of Object.entries(CORPUS)) {
  for (const cap of [200, 4096]) if (/hunter2|AKIA[A-Z0-9]{16}/.test(scrub(input, cap).text)) failures.push(`scrub leaked on "${name}" at cap ${cap}`)
}
if (scrub(CORPUS['secrets mix']!, 4096).masked < 100) failures.push('the secrets row did not reach the masking rules')
console.log(`work: ${sink} characters produced`)
console.log(failures.length === 0 ? 'PASS' : `FAIL\n${failures.map(f => `  ${f}`).join('\n')}`)
process.exit(failures.length === 0 ? 0 : 1)

export {}
