# sessiondown

> Coding-agent sessions in, Markdown out.

Coding agents persist your sessions to disk in private, machine-oriented
formats. `sessiondown` knows where each agent stores its sessions and how to
turn any of them into clean, portable Markdown — as a **library** you can embed
or a **CLI** you can pipe.

Supported agents: **Claude Code**, **Codex**, **pi**, **opencode**.

## Install

```shell
npx sessiondown --help
# or add it to a project
bun add sessiondown   # / pnpm add / npm i
```

Runs under Node (≥22.5, for opencode's built-in SQLite) or Bun. No `Bun.*` APIs
in the shipped code.

## CLI

### Render one session to stdout

`render` is a unix filter. Pass a file, or pipe on stdin. `--agent` is required
(no format sniffing — it's always explicit).

```shell
# from a file
sessiondown render --agent claude-code ~/.claude/projects/<proj>/<id>.jsonl > session.md

# from stdin
cat session.jsonl | sessiondown render --agent codex > session.md

# ffmpeg-style --in also works
sessiondown render --agent pi --in session.jsonl
```

### Export everything to a mirrored Markdown tree

`export` discovers all local sessions for the selected agents and writes them
under `<out>/<agent>/…`, mirroring each agent's own directory layout.

```shell
# everything, all agents
sessiondown export --out ./vault

# just two agents, within a time window (file mtime based)
sessiondown export --agent claude-code,codex --since 2026-01-01 --until 2026-02-01 --out ./vault
```

With neither `--since` nor `--until`, you get everything.

## Library

Two layers, mirroring the two CLI verbs.

```ts
import { render, discover, type RenderedSession } from 'sessiondown'

// Layer 1 — pure: string in, Markdown out. No filesystem access.
const markdown = render(jsonlContents, 'codex')

// Layer 2 — discovery: stream rendered sessions from your local stores.
for await (const session of discover({
  agents: ['claude-code'],
  since: new Date('2026-01-01'),
})) {
  // route / persist / index however you like
  console.log(session.agent, session.sessionId, session.startedAt)
}
```

Each discovered item carries a minimal common envelope; richer per-agent detail
(model, cost, git, tokens, …) lives in the rendered Markdown's YAML frontmatter.

```ts
interface RenderedSession {
  agent: 'claude-code' | 'codex' | 'pi' | 'opencode'
  sourcePath: string // where the session came from
  sessionId: string
  startedAt: string // ISO-8601
  mtime: number // epoch ms — what the time window filters on
  markdown: string
}
```

## Default session stores

| Agent         | Default location                      |
| ------------- | ------------------------------------- |
| `claude-code` | `~/.claude/projects`                  |
| `codex`       | `~/.codex/sessions`                   |
| `pi`          | `~/.pi/agent/sessions`                |
| `opencode`    | `~/.local/share/opencode/opencode.db` |

For sessions stored elsewhere, render individual files by explicit path —
`sessiondown render --agent <id> <path>` — or pass `roots` to `discover`.

## Development

```shell
bun install
bun test          # bun:test, co-located *.test.ts
bun run check     # fmt + lint + typecheck + test + knip
bun run build     # Node-compatible bundle → dist/main.js
```

## Scope (v1)

Sessions in, Markdown out — deliberately narrow. Out of scope for now:
memories/sidecar artifacts, remote/SSH discovery, content-sniff agent detection,
a config file, and structured per-agent metadata in the typed API. Each was
chosen to be a clean additive upgrade later, not a rewrite.
