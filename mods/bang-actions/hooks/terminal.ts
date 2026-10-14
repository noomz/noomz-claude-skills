import type { EngineInterface } from 'claude-code'

// A run never touches the person's terminal. The engine's child shares Claude
// Code's controlling terminal, so a program that opens /dev/tty (sudo's
// password prompt, ssh, gpg, a git login) would turn off its echo and read the
// person's keys from under the prompt. Every run starts in a session of its
// own with no terminal: such a program fails as it would in CI, and sudo asks
// through SUDO_ASKPASS instead.
//
// perl forks, so the child is never a group leader and setsid holds; forwards
// TERM, INT and HUP to the child's whole session, so the engine's timeout
// still stops everything; and exits with the child's status.
const PERL_DETACH = [
  'my $pid = 0;',
  'for my $sig (qw(TERM INT HUP)) { $SIG{$sig} = sub { kill $sig, -$pid if $pid > 0 } }',
  '$pid = fork() // die "fork: $!\\n";',
  'if ($pid == 0) { POSIX::setsid() or die "setsid: $!\\n"; exec { $ARGV[0] } @ARGV or die "exec $ARGV[0]: $!\\n" }',
  'while (waitpid($pid, 0) == -1) { last unless $!{EINTR} }',
  'exit($? & 127 ? 128 + ($? & 127) : $? >> 8);',
].join(' ')

const DETACH = [
  `if command -v perl >/dev/null 2>&1; then exec perl -MPOSIX -e '${PERL_DETACH}' "$@"; fi`,
  'if command -v setsid >/dev/null 2>&1; then exec setsid -w "$@"; fi',
  "echo 'bang-actions: cannot run away from the terminal: neither perl nor setsid found' >&2",
  'exit 126',
].join('\n')

// The argument vector that runs `argv` detached from the terminal.
export function detached(argv: readonly string[]): string[] {
  return ['/bin/sh', '-c', DETACH, 'bang-actions', ...argv]
}

// With no terminal, a `sudo` that needs a password reads it through the
// askpass helper SUDO_ASKPASS names. This one asks in a desktop dialog with
// hidden typing and prints the answer to sudo alone: the password never passes
// through Claude Code, the band, the transcript or the model.
export const ASKPASS_SCRIPT = `#!/bin/sh
# sudo's askpass helper, written by the bang-actions mod.
if command -v osascript >/dev/null 2>&1; then
  exec osascript -e 'on run argv' -e 'display dialog (item 1 of argv) with title "bang-actions: sudo" default answer "" with hidden answer with icon caution' -e 'text returned of result' -e 'end run' "\${1:-Password:}"
fi
if command -v zenity >/dev/null 2>&1; then
  exec zenity --password --title='bang-actions: sudo'
fi
echo 'bang-actions: no password dialog (osascript or zenity) found' >&2
exit 1
`

// Prints the helper's path: the person's own SUDO_ASKPASS when set, the one
// written before ($2) while it is still there, else a new one in a private
// directory of its own.
const INSTALL = [
  'if [ -n "${SUDO_ASKPASS:-}" ]; then printf %s "$SUDO_ASKPASS"; exit 0; fi',
  'if [ -n "$2" ] && [ -x "$2" ]; then printf %s "$2"; exit 0; fi',
  'd=$(mktemp -d) && printf %s "$1" > "$d/askpass" && chmod 700 "$d/askpass" && printf %s "$d/askpass"',
].join('\n')

const SUDO = /\bsudo\b/

let helper = ''

// The environment a command runs with: SUDO_ASKPASS when it calls sudo. A
// helper that cannot be written leaves sudo to fail as it would without one.
export async function askpassEnv($: EngineInterface, cmd: string): Promise<Record<string, string> | undefined> {
  if (!SUDO.test(cmd)) {
    return undefined
  }

  const r = await $.process.run(['/bin/sh', '-c', INSTALL, 'askpass', ASKPASS_SCRIPT, helper], { stdin: '' }).catch(() => undefined)
  if (r?.exitCode !== 0 || r.stdout === '') {
    return undefined
  }
  helper = r.stdout

  return { SUDO_ASKPASS: helper }
}
