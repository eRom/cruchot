import { useCallback } from 'react'
import { AudioLines } from 'lucide-react'
import { useSettingsStore } from '@/stores/settings.store'
import { toast } from 'sonner'

const LIVE_MODELS = [
  { id: 'gemini-3.1-flash-live-preview', label: 'Gemini 3.1 Flash Live', provider: 'Google', enabled: true },
  { id: 'gpt-4o-realtime-preview', label: 'GPT-4o Realtime', provider: 'OpenAI', enabled: false },
]

const DEFAULT_PROMPT = `- Communication en temps réel via audio (live)\n- Langue : Français par défaut.\n- Personnalité : Concis, efficace, ton chaleureux.`

export function AudioLiveView() {
  const liveModelId = useSettingsStore((s) => s.liveModelId) ?? 'gemini-3.1-flash-live-preview'
  const liveIdentityPrompt = useSettingsStore((s) => s.liveIdentityPrompt) ?? DEFAULT_PROMPT
  const setLiveModelId = useSettingsStore((s) => s.setLiveModelId)
  const setLiveIdentityPrompt = useSettingsStore((s) => s.setLiveIdentityPrompt)

  const handleModelChange = useCallback((modelId: string) => {
    setLiveModelId(modelId)
    toast.success('Modele Live mis a jour')
  }, [setLiveModelId])

  const handlePromptChange = useCallback((value: string) => {
    setLiveIdentityPrompt(value)
  }, [setLiveIdentityPrompt])

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

      {/* Model selector */}
      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Modele Live</p>
        <div className="space-y-2">
          {LIVE_MODELS.map((model) => (
            <label
              key={model.id}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                model.enabled
                  ? liveModelId === model.id
                    ? 'border-primary/60 bg-primary/5 cursor-pointer'
                    : 'border-border/40 hover:border-border cursor-pointer'
                  : 'border-border/20 opacity-40 cursor-not-allowed'
              }`}
            >
              <input
                type="radio"
                name="live-model"
                value={model.id}
                checked={liveModelId === model.id}
                disabled={!model.enabled}
                onChange={() => model.enabled && handleModelChange(model.id)}
                className="accent-primary"
              />
              <div className="flex-1">
                <p className={`text-sm font-medium ${model.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {model.label}
                </p>
                <p className="text-[11px] text-muted-foreground">{model.provider}</p>
              </div>
              {!model.enabled && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  bientot
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

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
