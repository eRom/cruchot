import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertTriangle,
  Bot,
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
  | { step: 'analyzing' }
  | {
      step: 'ready'
      tempDir?: string
      localDir?: string
      name: string
      description: string
      matonVerdict: string | null
      matonReport: Record<string, unknown> | null
      gitUrl?: string
      pythonMissing: boolean
      // LLM analysis
      analyzeText: string | null
      analyzeModel: string | null
      analyzeCost: number | null
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

function scannerLabel(verdict: string | null, report: Record<string, unknown> | null): string {
  if (!verdict) return 'Scanner non disponible'
  const upper = verdict.toUpperCase()
  const summary = report?.summary as { critical?: number; warning?: number } | undefined
  if (upper === 'OK') return 'Aucun probleme detecte'
  const parts: string[] = []
  if ((summary?.critical ?? 0) > 0) parts.push(`${summary!.critical} critique${summary!.critical! > 1 ? 's' : ''}`)
  if ((summary?.warning ?? 0) > 0) parts.push(`${summary!.warning} avertissement${summary!.warning! > 1 ? 's' : ''}`)
  return parts.join(', ')
}

function FindingsSection({ report }: { report: Record<string, unknown> | null }): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const findings = (report?.findings ?? []) as Array<{
    severity: string; rule_id: string; file: string; line: number; description: string
  }>
  if (findings.length === 0) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        Details ({findings.length} finding{findings.length > 1 ? 's' : ''})
      </button>
      {expanded && (
        <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
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

  // GitHub flow: clone → scan → analyze → ready
  const handleClone = async () => {
    const url = gitUrl.trim()
    if (!url) { toast.error('Entrez une URL GitHub'); return }

    setState({ step: 'cloning' })
    try {
      const result = await window.api.skillsInstallGit(url)
      if (!result.success) {
        setState({ step: 'error', message: result.error ?? 'Erreur lors du clonage' })
        return
      }
      if (result.phase !== 'scanned') {
        setState({ step: 'error', message: result.error ?? 'Reponse inattendue' })
        return
      }

      // Now run LLM analysis if Maton+model are available
      const analyzeResult = await runAnalysis(result.tempDir)

      setState({
        step: 'ready',
        tempDir: result.tempDir,
        name: result.name ?? url,
        description: result.description ?? '',
        matonVerdict: result.matonVerdict ?? null,
        matonReport: result.matonReport ?? null,
        gitUrl: url,
        pythonMissing: result.pythonMissing ?? false,
        analyzeText: analyzeResult?.text ?? null,
        analyzeModel: analyzeResult?.model ?? null,
        analyzeCost: analyzeResult?.cost ?? null
      })
    } catch (err: unknown) {
      setState({ step: 'error', message: err instanceof Error ? err.message : 'Erreur' })
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

      // Run LLM analysis
      const analyzeResult = await runAnalysis(dirPath)

      setState({
        step: 'ready',
        localDir: dirPath,
        name: validation.name ?? dirPath,
        description: validation.description ?? '',
        matonVerdict: null,
        matonReport: null,
        pythonMissing: false,
        analyzeText: analyzeResult?.text ?? null,
        analyzeModel: analyzeResult?.model ?? null,
        analyzeCost: analyzeResult?.cost ?? null
      })
    } catch (err: unknown) {
      setState({ step: 'error', message: err instanceof Error ? err.message : 'Erreur' })
    }
  }

  // LLM analysis via Maton skill
  const runAnalysis = async (targetDir?: string): Promise<{ text: string; model: string; cost: number } | null> => {
    if (!targetDir) return null
    setState({ step: 'analyzing' })
    try {
      const result = await window.api.skillsAnalyze(targetDir)
      if (!result.success) {
        // Not fatal — just skip analysis (maton not installed or no default model)
        console.warn('[SkillInstall] Analysis skipped:', result.error)
        return null
      }
      return { text: result.text ?? '', model: result.model ?? '', cost: result.cost ?? 0 }
    } catch {
      return null
    }
  }

  // Confirm install
  const handleConfirm = async () => {
    if (state.step !== 'ready') return
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
      setState({ step: 'error', message: err instanceof Error ? err.message : "Erreur lors de l'installation" })
    }
  }

  const isLoading = state.step === 'cloning' || state.step === 'scanning' || state.step === 'analyzing' || state.step === 'installing'

  const loadingText =
    state.step === 'cloning' ? 'Clonage du repository...'
    : state.step === 'scanning' ? 'Validation du skill...'
    : state.step === 'analyzing' ? 'Analyse de securite en cours...'
    : 'Installation du skill...'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative mx-4 w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
        {/* Close */}
        {!isLoading && (
          <button onClick={onClose} className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        )}

        <h2 className="mb-6 text-lg font-semibold text-foreground">Installer un skill</h2>

        {/* Input */}
        {state.step === 'input' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">URL GitHub</label>
              <div className="flex gap-2">
                <Input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} placeholder="https://github.com/user/skill-repo" onKeyDown={(e) => e.key === 'Enter' && handleClone()} />
                <Button onClick={handleClone} disabled={!gitUrl.trim()}>Cloner</Button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-xs text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <Button variant="outline" className="w-full" onClick={handlePickFolder}>Choisir un dossier local</Button>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{loadingText}</p>
          </div>
        )}

        {/* Ready — show analysis results */}
        {state.step === 'ready' && (
          <div className="space-y-4">
            {/* Skill info */}
            <div>
              <h3 className="font-semibold text-foreground">{state.name}</h3>
              {state.description && (
                <p className="mt-0.5 text-sm text-muted-foreground/70">{state.description}</p>
              )}
            </div>

            {/* Scanner verdict (pattern matching) */}
            {state.matonVerdict && (
              <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-sidebar p-3">
                <VerdictIcon verdict={state.matonVerdict} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Scanner</span>
                    <span className={`text-xs font-semibold ${
                      state.matonVerdict === 'OK' ? 'text-emerald-500'
                      : state.matonVerdict === 'WARNING' ? 'text-orange-500'
                      : 'text-red-400'
                    }`}>{state.matonVerdict}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {scannerLabel(state.matonVerdict, state.matonReport)}
                  </p>
                  <FindingsSection report={state.matonReport} />
                </div>
              </div>
            )}

            {/* No scanner available */}
            {!state.matonVerdict && !state.pythonMissing && (
              <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-sidebar p-3 text-xs text-muted-foreground">
                <ShieldOff className="size-4 shrink-0" />
                Maton non installe — installez le skill "maton" pour activer le scan de securite
              </div>
            )}

            {/* LLM contextual analysis */}
            {state.analyzeText && (
              <div className="rounded-lg border border-border/40 bg-sidebar p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Bot className="size-4 text-blue-400" />
                  <span className="text-xs font-medium text-muted-foreground">Analyse contextuelle</span>
                  {state.analyzeModel && (
                    <span className="text-[10px] text-muted-foreground/50">{state.analyzeModel.split('::')[1]}</span>
                  )}
                  {state.analyzeCost != null && state.analyzeCost > 0 && (
                    <span className="text-[10px] text-muted-foreground/50">${state.analyzeCost.toFixed(4)}</span>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
                  {state.analyzeText}
                </div>
              </div>
            )}

            {/* No LLM analysis available */}
            {!state.analyzeText && state.matonVerdict && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                <Bot className="size-3.5" />
                Analyse contextuelle non disponible (modele par defaut non configure ou Maton absent)
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={onClose}>Annuler</Button>
              <Button onClick={handleConfirm}>Installer</Button>
            </div>
          </div>
        )}

        {/* Error */}
        {state.step === 'error' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm text-red-500">{state.message}</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>Fermer</Button>
              <Button onClick={() => setState({ step: 'input' })}>Reessayer</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
