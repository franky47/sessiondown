/**
 * A tiny read-only SQLite seam that works under both runtimes the package
 * targets — Bun (dev/test, via `bun:sqlite`) and Node ≥22.5 (`npx`, via the
 * built-in `node:sqlite`). Neither module exists in the other runtime, so we
 * pick the available one at call time. opencode is the only agent that needs
 * this; tests inject a fake {@link QueryRows} instead of opening a real DB.
 */
type SqlRow = Record<string, unknown>

export type QueryRows = (dbPath: string, sql: string) => Promise<SqlRow[]>

let cached: QueryRows | null = null

async function resolveDriver(): Promise<QueryRows> {
  try {
    const { Database } = await import('bun:sqlite')
    return async (dbPath, sql) => {
      const db = new Database(dbPath, { readonly: true })
      try {
        return db.query<SqlRow, []>(sql).all()
      } finally {
        db.close()
      }
    }
  } catch {
    const { DatabaseSync } = await import('node:sqlite')
    return async (dbPath, sql) => {
      const db = new DatabaseSync(dbPath, { readOnly: true })
      try {
        return db.prepare(sql).all() as SqlRow[]
      } finally {
        db.close()
      }
    }
  }
}

/** Run `sql` against the read-only DB at `dbPath`, returning row objects. */
export const queryRows: QueryRows = async (dbPath, sql) => {
  cached ??= await resolveDriver()
  return cached(dbPath, sql)
}
