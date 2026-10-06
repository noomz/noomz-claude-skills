// How a listed command runs on press: `run` on one press, `confirm` on two
// in a row (the person's Bash permission rules deny it). A `run` command the
// band as drawn cannot show whole also takes two presses.
export type Gate = 'run' | 'confirm'

// `isArmed`: the one two-press command whose next press runs it. On the
// entry, so a command that leaves the list takes its arming with it.
export type Suggestion = { cmd: string; gate: Gate; isArmed?: true }

declare module 'claude-code' {
  interface PluginState {
    // `commands`: `! cmd` suggestions from the model's answers and Bash calls
    // the permission check denied, newest batch last, at most MAX_COMMANDS.
    // `succeeded`: commands a press ran with exit 0 since the last answer,
    // which the next answer's suggestions leave out.
    // `denied`: commands a hook denied on the model's own call this session,
    // newest last, at most MAX_DENIED; each is `confirm` whenever listed.
    'bang-actions': { commands: Suggestion[]; succeeded: string[]; denied: string[] }
  }
}
