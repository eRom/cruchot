import { useEffect, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface MentionOverlayProps {
  content: string
  mentionedFiles: Set<string>
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  className?: string
  style?: React.CSSProperties
}

/**
 * Transparent overlay that renders @mentions with styled spans.
 * Positioned exactly over the textarea with identical text rendering.
 * The textarea text is made invisible — this overlay is what the user sees.
 */
export function MentionOverlay({
  content,
  mentionedFiles,
  textareaRef,
  className,
  style
}: MentionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  // Sync scroll position with textarea
  useEffect(() => {
    const textarea = textareaRef.current
    const overlay = overlayRef.current
    if (!textarea || !overlay) return

    const sync = () => {
      overlay.scrollTop = textarea.scrollTop
    }
    textarea.addEventListener('scroll', sync)
    // Initial sync
    sync()
    return () => textarea.removeEventListener('scroll', sync)
  }, [textareaRef])

  // Parse content into segments (normal text + @mentions)
  const segments = useMemo(() => {
    if (mentionedFiles.size === 0 || !content) return null

    // Sort by length desc so longer paths match first (e.g. src/App.tsx before src/App.ts)
    const paths = Array.from(mentionedFiles).sort((a, b) => b.length - a.length)
    const escaped = paths.map(escapeRegex)
    // Negative lookahead: don't match if followed by path-like chars
    const pattern = new RegExp(`@(${escaped.join('|')})(?![\\w./-])`, 'g')

    const result: Array<{ text: string; isMention: boolean; key: number }> = []
    let lastIndex = 0
    let match: RegExpExecArray | null
    let key = 0

    while ((match = pattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        result.push({ text: content.slice(lastIndex, match.index), isMention: false, key: key++ })
      }
      result.push({ text: match[0], isMention: true, key: key++ })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < content.length) {
      result.push({ text: content.slice(lastIndex), isMention: false, key: key++ })
    }

    return result.length > 0 ? result : null
  }, [content, mentionedFiles])

  if (!segments) return null

  // Add trailing newline to match textarea rendering (textarea always has an extra line at bottom)
  const needsTrailingNewline = content.endsWith('\n')

  return (
    <div
      ref={overlayRef}
      className={cn(
        'absolute inset-0 pointer-events-none',
        'whitespace-pre-wrap break-words overflow-wrap-anywhere',
        'overflow-hidden',
        className
      )}
      style={style}
      aria-hidden="true"
    >
      {segments.map((seg) =>
        seg.isMention ? (
          <span
            key={seg.key}
            className="text-cyan-500 dark:text-cyan-400 font-medium rounded-sm bg-cyan-500/10 dark:bg-cyan-400/10 px-0.5 -mx-0.5"
          >
            {seg.text}
          </span>
        ) : (
          <span key={seg.key}>{seg.text}</span>
        )
      )}
      {needsTrailingNewline && '\n'}
    </div>
  )
}
