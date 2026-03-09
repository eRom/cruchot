import { useSettingsStore } from '@/stores/settings.store'
import { useProvidersStore } from '@/stores/providers.store'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

export function GeneralSettings() {
  const language = useSettingsStore((s) => s.language)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const models = useProvidersStore((s) => s.models)
  const selectedModelId = useProvidersStore((s) => s.selectedModelId)
  const selectedProviderId = useProvidersStore((s) => s.selectedProviderId)
  const selectModel = useProvidersStore((s) => s.selectModel)

  return (
    <section className="space-y-5">
      <h2 className="text-sm font-medium text-foreground">General</h2>

      <div className="space-y-4">
        {/* Language */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Langue</p>
            <p className="text-xs text-muted-foreground">
              Langue de l&apos;interface
            </p>
          </div>
          <Select
            value={language}
            onValueChange={(v) => setLanguage(v as 'fr' | 'en')}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fr">Francais</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Default model */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Modele par defaut</p>
            <p className="text-xs text-muted-foreground">
              Utilise pour les nouvelles conversations
            </p>
          </div>
          <Select
            value={selectedModelId ?? ''}
            onValueChange={(modelId) => {
              const model = models.find((m) => m.id === modelId)
              if (model) {
                selectModel(model.providerId, model.id)
              }
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Choisir un modele" />
            </SelectTrigger>
            <SelectContent>
              {models.length === 0 ? (
                <SelectItem value="__none" disabled>
                  Aucun modele disponible
                </SelectItem>
              ) : (
                models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.displayName}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Send with Enter */}
        <SendWithEnterToggle />
      </div>
    </section>
  )
}

function SendWithEnterToggle() {
  // We use a local approach since the settings store doesn't have this yet.
  // The toggle will be stored in zustand persist via settings store when wired.
  // For now, display the UI with a static default.
  const sendWithEnter = true

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
      <div>
        <p className="text-sm font-medium text-foreground">Envoyer avec Enter</p>
        <p className="text-xs text-muted-foreground">
          {sendWithEnter
            ? 'Enter envoie, Shift+Enter pour retour a la ligne'
            : 'Cmd+Enter envoie, Enter pour retour a la ligne'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={sendWithEnter}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          sendWithEnter ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`pointer-events-none block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${
            sendWithEnter ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
