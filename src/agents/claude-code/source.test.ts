import { describe, expect, test } from 'bun:test'
import path from 'node:path'

import type { FileIO, SessionUnit } from '#agents/source'

import { source } from './source.ts'

interface FakeEntry {
  rel: string
  contents: string
  mtime: number
}

interface FakeIO {
  io: FileIO
  globCalls: Array<{ pattern: string; cwd: string }>
  readCalls: string[]
  statCalls: string[]
}

/** Build a call-tracking fake FileIO keyed by cwd → entries. */
function makeFakeIO(tree: Record<string, FakeEntry[]>): FakeIO {
  const globCalls: Array<{ pattern: string; cwd: string }> = []
  const readCalls: string[] = []
  const statCalls: string[] = []
  const byAbs = new Map<string, FakeEntry>()
  for (const [cwd, entries] of Object.entries(tree)) {
    for (const e of entries) byAbs.set(path.join(cwd, e.rel), e)
  }
  const io: FileIO = {
    async glob(pattern, cwd) {
      globCalls.push({ pattern, cwd })
      return (tree[cwd] ?? []).map((e) => e.rel)
    },
    async readFile(absPath) {
      readCalls.push(absPath)
      const e = byAbs.get(absPath)
      if (e === undefined) throw new Error(`no fake file: ${absPath}`)
      return e.contents
    },
    async statMtimeMs(absPath) {
      statCalls.push(absPath)
      const e = byAbs.get(absPath)
      if (e === undefined) throw new Error(`no fake file: ${absPath}`)
      return e.mtime
    },
  }
  return { io, globCalls, readCalls, statCalls }
}

async function collect(it: AsyncIterable<SessionUnit>): Promise<SessionUnit[]> {
  const out: SessionUnit[] = []
  for await (const u of it) out.push(u)
  return out
}

function jsonl(...rows: ReadonlyArray<unknown>): string {
  return rows.map((r) => JSON.stringify(r)).join('\n')
}

describe('claude-code source identify', () => {
  test('sessionId is the basename without .jsonl; startedAt is the first line timestamp', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({
      [root]: [
        {
          rel: 'proj/abc-123.jsonl',
          contents: jsonl(
            { type: 'mode', mode: 'normal' },
            { type: 'user', timestamp: '2026-06-08T20:24:17.070Z' },
          ),
          mtime: 1000,
        },
      ],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units).toHaveLength(1)
    expect(units[0]!.sessionId).toBe('abc-123')
    expect(units[0]!.startedAt).toBe('2026-06-08T20:24:17.070Z')
  })

  test('startedAt falls back to mtime ISO when no line carries a timestamp', async () => {
    const root = '/fake/root'
    const mtime = Date.UTC(2026, 0, 2, 3, 4, 5)
    const fake = makeFakeIO({
      [root]: [
        {
          rel: 's.jsonl',
          contents: jsonl({ type: 'mode' }, { type: 'permission-mode' }),
          mtime,
        },
      ],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units[0]!.startedAt).toBe(new Date(mtime).toISOString())
  })

  test('mtime passthrough and sourcePath is the joined absolute path', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({
      [root]: [{ rel: 'proj/x.jsonl', contents: '', mtime: 4242 }],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units[0]!.mtime).toBe(4242)
    expect(units[0]!.sourcePath).toBe(path.join(root, 'proj/x.jsonl'))
    expect(units[0]!.contents).toBe('')
  })

  test('accept gate excludes a stale unit and never reads it (stat-only filter)', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({
      [root]: [
        { rel: 'fresh.jsonl', contents: jsonl({ timestamp: 'T' }), mtime: 200 },
        { rel: 'stale.jsonl', contents: jsonl({ timestamp: 'T' }), mtime: 100 },
      ],
    })
    const units = await collect(
      source.enumerate({
        io: fake.io,
        roots: [root],
        accept: (m) => m >= 150,
      }),
    )
    expect(units.map((u) => u.sessionId)).toEqual(['fresh'])
    expect(fake.readCalls).toEqual([path.join(root, 'fresh.jsonl')])
    expect(fake.statCalls).toContain(path.join(root, 'stale.jsonl'))
  })

  test('skip drops any path with a subagents/ segment', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({
      [root]: [
        { rel: 'proj/main.jsonl', contents: '', mtime: 1 },
        { rel: 'proj/subagents/helper.jsonl', contents: '', mtime: 1 },
      ],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units.map((u) => u.sessionId)).toEqual(['main'])
    expect(fake.readCalls).toEqual([path.join(root, 'proj/main.jsonl')])
  })

  test('missing root yields zero units', async () => {
    const fake = makeFakeIO({})
    const units = await collect(
      source.enumerate({ io: fake.io, roots: ['/absent'] }),
    )
    expect(units).toEqual([])
  })

  test('defaultRoots points at ~/.claude/projects', () => {
    expect(source.defaultRoots).toHaveLength(1)
    expect(source.defaultRoots[0]!.endsWith('/.claude/projects')).toBe(true)
  })
})
