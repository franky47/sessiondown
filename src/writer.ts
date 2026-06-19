import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { RenderedSession } from '#types'

/** The write-side filesystem boundary, injected so the writer is fakeable. */
export interface WriterIO {
  /** Create `dir` and any missing parents. */
  mkdir(dir: string): Promise<void>
  writeFile(filePath: string, data: string): Promise<void>
}

const defaultWriterIO: WriterIO = {
  async mkdir(dir) {
    await mkdir(dir, { recursive: true })
  },
  writeFile(filePath, data) {
    return writeFile(filePath, data, 'utf8')
  },
}

function toMarkdownName(rel: string): string {
  return rel.endsWith('.jsonl')
    ? `${rel.slice(0, -'.jsonl'.length)}.md`
    : rel.endsWith('.md')
      ? rel
      : `${rel}.md`
}

/**
 * Where a rendered session lands: `<outDir>/<agent>/<source-relative-path>.md`,
 * mirroring the agent's own on-disk layout. A `sourcePath` that isn't under
 * `root` (e.g. opencode's synthetic ids) falls back to its basename.
 */
export function outputPathFor(opts: {
  outDir: string
  agent: string
  root: string
  sourcePath: string
}): string {
  const rel = path.relative(opts.root, opts.sourcePath)
  const under =
    rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
      ? rel
      : path.basename(opts.sourcePath)
  return path.join(opts.outDir, opts.agent, toMarkdownName(under))
}

/** Write one rendered session to its mirrored path; returns that path. */
export async function writeSession(opts: {
  outDir: string
  agent: string
  root: string
  rendered: RenderedSession
  io?: WriterIO
}): Promise<string> {
  const io = opts.io ?? defaultWriterIO
  const filePath = outputPathFor({
    outDir: opts.outDir,
    agent: opts.agent,
    root: opts.root,
    sourcePath: opts.rendered.sourcePath,
  })
  await io.mkdir(path.dirname(filePath))
  await io.writeFile(filePath, opts.rendered.markdown)
  return filePath
}
