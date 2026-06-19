import { discoverFrom } from '#discover'
import { REGISTRY } from '#registry'
import type { AgentId, RenderedSession } from '#types'

export { render } from '#render'
export {
  AGENT_IDS,
  type AgentId,
  isAgentId,
  type RenderedSession,
} from '#types'

/**
 * Walk the local agent stores, render every session, and stream a
 * {@link RenderedSession} per session. With no options, discovers everything
 * across all supported agents; `agents` narrows the set, `since`/`until` apply
 * an optional mtime window, and `roots` overrides where each agent is searched.
 */
export function discover(
  opts: {
    agents?: AgentId[]
    since?: Date
    until?: Date
    roots?: Partial<Record<AgentId, string[]>>
  } = {},
): AsyncIterable<RenderedSession> {
  return discoverFrom({
    registry: REGISTRY,
    agents: opts.agents,
    window: { since: opts.since, until: opts.until },
    roots: opts.roots,
  })
}
