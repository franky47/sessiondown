import { describe, expect, test } from 'bun:test'

import { type CliDeps, run } from '#cli'
import type { AgentId, RenderedSession } from '#types'

function harness(over: Partial<CliDeps> = {}) {
  const out: string[] = []
  const err: string[] = []
  const writes: { outDir: string; agent: string; root: string; id: string }[] =
    []
  const deps: CliDeps = {
    readStdin: async () => 'STDIN',
    readFile: async (p) => `FILE:${p}`,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    render: (contents, agent) => `MD[${agent}](${contents})`,
    async *discover() {
      yield* []
    },
    writeSession: async ({ outDir, agent, root, rendered }) => {
      writes.push({ outDir, agent, root, id: rendered.sessionId })
      return `${outDir}/${agent}/${rendered.sessionId}.md`
    },
    rootFor: (agent) => `/root/${agent}`,
    ...over,
  }
  return { deps, out, err, writes }
}

const rendered = (over: Partial<RenderedSession>): RenderedSession => ({
  agent: 'claude-code',
  sourcePath: '/x.jsonl',
  sessionId: 's',
  startedAt: '2026-06-19T00:00:00.000Z',
  mtime: 0,
  markdown: 'MD',
  ...over,
})

describe('render subcommand', () => {
  test('renders an explicit file path to stdout', async () => {
    const h = harness()
    const code = await run(
      ['render', '--agent', 'claude-code', 'foo.jsonl'],
      h.deps,
    )
    expect(code).toBe(0)
    expect(h.out.join('')).toBe('MD[claude-code](FILE:foo.jsonl)')
  })

  test('reads stdin when no file is given', async () => {
    const h = harness()
    const code = await run(['render', '--agent', 'codex'], h.deps)
    expect(code).toBe(0)
    expect(h.out.join('')).toBe('MD[codex](STDIN)')
  })

  test('supports --in like ffmpeg', async () => {
    const h = harness()
    await run(['render', '--agent', 'pi', '--in', 'bar.jsonl'], h.deps)
    expect(h.out.join('')).toBe('MD[pi](FILE:bar.jsonl)')
  })

  test('missing --agent exits non-zero with a clear message', async () => {
    const h = harness()
    const code = await run(['render', 'foo.jsonl'], h.deps)
    expect(code).not.toBe(0)
    expect(h.err.join('')).toMatch(/--agent/i)
  })

  test('unknown --agent exits non-zero and lists valid agents', async () => {
    const h = harness()
    const code = await run(['render', '--agent', 'bogus'], h.deps)
    expect(code).not.toBe(0)
    expect(h.err.join('')).toMatch(/unknown agent/i)
    expect(h.err.join('')).toMatch(/claude-code/)
  })

  test('unreadable file exits non-zero with a clear message', async () => {
    const h = harness({
      readFile: async () => {
        throw new Error('ENOENT: nope')
      },
    })
    const code = await run(['render', '--agent', 'codex', 'gone.jsonl'], h.deps)
    expect(code).not.toBe(0)
    expect(h.err.join('')).toMatch(/ENOENT|read/i)
  })
})

describe('export subcommand', () => {
  test('discovers and writes each session under --out', async () => {
    const h = harness({
      async *discover() {
        yield rendered({ agent: 'claude-code', sessionId: 'a' })
        yield rendered({ agent: 'codex', sessionId: 'b' })
      },
    })
    const code = await run(
      ['export', '--agent', 'claude-code,codex', '--out', './vault'],
      h.deps,
    )
    expect(code).toBe(0)
    expect(h.writes).toEqual([
      {
        outDir: './vault',
        agent: 'claude-code',
        root: '/root/claude-code',
        id: 'a',
      },
      { outDir: './vault', agent: 'codex', root: '/root/codex', id: 'b' },
    ])
  })

  test('forwards parsed agents and time window to discover', async () => {
    let seen: { agents?: AgentId[]; since?: Date; until?: Date } | undefined
    const h = harness({
      async *discover(opts) {
        seen = opts
        yield* []
      },
    })
    await run(
      [
        'export',
        '--agent',
        'pi',
        '--since',
        '2026-01-01',
        '--until',
        '2026-02-01',
        '--out',
        '/o',
      ],
      h.deps,
    )
    expect(seen).toMatchObject({ agents: ['pi'] })
    expect(seen?.since?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(seen?.until?.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  test('missing --out exits non-zero', async () => {
    const h = harness()
    const code = await run(['export', '--agent', 'pi'], h.deps)
    expect(code).not.toBe(0)
    expect(h.err.join('')).toMatch(/--out/i)
  })

  test('invalid --since exits non-zero with a clear message', async () => {
    const h = harness()
    const code = await run(
      ['export', '--since', 'whenever', '--out', '/o'],
      h.deps,
    )
    expect(code).not.toBe(0)
    expect(h.err.join('')).toMatch(/since/i)
  })

  test('unknown --agent in export exits non-zero', async () => {
    const h = harness()
    const code = await run(['export', '--agent', 'nope', '--out', '/o'], h.deps)
    expect(code).not.toBe(0)
    expect(h.err.join('')).toMatch(/unknown agent/i)
  })

  test('an empty --agent list exits non-zero instead of silently doing nothing', async () => {
    const h = harness({
      async *discover() {
        yield rendered({ sessionId: 'should-not-run' })
      },
    })
    const code = await run(['export', '--agent', ',', '--out', '/o'], h.deps)
    expect(code).not.toBe(0)
    expect(h.writes).toHaveLength(0)
  })
})

describe('top level', () => {
  test('no subcommand prints usage and exits non-zero', async () => {
    const h = harness()
    const code = await run([], h.deps)
    expect(code).not.toBe(0)
    expect(h.err.join('')).toMatch(/usage/i)
  })

  test('--help prints usage and exits zero', async () => {
    const h = harness()
    const code = await run(['--help'], h.deps)
    expect(code).toBe(0)
    expect(h.out.join('')).toMatch(/usage/i)
  })

  test('unknown flags exit non-zero', async () => {
    const h = harness()
    const code = await run(['render', '--bogus'], h.deps)
    expect(code).not.toBe(0)
  })
})
