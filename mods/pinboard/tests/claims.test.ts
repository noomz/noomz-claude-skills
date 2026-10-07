import { describe, expect, test } from 'claude-code/testing'

import { parsePin, parseUpdate } from '../hooks/register'
import { scrub } from '../hooks/hygiene'
import { stateStore } from './state-store'

type Row = [input: string, text: string, masked: number]

const rows = (cases: Row[]) => {
  for (const [input, text, masked] of cases) test(JSON.stringify(input), () => expect(scrub(input, 200)).toEqual({ text, masked }))
}

describe('scrub masks the README examples as written', () => {
  rows([
    ['"DB_PASS": "hunter2"', '"DB_PASS": "[masked]"', 1],
    ['GH_PAT: abc123', 'GH_PAT: [masked]', 1],
    ['Db_Pass=hunter2', 'Db_Pass=[masked]', 1],
    ['access key is abc123def456', 'access key is [masked]', 1],
    ['redis://:p4ssw0rd@cache:6379', 'redis://:[masked]@cache:6379', 1],
    ['mariadb -u root -phunter2', 'mariadb -u root -p[masked]', 1],
    ['password\u3164hunter2', 'password [masked]', 1],
    ['pass\u3164word=s3cret', 'pass word=[masked]', 1],
    ['password: \u249c hunter2', 'password: [masked] hunter2', 1],
    ['\u24df\u24d0\u24e2\u24e2\u24e6\u24de\u24e1\u24d3=hunter2', 'password=[masked]', 1],
    ['Bearer abcdefgh', 'Bearer [masked]', 1],
    ['Bearer abc1', 'Bearer [masked]', 1],
    ['Bearer abcdefg', 'Bearer abcdefg', 0],
    ['curl -u 1000:1000 x', 'curl -u 1000:1000 x', 0],
    ['curl --user "admin":"hunter2" x', 'curl --user "admin":[masked] x', 1],
    ['Bearer ab!', 'Bearer [masked]', 1],
    ['Bearer abc', 'Bearer abc', 0],
    ['API key: abc123def456', 'API key: [masked]', 1],
    ['private key = abc123def456', 'private key = [masked]', 1],
    ['secret key -> abc123def456', 'secret key -> [masked]', 1],
    ['API key is abc123def456', 'API key is [masked]', 1],
  ])
})

describe('scrub misses the curl -u forms the README lists', () => {
  rows([
    ['curl -u "ad"min:hunter2 x', 'curl -u "ad"min:hunter2 x', 0],
    ['curl -u :hunter2 x', 'curl -u :hunter2 x', 0],
    ['curl -u "":hunter2 x', 'curl -u "":hunter2 x', 0],
    ['curl -u "":"hunter2" x', 'curl -u "":"hunter2" x', 0],
    ['curl -u "admin:hun"ter2 x', 'curl -u "admin:[masked]"ter2 x', 1],
    ['curl -u "ad:min":"pw" x', 'curl -u "ad:[masked]":"pw" x', 1],
  ])
})

describe('scrub misses a value after api key and a space', () => {
  rows([['api key abc123def456', 'api key abc123def456', 0]])
})

describe('scrub leaves a PASS or PAT value that starts with a PEM armor word', () => {
  rows([
    ['DB_PASS=-----BEGINhunter2!', 'DB_PASS=-----BEGINhunter2!', 0],
    ['DB_PASS=-----ENDhunter2!', 'DB_PASS=-----ENDhunter2!', 0],
    ['GH_PAT: -----BEGINabc', 'GH_PAT: -----BEGINabc', 0],
  ])
})

describe('scrub shows two masks for one Authorization value behind a blank filler or zero-width character', () => {
  rows([
    ['Authorization = Basic abc', 'Authorization = Basic [masked]', 1],
    ['Authorization =\u2800Basic abc', 'Authorization =[masked] [masked]', 2],
    ['Authorization =\u3164Basic abc', 'Authorization =[masked] [masked]', 2],
    ['Authorization =\u200bBasic abc', 'Authorization =[masked] [masked]', 2],
  ])
})

describe('scrub keeps an input [masked], and an input bullet only as a URL password', () => {
  rows([
    ['password=[masked]', 'password=[masked]', 0],
    ['--token=[masked]', '--token=[masked]', 0],
    ['https://u:[masked]@h', 'https://u:[masked]@h', 0],
    ['https://u:\u2022@h', 'https://u:\u2022@h', 0],
    ['password=\u2022', 'password=[masked]', 1],
    ['API_KEY=\u2022', 'API_KEY=[masked]', 1],
    ['Authorization: \u2022', 'Authorization: [masked]', 1],
  ])
})

describe('scrub keeps a private-use character inside a key name, which splits the key', () => {
  rows([
    ['pass\ue000word=hunter2', 'pass\ue000word=hunter2', 0],
    ['pass\ue000\udf89word=hunter2', 'pass\ue000word=hunter2', 0],
  ])
})

describe('the masked count of a call', () => {
  test('counts a mask the 200-character cut drops from the stored text', () => {
    const parsed = parseUpdate({ add_todos: ['a'.repeat(199) + ' password=hunter2'] })
    expect(parsed).toEqual({ ok: true, update: { add_todos: ['a'.repeat(199) + '\u2026'] }, masked: 1 })
  })
})

describe('a link label for a host near 80 characters', () => {
  const host = (length: number) => `${'a'.repeat(40)}.${'b'.repeat(length - 49)}.example`
  test('a 79-character host keeps the host and cuts the path to the final …', () => {
    expect(parsePin(`https://${host(79)}/path`)?.label).toBe(`${host(79)}\u2026`)
  })
  for (const length of [80, 81]) {
    test(`a ${length}-character host shows … and its last 79 characters`, () => {
      expect(parsePin(`https://${host(length)}/path`)?.label).toBe(`\u2026${host(length).slice(-79)}`)
    })
  }
})

describe('a link in command output', () => {
  test('keeps a non-ASCII digit or mark, ends at a non-ASCII full stop or dash, and runs on through an ASCII control', async ($, on) => {
    const { value } = stateStore(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const outputs = [
      'https://github.com/o/r/pull/8\uff13 x\n',
      'https://github.com/o/r/pull/9\u0301 x\n',
      'https://github.com\u3002evil.test/o/r/pull/12\n',
      'https://ex.com/wiki/Foo\u2013Bar\n',
      '\x1b[32mhttps://github.com/o/r/pull/5\x1b[0m\n',
    ]
    on('tool.call', { tool: 'Bash' }, () => {
      const text = outputs.shift() ?? ''
      return { result: { stdout: text, stderr: '', interrupted: false }, text }
    })
    for (let i = 0; i < 5; i++) await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
    expect(value('links')).toEqual([
      { href: 'https://github.com/o/r/pull/5%1B[0m', label: 'github.com/o/r/pull/5%1B[0m' },
      { href: 'https://ex.com/wiki/Foo', label: 'ex.com/wiki/Foo' },
      { href: 'https://github.com/', label: 'github.com/' },
      { href: 'https://github.com/o/r/pull/9%CC%81', label: 'github.com/o/r/pull/9%CC%81' },
      { href: 'https://github.com/o/r/pull/8%EF%BC%93', label: 'github.com/o/r/pull/8%EF%BC%93' },
    ])
  })
})

describe('stored links', () => {
  test('session start keeps a link an older build stored more than once', async ($, on) => {
    const { values, value } = stateStore(on)
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('tool.register', (_$, e) => ({ value: { tool: `mcp__pinboard__${e.name}` } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const pin = { href: 'https://example.com/1', label: 'example.com/1' }
    values.set('pinboard/links/', { value: [pin, pin, pin], version: 1 })
    await $.session.start({ cwd: '/w', surface: null, isInteractive: false })
    expect(value('links')).toEqual([pin, pin, pin])
  })

  test('a new pin keeps a list that no session start has checked as it was stored', async ($, on) => {
    const { values, value } = stateStore(on)
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const stored = { href: 'https://u:p@x.com/password=hunter2', label: 'password=hunter2' }
    values.set('pinboard/links/', { value: [stored], version: 1 })
    on('tool.call', { tool: 'Bash' }, () => {
      const text = 'https://github.com/o/r/pull/3\n'
      return { result: { stdout: text, stderr: '', interrupted: false }, text }
    })
    await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill' })
    expect(value('links')).toEqual([{ href: 'https://github.com/o/r/pull/3', label: 'r PR #3' }, stored])
  })
})
