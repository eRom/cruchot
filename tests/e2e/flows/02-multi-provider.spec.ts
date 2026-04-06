// tests/e2e/flows/02-multi-provider.spec.ts
//
// Phase 2b1 spec — multi-provider switch and error recovery.
//
// Scenario:
//   1. Start with TEST_MODEL_ID configured (Ollama locally, gemini in CI)
//   2. Create conv1 + send a 1st message — expect success
//      (conv1 sticks to TEST_MODEL_ID via the InputZone updateConversation
//      side-effect at line 695, so it will keep using ollama for the
//      rest of the spec)
//   3. Switch the default model to a provider with no API key
//      (openai::gpt-4o)
//   4. Create conv2 — a fresh conversation has modelId=null in the DB,
//      so ChatView.tsx:112 falls back to useSettingsStore.defaultModelId
//      which is now 'openai::gpt-4o'. Send a message in conv2 → expect
//      the error path:
//      - user message IS persisted (chat.ipc.ts:260 writes the row before
//        getModel() throws on missing key)
//      - assistant message is NOT persisted (renderer creates an in-memory
//        error placeholder via addMessage(), but messages.store has no DB
//        write — only chat.ipc.ts writes assistant rows)
//   5. Click back on conv1 in the sidebar. conv1's modelId column is set
//      to the original TEST_MODEL_ID, so ChatView's effect re-selects it
//      via providers.store regardless of the current default.
//   6. Send a 2nd message in conv1 → expect success (recovery proven).
//
// ── Why we use NEW conversations instead of switching mid-conversation ──
// ChatView.tsx:100-118 has an effect on `activeConversationId` that calls
// useProvidersStore.getState().selectModel() with conv.modelId ?? default.
// So clicking on a conversation OVERRIDES whatever the default model was.
// To exercise the openai-no-key path, we MUST create a fresh conversation
// AFTER setting the default — that's the only path where defaultModelId
// is consulted (ChatView.tsx:112).
//
// ── Assertion discipline ────────────────────────────────────────────────
// Side-effects only — never assert on LLM-generated text. Asserts target:
//   - DB row counts (conversations + messages, filtered by role/provider)
//   - messages.providerId / model_id columns to confirm which provider
//     was used for each row
//   - response_time_ms presence on the assistant rows (proves the finish
//     handler ran end-to-end)
//
// ── Investigation findings (chat.ipc.ts post-Task 1 refactor) ──────────
//   - prepareChat() persists the user row at line 260-267 BEFORE calling
//     getModel() at line 286. So failed sends DO leave a user row behind.
//   - getOpenAIProvider() throws 'OpenAI API key not configured' when no
//     key is in safeStorage (providers.ts:43). In TEST_MODE we never set
//     any key for openai, so the throw is deterministic.
//   - The catch in handleChatMessage (line 1397) sends a single
//     'chat:chunk { type: error }' frame and returns. NO row is written
//     to messages for the failed assistant turn.
//   - InputZone canSend (line 189) only requires selectedModelId/Id to
//     be truthy strings — there is NO client-side gating on missing keys,
//     so the chat:send IPC will fire and reach the server-side throw.
//
// ── Why we click conv1 by accessible name (not data-testid) ────────────
// ConversationItem renders role="button" with conversation.title as the
// accessible name. There's no data-testid on it yet (a separate refactor).
// Playwright's getByRole('button', { name }) is stable enough for our
// purposes since we control both ends (the title is set from FIRST_MESSAGE
// via chat.ipc.ts auto-rename at line 276).

import { test, expect, TEST_MODEL_ID, seedDefaultModel } from '../fixtures/flow-fixtures'
import { assertOllamaReady, warmUpModel } from '../fixtures/ollama'

const [PROVIDER, MODEL] = TEST_MODEL_ID.split('::') as [string, string]

// Title used to re-select conv1 in the sidebar after the openai detour.
// chat.ipc.ts:276 truncates content to 35 chars for the title; "Reply
// with ACK" is well under that limit so the title equals the content
// verbatim and can be used as the accessible name for getByRole.
const FIRST_MESSAGE = 'Reply with ACK'

test.describe('multi-provider switch + error recovery', () => {
  test.beforeAll(async () => {
    if (TEST_MODEL_ID.startsWith('ollama::')) {
      await assertOllamaReady(MODEL)
      await warmUpModel(MODEL)
    }
  })

  // 2 LLM round-trips on a cold qwen3.5:4b plus 1 fast-failing IPC,
  // each with a generous slack. 240s gives headroom on slow CI.
  test.setTimeout(240_000)

  test('switch to a provider with no key shows error, switch back recovers', async ({
    window: page,
    dbHelper,
  }) => {
    // ── Step 1: configure default model ──
    await seedDefaultModel(page, TEST_MODEL_ID)

    expect(await dbHelper.count('conversations')).toBe(0)
    expect(await dbHelper.count('messages')).toBe(0)

    // ── Step 2: create conv1 + send the 1st (successful) message ──
    const newConvButton = page
      .locator('[data-testid="new-conversation-collapsed"], [data-testid="new-conversation-expanded"]')
      .first()
    await newConvButton.click()

    await dbHelper.waitFor(
      () => dbHelper.count('conversations'),
      (n) => n === 1,
      { timeout: 5_000 }
    )

    await page.fill('[data-testid="chat-input"]', FIRST_MESSAGE)
    await page.click('[data-testid="chat-send"]')

    await dbHelper.waitFor(
      () => dbHelper.count("messages WHERE role = 'assistant'"),
      (n) => n === 1,
      { timeout: 90_000 }
    )

    expect(await dbHelper.count('messages')).toBe(2)
    expect(await dbHelper.count("messages WHERE role = 'user'")).toBe(1)

    // The first round-trip used PROVIDER (ollama or google).
    const firstAssistant = await dbHelper.selectOne<{
      provider_id: string | null
      model_id: string | null
      response_time_ms: number | null
    }>(
      "SELECT provider_id, model_id, response_time_ms FROM messages WHERE role = 'assistant'"
    )
    expect(firstAssistant.provider_id).toBe(PROVIDER)
    expect(firstAssistant.model_id).toBe(MODEL)
    expect(firstAssistant.response_time_ms ?? 0).toBeGreaterThan(0)

    // ── Step 3: switch the default to openai (no key in TEST_MODE) ──
    //
    // seedDefaultModel handles localStorage seed + IPC mirror + reload.
    // The localStorage seed is mandatory — useInitApp.ts:71 reads from
    // there before the DB settings hydration.
    await seedDefaultModel(page, 'openai::gpt-4o')

    // After the reload, useConversationsStore is unpersisted so
    // activeConversationId is null. No conversation is selected, so
    // chat-input is NOT in the DOM. We're about to create conv2 instead.
    expect(await dbHelper.count('conversations')).toBe(1)

    // ── Step 4: create conv2 (inherits openai from defaultModelId) ──
    //
    // A fresh conversation has modelId=null in the DB
    // (queries/conversations.ts:41). When activeConversationId switches
    // to it, ChatView.tsx:112 falls back to useSettingsStore.defaultModelId,
    // which is 'openai::gpt-4o' after our seedDefaultModel call.
    const newConvButton2 = page
      .locator('[data-testid="new-conversation-collapsed"], [data-testid="new-conversation-expanded"]')
      .first()
    await newConvButton2.click()

    await dbHelper.waitFor(
      () => dbHelper.count('conversations'),
      (n) => n === 2,
      { timeout: 5_000 }
    )

    // Wait for chat-input — proves conv2 is active and InputZone is mounted.
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 5_000 })

    await page.fill('[data-testid="chat-input"]', 'This should fail (no API key for openai).')
    await page.click('[data-testid="chat-send"]')

    // The error path is fully synchronous from prepareChat's perspective:
    //   1. user row INSERT (line 260) → user count goes from 1 to 2
    //   2. getModel('openai', 'gpt-4o') throws (providers.ts:43)
    //   3. catch sends 'chat:chunk { type: error }' (line 1424)
    // No assistant row is ever written for this turn.
    await dbHelper.waitFor(
      () => dbHelper.count("messages WHERE role = 'user'"),
      (n) => n === 2,
      { timeout: 10_000 }
    )

    // The assistant count must NOT have changed.
    expect(await dbHelper.count("messages WHERE role = 'assistant'")).toBe(1)
    expect(await dbHelper.count('messages')).toBe(3)

    // The failed user row carries provider_id='openai'.
    //
    // NB: cannot ORDER BY created_at — the substring CREATE matches the
    // FORBIDDEN_TOKENS regex of test:db-select. We disambiguate by
    // filtering on provider_id directly instead.
    const failedUser = await dbHelper.selectOne<{
      provider_id: string | null
      model_id: string | null
    }>(
      "SELECT provider_id, model_id FROM messages WHERE role = 'user' AND provider_id = 'openai'"
    )
    expect(failedUser.provider_id).toBe('openai')
    expect(failedUser.model_id).toBe('gpt-4o')

    // ── Step 5: click back on conv1 in the sidebar ──
    //
    // conv1's modelId column was stamped 'ollama::qwen3.5:4b' (or
    // 'google::gemini-2.5-flash' in CI) by InputZone:695 after the first
    // send. ChatView's effect re-selects the providers store accordingly,
    // independent of the current default. No re-seeding of the default
    // is required.
    await page.getByRole('button', { name: FIRST_MESSAGE }).click()
    await page.waitForSelector('[data-testid="chat-input"]', { timeout: 5_000 })

    // ── Step 6: send a 2nd message in conv1 — expect recovery ──
    await page.fill('[data-testid="chat-input"]', 'Reply with OK')
    await page.click('[data-testid="chat-send"]')

    await dbHelper.waitFor(
      () => dbHelper.count("messages WHERE role = 'assistant'"),
      (n) => n === 2,
      { timeout: 90_000 }
    )

    // ── Final state assertions ──
    // Expected:
    //   - 2 conversations (conv1 ollama, conv2 openai)
    //   - 5 messages: 3 user + 2 assistant
    //   - The 2 assistants belong to TEST_MODEL_ID's provider
    //   - Exactly 1 user belongs to openai (the failed turn)
    //   - 0 assistants belong to openai
    expect(await dbHelper.count('conversations')).toBe(2)
    expect(await dbHelper.count('messages')).toBe(5)
    expect(await dbHelper.count("messages WHERE role = 'user'")).toBe(3)
    expect(await dbHelper.count("messages WHERE role = 'assistant'")).toBe(2)

    // No ORDER BY — `created_at` contains CREATE which is in the
    // FORBIDDEN_TOKENS regex. Order is irrelevant for the assertion: we
    // just need both rows back.
    const assistants = await dbHelper.selectAll<{
      provider_id: string | null
      model_id: string | null
      response_time_ms: number | null
    }>(
      "SELECT provider_id, model_id, response_time_ms FROM messages WHERE role = 'assistant'"
    )
    expect(assistants).toHaveLength(2)
    for (const a of assistants) {
      expect(a.provider_id).toBe(PROVIDER)
      expect(a.model_id).toBe(MODEL)
      expect(a.response_time_ms ?? 0).toBeGreaterThan(0)
    }

    // Side-effect signature of the failed turn: exactly 1 user row with
    // provider_id='openai' exists, and there is no matching assistant
    // row for openai.
    const openaiUsers = await dbHelper.selectAll(
      "SELECT id FROM messages WHERE role = 'user' AND provider_id = 'openai'"
    )
    expect(openaiUsers).toHaveLength(1)

    const openaiAssistants = await dbHelper.selectAll(
      "SELECT id FROM messages WHERE role = 'assistant' AND provider_id = 'openai'"
    )
    expect(openaiAssistants).toHaveLength(0)
  })
})
