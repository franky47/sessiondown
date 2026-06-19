import { homedir } from 'node:os'
import path from 'node:path'

import { z } from 'zod'

import { type AgentSource, globSource } from '#agents/source'

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const sessionMetaRow = z.object({
  type: z.literal('session_meta'),
  payload: z
    .object({
      id: z.string().optional(),
      timestamp: z.string().optional(),
    })
    .passthrough(),
})

/** First `session_meta` payload's id/timestamp across the rollout JSONL. */
function sessionMeta(
  contents: string,
): { id?: string; timestamp?: string } | undefined {
  for (const line of contents.split('\n')) {
    if (line.length === 0) continue
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const parsed = sessionMetaRow.safeParse(row)
    if (parsed.success) {
      return {
        id: parsed.data.payload.id,
        timestamp: parsed.data.payload.timestamp,
      }
    }
  }
  return undefined
}

export const source: AgentSource = globSource({
  defaultRoots: [path.join(homedir(), '.codex')],
  subdir: 'sessions',
  pattern: '**/*.jsonl',
  identify: ({ rel, contents, mtime }) => {
    const meta = sessionMeta(contents)
    const sessionId =
      meta?.id ??
      path.basename(rel).match(UUID_RE)?.[0] ??
      path.basename(rel, '.jsonl')
    const startedAt = meta?.timestamp ?? new Date(mtime).toISOString()
    return { sessionId, startedAt }
  },
})
