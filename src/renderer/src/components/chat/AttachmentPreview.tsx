import { useCallback } from 'react'
import { X, File as FileIcon, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AttachmentItem {
  name: string
  type: string
  size: number
  url?: string
}

interface AttachmentPreviewProps {
  attachments: AttachmentItem[]
  onRemove: (index: number) => void
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function truncateName(name: string, maxLength = 20): string {
  if (name.length <= maxLength) return name
  const ext = name.lastIndexOf('.')
  if (ext > 0) {
    const extension = name.slice(ext)
    const base = name.slice(0, maxLength - extension.length - 3)
    return `${base}...${extension}`
  }
  return `${name.slice(0, maxLength - 3)}...`
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  const handleRemove = useCallback(
    (index: number) => {
      onRemove(index)
    },
    [onRemove]
  )

  if (attachments.length === 0) return null

  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto py-1.5',
        'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/40'
      )}
    >
      {attachments.map((attachment, index) => {
        const isImage = IMAGE_TYPES.includes(attachment.type)

        return (
          <div
            key={`${attachment.name}-${index}`}
            className={cn(
              'group relative flex shrink-0 items-center gap-2',
              'rounded-lg border border-border/60 bg-muted/30',
              'px-2.5 py-1.5',
              'transition-colors duration-150 hover:bg-muted/50'
            )}
          >
            {/* Thumbnail or file icon */}
            {isImage && attachment.url ? (
              <img
                src={attachment.url}
                alt={attachment.name}
                className="size-12 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded bg-muted/50">
                {isImage ? (
                  <ImageIcon className="size-5 text-muted-foreground" />
                ) : (
                  <FileIcon className="size-5 text-muted-foreground" />
                )}
              </div>
            )}

            {/* File info */}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-xs font-medium text-foreground">
                {truncateName(attachment.name)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatFileSize(attachment.size)}
              </span>
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className={cn(
                'absolute -right-1.5 -top-1.5',
                'flex size-5 items-center justify-center rounded-full',
                'bg-foreground/80 text-background',
                'opacity-0 transition-opacity duration-150',
                'group-hover:opacity-100',
                'hover:bg-foreground'
              )}
              aria-label={`Remove ${attachment.name}`}
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
