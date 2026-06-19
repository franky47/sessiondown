import { homedir } from 'node:os'
import path from 'node:path'

import { type AgentSource, globSource } from '#agents/source'

/**
 * pi session basenames are `<timestamp>_<uuid>.jsonl`, where the timestamp
 * encodes ISO time with `-` standing in for `:` and `.`, e.g.
 * `2026-05-30T11-42-34-650Z` ⇒ `2026-05-30T11:42:34.650Z`.
 */
const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/

/** Convert a pi filename timestamp prefix to ISO-8601, or undefined. */
function prefixToIso(prefix: string): string | undefined {
  const m = TIMESTAMP_RE.exec(prefix)
  if (m === null) return undefined
  const [, date, h, min, s, ms] = m
  return `${date}T${h}:${min}:${s}.${ms}Z`
}

export const source: AgentSource = globSource({
  defaultRoots: [path.join(homedir(), '.pi', 'agent')],
  subdir: 'sessions',
  pattern: '**/*.jsonl',
  identify: ({ rel, mtime }) => {
    const base = path.basename(rel, '.jsonl')
    const cut = base.lastIndexOf('_')
    const sessionId = cut === -1 ? base : base.slice(cut + 1)
    const prefix = cut === -1 ? '' : base.slice(0, cut)
    return {
      sessionId,
      startedAt: prefixToIso(prefix) ?? new Date(mtime).toISOString(),
    }
  },
})
