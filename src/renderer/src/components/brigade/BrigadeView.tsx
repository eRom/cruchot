import { Button } from '@/components/ui/button'
import { useBardaStore } from '@/stores/barda.store'
import type { BardaImportReport, BardaParseError, ParsedBarda } from '../../../../preload/types'
import { Loader2, Shield, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BardaCard } from './BardaCard'
import { BardaImportReportDisplay, BardaParseErrorDisplay, BardaPreview } from './BardaPreview'

type ImportState =
  | { step: 'idle' }
  | { step: 'preview'; filePath: string; parsed: ParsedBarda }
  | { step: 'error'; error: BardaParseError }
  | { step: 'importing'; filePath: string }
  | { step: 'report'; report: BardaImportReport }

export function BrigadeView(): React.JSX.Element {
  const { bardas, isLoading, loadBardas, importBarda } = useBardaStore()
  const [importState, setImportState] = useState<ImportState>({ step: 'idle' })

  useEffect(() => {
    loadBardas()
  }, [loadBardas])

  const handleSelectFile = async () => {
    try {
      const files = await window.api.filePick()
      if (!files || files.length === 0) return

      const mdFile = files.find((f) => f.path.endsWith('.md'))
      if (!mdFile) {
        toast.error('Veuillez selectionner un fichier .md')
        return
      }

      // Preview first — handler returns { success, data } or { success, error }
      const result = await window.api.bardaPreview(mdFile.path) as
        | { success: true; data: ParsedBarda }
        | { success: false; error: BardaParseError }
      if (!result.success) {
        setImportState({ step: 'error', error: result.error })
      } else {
        setImportState({ step: 'preview', filePath: mdFile.path, parsed: result.data })
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de la lecture"
      toast.error(message)
    }
  }

  const handleConfirmImport = async () => {
    if (importState.step !== 'preview') return
    const { filePath } = importState
    setImportState({ step: 'importing', filePath })
    try {
      const report = await importBarda(filePath)
      setImportState({ step: 'report', report })
      toast.info('Redemarrez l\'application pour appliquer les changements', { duration: 8000 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'import"
      toast.error(message)
      setImportState({ step: 'idle' })
    }
  }

  const handleCloseImport = () => {
    setImportState({ step: 'idle' })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Gestion de Brigade
              </h1>
              <p className="mt-1 text-sm text-muted-foreground/70">
                Importez et gerez vos bardas — packs de configuration (roles, commandes, prompts, fragments, MCP).
              </p>
            </div>
            <Button
              onClick={handleSelectFile}
              variant="outline"
              className="gap-2"
              disabled={importState.step === 'importing'}
            >
              <Upload className="size-4" />
              Importer un barda
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Import state UI */}
          {importState.step === 'preview' && (
            <BardaPreview
              parsed={importState.parsed}
              onConfirm={handleConfirmImport}
              onCancel={handleCloseImport}
              isImporting={false}
            />
          )}

          {importState.step === 'importing' && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-card p-8">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Import en cours...</span>
            </div>
          )}

          {importState.step === 'error' && (
            <BardaParseErrorDisplay error={importState.error} onClose={handleCloseImport} />
          )}

          {importState.step === 'report' && (
            <BardaImportReportDisplay report={importState.report} onClose={handleCloseImport} />
          )}

          {/* Barda grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : bardas.length === 0 && importState.step === 'idle' ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Shield className="size-12 text-muted-foreground/20" />
              <p className="mt-4 text-sm text-muted-foreground">
                Aucun barda installe. Importez un fichier .md pour commencer.
              </p>
              <Button variant="outline" className="mt-4 gap-2" onClick={handleSelectFile}>
                <Upload className="size-4" />
                Importer un barda
              </Button>
            </div>
          ) : bardas.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              {bardas.map((barda) => (
                <BardaCard key={barda.id} barda={barda} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
