import { toolDetail } from '../hooks/core'
import { scrub } from '../hooks/hygiene'

// Bun runs this file, outside the hooks environment the mod's tsconfig describes.
declare const process: { argv: string[]; exit: (code: number) => never }
declare const console: { log: (...args: unknown[]) => void; error: (...args: unknown[]) => void }

const ROUNDS = 20
const CALLS = 1000

const flag = process.argv.indexOf('--upstream')
const upstreamDir = flag > 0 ? process.argv[flag + 1] : undefined
if (!upstreamDir) {
  console.error('usage: bun mods/flightdeck/tests/hygiene.bench.ts --upstream <path to a claude-flightdeck checkout at f31daca>')
  process.exit(2)
}
const { describeInput } = (await import(`${upstreamDir}/hooks/core.ts`)) as { describeInput: (tool: string, input: unknown) => string }

const pick = <T>(list: readonly T[], i: number) => list[i % list.length] as T
const DIRS = ['src', 'lib/core', 'packages/web/app', 'mods/flightdeck/hooks', 'tests/unit', 'docs/guide']
const FILES = ['index.ts', 'register.tsx', 'README.md', 'config.json', 'parser_test.go', 'main.py']
const PROGRAMS = [
  'git status --short',
  'bun test tests/unit --timeout 20000',
  'rg -n "TODO|FIXME" src lib',
  'curl -u admin:s3cr3t https://h.example/x?sig=abc',
  'GITHUB_TOKEN=ghp_abcdefghijklmnop1234 gh pr view 16 --json title,body',
  'cd /Users/me/proj && npm run build -- --mode production',
  'python3 -c "import json,sys; print(json.load(sys.stdin)[\'name\'])" < package.json',
  'export OPENAI_API_KEY=sk-proj-1234567890abcdef && node scripts/eval.mjs',
  'psql postgres://bob:hunter2@db.internal:5432/app -c "select count(*) from users"',
  'find . -name "*.ts" -not -path "./node_modules/*" | xargs wc -l | sort -n | tail -20',
]
const PATTERNS = ['TODO', 'password\\s*=', 'export (const|function) \\w+', 'AKIA[0-9A-Z]{16}', 'describeInput', 'import .* from']
const URLS = [
  'https://docs.anthropic.com/en/docs/claude-code/hooks',
  'https://github.com/scasella/claude-flightdeck/blob/main/README.md',
  'https://api.example.com/v1/items?token=abc123&page=2',
  'https://bob:hunter2@internal.example.net:8443/admin',
  'https://s3.amazonaws.com/bucket/key?X-Amz-Signature=deadbeef&X-Amz-Expires=300',
]

const TOOL_CORPUS: { name: string; tool: string; input: Record<string, unknown> }[] = Array.from({ length: 200 }, (_, i) => {
  const n = Math.floor(i / 4)
  switch (i % 4) {
    case 0:
      return { name: `Bash#${n}`, tool: 'Bash', input: { command: `${pick(PROGRAMS, n)}${n >= 10 ? ` # run ${n}` : ''}`, description: 'run it' } }
    case 1:
      return { name: `Read#${n}`, tool: 'Read', input: { file_path: `/Users/me/proj/${pick(DIRS, n)}/${pick(FILES, n + 1)}`, limit: 200 } }
    case 2:
      return { name: `Grep#${n}`, tool: 'Grep', input: { pattern: pick(PATTERNS, n), path: `/Users/me/proj/${pick(DIRS, n + 2)}`, output_mode: 'content' } }
    default:
      return { name: `WebFetch#${n}`, tool: 'WebFetch', input: { url: `${pick(URLS, n)}${n >= 5 ? `#s${n}` : ''}`, prompt: 'Summarise the page' } }
  }
})

const PROSE = 'The parser reads each line, folds whitespace, and hands tokens to the checker before the writer runs. '
const SCRUB_CORPUS: { name: string; text: string }[] = [
  { name: 'normal prose 4096', text: PROSE.repeat(Math.ceil(4096 / PROSE.length)).slice(0, 4096) },
  { name: "4096 'a'", text: 'a'.repeat(4096) },
  { name: "'password=' + 4087 '='", text: 'password=' + '='.repeat(4087) },
  { name: "'-----BEGIN ' to 4096", text: '-----BEGIN '.repeat(Math.ceil(4096 / 11)).slice(0, 4096) },
]

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
const stats = (samples: number[]) => {
  const s = [...samples].sort((a, b) => a - b)
  return { p50: quantile(s, 0.5), p99: quantile(s, 0.99), n: s.length }
}
const us = (ms: number) => `${(ms * 1000).toFixed(2)}µs`

let sink = 0
const timed = (fn: () => string) => {
  const t0 = performance.now()
  const out = fn()
  const ms = performance.now() - t0
  sink += out.length
  return ms
}

const timeBothInAlternatingOrder = (turn: number, [first, second]: [() => unknown, () => unknown]) => {
  if (turn % 2 === 0) {
    first()
    second()
  } else {
    second()
    first()
  }
}

const floor: number[] = []
const upstream: number[][] = TOOL_CORPUS.map(() => [])
const head: number[][] = TOOL_CORPUS.map(() => [])
for (let round = 0; round < ROUNDS; round += 1) {
  for (let k = 0; k < CALLS; k += 1) {
    const i = k % TOOL_CORPUS.length
    const entry = TOOL_CORPUS[i]!
    floor.push(timed(() => ''))
    timeBothInAlternatingOrder(round + k, [
      () => upstream[i]!.push(timed(() => describeInput(entry.tool, entry.input))),
      () => head[i]!.push(timed(() => toolDetail(entry.tool, entry.input).text)),
    ])
  }
}

const scrubbed: number[][] = SCRUB_CORPUS.map(() => [])
for (let round = 0; round < ROUNDS; round += 1) {
  for (let k = 0; k < CALLS; k += 1) {
    const i = k % SCRUB_CORPUS.length
    scrubbed[i]!.push(timed(() => scrub(SCRUB_CORPUS[i]!.text, 4096).text))
  }
}

const up = stats(upstream.flat())
const hd = stats(head.flat())
const fl = stats(floor)
console.log(`timer floor               p50 ${us(fl.p50)}  p99 ${us(fl.p99)}  n=${fl.n}`)
console.log(`upstream describeInput    p50 ${us(up.p50)}  p99 ${us(up.p99)}  n=${up.n}`)
console.log(`head toolDetail           p50 ${us(hd.p50)}  p99 ${us(hd.p99)}  n=${hd.n}`)
console.log('\nper tool-corpus entry (p99 upstream / head):')
for (const [i, entry] of TOOL_CORPUS.entries()) {
  const u = stats(upstream[i]!)
  const h = stats(head[i]!)
  console.log(`  ${entry.name.padEnd(12)} upstream p50 ${us(u.p50)} p99 ${us(u.p99)}   head p50 ${us(h.p50)} p99 ${us(h.p99)}`)
}
console.log('\nscrub() per corpus entry, cap 4096:')
const scrubStats = SCRUB_CORPUS.map((entry, i) => ({ name: entry.name, ...stats(scrubbed[i]!) }))
for (const s of scrubStats) console.log(`  ${s.name.padEnd(24)} p50 ${us(s.p50)}  p99 ${us(s.p99)}  n=${s.n}`)

const failures = [
  ...(hd.p99 > 2 * up.p99 ? [`head toolDetail p99 ${us(hd.p99)} exceeds 2x upstream p99 ${us(up.p99)}`] : []),
  ...(hd.p99 > 0.5 ? [`head toolDetail p99 ${us(hd.p99)} exceeds 0.5 ms`] : []),
  ...scrubStats.filter(s => s.p99 > 2).map(s => `scrub() ${s.name} p99 ${us(s.p99)} exceeds 2 ms`),
]
console.log(`\nsink ${sink}`)
console.log(failures.length === 0 ? '\nPERF PASS' : `\nPERF FAIL\n${failures.map(f => `  ${f}`).join('\n')}`)
process.exit(failures.length === 0 ? 0 : 1)
