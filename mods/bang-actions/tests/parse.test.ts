import { describe, expect, test } from 'claude-code/testing'

import {
  buttonLabel, commandKey, displayCommand, extractBangCommands, formatRunMessage, MAX_COMMANDS, MAX_SHOWN_CHARS,
  mergeCommands, outputTail, parseRunMessage,
} from '../hooks/parse'

const run = (cmd: string) => ({ cmd, gate: 'run' as const })
const confirm = (cmd: string) => ({ cmd, gate: 'confirm' as const })
const result = (over: Partial<Parameters<typeof formatRunMessage>[1]> = {}) => ({
  exitCode: 0, stdout: 'hello\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false, ...over,
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

  test('a command already listed keeps its place and takes the incoming gate', () => {
    expect(mergeCommands([run('a'), run('b')], [confirm('a')])).toEqual([confirm('a'), run('b')])
    expect(mergeCommands([confirm('a')], [run('a')])).toEqual([run('a')])
  })

  test('never lists a command too long to show in full', () => {
    const fits = `echo ${'x'.repeat(MAX_SHOWN_CHARS - 5)}`
    const tooLong = `echo ${'x'.repeat(MAX_SHOWN_CHARS - 4)}`
    expect(mergeCommands([], [run(tooLong), run(fits)])).toEqual([run(fits)])
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

test('buttonLabel shows the whole command on one line', () => {
  expect(buttonLabel('x'.repeat(200))).toBe('x'.repeat(200))
  expect(buttonLabel('cat <<EOF\nhi\nEOF')).toBe('cat <<EOF hi EOF')
})

test('commandKey is stable per command and differs between commands', () => {
  expect(commandKey('git status')).toBe(commandKey('git status'))
  expect(commandKey('git status')).not.toBe(commandKey('git stash'))
})

test('outputTail strips ANSI, keeps a progress line\'s last redraw, caps lines and width', () => {
  const esc = String.fromCodePoint(0x1b)
  const out = `a\nb\n${esc}[32mgreen${esc}[0m\n10%\r50%\r100%\r\nc\nd\n${'x'.repeat(300)}\n`
  expect(outputTail(out)).toBe(`green\n100%\nc\nd\n${'x'.repeat(199)}…`)
})

describe('run message', () => {
  test('round-trips the command, exit code and output, a fake marker line and backticks included', () => {
    const cmd = 'echo `date` && git log --format="`cat f`" | grep OUTPUT-'
    const r = result({ exitCode: 3, stdout: 'a\nOUTPUT-00000000-0000-4000-8000-000000000000\nb\n', stderr: 'warn\n' })
    expect(parseRunMessage(formatRunMessage(cmd, r))).toEqual({
      cmd, exitCode: 3, output: '[stdout]\na\nOUTPUT-00000000-0000-4000-8000-000000000000\nb\n[stderr]\nwarn',
    })
  })

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

  test('says when the output was cut', () => {
    const text = formatRunMessage('make', result({ isStdoutTruncated: true }))
    expect(text).toContain('[cut:')
    expect(parseRunMessage(text)).toEqual({ cmd: 'make', exitCode: 0, output: '[stdout]\nhello' })
  })

  test('parses a message the engine framed under the plugin\'s name, and refuses any other text', () => {
    const framed = `The bang-actions plugin sent a message:\n${formatRunMessage('ls', result())}`
    expect(parseRunMessage(framed)).toEqual({ cmd: 'ls', exitCode: 0, output: '[stdout]\nhello' })
    expect(parseRunMessage('continue')).toBeNull()
    expect(parseRunMessage('The person pressed a bang-actions button, which ran this command (exit 0):\n! ls\nno fence')).toBeNull()
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
