import React, { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Download, RefreshCw, X } from 'lucide-react'

interface UpdateState {
  status: 'idle' | 'available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  releaseNotes?: string
  percent?: number
  errorMessage?: string
}

/**
 * Thin banner at the top of the app showing update status.
 * Appears only when an update is available, downloading, or ready to install.
 */
export function UpdateNotification(): React.JSX.Element | null {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.api.onUpdaterAvailable((data) => {
      setState({ status: 'available', version: data.version, releaseNotes: data.releaseNotes })
      setDismissed(false)
    })

    window.api.onUpdaterProgress((data) => {
      setState((prev) => ({ ...prev, status: 'downloading', percent: data.percent }))
    })

    window.api.onUpdaterDownloaded((data) => {
      setState({ status: 'downloaded', version: data.version })
      setDismissed(false)
    })

    window.api.onUpdaterError((data) => {
      setState((prev) => ({ ...prev, status: 'error', errorMessage: data.message }))
    })

    return () => {
      window.api.offUpdater()
    }
  }, [])

  const handleDownload = useCallback(() => {
    window.api.downloadUpdate()
    setState((prev) => ({ ...prev, status: 'downloading', percent: 0 }))
  }, [])

  const handleInstall = useCallback(() => {
    window.api.installUpdate()
  }, [])

  if (state.status === 'idle' || dismissed) return null

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-sm font-medium animate-in slide-in-from-top-2 duration-300',
        state.status === 'available' && 'bg-primary/10 text-primary',
        state.status === 'downloading' && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
        state.status === 'downloaded' && 'bg-green-500/10 text-green-600 dark:text-green-400',
        state.status === 'error' && 'bg-red-500/10 text-red-600 dark:text-red-400'
      )}
    >
      {/* Icon */}
      {state.status === 'downloading' ? (
        <RefreshCw className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}

      {/* Text */}
      <span className="flex-1">
        {state.status === 'available' && (
          <>Version {state.version} disponible</>
        )}
        {state.status === 'downloading' && (
          <>Téléchargement en cours… {state.percent != null ? `${state.percent}%` : ''}</>
        )}
        {state.status === 'downloaded' && (
          <>Version {state.version} prête — redémarrer pour installer</>
        )}
        {state.status === 'error' && (
          <>Erreur de mise à jour{state.errorMessage ? ` : ${state.errorMessage}` : ''}</>
        )}
      </span>

      {/* Progress bar */}
      {state.status === 'downloading' && state.percent != null && (
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-amber-500/20">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-300"
            style={{ width: `${state.percent}%` }}
          />
        </div>
      )}

      {/* Action button */}
      {state.status === 'available' && (
        <button
          onClick={handleDownload}
          className="rounded-md bg-primary/20 px-3 py-1 text-xs font-semibold hover:bg-primary/30 transition-colors"
        >
          Télécharger
        </button>
      )}
      {state.status === 'downloaded' && (
        <button
          onClick={handleInstall}
          className="rounded-md bg-green-500/20 px-3 py-1 text-xs font-semibold hover:bg-green-500/30 transition-colors"
        >
          Redémarrer
        </button>
      )}

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        className="rounded-md p-1 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Fermer"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
