import type { test } from 'claude-code/testing'

export type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]
export type Engine = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[0]

/** Stands in for the engine's state store, so a test can read every value the plugin wrote. */
export function stateStore(on: On) {
  const values = new Map<string, { value: unknown; version: number }>()
  const name = (e: { plugin: string; key: string; id?: string }) => `${e.plugin}/${e.key}/${e.id ?? ''}`
  on('state.get', (_$, e) => ({ value: values.get(name(e)) ?? { value: undefined, version: 0 } }))
  on('state.set', (_$, e) => {
    const version = values.get(name(e))?.version ?? 0
    if (e.ifVersion !== undefined && e.ifVersion !== version) return { value: { isSet: false as const, version } }
    values.set(name(e), { value: e.value, version: version + 1 })
    return { value: { isSet: true as const, version: version + 1 } }
  })
  return values
}

/** Every string inside `value`, each with its dotted path. */
export const leaves = (value: unknown, path = '', out: [string, string][] = []) => {
  if (typeof value === 'string') out.push([path, value])
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}.${i}`, out))
  else if (typeof value === 'object' && value !== null) for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out)
  return out
}

/** The flightdeck values the store holds, by key. */
export const flightdeck = (values: Map<string, { value: unknown }>) =>
  Object.fromEntries([...values].filter(([name]) => name.startsWith('flightdeck/')).map(([name, { value }]) => [name.split('/')[1], value]))
