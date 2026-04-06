import { useCallback, useEffect, useMemo, useState } from 'react'
import { AudioLines, KeyRound } from 'lucide-react'
import { useSettingsStore } from '@/stores/settings.store'
import { useUiStore } from '@/stores/ui.store'
import { toast } from 'sonner'
import type { AvailablePlugin } from '../../../../preload/types'

const DEFAULT_PROMPT = `- Communication en temps réel via audio (live)\n- Langue : Français par défaut.\n- Personnalité : Concis, efficace, ton chaleureux.`

export function AudioLiveView() {
  const liveModelId = useSettingsStore((s) => s.liveModelId) ?? 'gemini-3.1-flash-live-preview'
  const liveIdentityPrompt = useSettingsStore((s) => s.liveIdentityPrompt) ?? DEFAULT_PROMPT
  const liveVoices = useSettingsStore((s) => s.liveVoices)
  const setLiveModelId = useSettingsStore((s) => s.setLiveModelId)
  const setLiveIdentityPrompt = useSettingsStore((s) => s.setLiveIdentityPrompt)
  const setLiveVoice = useSettingsStore((s) => s.setLiveVoice)
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const setSettingsTab = useUiStore((s) => s.setSettingsTab)
  const [plugins, setPlugins] = useState<AvailablePlugin[]>([])

  useEffect(() => {
    window.api.liveGetPlugins().then(setPlugins).catch(() => {})
  }, [])

  const hasAnyAvailable = plugins.some((p) => p.available)

  const goToApiKeys = useCallback(() => {
    setCurrentView('settings')
    setSettingsTab('apikeys')
  }, [setCurrentView, setSettingsTab])

  // Plugin currently selected as the active Live model
  const selectedPlugin = useMemo(
    () => plugins.find((p) => liveModelId?.startsWith(p.providerId)) ?? null,
    [plugins, liveModelId]
  )

  const selectedVoiceId = selectedPlugin
    ? (liveVoices[selectedPlugin.providerId] ?? selectedPlugin.voices[0]?.id ?? '')
    : ''

  const handleModelChange = useCallback((providerId: string) => {
    setLiveModelId(`${providerId}::live`)
    toast.success('Modele Live mis a jour')
  }, [setLiveModelId])

  const handlePromptChange = useCallback((value: string) => {
    setLiveIdentityPrompt(value)
  }, [setLiveIdentityPrompt])

  const handleVoiceChange = useCallback((voiceId: string) => {
    if (!selectedPlugin) return
    setLiveVoice(selectedPlugin.providerId, voiceId)
    toast.success('Voix mise a jour — effet a la prochaine connexion')
  }, [selectedPlugin, setLiveVoice])

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
          <AudioLines className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Audio Live</h2>
          <p className="text-xs text-muted-foreground">Configuration de l'assistant vocal en temps reel</p>
        </div>
      </div>

      {/* Empty state — no plugin has an API key */}
      {plugins.length > 0 && !hasAnyAvailable && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 shrink-0">
              <KeyRound className="size-4 text-amber-500" />
            </div>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground">Aucune cle API configuree</p>
              <p className="text-xs text-muted-foreground">
                L'agent vocal Live necessite une cle API Google (Gemini) ou OpenAI.
              </p>
            </div>
          </div>
          <button
            onClick={goToApiKeys}
            className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-500 hover:bg-amber-500/20 transition-colors"
          >
            Configurer une cle API
          </button>
        </div>
      )}

      {/* Model selector */}
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Modele Live</p>
        <div className="space-y-2">
          {plugins.map((plugin) => (
            <label
              key={plugin.providerId}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                plugin.available
                  ? liveModelId?.startsWith(plugin.providerId)
                    ? 'border-primary/60 bg-primary/5 cursor-pointer'
                    : 'border-border/40 hover:border-border cursor-pointer'
                  : 'border-border/20 opacity-40 cursor-not-allowed'
              }`}
            >
              <input
                type="radio"
                name="live-model"
                value={plugin.providerId}
                checked={liveModelId?.startsWith(plugin.providerId)}
                disabled={!plugin.available}
                onChange={() => plugin.available && handleModelChange(plugin.providerId)}
                className="accent-primary"
              />
              <div className="flex-1">
                <p className={`text-sm font-medium ${plugin.available ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {plugin.modelName}
                </p>
                <p className="text-[11px] text-muted-foreground">{plugin.displayName}</p>
              </div>
              {!plugin.available && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  cle API requise
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Voice selector */}
      {selectedPlugin && selectedPlugin.voices.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Voix</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Voix de l'agent vocal pour {selectedPlugin.modelName}
            </p>
          </div>
          <select
            value={selectedVoiceId}
            onChange={(e) => handleVoiceChange(e.target.value)}
            disabled={!selectedPlugin.available}
            className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm text-foreground focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
          >
            {selectedPlugin.voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} — {voice.description}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Le changement de voix s'applique a la prochaine connexion Live.
          </p>
        </div>
      )}

      {/* Identity prompt */}
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground">Prompt Identite</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Injecte dans le system prompt de l'agent vocal
          </p>
        </div>
        <textarea
          value={liveIdentityPrompt}
          onChange={(e) => handlePromptChange(e.target.value)}
          rows={6}
          className="w-full resize-y rounded-lg border border-border/40 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
          placeholder="Decris le comportement et la personnalite de l'assistant vocal..."
        />
        <p className="text-[11px] text-muted-foreground">
          Ce texte est injecte au debut du system prompt Live, avant les capacites et les regles.
        </p>
      </div>
    </div>
  )
}
