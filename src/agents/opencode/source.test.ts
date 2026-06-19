import { describe, expect, test } from 'bun:test'

import type { QueryRows } from '#sqlite'

import { renderOpencodeSession } from './renderer/index.ts'
import { createSource, DEFAULT_DB_PATH, source } from './source.ts'

// ---- Fixtures: two sessions' worth of projected `{ row: string }` rows. ----
// Each `row` is a JSON string, mirroring what the SQLite projection emits:
// a `type:'session'` header first, then `type:'message'`/`type:'part'` rows.

const T_A_CREATED = Date.parse('2026-05-11T10:00:00Z')
const T_A_UPDATED = Date.parse('2026-05-11T10:05:00Z')
const T_B_CREATED = Date.parse('2026-06-01T12:00:00Z')
const T_B_UPDATED = Date.parse('2026-06-01T12:30:00Z')

function projected(...objs: ReadonlyArray<unknown>): Array<{ row: string }> {
  return objs.map((o) => ({ row: JSON.stringify(o) }))
}

function sessionRows(opts: {
  sessionId: string
  timeCreated?: number
  timeUpdated: number
  text: string
}): Array<{ row: string }> {
  return projected(
    {
      type: 'session',
      id: opts.sessionId,
      sessionId: opts.sessionId,
      title: `Session ${opts.sessionId}`,
      directory: '/repo/x',
      project: { id: 'p', worktree: '/repo/x', vcs: 'git', name: 'x' },
      ...(opts.timeCreated === undefined
        ? {}
        : { time_created: opts.timeCreated }),
      time_updated: opts.timeUpdated,
    },
    {
      type: 'message',
      id: `${opts.sessionId}_m1`,
      sessionId: opts.sessionId,
      role: 'user',
      time: { created: opts.timeCreated ?? opts.timeUpdated },
    },
    {
      type: 'part',
      id: `${opts.sessionId}_p1`,
      sessionId: opts.sessionId,
      messageId: `${opts.sessionId}_m1`,
      partType: 'text',
      text: opts.text,
    },
    {
      type: 'message',
      id: `${opts.sessionId}_m2`,
      sessionId: opts.sessionId,
      role: 'assistant',
      time: { created: (opts.timeCreated ?? opts.timeUpdated) + 1000 },
    },
    {
      type: 'part',
      id: `${opts.sessionId}_p2`,
      sessionId: opts.sessionId,
      messageId: `${opts.sessionId}_m2`,
      partType: 'text',
      text: `reply to ${opts.text}`,
    },
  )
}

const TWO_SESSIONS = [
  ...sessionRows({
    sessionId: 'ses_A',
    timeCreated: T_A_CREATED,
    timeUpdated: T_A_UPDATED,
    text: 'hello A',
  }),
  ...sessionRows({
    sessionId: 'ses_B',
    timeCreated: T_B_CREATED,
    timeUpdated: T_B_UPDATED,
    text: 'hello B',
  }),
]

function fakeQuery(
  rows: ReadonlyArray<{ row: string }>,
  capture?: { dbPath?: string; sql?: string },
): QueryRows {
  return async (dbPath, sql) => {
    if (capture !== undefined) {
      capture.dbPath = dbPath
      capture.sql = sql
    }
    return [...rows]
  }
}

async function collect(
  src: ReturnType<typeof createSource>,
  accept?: (m: number) => boolean,
) {
  const out = []
  for await (const unit of src.enumerate(accept ? { accept } : {})) {
    out.push(unit)
  }
  return out
}

describe('opencode source', () => {
  test('groups consecutive rows into one SessionUnit per session', async () => {
    const src = createSource({ queryRows: fakeQuery(TWO_SESSIONS) })
    const units = await collect(src)

    expect(units).toHaveLength(2)

    const [a, b] = units
    expect(a?.sessionId).toBe('ses_A')
    expect(a?.startedAt).toBe(new Date(T_A_CREATED).toISOString())
    expect(a?.mtime).toBe(T_A_UPDATED)
    expect(a?.sourcePath).toBe('ses_A.jsonl')

    expect(b?.sessionId).toBe('ses_B')
    expect(b?.startedAt).toBe(new Date(T_B_CREATED).toISOString())
    expect(b?.mtime).toBe(T_B_UPDATED)
  })

  test('contents is the session rows joined by \\n and renders non-empty Markdown', async () => {
    const src = createSource({ queryRows: fakeQuery(TWO_SESSIONS) })
    const [a] = await collect(src)

    const expectedContents = TWO_SESSIONS.slice(0, 5)
      .map((r) => r.row)
      .join('\n')
    expect(a?.contents).toBe(expectedContents)

    const md = renderOpencodeSession(a!.contents)
    expect(md.length).toBeGreaterThan(0)
    expect(md).toContain('sessionId: ses_A')
    expect(md).toContain('hello A')
  })

  test('accept gate excludes a session whose time_updated is out of range', async () => {
    const src = createSource({ queryRows: fakeQuery(TWO_SESSIONS) })
    // Keep only sessions updated before 2026-05-15 → drops ses_B.
    const cutoff = Date.parse('2026-05-15T00:00:00Z')
    const units = await collect(src, (m) => m < cutoff)

    expect(units).toHaveLength(1)
    expect(units[0]?.sessionId).toBe('ses_A')
  })

  test('empty DB yields zero units', async () => {
    const src = createSource({ queryRows: fakeQuery([]) })
    expect(await collect(src)).toHaveLength(0)
  })

  test('a missing database is the empty case, not an error', async () => {
    // No injected queryRows → the real driver path; the existence guard must
    // skip cleanly instead of throwing (so a default `export` across all agents
    // survives a machine without opencode).
    const src = createSource()
    const out = []
    for await (const u of src.enumerate({ roots: ['/no/such/opencode.db'] })) {
      out.push(u)
    }
    expect(out).toHaveLength(0)
  })

  test('emits the projection SQL with its key invariants', async () => {
    const capture: { dbPath?: string; sql?: string } = {}
    const src = createSource({ queryRows: fakeQuery([], capture) })
    await collect(src)
    expect(capture.sql).toContain("'type', 'session'")
    expect(capture.sql).toContain("'time_created', s.time_created")
    expect(capture.sql).toContain('parent_id IS NULL')
    expect(capture.sql).toContain('ORDER BY session_id, ts, type_rank')
  })

  test('startedAt falls back to time_updated when the header omits time_created', async () => {
    // Mirrors the real projection, which emits only `time_updated` in the row.
    const rows = sessionRows({
      sessionId: 'ses_C',
      timeUpdated: T_A_UPDATED,
      text: 'no created',
    })
    const src = createSource({ queryRows: fakeQuery(rows) })
    const [c] = await collect(src)
    expect(c?.startedAt).toBe(new Date(T_A_UPDATED).toISOString())
    expect(c?.mtime).toBe(T_A_UPDATED)
  })

  describe('dbPath resolution', () => {
    test('roots?.[0] overrides deps.dbPath and the default', async () => {
      const capture: { dbPath?: string; sql?: string } = {}
      const src = createSource({
        queryRows: fakeQuery([], capture),
        dbPath: '/deps/opencode.db',
      })
      for await (const _ of src.enumerate({ roots: ['/override/x.db'] })) void _
      expect(capture.dbPath).toBe('/override/x.db')
    })

    test('falls back to deps.dbPath when no roots are given', async () => {
      const capture: { dbPath?: string; sql?: string } = {}
      const src = createSource({
        queryRows: fakeQuery([], capture),
        dbPath: '/deps/opencode.db',
      })
      await collect(src)
      expect(capture.dbPath).toBe('/deps/opencode.db')
    })

    test('falls back to DEFAULT_DB_PATH when neither roots nor deps.dbPath given', async () => {
      const capture: { dbPath?: string; sql?: string } = {}
      const src = createSource({ queryRows: fakeQuery([], capture) })
      await collect(src)
      expect(capture.dbPath).toBe(DEFAULT_DB_PATH)
    })
  })

  test('source exposes DEFAULT_DB_PATH as its single default root', () => {
    expect(source.defaultRoots).toEqual([DEFAULT_DB_PATH])
  })
})
