/**
 * System prompt builder — concatenates the base prompt and 7 optional XML blocks
 * into a single string for streamText().
 *
 * Phase 2b1 extraction from chat.ipc.ts:443-487.
 *
 * The 7 blocks (in fixed order, separated by '\n\n'):
 *   1. library  — <library-context> (RAG referential)
 *   2. semantic — <semantic-memory> (Qdrant recall)
 *   3. profile  — <user-profile> (episodic memory)
 *   4. memory   — <user-memory> (manual fragments)
 *   5. custom   — user-provided systemPrompt (from IPC payload)
 *   6. plan     — <plan-instructions> (forced plan mode)
 *   7. skill    — <skill-context> (active skill, if any)
 *
 * IMPORTANT: this module does NOT compute the blocks — they must be passed in
 * already calculated. The caller (chat.ipc.ts or test-helpers.ipc.ts) is
 * responsible for fetching memory fragments, calling buildMemoryBlock(),
 * recalling Qdrant, etc. This separation keeps the builder a pure function
 * with no DB / IPC dependencies.
 *
 * Used by:
 *   - src/main/ipc/chat.ipc.ts (production path)
 *   - src/main/ipc/test-helpers.ipc.ts::test:get-system-prompt (E2E test path)
 */

export interface SystemPromptBlocks {
  library?: string | null
  semantic?: string | null
  profile?: string | null
  memory?: string | null
  custom?: string | null
  plan?: string | null
  skill?: string | null
}

export interface SystemPromptInput {
  /** The base system prompt (typically DEFAULT_SYSTEM_PROMPT). */
  base: string
  /** Optional XML blocks to inject. Null/undefined entries are skipped. */
  blocks: SystemPromptBlocks
}

export interface SystemPromptResult {
  /** Each block by name (for diagnostics and test assertions). null = absent. */
  blocks: Required<{ [K in keyof SystemPromptBlocks]: string | null }>
  /** The final concatenated string passed to streamText(). */
  final: string
}

/**
 * Concatenates the base prompt and the 7 optional blocks into a single string.
 * Order is fixed; null/undefined blocks are skipped.
 */
export function buildSystemPrompt(input: SystemPromptInput): SystemPromptResult {
  const blocks = {
    library: input.blocks.library ?? null,
    semantic: input.blocks.semantic ?? null,
    profile: input.blocks.profile ?? null,
    memory: input.blocks.memory ?? null,
    custom: input.blocks.custom ?? null,
    plan: input.blocks.plan ?? null,
    skill: input.blocks.skill ?? null,
  }

  let final = input.base

  const append = (block: string | null): void => {
    if (block) {
      if (final) final += '\n\n'
      final += block
    }
  }

  append(blocks.library)
  append(blocks.semantic)
  append(blocks.profile)
  append(blocks.memory)
  append(blocks.custom)
  append(blocks.plan)
  append(blocks.skill)

  return { blocks, final }
}
