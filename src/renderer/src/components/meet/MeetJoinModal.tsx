import { useState } from 'react'
import { useMeetStore } from '@/stores/meet.store'

interface MeetJoinModalProps {
  open: boolean
  onClose: () => void
}

export function MeetJoinModal({ open, onClose }: MeetJoinModalProps) {
  const [inviteCode, setInviteCode] = useState('')
  const [hostUrl, setHostUrl] = useState('ws://localhost:9878')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { joinSession } = useMeetStore()

  if (!open) return null

  const handleJoin = async () => {
    setError(null)
    const code = inviteCode.trim().toUpperCase()
    if (code.length !== 6) {
      setError('Le code doit contenir 6 caractères.')
      return
    }
    if (!hostUrl.trim()) {
      setError('URL de l\'hôte requise.')
      return
    }
    setLoading(true)
    try {
      await joinSession(hostUrl.trim(), code)
      onClose()
    } catch (err) {
      console.error('[Meet] Join failed:', err)
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre la session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[400px] rounded-xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground mb-4">Rejoindre une session</h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">Code d'invitation</label>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 6))}
              className="w-full mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-lg font-mono tracking-[0.3em] text-foreground text-center"
              placeholder="ABC234"
              autoFocus
              maxLength={6}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Adresse de l'hôte</label>
            <input
              value={hostUrl}
              onChange={(e) => setHostUrl(e.target.value)}
              className="w-full mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
              placeholder="ws://192.168.1.10:9878"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Par défaut : ws://localhost:9878 (même réseau)
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Annuler
          </button>
          <button
            onClick={handleJoin}
            disabled={inviteCode.trim().length !== 6 || loading}
            className="rounded-lg bg-blue-500/20 px-4 py-2 text-sm text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50"
          >
            {loading ? 'Connexion...' : 'Rejoindre'}
          </button>
        </div>
      </div>
    </div>
  )
}
