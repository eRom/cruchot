import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Eye, EyeOff, Check, ExternalLink,
  Monitor, RefreshCw, Loader2, ChevronDown, ChevronRight,
  Plus, Pencil, Trash2, X
} from 'lucide-react'
import { ProviderIcon } from '@/components/chat/ProviderIcon'
import { useProvidersStore, type Model } from '@/stores/providers.store'
import { cn } from '@/lib/utils'
import type { CustomModelInfo } from '../../../../preload/types'

// ── API key creation URLs per cloud provider ────────────────────────────────

const API_KEY_URLS: Record<string, string> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  google: 'https://aistudio.google.com/apikey',
  mistral: 'https://console.mistral.ai/api-keys',
  xai: 'https://console.x.ai',
  deepseek: 'https://platform.deepseek.com/api_keys',
  qwen: 'https://dashscope.console.aliyun.com/apiKey',
  perplexity: 'https://www.perplexity.ai/settings/api',
  openrouter: 'https://openrouter.ai/settings/keys'
}

// ── Main Component ──────────────────────────────────────────────────────────

type ProviderTab = 'cloud' | 'local'

export function ProvidersSection() {
  const [activeTab, setActiveTab] = useState<ProviderTab>('cloud')

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-medium text-foreground">Providers</h2>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
        <button
          onClick={() => setActiveTab('cloud')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'cloud'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Cloud
        </button>
        <button
          onClick={() => setActiveTab('local')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            activeTab === 'local'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Locaux
        </button>
      </div>

      {activeTab === 'cloud' ? <CloudProviders /> : <LocalProviders />}
    </section>
  )
}

// ── Cloud Providers ─────────────────────────────────────────────────────────

function CloudProviders() {
  const providers = useProvidersStore((s) => s.providers)
  const updateProviderStatus = useProvidersStore((s) => s.updateProviderStatus)

  const cloudProviders = providers
    .filter((p) => p.requiresApiKey)
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-3">
      {cloudProviders.map((provider) => (
        <div key={provider.id} className="space-y-0">
          <ApiKeyRow
            provider={provider}
            onConfigured={() => updateProviderStatus(provider.id, true)}
          />
          {provider.id === 'openrouter' && provider.isConfigured && (
            <OpenRouterModelsManager />
          )}
        </div>
      ))}
      {cloudProviders.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun provider configure.</p>
      )}
    </div>
  )
}

function ApiKeyRow({
  provider,
  onConfigured
}: {
  provider: { id: string; name: string; isConfigured: boolean }
  onConfigured: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  const apiKeyUrl = API_KEY_URLS[provider.id]

  useEffect(() => {
    if (provider.isConfigured) {
      window.api.getApiKeyMasked(provider.id).then(setMaskedKey)
    }
  }, [provider.id, provider.isConfigured])

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    try {
      await window.api.setApiKey(provider.id, apiKey.trim())
      onConfigured()
      setApiKey('')
      setIsEditing(false)
      const masked = await window.api.getApiKeyMasked(provider.id)
      setMaskedKey(masked)
      toast.success(`Cle ${provider.name} enregistree`)
    } catch {
      toast.error(`Erreur lors de l'enregistrement de la cle ${provider.name}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
            <ProviderIcon providerId={provider.id} size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{provider.name}</p>
              {apiKeyUrl && (
                <a
                  href={apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground/50 hover:text-primary transition-colors"
                  title="Obtenir une cle API"
                >
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            {maskedKey && !isEditing && (
              <p className="text-xs text-muted-foreground font-mono">{maskedKey}</p>
            )}
          </div>
        </div>

        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {provider.isConfigured ? 'Modifier' : 'Configurer'}
          </button>
        )}
      </div>

      {isEditing && (
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
                if (e.key === 'Escape') { setIsEditing(false); setApiKey('') }
              }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="size-4" />
          </button>
          <button
            onClick={() => { setIsEditing(false); setApiKey('') }}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}

// ── OpenRouter Models Manager ───────────────────────────────────────────────

function OpenRouterModelsManager() {
  const [models, setModels] = useState<CustomModelInfo[]>([])
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [label, setLabel] = useState('')
  const [modelId, setModelId] = useState('')
  const [type, setType] = useState<'text' | 'image'>('text')

  const loadModels = useCallback(async () => {
    const list = await window.api.getCustomModels('openrouter')
    setModels(list.sort((a, b) => a.label.localeCompare(b.label)))
  }, [])

  useEffect(() => {
    loadModels()
  }, [loadModels])

  function resetForm() {
    setLabel('')
    setModelId('')
    setType('text')
  }

  async function handleCreate() {
    if (!label.trim() || !modelId.trim()) return
    try {
      await window.api.createCustomModel({
        providerId: 'openrouter',
        label: label.trim(),
        modelId: modelId.trim(),
        type
      })
      toast.success('Modele ajoute')
      resetForm()
      setAdding(false)
      loadModels()
      // Refresh models in the global store
      const allModels = await window.api.getModels()
      useProvidersStore.getState().setModels(allModels as Model[])
    } catch {
      toast.error("Erreur lors de l'ajout du modele")
    }
  }

  async function handleUpdate(id: string) {
    if (!label.trim() || !modelId.trim()) return
    try {
      await window.api.updateCustomModel(id, {
        label: label.trim(),
        modelId: modelId.trim(),
        type
      })
      toast.success('Modele mis a jour')
      resetForm()
      setEditingId(null)
      loadModels()
      const allModels = await window.api.getModels()
      useProvidersStore.getState().setModels(allModels as Model[])
    } catch {
      toast.error('Erreur lors de la mise a jour')
    }
  }

  async function handleDelete(id: string) {
    try {
      await window.api.deleteCustomModel(id)
      toast.success('Modele supprime')
      loadModels()
      const allModels = await window.api.getModels()
      useProvidersStore.getState().setModels(allModels as Model[])
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  function startEdit(model: CustomModelInfo) {
    setEditingId(model.id)
    setLabel(model.label)
    setModelId(model.modelId)
    setType(model.type)
    setAdding(false)
  }

  function cancelEdit() {
    setEditingId(null)
    setAdding(false)
    resetForm()
  }

  return (
    <div className="ml-11 mt-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {models.length} modele(s) configure(s)
        </p>
        {!adding && !editingId && (
          <button
            onClick={() => { setAdding(true); resetForm() }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3" />
            Ajouter
          </button>
        )}
      </div>

      {/* Model list */}
      {models.length > 0 && (
        <div className="space-y-1">
          {models.map((model) => (
            <div key={model.id}>
              {editingId === model.id ? (
                <ModelForm
                  label={label}
                  modelId={modelId}
                  type={type}
                  onLabelChange={setLabel}
                  onModelIdChange={setModelId}
                  onTypeChange={setType}
                  onSave={() => handleUpdate(model.id)}
                  onCancel={cancelEdit}
                  saveLabel="Enregistrer"
                />
              ) : (
                <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <ProviderIcon providerId="openrouter" size={14} />
                    <span className="text-sm text-foreground">{model.label}</span>
                    <span className="text-xs text-muted-foreground font-mono">{model.modelId}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {model.type === 'text' ? 'Texte' : 'Image'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(model)}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(model.id)}
                      className="rounded p-1 text-muted-foreground hover:text-red-500 hover:bg-accent"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {adding && (
        <ModelForm
          label={label}
          modelId={modelId}
          type={type}
          onLabelChange={setLabel}
          onModelIdChange={setModelId}
          onTypeChange={setType}
          onSave={handleCreate}
          onCancel={cancelEdit}
          saveLabel="Ajouter"
        />
      )}
    </div>
  )
}

function ModelForm({
  label,
  modelId,
  type,
  onLabelChange,
  onModelIdChange,
  onTypeChange,
  onSave,
  onCancel,
  saveLabel
}: {
  label: string
  modelId: string
  type: 'text' | 'image'
  onLabelChange: (v: string) => void
  onModelIdChange: (v: string) => void
  onTypeChange: (v: 'text' | 'image') => void
  onSave: () => void
  onCancel: () => void
  saveLabel: string
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="Nom (ex: Claude Sonnet via OR)"
          className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
          autoFocus
        />
        <select
          value={type}
          onChange={(e) => onTypeChange(e.target.value as 'text' | 'image')}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="text">Texte</option>
          <option value="image">Image</option>
        </select>
      </div>
      <input
        type="text"
        value={modelId}
        onChange={(e) => onModelIdChange(e.target.value)}
        placeholder="Model ID (ex: anthropic/claude-sonnet-4)"
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent"
        >
          Annuler
        </button>
        <button
          onClick={onSave}
          disabled={!label.trim() || !modelId.trim()}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Check className="size-3" />
          {saveLabel}
        </button>
      </div>
    </div>
  )
}

// ── Local Providers ─────────────────────────────────────────────────────────

function LocalProviders() {
  return (
    <div className="space-y-3">
      <LocalProviderRow providerId="lmstudio" name="LM Studio" defaultUrl="http://localhost:1234" settingKey="lmstudio:baseUrl" disconnectedMsg="Lancez LM Studio et activez le serveur local." />
      <LocalProviderRow providerId="ollama" name="Ollama" defaultUrl="http://localhost:11434" settingKey="ollama:baseUrl" disconnectedMsg="Lancez Ollama (ollama serve)." />
    </div>
  )
}

function LocalProviderRow({
  providerId,
  name,
  defaultUrl,
  settingKey,
  disconnectedMsg
}: {
  providerId: string
  name: string
  defaultUrl: string
  settingKey: string
  disconnectedMsg: string
}) {
  const providers = useProvidersStore((s) => s.providers)
  const models = useProvidersStore((s) => s.models)
  const setProviderOnline = useProvidersStore((s) => s.setProviderOnline)
  const setLocalModels = useProvidersStore((s) => s.setLocalModels)

  const provider = providers.find(p => p.id === providerId)
  const providerModels = models.filter(m => m.providerId === providerId)
  const isOnline = provider?.isOnline ?? null

  const [baseUrl, setBaseUrl] = useState(defaultUrl)
  const [testing, setTesting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showModels, setShowModels] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.getSetting(settingKey).then(url => {
      if (url) setBaseUrl(url)
    })
  }, [settingKey])

  async function handleTestConnection() {
    setTesting(true)
    try {
      const result = await window.api.testLocalProviderConnection(providerId, baseUrl)
      if (result.reachable) {
        setProviderOnline(providerId, true)
        setLocalModels(providerId, result.models as Model[])
        toast.success(`${name} connecte — ${result.modelCount} modele(s)`)
      } else {
        setProviderOnline(providerId, false)
        toast.error(`${name} non accessible`)
      }
    } catch {
      setProviderOnline(providerId, false)
      toast.error('Erreur lors du test de connexion')
    } finally {
      setTesting(false)
    }
  }

  async function handleSaveUrl() {
    const url = baseUrl.trim().replace(/\/+$/, '')
    if (!url) return
    try {
      await window.api.setLocalProviderBaseUrl(providerId, url)
      setBaseUrl(url)
      toast.success('URL sauvegardee')
    } catch {
      toast.error('URL invalide')
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const freshModels = await window.api.getLocalModels(providerId)
      setLocalModels(providerId, freshModels as Model[])
      toast.success(`${freshModels.length} modele(s) charges`)
    } catch {
      toast.error('Impossible de charger les modeles')
    } finally {
      setRefreshing(false)
    }
  }

  const statusColor = isOnline === null
    ? 'bg-muted-foreground/40'
    : isOnline
      ? 'bg-green-500'
      : 'bg-red-500/70'

  return (
    <div className="rounded-lg border border-border/60 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
            <ProviderIcon providerId={providerId} size={18} />
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{name}</p>
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
            placeholder={defaultUrl}
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
      {isOnline && providerModels.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowModels(!showModels)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {showModels ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              {providerModels.length} modele(s) disponible(s)
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
                {providerModels.map(m => (
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
        <p className="text-xs text-muted-foreground">{disconnectedMsg}</p>
      )}
    </div>
  )
}
