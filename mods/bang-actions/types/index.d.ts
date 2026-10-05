export type Commands = string[]

// The last command a Run button ran, as the band shows it.
export type RunResult = { cmd: string; exitCode: number; tail: string }

declare module 'claude-code' {
  interface PluginState {
    // `suggested`: short `! cmd` suggestions from the model's answers, run on
    // press once the Bash permission rules allow them.
    // `review`: commands that only fill the prompt on press: Bash calls a
    // permission check denied, and suggestions too long to show in full.
    'bang-actions': { suggested: Commands; review: Commands; last: RunResult | null }
  }
}
