import type { AgentId } from '#types'

import { renderClaudeSession } from './agents/claude-code/renderer/index.ts'
import { renderCodexSession } from './agents/codex/renderer/index.ts'
import { renderOpencodeSession } from './agents/opencode/renderer/index.ts'
import { renderPiSession } from './agents/pi/renderer/index.ts'

/** agent id → its pure `contents → markdown` renderer (layer 1). */
export const RENDERERS: Record<AgentId, (contents: string) => string> = {
  'claude-code': renderClaudeSession,
  codex: renderCodexSession,
  pi: renderPiSession,
  opencode: renderOpencodeSession,
}

/**
 * Render one session's raw `contents` to Markdown using the explicitly named
 * agent's renderer. Pure: string in, string out, no filesystem access. Throws
 * if `contents` is unparseable for that agent.
 */
export function render(contents: string, agent: AgentId): string {
  const renderer = RENDERERS[agent]
  if (renderer === undefined) {
    throw new Error(`Unknown agent: ${JSON.stringify(agent)}`)
  }
  return renderer(contents)
}
