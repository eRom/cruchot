// tests/e2e/flows/06-export-import-mlx.spec.ts
//
// Phase 2b1 spec — bulk export and re-import as encrypted .mlx.
//
// Scenario:
//   1. Create a conversation via the sidebar (so seedDefaultModel +
//      useInitApp wiring is in place).
//   2. Seed 3 messages (2 user + 1 assistant) via test:seed-messages —
//      no LLM call required.
//   3. Stub showSaveDialog → /tmp/cruchot-test-export-<ts>.mlx.
//   4. Trigger window.api.exportBulk() — the main process writes the
//      encrypted blob to disk via the stubbed filePath.
//   5. Assert the .mlx file exists and has the expected encryption
//      header layout: [IV(12)][AuthTag(16)][Ciphertext(N)] → minimum
//      29 bytes (28 header + 1 byte ciphertext, in practice much more).
//   6. Stub showOpenDialog → same /tmp path.
//   7. Trigger window.api.importBulk() — the main process reads the file,
//      decrypts it with the local instance token (same userData dir →
//      same token, so the local-token branch hits on the first try and
//      no external token is needed), and re-imports projects /
//      conversations / messages into the DB.
//   8. Assert: 2 conversations now exist, total messages count >= 6
//      (3 original + 3 re-imported).
//
// ── Why .mlx is NOT a ZIP ──────────────────────────────────────────────
// The original Phase 2b1 plan called for asserting `PK\x03\x04` ZIP
// magic bytes. Reading bulk-export.service.ts:90-99 shows the actual
// format is AES-256-GCM:
//
//   Buffer.concat([iv (12 bytes), authTag (16 bytes), ciphertext (N)])
//
// There are no fixed magic bytes — the IV is random per export. So
// instead of asserting on the first 4 bytes, we assert:
//   - file exists
//   - file size >= 29 bytes (28 header + at least 1 ciphertext byte)
//   - the file successfully round-trips through importBulk() and
//     produces a new conversation with messages, which is the strongest
//     possible proof that the bytes on disk are a valid encrypted .mlx
//     payload (decryption + Zod schema validation + DB insert all
//     succeed).
//
// ── Why bulk and not single-conversation export ────────────────────────
// The single-conversation path (export:conversation) writes md/json/txt/
// html — none of those are .mlx. The .mlx format is only produced by
// export:bulk, which exports the WHOLE database. For a single-conv
// fixture with 3 seeded messages, bulk and single are functionally
// equivalent, but only bulk produces the encrypted .mlx artifact the
// task description targets.
//
// ── Side-effects-only discipline ───────────────────────────────────────
// We never inspect message content order or text. We assert on:
//   - file existence + minimum size
//   - row counts (conversations, messages)
// That's enough to prove the round-trip works without coupling the
// spec to schema details that might evolve.

import path from 'path'
import { existsSync, statSync, unlinkSync } from 'fs'
import { stubDialog } from 'electron-playwright-helpers'
import {
  test,
  expect,
  TEST_MODEL_ID,
  seedDefaultModel,
} from '../fixtures/flow-fixtures'

test.describe('export / import .mlx (bulk round-trip)', () => {
  let exportPath: string

  test.beforeEach(() => {
    // Unique filename per test run prevents collisions if a previous run
    // crashed without cleaning up. /tmp keeps the path short and inside
    // an always-readable root.
    exportPath = path.join('/tmp', `cruchot-test-export-${Date.now()}.mlx`)
  })

  test.afterEach(() => {
    if (existsSync(exportPath)) {
      try {
        unlinkSync(exportPath)
      } catch {
        // Best-effort cleanup; the next test gets a unique name anyway.
      }
    }
  })

  // No LLM call in this spec — only DB writes, file I/O, and IPC. 60s
  // is generous for the boot + roundtrip.
  test.setTimeout(60_000)

  test('export then re-import preserves the conversation', async ({
    window: page,
    electronApp,
    dbHelper,
  }) => {
    // ── Step 0: boot the app with a default model ──
    // Required so the sidebar "New conversation" button is wired up
    // correctly by useInitApp. Same plumbing as the other flow specs.
    await seedDefaultModel(page, TEST_MODEL_ID)

    // Sanity: the test starts on a fresh DB
    expect(await dbHelper.count('conversations')).toBe(0)
    expect(await dbHelper.count('messages')).toBe(0)

    // ── Step 1: create a conversation via the sidebar ──
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

    // ── Step 2: seed 3 messages (2 user + 1 assistant) ──
    // test:seed-messages is keyed by role; we call it twice. The handler
    // skips the LLM entirely and just inserts rows via createMessage().
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
                }) => Promise<unknown>
              }
            }
          }
        ).api
        if (!api.test) {
          throw new Error(
            'window.api.test is undefined — TEST_MODE may not be enabled'
          )
        }
        await api.test.seedMessages({
          conversationId: id,
          count: 2,
          role: 'user',
        })
        await api.test.seedMessages({
          conversationId: id,
          count: 1,
          role: 'assistant',
        })
      },
      conv.id
    )

    expect(
      await dbHelper.count(`messages WHERE conversation_id = '${conv.id}'`)
    ).toBe(3)

    // ── Step 3: stub showSaveDialog so exportBulk writes to our path ──
    // export.ipc.ts:63 calls dialog.showSaveDialog with a real BrowserWindow,
    // and stubDialog from electron-playwright-helpers intercepts the
    // ipcMain channel that backs all dialog.show* calls. Verified by
    // tests/e2e/security/dialogs.spec.ts.
    await stubDialog(electronApp, 'showSaveDialog', {
      canceled: false,
      filePath: exportPath,
    })

    // ── Step 4: trigger the bulk export via the IPC ──
    // exportBulk() returns { exported: true, filePath } on success.
    // We bypass the UI button and call the IPC directly to keep the
    // spec focused on the export/import logic, not on the settings page
    // navigation.
    const exportResult = await page.evaluate(async () => {
      return (
        window as {
          api: {
            exportBulk: () => Promise<{ exported: boolean; filePath?: string }>
          }
        }
      ).api.exportBulk()
    })

    expect(exportResult.exported).toBe(true)
    expect(exportResult.filePath).toBe(exportPath)

    // ── Step 5: assert the .mlx file exists and has the encryption header ──
    // Format: [IV(12)][AuthTag(16)][Ciphertext(N)] — minimum 29 bytes.
    // In practice, the JSON payload of even an empty export is well over
    // 100 bytes after encryption, so we just sanity-check > 28.
    expect(existsSync(exportPath)).toBe(true)
    const stat = statSync(exportPath)
    expect(stat.size).toBeGreaterThan(28)

    // ── Step 6: stub showOpenDialog so importBulk reads our path ──
    await stubDialog(electronApp, 'showOpenDialog', {
      canceled: false,
      filePaths: [exportPath],
    })

    // ── Step 7: trigger the bulk import via the IPC ──
    // import.ipc.ts:74 first tries tryDecryptWithLocalToken — since this
    // is the same userData dir as the export (single test, single Electron
    // process), the instance token in the DB is identical and decryption
    // succeeds on the first try. No external token prompt.
    const importResult = await page.evaluate(async () => {
      return (
        window as {
          api: {
            importBulk: () => Promise<{
              imported: boolean
              projectsImported?: number
              conversationsImported?: number
              messagesImported?: number
              needsToken?: boolean
            }>
          }
        }
      ).api.importBulk()
    })

    expect(importResult.imported).toBe(true)
    expect(importResult.needsToken).toBeUndefined()
    expect(importResult.conversationsImported).toBe(1)
    expect(importResult.messagesImported).toBe(3)

    // ── Step 8: assert the import created a second conversation ──
    // The original conv is still there + a new one from the import.
    // Total messages = 3 (original) + 3 (re-imported) = 6.
    await dbHelper.waitFor(
      () => dbHelper.count('conversations'),
      (n) => n === 2,
      { timeout: 5_000 }
    )
    expect(await dbHelper.count('conversations')).toBe(2)
    expect(await dbHelper.count('messages')).toBe(6)
  })
})
