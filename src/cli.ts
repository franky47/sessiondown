import { parseArgs } from 'node:util'

import {
  AGENT_IDS,
  type AgentId,
  isAgentId,
  type RenderedSession,
} from '#types'
import { parseWindow } from '#window'

/**
 * Everything the CLI touches the outside world through, injected so the command
 * logic is testable without real stdin/stdout, filesystem, or discovery.
 */
export interface CliDeps {
  readStdin: () => Promise<string>
  readFile: (path: string) => Promise<string>
  stdout: (s: string) => void
  stderr: (s: string) => void
  render: (contents: string, agent: AgentId) => string
  discover: (opts: {
    agents?: AgentId[]
    since?: Date
    until?: Date
  }) => AsyncIterable<RenderedSession>
  writeSession: (opts: {
    outDir: string
    agent: AgentId
    root: string
    rendered: RenderedSession
  }) => Promise<string>
  rootFor: (agent: AgentId) => string
}

const USAGE = `sessiondown — coding-agent sessions in, Markdown out.

Usage:
  sessiondown render --agent <id> [file]      Render one session to stdout (reads stdin if no file)
  sessiondown export [options] --out <dir>    Discover local sessions and write a mirrored Markdown tree

Options:
  --agent <id[,id...]>   Agent(s): ${AGENT_IDS.join(', ')}
  --in <file>            Input file for render (alternative to a positional path)
  --out <dir>            Output directory for export
  --since <date>         Only export sessions modified at/after this date
  --until <date>         Only export sessions modified before this date
  -h, --help             Show this help
`

const OPTIONS = {
  agent: { type: 'string' },
  in: { type: 'string' },
  out: { type: 'string' },
  since: { type: 'string' },
  until: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const

function parseAgentList(raw: string): AgentId[] {
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const unknown = ids.filter((id) => !isAgentId(id))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown agent: ${unknown.join(', ')}. Valid agents: ${AGENT_IDS.join(', ')}`,
    )
  }
  return ids.filter(isAgentId)
}

async function runRender(
  values: { agent?: string; in?: string },
  positionals: string[],
  deps: CliDeps,
): Promise<number> {
  if (values.agent === undefined) {
    deps.stderr('error: render requires --agent <id>\n')
    return 1
  }
  const agents = parseAgentList(values.agent)
  if (agents.length !== 1) {
    deps.stderr('error: render takes exactly one --agent\n')
    return 1
  }
  const agent = agents[0]
  if (agent === undefined) {
    deps.stderr('error: render requires --agent <id>\n')
    return 1
  }
  const file = values.in ?? positionals[0]
  const contents =
    file === undefined ? await deps.readStdin() : await deps.readFile(file)
  deps.stdout(deps.render(contents, agent))
  return 0
}

async function runExport(
  values: { agent?: string; out?: string; since?: string; until?: string },
  deps: CliDeps,
): Promise<number> {
  if (values.out === undefined) {
    deps.stderr('error: export requires --out <dir>\n')
    return 1
  }
  let agents: AgentId[] | undefined
  if (values.agent !== undefined) {
    agents = parseAgentList(values.agent)
    if (agents.length === 0) {
      deps.stderr('error: --agent was given but empty\n')
      return 1
    }
  }
  const window = parseWindow({ since: values.since, until: values.until })

  let count = 0
  for await (const rendered of deps.discover({
    agents,
    since: window.since,
    until: window.until,
  })) {
    await deps.writeSession({
      outDir: values.out,
      agent: rendered.agent,
      root: deps.rootFor(rendered.agent),
      rendered,
    })
    count += 1
  }
  deps.stderr(
    `wrote ${count} session${count === 1 ? '' : 's'} to ${values.out}\n`,
  )
  return 0
}

/** Parse `argv` (without node/script), dispatch a subcommand, return exit code. */
export async function run(argv: string[], deps: CliDeps): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      options: OPTIONS,
      allowPositionals: true,
      strict: true,
    })
  } catch (error) {
    deps.stderr(
      `error: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    return 1
  }

  const { values, positionals } = parsed
  if (values.help === true) {
    deps.stdout(USAGE)
    return 0
  }

  const command = positionals[0]
  try {
    switch (command) {
      case 'render':
        return await runRender(values, positionals.slice(1), deps)
      case 'export':
        return await runExport(values, deps)
      default:
        deps.stderr(`${USAGE}\n`)
        deps.stderr(
          command === undefined
            ? 'error: no subcommand given\n'
            : `error: unknown subcommand: ${command}\n`,
        )
        return 1
    }
  } catch (error) {
    deps.stderr(
      `error: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    return 1
  }
}
