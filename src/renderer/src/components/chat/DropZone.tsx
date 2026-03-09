import { useCallback, useState, type DragEvent, type ReactNode } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DropZoneProps {
  onDrop: (files: FileList) => void
  children: ReactNode
}

export function DropZone({ onDrop, children }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragCounter, setDragCounter] = useState(0)

  const handleDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setDragCounter((prev) => {
        const next = prev + 1
        if (next === 1) setIsDragging(true)
        return next
      })
    },
    []
  )

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setDragCounter((prev) => {
        const next = prev - 1
        if (next === 0) setIsDragging(false)
        return next
      })
    },
    []
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      setDragCounter(0)

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onDrop(e.dataTransfer.files)
        e.dataTransfer.clearData()
      }
    },
    [onDrop]
  )

  return (
    <div
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Overlay shown during drag */}
      {isDragging && (
        <div
          className={cn(
            'absolute inset-0 z-50',
            'flex flex-col items-center justify-center gap-3',
            'rounded-2xl border-2 border-dashed border-primary/50',
            'bg-primary/10 backdrop-blur-sm',
            'pointer-events-none',
            'animate-in fade-in duration-200'
          )}
        >
          <div
            className={cn(
              'flex size-14 items-center justify-center rounded-full',
              'bg-primary/20'
            )}
          >
            <Upload className="size-7 text-primary" />
          </div>
          <p className="text-sm font-medium text-primary">
            Deposez vos fichiers ici
          </p>
        </div>
      )}
    </div>
  )
}
