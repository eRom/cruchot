import { useEffect, useCallback, useState } from 'react'
import { Monitor } from 'lucide-react'
import { useGeminiLiveStore } from '@/stores/gemini-live.store'
import { useSettingsStore } from '@/stores/settings.store'
import { useGeminiLiveAudio } from '@/hooks/useGeminiLiveAudio'
import { useScreenCapture } from '@/hooks/useScreenCapture'
import { cruchotCommandHandler } from '@/services/cruchot-command-handler'
import { ScreenSourcePicker } from './ScreenSourcePicker'
import type { GeminiLiveStatus } from '../../../../preload/types'

const STATUS_STYLES: Record<string, { bg: string; glow: string; label: string; color: string }> = {
  connected: { bg: 'from-slate-800 to-slate-600', glow: '', label: 'LIVE', color: 'text-slate-400' },
  listening: { bg: 'from-blue-900 to-blue-600', glow: 'shadow-[0_4px_24px_rgba(59,130,246,0.4)]', label: 'LISTENING', color: 'text-blue-300' },
  speaking: { bg: 'from-amber-900 to-amber-600', glow: 'shadow-[0_4px_24px_rgba(245,158,11,0.4)]', label: 'SPEAKING', color: 'text-amber-200' },
  connecting: { bg: 'from-slate-800 to-slate-600', glow: '', label: 'CONNECTING...', color: 'text-slate-400' },
  error: { bg: 'from-red-900 to-red-700', glow: 'shadow-[0_4px_24px_rgba(239,68,68,0.3)]', label: 'ERROR', color: 'text-red-300' },
}

function WaveformBars({ level, color }: { level: number; color: string }) {
  const bars = 7
  return (
    <div className="flex items-center gap-[2px] h-4">
      {Array.from({ length: bars }).map((_, i) => {
        const baseHeight = 4 + Math.sin(i * 0.9 + Date.now() * 0.005) * 3
        const height = Math.max(3, baseHeight + level * 12)
        return (
          <div
            key={i}
            className={`w-[3px] rounded-full transition-all duration-150 ${color}`}
            style={{ height: `${height}px` }}
          />
        )
      })}
    </div>
  )
}

export function NotchBar() {
  const { status, micLevel, speakerLevel, isScreenSharing, connect, disconnect } = useGeminiLiveStore()
  const { startAudio, stopAudio } = useGeminiLiveAudio()
  const { startCapture, stopCapture } = useScreenCapture()
  const [isHovered, setIsHovered] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  // Listen for status changes + commands from main process
  useEffect(() => {
    window.api.offGeminiLiveStatus()
    window.api.offGeminiLiveCommand()

    window.api.onGeminiLiveStatus((info) => {
      useGeminiLiveStore.getState().setStatus(info.status as GeminiLiveStatus, info.error)
    })

    window.api.onGeminiLiveCommand(async (cmd) => {
      const result = await cruchotCommandHandler.execute(cmd.name, cmd.args)
      await window.api.geminiLiveRespondCommand(cmd.id, cmd.name, result)
    })

    return () => {
      window.api.offGeminiLiveStatus()
      window.api.offGeminiLiveCommand()
    }
  }, [])

  // Start/stop audio with connection
  useEffect(() => {
    if (status === 'connected' || status === 'listening' || status === 'speaking') {
      startAudio()
    } else if (status === 'off' || status === 'error') {
      stopAudio()
    }
  }, [status, startAudio, stopAudio])

  const handleClick = useCallback(() => {
    if (status === 'off' || status === 'dormant') {
      connect()
    } else {
      stopCapture()
      disconnect()
      stopAudio()
    }
  }, [status, connect, disconnect, stopAudio, stopCapture])

  const handleScreenShareClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (isScreenSharing) {
      stopCapture()
      return
    }

    // Check macOS screen recording permission — but don't block on 'not-determined'
    // since Electron may trigger the OS prompt via getDisplayMedia() anyway
    try {
      const permission = await window.api.geminiLiveCheckScreenPermission()
      if (permission === 'denied') {
        // On macOS, 'denied' means explicitly refused — guide user to settings
        console.warn('[ScreenShare] Permission denied — user must enable in System Preferences')
        // Still open picker — getDisplayMedia will fail gracefully and the user sees the error
      }
    } catch {
      // systemPreferences may not be available — proceed anyway
    }

    setShowPicker(true)
  }, [isScreenSharing, stopCapture])

  const handleSourceSelect = useCallback(async (sourceId: string, sourceName: string) => {
    setShowPicker(false)
    try {
      await startCapture(sourceId)

      const { hasShownScreenShareNotice, setHasShownScreenShareNotice } = useSettingsStore.getState()
      if (!hasShownScreenShareNotice) {
        console.log(`[ScreenShare] Le contenu de "${sourceName}" est partagé avec Gemini en temps réel.`)
        setHasShownScreenShareNotice(true)
      }
    } catch (err: any) {
      console.error('[ScreenShare] Failed to start capture:', err.message)
    }
  }, [startCapture])

  // Off or Dormant — show the pill
  if (status === 'off' || status === 'dormant') {
    return (
      <div
        className="absolute left-1/2 -translate-x-1/2 cursor-pointer [-webkit-app-region:no-drag] z-10"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleClick}
      >
        {!isHovered ? (
          <div className="w-9 h-1.5 rounded-b-md bg-gradient-to-r from-slate-600 to-slate-500 opacity-60 transition-all duration-200" />
        ) : (
          <div className="flex items-center justify-center gap-1.5 w-[120px] h-7 rounded-b-xl bg-gradient-to-br from-slate-800 to-slate-700 border border-t-0 border-slate-600 transition-all duration-200">
            <div className={`w-2 h-2 rounded-full ${status === 'dormant' ? 'bg-amber-500' : 'bg-slate-500'}`} />
            <span className="text-[10px] font-medium text-slate-400">LIVE</span>
          </div>
        )}
      </div>
    )
  }

  // Active states
  const style = STATUS_STYLES[status] || STATUS_STYLES.connected
  const activeLevel = status === 'listening' ? micLevel : status === 'speaking' ? speakerLevel : 0
  const barColor = status === 'listening' ? 'bg-blue-400' : status === 'speaking' ? 'bg-amber-300' : 'bg-slate-500'
  const isActive = status === 'connected' || status === 'listening' || status === 'speaking'

  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-[6px] [-webkit-app-region:no-drag] z-10">
      <div
        className={`flex items-center justify-center gap-1.5
          w-48 h-8 rounded-b-2xl
          bg-gradient-to-br ${style.bg}
          border border-t-0 border-white/10
          ${style.glow}
          transition-all duration-300 cursor-pointer`}
        onClick={handleClick}
        title="Cliquer pour déconnecter"
      >
        {(status === 'listening' || status === 'speaking') && (
          <WaveformBars level={activeLevel} color={barColor} />
        )}
        <span className={`text-[10px] font-semibold ${style.color} ml-1`}>
          {style.label}
        </span>

        {/* Screen share icon — only when session is active */}
        {isActive && (
          <div
            className={`ml-1.5 p-0.5 rounded cursor-pointer relative transition-all duration-150
              ${isScreenSharing
                ? 'opacity-100'
                : 'opacity-50 hover:opacity-90 hover:bg-white/10'
              }`}
            onClick={handleScreenShareClick}
            title={isScreenSharing ? 'Arrêter le partage' : 'Partager l\'écran'}
          >
            <Monitor
              className={`w-3.5 h-3.5 ${
                isScreenSharing
                  ? 'text-green-400'
                  : 'text-current'
              }`}
              fill={isScreenSharing ? 'rgba(74,222,128,0.15)' : 'none'}
            />
            {/* Green pulsing dot when active */}
            {isScreenSharing && (
              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-400 rounded-full animate-[dotPulse_2s_ease-in-out_infinite]" />
            )}
          </div>
        )}
      </div>

      {/* Source picker popover */}
      {showPicker && (
        <ScreenSourcePicker
          onSelect={handleSourceSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
