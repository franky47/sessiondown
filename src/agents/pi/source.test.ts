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

const SESSIONS = (root: string): string => path.join(root, 'sessions')
const UUID = '019e78b1-6e99-707d-8739-a0c1806ae7b8'
const FILENAME = `2026-05-30T11-42-34-650Z_${UUID}.jsonl`

describe('pi source identify', () => {
  test('sessionId is the trailing uuid; startedAt is the ISO-normalised prefix', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({
      [SESSIONS(root)]: [{ rel: FILENAME, contents: '', mtime: 1000 }],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units).toHaveLength(1)
    expect(units[0]!.sessionId).toBe(UUID)
    expect(units[0]!.startedAt).toBe('2026-05-30T11:42:34.650Z')
  })

  test('a nested project dir in rel still parses the basename correctly', async () => {
    const root = '/fake/root'
    const rel = `--Users-franky-dev--/${FILENAME}`
    const fake = makeFakeIO({
      [SESSIONS(root)]: [{ rel, contents: '', mtime: 1000 }],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units[0]!.sessionId).toBe(UUID)
    expect(units[0]!.startedAt).toBe('2026-05-30T11:42:34.650Z')
    expect(units[0]!.sourcePath).toBe(path.join(SESSIONS(root), rel))
  })

  test('glob runs in the sessions subdir of the root', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({ [SESSIONS(root)]: [] })
    await collect(source.enumerate({ io: fake.io, roots: [root] }))
    expect(fake.globCalls).toEqual([
      { pattern: '**/*.jsonl', cwd: path.join(root, 'sessions') },
    ])
  })

  test('startedAt falls back to mtime ISO when the prefix is unparseable', async () => {
    const root = '/fake/root'
    const mtime = Date.UTC(2026, 2, 4, 5, 6, 7)
    const fake = makeFakeIO({
      [SESSIONS(root)]: [
        { rel: `not-a-timestamp_${UUID}.jsonl`, contents: '', mtime },
      ],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units[0]!.sessionId).toBe(UUID)
    expect(units[0]!.startedAt).toBe(new Date(mtime).toISOString())
  })

  test('mtime passthrough and sourcePath is the joined absolute path', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({
      [SESSIONS(root)]: [{ rel: FILENAME, contents: 'x', mtime: 555 }],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units[0]!.mtime).toBe(555)
    expect(units[0]!.contents).toBe('x')
    expect(units[0]!.sourcePath).toBe(path.join(SESSIONS(root), FILENAME))
  })

  test('accept gate excludes a stale unit and never reads it', async () => {
    const root = '/fake/root'
    const fresh = `2026-05-30T11-42-34-650Z_${UUID}.jsonl`
    const stale = `2026-01-01T00-00-00-000Z_${UUID}.jsonl`
    const fake = makeFakeIO({
      [SESSIONS(root)]: [
        { rel: fresh, contents: '', mtime: 200 },
        { rel: stale, contents: '', mtime: 100 },
      ],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root], accept: (m) => m >= 150 }),
    )
    expect(units).toHaveLength(1)
    expect(units[0]!.mtime).toBe(200)
    expect(fake.readCalls).toEqual([path.join(SESSIONS(root), fresh)])
    expect(fake.statCalls).toContain(path.join(SESSIONS(root), stale))
  })

  test('missing root yields zero units', async () => {
    const fake = makeFakeIO({})
    const units = await collect(
      source.enumerate({ io: fake.io, roots: ['/absent'] }),
    )
    expect(units).toEqual([])
  })

  test('defaultRoots points at ~/.pi/agent', () => {
    expect(source.defaultRoots[0]!.endsWith('/.pi/agent')).toBe(true)
  })
})
