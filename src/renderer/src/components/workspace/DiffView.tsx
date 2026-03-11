import { cn } from '@/lib/utils'

interface DiffViewProps {
  diff: string
}

export function DiffView({ diff }: DiffViewProps) {
  if (!diff.trim()) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground/50">
        Aucune difference
      </div>
    )
  }

  const lines = diff.split('\n')

  return (
    <div className="flex-1 overflow-auto">
      <pre className="p-3 text-[12px] leading-5 font-mono">
        {lines.map((line, i) => {
          let lineClass = 'text-foreground/80'
          let bgClass = ''

          if (line.startsWith('+++') || line.startsWith('---')) {
            lineClass = 'text-muted-foreground font-medium'
          } else if (line.startsWith('@@')) {
            lineClass = 'text-blue-400'
            bgClass = 'bg-blue-500/10'
          } else if (line.startsWith('+')) {
            lineClass = 'text-emerald-400'
            bgClass = 'bg-emerald-500/10'
          } else if (line.startsWith('-')) {
            lineClass = 'text-red-400'
            bgClass = 'bg-red-500/10'
          } else if (line.startsWith('diff ')) {
            lineClass = 'text-muted-foreground/60 font-medium'
          }

          return (
            <div key={i} className={cn('px-1 -mx-1', bgClass)}>
              <span className={lineClass}>{line}</span>
            </div>
          )
        })}
      </pre>
    </div>
  )
}
