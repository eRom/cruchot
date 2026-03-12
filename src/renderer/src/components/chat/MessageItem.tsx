import { FileOperationCard } from '@/components/workspace/FileOperationCard'
import { cn } from '@/lib/utils'
import type { Message, ToolCallDisplay } from '@/stores/messages.store'
import { useMessagesStore } from '@/stores/messages.store'
import { Brain, Check, CheckCircle2, ChevronDown, ChevronRight, Copy, File as FileIcon, FileText, FolderSearch, Image as ImageIcon, Loader2, Network, Pencil, Search, Sparkles, Terminal, Wrench, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileOperation } from '../../../../preload/types'
import { AudioPlayer } from './AudioPlayer'
import { MessageContent } from './MessageContent'
import { PerplexitySources, type PerplexitySource } from './PerplexitySources'

interface MessageItemProps {
  message: Message
  isStreaming?: boolean
}

/** Format response time for display */
function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Format cost for display */
function formatCost(cost: number): string {
  if (cost < 0.001) return '<$0.001'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(3)}`
}

/** Format token counts */
function formatTokens(tokensIn?: number, tokensOut?: number): string | null {
  if (!tokensIn && !tokensOut) return null
  const parts: string[] = []
  if (tokensIn) parts.push(`${tokensIn.toLocaleString()} in`)
  if (tokensOut) parts.push(`${tokensOut.toLocaleString()} out`)
  return parts.join(' / ')
}

/** Humanized provider name */
function providerLabel(providerId?: string, modelId?: string): string | null {
  if (!modelId) return null
  const model = modelId.split('/').pop() ?? modelId
  if (providerId) {
    const provider = providerId.charAt(0).toUpperCase() + providerId.slice(1)
    return `${provider} - ${model}`
  }
  return model
}

/** Collapsible reasoning/thinking block */
function ReasoningBlock({ reasoning, isStreaming }: { reasoning: string; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(isStreaming)
  const prevStreaming = useRef(isStreaming)

  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      setExpanded(false)
    }
    prevStreaming.current = isStreaming
  }, [isStreaming])

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isStreaming ? (
          <Brain className="size-3.5 animate-pulse" />
        ) : expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        <span>{isStreaming ? 'Reflexion en cours...' : 'Reflexion'}</span>
      </button>
      {(expanded || isStreaming) && (
        <div className="mt-1.5 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {reasoning}
          {isStreaming && (
            <span className="inline-flex ml-0.5 gap-[2px] align-middle">
              <span className="size-1 animate-pulse rounded-full bg-muted-foreground/50" style={{ animationDelay: '0ms' }} />
              <span className="size-1 animate-pulse rounded-full bg-muted-foreground/50" style={{ animationDelay: '150ms' }} />
              <span className="size-1 animate-pulse rounded-full bg-muted-foreground/50" style={{ animationDelay: '300ms' }} />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Icon + label mapping for workspace tools */
const TOOL_CONFIG: Record<string, { icon: typeof FileText; label: string }> = {
  bash: { icon: Terminal, label: 'Commande shell' },
  readFile: { icon: FileText, label: 'Lecture du fichier' },
  writeFile: { icon: Pencil, label: 'Ecriture du fichier' },
  listFiles: { icon: FolderSearch, label: 'Exploration des fichiers' },
  searchInFiles: { icon: Search, label: 'Recherche dans les fichiers' },
  search: { icon: Search, label: 'Recherche web' }
}

/** Resolve tool config — handles MCP prefixed tools (e.g. github__create_issue) */
function getToolConfig(toolName: string): { icon: typeof FileText; label: string } {
  if (TOOL_CONFIG[toolName]) return TOOL_CONFIG[toolName]
  // MCP tools: "prefix__name" → Network icon + readable label
  const mcpMatch = toolName.match(/^([^_]+)__(.+)$/)
  if (mcpMatch) {
    return { icon: Network, label: `[${mcpMatch[1]}] ${mcpMatch[2]}` }
  }
  return { icon: Wrench, label: toolName }
}

/** Collapsible block showing tool calls with status */
function ToolCallBlock({ toolCalls, isStreaming }: { toolCalls: ToolCallDisplay[]; isStreaming: boolean }) {
  const [expanded, setExpanded] = useState(isStreaming)
  const hasRunning = toolCalls.some(tc => tc.status === 'running')
  const prevRunning = useRef(hasRunning || isStreaming)

  useEffect(() => {
    const wasActive = prevRunning.current
    const isActive = hasRunning || isStreaming
    if (wasActive && !isActive) {
      setExpanded(false)
    }
    prevRunning.current = isActive
  }, [hasRunning, isStreaming])
  const allSuccess = !hasRunning && toolCalls.every(tc => tc.status === 'success')
  const hasError = toolCalls.some(tc => tc.status === 'error')

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
      >
        {hasRunning ? (
          <Wrench className="size-3.5 animate-pulse" />
        ) : expanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        <span>
          {hasRunning
            ? `Utilisation d'outils...`
            : `${toolCalls.length} outil${toolCalls.length > 1 ? 's' : ''} utilise${toolCalls.length > 1 ? 's' : ''}`}
        </span>
        {!hasRunning && (
          allSuccess
            ? <CheckCircle2 className="size-3 text-emerald-500" />
            : hasError
              ? <XCircle className="size-3 text-red-500" />
              : null
        )}
      </button>
      {(expanded || hasRunning) && (
        <div className="mt-1.5 rounded-lg border border-cyan-200/40 dark:border-cyan-500/20 bg-cyan-50/50 dark:bg-cyan-950/20 px-3 py-2 space-y-1">
          {toolCalls.map((tc, i) => {
            const config = getToolConfig(tc.toolName)
            const Icon = config.icon
            const detail = tc.args?.command || tc.args?.path || tc.args?.query || ''

            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                {tc.status === 'running' ? (
                  <Loader2 className="size-3 shrink-0 animate-spin text-cyan-500" />
                ) : tc.status === 'success' ? (
                  <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
                ) : (
                  <XCircle className="size-3 shrink-0 text-red-500" />
                )}
                <Icon className="size-3 shrink-0 text-muted-foreground/60" />
                <span className="text-muted-foreground">
                  {config.label}
                  {detail ? <span className="text-foreground/70 ml-1">{String(detail)}</span> : null}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Format file size for display */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Check if a file exists by trying to load it (for image thumbnails) */
const IMAGE_MIME_SET = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

/** Display attachments on a user message */
function MessageAttachments({ attachments }: { attachments: Array<{ path: string; name: string; size: number; type: string; mimeType: string }> }) {
  if (!attachments || attachments.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((att, i) => {
        const isImage = IMAGE_MIME_SET.has(att.mimeType)

        return (
          <div
            key={`${att.name}-${i}`}
            className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5"
          >
            {isImage ? (
              <img
                src={`local-image://${att.path}`}
                alt={att.name}
                className="size-10 shrink-0 rounded object-cover"
                onError={(e) => {
                  // File deleted — show fallback icon
                  const target = e.currentTarget
                  target.style.display = 'none'
                  target.nextElementSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            {isImage && (
              <div className="hidden size-10 shrink-0 items-center justify-center rounded bg-white/10">
                <ImageIcon className="size-4 text-white/50" />
              </div>
            )}
            {!isImage && (
              <div className="flex size-10 shrink-0 items-center justify-center rounded bg-white/10">
                <FileIcon className="size-4 text-white/70" />
              </div>
            )}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium text-white/90 max-w-[120px]">{att.name}</span>
              <span className="text-[10px] text-white/50">{formatFileSize(att.size)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * A single chat message — user or assistant.
 *
 * Design direction: refined, warm, conversational. User bubbles float right
 * with a soft blue accent. Assistant messages sit left with a subtle card
 * background, an AI avatar, and metadata underneath.
 */
function MessageItem({ message, isStreaming = false }: MessageItemProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }, [message.content])

  const label = providerLabel(message.providerId, message.modelId)
  const tokens = formatTokens(message.tokensIn, message.tokensOut)
  const fileOperations = (message.contentData?.fileOperations as FileOperation[] | undefined) ?? []
  const searchSources = (message.contentData?.searchSources as PerplexitySource[] | undefined) ?? []

  return (
    <div
      className={cn(
        'group flex w-full gap-3 px-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground ring-1 ring-border/30">
          <Sparkles className="size-4" />
        </div>
      )}

      {/* Message bubble (user) / full-width block (assistant) */}
      <div
        className={cn(
          'relative',
          isUser
            ? 'max-w-[75%] rounded-2xl px-4 py-3 bg-sidebar text-sidebar-foreground shadow-sm'
            : 'flex-1 min-w-0 py-2 text-foreground' 
        )}
      >
        {/* Processing phase — spinner before any content arrives, or tool call feedback */}
        {isStreaming && message.streamPhase === 'processing' && (
          <div className="flex items-center gap-2 py-1 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">{message.toolCall || 'Traitement en cours...'}</span>
          </div>
        )}

        {/* Reasoning block — collapsible thinking phase */}
        {typeof message.reasoning === 'string' && message.reasoning.length > 0 && (
          <ReasoningBlock reasoning={message.reasoning} isStreaming={isStreaming && message.streamPhase === 'reasoning'} />
        )}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallBlock toolCalls={message.toolCalls} isStreaming={isStreaming} />
        )}

        {/* Slash command badge */}
        {isUser && message.contentData?.slashCommand && (
          <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400 font-mono">
            /{message.contentData.slashCommand as string}
          </span>
        )}

        {/* Content */}
        {message.contentData && message.contentData.type === 'image' ? (
          <div className="flex flex-col gap-2">
            <img
              src={
                message.contentData.path
                  ? `local-image://${message.contentData.path}`
                  : message.contentData.base64
                    ? `data:image/png;base64,${message.contentData.base64}`
                    : undefined
              }
              alt={message.content}
              className="max-w-full rounded-lg"
            />
            <p className="text-xs text-muted-foreground/70 italic">{message.content}</p>
          </div>
        ) : message.content ? (
          <MessageContent content={message.content} role={message.role} />
        ) : null}

        {/* Attached files on user messages */}
        {isUser && message.contentData?.attachments && (
          <MessageAttachments
            attachments={message.contentData.attachments as Array<{ path: string; name: string; size: number; type: string; mimeType: string }>}
          />
        )}

        {/* File operations proposed by LLM */}
        {!isUser && fileOperations.map((op: FileOperation) => (
          <FileOperationCard
            key={op.id}
            operation={op}
            onApprove={async (operation) => {
              try {
                if (operation.type === 'delete') {
                  await window.api.workspaceDeleteFile(operation.path)
                } else if (operation.content) {
                  await window.api.workspaceWriteFile({ path: operation.path, content: operation.content })
                }
                // Update status via store
                const ops = (message.contentData?.fileOperations as FileOperation[]) || []
                const updated = ops.map((o: FileOperation) => o.id === operation.id ? { ...o, status: 'approved' as const } : o)
                useMessagesStore.getState().updateMessage(message.id, {
                  contentData: { ...message.contentData, fileOperations: updated }
                })
              } catch (err) {
                console.error('[FileOp] Apply failed:', err)
              }
            }}
            onReject={(operation) => {
              const ops = (message.contentData?.fileOperations as FileOperation[]) || []
              const updated = ops.map((o: FileOperation) => o.id === operation.id ? { ...o, status: 'rejected' as const } : o)
              useMessagesStore.getState().updateMessage(message.id, {
                contentData: { ...message.contentData, fileOperations: updated }
              })
            }}
          />
        ))}

        {/* Perplexity search sources */}
        {!isUser && searchSources.length > 0 && (
          <PerplexitySources sources={searchSources} />
        )}

        {/* Streaming indicator — generating phase */}
        {isStreaming && message.streamPhase === 'generating' && (
          <span className="mt-1 inline-flex gap-[3px]">
            <span className="size-1.5 animate-pulse rounded-full bg-current opacity-40" style={{ animationDelay: '0ms' }} />
            <span className="size-1.5 animate-pulse rounded-full bg-current opacity-40" style={{ animationDelay: '150ms' }} />
            <span className="size-1.5 animate-pulse rounded-full bg-current opacity-40" style={{ animationDelay: '300ms' }} />
          </span>
        )}

        {/* User copy button — appears on hover */}
        {isUser && !isStreaming && message.content.length > 0 && (
          <button
            onClick={handleCopy}
            title={copied ? 'Copié !' : 'Copier'}
            className={cn(
              'absolute -bottom-3 right-2 flex size-6 items-center justify-center rounded-md opacity-0 transition-all group-hover:opacity-100',
              'bg-sidebar-accent text-sidebar-foreground/70 hover:bg-sidebar-accent/80 hover:text-sidebar-foreground'
            )}
            aria-label="Copier le message"
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
        )}

        {/* Assistant footer — actions left, model info right */}
        {!isUser && !isStreaming && message.content.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/20 pt-2">
            {/* Left — actions */}
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {/* TTS — not for image messages */}
              {message.contentData?.type !== 'image' && (
                <AudioPlayer text={message.content} messageId={message.id} compact />
              )}
              <button
                onClick={handleCopy}
                title={copied ? 'Copié !' : 'Copier'}
                className={cn(
                  'flex size-6 items-center justify-center rounded-md',
                  'text-muted-foreground/60 hover:bg-accent hover:text-accent-foreground',
                  'transition-colors'
                )}
                aria-label="Copier le message"
              >
                {copied ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>

            {/* Right — model info + cost */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
              {label && (
                <span className="font-medium">{label}</span>
              )}
              {message.responseTimeMs != null && (
                <span>{formatTime(message.responseTimeMs)}</span>
              )}
              {tokens && (
                <span>{tokens}</span>
              )}
              {message.cost != null && message.cost > 0 && (
                <span className="font-medium text-muted-foreground/60">{formatCost(message.cost)}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageItem
