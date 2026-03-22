import { useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  icon?: LucideIcon
  defaultOpen?: boolean
  children: ReactNode
}

export function CollapsibleSection({ title, icon: Icon, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-border/40 bg-card/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors"
      >
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 ${
            isOpen ? '' : '-rotate-90'
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-3.5 pb-3">
          {children}
        </div>
      )}
    </div>
  )
}
