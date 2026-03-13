import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Network, Pencil, RotateCw, Trash2, Wrench } from 'lucide-react'
import { useState } from 'react'
import type { McpServerInfo } from '../../../../preload/types'

interface McpServerCardProps {
  server: McpServerInfo
  onEdit: (id: string) => void
  onToggle: (id: string) => void
  onRestart: (id: string) => void
  onDelete: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  error: 'bg-red-500/10 text-red-600 dark:text-red-400',
  stopped: 'bg-muted text-muted-foreground'
}

const STATUS_DOT: Record<string, string> = {
  connected: 'bg-emerald-500',
  error: 'bg-red-500',
  stopped: 'bg-muted-foreground'
}

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connecte',
  error: 'Erreur',
  stopped: 'Arrete'
}

const TRANSPORT_COLORS: Record<string, string> = {
  stdio: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  sse: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  http: 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
}

export function McpServerCard({ server, onEdit, onToggle, onRestart, onDelete }: McpServerCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200',
        'hover:shadow-md hover:border-border',
        'bg-card border-border/60',
        !server.isEnabled && 'opacity-60'
      )}
    >
      {/* Color bar */}
      <div className="h-1.5 w-full bg-gray-500" />

      <div className="flex flex-1 flex-col p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-4 shrink-0 items-center justify-center">
              {server.icon
                ? <span className="text-sm">{server.icon}</span>
                : <Network className="size-4 text-muted-foreground" />
              }
            </div>
            <h3 className="text-sm font-semibold text-foreground leading-snug truncate">
              {server.name}
            </h3>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Hover actions */}
            <div
              className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onEdit(server.id)}
                className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Modifier"
              >
                <Pencil className="size-3.5" />
              </button>
              {server.isEnabled && (
                <button
                  onClick={() => onRestart(server.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Redemarrer"
                >
                  <RotateCw className="size-3.5" />
                </button>
              )}
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Supprimer"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>

            {/* Toggle */}
            <button
              onClick={() => onToggle(server.id)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                server.isEnabled ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'inline-block size-3.5 rounded-full bg-white shadow-sm transition-transform',
                  server.isEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                )}
              />
            </button>
          </div>
        </div>

        {/* Badges: transport + status */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              TRANSPORT_COLORS[server.transportType] ?? 'bg-muted text-muted-foreground'
            )}
          >
            {server.transportType}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
              STATUS_COLORS[server.status]
            )}
          >
            <span className={cn('size-1.5 rounded-full', STATUS_DOT[server.status])} />
            {STATUS_LABELS[server.status]}
          </span>
          {server.status === 'connected' && server.toolCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              <Wrench className="size-2.5" />
              {server.toolCount} outil{server.toolCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Description preview */}
        {server.description && (
          <div className="mt-3 rounded-md bg-muted/40 px-2.5 py-2">
            <p className="text-[11px] leading-relaxed text-muted-foreground/70 line-clamp-3">
              {server.description}
            </p>
          </div>
        )}

        {/* Error message */}
        {server.status === 'error' && server.error && (
          <div className="mt-3 rounded-md bg-red-500/5 px-2.5 py-2">
            <p className="text-[11px] leading-relaxed text-red-400 line-clamp-2" title={server.error}>
              {server.error}
            </p>
          </div>
        )}

        {/* Footer spacer */}
        <div className="mt-auto pt-3" />
      </div>

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-background/90 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-medium text-foreground">
              Supprimer &quot;{server.name}&quot; ?
            </p>
            <p className="text-xs text-muted-foreground">Cette action est irreversible.</p>
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={() => { onDelete(server.id); setConfirmDelete(false) }}>
                Supprimer
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
