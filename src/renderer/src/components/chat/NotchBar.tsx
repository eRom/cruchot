import { useEffect, useCallback, useState } from 'react'
import { useGeminiLiveStore } from '@/stores/gemini-live.store'
import { useGeminiLiveAudio } from '@/hooks/useGeminiLiveAudio'
import { cruchotCommandHandler } from '@/services/cruchot-command-handler'
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
  const { status, micLevel, speakerLevel, connect, disconnect } = useGeminiLiveStore()
  const { startAudio, stopAudio } = useGeminiLiveAudio()
  const [isHovered, setIsHovered] = useState(false)

  // Listen for status changes + commands from main process
  useEffect(() => {
    // Clear stale listeners first (prevents duplicates from HMR/re-mounts)
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
      disconnect()
      stopAudio()
    }
  }, [status, connect, disconnect, stopAudio])

  // Off or Dormant — show the pill ("y'a un truc")
  if (status === 'off' || status === 'dormant') {
    return (
      <div
        className="absolute left-1/2 -translate-x-1/2 cursor-pointer [-webkit-app-region:no-drag] z-10"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleClick}
      >
        {!isHovered ? (
          // Tiny pill peeking out — "y'a un truc"
          <div className="w-9 h-1.5 rounded-b-md bg-gradient-to-r from-slate-600 to-slate-500 opacity-60 transition-all duration-200" />
        ) : (
          // Hover: expand to show LIVE label
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

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 top-[6px] [-webkit-app-region:no-drag] z-10
        flex items-center justify-center gap-1.5
        w-40 h-8 rounded-b-2xl
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
    </div>
  )
}
