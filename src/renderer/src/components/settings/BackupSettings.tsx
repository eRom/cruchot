import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

interface BackupEntry {
  path: string
  filename: string
  date: string
  size: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function BackupSettings(): React.JSX.Element {
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)

  const loadBackups = useCallback(async () => {
    try {
      const list = await window.api.backupList()
      setBackups(list)
    } catch {
      toast.error('Impossible de charger la liste des sauvegardes')
    }
  }, [])

  useEffect(() => {
    loadBackups()
  }, [loadBackups])

  const handleCreate = async (): Promise<void> => {
    setLoading(true)
    try {
      await window.api.backupCreate()
      toast.success('Sauvegarde creee avec succes')
      await loadBackups()
    } catch {
      toast.error('Erreur lors de la creation de la sauvegarde')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (backupPath: string): Promise<void> => {
    setLoading(true)
    try {
      await window.api.backupRestore(backupPath)
      toast.success('Base de donnees restauree avec succes')
      setConfirmRestore(null)
    } catch {
      toast.error('Erreur lors de la restauration')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (backupPath: string): Promise<void> => {
    try {
      await window.api.backupDelete(backupPath)
      toast.success('Sauvegarde supprimee')
      await loadBackups()
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-foreground">Sauvegardes</h2>
          <p className="text-xs text-muted-foreground">
            Gerez les sauvegardes de votre base de donnees
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={loading}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'En cours...' : 'Sauvegarder maintenant'}
        </button>
      </div>

      {backups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucune sauvegarde disponible
        </div>
      ) : (
        <div className="space-y-2">
          {backups.map((backup) => (
            <div
              key={backup.path}
              className="flex items-center justify-between rounded-lg border bg-card p-4"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{backup.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(backup.date)} — {formatSize(backup.size)}
                </p>
              </div>
              <div className="flex gap-2">
                {confirmRestore === backup.path ? (
                  <>
                    <button
                      onClick={() => handleRestore(backup.path)}
                      disabled={loading}
                      className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                    >
                      Confirmer
                    </button>
                    <button
                      onClick={() => setConfirmRestore(null)}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setConfirmRestore(backup.path)}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      Restaurer
                    </button>
                    <button
                      onClick={() => handleDelete(backup.path)}
                      className="rounded-md border border-destructive/50 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      Supprimer
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
