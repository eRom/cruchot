import { Button } from '@/components/ui/button'
import type { BardaImportReport, BardaParseError, ParsedBarda } from '../../../../preload/types'
import {
  AlertTriangle,
  BookOpen,
  Brain,
  Check,
  FileText,
  Plug,
  Terminal,
  Users,
  Wrench,
  X
} from 'lucide-react'

// ── Preview before import ───────────────────────────────────

interface BardaPreviewProps {
  parsed: ParsedBarda
  onConfirm: () => void
  onCancel: () => void
  isImporting: boolean
}

const SECTION_CONFIG = [
  { key: 'roles' as const, icon: Users, label: 'Roles' },
  { key: 'commands' as const, icon: Terminal, label: 'Commandes' },
  { key: 'prompts' as const, icon: FileText, label: 'Prompts' },
  { key: 'fragments' as const, icon: Brain, label: 'Fragments' },
  { key: 'libraries' as const, icon: BookOpen, label: 'Referentiels' },
  { key: 'mcp' as const, icon: Plug, label: 'MCP' },
  { key: 'skills' as const, icon: Wrench, label: 'Skills' }
]

export function BardaPreview({ parsed, onConfirm, onCancel, isImporting }: BardaPreviewProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-foreground">{parsed.metadata.name}</h3>
        <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
          {parsed.metadata.namespace}
        </span>
        {parsed.metadata.description && (
          <p className="mt-1 text-xs text-muted-foreground/70">{parsed.metadata.description}</p>
        )}
        {(parsed.metadata.version || parsed.metadata.author) && (
          <p className="mt-0.5 text-[11px] text-muted-foreground/50">
            {parsed.metadata.version && `v${parsed.metadata.version}`}
            {parsed.metadata.version && parsed.metadata.author && ' — '}
            {parsed.metadata.author}
          </p>
        )}
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {SECTION_CONFIG.map(({ key, icon: Icon, label }) => {
          const items = parsed[key]
          if (!items || items.length === 0) return null
          return (
            <div key={key}>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon className="size-3.5" />
                {items.length} {label}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {items.map((item) => (
                  <span
                    key={item.name}
                    className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {item.name}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-border/40 pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isImporting}>
          <X className="size-3.5 mr-1" />
          Annuler
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={isImporting}>
          <Check className="size-3.5 mr-1" />
          Confirmer l'import
        </Button>
      </div>
    </div>
  )
}

// ── Parse error display ─────────────────────────────────────

interface BardaParseErrorDisplayProps {
  error: BardaParseError
  onClose: () => void
}

export function BardaParseErrorDisplay({ error, onClose }: BardaParseErrorDisplayProps) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">Fichier invalide</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ligne {error.line} : {error.message}
          </p>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={onClose}>
        Fermer
      </Button>
    </div>
  )
}

// ── Import report display ───────────────────────────────────

interface BardaImportReportDisplayProps {
  report: BardaImportReport
  onClose: () => void
}

export function BardaImportReportDisplay({ report, onClose }: BardaImportReportDisplayProps) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4">
      <div className="flex items-start gap-2">
        <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Import reussi — {report.succes.length} ressources
          </p>
        </div>
      </div>

      {/* Succes list */}
      {report.succes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Importees :</p>
          <div className="flex flex-wrap gap-1">
            {report.succes.map((s, i) => (
              <span key={i} className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Skips */}
      {report.skips.length > 0 && (
        <div>
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Ignorees :</p>
          <div className="space-y-1">
            {report.skips.map((skip, i) => (
              <p key={i} className="text-[11px] text-muted-foreground">
                <span className="font-medium">{skip.type}: {skip.name}</span> — {skip.reason}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {report.warnings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Avertissements :</p>
          {report.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-muted-foreground">{w}</p>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/60 italic">
        Redemarrez l'application pour que les nouvelles ressources soient disponibles dans toutes les vues.
      </p>

      <Button variant="ghost" size="sm" onClick={onClose}>
        Fermer
      </Button>
    </div>
  )
}
