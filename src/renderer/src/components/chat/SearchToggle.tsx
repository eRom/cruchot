import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSettingsStore } from '@/stores/settings.store'
import { cn } from '@/lib/utils'

interface SearchToggleProps {
  disabled?: boolean
}

export function SearchToggle({ disabled }: SearchToggleProps) {
  const searchEnabled = useSettingsStore((s) => s.searchEnabled) ?? false
  const setSearchEnabled = useSettingsStore((s) => s.setSearchEnabled)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSearchEnabled(!searchEnabled)}
          disabled={disabled}
          className={cn(
            'h-7 gap-1 rounded-lg px-2 text-xs font-medium transition-colors',
            searchEnabled
              ? 'bg-violet-500/10 text-violet-600 hover:bg-violet-500/20 dark:text-violet-400 dark:hover:bg-violet-500/20'
              : 'text-muted-foreground/60 hover:text-muted-foreground'
          )}
        >
          <Search className="size-3.5" />
          {searchEnabled && <span className="hidden sm:inline">Search</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {searchEnabled ? 'Recherche web activee' : 'Activer la recherche web (Perplexity)'}
      </TooltipContent>
    </Tooltip>
  )
}
