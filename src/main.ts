#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { text } from 'node:stream/consumers'

import { type CliDeps, run } from '#cli'
import { discover } from '#index'
import { rootFor } from '#registry'
import { render } from '#render'
import { writeSession } from '#writer'

const deps: CliDeps = {
  readStdin: () => text(process.stdin),
  readFile: (path) => readFile(path, 'utf8'),
  stdout: (s) => void process.stdout.write(s),
  stderr: (s) => void process.stderr.write(s),
  render,
  discover,
  writeSession: (opts) => writeSession(opts),
  rootFor,
}

// Set exitCode rather than calling process.exit(), which on Node can truncate a
// still-draining piped stdout (e.g. `sessiondown render … | less`). The process
// exits naturally once the event loop empties and stdout has flushed.
process.exitCode = await run(process.argv.slice(2), deps)
