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
 *      c. 0 < sql.length <= MAX_SQL_LENGTH
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
import { z } from 'zod'
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

  // -------------------------------------------------------------------------
  // test:seed-messages — bulk-insert N synthetic messages into a conversation
  //
  // Phase 2b1 Task 5. Used by 03-compact.spec.ts to seed a conversation past
  // the compact threshold without invoking the LLM.
  //
  // Validation: Zod (count 1..500, role enum, conversationId non-empty).
  // Heavy modules (db queries, schema) are lazy-imported AFTER Zod parsing
  // so the validation tests don't pull in better-sqlite3 natives.
  // -------------------------------------------------------------------------
  const seedMessagesSchema = z.object({
    conversationId: z.string().min(1).max(100),
    count: z.number().int().min(1).max(500),
    role: z.enum(['user', 'assistant'])
  })

  ipcMain.handle('test:seed-messages', async (_event, payload: unknown) => {
    assertTestMode()

    const { conversationId, count, role } = seedMessagesSchema.parse(payload)

    // Lazy imports — keep the unit test (which only mocks electron + ../db)
    // free from native better-sqlite3 / AI SDK transitive loads.
    const { getConversation } = await import('../db/queries/conversations')
    const { createMessage } = await import('../db/queries/messages')

    const conv = getConversation(conversationId)
    if (!conv) {
      throw new Error(`[test:seed-messages] conversation "${conversationId}" not found`)
    }

    const insertedIds: string[] = []
    for (let i = 0; i < count; i++) {
      const msg = createMessage({
        conversationId,
        role,
        content: `Test message ${i + 1} (${role})`
      })
      insertedIds.push(msg.id)
    }

    return { inserted: count, ids: insertedIds }
  })

  // -------------------------------------------------------------------------
  // test:trigger-compact — direct full-compact, bypassing the UI button
  //
  // Phase 2b1 Task 5. Mirrors the orchestration of compact:run in
  // src/main/ipc/compact.ipc.ts (resolve model from conv.modelId, fetch
  // messages, call compactService.fullCompact, persist boundary + summary,
  // record llm_costs). Returns { tokensBefore, tokensAfter }.
  //
  // The conversation MUST already have a valid modelId set (provider::model),
  // otherwise this throws — we do not auto-seed a model here, the caller is
  // responsible (e.g. via test:seed-default-model on Ollama).
  // -------------------------------------------------------------------------
  const triggerCompactSchema = z.object({
    conversationId: z.string().min(1).max(100),
    // Phase 2b1 Task 6: allow tests to force a small context window so the
    // compact threshold (25% of contextWindow for the recent budget) fires
    // deterministically with a small seeded conversation. Production
    // compact:run handler does NOT accept this parameter — this is a
    // test-only override.
    contextWindowOverride: z.number().int().min(100).max(1_000_000).optional(),
    // Phase 2b1 Task 6: bypass the LLM call entirely and write the given
    // string as the compact_summary. This is necessary for E2E flow specs
    // running on Ollama qwen3.5:4b, which is a reasoning-only model that
    // spends ALL of maxTokens=4096 in <think> tokens for the compact
    // prompt — `result.text` ends up empty and the call takes ~4 minutes.
    // With summaryOverride set, the handler skips fullCompact() and writes
    // the override + a fake llm_costs row directly, proving the
    // persistence path while keeping the spec deterministic and fast.
    // CI runs with gemini-2.5-flash (CRUCHOT_TEST_PROVIDER=google) where
    // the real LLM call IS fast and the override is not needed.
    summaryOverride: z.string().min(1).max(10_000).optional()
  })

  const VALID_PROVIDERS = [
    'openai', 'anthropic', 'google', 'mistral', 'xai', 'deepseek',
    'qwen', 'perplexity', 'openrouter', 'lmstudio', 'ollama'
  ] as const

  ipcMain.handle('test:trigger-compact', async (_event, payload: unknown) => {
    assertTestMode()

    const { conversationId, contextWindowOverride, summaryOverride } = triggerCompactSchema.parse(payload)

    // Lazy imports for the same reason as test:seed-messages.
    const { getConversation, updateConversationCompact } = await import('../db/queries/conversations')
    const { getMessagesForConversation } = await import('../db/queries/messages')
    const { compactService } = await import('../services/compact.service')
    const { getModel } = await import('../llm/router')
    const { MODELS } = await import('../llm/registry')
    const { calculateMessageCost } = await import('../llm/cost-calculator')
    const { createLlmCost } = await import('../db/queries/llm-costs')

    const conv = getConversation(conversationId)
    if (!conv) {
      throw new Error(`[test:trigger-compact] conversation "${conversationId}" not found`)
    }
    if (!conv.modelId) {
      throw new Error(`[test:trigger-compact] conversation "${conversationId}" has no modelId set`)
    }

    const parts = conv.modelId.split('::')
    if (parts.length !== 2) {
      throw new Error(`[test:trigger-compact] invalid modelId format: ${conv.modelId}`)
    }
    const [providerId, actualModelId] = parts

    if (!VALID_PROVIDERS.includes(providerId as (typeof VALID_PROVIDERS)[number])) {
      throw new Error(`[test:trigger-compact] invalid provider: ${providerId}`)
    }

    const messages = getMessagesForConversation(conversationId)

    const modelInfo = MODELS.find((m) => m.id === actualModelId)
    // Phase 2b1 Task 6: allow tests to force a small context window so the
    // compact threshold (25% of contextWindow for the recent budget) fires
    // deterministically with a small seeded conversation. Production
    // compact:run handler does NOT accept this parameter — this is a
    // test-only override.
    const contextWindow = contextWindowOverride ?? modelInfo?.contextWindow ?? 200_000

    // Phase 2b1 Task 6: when summaryOverride is set, bypass the LLM call
    // entirely. We still mirror the rest of the orchestration (boundary
    // computation, updateConversationCompact, createLlmCost) so the spec
    // can assert on every persistence side-effect. The fake usage figures
    // are derived from the seeded messages so the llm_costs row carries
    // realistic-ish numbers.
    if (summaryOverride !== undefined) {
      const tokensBefore = compactService.estimateTokens(messages)

      // Mirror fullCompact()'s rounds-walk to compute keptRounds and
      // boundaryId so the persisted state matches what the real path
      // would have produced.
      const rounds = compactService.groupByApiRound(messages)
      const recentBudget = contextWindow * 0.25
      const keptRounds: typeof rounds = []
      let keptTokens = 0
      for (let i = rounds.length - 1; i >= 0; i--) {
        if (keptTokens + rounds[i].estimatedTokens > recentBudget) break
        keptRounds.unshift(rounds[i])
        keptTokens += rounds[i].estimatedTokens
      }
      const keptMessages = keptRounds.flatMap((r) => r.messages)
      const summarizedMessages = messages.filter(
        (m) => !keptMessages.some((km) => km.id === m.id)
      )
      const boundaryId = summarizedMessages.length > 0
        ? summarizedMessages[summarizedMessages.length - 1].id
        : conv.compactBoundaryId ?? messages[0]?.id ?? ''

      updateConversationCompact(conversationId, summaryOverride, boundaryId)

      const fakeInputTokens = compactService.estimateTokens(summarizedMessages)
      const fakeOutputTokens = Math.ceil(summaryOverride.length / 4)
      const cost = calculateMessageCost(actualModelId, fakeInputTokens, fakeOutputTokens)
      createLlmCost({
        type: 'compact',
        conversationId,
        modelId: actualModelId,
        providerId,
        tokensIn: fakeInputTokens,
        tokensOut: fakeOutputTokens,
        cost,
        metadata: {
          tokensBefore,
          tokensAfter: fakeOutputTokens + keptTokens,
          summaryOverride: true
        }
      })

      return {
        tokensBefore,
        tokensAfter: fakeOutputTokens + keptTokens
      }
    }

    const model = getModel(providerId, actualModelId)
    const result = await compactService.fullCompact(
      conversationId,
      messages,
      model,
      contextWindow,
      conv.compactSummary
    )

    // Find boundary: last summarized message
    const summarizedMessages = messages.filter(
      (m) => !result.keptMessages.some((km) => km.id === m.id)
    )
    const boundaryId = summarizedMessages.length > 0
      ? summarizedMessages[summarizedMessages.length - 1].id
      : conv.compactBoundaryId ?? messages[0]?.id ?? ''

    updateConversationCompact(conversationId, result.summary, boundaryId)

    if (result.usage) {
      const cost = calculateMessageCost(actualModelId, result.usage.inputTokens, result.usage.outputTokens)
      createLlmCost({
        type: 'compact',
        conversationId,
        modelId: actualModelId,
        providerId,
        tokensIn: result.usage.inputTokens,
        tokensOut: result.usage.outputTokens,
        cost,
        metadata: { tokensBefore: result.tokensBefore, tokensAfter: result.tokensAfter }
      })
    }

    return {
      tokensBefore: result.tokensBefore,
      tokensAfter: result.tokensAfter
    }
  })

  // -------------------------------------------------------------------------
  // test:get-system-prompt — build the system prompt chat.ipc.ts would use
  //
  // Phase 2b1 Task 8. Used by 05-memory-layers.spec.ts to assert that a
  // memory fragment is correctly injected into the system prompt via the
  // <user-memory> block. Mirrors the production path in chat.ipc.ts via
  // the dedicated buildSystemPrompt module extracted in Task 1.
  //
  // Scope: only memory + profile blocks are computed. The other blocks
  // (library, semantic, custom, plan, skill) require additional context
  // (workspace files, Qdrant recall, role config, forced plan mode flags)
  // that are out of scope for the current memory-layers test. Phase 2c
  // can extend this if needed.
  //
  // Validation: Zod (conversationId + userMessage both required, userMessage
  // bounded to avoid DoS). Heavy modules are lazy-imported for the same
  // reason as test:seed-messages and test:trigger-compact.
  // -------------------------------------------------------------------------
  const getSystemPromptSchema = z.object({
    conversationId: z.string().min(1).max(100),
    userMessage: z.string().min(1).max(10_000)
  })

  ipcMain.handle('test:get-system-prompt', async (_event, payload: unknown) => {
    assertTestMode()

    const { conversationId } = getSystemPromptSchema.parse(payload)

    // Lazy imports — keep the unit test free from native better-sqlite3 / AI
    // SDK transitive loads. Same pattern as test:seed-messages and
    // test:trigger-compact.
    const { getConversation } = await import('../db/queries/conversations')
    const { buildSystemPrompt } = await import('../llm/system-prompt-builder')
    const { DEFAULT_SYSTEM_PROMPT } = await import('../llm/system-prompt')
    const { buildMemoryBlock } = await import('../db/queries/memory-fragments')
    const { buildEpisodeProfileBlock } = await import('../llm/episode-prompt')

    const conv = getConversation(conversationId)
    if (!conv) {
      throw new Error(`[test:get-system-prompt] conversation "${conversationId}" not found`)
    }

    const memoryBlock = buildMemoryBlock()
    const episodeProfileBlock = buildEpisodeProfileBlock(conv.projectId)

    const result = buildSystemPrompt({
      base: DEFAULT_SYSTEM_PROMPT,
      blocks: {
        memory: memoryBlock,
        profile: episodeProfileBlock
      }
    })

    return result.final
  })
}
