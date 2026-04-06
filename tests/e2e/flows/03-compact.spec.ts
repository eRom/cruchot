// tests/e2e/flows/03-compact.spec.ts
//
// Phase 2b1 spec — compact summary persistence.
//
// Scenario:
//   1. Create a new conversation via the UI (inherits the default model)
//   2. Send a 1st real chat message — required because triggerCompact
//      reads conv.modelId for provider resolution, and only a real
//      chat:send stamps modelId on the conversation row (via
//      InputZone.tsx:695). A seeded message does NOT stamp it.
//   3. Seed 100 synthetic messages (50 user + 50 assistant) via
//      test:seed-messages — bypasses the LLM and is fast (~200ms).
//   4. Trigger compact via test:trigger-compact with BOTH
//      contextWindowOverride=1200 (forces the summarization branch to
//      fire) AND summaryOverride='...fake summary text...' (bypasses the
//      LLM call).
//   5. Assert DB side effects:
//      - conversations.compact_summary equals the override
//      - conversations.compact_boundary_id is set
//      - llm_costs has a new row with type='compact'
//
// ── Why we need contextWindowOverride ──────────────────────────────────
// qwen3.5:4b is NOT in the static MODELS registry (src/main/llm/registry.ts),
// so the test handler falls back to a 200_000 contextWindow. With 100
// short messages totalling ~600 tokens, the 25% recent-budget threshold
// (50_000 tokens) is never reached → compactService.fullCompact() would
// early-return at line 267-275 with NO summary AND no llm_costs row.
// The override forces a small contextWindow so the threshold fires.
//
// ── Why we need summaryOverride (the painful discovery) ────────────────
// Even with the threshold firing, qwen3.5:4b CANNOT actually produce a
// summary. Empirical findings while iterating on this spec:
//   - qwen3.5:4b is a reasoning-only model — it always emits <think>
//     tokens before content
//   - On the compactSummaryPrompt (which asks for "structured prose"),
//     qwen rambles in <think> for the FULL maxTokens=4096 budget that
//     compact.service.ts hardcodes
//   - The AI SDK separates `reasoning_content` from `content`, so
//     `result.text` comes back as an EMPTY STRING — compactSummary
//     persisted to the DB would also be empty, breaking the spec
//   - The call takes ~4 minutes wall-time (4096 tokens at ~17 tok/s)
//
// summaryOverride bypasses the LLM call. The handler still:
//   - walks the rounds and computes the boundary id (mirrors fullCompact)
//   - persists compact_summary + compact_boundary_id
//   - writes a fake llm_costs row with realistic-ish token counts
//
// In CI (CRUCHOT_TEST_PROVIDER=google), gemini-2.5-flash IS fast enough
// to produce a real summary in <5s. A future enhancement could split
// this spec into "Ollama: persistence-only" and "gemini: full LLM path".
//
// ── Math: why 100 messages + override 1200 ─────────────────────────────
//   Each seeded message: "Test message N (user/assistant)" ≈ 22 chars ≈
//   6 tokens. 100 messages → ~600 tokens. Plus 1 real round (~24 tokens)
//   = ~624 tokens total.
//
//   With contextWindowOverride=1200, recentBudget = 300 tokens. The
//   rounds-walk in the handler reserves ~50 messages worth as "recent"
//   and the rest go into the summarized set, which fixes the boundary
//   id at a non-trivial location in the conversation.
//
// ── Assertion discipline ───────────────────────────────────────────────
// Side-effects only. With summaryOverride we know the expected summary
// text, so we CAN assert exact equality on it (it's our own input, not
// LLM output).

import { test, expect, TEST_MODEL_ID, seedDefaultModel } from '../fixtures/flow-fixtures'
import { assertOllamaReady, warmUpModel } from '../fixtures/ollama'

const [, MODEL] = TEST_MODEL_ID.split('::') as [string, string]

const FIRST_MESSAGE = 'Reply with ACK.'

// Sentinel summary used by the override path. Chosen to be:
//   - non-empty (validates length > 0)
//   - free of FORBIDDEN_TOKENS (`;`, `--`, `/*`, etc) so dbHelper SELECT
//     queries that include it as a literal don't trip the test:db-select
//     pipeline
//   - obviously test-only so it can never be confused with a real summary
const FAKE_SUMMARY = 'PHASE_2B1_TASK_6_FAKE_SUMMARY persisted by 03-compact.spec.ts'

test.describe('compact — summary persistence', () => {
  test.beforeAll(async () => {
    if (TEST_MODEL_ID.startsWith('ollama::')) {
      await assertOllamaReady(MODEL)
      await warmUpModel(MODEL)
    }
  })

  // Budget breakdown:
  //   - warmup chat (cold qwen3.5:4b): ~30s
  //   - seed messages + IPC overhead: ~1s
  //   - triggerCompact with override (no LLM): ~50ms
  //   - assertions: ~500ms
  // 120s gives 3-4x slack.
  test.setTimeout(120_000)

  test('compact persists summary, boundary, and llm_costs entry', async ({
    window: page,
    dbHelper,
  }) => {
    // ── Step 0: configure default model ──
    await seedDefaultModel(page, TEST_MODEL_ID)

    expect(await dbHelper.count('conversations')).toBe(0)
    expect(await dbHelper.count('messages')).toBe(0)

    // ── Step 1: create a new conversation via the UI ──
    const newConvButton = page
      .locator('[data-testid="new-conversation-collapsed"], [data-testid="new-conversation-expanded"]')
      .first()
    await newConvButton.click()

    await dbHelper.waitFor(
      () => dbHelper.count('conversations'),
      (n) => n === 1,
      { timeout: 5_000 }
    )

    const conv = await dbHelper.selectOne<{ id: string }>(
      'SELECT id FROM conversations LIMIT 1'
    )

    // ── Step 2: send a 1st real chat message to stamp modelId ──
    //
    // triggerCompact needs conv.modelId to resolve the provider. A seeded
    // message does NOT stamp it — only a real chat:send does (via
    // InputZone.tsx:695). So we send 1 real LLM message first.
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 5_000 })
    await page.fill('[data-testid="chat-input"]', FIRST_MESSAGE)
    await page.click('[data-testid="chat-send"]')

    await dbHelper.waitFor(
      () => dbHelper.count("messages WHERE role = 'assistant'"),
      (n) => n === 1,
      { timeout: 90_000 }
    )

    // Confirm the conversation is now stamped with the right provider.
    const stampedConv = await dbHelper.selectOne<{
      id: string
      model_id: string
    }>(`SELECT id, model_id FROM conversations WHERE id = '${conv.id}'`)
    expect(stampedConv.model_id).toBe(TEST_MODEL_ID)

    // ── Step 3: seed 100 synthetic messages (50 user + 50 assistant) ──
    await page.evaluate(
      async (id) => {
        const api = (
          window as {
            api: {
              test?: {
                seedMessages: (p: {
                  conversationId: string
                  count: number
                  role: 'user' | 'assistant'
                }) => Promise<{ inserted: number; ids: string[] }>
              }
            }
          }
        ).api
        await api.test!.seedMessages({ conversationId: id, count: 50, role: 'user' })
        await api.test!.seedMessages({ conversationId: id, count: 50, role: 'assistant' })
      },
      conv.id
    )

    // The conversation now has 2 real messages + 100 seeded = 102 total.
    expect(
      await dbHelper.count(`messages WHERE conversation_id = '${conv.id}'`)
    ).toBe(102)

    // ── Step 4: capture llm_costs count BEFORE compact ──
    const costsBefore = await dbHelper.count("llm_costs WHERE type = 'compact'")

    // ── Step 5: trigger compact ──
    //
    // We pass BOTH overrides:
    //   - contextWindowOverride: forces the rounds-walk to keep ~50
    //     messages and summarize the rest, setting a non-trivial boundary
    //   - summaryOverride: bypasses the LLM call (qwen3.5:4b cannot
    //     produce a usable compact summary in any reasonable time, see
    //     the file header for why)
    await page.evaluate(
      async ([id, fakeSummary]) => {
        const api = (
          window as {
            api: {
              test?: {
                triggerCompact: (p: {
                  conversationId: string
                  contextWindowOverride?: number
                  summaryOverride?: string
                }) => Promise<unknown>
              }
            }
          }
        ).api
        await api.test!.triggerCompact({
          conversationId: id,
          contextWindowOverride: 1200,
          summaryOverride: fakeSummary,
        })
      },
      [conv.id, FAKE_SUMMARY] as const
    )

    // ── Step 6: assert side effects ──
    const compactedConv = await dbHelper.selectOne<{
      compact_summary: string | null
      compact_boundary_id: string | null
    }>(
      `SELECT compact_summary, compact_boundary_id FROM conversations WHERE id = '${conv.id}'`
    )

    // The override is our own input, so we can assert exact equality —
    // this isn't an LLM-generated text assertion.
    expect(compactedConv.compact_summary).toBe(FAKE_SUMMARY)
    expect(compactedConv.compact_boundary_id).not.toBeNull()

    // The boundary id MUST belong to a real seeded message — the rounds
    // walk against contextWindow=1200 and ~624 tokens of conversation
    // means at least one message gets summarized.
    const boundaryRow = await dbHelper.selectOne<{
      id: string
      role: string
    }>(
      `SELECT id, role FROM messages WHERE id = '${compactedConv.compact_boundary_id}'`
    )
    expect(boundaryRow.id).toBe(compactedConv.compact_boundary_id)

    // llm_costs should have a new entry with type='compact'.
    const costsAfter = await dbHelper.count("llm_costs WHERE type = 'compact'")
    expect(costsAfter).toBeGreaterThan(costsBefore)

    // The new llm_costs row should be a 'compact' type tied to our model.
    const compactCost = await dbHelper.selectOne<{
      type: string
      conversation_id: string | null
      model_id: string
      provider_id: string
      tokens_in: number
      tokens_out: number
    }>(
      `SELECT type, conversation_id, model_id, provider_id, tokens_in, tokens_out FROM llm_costs WHERE type = 'compact' AND conversation_id = '${conv.id}'`
    )
    expect(compactCost.type).toBe('compact')
    expect(compactCost.conversation_id).toBe(conv.id)
    expect(compactCost.model_id).toBe(MODEL)
    expect(compactCost.tokens_in).toBeGreaterThan(0)
    expect(compactCost.tokens_out).toBeGreaterThan(0)
  })
})
