import type { test } from 'claude-code/testing'

type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]

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
  return { values, value: (key: string) => values.get(`pinboard/${key}/`)?.value }
}
