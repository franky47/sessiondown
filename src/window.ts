/**
 * The optional `--since`/`--until` time filter. A half-open interval
 * `[since, until)` over file mtime (epoch ms). An absent bound is open on that
 * side; an empty window includes everything.
 */
export interface TimeWindow {
  since?: Date
  until?: Date
}

// Bounds are parsed with `Date.parse`: a date-only string (`2026-01-01`) is
// UTC, while a bare datetime without `Z` is local time per the JS spec. Pass an
// explicit `Z`/offset for unambiguous instants.
function parseBound(label: 'since' | 'until', value: string): Date {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid --${label} date: ${JSON.stringify(value)}`)
  }
  return new Date(ms)
}

/** Parse raw `--since`/`--until` strings into a {@link TimeWindow}. */
export function parseWindow(input: {
  since?: string
  until?: string
}): TimeWindow {
  const window: TimeWindow = {}
  if (input.since !== undefined) window.since = parseBound('since', input.since)
  if (input.until !== undefined) window.until = parseBound('until', input.until)
  if (
    window.since !== undefined &&
    window.until !== undefined &&
    window.since.getTime() > window.until.getTime()
  ) {
    throw new Error(
      `Invalid time range: --since (${window.since.toISOString()}) is after --until (${window.until.toISOString()})`,
    )
  }
  return window
}

/** True when `mtimeMs` falls within the half-open window `[since, until)`. */
export function inRange(mtimeMs: number, window: TimeWindow): boolean {
  if (window.since !== undefined && mtimeMs < window.since.getTime()) {
    return false
  }
  if (window.until !== undefined && mtimeMs >= window.until.getTime()) {
    return false
  }
  return true
}
