import type { AgentSource } from '#agents/source'
import type { AgentId, RenderedSession } from '#types'
import { inRange, type TimeWindow } from '#window'

/**
 * A fully-registered agent: its renderer (layer 1), its discovery source, and
 * the root its mirrored output is laid out under. The registry is a list of
 * these; see registry.ts.
 */
export interface AgentModule {
  id: AgentId
  /** Primary on-disk root, used to mirror output paths. */
  root: string
  render: (contents: string) => string
  source: AgentSource
}

/**
 * The discovery engine (layer 2). Filters the registry by requested agents,
 * fans out across each agent's source under the optional mtime window, renders
 * each session, and streams a {@link RenderedSession} per unit. IO lives in the
 * sources; this stays a pure orchestration over the injected registry.
 */
export async function* discoverFrom(opts: {
  registry: readonly AgentModule[]
  agents?: AgentId[]
  window?: TimeWindow
  roots?: Partial<Record<AgentId, string[]>>
}): AsyncIterable<RenderedSession> {
  const window = opts.window ?? {}
  const wanted = opts.agents
  const accept = (mtimeMs: number): boolean => inRange(mtimeMs, window)

  for (const mod of opts.registry) {
    if (wanted !== undefined && !wanted.includes(mod.id)) continue
    const roots = opts.roots?.[mod.id]
    for await (const u of mod.source.enumerate({ accept, roots })) {
      yield {
        agent: mod.id,
        sourcePath: u.sourcePath,
        sessionId: u.sessionId,
        startedAt: u.startedAt,
        mtime: u.mtime,
        markdown: mod.render(u.contents),
      }
    }
  }
}
