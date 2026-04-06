// tests/e2e/fixtures/flow-fixtures.ts
//
// Flow-spec fixture: extends the base electron-app fixture with a `dbHelper`
// that wraps the test:db-select IPC channel exposed by Phase 2a's
// test-helpers.ipc.ts.
//
// dbHelper is a thin façade over window.api.test.dbSelect, providing
// idiomatic count(), selectOne(), selectAll(), waitFor() helpers.

import { test as baseTest, expect as baseExpect } from './electron-app'
import type { Page } from '@playwright/test'

export interface DbHelper {
  /** Count rows. `tableExpr` may be 'messages' or 'messages WHERE role = "assistant"'. */
  count(tableExpr: string): Promise<number>

  /** Get a single row (the first match). Throws if no match. */
  selectOne<T = Record<string, unknown>>(sql: string): Promise<T>

  /** Get all rows matching the query. */
  selectAll<T = Record<string, unknown>>(sql: string): Promise<T[]>

  /**
   * Poll a value until a predicate is satisfied or the timeout expires.
   * Returns the final value. Throws on timeout.
   */
  waitFor<T>(
    fetchValue: () => Promise<T>,
    predicate: (value: T) => boolean,
    options?: { timeout?: number; pollInterval?: number }
  ): Promise<T>
}

function makeDbHelper(page: Page): DbHelper {
  const dbSelect = (sql: string): Promise<unknown[]> =>
    page.evaluate(
      ([s]) =>
        (
          window as { api: { test?: { dbSelect: (sql: string) => Promise<unknown[]> } } }
        ).api.test!.dbSelect(s),
      [sql]
    )

  return {
    async count(tableExpr) {
      // Build a defensive COUNT(*) query. The whitelist regex requires
      // SELECT <cols> FROM <table>, so we must inject the table expression
      // verbatim — but tableExpr comes from the spec author, never from
      // user input, so it's safe.
      const rows = (await dbSelect(`SELECT COUNT(*) AS n FROM ${tableExpr}`)) as { n: number }[]
      return rows[0]?.n ?? 0
    },

    async selectOne<T = Record<string, unknown>>(sql: string): Promise<T> {
      const rows = (await dbSelect(sql)) as T[]
      if (rows.length === 0) {
        throw new Error(`[dbHelper.selectOne] No row matched: ${sql}`)
      }
      return rows[0]
    },

    async selectAll<T = Record<string, unknown>>(sql: string): Promise<T[]> {
      return (await dbSelect(sql)) as T[]
    },

    async waitFor<T>(
      fetchValue: () => Promise<T>,
      predicate: (value: T) => boolean,
      options: { timeout?: number; pollInterval?: number } = {}
    ): Promise<T> {
      const timeout = options.timeout ?? 30_000
      const pollInterval = options.pollInterval ?? 250
      const start = Date.now()
      let last: T

      while (Date.now() - start < timeout) {
        last = await fetchValue()
        if (predicate(last)) return last
        await new Promise((r) => setTimeout(r, pollInterval))
      }

      throw new Error(
        `[dbHelper.waitFor] timeout after ${timeout}ms — last value: ${JSON.stringify(last!)}`
      )
    },
  }
}

type FlowFixtures = {
  dbHelper: DbHelper
}

export const test = baseTest.extend<FlowFixtures>({
  dbHelper: async ({ window }, use) => {
    const helper = makeDbHelper(window)
    await use(helper)
  },
})

export const expect = baseExpect
