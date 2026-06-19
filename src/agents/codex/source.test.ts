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

function jsonl(...rows: ReadonlyArray<unknown>): string {
  return rows.map((r) => JSON.stringify(r)).join('\n')
}

function metaRow(): unknown {
  return {
    timestamp: '2026-05-27T13:09:05.638Z',
    type: 'session_meta',
    payload: {
      id: '019e698d-5a54-73a0-9e0e-2268c84e7ade',
      timestamp: '2026-05-27T13:08:51.941Z',
      cwd: '/repo',
      originator: 'codex-tui',
      cli_version: '0.134.0',
      model_provider: 'openai',
    },
  }
}

const SESSIONS = (root: string): string => path.join(root, 'sessions')

describe('codex source identify', () => {
  test('sessionId and startedAt come from the session_meta payload', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({
      [SESSIONS(root)]: [
        {
          rel: '2026/05/27/rollout-x.jsonl',
          contents: jsonl(metaRow(), {
            timestamp: '2026-05-27T13:10:00.000Z',
            type: 'event_msg',
            payload: { type: 'task_started' },
          }),
          mtime: 1000,
        },
      ],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units).toHaveLength(1)
    expect(units[0]!.sessionId).toBe('019e698d-5a54-73a0-9e0e-2268c84e7ade')
    expect(units[0]!.startedAt).toBe('2026-05-27T13:08:51.941Z')
  })

  test('glob runs in the sessions subdir of the root', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({ [SESSIONS(root)]: [] })
    await collect(source.enumerate({ io: fake.io, roots: [root] }))
    expect(fake.globCalls).toEqual([
      { pattern: '**/*.jsonl', cwd: path.join(root, 'sessions') },
    ])
  })

  test('falls back to a uuid token in the filename when session_meta is absent', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({
      [SESSIONS(root)]: [
        {
          rel: '2026/05/27/rollout-2026-05-27T15-08-51-019e698d-5a54-73a0-9e0e-2268c84e7ade.jsonl',
          contents: jsonl({ type: 'event_msg', payload: {} }),
          mtime: Date.UTC(2026, 4, 27),
        },
      ],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units[0]!.sessionId).toBe('019e698d-5a54-73a0-9e0e-2268c84e7ade')
    expect(units[0]!.startedAt).toBe(
      new Date(Date.UTC(2026, 4, 27)).toISOString(),
    )
  })

  test('falls back to mtime ISO when neither meta nor a uuid is available', async () => {
    const root = '/fake/root'
    const mtime = Date.UTC(2026, 1, 3, 4, 5, 6)
    const fake = makeFakeIO({
      [SESSIONS(root)]: [
        { rel: 'plain.jsonl', contents: jsonl({ type: 'event_msg' }), mtime },
      ],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units[0]!.startedAt).toBe(new Date(mtime).toISOString())
    expect(units[0]!.sessionId).toBe('plain')
  })

  test('mtime passthrough and sourcePath is the joined absolute path', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({
      [SESSIONS(root)]: [
        { rel: '2026/r.jsonl', contents: jsonl(metaRow()), mtime: 777 },
      ],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root] }),
    )
    expect(units[0]!.mtime).toBe(777)
    expect(units[0]!.sourcePath).toBe(path.join(SESSIONS(root), '2026/r.jsonl'))
  })

  test('accept gate excludes a stale unit and never reads it', async () => {
    const root = '/fake/root'
    const fake = makeFakeIO({
      [SESSIONS(root)]: [
        { rel: 'fresh.jsonl', contents: jsonl(metaRow()), mtime: 200 },
        { rel: 'stale.jsonl', contents: jsonl(metaRow()), mtime: 100 },
      ],
    })
    const units = await collect(
      source.enumerate({ io: fake.io, roots: [root], accept: (m) => m >= 150 }),
    )
    expect(units).toHaveLength(1)
    expect(fake.readCalls).toEqual([path.join(SESSIONS(root), 'fresh.jsonl')])
  })

  test('missing root yields zero units', async () => {
    const fake = makeFakeIO({})
    const units = await collect(
      source.enumerate({ io: fake.io, roots: ['/absent'] }),
    )
    expect(units).toEqual([])
  })

  test('defaultRoots points at ~/.codex', () => {
    expect(source.defaultRoots[0]!.endsWith('/.codex')).toBe(true)
  })
})
