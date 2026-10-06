// How a listed command runs on press: `run` on one press, `confirm` on two
// in a row (the person's Bash permission rules deny it).
export type Gate = 'run' | 'confirm'

export type Suggestion = { cmd: string; gate: Gate }

declare module 'claude-code' {
  interface PluginState {
    // `commands`: `! cmd` suggestions from the model's answers and Bash calls
    // the permission check denied, newest batch last, at most MAX_COMMANDS.
    // `armed`: the `confirm` command whose next press runs it, or null.
    'bang-actions': { commands: Suggestion[]; armed: string | null }
  }
}
