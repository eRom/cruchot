import { useState, useCallback } from 'react'
import { Sparkles, Target, Scale, Cpu, ImageIcon, SlidersHorizontal } from 'lucide-react'
import { useSettingsStore } from '@/stores/settings.store'
import { ModelTableLLM } from './ModelTableLLM'
import { ModelTableImages } from './ModelTableImages'
import { cn } from '@/lib/utils'

type SubTab = 'llm' | 'images' | 'params'

const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'llm', label: 'Modeles LLM', icon: <Cpu className="size-3.5" /> },
  { id: 'images', label: 'Modeles Images', icon: <ImageIcon className="size-3.5" /> },
  { id: 'params', label: 'Parametres', icon: <SlidersHorizontal className="size-3.5" /> }
]

export function ModelSettings() {
  const [activeTab, setActiveTab] = useState<SubTab>('llm')

  return (
    <div className="space-y-6">
      {/* Sub-tab bar */}
      <div className="flex gap-2">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border/60 text-muted-foreground hover:border-border hover:bg-accent/50'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'llm' && <ModelTableLLM />}
      {activeTab === 'images' && <ModelTableImages />}
      {activeTab === 'params' && <ModelParamsSettings />}
    </div>
  )
}

// ── Params sub-tab (extracted from previous ModelSettings) ──────────────

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

function ModelParamsSettings() {
  const temperature = useSettingsStore((s) => s.temperature)
  const maxTokens = useSettingsStore((s) => s.maxTokens)
  const topP = useSettingsStore((s) => s.topP)
  const setTemperature = useSettingsStore((s) => s.setTemperature)
  const setMaxTokens = useSettingsStore((s) => s.setMaxTokens)
  const setTopP = useSettingsStore((s) => s.setTopP)

  const applyPreset = useCallback(
    (preset: PresetConfig) => {
      setTemperature(preset.temperature)
      setTopP(preset.topP)
    },
    [setTemperature, setTopP]
  )

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Parametres du modele</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ces parametres s'appliquent a tous les modeles.
        </p>
      </div>

      {/* Presets */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">Presets</label>
        <div className="flex gap-2">
          {PRESETS.map((preset) => {
            const isActive =
              Math.abs(temperature - preset.temperature) < 0.01 &&
              Math.abs(topP - preset.topP) < 0.01
            return (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:border-border hover:bg-accent/50'
                )}
              >
                {preset.icon}
                {preset.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Temperature */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-foreground">Temperature</label>
            <p className="text-xs text-muted-foreground">
              Controle le caractere aleatoire des reponses. Plus eleve = plus creatif.
            </p>
          </div>
          <span className="text-sm font-mono font-medium text-foreground tabular-nums">
            {temperature.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/50">
          <span>0 — Deterministe</span>
          <span>2 — Tres creatif</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-foreground">Max Tokens</label>
            <p className="text-xs text-muted-foreground">
              Nombre maximum de tokens dans la reponse.
            </p>
          </div>
          <span className="text-sm font-mono font-medium text-foreground tabular-nums">
            {maxTokens}
          </span>
        </div>
        <input
          type="range"
          min={256}
          max={8192}
          step={256}
          value={maxTokens}
          onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/50">
          <span>256</span>
          <span>8192</span>
        </div>
      </div>

      {/* Top P */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-foreground">Top P</label>
            <p className="text-xs text-muted-foreground">
              Echantillonnage par noyau. Limite les tokens consideres.
            </p>
          </div>
          <span className="text-sm font-mono font-medium text-foreground tabular-nums">
            {topP.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={topP}
          onChange={(e) => setTopP(parseFloat(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/50">
          <span>0 — Restrictif</span>
          <span>1 — Large</span>
        </div>
      </div>
    </div>
  )
}
