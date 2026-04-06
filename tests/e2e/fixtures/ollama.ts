// tests/e2e/fixtures/ollama.ts
//
// Ollama health helpers for E2E flow specs.
//
// These helpers are LOCAL-ONLY. In CI, the flow specs run against
// gemini-2.5-flash via the Google provider, and Ollama is not installed.
// The helpers detect this and skip gracefully.
//
// Usage in a spec:
//   import { assertOllamaReady, warmUpModel } from '../fixtures/ollama'
//   test.beforeAll(async () => {
//     await assertOllamaReady('qwen3.5:4b')
//     await warmUpModel('qwen3.5:4b')
//   })

const OLLAMA_BASE_URL = process.env.OLLAMA_HOST ?? 'http://localhost:11434'

export function isOllamaSkipped(): boolean {
  // CI overrides the provider to google → Ollama isn't needed.
  return process.env.CI === '1' || process.env.CRUCHOT_TEST_PROVIDER === 'google'
}

/**
 * Asserts that Ollama is reachable and the requested model is available.
 * Throws a clear error message if either check fails.
 *
 * No-op when CI/google provider is set (the spec uses gemini in that case).
 */
export async function assertOllamaReady(model: string): Promise<void> {
  if (isOllamaSkipped()) return

  // 1. Ping the API
  let tagsResp: Response
  try {
    tagsResp = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(
      `[ollama] Cannot reach Ollama at ${OLLAMA_BASE_URL}/api/tags: ${reason}\n` +
      `  → Run \`ollama serve\` in another terminal, or set OLLAMA_HOST.`
    )
  }

  if (!tagsResp.ok) {
    throw new Error(
      `[ollama] /api/tags returned ${tagsResp.status} ${tagsResp.statusText}`
    )
  }

  const data = (await tagsResp.json()) as { models?: { name: string }[] }
  const installed = (data.models ?? []).map((m) => m.name)
  if (!installed.includes(model)) {
    throw new Error(
      `[ollama] Model "${model}" is not installed.\n` +
      `  Installed: ${installed.join(', ') || '(none)'}\n` +
      `  → Run: ollama pull ${model}`
    )
  }
}

/**
 * Warm-up call: forces Ollama to load the model into memory by sending
 * a tiny generation request. This avoids cold-start timeouts in the
 * actual test (a 4B model takes ~5-10s to load on first invocation).
 *
 * No-op when CI/google provider is set.
 */
export async function warmUpModel(model: string): Promise<void> {
  if (isOllamaSkipped()) return

  try {
    await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'hi',
        stream: false,
        options: { num_predict: 1 },
      }),
      signal: AbortSignal.timeout(60_000), // cold load can be slow
    })
  } catch (err) {
    // Warm-up is best-effort; the actual test will surface any real issue.
    const reason = err instanceof Error ? err.message : String(err)
    console.warn(`[ollama] warm-up failed (will retry in test): ${reason}`)
  }
}
