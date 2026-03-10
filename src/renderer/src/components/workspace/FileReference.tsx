import { FileCode, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileReferenceProps {
  path: string
  onRemove: () => void
}

export function FileReference({ path, onRemove }: FileReferenceProps) {
  const filename = path.split('/').pop() || path

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5',
        'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
        'text-xs font-medium'
      )}
    >
      <FileCode className="size-3 shrink-0" />
      <span className="truncate max-w-[140px]" title={path}>{filename}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-sm hover:bg-cyan-500/20 transition-colors"
        title="Retirer"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}
