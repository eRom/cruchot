import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import { generateText } from 'ai'
import { GitService } from '../services/git.service'
import { getActiveWorkspaceRoot } from './workspace.ipc'
import { getModel } from '../llm/router'
import { calculateMessageCost } from '../llm/cost-calculator'

// ── Module state ──────────────────────────────────────────
let gitService: GitService | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function getGitService(): GitService | null {
  const root = getActiveWorkspaceRoot()
  if (!root) {
    gitService = null
    return null
  }
  if (!gitService || (gitService as GitService & { rootPath: string }).rootPath !== root) {
    gitService = new GitService(root)
  }
  return gitService
}

/** Called by workspace.ipc when files change — debounces git:changed push */
export function onWorkspaceFileChanged(win: BrowserWindow): void {
  const svc = getGitService()
  if (!svc || !svc.isGitRepo()) return

  svc.invalidateCache()

  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(async () => {
    try {
      const info = await svc.getInfo()
      if (!win.isDestroyed()) {
        win.webContents.send('git:changed', info)
      }
    } catch {
      // ignore
    }
  }, 500)
}

/** Reset git service when workspace closes */
export function resetGitService(): void {
  gitService = null
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

// ── System prompt for AI commit message ───────────────────
const COMMIT_PROMPT = `Tu generes des messages de commit Git concis.
Format: type(scope): description (max 72 chars)
Types: feat, fix, refactor, style, docs, test, chore, perf
Description en anglais, minuscule apres le type, pas de point final.
Si changements importants, ajoute un corps apres une ligne vide.`

export function registerGitIpc(): void {
  // ── git:getInfo ─────────────────────────────────────────
  ipcMain.handle('git:getInfo', async () => {
    const svc = getGitService()
    if (!svc) return null
    return svc.getInfo()
  })

  // ── git:getStatus ───────────────────────────────────────
  ipcMain.handle('git:getStatus', async () => {
    const svc = getGitService()
    if (!svc) return []
    return svc.getStatus()
  })

  // ── git:getDiff ─────────────────────────────────────────
  ipcMain.handle('git:getDiff', async (_event, payload: unknown) => {
    const schema = z.object({
      path: z.string().optional(),
      staged: z.boolean().optional()
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid git:getDiff payload')

    const svc = getGitService()
    if (!svc) return ''
    return svc.getDiff(parsed.data.path, parsed.data.staged)
  })

  // ── git:stageFiles ──────────────────────────────────────
  ipcMain.handle('git:stageFiles', async (_event, payload: unknown) => {
    const schema = z.object({
      paths: z.array(z.string().min(1)).min(1)
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid git:stageFiles payload')

    const svc = getGitService()
    if (!svc) throw new Error('No workspace open')
    await svc.stageFiles(parsed.data.paths)
  })

  // ── git:stageAll ────────────────────────────────────────
  ipcMain.handle('git:stageAll', async () => {
    const svc = getGitService()
    if (!svc) throw new Error('No workspace open')
    await svc.stageAll()
  })

  // ── git:unstageFiles ────────────────────────────────────
  ipcMain.handle('git:unstageFiles', async (_event, payload: unknown) => {
    const schema = z.object({
      paths: z.array(z.string().min(1)).min(1)
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid git:unstageFiles payload')

    const svc = getGitService()
    if (!svc) throw new Error('No workspace open')
    await svc.unstageFiles(parsed.data.paths)
  })

  // ── git:commit ──────────────────────────────────────────
  ipcMain.handle('git:commit', async (_event, payload: unknown) => {
    const schema = z.object({
      message: z.string().min(1).max(5000)
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid git:commit payload')

    const svc = getGitService()
    if (!svc) throw new Error('No workspace open')
    const hash = await svc.commit(parsed.data.message)
    return { hash }
  })

  // ── git:generateCommitMessage ───────────────────────────
  ipcMain.handle('git:generateCommitMessage', async (_event, payload: unknown) => {
    const schema = z.object({
      providerId: z.string().min(1),
      modelId: z.string().min(1)
    })
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new Error('Invalid git:generateCommitMessage payload')

    const svc = getGitService()
    if (!svc) throw new Error('No workspace open')

    // Get staged diff first, fallback to unstaged
    let diff = await svc.getDiff(undefined, true)
    if (!diff.trim()) {
      diff = await svc.getDiff()
    }
    if (!diff.trim()) {
      throw new Error('Aucun changement a committer')
    }

    // Truncate large diffs
    if (diff.length > 20_000) {
      diff = diff.slice(0, 20_000) + '\n\n... (diff tronque)'
    }

    const { providerId, modelId } = parsed.data
    const model = getModel(providerId, modelId)

    const result = await generateText({
      model,
      messages: [
        { role: 'system', content: COMMIT_PROMPT },
        { role: 'user', content: `Diff:\n\n${diff}` }
      ],
      maxTokens: 500,
      temperature: 0.3
    })

    const text = result.text.trim()
    const usage = await result.usage
    const cost = calculateMessageCost(
      modelId,
      usage?.inputTokens ?? 0,
      usage?.outputTokens ?? 0
    )

    return { message: text, cost }
  })

  console.log('[IPC] Git handlers registered')
}
