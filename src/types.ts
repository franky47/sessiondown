/**
 * The set of coding agents sessiondown knows how to discover and render.
 * Adding a fifth agent is "drop in a module and register it" — see registry.ts.
 */
export const AGENT_IDS = ['claude-code', 'codex', 'pi', 'opencode'] as const

export type AgentId = (typeof AGENT_IDS)[number]

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value)
}

/**
 * The minimal common envelope yielded by {@link discover} for every session,
 * across every agent. It is the ONLY typed metadata in the public API: richer
 * per-agent detail (model, cost, git, tokens, …) stays embedded in the rendered
 * Markdown's YAML frontmatter, so consumers can parse out what they need without
 * the package committing to a sprawling typed schema.
 */
export interface RenderedSession {
  /** Which agent produced this session. */
  agent: AgentId
  /** Absolute path (or stable synthetic id) of the on-disk session unit. */
  sourcePath: string
  /** The session's own identifier (uuid, rollout id, …). */
  sessionId: string
  /** ISO-8601 timestamp of when the session started. */
  startedAt: string
  /** File modification time, epoch milliseconds — what the time window filters on. */
  mtime: number
  /** The rendered Markdown: YAML frontmatter + body. */
  markdown: string
}
