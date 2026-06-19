import { homedir } from 'node:os'
import path from 'node:path'

import { z } from 'zod'

import { type AgentSource, globSource } from '#agents/source'

const timestampRow = z.object({ timestamp: z.string().min(1) })

/** First top-level `timestamp` ISO string across the JSONL lines, if any. */
function firstTimestamp(contents: string): string | undefined {
  for (const line of contents.split('\n')) {
    if (line.length === 0) continue
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const parsed = timestampRow.safeParse(row)
    if (parsed.success) return parsed.data.timestamp
  }
  return undefined
}

export const source: AgentSource = globSource({
  defaultRoots: [path.join(homedir(), '.claude', 'projects')],
  pattern: '**/*.jsonl',
  // glob output is posix-separated on every platform, so split on '/'.
  skip: (rel) => rel.split('/').includes('subagents'),
  identify: ({ rel, contents, mtime }) => ({
    sessionId: path.basename(rel, '.jsonl'),
    startedAt: firstTimestamp(contents) ?? new Date(mtime).toISOString(),
  }),
})
