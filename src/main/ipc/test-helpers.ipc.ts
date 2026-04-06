/**
 * Test-only IPC handlers, registered ONLY when CRUCHOT_TEST_MODE=1.
 *
 * SECURITY MODEL — read carefully before adding any handler.
 *
 * 1. This module is dynamic-imported from index.ts behind a TEST_MODE gate.
 *    In production builds, the import is never executed → tree-shaking
 *    keeps the file out of the bundle (verified by audit-bundle.js).
 *
 * 2. Every handler MUST call `assertTestMode()` as its FIRST line, as a
 *    defense-in-depth guard against accidental execution if the dynamic
 *    import gate is ever bypassed.
 *
 * 3. The single Phase 2a handler — `test:db-select` — implements a strict
 *    7-stage validation pipeline:
 *      a. assertTestMode()
 *      b. typeof sql === 'string'
 *      c. sql.length < MAX_SQL_LENGTH
 *      d. !FORBIDDEN_TOKENS.test(sql)
 *      e. SAFE_SELECT_RE matches and extracts table name
 *      f. table is in READABLE_TABLES whitelist
 *      g. db.prepare(sql).all() (better-sqlite3)
 *
 * 4. READABLE_TABLES is intentionally minimal. Tables that contain secrets,
 *    security rules, or large volumes are EXCLUDED. Adding a table requires
 *    a security review documented in the spec/plan that motivates it.
 *
 * Phase 2b will add `test:seed-messages`, `test:trigger-compact`, and
 * `test:get-system-prompt` — each in the commit of the spec that needs it.
 */
import { ipcMain } from 'electron'
import { assertTestMode } from '../test-mode'
import { getSqliteDatabase } from '../db'

/**
 * Whitelist of tables readable via test:db-select.
 *
 * NEVER add: permission_rules (security), allowed_apps (security),
 * mcp_servers (encrypted env vars), scheduled_tasks (private prompts),
 * library_chunks (large volume / DoS), arena_matches (not used by flows).
 */
const READABLE_TABLES = new Set([
  'conversations',
  'messages',
  'llm_costs',
  'memory_fragments',
  'episodes',
])

const MAX_SQL_LENGTH = 1000

// Semicolons, PRAGMA/ATTACH/DDL/DML, and SQL comment sequences are all
// forbidden. The flag `i` makes it case-insensitive.
const FORBIDDEN_TOKENS = /;|PRAGMA|ATTACH|INSERT|UPDATE|DELETE|DROP|CREATE|--|\/\*/i

// Matches `SELECT <columns> FROM <table>` (with optional spaces, allows
// COUNT(*), columns lists, etc.). Captures the table name in group 1.
const SAFE_SELECT_RE = /^SELECT\s+[\w\s,*().]+\s+FROM\s+(\w+)\b/i

export function registerTestHelpers(): void {
  ipcMain.handle('test:db-select', async (_event, sql: unknown) => {
    // Stage a: defense-in-depth guard — throws if TEST_MODE is not set
    assertTestMode()

    // Stage b: type check
    if (typeof sql !== 'string') {
      throw new Error('[test:db-select] sql must be a string')
    }
    // Stage c: length check
    if (sql.length === 0 || sql.length > MAX_SQL_LENGTH) {
      throw new Error(`[test:db-select] sql length must be 1..${MAX_SQL_LENGTH}`)
    }
    // Stage d: forbidden token check
    if (FORBIDDEN_TOKENS.test(sql)) {
      throw new Error('[test:db-select] sql contains a forbidden token')
    }
    // Stage e: regex match — must be a SELECT-only query with FROM clause
    const m = SAFE_SELECT_RE.exec(sql)
    if (!m) {
      throw new Error('[test:db-select] sql must be a SELECT-only query matching SELECT <cols> FROM <table>')
    }
    // Stage f: whitelist check
    const table = m[1].toLowerCase()
    if (!READABLE_TABLES.has(table)) {
      throw new Error(`[test:db-select] table "${table}" is not in the READABLE_TABLES whitelist`)
    }

    // Stage g: execute the prepared statement (raw better-sqlite3 for ad-hoc SQL)
    const sqlite = getSqliteDatabase()
    return sqlite.prepare(sql).all()
  })
}
