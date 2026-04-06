// tests/e2e/flows/05-memory-layers.spec.ts
//
// Phase 2b1 spec — memory layers injection in the system prompt.
//
// Scenario:
//   1. Create a memory fragment "My favorite color is blue." via the
//      existing window.api.createMemoryFragment IPC (handler
//      memory-fragments.ipc.ts:40, schema enforces content 1..2000).
//   2. Assert the fragment is persisted in the memory_fragments table.
//   3. Create a new conversation via the sidebar.
//   4. Call window.api.test.getSystemPrompt with the new conversationId.
//   5. Assert the returned string contains <user-memory>, "blue", and
//      </user-memory>.
//
// ── Side-effects-only discipline ──────────────────────────────────────
// This spec does NOT send a real LLM message. It exercises the system-
// prompt CONSTRUCTION path (buildSystemPrompt + buildMemoryBlock) via
// the test:get-system-prompt helper introduced in Task 8. The Ollama
// / Gemini model is irrelevant — we only assert on the concatenated
// string, which is purely a function of DB state (memory_fragments +
// episodes) and the DEFAULT_SYSTEM_PROMPT.
//
// That said, we still call seedDefaultModel() because the app boot path
// expects a valid defaultModelId in localStorage/DB before the sidebar
// "New conversation" button is wired up correctly. It's cheap plumbing
// shared with the other flow specs.
//
// ── Why this proves anything ──────────────────────────────────────────
// test:get-system-prompt (test-helpers.ipc.ts:335) mirrors the prod
// chat.ipc.ts path for memory + profile blocks:
//   1. Look up the conversation (for projectId → episode profile scope)
//   2. Call buildMemoryBlock() → reads active fragments, wraps in XML
//   3. Call buildSystemPrompt() → concatenates base + blocks
// So asserting the return value contains <user-memory>blue</user-memory>
// proves the entire memory-injection wiring works end-to-end.
//
// ── Why we don't need a per-test memory_fragments reset ───────────────
// Each spec gets a fresh userData dir via electron-app.ts:31, so the
// DB is brand-new for every test. No cross-test leakage.

import {
  test,
  expect,
  TEST_MODEL_ID,
  seedDefaultModel,
} from '../fixtures/flow-fixtures'

test.describe('memory layers — system prompt injection', () => {
  // No LLM call in this spec — the timeout is purely UI boot + IPC
  // roundtrips. 60s is plenty.
  test.setTimeout(60_000)

  test('memory fragment is injected into the system prompt', async ({
    window: page,
    dbHelper,
  }) => {
    // ── Step 0: boot the app with a default model ──
    // Required so the "New conversation" button is wired up correctly
    // by useInitApp. See seedDefaultModel() for the localStorage/DB
    // dance.
    await seedDefaultModel(page, TEST_MODEL_ID)

    // Sanity: the test starts on a fresh DB
    expect(await dbHelper.count('conversations')).toBe(0)
    expect(await dbHelper.count('memory_fragments')).toBe(0)

    // ── Step 1: create a memory fragment via the IPC ──
    // Handler: memory:create (memory-fragments.ipc.ts:40). Zod schema
    // requires { content: string 1..2000, isActive?: boolean = true }.
    // The returned fragment has isActive=true by default, which is
    // what buildMemoryBlock() filters on.
    await page.evaluate(async () => {
      await (
        window as {
          api: {
            createMemoryFragment: (payload: {
              content: string
              isActive?: boolean
            }) => Promise<unknown>
          }
        }
      ).api.createMemoryFragment({ content: 'My favorite color is blue.' })
    })

    // ── Step 2: verify the fragment is persisted ──
    // Raw LIKE on content is safe here: memory_fragments is in the
    // READABLE_TABLES whitelist (test-helpers.ipc.ts:47) and the
    // SAFE_SELECT_RE regex only validates the SELECT ... FROM <table>
    // prefix — what comes after the table name (WHERE ... LIKE ...)
    // is not validated but is also not exploitable since this runs
    // inside the test-mode sandbox on a disposable DB.
    expect(
      await dbHelper.count(
        "memory_fragments WHERE content LIKE '%blue%' AND is_active = 1"
      )
    ).toBe(1)

    // ── Step 3: create a new conversation via the sidebar ──
    // We use the unified testid from Task 3 (either the collapsed or
    // expanded variant, whichever is currently visible). Same pattern
    // as the other flow specs.
    const newConvButton = page
      .locator(
        '[data-testid="new-conversation-collapsed"], [data-testid="new-conversation-expanded"]'
      )
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

    // ── Step 4: call test:get-system-prompt ──
    // This invokes buildSystemPrompt({ base, blocks: { memory, profile } })
    // via the test helper, returning the final concatenated string.
    // userMessage is required by the Zod schema (min length 1) but is
    // not actually used by the memory/profile blocks — it's there so
    // Phase 2c can extend this helper to include message-aware blocks
    // (semantic recall, library RAG) without a breaking change.
    const systemPrompt = await page.evaluate(
      async (id) => {
        const api = (
          window as {
            api: {
              test?: {
                getSystemPrompt: (p: {
                  conversationId: string
                  userMessage: string
                }) => Promise<string>
              }
            }
          }
        ).api
        if (!api.test) {
          throw new Error(
            'window.api.test is undefined — TEST_MODE may not be enabled'
          )
        }
        return api.test.getSystemPrompt({
          conversationId: id,
          userMessage: 'Hello, what is my favorite color?',
        })
      },
      conv.id
    )

    // ── Step 5: assert the system prompt contains the memory block ──
    // buildMemoryBlock() (memory-fragments.ts:84) wraps active fragment
    // contents as:
    //
    //   <user-memory>
    //   <joined content>
    //   </user-memory>
    //
    // joined by '\n'. We assert on the three required substrings rather
    // than an exact string match so the test stays robust if
    // DEFAULT_SYSTEM_PROMPT evolves or additional blocks (profile,
    // library, …) land around the memory block.
    expect(systemPrompt).toContain('<user-memory>')
    expect(systemPrompt).toContain('My favorite color is blue.')
    expect(systemPrompt).toContain('</user-memory>')
  })
})
