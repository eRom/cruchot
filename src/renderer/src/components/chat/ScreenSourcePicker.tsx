import { useState, useEffect, useCallback, useRef } from 'react'
import { Monitor } from 'lucide-react'
import type { ScreenSource } from '../../../../preload/types'

interface ScreenSourcePickerProps {
  onSelect: (sourceId: string, sourceName: string) => void
  onClose: () => void
}

export function ScreenSourcePicker({ onSelect, onClose }: ScreenSourcePickerProps) {
  const [sources, setSources] = useState<ScreenSource[]>([])
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.geminiLiveGetScreenSources().then(s => {
      setSources(s)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Close on ESC
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick)
    }, 100)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', handleClick)
    }
  }, [onClose])

  const handleSelect = useCallback((source: ScreenSource) => {
    onSelect(source.id, source.name)
  }, [onSelect])

  const screens = sources.filter(s => s.type === 'screen')
  const windows = sources.filter(s => s.type === 'window')

  return (
    <div
      ref={containerRef}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50"
    >
      {/* Arrow */}
      <div className="flex justify-center">
        <div className="w-3 h-1.5 bg-popover" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }} />
      </div>

      {/* Popover body */}
      <div className="bg-popover border border-border rounded-[10px] p-3.5 shadow-[0_16px_48px_rgba(0,0,0,0.5)] w-[400px]">
        {/* Header */}
        <div className="flex justify-between items-center mb-3.5">
          <span className="text-popover-foreground text-[13px] font-semibold">Partager l'écran</span>
          <span className="text-muted-foreground text-[10px]">ESC</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-muted-foreground text-xs">Chargement...</span>
          </div>
        ) : (
          <>
            {/* Screens section */}
            {screens.length > 0 && (
              <div className="mb-3.5">
                <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase block mb-2">
                  Écrans
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {screens.map(source => (
                    <SourceCard key={source.id} source={source} onSelect={handleSelect} />
                  ))}
                </div>
              </div>
            )}

            {/* Separator */}
            {screens.length > 0 && windows.length > 0 && (
              <div className="h-px bg-border mb-3.5" />
            )}

            {/* Windows section */}
            {windows.length > 0 && (
              <div>
                <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase block mb-2">
                  Fenêtres
                </span>
                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                  {windows.map(source => (
                    <SourceCard key={source.id} source={source} onSelect={handleSelect} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SourceCard({ source, onSelect }: { source: ScreenSource; onSelect: (s: ScreenSource) => void }) {
  return (
    <div
      className="bg-white/[0.04] border-[1.5px] border-transparent rounded-lg p-2 cursor-pointer
        hover:border-primary/50 hover:shadow-[0_0_12px_rgba(255,175,95,0.1)]
        transition-all duration-150"
      onClick={() => onSelect(source)}
    >
      {/* Thumbnail */}
      <div className="bg-background rounded h-[60px] overflow-hidden mb-1.5">
        {source.thumbnailDataUrl ? (
          <img
            src={source.thumbnailDataUrl}
            alt={source.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Monitor className="w-4 h-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Label */}
      <div className="flex items-center gap-1.5">
        {source.appIconDataUrl ? (
          <img
            src={source.appIconDataUrl}
            alt=""
            className="w-3 h-3 rounded-sm flex-shrink-0"
            draggable={false}
          />
        ) : (
          <Monitor className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-foreground/80 text-[11px] truncate">
          {source.name}
        </span>
      </div>
    </div>
  )
}
