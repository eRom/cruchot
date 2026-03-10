import { useState } from 'react'
import { Database, Download, Upload, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DataSettings() {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  const handleDeleteAll = async () => {
    try {
      await window.api.deleteAllConversations()
      setShowDeleteConfirm(false)
      // Reload pour rafraichir la sidebar
      window.location.reload()
    } catch (err) {
      console.error('[DataSettings] Delete all failed:', err)
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

        {/* Danger zone */}
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-500" />
            <p className="text-sm font-medium text-red-500">Zone de danger</p>
          </div>

          {!showDeleteConfirm ? (
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground">Supprimer toutes les donnees</p>
                <p className="text-xs text-muted-foreground">
                  Cette action est irreversible
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="size-4" />
                Supprimer tout
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-red-500">
                Etes-vous certain de vouloir supprimer toutes vos conversations, images et
                parametres ? Cette action est definitive.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAll}
                >
                  Oui, tout supprimer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
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
