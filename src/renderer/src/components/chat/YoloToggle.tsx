import { useState } from 'react'
import { Zap } from 'lucide-react'
import { useSandboxStore } from '../../stores/sandbox.store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'

interface YoloToggleProps {
  conversationId: string
  modelSupportsYolo: boolean
  workspacePath?: string
  disabled?: boolean
}

export function YoloToggle({ conversationId, modelSupportsYolo, workspacePath, disabled }: YoloToggleProps) {
  const [showWarning, setShowWarning] = useState(false)
  const { isActive, activate, deactivate } = useSandboxStore()

  const handleToggle = () => {
    if (isActive) {
      deactivate()
      return
    }
    // Show warning dialog before activating
    setShowWarning(true)
  }

  const handleConfirm = async () => {
    setShowWarning(false)
    try {
      await activate(conversationId, workspacePath)
    } catch (err) {
      console.error('[YoloToggle] Failed to activate:', err)
    }
  }

  const isDisabled = disabled || (!isActive && !modelSupportsYolo)

  return (
    <>
      <button
        onClick={handleToggle}
        disabled={isDisabled}
        title={!modelSupportsYolo && !isActive ? 'Modele non compatible avec le mode YOLO' : isActive ? 'Desactiver le mode YOLO' : 'Activer le mode YOLO'}
        className={`
          flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors
          ${isActive
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
            : isDisabled
              ? 'text-muted-foreground/40 cursor-not-allowed'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }
        `}
      >
        <Zap className={`h-3.5 w-3.5 ${isActive ? 'fill-amber-400' : ''}`} />
        YOLO
      </button>

      <Dialog open={showWarning} onOpenChange={setShowWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Mode YOLO — Execution autonome
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Le mode YOLO permet au LLM d'executer du code, creer des fichiers et lancer
                  des serveurs <strong className="text-foreground">de maniere autonome</strong> dans un environnement sandbox.
                </p>
                <p className="text-amber-500 font-medium">
                  Attention : le LLM peut executer des commandes sans votre approbation prealable.
                  Bien que l'environnement soit sandbox (isole), des erreurs ou comportements
                  inattendus sont possibles.
                </p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Les fichiers sont confines au dossier sandbox</li>
                  <li>Le reseau est limite au localhost</li>
                  <li>Vous pouvez arreter a tout moment avec le bouton Stop</li>
                  <li>Aucune garantie sur le resultat produit</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowWarning(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleConfirm}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              J'accepte les risques
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
