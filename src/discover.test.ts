import { describe, expect, test } from 'bun:test'

import type { SessionUnit } from '#agents/source'
import { type AgentModule, discoverFrom } from '#discover'
import type { AgentId, RenderedSession } from '#types'

const unit = (over: Partial<SessionUnit>): SessionUnit => ({
  sourcePath: '/root/s.jsonl',
  sessionId: 's',
  startedAt: '2026-06-19T00:00:00.000Z',
  mtime: Date.parse('2026-06-19'),
  contents: 'raw',
  ...over,
})

function fakeModule(
  id: AgentId,
  units: SessionUnit[],
): AgentModule & { seenRoots: (string[] | undefined)[] } {
  const seenRoots: (string[] | undefined)[] = []
  return {
    id,
    root: `/root/${id}`,
    render: (contents) => `MD<${id}>(${contents})`,
    seenRoots,
    source: {
      defaultRoots: [`/root/${id}`],
      async *enumerate(opts = {}) {
        seenRoots.push(opts.roots)
        const accept = opts.accept ?? (() => true)
        for (const u of units) if (accept(u.mtime)) yield u
      },
    },
  }
}

async function collect(
  it: AsyncIterable<RenderedSession>,
): Promise<RenderedSession[]> {
  const out: RenderedSession[] = []
  for await (const r of it) out.push(r)
  return out
}

describe('discoverFrom', () => {
  test('renders every agent by default and maps the envelope', async () => {
    const a = fakeModule('claude-code', [
      unit({ sessionId: 'a', contents: 'x' }),
    ])
    const b = fakeModule('codex', [unit({ sessionId: 'b', contents: 'y' })])
    const got = await collect(discoverFrom({ registry: [a, b] }))
    expect(got).toHaveLength(2)
    const claude = got.find((r) => r.agent === 'claude-code')
    expect(claude).toMatchObject({
      agent: 'claude-code',
      sessionId: 'a',
      markdown: 'MD<claude-code>(x)',
      startedAt: '2026-06-19T00:00:00.000Z',
    })
  })

  test('agents filter narrows the set', async () => {
    const a = fakeModule('claude-code', [unit({ sessionId: 'a' })])
    const b = fakeModule('codex', [unit({ sessionId: 'b' })])
    const got = await collect(
      discoverFrom({ registry: [a, b], agents: ['codex'] }),
    )
    expect(got.map((r) => r.agent)).toEqual(['codex'])
  })

  test('mtime window excludes out-of-range sessions', async () => {
    const a = fakeModule('pi', [
      unit({ sessionId: 'old', mtime: Date.parse('2020-01-01') }),
      unit({ sessionId: 'new', mtime: Date.parse('2026-06-19') }),
    ])
    const got = await collect(
      discoverFrom({
        registry: [a],
        window: { since: new Date('2026-01-01') },
      }),
    )
    expect(got.map((r) => r.sessionId)).toEqual(['new'])
  })

  test('roots override is forwarded to the source', async () => {
    const a = fakeModule('pi', [unit({})])
    await collect(discoverFrom({ registry: [a], roots: { pi: ['/custom'] } }))
    expect(a.seenRoots).toEqual([['/custom']])
  })

  test('unknown requested agents simply yield nothing', async () => {
    const a = fakeModule('pi', [unit({})])
    const got = await collect(
      discoverFrom({ registry: [a], agents: ['codex'] }),
    )
    expect(got).toEqual([])
  })
})
