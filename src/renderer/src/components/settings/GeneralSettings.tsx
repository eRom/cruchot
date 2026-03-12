import { useSettingsStore } from '@/stores/settings.store'
import { useProvidersStore } from '@/stores/providers.store'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Trash2, Upload } from 'lucide-react'

export function GeneralSettings() {
  const language = useSettingsStore((s) => s.language)
  const setLanguage = useSettingsStore((s) => s.setLanguage)
  const defaultModelId = useSettingsStore((s) => s.defaultModelId) ?? ''
  const setDefaultModelId = useSettingsStore((s) => s.setDefaultModelId)
  const models = useProvidersStore((s) => s.models)
  const selectModel = useProvidersStore((s) => s.selectModel)
  const userName = useSettingsStore((s) => s.userName) ?? ''
  const setUserName = useSettingsStore((s) => s.setUserName)
  const userAvatarPath = useSettingsStore((s) => s.userAvatarPath) ?? ''
  const setUserAvatarPath = useSettingsStore((s) => s.setUserAvatarPath)

  const handleSelectAvatar = async () => {
    const path = await window.api.selectAvatar()
    if (path) {
      setUserAvatarPath(path)
    }
  }

  const handleRemoveAvatar = async () => {
    await window.api.removeAvatar()
    setUserAvatarPath('')
  }

  return (
    <section className="space-y-5">
      <h2 className="text-sm font-medium text-foreground">General</h2>

      <div className="space-y-4">
        {/* Profile */}
        <div className="flex items-center gap-4 rounded-lg border border-border/60 p-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={handleSelectAvatar}
              className="group relative flex size-16 items-center justify-center overflow-hidden rounded-full bg-sidebar-primary transition-opacity hover:opacity-80"
              title="Changer l'avatar"
            >
              {userAvatarPath ? (
                <img
                  src={`local-image://${userAvatarPath}`}
                  alt="Avatar"
                  className="size-full object-cover"
                />
              ) : (
                <span className="text-xl font-semibold text-sidebar-primary-foreground">?</span>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Upload className="size-5 text-white" />
              </div>
            </button>
            {userAvatarPath && (
              <button
                type="button"
                onClick={handleRemoveAvatar}
                className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-opacity hover:opacity-80"
                title="Supprimer l'avatar"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
          {/* Name */}
          <div className="flex-1">
            <p className="mb-1 text-sm font-medium text-foreground">Profil</p>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Anonymous"
              className="w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              maxLength={50}
            />
          </div>
        </div>
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
            value={defaultModelId}
            onValueChange={(value) => {
              setDefaultModelId(value)
              // Also apply immediately as active model
              const [providerId, modelId] = value.split('::')
              if (providerId && modelId) {
                selectModel(providerId, modelId)
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
                models.filter((m) => m.type === 'text').map((model) => (
                  <SelectItem key={model.id} value={`${model.providerId}::${model.id}`}>
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
