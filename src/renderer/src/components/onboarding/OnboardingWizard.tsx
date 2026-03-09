import { useState } from 'react'
import { Eye, EyeOff, Check, Sun, Moon, Monitor, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettingsStore, type ThemeMode } from '@/stores/settings.store'
import { OnboardingStep } from './OnboardingStep'

interface OnboardingWizardProps {
  onComplete: () => void
}

const TOTAL_STEPS = 3

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1)

  const handleFinish = async () => {
    try {
      await window.api.setSetting('onboarding_completed', 'true')
    } catch {
      // Settings IPC may not be available yet — continue anyway
    }
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
      <div className="w-full max-w-lg rounded-2xl border border-border/40 bg-background/80 p-8 shadow-xl backdrop-blur-sm">
        {step === 1 && (
          <WelcomeStep
            stepNumber={1}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <ApiKeysStep
            stepNumber={2}
            onNext={() => setStep(3)}
            onPrev={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <ThemeStep
            stepNumber={3}
            onPrev={() => setStep(2)}
            onFinish={handleFinish}
          />
        )}
      </div>
    </div>
  )
}

// ── Step 1: Welcome ────────────────────────────────────────────────────────

function WelcomeStep({
  stepNumber,
  onNext
}: {
  stepNumber: number
  onNext: () => void
}) {
  return (
    <OnboardingStep
      title="Multi-LLM Desktop"
      description="Discutez avec tous vos modeles IA preferes depuis une seule application, 100% locale et privee."
      stepNumber={stepNumber}
      totalSteps={TOTAL_STEPS}
    >
      <div className="flex flex-col items-center gap-6">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="size-10 text-primary" />
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <Check className="size-4 text-primary" />
            OpenAI, Anthropic, Google, Mistral, xAI et plus
          </li>
          <li className="flex items-center gap-2">
            <Check className="size-4 text-primary" />
            Donnees 100% locales, aucune telemetrie
          </li>
          <li className="flex items-center gap-2">
            <Check className="size-4 text-primary" />
            Suivi des couts et statistiques
          </li>
        </ul>
        <Button onClick={onNext} className="w-full">
          Commencer
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </OnboardingStep>
  )
}

// ── Step 2: API Keys ───────────────────────────────────────────────────────

interface ApiKeyField {
  providerId: string
  label: string
  placeholder: string
}

const API_KEY_FIELDS: ApiKeyField[] = [
  { providerId: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { providerId: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { providerId: 'google', label: 'Google AI', placeholder: 'AIza...' }
]

function ApiKeysStep({
  stepNumber,
  onNext,
  onPrev
}: {
  stepNumber: number
  onNext: () => void
  onPrev: () => void
}) {
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [visibility, setVisibility] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  const toggleVisibility = (providerId: string) => {
    setVisibility((prev) => ({ ...prev, [providerId]: !prev[providerId] }))
  }

  const updateKey = (providerId: string, value: string) => {
    setKeys((prev) => ({ ...prev, [providerId]: value }))
  }

  const handleNext = async () => {
    setSaving(true)
    try {
      const entries = Object.entries(keys).filter(([, v]) => v.trim())
      for (const [providerId, apiKey] of entries) {
        await window.api.setApiKey(providerId, apiKey.trim())
      }
    } catch {
      // Continue even if save fails
    } finally {
      setSaving(false)
      onNext()
    }
  }

  return (
    <OnboardingStep
      title="Cles API"
      description="Configurez au moins un fournisseur pour commencer. Vous pourrez en ajouter d'autres plus tard."
      stepNumber={stepNumber}
      totalSteps={TOTAL_STEPS}
    >
      <div className="flex flex-col gap-4">
        <div className="space-y-3">
          {API_KEY_FIELDS.map((field) => (
            <div key={field.providerId} className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {field.label}
              </label>
              <div className="relative">
                <input
                  type={visibility[field.providerId] ? 'text' : 'password'}
                  value={keys[field.providerId] || ''}
                  onChange={(e) => updateKey(field.providerId, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => toggleVisibility(field.providerId)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {visibility[field.providerId] ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onPrev} className="flex-1">
            <ChevronLeft className="size-4" />
            Precedent
          </Button>
          <Button onClick={handleNext} disabled={saving} className="flex-1">
            Suivant
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Passer cette etape
        </button>
      </div>
    </OnboardingStep>
  )
}

// ── Step 3: Theme ──────────────────────────────────────────────────────────

function ThemeStep({
  stepNumber,
  onPrev,
  onFinish
}: {
  stepNumber: number
  onPrev: () => void
  onFinish: () => void
}) {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  const themeOptions: { value: ThemeMode; label: string; icon: React.ReactNode; preview: string }[] = [
    {
      value: 'light',
      label: 'Clair',
      icon: <Sun className="size-5" />,
      preview: 'bg-white border-gray-200'
    },
    {
      value: 'dark',
      label: 'Sombre',
      icon: <Moon className="size-5" />,
      preview: 'bg-gray-900 border-gray-700'
    },
    {
      value: 'system',
      label: 'Systeme',
      icon: <Monitor className="size-5" />,
      preview: 'bg-gradient-to-r from-white to-gray-900 border-gray-400'
    }
  ]

  return (
    <OnboardingStep
      title="Apparence"
      description="Choisissez le theme qui vous convient."
      stepNumber={stepNumber}
      totalSteps={TOTAL_STEPS}
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex flex-col items-center gap-3 rounded-xl border-2 p-4 transition-colors ${
                theme === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-border/80 hover:bg-accent/50'
              }`}
            >
              {/* Preview swatch */}
              <div
                className={`h-12 w-full rounded-lg border ${opt.preview}`}
              />
              <div className="flex items-center gap-1.5">
                {opt.icon}
                <span className="text-sm font-medium">{opt.label}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onPrev} className="flex-1">
            <ChevronLeft className="size-4" />
            Precedent
          </Button>
          <Button onClick={onFinish} className="flex-1">
            Terminer
            <Check className="size-4" />
          </Button>
        </div>
      </div>
    </OnboardingStep>
  )
}
