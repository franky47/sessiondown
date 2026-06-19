# Ubiquitous Language — sessiondown

> A DDD-style glossary of the domain `sessiondown` operates in.
> Derived from the genesis PRD and its siblings (API design, ideas, prior art) and the project's public surface only.
> Scope: **sessions in, Markdown out.** Terms describe _what each concept is and its role in the domain_, never how it is built.
> Grouped by theme. Each entry has a tight definition; `Related:` and `Note:` lines appear where useful.

---

## 1. Agents & where their sessions live

| Term                | Definition                                                                                                                                                                                | Aliases to avoid                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Coding Agent**    | An AI coding tool (e.g. Claude Code, Codex, pi, opencode) that runs on a developer's machine and persists each working session to local disk in its own private, machine-oriented format. | "the model", "assistant", "bot"     |
| **Supported Agent** | A Coding Agent that sessiondown knows how to locate and render. The v1 set is exactly four first-class peers: Claude Code, Codex, pi, opencode.                                           | "integration", "plugin"             |
| **Agent Id**        | The short, stable, lowercase identifier for a Supported Agent: `claude-code`, `codex`, `pi`, `opencode`. The unit of selection everywhere a caller names an agent.                        | "agent name", "slug", "type"        |
| **Agent Registry**  | The single catalogue of every Supported Agent — the one place an agent is registered so it becomes discoverable and renderable. Adding a fifth agent means adding one entry here.         | "plugin list", "config", "manifest" |
| **Source**          | The per-agent capability that knows an agent's default on-disk store and how to enumerate the individual sessions inside it. One Source per Supported Agent.                              | "loader", "ingest", "scanner"       |
| **Session Store**   | A Coding Agent's local, on-disk collection of its own sessions, in that agent's native layout and format. sessiondown reads these; it never writes to them.                               | "history", "database", "cache"      |
| **Default Root**    | The conventional top-level location where a given agent keeps its Session Store, known to that agent's Source. A caller may override the roots that are searched.                         | "base dir", "home", "path"          |

`Note (claude-code vs Claude Code):` `claude-code` is the **Agent Id** (a machine token); "Claude Code" is the **product**. They are deliberately distinct spellings — always use the hyphenated lowercase id when selecting or routing, and the proper name only in prose.

`Note (Source vs Session Store vs Default Root):` the **Session Store** is the data on disk; the **Default Root** is where that store conventionally lives; the **Source** is the agent-specific knowledge that walks the store at its root and produces sessions. Keep the three distinct.

---

## 2. Sessions & units

| Term                 | Definition                                                                                                                                                                                                                                                              | Aliases to avoid                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Session**          | One recorded working interaction between a developer and a Coding Agent — the exact source noun the whole project is named for. The thing that goes _in_; Markdown comes _out_.                                                                                         | "conversation", "chat", "log", "transcript", "thread" |
| **Session Unit**     | A single discoverable session as enumerated by a Source, before rendering — carrying its raw contents plus the minimal facts needed to render and route it (its location, its own id, when it started, and its modification time).                                      | "record", "entry", "file"                             |
| **Session Contents** | The raw, native bytes/text of one session as the agent stored it — the input to Rendering.                                                                                                                                                                              | "payload", "data", "raw log"                          |
| **Projection**       | The extra step some agents need because their Session Store does not hold one-session-per-file; their Source must reconstruct or split discrete sessions out of a more tangled storage shape before they can be treated as Session Units. (opencode is the v1 example.) | "split", "parse", "decode"                            |

`Note (Session vs Session Unit vs Rendered Session):` a **Session** is the abstract interaction; a **Session Unit** is one concrete session a Source found and is about to render; a **Rendered Session** (§4) is the finished envelope after rendering. Same lineage, three stages.

`Note (Session-Intrinsic Data):` everything sessiondown emits is _intrinsic to the session itself_ — its ids, timestamps, model, cost, git context, turns. It deliberately carries **no** host/machine/date-bucket context, so output is portable and consumer-neutral. This is a defining boundary of the domain.

---

## 3. Rendering & the output

| Term                                    | Definition                                                                                                                                                                                                                                                            | Aliases to avoid                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Rendering**                           | The pure act of turning one Session's raw contents — given an explicitly stated agent — into clean, portable Markdown. No file access, no guessing of which agent produced the input.                                                                                 | "converting", "parsing", "dumping", "transforming" |
| **Render** _(verb / library operation)_ | The single-session form of Rendering exposed to callers: hand it session contents plus the agent identity, get back the Rendered Markdown. Also the name of the matching CLI verb.                                                                                    | "format", "stringify"                              |
| **Normalization**                       | The intermediate step inside Rendering that brings a given agent's bespoke session shape onto a common internal shape so it can be rendered uniformly. A domain step, not part of the public output.                                                                  | "cleanup", "canonicalize"                          |
| **Rendered Markdown**                   | The Markdown produced for one session: a **Frontmatter** block followed by a **Body**. The sole output format of the project.                                                                                                                                         | "the file", "the doc", "output"                    |
| **Frontmatter**                         | The structured metadata block at the top of the Rendered Markdown. The home for _richer per-agent detail_ (model, cost, git, tokens, project, title, …) that the typed public surface deliberately does not enumerate — consumers parse out what they need from here. | "header", "meta", "yaml"                           |
| **Body**                                | The human-readable transcript of the session below the Frontmatter — turns, reasoning, and tool activity rendered for reading, searching, diffing, and archiving.                                                                                                     | "content", "text", "log"                           |

`Note (per-agent Frontmatter is intentionally bespoke):` each agent's Frontmatter exposes whatever is natural for that agent — there is no forced shared schema. Frontmatter is _the_ escape valve that keeps the typed public envelope small while still surfacing rich detail.

`Note (Render is both verb and CLI command):` "render" names the library operation **and** the CLI subcommand, and they map one-to-one — low ambiguity by design. Contrast with **Export** vs **Discovery** below, which do _not_ share a name even though they are related.

---

## 4. The Rendered Session envelope

| Term                 | Definition                                                                                                                                                                                         | Aliases to avoid                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Rendered Session** | The minimal common **envelope** produced for every session across every agent during Discovery. It is the _only_ typed metadata in the public surface; everything richer lives in the Frontmatter. | "result", "item", "record", "output object" |
| **`agent`**          | The Agent Id identifying which Coding Agent produced this session. Lets a consumer route or group across agents.                                                                                   | "type", "kind"                              |
| **`sourcePath`**     | The absolute location (or a stable synthetic id) of the on-disk Session Unit this was rendered from — the anchor back to where it came from.                                                       | "file", "url", "id"                         |
| **`sessionId`**      | The session's own native identifier (a uuid, a rollout id, …), as the agent assigned it.                                                                                                           | "id" (bare), "key"                          |
| **`startedAt`**      | An ISO-8601 timestamp of when the session began — a _content_ timestamp intrinsic to the session.                                                                                                  | "date", "timestamp", "created"              |
| **`mtime`**          | The session's file modification time, in epoch milliseconds — the value the **Time Window** filters on. A _filesystem_ timestamp, distinct from `startedAt`.                                       | "modified", "updated", "date"               |
| **`markdown`**       | The full Rendered Markdown (Frontmatter + Body) for this session, carried inline in the envelope.                                                                                                  | "content", "text", "output"                 |

`Note (mtime vs startedAt):` two different clocks. **`startedAt`** is _when the work happened_ (read from session content); **`mtime`** is _when the file was last touched_ (read from the filesystem). Time filtering uses `mtime` for speed and predictability; `startedAt` is informational. Do not conflate them.

`Note (envelope vs Frontmatter):` the **Rendered Session** envelope is the small, typed, cross-agent contract; the **Frontmatter** is the open, per-agent detail. A consumer routes on the envelope and reaches into Frontmatter only when it needs more.

---

## 5. Discovery, Export, and the two faces

| Term                             | Definition                                                                                                                                                                                                                                         | Aliases to avoid                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Discovery**                    | The engine that walks the local Session Stores of the selected agents, renders each session it finds, and streams out one **Rendered Session** per session. The library's "find everything and render it" layer. It _yields_; it does not write.   | "crawl", "scan", "sync", "ingest"    |
| **Export**                       | The CLI action that runs Discovery and then _writes_ every Rendered Session to disk as a browsable Markdown tree. Export = Discovery **plus** persistence.                                                                                         | "dump", "backup", "save", "discover" |
| **Mirrored Output Layout**       | The shape Export writes into: results are grouped per agent and reproduce each agent's own source structure beneath the chosen output directory — making the archive predictable, collision-free, and traceable back to its origin.                | "flat dump", "folder", "tree"        |
| **Library vs CLI duality**       | sessiondown is _both_ an embeddable library (the **Render** and **Discovery** layers, runtime-agnostic) and a `sessiondown` command-line tool (the **render** and **export** verbs). The two CLI verbs map one-to-one onto the two library layers. | "API vs binary", "SDK"               |
| **Render command (as a filter)** | The CLI `render` verb behaves as a Unix filter: it takes one session (a named file, an explicit-path escape hatch, or standard input) and writes that one session's Markdown to standard output — never to a chosen file.                          | "single export"                      |

`Note (Export the verb vs Discovery the engine):` they are deliberately _different words_. **Discovery** is the reusable engine that only produces results; **Export** is the user-facing verb that consumes Discovery and owns all file writing. "Library yields, CLI writes" — all IO sits at the edges. Avoid using "discover" to mean "export" or vice-versa.

---

## 6. Selection & filtering

| Term                | Definition                                                                                                                                                                                                                                                                      | Aliases to avoid                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Agent Selection** | Explicitly naming which agents to act on, by Agent Id. On **Render** it removes all ambiguity about how to interpret the input (there is no content-sniffing in v1); on **Export/Discovery** it narrows the set of stores walked. Absent on Discovery, all agents are included. | "agent filter", "target"           |
| **Time Window**     | An optional, `mtime`-based span (a _since_ bound and/or an _until_ bound) restricting Discovery/Export to sessions touched within it. With neither bound, everything is included.                                                                                               | "date filter", "range", "backfill" |
| **In-Range**        | The predicate that decides whether a session's `mtime` falls inside the Time Window. An absent window means everything is In-Range.                                                                                                                                             | "match", "filter"                  |

`Note (explicit --agent, no sniffing):` v1 never guesses an agent from content. The agent is _always_ stated. This is a firm domain rule, chosen so the correct renderer is applied with zero ambiguity; content-sniffing is a clean later addition, not present today.

---

## 7. Naming & principle terms

| Term                      | Definition                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **sessiondown**           | The project name. "session" because that is the _exact_ source noun; the `-down` ending reads as "converts to Markdown" (lineage of `turndown`, HTML→Markdown). Chosen over `sessionmd` and `transcriptdown`.                                                                                       |
| **Additive-upgrade rule** | A domain design principle: every v1 limitation (explicit-agent-only, envelope-only typed metadata, sessions-only, hardcoded roots) was chosen so the eventual feature layers on _without_ breaking the v1 surface.                                                                                  |
| **Consumer / Downstream** | A program that builds on sessiondown's library — calling **Render** on bytes it fetched itself, or running **Discovery** and re-routing the results into its own layout. The project stays narrow precisely so consumers can own the layered concerns (e.g. remote transport, storage conventions). |

---

## Relationships

- A **Supported Agent** is identified by exactly one **Agent Id** and registered in the **Agent Registry**.
- An **Agent Registry** entry pairs an agent with its **Source** (how to find its sessions) and its Rendering (how to turn them into Markdown).
- A **Source** reads one **Session Store** at its **Default Root** and enumerates **Session Units** (for some agents, via a **Projection** first).
- **Rendering** turns one **Session**'s contents into **Rendered Markdown** = **Frontmatter** + **Body**.
- **Discovery** produces a stream of **Rendered Session** envelopes; each envelope carries one **Rendered Markdown** plus the cross-agent fields.
- **Export** = **Discovery** + writing each **Rendered Session** into the **Mirrored Output Layout**.
- The **Time Window** filters **Discovery** on each session's **`mtime`** (not its **`startedAt`**).
- The CLI **render** verb maps to the library **Render**; the CLI **export** verb maps to **Discovery** + persistence.

---

## Example dialogue

> **Dev:** When we _export_, are we re-rendering everything ourselves, or just reading what the agents already wrote?
> **Domain expert:** We re-render. Each **Supported Agent** keeps its own **Session Store** in a private format; **Export** runs **Discovery**, which walks those stores and turns every **Session** into **Rendered Markdown**.
> **Dev:** And the metadata — model, cost, git — comes back on the **Rendered Session**?
> **Domain expert:** No. The envelope is intentionally tiny: `agent`, `sourcePath`, `sessionId`, `startedAt`, `mtime`, `markdown`. Anything richer lives in the **Frontmatter** of that Markdown. Reach in there for cost or git.
> **Dev:** When I pass `--since`, is that filtering on when the session _happened_?
> **Domain expert:** It filters on **`mtime`** — file modification time — not **`startedAt`**. Fast and predictable. `startedAt` is just along for the ride.
> **Dev:** For one-off `render`, how does it know it's a Codex session?
> **Domain expert:** It doesn't guess. You state it: `--agent codex`. No sniffing in v1 — the **Agent Id** is always explicit, so the right renderer is applied with zero ambiguity.

---

## Flagged ambiguities (please confirm / resolve)

1. **`claude-code` (Agent Id) vs "Claude Code" (the product).** Distinct on purpose. Recommendation: reserve the hyphenated lowercase id for selection/routing/output, the proper name for prose. Same pattern for `codex`/Codex, `pi`/pi, `opencode`/opencode.

2. **"Source" is overloaded.** It names both the **`sourcePath`** field (where a session came from) _and_ the per-agent **Source** (the thing that finds sessions). Recommendation: keep **Source** for the discovery capability; always say **`sourcePath`** (never bare "source") for the envelope field.

3. **"Export" vs "Discovery" vs "Render".** **Render** is shared by a library layer and a CLI verb (fine, 1:1). But **Discovery** (engine, yields) and **Export** (CLI verb, writes) deliberately do _not_ share a name despite being related. Recommendation: never use "discover" to mean "export." Confirm this naming holds in docs/help text.

4. **`mtime` vs `startedAt`.** Two clocks; only `mtime` drives the **Time Window**. Recommendation: state explicitly in user-facing help that `--since/--until` are modification-time based, to avoid users expecting content-time filtering. (PRD notes content-timestamp filtering is a deferred opt-in.)

5. **CLI flag spelling diverges between the design-locked PRD and the sibling docs.** The genesis PRD (design-locked) uses `--agent`, `--since`/`--until`, `--out`, and a positional file argument. The "API design" sibling uses `--agents` (plural), `--from`/`--to`, `--out-dir`, and `--in`. These are inconsistent. Recommendation: treat the **PRD spellings as canonical** (`--agent`, `--since`, `--until`, `--out`) and update or retire the sibling doc — please confirm.

6. **Speculative surface in the sibling docs is not part of the v1 domain.** The "API design" and "ideas" notes mention extra agents (hermes, antigravity, copilot-cli, grok-build, openclaw), `--tool-calls none|summary|all`, `--memories`, `--index`, and `sessiondown ui` / `sessiondown mcp` subcommands. None are in the v1 locked surface. Recommendation: keep these out of the ubiquitous language until promoted; flag here only so they aren't mistaken for current terms.

7. **"Session Unit" vs "Session" naming.** The PRD uses "session" for the abstract thing and occasionally "unit"/"candidate file" for the concrete enumerated item. Recommendation: adopt **Session Unit** as the canonical term for "one concrete discoverable session pre-render," reserving **Session** for the concept and **Rendered Session** for the post-render envelope. Confirm you want this three-stage vocabulary.
