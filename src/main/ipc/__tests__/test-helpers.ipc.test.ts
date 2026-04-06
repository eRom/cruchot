import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// We must set TEST_MODE BEFORE importing the module under test, so that
// assertTestMode() inside the handler doesn't throw on every call.
process.env.CRUCHOT_TEST_MODE = '1'

// Mock electron — in the vitest Node environment, requiring 'electron' returns
// a path string (not the real APIs). We provide a minimal ipcMain implementation
// that stores handlers in a Map, mirroring Electron's real _invokeHandlers map.
const _invokeHandlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) => {
      _invokeHandlers.set(channel, handler)
    },
    removeHandler: (channel: string) => {
      _invokeHandlers.delete(channel)
    },
    _invokeHandlers,
  },
}))

// Mock the database module — test-helpers.ipc.ts pulls db from '../../db'.
// We use a plain JS object that mimics the better-sqlite3 interface:
//   db.prepare(sql).all() → rows
// This avoids loading the native better-sqlite3.node addon (compiled for
// Electron's Node ABI, not the vitest/Node ABI).
const fakeConversations = [
  { id: 'c1', title: 'first', created_at: 1000 },
  { id: 'c2', title: 'second', created_at: 2000 },
]

function makeFakeDb() {
  return {
    prepare: (sql: string) => ({
      all: () => {
        // Minimal SQL interpreter for the two queries used in tests:
        //   SELECT id, title FROM conversations
        //   SELECT COUNT(*) AS n FROM conversations
        const upper = sql.toUpperCase().trim()
        if (upper.includes('COUNT(*)')) {
          return [{ n: fakeConversations.length }]
        }
        // Column projection: `SELECT id, title FROM conversations`
        const colMatch = /^SELECT\s+([\w\s,]+)\s+FROM\s+conversations/i.exec(sql)
        if (colMatch) {
          const cols = colMatch[1].split(',').map((c) => c.trim())
          return fakeConversations.map((row) => {
            const projected: Record<string, unknown> = {}
            for (const col of cols) {
              projected[col] = (row as Record<string, unknown>)[col]
            }
            return projected
          })
        }
        return fakeConversations
      },
    }),
  }
}

vi.mock('../../db', () => ({
  getSqliteDatabase: () => makeFakeDb(),
}))

// Now import the module under test (after mocks are set up)
const { registerTestHelpers } = await import('../test-helpers.ipc')

describe('test-helpers.ipc — test:db-select pipeline', () => {
  let handler: ((event: unknown, sql: unknown) => Promise<unknown>) | undefined

  beforeAll(() => {
    // Register the IPC handler and capture it from the mock's internal map
    registerTestHelpers()
    handler = _invokeHandlers.get('test:db-select') as typeof handler
  })

  afterAll(() => {
    _invokeHandlers.delete('test:db-select')
    delete process.env.CRUCHOT_TEST_MODE
  })

  it('handler is registered', () => {
    expect(handler).toBeDefined()
  })

  it('rejects non-string sql', async () => {
    await expect(handler!(null, 42)).rejects.toThrow(/string/)
  })

  it('rejects sql longer than 1000 chars', async () => {
    const long = 'SELECT * FROM conversations WHERE title = "' + 'a'.repeat(1000) + '"'
    await expect(handler!(null, long)).rejects.toThrow(/length/)
  })

  it('accepts sql exactly at the 1000-char boundary (passes length check)', async () => {
    // Build a query that has exactly 1000 chars and is structurally valid.
    // We pad the WHERE clause with a long but legal LIKE pattern.
    // We assert that the length stage does NOT reject — but the query itself
    // may still fail on whitelist or downstream stages depending on padding.
    // Goal: pin the contract that 1000 chars is valid, 1001 is not.
    const base = 'SELECT id FROM conversations WHERE id LIKE "'
    const closing = '"'
    const padLen = 1000 - base.length - closing.length
    const sql = base + 'a'.repeat(padLen) + closing
    expect(sql.length).toBe(1000)
    // Should NOT throw for length reasons. The query reaches the fake DB,
    // which returns the conversations array (no rows match the LIKE in real
    // SQL, but the fake doesn't filter — we only care about no throw here).
    await expect(handler!(null, sql)).resolves.toBeDefined()
  })

  it('rejects sql containing forbidden token: semicolon', async () => {
    await expect(handler!(null, 'SELECT * FROM conversations; DROP TABLE foo')).rejects.toThrow(/forbidden/)
  })

  it('rejects sql containing forbidden token: PRAGMA', async () => {
    await expect(handler!(null, 'SELECT * FROM PRAGMA foo')).rejects.toThrow(/forbidden/)
  })

  it('rejects sql containing forbidden token: comment', async () => {
    await expect(handler!(null, 'SELECT * FROM conversations -- comment')).rejects.toThrow(/forbidden/)
  })

  it('rejects sql that does not match SAFE_SELECT_RE (no FROM clause)', async () => {
    await expect(handler!(null, 'SELECT 1')).rejects.toThrow(/SELECT-only/)
  })

  it('rejects sql targeting a non-whitelisted table', async () => {
    await expect(handler!(null, 'SELECT * FROM permission_rules')).rejects.toThrow(/whitelist/)
  })

  it('returns rows for a valid SELECT on a whitelisted table', async () => {
    const rows = await handler!(null, 'SELECT id, title FROM conversations')
    expect(rows).toEqual([
      { id: 'c1', title: 'first' },
      { id: 'c2', title: 'second' },
    ])
  })

  it('returns rows for a valid COUNT query on a whitelisted table', async () => {
    const rows = await handler!(null, 'SELECT COUNT(*) AS n FROM conversations')
    expect(rows).toEqual([{ n: 2 }])
  })
})

describe('test-helpers.ipc — test:seed-messages handler', () => {
  let handler: ((event: unknown, payload: unknown) => Promise<unknown>) | undefined

  beforeAll(() => {
    // The handler was registered by the test:db-select beforeAll above.
    // Re-grab it from the mocked ipcMain map.
    handler = _invokeHandlers.get('test:seed-messages') as typeof handler
  })

  afterAll(() => {
    _invokeHandlers.delete('test:seed-messages')
  })

  it('handler is registered', () => {
    expect(handler).toBeDefined()
  })

  it('rejects invalid count (negative)', async () => {
    await expect(
      handler!(null, { conversationId: 'c1', count: -1, role: 'user' })
    ).rejects.toThrow()
  })

  it('rejects invalid count (over 500)', async () => {
    await expect(
      handler!(null, { conversationId: 'c1', count: 501, role: 'user' })
    ).rejects.toThrow()
  })

  it('rejects invalid role', async () => {
    await expect(
      handler!(null, { conversationId: 'c1', count: 5, role: 'system' })
    ).rejects.toThrow()
  })

  it('rejects missing conversationId', async () => {
    await expect(handler!(null, { count: 5, role: 'user' })).rejects.toThrow()
  })
})

describe('test-helpers.ipc — test:trigger-compact handler', () => {
  let handler: ((event: unknown, payload: unknown) => Promise<unknown>) | undefined

  beforeAll(() => {
    handler = _invokeHandlers.get('test:trigger-compact') as typeof handler
  })

  afterAll(() => {
    _invokeHandlers.delete('test:trigger-compact')
  })

  it('handler is registered', () => {
    expect(handler).toBeDefined()
  })

  it('rejects missing conversationId', async () => {
    await expect(handler!(null, {})).rejects.toThrow()
  })

  it('rejects non-string conversationId', async () => {
    await expect(handler!(null, { conversationId: 42 })).rejects.toThrow()
  })

  it('rejects invalid contextWindowOverride (negative)', async () => {
    await expect(
      handler!(null, { conversationId: 'c1', contextWindowOverride: -1 })
    ).rejects.toThrow()
  })

  it('rejects empty summaryOverride', async () => {
    await expect(
      handler!(null, { conversationId: 'c1', summaryOverride: '' })
    ).rejects.toThrow()
  })
})

describe('test-helpers.ipc — assertTestMode guard', () => {
  // Note: vi.resetModules() voids module cache but vitest preserves the
  // vi.mock() registrations from the top of the file across resets, so the
  // fresh import below still resolves 'electron' against our mock. If you
  // expand this test to verify any code path AFTER assertTestMode() throws,
  // you may need to re-establish the mocks explicitly.
  it('throws if registered without TEST_MODE', async () => {
    // Remove TEST_MODE, force module re-import, register handler, then call it
    delete process.env.CRUCHOT_TEST_MODE
    vi.resetModules()
    const { registerTestHelpers: register2 } = await import('../test-helpers.ipc')
    register2()
    const h = _invokeHandlers.get('test:db-select') as ((event: unknown, sql: unknown) => Promise<unknown>) | undefined
    expect(h).toBeDefined()
    await expect(h!(null, 'SELECT * FROM conversations')).rejects.toThrow(/CRUCHOT_TEST_MODE/)
    _invokeHandlers.delete('test:db-select')
    process.env.CRUCHOT_TEST_MODE = '1'
  })
})
