import { useState } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'

interface CollapsibleSectionProps {
  title: string
  icon: LucideIcon
  defaultOpen?: boolean
  children: React.ReactNode
}

export function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border/40">
      <button
        type="button"
        className="flex w-full items-center gap-2 p-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Icon className="size-4" />
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown
          className={`size-4 transition-transform ${isOpen ? '' : '-rotate-90'}`}
        />
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}
