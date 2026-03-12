import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Monitor, RefreshCw, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { ProviderIcon } from '@/components/chat/ProviderIcon'
import { useProvidersStore, type Model } from '@/stores/providers.store'

export function LocalProvidersSection() {
  const providers = useProvidersStore((s) => s.providers)
  const models = useProvidersStore((s) => s.models)
  const setProviderOnline = useProvidersStore((s) => s.setProviderOnline)
  const setLocalModels = useProvidersStore((s) => s.setLocalModels)

  const lmProvider = providers.find(p => p.id === 'lmstudio')
  const lmModels = models.filter(m => m.providerId === 'lmstudio')
  const isOnline = lmProvider?.isOnline ?? null

  const ollamaProvider = providers.find(p => p.id === 'ollama')
  const ollamaModels = models.filter(m => m.providerId === 'ollama')
  const ollamaIsOnline = ollamaProvider?.isOnline ?? null

  const [baseUrl, setBaseUrl] = useState('http://localhost:1234')
  const [testing, setTesting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showModels, setShowModels] = useState(false)

  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434')
  const [ollamaTesting, setOllamaTesting] = useState(false)
  const [ollamaRefreshing, setOllamaRefreshing] = useState(false)
  const [ollamaShowModels, setOllamaShowModels] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Load saved URLs on mount
  useEffect(() => {
    window.api.getSetting('lmstudio:baseUrl').then(url => {
      if (url) setBaseUrl(url)
    })
    window.api.getSetting('ollama:baseUrl').then(url => {
      if (url) setOllamaBaseUrl(url)
    })
  }, [])

  async function handleTestConnection() {
    setTesting(true)
    try {
      const result = await window.api.testLocalProviderConnection('lmstudio', baseUrl)
      if (result.reachable) {
        setProviderOnline('lmstudio', true)
        setLocalModels('lmstudio', result.models as Model[])
        toast.success(`LM Studio connecte — ${result.modelCount} modele(s)`)
      } else {
        setProviderOnline('lmstudio', false)
        toast.error('LM Studio non accessible')
      }
    } catch {
      setProviderOnline('lmstudio', false)
      toast.error('Erreur lors du test de connexion')
    } finally {
      setTesting(false)
    }
  }

  async function handleSaveUrl() {
    const url = baseUrl.trim().replace(/\/+$/, '')
    if (!url) return
    try {
      await window.api.setLocalProviderBaseUrl('lmstudio', url)
      setBaseUrl(url)
      toast.success('URL sauvegardee')
    } catch {
      toast.error('URL invalide')
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const freshModels = await window.api.getLocalModels('lmstudio')
      setLocalModels('lmstudio', freshModels as Model[])
      toast.success(`${freshModels.length} modele(s) charges`)
    } catch {
      toast.error('Impossible de charger les modeles')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleOllamaTestConnection() {
    setOllamaTesting(true)
    try {
      const result = await window.api.testLocalProviderConnection('ollama', ollamaBaseUrl)
      if (result.reachable) {
        setProviderOnline('ollama', true)
        setLocalModels('ollama', result.models as Model[])
        toast.success(`Ollama connecte — ${result.modelCount} modele(s)`)
      } else {
        setProviderOnline('ollama', false)
        toast.error('Ollama non accessible')
      }
    } catch {
      setProviderOnline('ollama', false)
      toast.error('Erreur lors du test de connexion')
    } finally {
      setOllamaTesting(false)
    }
  }

  async function handleOllamaSaveUrl() {
    const url = ollamaBaseUrl.trim().replace(/\/+$/, '')
    if (!url) return
    try {
      await window.api.setLocalProviderBaseUrl('ollama', url)
      setOllamaBaseUrl(url)
      toast.success('URL sauvegardee')
    } catch {
      toast.error('URL invalide')
    }
  }

  async function handleOllamaRefresh() {
    setOllamaRefreshing(true)
    try {
      const freshModels = await window.api.getLocalModels('ollama')
      setLocalModels('ollama', freshModels as Model[])
      toast.success(`${freshModels.length} modele(s) charges`)
    } catch {
      toast.error('Impossible de charger les modeles')
    } finally {
      setOllamaRefreshing(false)
    }
  }

  const statusColor = isOnline === null
    ? 'bg-muted-foreground/40'
    : isOnline
      ? 'bg-green-500'
      : 'bg-red-500/70'

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-foreground">Providers locaux</h2>

      <div className="rounded-lg border border-border/60 p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ProviderIcon providerId="lmstudio" size={16} />
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">LM Studio</p>
              <span className={`size-2 rounded-full ${statusColor}`} />
              <span className="text-xs text-muted-foreground">
                {isOnline === null ? '' : isOnline ? 'Connecte' : 'Deconnecte'}
              </span>
            </div>
          </div>
        </div>

        {/* URL row */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">URL du serveur</label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={handleSaveUrl}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveUrl()
              }}
              placeholder="http://localhost:1234"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none font-mono"
            />
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {testing ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Monitor className="size-3.5" />
              )}
              Tester
            </button>
          </div>
        </div>

        {/* Connected — models list */}
        {isOnline && lmModels.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowModels(!showModels)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {showModels ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                {lmModels.length} modele(s) disponible(s)
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={`size-3 ${refreshing ? 'animate-spin' : ''}`} />
                Rafraichir
              </button>
            </div>

            {showModels && (
              <div className="rounded-md border border-border/40 bg-muted/30 p-2">
                <div className="space-y-1">
                  {lmModels.map(m => (
                    <div key={m.id} className="flex items-center gap-2 px-2 py-1 text-xs text-foreground/80 font-mono">
                      <span className="size-1.5 rounded-full bg-green-500/60" />
                      {m.displayName}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Disconnected message */}
        {isOnline === false && (
          <p className="text-xs text-muted-foreground">
            Serveur non accessible. Lancez LM Studio et activez le serveur local.
          </p>
        )}
      </div>

      {/* ── Ollama ── */}
      <div className="rounded-lg border border-border/60 p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ProviderIcon providerId="ollama" size={16} />
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Ollama</p>
              <span className={`size-2 rounded-full ${ollamaIsOnline === null ? 'bg-muted-foreground/40' : ollamaIsOnline ? 'bg-green-500' : 'bg-red-500/70'}`} />
              <span className="text-xs text-muted-foreground">
                {ollamaIsOnline === null ? '' : ollamaIsOnline ? 'Connecte' : 'Deconnecte'}
              </span>
            </div>
          </div>
        </div>

        {/* URL row */}
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">URL du serveur</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={ollamaBaseUrl}
              onChange={(e) => setOllamaBaseUrl(e.target.value)}
              onBlur={handleOllamaSaveUrl}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleOllamaSaveUrl()
              }}
              placeholder="http://localhost:11434"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none font-mono"
            />
            <button
              onClick={handleOllamaTestConnection}
              disabled={ollamaTesting}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {ollamaTesting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Monitor className="size-3.5" />
              )}
              Tester
            </button>
          </div>
        </div>

        {/* Connected — models list */}
        {ollamaIsOnline && ollamaModels.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setOllamaShowModels(!ollamaShowModels)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {ollamaShowModels ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                {ollamaModels.length} modele(s) disponible(s)
              </button>
              <button
                onClick={handleOllamaRefresh}
                disabled={ollamaRefreshing}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={`size-3 ${ollamaRefreshing ? 'animate-spin' : ''}`} />
                Rafraichir
              </button>
            </div>

            {ollamaShowModels && (
              <div className="rounded-md border border-border/40 bg-muted/30 p-2">
                <div className="space-y-1">
                  {ollamaModels.map(m => (
                    <div key={m.id} className="flex items-center gap-2 px-2 py-1 text-xs text-foreground/80 font-mono">
                      <span className="size-1.5 rounded-full bg-green-500/60" />
                      {m.displayName}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Disconnected message */}
        {ollamaIsOnline === false && (
          <p className="text-xs text-muted-foreground">
            Serveur non accessible. Lancez Ollama (<code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">ollama serve</code>).
          </p>
        )}
      </div>
    </section>
  )
}
