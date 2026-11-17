import type { RenderPropsOf, RenderSurface, RenderViewport } from 'claude-code'
import type { Layout } from '../types'

type PaneLayout =
  | { kind: 'hidden' }
  | { kind: 'mini'; columns: number; rows: number }
  | { kind: 'compact' | 'wide'; columns: number; columnWidth: number }

type LayoutInput = {
  layout: Layout
  surface: RenderSurface
  props: Pick<RenderPropsOf['Pane'], 'bodyColumns' | 'placement' | 'scroll'>
  viewport?: RenderViewport
}

export function paneLayout({ layout, surface, props, viewport }: LayoutInput): PaneLayout {
  const terminal = surface === 'terminal'
  const columns = terminal ? Math.max(0, Math.floor(props.bodyColumns)) : Math.max(40, props.bodyColumns)
  const bodyRows = props.scroll?.bodyRows ?? viewport?.rows ?? 40
  if (terminal && (columns < 40 || bodyRows < 2 || (viewport !== undefined && viewport.rows < 16))) return { kind: 'hidden' }

  const inline = props.placement === 'inline'
  const mini = layout === 'mini' || (layout === 'auto' && (inline || (terminal && bodyRows < 24)))
  if (mini) {
    const screenBudget = terminal && inline && viewport ? Math.floor(viewport.rows / 4) : 8
    const rows = Math.max(0, Math.min(8, bodyRows, screenBudget))
    return rows < 2 ? { kind: 'hidden' } : { kind: 'mini', columns, rows }
  }

  const wide = (layout === 'wide' || layout === 'auto') && columns >= 110
  return { kind: wide ? 'wide' : 'compact', columns, columnWidth: wide ? Math.floor((columns - 2) / 2) : columns }
}
