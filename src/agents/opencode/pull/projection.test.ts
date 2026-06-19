import { describe, expect, test } from 'bun:test'

import { buildProjectionSql } from './projection.ts'

describe('buildProjectionSql', () => {
  test('interpolates the numeric bounds into the time filter', () => {
    const sql = buildProjectionSql({ sinceMs: 100, untilMs: 200 })
    expect(sql).toContain('time_updated > 100')
    expect(sql).toContain('time_updated < 200')
  })

  test('filters to top-level sessions and orders deterministically', () => {
    const sql = buildProjectionSql({ sinceMs: 0, untilMs: 1 })
    expect(sql).toContain('parent_id IS NULL')
    expect(sql).toContain('ORDER BY session_id, ts, type_rank')
  })

  test('session header carries both time fields', () => {
    const sql = buildProjectionSql({ sinceMs: 0, untilMs: 1 })
    expect(sql).toContain("'time_created', s.time_created")
    expect(sql).toContain("'time_updated', s.time_updated")
  })

  test('unions session, message, and part rows', () => {
    const sql = buildProjectionSql({ sinceMs: 0, untilMs: 1 })
    expect(sql).toContain("'type', 'session'")
    expect(sql).toContain("'type', 'message'")
    expect(sql).toContain("'type', 'part'")
  })

  test('rejects non-integer or negative bounds', () => {
    expect(() => buildProjectionSql({ sinceMs: -1, untilMs: 10 })).toThrow(
      RangeError,
    )
    expect(() => buildProjectionSql({ sinceMs: 1.5, untilMs: 10 })).toThrow(
      RangeError,
    )
    expect(() => buildProjectionSql({ sinceMs: 0, untilMs: -5 })).toThrow(
      RangeError,
    )
  })
})
