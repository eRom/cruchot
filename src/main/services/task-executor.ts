import { BrowserWindow, Notification } from 'electron'
import { streamText, NoOutputGeneratedError } from 'ai'
import { getModel } from '../llm/router'
import { calculateMessageCost } from '../llm/cost-calculator'
import { classifyError } from '../llm/errors'
import { buildThinkingProviderOptions } from '../llm/thinking'
import { parseFileOperations } from '../llm/file-operations'
import { createMessage, getMessagesForConversation } from '../db/queries/messages'
import { createConversation, renameConversation, updateConversationModel, updateConversationRole } from '../db/queries/conversations'
import { getRole } from '../db/queries/roles'
import { updateTaskRunStatus, incrementRunCount, getScheduledTask } from '../db/queries/scheduled-tasks'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'

interface TaskExecutionResult {
  conversationId: string
  success: boolean
  error?: string
}

/**
 * Executes a scheduled task programmatically (without renderer interaction).
 * Creates a conversation, sends the prompt to the LLM, and saves everything.
 */
export async function executeScheduledTask(
  taskId: string,
  mainWindow: BrowserWindow | null
): Promise<TaskExecutionResult> {
  const task = getScheduledTask(taskId)
  if (!task) {
    return { conversationId: '', success: false, error: 'Task not found' }
  }

  const [providerId, modelId] = task.modelId.split('::')
  if (!providerId || !modelId) {
    return { conversationId: '', success: false, error: 'Invalid modelId format' }
  }

  let conversationId = ''

  try {
    // Create a new conversation for this execution
    const conv = createConversation(task.name, task.projectId ?? undefined)
    conversationId = conv.id

    // Rename with the task name
    renameConversation(conversationId, task.name)

    // Build system prompt from role if set
    let systemPrompt: string | undefined
    if (task.roleId) {
      const role = getRole(task.roleId)
      if (role?.systemPrompt) {
        systemPrompt = role.systemPrompt
      }
    }

    // Save user message (the task prompt)
    createMessage({
      conversationId,
      role: 'user',
      content: task.prompt,
      modelId,
      providerId
    })

    const model = getModel(providerId, modelId)
    const startTime = Date.now()

    // Build messages array
    const aiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

    if (systemPrompt) {
      aiMessages.push({ role: 'system', content: systemPrompt })
    }
    aiMessages.push({ role: 'user', content: task.prompt })

    // Load settings for temperature/maxTokens/topP
    const temperature = getSettingNumber('temperature')
    const maxTokens = getSettingNumber('maxTokens')
    const topP = getSettingNumber('topP')

    // Load thinking effort
    const thinkingEffort = getSettingString('thinkingEffort') as 'off' | 'low' | 'medium' | 'high' | undefined
    const providerOptions = thinkingEffort && thinkingEffort !== 'off'
      ? buildThinkingProviderOptions(providerId, thinkingEffort)
      : undefined

    // Forward chunks to renderer if window exists
    let accumulatedReasoning = ''

    const result = streamText({
      model,
      messages: aiMessages,
      temperature: temperature ?? undefined,
      maxTokens: maxTokens ?? undefined,
      topP: topP ?? undefined,
      providerOptions,
      onChunk({ chunk }) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (chunk.type === 'text-delta') {
            mainWindow.webContents.send('chat:chunk', {
              type: 'text-delta',
              content: chunk.text,
              conversationId
            })
          } else if (chunk.type === 'reasoning-delta') {
            accumulatedReasoning += chunk.text
            mainWindow.webContents.send('chat:chunk', {
              type: 'reasoning-delta',
              content: chunk.text,
              conversationId
            })
          }
        }
      }
    })

    // Consume the stream
    let fullText = ''
    try {
      fullText = await result.text
    } catch (e) {
      if (e instanceof NoOutputGeneratedError) {
        if (e.cause) throw e.cause
      } else {
        throw e
      }
    }

    const usage = await result.usage
    const responseTimeMs = Date.now() - startTime
    const tokensIn = usage?.inputTokens ?? 0
    const tokensOut = usage?.outputTokens ?? 0
    const cost = calculateMessageCost(modelId, tokensIn, tokensOut)

    // Parse file operations
    const fileOps = parseFileOperations(fullText)

    // Build contentData
    const contentData: Record<string, unknown> = {}
    if (accumulatedReasoning) contentData.reasoning = accumulatedReasoning
    if (fileOps.length > 0) contentData.fileOperations = fileOps.map(op => ({ ...op, status: 'pending' }))

    // Save assistant message
    createMessage({
      conversationId,
      role: 'assistant',
      content: fullText,
      modelId,
      providerId,
      tokensIn,
      tokensOut,
      cost,
      responseTimeMs,
      contentData: Object.keys(contentData).length > 0 ? contentData : undefined
    })

    // Update conversation metadata
    updateConversationModel(conversationId, task.modelId)
    if (task.roleId) {
      updateConversationRole(conversationId, task.roleId)
    }

    // Update task status
    updateTaskRunStatus(taskId, 'success', undefined, conversationId)
    incrementRunCount(taskId)

    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('task:executed', {
        taskId,
        conversationId,
        success: true
      })
    }

    // Electron notification
    new Notification({
      title: `Tache executee : ${task.name}`,
      body: 'Execution reussie'
    }).show()

    return { conversationId, success: true }

  } catch (error: unknown) {
    const classified = classifyError(error)
    const errorMsg = classified.message

    console.error(`[TaskExecutor] Error executing task ${taskId}:`, error)

    // Update task status
    updateTaskRunStatus(taskId, 'error', errorMsg, conversationId || undefined)
    incrementRunCount(taskId)

    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('task:executed', {
        taskId,
        conversationId,
        success: false,
        error: errorMsg
      })
    }

    // Electron notification
    new Notification({
      title: `Tache echouee : ${task.name}`,
      body: `Erreur : ${errorMsg}`
    }).show()

    return { conversationId, success: false, error: errorMsg }
  }
}

// ── Helpers ─────────────────────────────────────────────────

function getSettingNumber(key: string): number | null {
  try {
    const db = getDatabase()
    const row = db.select().from(settings).where(eq(settings.key, key)).get()
    if (row?.value) {
      const num = parseFloat(row.value)
      return isNaN(num) ? null : num
    }
  } catch { /* silent */ }
  return null
}

function getSettingString(key: string): string | null {
  try {
    const db = getDatabase()
    const row = db.select().from(settings).where(eq(settings.key, key)).get()
    return row?.value ?? null
  } catch { /* silent */ }
  return null
}
