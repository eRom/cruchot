import React from 'react'
import { Network, Pencil, RotateCw, Trash2, Wrench } from 'lucide-react'
import type { McpServerInfo } from '../../../../preload/types'
import { cn } from '@/lib/utils'

interface McpServerCardProps {
  server: McpServerInfo
  onEdit: (id: string) => void
  onToggle: (id: string) => void
  onRestart: (id: string) => void
  onDelete: (id: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'text-emerald-500',
  error: 'text-red-500',
  stopped: 'text-muted-foreground'
}

const STATUS_LABELS: Record<string, string> = {
  connected: 'Connecte',
  error: 'Erreur',
  stopped: 'Arrete'
}

export function McpServerCard({ server, onEdit, onToggle, onRestart, onDelete }: McpServerCardProps) {
  return (
    <div
      className="group relative flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <button
          onClick={() => onEdit(server.id)}
          className="flex items-center gap-2.5 text-left"
        >
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted/60 text-lg">
            {server.icon || <Network className="size-4 text-muted-foreground" />}
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">{server.name}</div>
            <div className="text-xs text-muted-foreground">{server.transportType}</div>
          </div>
        </button>

        {/* Toggle */}
        <button
          onClick={() => onToggle(server.id)}
          className={cn(
            'relative h-5 w-9 rounded-full transition-colors',
            server.isEnabled ? 'bg-primary' : 'bg-muted'
          )}
        >
          <div
            className={cn(
              'absolute top-0.5 size-4 rounded-full bg-white transition-transform',
              server.isEnabled ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </button>
      </div>

      {/* Status + Tools */}
      <div className="flex items-center gap-3 text-xs">
        <span className={cn('flex items-center gap-1', STATUS_COLORS[server.status])}>
          <span className={cn(
            'size-1.5 rounded-full',
            server.status === 'connected' ? 'bg-emerald-500' :
            server.status === 'error' ? 'bg-red-500' : 'bg-muted-foreground'
          )} />
          {STATUS_LABELS[server.status]}
        </span>
        {server.status === 'connected' && server.toolCount > 0 && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Wrench className="size-3" />
            {server.toolCount} outil{server.toolCount > 1 ? 's' : ''}
          </span>
        )}
        {server.status === 'error' && server.error && (
          <span className="truncate text-red-400" title={server.error}>
            {server.error.slice(0, 40)}
          </span>
        )}
      </div>

      {/* Description */}
      {server.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{server.description}</p>
      )}

      {/* Actions (hover) */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => onEdit(server.id)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Modifier"
        >
          <Pencil className="size-3.5" />
        </button>
        {server.isEnabled && (
          <button
            onClick={() => onRestart(server.id)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Redemarrer"
          >
            <RotateCw className="size-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(server.id)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
          title="Supprimer"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
