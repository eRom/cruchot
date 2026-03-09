import React, { memo, useCallback } from 'react'
import { Bot, Sparkles, Brain, Cpu, Globe, Zap, Cloud } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Conversation } from '@/stores/conversations.store'

/**
 * Maps a modelId prefix to a Lucide icon for visual identification.
 * Keeps the sidebar scannable without text labels in collapsed mode.
 */
const PROVIDER_ICONS: Record<string, typeof Bot> = {
  openai: Sparkles,
  anthropic: Brain,
  google: Globe,
  mistral: Zap,
  xai: Cpu,
  openrouter: Cloud,
  perplexity: Globe,
  ollama: Cpu,
  lmstudio: Cpu
}

function getProviderIcon(modelId?: string): typeof Bot {
  if (!modelId) return Bot
  const provider = Object.keys(PROVIDER_ICONS).find((key) => modelId.toLowerCase().includes(key))
  return provider ? PROVIDER_ICONS[provider] : Bot
}

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  isCollapsed: boolean
  onSelect: (id: string) => void
}

function ConversationItemBase({
  conversation,
  isActive,
  isCollapsed,
  onSelect
}: ConversationItemProps): React.JSX.Element {
  const Icon = getProviderIcon(conversation.modelId)

  const handleClick = useCallback(() => {
    onSelect(conversation.id)
  }, [onSelect, conversation.id])

  const item = (
    <button
      onClick={handleClick}
      className={cn(
        'group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
        'transition-colors duration-150 ease-out',
        'outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        isCollapsed && 'justify-center px-0'
      )}
    >
      <Icon
        className={cn(
          'shrink-0 transition-colors duration-150',
          isActive
            ? 'text-sidebar-primary'
            : 'text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60',
          isCollapsed ? 'size-4.5' : 'size-4'
        )}
      />
      {!isCollapsed && (
        <span className="truncate text-[13px] leading-tight font-medium">
          {conversation.title}
        </span>
      )}
    </button>
  )

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{item}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {conversation.title}
        </TooltipContent>
      </Tooltip>
    )
  }

  return item
}

export const ConversationItem = memo(ConversationItemBase)
