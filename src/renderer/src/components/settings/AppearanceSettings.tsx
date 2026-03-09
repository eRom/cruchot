import { useSettingsStore, type ThemeMode, type Density } from '@/stores/settings.store'
import { Sun, Moon, Monitor } from 'lucide-react'

export function AppearanceSettings() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const fontSizePx = useSettingsStore((s) => s.fontSizePx)
  const setFontSizePx = useSettingsStore((s) => s.setFontSizePx)
  const density = useSettingsStore((s) => s.density)
  const setDensity = useSettingsStore((s) => s.setDensity)
  const messageWidth = useSettingsStore((s) => s.messageWidth)
  const setMessageWidth = useSettingsStore((s) => s.setMessageWidth)

  const themeOptions: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: 'light', label: 'Clair', icon: <Sun className="size-4" /> },
    { value: 'dark', label: 'Sombre', icon: <Moon className="size-4" /> },
    { value: 'system', label: 'Systeme', icon: <Monitor className="size-4" /> }
  ]

  const densityOptions: { value: Density; label: string }[] = [
    { value: 'compact', label: 'Compact' },
    { value: 'normal', label: 'Normal' },
    { value: 'comfortable', label: 'Confortable' }
  ]

  return (
    <section className="space-y-5">
      <h2 className="text-sm font-medium text-foreground">Apparence</h2>

      <div className="space-y-4">
        {/* Theme */}
        <div className="rounded-lg border border-border/60 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Theme</p>
          <div className="flex gap-2">
            {themeOptions.map((opt) => (
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
        </div>

        {/* Font size */}
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Taille de police</p>
              <p className="text-xs text-muted-foreground">{fontSizePx}px</p>
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">{fontSizePx}px</span>
          </div>
          <input
            type="range"
            min={12}
            max={20}
            step={1}
            value={fontSizePx}
            onChange={(e) => setFontSizePx(Number(e.target.value))}
            className="mt-3 w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/60">
            <span>12px</span>
            <span>20px</span>
          </div>
        </div>

        {/* Density */}
        <div className="rounded-lg border border-border/60 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Densite d&apos;affichage</p>
          <div className="flex gap-2">
            {densityOptions.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors ${
                  density === opt.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <input
                  type="radio"
                  name="density"
                  value={opt.value}
                  checked={density === opt.value}
                  onChange={() => setDensity(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Message width */}
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Largeur max des messages</p>
              <p className="text-xs text-muted-foreground">Zone de lecture</p>
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">{messageWidth}%</span>
          </div>
          <input
            type="range"
            min={60}
            max={100}
            step={5}
            value={messageWidth}
            onChange={(e) => setMessageWidth(Number(e.target.value))}
            className="mt-3 w-full accent-primary"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/60">
            <span>60%</span>
            <span>100%</span>
          </div>
        </div>
      </div>
    </section>
  )
}
