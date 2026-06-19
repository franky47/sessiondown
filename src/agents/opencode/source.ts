import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import { z } from 'zod'

import { buildProjectionSql } from '#agents/opencode/pull'
import type { AgentSource, EnumerateOpts, SessionUnit } from '#agents/source'
import { queryRows as defaultQueryRows, type QueryRows } from '#sqlite'

/** Default location of opencode's SQLite database. */
export const DEFAULT_DB_PATH = path.join(
  homedir(),
  '.local',
  'share',
  'opencode',
  'opencode.db',
)

/** Each projected DB row is `{ row: <json string> }`. */
const projectedRowSchema = z.object({ row: z.string() })

/** Every projected JSONL line carries the session it belongs to. */
const rowEnvelopeSchema = z.object({
  type: z.string(),
  sessionId: z.string(),
})

// The first row of every session is its header (the projection orders the
// `type:'session'` row ahead of its messages/parts). Both times are epoch
// milliseconds: `time_updated` drives the mtime gate, `time_created` is
// `startedAt`. `time_created` stays optional as a defensive fallback to
// `time_updated` in case a row predates it being projected.
const sessionHeaderSchema = z.object({
  type: z.literal('session'),
  sessionId: z.string(),
  time_created: z.number().optional(),
  time_updated: z.number(),
})
type SessionHeader = z.infer<typeof sessionHeaderSchema>

interface SessionGroup {
  sessionId: string
  header: unknown
  raws: string[]
}

/** Group consecutive projected rows by session, keeping each row's raw text. */
function groupBySession(
  rows: ReadonlyArray<Record<string, unknown>>,
): SessionGroup[] {
  const groups: SessionGroup[] = []
  let current: SessionGroup | null = null
  for (const r of rows) {
    const projected = projectedRowSchema.safeParse(r)
    if (!projected.success) continue
    const raw = projected.data.row
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }
    const env = rowEnvelopeSchema.safeParse(parsed)
    if (!env.success) continue
    if (current === null || current.sessionId !== env.data.sessionId) {
      current = { sessionId: env.data.sessionId, header: parsed, raws: [] }
      groups.push(current)
    }
    current.raws.push(raw)
  }
  return groups
}

function toUnit(group: SessionGroup, header: SessionHeader): SessionUnit {
  const mtime = header.time_updated
  const startedAt = new Date(header.time_created ?? mtime).toISOString()
  return {
    sourcePath: `${header.sessionId}.jsonl`,
    sessionId: header.sessionId,
    startedAt,
    mtime,
    contents: group.raws.join('\n'),
  }
}

/**
 * opencode's discovery source. Unlike the file-glob agents it projects rows out
 * of opencode's SQLite DB, regroups them per session, and yields each session's
 * reconstructed JSONL `contents` (what the opencode renderer consumes).
 */
export function createSource(
  deps: { queryRows?: QueryRows; dbPath?: string } = {},
): AgentSource {
  return {
    defaultRoots: [DEFAULT_DB_PATH],
    async *enumerate(opts: EnumerateOpts = {}): AsyncIterable<SessionUnit> {
      const accept = opts.accept ?? (() => true)
      // opencode keeps all sessions in one DB, so a single root applies.
      const dbPath = opts.roots?.[0] ?? deps.dbPath ?? DEFAULT_DB_PATH
      const query = deps.queryRows ?? defaultQueryRows
      // A missing store is the empty case (zero sessions), not an error —
      // matching the glob sources, so a default `export` across all agents
      // doesn't abort on a machine that simply hasn't installed opencode.
      // (Guard only the real driver; an injected fake DB has no real path.)
      if (deps.queryRows === undefined && !existsSync(dbPath)) return
      // The optional time window is applied later via `accept`, not in SQL.
      const sql = buildProjectionSql({
        sinceMs: 0,
        untilMs: Number.MAX_SAFE_INTEGER,
      })
      const rows = await query(dbPath, sql)
      for (const group of groupBySession(rows)) {
        const header = sessionHeaderSchema.safeParse(group.header)
        if (!header.success) continue
        if (!accept(header.data.time_updated)) continue
        yield toUnit(group, header.data)
      }
    },
  }
}

export const source: AgentSource = createSource()
