import { describe, expect, test } from 'claude-code/testing'

import { buttonLabel, commandKey, extractBangCommands, mergeCommands, MAX_COMMANDS, outputTail } from '../hooks/parse'

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
    const many = Array.from({ length: MAX_COMMANDS + 2 }, (_, i) => `c${i}`)
    expect(mergeCommands([], many)).toEqual(many.slice(0, MAX_COMMANDS))
    expect(mergeCommands(['old'], many)).toEqual(many.slice(0, MAX_COMMANDS))
    expect(mergeCommands(['a'], ['a', ' b '])).toEqual(['a', 'b'])
  })
})

test('buttonLabel shows the whole command on one line', () => {
  expect(buttonLabel('x'.repeat(200))).toBe('x'.repeat(200))
  expect(buttonLabel('cat <<EOF\nhi\nEOF')).toBe('cat <<EOF hi EOF')
})

test('mergeCommands drops commands with controls, bidi or zero-width characters', () => {
  const rlo = String.fromCodePoint(0x202e)
  const zwsp = String.fromCodePoint(0x200b)
  const nbsp = String.fromCodePoint(0xa0)
  const esc = String.fromCodePoint(0x1b)
  expect(mergeCommands([], [`ls ${rlo}fdp.exe`, `rm${zwsp} x`, `ls${nbsp}-la`, `echo ${esc}[31m`, 'ls\t-la'])).toEqual(['ls\t-la'])
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
