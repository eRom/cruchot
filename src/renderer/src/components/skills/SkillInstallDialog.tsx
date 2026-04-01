import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  ShieldAlert,
  ShieldOff,
  X
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

// ── State machine ─────────────────────────────────────────────────────────────

type InstallState =
  | { step: 'input' }
  | { step: 'cloning' }
  | { step: 'scanning' }
  | {
      step: 'scanned'
      tempDir?: string
      localDir?: string
      name: string
      description: string
      matonVerdict: string | null
      matonReport: Record<string, unknown> | null
      gitUrl?: string
      pythonMissing: boolean
    }
  | { step: 'installing' }
  | { step: 'error'; message: string }

interface SkillInstallDialogProps {
  onClose: () => void
  onInstalled: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function VerdictIcon({ verdict }: { verdict: string | null }): React.JSX.Element {
  if (!verdict) return <ShieldOff className="size-8 text-muted-foreground" />
  const upper = verdict.toUpperCase()
  if (upper === 'OK') return <CheckCircle className="size-8 text-emerald-500" />
  if (upper === 'WARNING') return <AlertTriangle className="size-8 text-orange-500" />
  if (upper === 'CRITICAL') return <ShieldAlert className="size-8 text-red-500" />
  return <ShieldOff className="size-8 text-muted-foreground" />
}

function verdictLabel(verdict: string | null, report: Record<string, unknown> | null): string {
  if (!verdict) return 'Maton non installe — scan de securite indisponible'
  const upper = verdict.toUpperCase()
  const summary = report?.summary as { critical?: number; warning?: number } | undefined
  if (upper === 'OK') return 'Aucun probleme detecte'
  if (upper === 'WARNING') {
    const count = summary?.warning ?? 0
    return `${count} avertissement${count > 1 ? 's' : ''} — verifiez les details avant installation`
  }
  if (upper === 'CRITICAL') {
    const cc = summary?.critical ?? 0
    const wc = summary?.warning ?? 0
    const parts = []
    if (cc > 0) parts.push(`${cc} critique${cc > 1 ? 's' : ''}`)
    if (wc > 0) parts.push(`${wc} avertissement${wc > 1 ? 's' : ''}`)
    return `${parts.join(', ')} — ces alertes peuvent etre des faux positifs, verifiez les details`
  }
  return `Verdict : ${verdict}`
}

function FindingsSection({ report }: { report: Record<string, unknown> | null }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const findings = (report?.findings ?? []) as Array<{
    severity: string; rule_id: string; file: string; line: number; description: string
  }>
  if (findings.length === 0) return null

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Voir les {findings.length} finding{findings.length > 1 ? 's' : ''}
      </button>
      {expanded && (
        <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
          {findings.map((f, i) => (
            <div key={i} className="rounded border border-border/40 bg-background px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span className={`font-mono font-medium ${f.severity === 'CRITICAL' ? 'text-red-400' : 'text-orange-400'}`}>
                  {f.rule_id}
                </span>
                <span className="text-muted-foreground">{f.file}:{f.line}</span>
              </div>
              <p className="mt-0.5 text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Dialog ────────────────────────────────────────────────────────────────────

export function SkillInstallDialog({ onClose, onInstalled }: SkillInstallDialogProps): React.JSX.Element {
  const [state, setState] = useState<InstallState>({ step: 'input' })
  const [gitUrl, setGitUrl] = useState('')

  // GitHub flow
  const handleClone = async () => {
    const url = gitUrl.trim()
    if (!url) {
      toast.error('Entrez une URL GitHub')
      return
    }
    setState({ step: 'cloning' })
    try {
      const result = await window.api.skillsInstallGit(url)
      if (!result.success) {
        setState({ step: 'error', message: result.error ?? 'Erreur lors du clonage' })
        return
      }
      setState({ step: 'scanning' })
      // skillsInstallGit already does scan — but if result.phase === 'scanned' we show it
      if (result.phase === 'scanned') {
        setState({
          step: 'scanned',
          tempDir: result.tempDir,
          name: result.name ?? url,
          description: result.description ?? '',
          matonVerdict: result.matonVerdict ?? null,
          matonReport: result.matonReport ?? null,
          gitUrl: url,
          pythonMissing: result.pythonMissing ?? false,
        })
      } else {
        setState({ step: 'error', message: result.error ?? 'Reponse inattendue du serveur' })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors du clonage'
      setState({ step: 'error', message })
    }
  }

  // Local folder flow
  const handlePickFolder = async () => {
    try {
      const files = await window.api.filePick?.()
      if (!files || files.length === 0) return
      const dirPath = files[0].path

      setState({ step: 'scanning' })
      const validation = await window.api.skillsValidate(dirPath)
      if (!validation.success) {
        setState({ step: 'error', message: validation.error ?? 'Dossier invalide' })
        return
      }

      const scanResult = await window.api.skillsScan(dirPath)
      if (!scanResult.success) {
        setState({ step: 'error', message: scanResult.error ?? 'Erreur lors du scan' })
        return
      }

      setState({
        step: 'scanned',
        localDir: dirPath,
        name: scanResult.name ?? validation.name ?? dirPath,
        description: scanResult.description ?? validation.description ?? '',
        matonVerdict: scanResult.matonVerdict ?? null,
        matonReport: scanResult.matonReport ?? null,
        pythonMissing: scanResult.pythonMissing ?? false,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la selection'
      setState({ step: 'error', message })
    }
  }

  // Confirm install
  const handleConfirm = async () => {
    if (state.step !== 'scanned') return
    setState({ step: 'installing' })
    try {
      await window.api.skillsConfirmInstall({
        tempDir: state.tempDir,
        localDir: state.localDir,
        gitUrl: state.gitUrl,
        matonVerdict: state.matonVerdict,
        matonReport: state.matonReport,
      })
      onInstalled()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'installation"
      setState({ step: 'error', message })
    }
  }

  const handleRetry = () => setState({ step: 'input' })

  const isLoading =
    state.step === 'cloning' || state.step === 'scanning' || state.step === 'installing'

  const loadingText =
    state.step === 'cloning'
      ? 'Clonage du repository...'
      : state.step === 'scanning'
        ? 'Analyse de securite en cours...'
        : 'Installation du skill...'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative max-w-lg w-full mx-4 rounded-xl border border-border bg-background p-6 shadow-xl">
        {/* Close button */}
        {!isLoading && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}

        <h2 className="mb-6 text-lg font-semibold text-foreground">Installer un skill</h2>

        {/* Input step */}
        {state.step === 'input' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                URL GitHub
              </label>
              <div className="flex gap-2">
                <Input
                  value={gitUrl}
                  onChange={(e) => setGitUrl(e.target.value)}
                  placeholder="https://github.com/user/skill-repo"
                  onKeyDown={(e) => e.key === 'Enter' && handleClone()}
                />
                <Button onClick={handleClone} disabled={!gitUrl.trim()}>
                  Cloner
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border/60" />
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={handlePickFolder}
            >
              Choisir un dossier local
            </Button>
          </div>
        )}

        {/* Loading steps */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{loadingText}</p>
          </div>
        )}

        {/* Scanned step */}
        {state.step === 'scanned' && (
          <div className="space-y-5">
            {/* Verdict card */}
            <div className="flex items-start gap-4 rounded-lg border border-border/60 bg-sidebar p-4">
              <VerdictIcon verdict={state.matonVerdict} />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground">{state.name}</h3>
                {state.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground/70">{state.description}</p>
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  {verdictLabel(state.matonVerdict, state.matonReport)}
                </p>
                {state.pythonMissing && (
                  <p className="mt-1 text-xs text-orange-500">
                    Python non trouve — l'analyse Maton a ete ignoree
                  </p>
                )}
                <FindingsSection report={state.matonReport} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button
                onClick={handleConfirm}
                variant={
                  state.matonVerdict?.toUpperCase() === 'CRITICAL' || state.matonVerdict?.toUpperCase() === 'WARNING'
                    ? 'outline'
                    : 'default'
                }
                className={
                  state.matonVerdict?.toUpperCase() === 'CRITICAL'
                    ? 'border-red-500/60 text-red-400 hover:bg-red-500/10'
                    : state.matonVerdict?.toUpperCase() === 'WARNING'
                      ? 'border-orange-500/60 text-orange-500 hover:bg-orange-500/10'
                      : undefined
                }
              >
                {state.matonVerdict?.toUpperCase() === 'CRITICAL'
                  ? 'Installer malgre les risques'
                  : state.matonVerdict?.toUpperCase() === 'WARNING'
                    ? 'Installer quand meme'
                    : 'Installer'}
              </Button>
            </div>
          </div>
        )}

        {/* Error step */}
        {state.step === 'error' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-500">{state.message}</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                Fermer
              </Button>
              <Button onClick={handleRetry}>
                Reessayer
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
