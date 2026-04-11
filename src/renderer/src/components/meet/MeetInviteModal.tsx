import { useState } from 'react'
import { useMeetStore } from '../../stores/meet.store'
import { useConversationsStore } from '../../stores/conversations.store'

interface MeetInviteModalProps {
  open: boolean
  onClose: () => void
}

export function MeetInviteModal({ open, onClose }: MeetInviteModalProps) {
  const [guestName, setGuestName] = useState('')
  const [hostName, setHostName] = useState('Hôte')
  const [loading, setLoading] = useState(false)
  const { createSession, inviteCode } = useMeetStore()
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)

  if (!open) return null

  const handleCreate = async () => {
    if (!activeConversationId || !guestName.trim()) return
    setLoading(true)
    try {
      await createSession(activeConversationId, hostName.trim(), guestName.trim())
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[400px] rounded-xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground mb-4">Inviter quelqu'un</h2>

        {!inviteCode ? (
          <>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Votre nom</label>
                <input
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                  placeholder="Votre nom..."
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Nom du participant</label>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                  placeholder="Le Mec Méchant..."
                  autoFocus
                />
              </div>
            </div>
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
                Copier
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
