import { cn } from '@/lib/utils'

const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'] as const

export type AspectRatio = (typeof RATIOS)[number]

interface AspectRatioSelectorProps {
  value: AspectRatio
  onChange: (ratio: AspectRatio) => void
  disabled?: boolean
}

export function AspectRatioSelector({ value, onChange, disabled }: AspectRatioSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {RATIOS.map((ratio) => (
        <button
          key={ratio}
          type="button"
          disabled={disabled}
          onClick={() => onChange(ratio)}
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-medium transition-all duration-150',
            'border',
            value === ratio
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          {ratio}
        </button>
      ))}
    </div>
  )
}
