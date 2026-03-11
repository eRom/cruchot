import React, { useState, useEffect, useCallback } from 'react'
import { Smartphone, Eye, EyeOff, Loader2, Check, X, Copy } from 'lucide-react'
import { useRemoteStore } from '@/stores/remote.store'
import { useConversationsStore } from '@/stores/conversations.store'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  disconnected: { label: 'Deconnecte', color: 'bg-zinc-400' },
  configuring: { label: 'Configuration...', color: 'bg-yellow-400' },
  pairing: { label: 'En attente de pairing', color: 'bg-yellow-400 animate-pulse' },
  connected: { label: 'Connecte', color: 'bg-emerald-500' },
  expired: { label: 'Expire', color: 'bg-red-400' },
  error: { label: 'Erreur', color: 'bg-red-500' }
}

export function RemoteTab(): React.JSX.Element {
  const { status, config, pairingCode, loading, loadConfig, configure, start, stop, setAutoApprove, deleteToken } = useRemoteStore()
  const activeConversationId = useConversationsStore((s) => s.activeConversationId)

  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [userIdInput, setUserIdInput] = useState('')

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Sync userIdInput with config
  useEffect(() => {
    if (config?.allowedUserId) {
      setUserIdInput(String(config.allowedUserId))
    }
  }, [config?.allowedUserId])

  const handleConfigure = useCallback(async () => {
    if (!token.trim() || !userIdInput.trim()) return
    const userId = parseInt(userIdInput.trim(), 10)
    if (isNaN(userId) || userId <= 0) {
      setConfigError('ID Telegram invalide')
      return
    }
    setConfigError(null)
    try {
      await window.api.remoteSetAllowedUser(userId)
      await configure(token.trim())
      setToken('')
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Erreur de configuration')
    }
  }, [token, userIdInput, configure])

  const handleCopyCode = useCallback(() => {
    if (pairingCode) {
      navigator.clipboard.writeText(`/pair ${pairingCode}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [pairingCode])

  const handleAutoApproveToggle = useCallback((field: string, value: boolean) => {
    if (!config?.session) return
    setAutoApprove({
      autoApproveRead: config.session.autoApproveRead,
      autoApproveWrite: config.session.autoApproveWrite,
      autoApproveBash: config.session.autoApproveBash,
      autoApproveList: config.session.autoApproveList,
      autoApproveMcp: config.session.autoApproveMcp,
      [field]: value
    })
  }, [config, setAutoApprove])

  const statusInfo = STATUS_LABELS[status] ?? STATUS_LABELS.disconnected

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Remote Control</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Controlez l'app depuis Telegram. Toute l'intelligence reste sur votre machine.
        </p>
      </div>

      {/* ── Telegram Config Section ────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Telegram</h3>

        {config?.hasToken && config.botUsername ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
              <Smartphone className="size-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm text-foreground">@{config.botUsername}</span>
                <span className="text-xs text-muted-foreground font-mono">ID: {config.allowedUserId ?? '—'}</span>
              </div>
              <Check className="size-4 text-emerald-500" />
              <button
                onClick={deleteToken}
                disabled={loading}
                className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Token row */}
            <div className="flex items-center gap-3">
              <label className="w-24 shrink-0 text-sm text-muted-foreground">Token Bot</label>
              <div className="relative flex-1">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="123456:ABCdefGHIjklMNOpqrsTUVwxyz"
                  className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground"
                >
                  {showToken ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            {/* User ID row */}
            <div className="flex items-center gap-3">
              <label className="w-24 shrink-0 text-sm text-muted-foreground">Mon ID</label>
              <input
                type="text"
                inputMode="numeric"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value.replace(/\D/g, ''))}
                placeholder="123456789"
                className="flex-1 rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none font-mono"
              />
            </div>

            {/* Valider button */}
            <div className="flex items-center gap-3">
              <div className="w-24 shrink-0" />
              <button
                onClick={handleConfigure}
                disabled={loading || !token.trim() || !userIdInput.trim()}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : 'Valider'}
              </button>
            </div>

            {configError && (
              <p className="text-xs text-red-400">{configError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Creez un bot via @BotFather, collez le token. Envoyez /start a @userinfobot pour votre ID.
            </p>
          </div>
        )}
      </section>

      {/* ── Session Section ─────────────────────── */}
      {config?.hasToken && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Session</h3>

          {/* Status badge */}
          <div className="flex items-center gap-3">
            <span className={cn('size-2.5 rounded-full', statusInfo.color)} />
            <span className="text-sm text-foreground">{statusInfo.label}</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {status === 'disconnected' || status === 'expired' ? (
              <button
                onClick={() => start(activeConversationId ?? undefined)}
                disabled={loading}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  'bg-emerald-600 text-white hover:bg-emerald-500',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : 'Demarrer'}
              </button>
            ) : (
              <button
                onClick={stop}
                disabled={loading}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                  'bg-red-600 text-white hover:bg-red-500',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : 'Arreter'}
              </button>
            )}
          </div>

          {/* Pairing code */}
          {status === 'pairing' && pairingCode && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 space-y-2">
              <p className="text-sm text-foreground">
                Envoyez cette commande a votre bot Telegram :
              </p>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-3 py-1.5 text-lg font-mono font-bold tracking-widest text-foreground">
                  /pair {pairingCode}
                </code>
                <button
                  onClick={handleCopyCode}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  title="Copier"
                >
                  {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Le code expire dans 5 minutes.
              </p>
            </div>
          )}

          {/* Connected info */}
          {status === 'connected' && config.session && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-sm text-emerald-400">
                Session active — Chat ID: {config.session.chatId}
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Auto-Approve Section ───────────────── */}
      {config?.session && (status === 'connected' || status === 'pairing') && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Auto-approbation des outils</h3>
          <p className="text-xs text-muted-foreground">
            Les outils auto-approuves s'executent sans confirmation Telegram.
          </p>

          <div className="space-y-2">
            {[
              { field: 'autoApproveRead', label: 'Lecture fichiers (readFile)', value: config.session.autoApproveRead },
              { field: 'autoApproveList', label: 'Listage fichiers (listFiles)', value: config.session.autoApproveList },
              { field: 'autoApproveWrite', label: 'Ecriture fichiers (writeFile)', value: config.session.autoApproveWrite },
              { field: 'autoApproveBash', label: 'Commandes shell (bash)', value: config.session.autoApproveBash },
              { field: 'autoApproveMcp', label: 'Outils MCP', value: config.session.autoApproveMcp },
            ].map(({ field, label, value }) => (
              <div key={field} className="flex items-center justify-between rounded-lg border border-border/30 px-3 py-2">
                <span className="text-sm text-foreground">{label}</span>
                <button
                  onClick={() => handleAutoApproveToggle(field, !value)}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    value ? 'bg-emerald-600' : 'bg-zinc-600'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      value && 'translate-x-5'
                    )}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
