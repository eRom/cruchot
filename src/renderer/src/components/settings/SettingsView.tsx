import React, { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useProvidersStore } from '@/stores/providers.store'
import { useSettingsStore, type ThemeMode } from '@/stores/settings.store'
import { ArrowLeft, Eye, EyeOff, Check, Key, Sun, Moon, Monitor } from 'lucide-react'
import { useUiStore } from '@/stores/ui.store'

export function SettingsView() {
  const setCurrentView = useUiStore((s) => s.setCurrentView)

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <button
          onClick={() => setCurrentView('chat')}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Parametres</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-8">
          <ThemeSection />
          <ApiKeysSection />
        </div>
      </div>
    </div>
  )
}

function ThemeSection() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  const options: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Clair', icon: <Sun className="size-4" /> },
    { value: 'dark', label: 'Sombre', icon: <Moon className="size-4" /> },
    { value: 'system', label: 'Systeme', icon: <Monitor className="size-4" /> }
  ]

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-foreground">Theme</h2>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTheme(opt.value)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
              theme === opt.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </section>
  )
}

function ApiKeysSection() {
  const providers = useProvidersStore((s) => s.providers)
  const updateProviderStatus = useProvidersStore((s) => s.updateProviderStatus)

  const cloudProviders = providers.filter((p) => p.requiresApiKey)

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-foreground">Cles API</h2>
      <div className="space-y-3">
        {cloudProviders.map((provider) => (
          <ApiKeyRow
            key={provider.id}
            provider={provider}
            onConfigured={() => updateProviderStatus(provider.id, true)}
          />
        ))}
        {cloudProviders.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun provider configure.</p>
        )}
      </div>
    </section>
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
    } catch (error) {
      toast.error(`Erreur lors de l'enregistrement de la cle ${provider.name}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex size-8 items-center justify-center rounded-lg ${
            provider.isConfigured ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
          }`}>
            <Key className="size-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{provider.name}</p>
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
