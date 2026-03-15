import { Button } from '@/components/ui/button'
import { AlertTriangle, Check, Copy, Database, Download, Key, Lock, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useState } from 'react'

export function DataSettings() {
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetInput, setResetInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)

  // Import state machine
  const [importState, setImportState] = useState<'idle' | 'needs-token' | 'importing'>('idle')
  const [tokenInput, setTokenInput] = useState('')

  // ── Token ────────────────────────────────────────────
  const handleCopyToken = async () => {
    try {
      const hex = await window.api.copyInstanceToken()
      await navigator.clipboard.writeText(hex)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
    } catch (err) {
      console.error('[DataSettings] Copy token failed:', err)
    }
  }

  // ── Export bulk ──────────────────────────────────────
  const handleExportBulk = async () => {
    try {
      await window.api.exportBulk()
    } catch (err) {
      console.error('[DataSettings] Bulk export failed:', err)
    }
  }

  // ── Import bulk ──────────────────────────────────────
  const handleImportBulk = async () => {
    setImportState('importing')
    try {
      const result = await window.api.importBulk()
      if (result.imported) {
        alert(`Import reussi : ${result.projectsImported} projets, ${result.conversationsImported} conversations, ${result.messagesImported} messages`)
        window.location.reload()
      } else if (result.needsToken) {
        setImportState('needs-token')
      } else {
        setImportState('idle')
      }
    } catch (err) {
      console.error('[DataSettings] Bulk import failed:', err)
      setImportState('idle')
    }
  }

  const handleImportWithToken = async () => {
    if (tokenInput.length !== 64) return
    setImportState('importing')
    try {
      const result = await window.api.importBulkWithToken({
        tokenHex: tokenInput
      })
      if (result.imported) {
        alert(`Import reussi : ${result.projectsImported} projets, ${result.conversationsImported} conversations, ${result.messagesImported} messages`)
        window.location.reload()
      }
    } catch (err) {
      console.error('[DataSettings] Import with token failed:', err)
      alert('Echec du dechiffrement : token invalide ou fichier corrompu')
      setImportState('needs-token')
    }
  }

  // ── Cleanup / Reset ──────────────────────────────────
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
                ~/Library/Application Support/cruchot/data.db
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span>Taille : --</span>
          </div>
        </div>

        {/* Instance Token */}
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Key className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Token d&apos;instance</p>
                <p className="text-xs text-muted-foreground">
                  Cle de chiffrement pour les exports .mlx 
                  <br/>— a conserver pour importer sur une autre machine — 
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">••••••••••••••••</span>
              <Button variant="outline" size="sm" onClick={handleCopyToken}>
                {tokenCopied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                {tokenCopied ? 'Copie !' : 'Copier'}
              </Button>
            </div>
          </div>
        </div>

        {/* Export bulk */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
          <div>
            <p className="text-sm font-medium text-foreground">Exporter toutes les donnees (chiffre)</p>
            <p className="text-xs text-muted-foreground">
              Exporte conversations et projets dans un fichier .mlx chiffré (AES-256-GCM)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportBulk}>
            <Download className="size-4" />
            Exporter
          </Button>
        </div>

        {/* Import bulk */}
        <div className="rounded-lg border border-border/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Importer (natif)</p>
              <p className="text-xs text-muted-foreground">
                Importe un fichier .mlx chiffré
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportBulk}
              disabled={importState === 'importing'}
            >
              <Upload className="size-4" />
              {importState === 'importing' ? 'Import...' : 'Importer'}
            </Button>
          </div>

          {/* Token input (shown when local token fails) */}
          {importState === 'needs-token' && (
            <div className="mt-3 space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Ce fichier provient d&apos;une autre instance. Collez le token d&apos;instance de la machine source :
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 64))}
                  placeholder="Token hex (64 caracteres)"
                  className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
                <Button
                  size="sm"
                  disabled={tokenInput.length !== 64}
                  onClick={handleImportWithToken}
                  className="bg-amber-600 text-white hover:bg-amber-700"
                >
                  <Lock className="size-4" />
                  Dechiffrer
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setImportState('idle')
                    setTokenInput('')
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Import externe (disabled) */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-4 opacity-50">
          <div>
            <p className="text-sm font-medium text-foreground">Importer (externe)</p>
            <p className="text-xs text-muted-foreground">
              ChatGPT, Claude, Gemini — bientot disponible
            </p>
          </div>
          <Button variant="outline" size="sm" disabled title="Bientot disponible">
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
