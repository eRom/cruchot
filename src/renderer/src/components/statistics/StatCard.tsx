import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string
  icon: ReactNode
  trend?: {
    value: number
    label: string
  }
}

export function StatCard({ title, value, icon, trend }: StatCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border/40',
        'bg-card p-4 shadow-sm',
        'transition-shadow duration-200 hover:shadow-md'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{title}</span>
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted/50">
          {icon}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold tracking-tight text-foreground">{value}</span>

        {trend && (
          <span
            className={cn(
              'mb-0.5 text-xs font-medium',
              trend.value >= 0 ? 'text-green-500' : 'text-red-500'
            )}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value.toFixed(1)}% {trend.label}
          </span>
        )}
      </div>
    </div>
  )
}
