import { describe, expect, test } from 'claude-code/testing'

import {
  buttonLabel, commandKey, displayCommand, drawnRows, extractBangCommands, formatRunMessage, MAX_COMMANDS,
  keepTail, MAX_SHOWN_CHARS, mergeCommands, outputTail,
} from '../hooks/parse'

const run = (cmd: string) => ({ cmd, gate: 'run' as const })
const confirm = (cmd: string) => ({ cmd, gate: 'confirm' as const })
const result = (over: Partial<Parameters<typeof formatRunMessage>[1]> = {}) => ({
  ending: 'exit 0', stdout: 'hello\n', stderr: '', isCut: false, ...over,
})

describe('extractBangCommands', () => {
  test('finds inline `! cmd` code spans in order', () => {
    const text = 'Run `! gcloud auth login` then `! gh auth switch --user noomz`.'
    expect(extractBangCommands(text)).toEqual(['gcloud auth login', 'gh auth switch --user noomz'])
  })

  test('takes fenced blocks made only of `! cmd` lines, mixed with inline in document order', () => {
    const text = 'First `! a`.\n```bash\n# log in\n! b --flag\n\n  ! c\n```\nThen `! d`.\n~~~\n! e\n~~~'
    expect(extractBangCommands(text)).toEqual(['a', 'b --flag', 'c', 'd', 'e'])
  })

  test('skips script blocks whose `!` is negation, and `\\`-continued commands', () => {
    const script = '```bash\n#!/bin/bash\n! command -v foo && install\necho done\n```'
    const continued = '```\n! docker run \\\n  -v x:y img\n```'
    expect(extractBangCommands(`${script}\n${continued}`)).toEqual([])
  })

  test('ignores code that is not a bang suggestion', () => {
    const text = 'Use `!==`, `!important`, `x != y`, `! ` and plain ! words.\n```js\nif (!ok) {}\n```'
    expect(extractBangCommands(text)).toEqual([])
  })

  test('skips placeholders written to explain the syntax', () => {
    const text = 'Type `! cmd`, `! command`, `! <command>`, `! npm run ...` or `! git status`.'
    expect(extractBangCommands(text)).toEqual(['git status'])
  })

  test('dedupes repeats', () => {
    expect(extractBangCommands('`! ls` and again `! ls`')).toEqual(['ls'])
  })
})

describe('mergeCommands', () => {
  test('keeps a batch\'s first MAX_COMMANDS, dropping older entries before newer', () => {
    const many = Array.from({ length: MAX_COMMANDS + 2 }, (_, i) => run(`c${i}`))
    expect(mergeCommands([], many)).toEqual(many.slice(0, MAX_COMMANDS))
    expect(mergeCommands([run('old')], many)).toEqual(many.slice(0, MAX_COMMANDS))
    expect(mergeCommands([run('a')], [run('a'), run(' b ')])).toEqual([run('a'), run('b')])
  })

  test('a command already listed keeps its place and the stricter of its gate and the incoming one', () => {
    expect(mergeCommands([run('a'), run('b')], [confirm('a')])).toEqual([confirm('a'), run('b')])
    expect(mergeCommands([confirm('a')], [run('a')])).toEqual([confirm('a')])
  })

  test('never lists a command too long to show in full', () => {
    const fits = `echo ${'x'.repeat(MAX_SHOWN_CHARS - 5)}`
    const tooLong = `echo ${'x'.repeat(MAX_SHOWN_CHARS - 4)}`
    expect(mergeCommands([], [run(tooLong), run(fits)]).map(s => s.cmd)).toEqual([fits])
  })

  test('a command already listed keeps its arming', () => {
    const armed = { ...confirm('a'), isArmed: true as const }
    expect(mergeCommands([armed], [run('a')])).toEqual([armed])
  })

  test('drops commands with controls, bidi or zero-width characters', () => {
    const rlo = String.fromCodePoint(0x202e)
    const zwsp = String.fromCodePoint(0x200b)
    const nbsp = String.fromCodePoint(0xa0)
    const esc = String.fromCodePoint(0x1b)
    const cmds = [`ls ${rlo}fdp.exe`, `rm${zwsp} x`, `ls${nbsp}-la`, `echo ${esc}[31m`, 'ls\t-la'].map(run)
    expect(mergeCommands([], cmds)).toEqual([run('ls\t-la')])
  })
})

describe('drawnRows', () => {
  test('counts one row per drawn step, plus the rows a step wraps over at the given width', () => {
    const steps = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`).join('; ')
    expect(drawnRows(steps(9), 50)).toBe(9)
    expect(drawnRows(`echo ${'x'.repeat(115)}`, 50)).toBe(3)
    expect(drawnRows(`echo ${'x'.repeat(115)}`, 120)).toBe(1)
    expect(drawnRows(`a; echo ${'x'.repeat(115)}`, 50)).toBe(4)
  })

  test('a character outside ASCII counts two cells, so wide glyphs never under-count rows', () => {
    const wide = String.fromCodePoint(0x65e5).repeat(30)
    expect(drawnRows(`echo ${wide}`, 50)).toBe(2)
  })

  test('a band with no room left for code counts one cell per row, never zero rows', () => {
    expect(drawnRows('echo x', 0)).toBe(6)
    expect(drawnRows('echo x', -20)).toBe(6)
  })
})

test('buttonLabel shows the whole command on one line', () => {
  expect(buttonLabel('x'.repeat(200))).toBe('x'.repeat(200))
  expect(buttonLabel('cat <<EOF\nhi\nEOF')).toBe('cat <<EOF hi EOF')
})

test('commandKey is stable per command and differs between commands', () => {
  expect(commandKey('git status')).toBe(commandKey('git status'))
  expect(commandKey('git status')).not.toBe(commandKey('git stash'))
})

describe('run message', () => {
  test('puts the command alone on its own line and fences the output with a marker the output cannot predict', () => {
    const lines = formatRunMessage('ls -la', result()).split('\n')
    expect(lines[1]).toBe('! ls -la')
    expect(lines[0]).toContain('(exit 0)')
    expect(lines[2]).toContain('untrusted program output')
    const marker = lines[3]
    expect(marker).toMatch(/^OUTPUT-[0-9a-f-]{36}$/)
    expect(lines.slice(4)).toEqual(['[stdout]', 'hello', marker])
    expect(formatRunMessage('ls -la', result()).split('\n')[3]).not.toBe(marker)
  })

  test('keeps both streams and the exit code, and says when the output was cut', () => {
    const r = result({ ending: 'exit 3', stdout: 'a\nb\n', stderr: 'warn\n', isCut: true })
    const text = formatRunMessage('make', r)
    expect(text).toContain('(exit 3)')
    expect(text).toContain('[cut:')
    expect(text).toContain('[stdout]\na\nb\n[stderr]\nwarn')
  })

  test('says when the person cancelled the run', () => {
    expect(formatRunMessage('gh auth refresh', result({ ending: 'it ran until the person cancelled it' })).split('\n')[0]).toContain('(it ran until the person cancelled it)')
  })

  test('keepTail keeps the last 20000 characters of a stream and says when it dropped some', () => {
    expect(keepTail('ab', 'cd')).toEqual({ text: 'abcd', isCut: false })
    const kept = keepTail('x'.repeat(19_999), 'yz')
    expect(kept.isCut).toBe(true)
    expect(kept.text).toHaveLength(20_000)
    expect(kept.text.endsWith('yz')).toBe(true)
  })
})

describe('outputTail', () => {
  test('shows the last lines, without trailing blank ones', () => {
    expect(outputTail('1\n2\n3\n4\n\n', 2)).toBe('3\n4')
  })

  test('drops terminal escapes and controls, so output can neither restyle the terminal nor hide text', () => {
    const esc = String.fromCharCode(27)
    const bel = String.fromCharCode(7)
    const text = `${esc}[1;32mok${esc}[0m ${esc}]0;title${bel}done${String.fromCharCode(0x202e)}!`
    expect(outputTail(text, 5)).toBe('ok done!')
  })

  test('shows a line a carriage return rewrote as last written, and CRLF as one break', () => {
    expect(outputTail('10%\r50%\r100%\r\nnext\r\n', 5)).toBe('100%\nnext')
  })
})

describe('displayCommand', () => {
  test('puts each top-level step on its own indented line', () => {
    const cmd = 'export T=$(gh auth token --user a); gh pr ready 1 -R o/r && gh pr merge 1 -R o/r --merge'
    expect(displayCommand(cmd)).toBe(
      'export T=$(gh auth token --user a);\n  gh pr ready 1 -R o/r &&\n  gh pr merge 1 -R o/r --merge',
    )
  })

  test('never splits inside quotes or parentheses', () => {
    expect(displayCommand(`echo "a && b; c" | grep 'x || y' && (cd d; ls)`)).toBe(
      `echo "a && b; c" |\n  grep 'x || y' &&\n  (cd d; ls)`,
    )
  })

  test('keeps every character: collapsing whitespace gives back the button label', () => {
    for (const cmd of ['a && b || c | d; e', 'git status', 'x=$(y; z) && w']) {
      expect(buttonLabel(displayCommand(cmd))).toBe(buttonLabel(cmd))
    }
  })
})
