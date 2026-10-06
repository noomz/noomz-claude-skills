export type SafeText = string & { readonly __safe: true }

export type Hygiene = { masked: number; rejected: number }

export type Todo = { id: string; text: SafeText; isDone: boolean; isActive?: boolean }

export type Decision = { id: string; text: SafeText }

export type Pin = { href: SafeText; label: SafeText }

export type Board = { todos: Todo[]; decisions: Decision[] }

declare module 'claude-code' {
  interface PluginState {
    pinboard: {
      board: Board
      links: Pin[]
      hygiene: Hygiene
    }
  }
}
