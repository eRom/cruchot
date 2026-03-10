import { useEffect, useState, useCallback } from 'react'
import { Volume2, Play, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useSettingsStore, type TtsProvider } from '@/stores/settings.store'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'

interface ProviderOption {
  id: TtsProvider
  name: string
}

export function AudioSettings() {
  const ttsProvider = useSettingsStore((s) => s.ttsProvider) ?? 'browser'
  const setTtsProvider = useSettingsStore((s) => s.setTtsProvider)

  const [providers, setProviders] = useState<ProviderOption[]>([
    { id: 'browser', name: 'Navigateur (Web Speech)' }
  ])
  const [isTesting, setIsTesting] = useState(false)

  const { play, stop, state } = useAudioPlayer()

  // Load available providers
  useEffect(() => {
    window.api.ttsGetAvailableProviders().then((available) => {
      setProviders(available as ProviderOption[])

      // If current provider is no longer available (key removed), fallback
      const ids = available.map((p) => p.id)
      if (!ids.includes(ttsProvider)) {
        setTtsProvider('browser')
      }
    })
  }, [ttsProvider, setTtsProvider])

  const handleTest = useCallback(() => {
    if (state === 'playing') {
      stop()
      setIsTesting(false)
      return
    }
    setIsTesting(true)
    play('Bonjour, ceci est un test de synthese vocale.')
    // Reset testing state after a reasonable time
    setTimeout(() => setIsTesting(false), 5000)
  }, [state, play, stop])

  // Reset testing when playback ends
  useEffect(() => {
    if (state === 'idle' && isTesting) {
      setIsTesting(false)
    }
  }, [state, isTesting])

  return (
    <div className="space-y-8">
      {/* TTS Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Volume2 className="size-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Synthese vocale (TTS)</h2>
        </div>

        <div className="space-y-4 rounded-lg border border-border/40 bg-card p-4">
          {/* Provider select */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Provider</p>
              <p className="text-xs text-muted-foreground">
                Choisissez le moteur de synthese vocale
              </p>
            </div>
            <Select
              value={ttsProvider}
              onValueChange={(value) => setTtsProvider(value as TtsProvider)}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Provider info */}
          {ttsProvider !== 'browser' && (
            <p className="text-xs text-muted-foreground/70">
              Utilise la cle API {ttsProvider === 'openai' ? 'OpenAI' : ttsProvider === 'google' ? 'Google' : 'Mistral'} configuree dans Cles API.
              {ttsProvider === 'openai' && ' Cout : ~$2.40 / million de caracteres.'}
              {ttsProvider === 'google' && ' Preview gratuit.'}
            </p>
          )}

          {/* Test button */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={state === 'playing' && !isTesting}
              className="gap-2"
            >
              {isTesting && state === 'playing' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              {isTesting && state === 'playing' ? 'Lecture en cours...' : 'Tester la voix'}
            </Button>
          </div>
        </div>
      </div>

      {/* STT Section — placeholder */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Volume2 className="size-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Reconnaissance vocale (STT)</h2>
        </div>

        <div className="rounded-lg border border-border/40 bg-card p-4">
          <p className="text-sm text-muted-foreground">Bientot disponible</p>
        </div>
      </div>
    </div>
  )
}
