import { useState } from 'react'
import { useMeetStore } from '../../stores/meet.store'
import { useConversationsStore } from '../../stores/conversations.store'
import { useSettingsStore } from '@/stores/settings.store'

interface MeetInviteModalProps {
  open: boolean
  onClose: () => void
}

export function MeetInviteModal({ open, onClose }: MeetInviteModalProps) {
  const [guestName, setGuestName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { createSession, inviteCode } = useMeetStore()
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)
  const username = useSettingsStore((s) => s.userName) || 'Hôte'

  if (!open) return null

  const handleCreate = async () => {
    setError(null)
    if (!activeConversationId) {
      setError('Sélectionnez une conversation avant d\'inviter quelqu\'un.')
      return
    }
    if (!guestName.trim()) return
    setLoading(true)
    try {
      await createSession(activeConversationId, username, guestName.trim())
    } catch (err) {
      console.error('[Meet] Failed to create session:', err)
      setError(err instanceof Error ? err.message : 'Erreur lors de la création de la session')
    } finally {
      setLoading(false)
    }
  }

  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!inviteCode) return
    try {
      await navigator.clipboard.writeText(inviteCode)
    } catch {
      // Fallback for Electron sandbox
      const textarea = document.createElement('textarea')
      textarea.value = inviteCode
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[400px] rounded-xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground mb-4">Inviter quelqu'un</h2>

        {!inviteCode ? (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Nom du participant</label>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                  placeholder="Ex: Jean, Alice..."
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
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
                onClick={handleCreate}
                disabled={!guestName.trim() || loading}
                className="rounded-lg bg-amber-500/20 px-4 py-2 text-sm text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {loading ? 'Création...' : 'Créer la session'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              Partagez ce code avec <span className="text-blue-400 font-medium">{guestName}</span> :
            </p>
            <div className="flex items-center justify-center gap-3 rounded-lg bg-muted p-4">
              <span className="text-3xl font-mono font-bold tracking-[0.3em] text-foreground">
                {inviteCode}
              </span>
              <button
                onClick={handleCopy}
                className="rounded-lg bg-muted-foreground/10 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted-foreground/20"
              >
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground text-center">
              Code valide 15 minutes — usage unique
            </p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
