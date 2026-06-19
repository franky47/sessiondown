import { describe, expect, test } from 'bun:test'

import type { RenderedSession } from '#types'
import { outputPathFor, writeSession, type WriterIO } from '#writer'

function fakeIO(): WriterIO & {
  mkdirs: string[]
  writes: Map<string, string>
} {
  const mkdirs: string[] = []
  const writes = new Map<string, string>()
  return {
    mkdirs,
    writes,
    async mkdir(dir) {
      mkdirs.push(dir)
    },
    async writeFile(p, data) {
      writes.set(p, data)
    },
  }
}

const session = (over: Partial<RenderedSession>): RenderedSession => ({
  agent: 'claude-code',
  sourcePath: '/home/u/.claude/projects/proj-a/uuid.jsonl',
  sessionId: 'uuid',
  startedAt: '2026-06-19T00:00:00.000Z',
  mtime: 0,
  markdown: '# hi\n',
  ...over,
})

describe('outputPathFor', () => {
  test('mirrors the source path under <out>/<agent>, .jsonl → .md', () => {
    expect(
      outputPathFor({
        outDir: '/out',
        agent: 'claude-code',
        root: '/home/u/.claude/projects',
        sourcePath: '/home/u/.claude/projects/proj-a/uuid.jsonl',
      }),
    ).toBe('/out/claude-code/proj-a/uuid.md')
  })

  test('preserves nested structure', () => {
    expect(
      outputPathFor({
        outDir: '/out',
        agent: 'pi',
        root: '/home/u/.pi/agent/sessions',
        sourcePath: '/home/u/.pi/agent/sessions/--x--/2026_uuid.jsonl',
      }),
    ).toBe('/out/pi/--x--/2026_uuid.md')
  })

  test('source not under root falls back to its basename (opencode synthetic)', () => {
    expect(
      outputPathFor({
        outDir: '/out',
        agent: 'opencode',
        root: '/home/u/.local/share/opencode/opencode.db',
        sourcePath: 'ses_abc123.jsonl',
      }),
    ).toBe('/out/opencode/ses_abc123.md')
  })

  test('distinct nested sources never collide', () => {
    const a = outputPathFor({
      outDir: '/out',
      agent: 'claude-code',
      root: '/r',
      sourcePath: '/r/x/s.jsonl',
    })
    const b = outputPathFor({
      outDir: '/out',
      agent: 'claude-code',
      root: '/r',
      sourcePath: '/r/y/s.jsonl',
    })
    expect(a).not.toBe(b)
  })
})

describe('writeSession', () => {
  test('mkdir -p the dir, writes markdown, returns the path', async () => {
    const io = fakeIO()
    const out = await writeSession({
      outDir: '/out',
      agent: 'claude-code',
      root: '/home/u/.claude/projects',
      rendered: session({}),
      io,
    })
    expect(out).toBe('/out/claude-code/proj-a/uuid.md')
    expect(io.mkdirs).toContain('/out/claude-code/proj-a')
    expect(io.writes.get('/out/claude-code/proj-a/uuid.md')).toBe('# hi\n')
  })
})
