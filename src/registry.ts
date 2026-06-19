import { source as claudeSource } from '#agents/claude-code/source'
import { source as codexSource } from '#agents/codex/source'
import { source as opencodeSource } from '#agents/opencode/source'
import { source as piSource } from '#agents/pi/source'
import type { AgentSource } from '#agents/source'
import type { AgentModule } from '#discover'
import { RENDERERS } from '#render'
import type { AgentId } from '#types'

function moduleFor(id: AgentId, source: AgentSource): AgentModule {
  return {
    id,
    root: source.defaultRoots[0] ?? '',
    render: RENDERERS[id],
    source,
  }
}

/**
 * The single place agents are registered. Adding a fifth agent is "drop in a
 * module and register it" — implement its `renderer/` and `source.ts`, then add
 * one line here. No shared cross-agent abstraction beyond the envelope.
 */
export const REGISTRY: readonly AgentModule[] = [
  moduleFor('claude-code', claudeSource),
  moduleFor('codex', codexSource),
  moduleFor('pi', piSource),
  moduleFor('opencode', opencodeSource),
]

/** The on-disk root an agent's mirrored output is laid out under. */
export function rootFor(agent: AgentId): string {
  return REGISTRY.find((m) => m.id === agent)?.root ?? ''
}
