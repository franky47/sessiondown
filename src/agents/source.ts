import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { glob as tinyGlob } from 'tinyglobby'

/**
 * One discovered session, ready to be rendered. The discovery engine renders
 * `contents` and merges these fields into the public {@link RenderedSession}.
 */
export interface SessionUnit {
  /** Absolute path (or stable synthetic id) of the on-disk session unit. */
  sourcePath: string
  /** The session's own identifier (uuid, rollout id, …). */
  sessionId: string
  /** ISO-8601 timestamp of when the session started. */
  startedAt: string
  /** Modification time, epoch milliseconds — what the time window filters on. */
  mtime: number
  /** Raw session text to feed the agent's renderer. */
  contents: string
}

/** mtime gate: return true to keep a candidate. Default keeps everything. */
type AcceptMtime = (mtimeMs: number) => boolean

/**
 * The filesystem/glob boundary, injected so discovery can be tested against a
 * synthetic tree without touching real `~/.claude`, `~/.codex`, etc.
 */
export interface FileIO {
  /** Files (relative to `cwd`) matching `pattern`; empty when `cwd` is absent. */
  glob(pattern: string, cwd: string): Promise<string[]>
  readFile(absPath: string): Promise<string>
  statMtimeMs(absPath: string): Promise<number>
}

export interface EnumerateOpts {
  /** Override the agent's hardcoded default roots. */
  roots?: string[]
  /** mtime gate applied stat-only, before any file is read. */
  accept?: AcceptMtime
  /** Inject a fake filesystem seam (tests). */
  io?: FileIO
}

/** A per-agent discovery module: knows its roots and how to enumerate units. */
export interface AgentSource {
  readonly defaultRoots: string[]
  enumerate(opts?: EnumerateOpts): AsyncIterable<SessionUnit>
}

const defaultFileIO: FileIO = {
  async glob(pattern, cwd) {
    if (!existsSync(cwd)) return []
    return tinyGlob(pattern, {
      cwd,
      onlyFiles: true,
      absolute: false,
      dot: false,
    })
  },
  readFile(absPath) {
    return readFile(absPath, 'utf8')
  },
  async statMtimeMs(absPath) {
    return (await stat(absPath)).mtimeMs
  },
}

const acceptAll: AcceptMtime = () => true

/**
 * Shared engine for the file-glob agents (claude-code, codex, pi). Walks each
 * root, stat-gates on mtime (no read for excluded files), reads the survivors,
 * and lets the agent derive its identity. opencode does not use this — its
 * source wraps a SQLite projection instead.
 */
export function globSource(config: {
  defaultRoots: string[]
  pattern: string
  /** Sub-directory under each root holding sessions (''/undefined = the root). */
  subdir?: string
  /** Drop a relative path before stat/read (e.g. claude's `subagents/`). */
  skip?: (rel: string) => boolean
  /** Derive identity for a kept unit; `contents` is already read. */
  identify: (args: {
    rel: string
    absPath: string
    contents: string
    mtime: number
  }) => { sessionId: string; startedAt: string }
}): AgentSource {
  return {
    defaultRoots: config.defaultRoots,
    async *enumerate(opts: EnumerateOpts = {}): AsyncIterable<SessionUnit> {
      const io = opts.io ?? defaultFileIO
      const accept = opts.accept ?? acceptAll
      const roots = opts.roots ?? config.defaultRoots
      for (const root of roots) {
        const cwd =
          config.subdir === undefined ? root : path.join(root, config.subdir)
        const rels = await io.glob(config.pattern, cwd)
        for (const rel of rels) {
          if (config.skip?.(rel) === true) continue
          const absPath = path.join(cwd, rel)
          const mtime = await io.statMtimeMs(absPath)
          if (!accept(mtime)) continue
          const contents = await io.readFile(absPath)
          const { sessionId, startedAt } = config.identify({
            rel,
            absPath,
            contents,
            mtime,
          })
          yield { sourcePath: absPath, sessionId, startedAt, mtime, contents }
        }
      }
    },
  }
}
