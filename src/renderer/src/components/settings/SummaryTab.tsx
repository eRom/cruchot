import { useSettingsStore } from '@/stores/settings.store'
import { useProvidersStore } from '@/stores/providers.store'

const DEFAULT_PROMPT = `Tu es un assistant specialise dans la synthese de conversations. Genere un resume structure et concis de la conversation suivante.

Le resume doit inclure :
- Les sujets principaux abordes
- Les decisions prises ou conclusions atteintes
- Les actions ou taches mentionnees
- Les points cles a retenir

Format : sections avec titres, bullet points. Sois concis mais complet.`

export function SummaryTab() {
  const summaryModelId = useSettingsStore((s) => s.summaryModelId) ?? ''
  const summaryPrompt = useSettingsStore((s) => s.summaryPrompt) ?? DEFAULT_PROMPT
  const setSummaryModelId = useSettingsStore((s) => s.setSummaryModelId)
  const setSummaryPrompt = useSettingsStore((s) => s.setSummaryPrompt)

  const providers = useProvidersStore((s) => s.providers)
  const models = useProvidersStore((s) => s.models)

  // Only text models from configured providers
  const textModels = models.filter((m) => {
    if (m.type !== 'text') return false
    const provider = providers.find((p) => p.id === m.providerId)
    return provider?.isConfigured
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground">Resume</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configurez le modele et le prompt utilises pour generer les resumes de conversation.
        </p>
      </div>

      {/* Model selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Modele</label>
        <select
          value={summaryModelId}
          onChange={(e) => setSummaryModelId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">-- Selectionner un modele --</option>
          {textModels.map((m) => {
            const provider = providers.find((p) => p.id === m.providerId)
            return (
              <option key={`${m.providerId}::${m.id}`} value={`${m.providerId}::${m.id}`}>
                {provider?.name ?? m.providerId} - {m.displayName}
              </option>
            )
          })}
        </select>
        {!summaryModelId && (
          <p className="text-xs text-muted-foreground">
            Selectionnez un modele pour activer le bouton Resume dans la barre de tokens.
          </p>
        )}
      </div>

      {/* Prompt */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">Prompt</label>
          <button
            onClick={() => setSummaryPrompt(DEFAULT_PROMPT)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reinitialiser
          </button>
        </div>
        <textarea
          value={summaryPrompt}
          onChange={(e) => setSummaryPrompt(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring resize-y"
        />
      </div>
    </div>
  )
}
