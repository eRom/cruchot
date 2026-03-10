import { Brain } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSettingsStore, type ThinkingEffort } from '@/stores/settings.store'
import { cn } from '@/lib/utils'

export interface ThinkingSelectorProps {
  disabled?: boolean
  className?: string
}

const EFFORT_LABELS: Record<ThinkingEffort, string> = {
  off: 'Off',
  low: 'Faible',
  medium: 'Moyen',
  high: 'Eleve'
}

export function ThinkingSelector({ disabled = false, className }: ThinkingSelectorProps) {
  const thinkingEffort = useSettingsStore((s) => s.thinkingEffort)
  const setThinkingEffort = useSettingsStore((s) => s.setThinkingEffort)

  const isActive = thinkingEffort !== 'off'

  return (
    <Select
      value={thinkingEffort}
      onValueChange={(v) => setThinkingEffort(v as ThinkingEffort)}
      disabled={disabled}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <SelectTrigger
            size="sm"
            className={cn(
              'h-7 w-auto max-w-[160px] gap-1.5 rounded-full border-none px-2.5',
              'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              'transition-all duration-200 ease-out',
              'focus-visible:ring-1 focus-visible:ring-ring/30',
              'shadow-none hover:shadow-xs',
              isActive && 'bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 dark:text-violet-400',
              className
            )}
          >
            <Brain className={cn('size-3 shrink-0', isActive ? 'opacity-80' : 'opacity-60')} />
            <SelectValue>
              <span className="truncate text-xs font-medium">
                {EFFORT_LABELS[thinkingEffort]}
              </span>
            </SelectValue>
          </SelectTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Effort de reflexion
        </TooltipContent>
      </Tooltip>

      <SelectContent
        position="popper"
        side="top"
        align="start"
        sideOffset={8}
        className={cn(
          'min-w-[140px]',
          'border-border/50 bg-popover/95 backdrop-blur-xl',
          'shadow-lg shadow-black/10 dark:shadow-black/30'
        )}
      >
        <SelectItem value="off">Off</SelectItem>
        <SelectItem value="low">Faible</SelectItem>
        <SelectItem value="medium">Moyen</SelectItem>
        <SelectItem value="high">Eleve</SelectItem>
      </SelectContent>
    </Select>
  )
}
