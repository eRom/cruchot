// tests/e2e/flows/01-chat-basic.spec.ts
//
// Phase 2a PoC — pilot E2E flow spec.
//
// Goal: prove that the entire stack works end-to-end:
//   1. Playwright launches the Electron binary in TEST_MODE
//   2. The renderer has its default model configured (localStorage + DB)
//      so that useInitApp.ts hydrates the providers store on load
//   3. The user clicks "new conversation" in the sidebar
//   4. The user types a message into the chat input and clicks send
//   5. The chat IPC pipeline calls Ollama qwen3.5:4b and streams a response
//   6. The DB rows are persisted (conversations + messages with side-effects)
//   7. After reload, the conversation is still present
//
// ── Assertion discipline (READ THIS BEFORE EDITING) ─────────────────────
// Every assert in this spec is on a side-effect:
//   - DB row count
//   - Column value (model_id, provider_id, tokens_out, role)
//   - UI element presence
// We NEVER inspect the LLM-generated text content. This makes the spec
// resilient to model variability (qwen locally vs gemini-2.5-flash in CI).
//
// ── Schema notes (verified against src/main/db/schema.ts) ──────────────
//   - messages.modelId     → column `model_id`    (bare id, no provider prefix)
//   - messages.providerId  → column `provider_id`
//   - messages.tokensOut   → column `tokens_out`
//   - llm_costs table is NOT written by the chat pipeline — it's reserved
//     for background operations (compact/episode/summary/oneiric/...).
//     Chat token counts and cost live in the `messages` row directly.

import { test, expect, TEST_MODEL_ID, seedDefaultModel } from '../fixtures/flow-fixtures'
import { assertOllamaReady, warmUpModel } from '../fixtures/ollama'

// Extract the provider/model parts from TEST_MODEL_ID. Used by Ollama
// helpers below — they only run when TEST_MODEL_ID starts with 'ollama::'.
const [PROVIDER, MODEL] = TEST_MODEL_ID.split('::') as [string, string]

test.describe('chat basic — TEST_MODEL_ID', () => {
  // Portable across Ollama (local) and gemini-2.5-flash (CI). The Ollama
  // health check + warm-up only runs when TEST_MODEL_ID starts with 'ollama::'.
  test.beforeAll(async () => {
    if (TEST_MODEL_ID.startsWith('ollama::')) {
      await assertOllamaReady(MODEL)
      await warmUpModel(MODEL)
    }
  })

  // Cold Ollama generations + chat IPC roundtrip can exceed the 60s global
  // timeout. 120s gives us enough headroom without being wasteful.
  test.setTimeout(120_000)

  test('user message → assistant response → DB side-effects → reload survives', async ({
    window: page,
    dbHelper,
  }) => {
    // ── Step 1: configure the default model in localStorage + DB ──
    //
    // seedDefaultModel() handles the localStorage seed + IPC mirror + reload.
    // See its JSDoc in flow-fixtures.ts for why localStorage seeding is
    // mandatory (useInitApp.ts:71 reads it BEFORE the DB settings fetch).
    await seedDefaultModel(page, TEST_MODEL_ID)

    // ── Step 2: assert initial DB state is empty ──
    expect(await dbHelper.count('conversations')).toBe(0)
    expect(await dbHelper.count('messages')).toBe(0)

    // ── Step 3: click "new conversation" in the sidebar ──
    //
    // Two nodes carry data-testid="new-conversation" (collapsed icon +
    // expanded button variant). Only one is rendered at a time but we
    // use .first() to stay defensive against strict-mode violations.
    await page.locator('[data-testid="new-conversation"]').first().click()

    // Wait until the conversation row actually lands in the DB.
    await dbHelper.waitFor(
      () => dbHelper.count('conversations'),
      (n) => n === 1,
      { timeout: 5_000 }
    )

    // ── Step 4: type a message and send it ──
    //
    // Phrasing is chosen to be:
    //   - short (keeps qwen fast)
    //   - non-empty per canSend rules
    //   - free of any FORBIDDEN_TOKENS in dbHelper (`;`, `--`, `/*`, etc.)
    //     — "ACK" is safe, no comment markers, no semicolons
    const userMessage = 'Reply with only the word ACK'
    await page.fill('[data-testid="chat-input"]', userMessage)
    await page.click('[data-testid="chat-send"]')

    // ── Step 5: wait for the assistant message to be persisted ──
    //
    // Side-effect-only wait: poll the DB until exactly 1 assistant message
    // row exists. Generous 90s timeout to absorb cold-model + first-generation.
    //
    // NB: SQLite treats double-quoted strings as IDENTIFIERS (column names),
    // not string literals — we MUST use single quotes around role values.
    // Single quotes are NOT in FORBIDDEN_TOKENS so they're allowed through
    // the test:db-select pipeline.
    await dbHelper.waitFor(
      () => dbHelper.count("messages WHERE role = 'assistant'"),
      (n) => n === 1,
      { timeout: 90_000 }
    )

    // ── Step 6: verify all side-effects ──
    expect(await dbHelper.count('conversations')).toBe(1)
    expect(await dbHelper.count('messages')).toBe(2)
    expect(await dbHelper.count("messages WHERE role = 'user'")).toBe(1)
    expect(await dbHelper.count("messages WHERE role = 'assistant'")).toBe(1)

    // User message content is stored verbatim by createMessage() — we can
    // safely assert exact equality. (This is the user's own text, not the
    // LLM output — asserting on it is not a "text assertion" in the
    // model-variability sense.)
    const userMsg = await dbHelper.selectOne<{
      content: string
      model_id: string | null
      provider_id: string | null
    }>("SELECT content, model_id, provider_id FROM messages WHERE role = 'user'")
    expect(userMsg.content).toBe(userMessage)
    expect(userMsg.model_id).toBe(MODEL)
    expect(userMsg.provider_id).toBe(PROVIDER)

    // Assistant message: side-effects only — content is non-empty,
    // model_id / provider_id match what we configured, response_time_ms > 0.
    // We never assert on the content's text.
    //
    // Why response_time_ms instead of tokens_out? The Ollama provider via
    // AI SDK doesn't always return a populated usage object (it depends on
    // the model's response shape). Cruchot's chat.ipc.ts:1278 falls back
    // to `usage?.outputTokens ?? 0` in that case, so tokens_out can be 0
    // even on a successful generation. response_time_ms however is always
    // set from `Date.now() - startTime` in the onFinish handler — making
    // it the most reliable "the pipeline completed" side-effect signal.
    const assistantMsg = await dbHelper.selectOne<{
      content: string
      model_id: string | null
      provider_id: string | null
      tokens_out: number | null
      response_time_ms: number | null
    }>(
      "SELECT content, model_id, provider_id, tokens_out, response_time_ms FROM messages WHERE role = 'assistant'"
    )
    expect(assistantMsg.content.length).toBeGreaterThan(0)
    expect(assistantMsg.model_id).toBe(MODEL)
    expect(assistantMsg.provider_id).toBe(PROVIDER)
    expect(assistantMsg.response_time_ms ?? 0).toBeGreaterThan(0)
    // tokens_out may be 0 with Ollama, but the column must have been written
    // (not-null) — that proves the finish handler ran end-to-end.
    expect(assistantMsg.tokens_out).not.toBeNull()

    // NB: the chat IPC pipeline does NOT write to llm_costs — that table
    // is reserved for background operations. Cost/tokens for chat live in
    // the messages row. No assertion on llm_costs here.

    // ── Step 7: reload the window — conversation must persist ──
    await page.reload()
    await page.waitForLoadState('domcontentloaded')

    expect(await dbHelper.count('conversations')).toBe(1)
    expect(await dbHelper.count('messages')).toBe(2)
    expect(await dbHelper.count("messages WHERE role = 'assistant'")).toBe(1)
  })
})
