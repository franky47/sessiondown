import { describe, expect, test } from 'bun:test'

import { inRange, parseWindow } from '#window'

const ms = (iso: string): number => Date.parse(iso)

describe('parseWindow', () => {
  test('absent bounds → empty window (includes everything)', () => {
    expect(parseWindow({})).toEqual({})
  })

  test('parses since and until date strings into Dates', () => {
    const w = parseWindow({ since: '2026-01-01', until: '2026-02-01' })
    expect(w.since?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(w.until?.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  test('parses only one bound', () => {
    expect(parseWindow({ since: '2026-01-01' }).until).toBeUndefined()
    expect(parseWindow({ until: '2026-01-01' }).since).toBeUndefined()
  })

  test('throws a legible error on an unparseable date', () => {
    expect(() => parseWindow({ since: 'not-a-date' })).toThrow(/since/i)
  })

  test('throws when since is after until', () => {
    expect(() =>
      parseWindow({ since: '2026-02-01', until: '2026-01-01' }),
    ).toThrow(/before|after|range/i)
  })
})

describe('inRange', () => {
  test('empty window includes everything', () => {
    expect(inRange(ms('2026-06-19'), {})).toBe(true)
    expect(inRange(0, {})).toBe(true)
  })

  test('half-open [since, until): since inclusive, until exclusive', () => {
    const w = parseWindow({ since: '2026-01-01', until: '2026-02-01' })
    expect(inRange(ms('2026-01-01T00:00:00Z'), w)).toBe(true) // since boundary included
    expect(inRange(ms('2026-01-15'), w)).toBe(true)
    expect(inRange(ms('2026-02-01T00:00:00Z'), w)).toBe(false) // until boundary excluded
    expect(inRange(ms('2025-12-31'), w)).toBe(false)
  })

  test('open-ended ranges', () => {
    expect(
      inRange(ms('2030-01-01'), parseWindow({ since: '2026-01-01' })),
    ).toBe(true)
    expect(
      inRange(ms('2020-01-01'), parseWindow({ since: '2026-01-01' })),
    ).toBe(false)
    expect(
      inRange(ms('2020-01-01'), parseWindow({ until: '2026-01-01' })),
    ).toBe(true)
  })
})
