import { useState } from 'react'
import { Database, Download, Upload, Trash2, AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DataSettings() {
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetInput, setResetInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const handleExport = async () => {
    try {
      await window.api.exportConversation({
        conversationId: '',
        format: 'json'
      })
    } catch {
      // Export error handling will be wired later
    }
  }

  const handleImport = async () => {
    try {
      await window.api.importConversation({ format: 'json' })
    } catch {
      // Import error handling will be wired later
    }
  }

  const handleCleanup = async () => {
    setIsProcessing(true)
    try {
      await window.api.dataCleanup()
      setShowCleanupConfirm(false)
      window.location.reload()
    } catch (err) {
      console.error('[DataSettings] Cleanup failed:', err)
      setIsProcessing(false)
    }
  }

  const handleFactoryReset = async () => {
    setIsProcessing(true)
    try {
      await window.api.dataFactoryReset()
      localStorage.clear()
      window.location.reload()
    } catch (err) {
      console.error('[DataSettings] Factory reset failed:', err)
      setIsProcessing(false)
    }
  }

  return (
    <section className="space-y-5">
      <h2 className="text-sm font-medium text-foreground">Donnees</h2>

      <div className="space-y-4">
        {/* Database info */}
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Database className="size-4" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Base de donnees</p>
              <p className="font-mono text-xs text-muted-foreground">
                ~/Library/Application Support/multi-llm-desktop/data.db
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span>Taille : --</span>
          </div>
        </div>

        {/* Export */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Exporter les conversations</p>
            <p className="text-xs text-muted-foreground">
              Exporte toutes les conversations au format JSON
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="size-4" />
            Exporter
          </Button>
        </div>

        {/* Import */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Importer des conversations</p>
            <p className="text-xs text-muted-foreground">
              Importe depuis un fichier JSON, ChatGPT ou Claude
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="size-4" />
            Importer
          </Button>
        </div>

        {/* ── Zone orange : Nettoyage partiel ──────────────────── */}
        <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
          <div className="flex items-center gap-2">
            <Trash2 className="size-4 text-orange-500" />
            <p className="text-sm font-medium text-orange-500">Nettoyage des donnees</p>
          </div>

          {!showCleanupConfirm ? (
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Supprimer conversations, projets et images</p>
                <p className="text-xs text-muted-foreground">
                  Les roles, prompts, serveurs MCP, parametres et cles API seront conserves
                </p>
              </div>
              <Button
                size="sm"
                disabled={isProcessing}
                className="bg-orange-600 text-white hover:bg-orange-700"
                onClick={() => setShowCleanupConfirm(true)}
              >
                <Trash2 className="size-4" />
                Nettoyer
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-orange-500">
                Toutes les conversations, projets et images generees seront supprimes.
                Les roles, prompts, serveurs MCP et parametres seront conserves.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={isProcessing}
                  className="bg-orange-600 text-white hover:bg-orange-700"
                  onClick={handleCleanup}
                >
                  {isProcessing ? 'Suppression...' : 'Confirmer la suppression'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => setShowCleanupConfirm(false)}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Zone rouge : Factory reset ───────────────────────── */}
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-500" />
            <p className="text-sm font-medium text-red-500">Reinitialisation complete</p>
          </div>

          {!showResetConfirm ? (
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Revenir a l&apos;etat initial</p>
                <p className="text-xs text-muted-foreground">
                  Supprime TOUTES les donnees. L&apos;assistant de bienvenue sera relance.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={isProcessing}
                onClick={() => setShowResetConfirm(true)}
              >
                <RotateCcw className="size-4" />
                Reinitialiser
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-red-500">
                Cette action est definitive et irreversible. Toutes vos donnees seront supprimees :
                conversations, projets, roles, prompts, serveurs MCP, memoire, statistiques et parametres.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={resetInput}
                  onChange={(e) => setResetInput(e.target.value)}
                  placeholder="Tapez DELETE pour confirmer"
                  className="w-56 rounded-md border border-red-500/40 bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/50"
                  disabled={isProcessing}
                />
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={resetInput !== 'DELETE' || isProcessing}
                  onClick={handleFactoryReset}
                >
                  {isProcessing ? 'Reinitialisation...' : 'Tout supprimer'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  onClick={() => {
                    setShowResetConfirm(false)
                    setResetInput('')
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
