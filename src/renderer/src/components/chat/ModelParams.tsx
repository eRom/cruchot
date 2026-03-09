import { useCallback, useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles, Target, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ModelParamsConfig {
  temperature: number
  maxTokens: number
  topP: number
  extendedThinking: boolean
}

interface ModelParamsProps {
  params: ModelParamsConfig
  onChange: (params: ModelParamsConfig) => void
  providerId?: string
}

interface PresetConfig {
  label: string
  icon: React.ReactNode
  temperature: number
  topP: number
}

const PRESETS: PresetConfig[] = [
  { label: 'Creatif', icon: <Sparkles className="size-3.5" />, temperature: 1.0, topP: 0.95 },
  { label: 'Equilibre', icon: <Scale className="size-3.5" />, temperature: 0.7, topP: 0.5 },
  { label: 'Precis', icon: <Target className="size-3.5" />, temperature: 0.2, topP: 0.1 }
]

export function ModelParams({ params, onChange, providerId }: ModelParamsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const updateParam = useCallback(
    <K extends keyof ModelParamsConfig>(key: K, value: ModelParamsConfig[K]) => {
      onChange({ ...params, [key]: value })
    },
    [params, onChange]
  )

  const applyPreset = useCallback(
    (preset: PresetConfig) => {
      onChange({
        ...params,
        temperature: preset.temperature,
        topP: preset.topP
      })
    },
    [params, onChange]
  )

  return (
    <div className="w-full">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center justify-between',
          'rounded-lg px-3 py-1.5',
          'text-xs text-muted-foreground',
          'transition-colors duration-150 hover:bg-muted/50'
        )}
      >
        <span>Parametres du modele</span>
        {isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>

      {/* Collapsible panel */}
      {isOpen && (
        <div
          className={cn(
            'mt-1 flex flex-col gap-4 rounded-lg border border-border/40',
            'bg-muted/20 px-4 py-3',
            'animate-in slide-in-from-top-1 fade-in duration-200'
          )}
        >
          {/* Presets */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Presets
            </span>
            <div className="flex gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    'flex items-center gap-1 rounded-md',
                    'border border-border/40 px-2 py-1',
                    'text-xs text-muted-foreground',
                    'transition-colors duration-150',
                    'hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  {preset.icon}
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Temperature slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Temperature</label>
              <span className="text-xs font-mono text-foreground">
                {params.temperature.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={params.temperature}
              onChange={(e) => updateParam('temperature', parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
          </div>

          {/* Max Tokens slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Max Tokens</label>
              <span className="text-xs font-mono text-foreground">{params.maxTokens}</span>
            </div>
            <input
              type="range"
              min={256}
              max={8192}
              step={256}
              value={params.maxTokens}
              onChange={(e) => updateParam('maxTokens', parseInt(e.target.value, 10))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
          </div>

          {/* Top P slider */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Top P</label>
              <span className="text-xs font-mono text-foreground">
                {params.topP.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.topP}
              onChange={(e) => updateParam('topP', parseFloat(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
            />
          </div>

          {/* Extended Thinking toggle — Anthropic only */}
          {providerId === 'anthropic' && (
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">Reflexion etendue</label>
              <button
                type="button"
                role="switch"
                aria-checked={params.extendedThinking}
                onClick={() => updateParam('extendedThinking', !params.extendedThinking)}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full',
                  'border-2 border-transparent transition-colors duration-200',
                  params.extendedThinking ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none block size-4 rounded-full bg-white shadow-sm',
                    'transition-transform duration-200',
                    params.extendedThinking ? 'translate-x-4' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
