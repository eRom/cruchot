import { useState } from 'react'
import { Dialog, DialogContent } from '../ui/dialog'
import {
  WizardSelections,
  createEmptySelections,
  renderMarkdown,
  renderXml,
  DOMAIN_LABELS,
  SUB_DOMAINS,
  EXPERTISE_LABELS,
  FORMALITY_LABELS,
  ENERGY_LABELS,
  FORMAT_LABELS,
  LENGTH_LABELS,
  type DomainId,
  type ExpertiseLevel,
  type Formality,
  type Energy,
  type ResponseFormat,
  type LengthTarget
} from './role-prompt-wizard.config'

export type InsertMode = 'replace' | 'append'

interface RolePromptWizardProps {
  open: boolean
  onClose: () => void
  onInsert: (prompt: string, mode: InsertMode) => void
  hasExistingPrompt: boolean
}

type StepId =
  | 'domain'
  | 'subDomain'
  | 'expertise'
  | 'formality'
  | 'energy'
  | 'formatLength'
  | 'guardrails'
  | 'personalContext'
  | 'output'

const STEP_ORDER: StepId[] = [
  'domain',
  'subDomain',
  'expertise',
  'formality',
  'energy',
  'formatLength',
  'guardrails',
  'personalContext',
  'output'
]

const SKIPPABLE: Record<StepId, boolean> = {
  domain: false,
  subDomain: false,
  expertise: true,
  formality: true,
  energy: true,
  formatLength: true,
  guardrails: true,
  personalContext: true,
  output: false
}

export function RolePromptWizard({ open, onClose, onInsert, hasExistingPrompt }: RolePromptWizardProps) {
  const [selections, setSelections] = useState<WizardSelections>(createEmptySelections)
  const [stepIndex, setStepIndex] = useState(0)

  const currentStep = STEP_ORDER[stepIndex]
  const isFirstStep = stepIndex === 0

  function hasAnyAnswer(): boolean {
    return (
      selections.domain !== null ||
      selections.subDomain !== null ||
      selections.expertise !== null ||
      selections.formality !== null ||
      selections.energy !== null ||
      selections.responseFormat !== null ||
      selections.lengthTarget !== null ||
      selections.guardrails.length > 0 ||
      selections.personalContext.trim().length > 0
    )
  }

  function handleClose() {
    if (hasAnyAnswer()) {
      const confirmed = window.confirm('Abandonner ce wizard ? Tes réponses seront perdues.')
      if (!confirmed) return
    }
    setSelections(createEmptySelections())
    setStepIndex(0)
    onClose()
  }

  function handleNext() {
    if (stepIndex < STEP_ORDER.length - 1) setStepIndex(stepIndex + 1)
  }

  function handlePrev() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
  }

  function handleInsert(mode: InsertMode) {
    const prompt =
      selections.outputFormat === 'markdown'
        ? renderMarkdown(selections)
        : renderXml(selections)
    onInsert(prompt, mode)
    setSelections(createEmptySelections())
    setStepIndex(0)
    onClose()
  }

  function canAdvance(): boolean {
    if (SKIPPABLE[currentStep]) return true
    switch (currentStep) {
      case 'domain':
        if (selections.domain === null) return false
        if (selections.domain === 'custom' && !selections.domainCustomLabel?.trim()) return false
        return true
      case 'subDomain':
        if (selections.domain === 'custom') return !!selections.domainCustomAngle?.trim()
        if (selections.subDomain === null) return false
        if (selections.subDomain === 'other' && !selections.subDomainOther?.trim()) return false
        return true
      default:
        return true
    }
  }

  const previewText =
    selections.outputFormat === 'xml'
      ? renderXml(selections)
      : renderMarkdown(selections)

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-[900px] w-[900px] p-0 overflow-hidden">
        <div className="flex flex-col h-[600px]">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">Configurateur de rôle</h2>
            <div className="w-full bg-muted h-1.5 mt-3 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${((stepIndex + 1) / STEP_ORDER.length) * 100}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Étape {stepIndex + 1} sur {STEP_ORDER.length}
            </p>
          </div>

          <div className="flex-1 flex overflow-hidden">
            <div className="w-3/5 p-6 overflow-y-auto">
              <StepContent
                step={currentStep}
                selections={selections}
                setSelections={setSelections}
              />
            </div>
            <div className="w-2/5 border-l border-border bg-muted/30 p-6 overflow-y-auto">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Aperçu du prompt
              </h3>
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                {previewText || <span className="text-muted-foreground italic">Le prompt s'affichera ici…</span>}
              </pre>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <button
              onClick={handleClose}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Annuler
            </button>

            {currentStep === 'output' ? (
              <div className="flex gap-2">
                {hasExistingPrompt && (
                  <button
                    onClick={() => handleInsert('replace')}
                    className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors"
                  >
                    Remplacer le prompt actuel
                  </button>
                )}
                <button
                  onClick={() => handleInsert('append')}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  {hasExistingPrompt ? 'Ajouter à la fin' : 'Insérer'}
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handlePrev}
                  disabled={isFirstStep}
                  className="px-4 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Précédent
                </button>
                <button
                  onClick={handleNext}
                  disabled={!canAdvance()}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {SKIPPABLE[currentStep] && !stepHasAnswer(currentStep, selections) ? 'Skip' : 'Suivant'}
                </button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function stepHasAnswer(step: StepId, sel: WizardSelections): boolean {
  switch (step) {
    case 'expertise': return sel.expertise !== null
    case 'formality': return sel.formality !== null
    case 'energy': return sel.energy !== null
    case 'formatLength': return sel.responseFormat !== null || sel.lengthTarget !== null
    case 'guardrails': return sel.guardrails.length > 0
    case 'personalContext': return sel.personalContext.trim().length > 0
    default: return true
  }
}

function StepContent({
  step,
  selections,
  setSelections
}: {
  step: StepId
  selections: WizardSelections
  setSelections: (s: WizardSelections) => void
}) {
  if (step === 'domain') {
    return (
      <div>
        <h3 className="text-base font-medium mb-4">Dans quel domaine principal vas-tu utiliser cette IA ?</h3>
        <div className="grid grid-cols-1 gap-2">
          {(Object.keys(DOMAIN_LABELS) as DomainId[]).map((id) => (
            <button
              key={id}
              onClick={() => setSelections({
                ...selections,
                domain: id,
                subDomain: null,
                domainCustomLabel: '',
                domainCustomAngle: '',
                subDomainOther: ''
              })}
              className={`text-left px-4 py-3 rounded-md border transition-colors ${
                selections.domain === id
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-accent'
              }`}
            >
              {DOMAIN_LABELS[id]}
            </button>
          ))}
        </div>
        {selections.domain === 'custom' && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Décris ton domaine</label>
            <input
              type="text"
              value={selections.domainCustomLabel ?? ''}
              onChange={(e) => setSelections({ ...selections, domainCustomLabel: e.target.value })}
              placeholder="Ex: un coach de plongée sous-marine"
              className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
      </div>
    )
  }

  if (step === 'subDomain') {
    if (selections.domain === 'custom') {
      return (
        <div>
          <h3 className="text-base font-medium mb-4">Quel angle / approche dominante ?</h3>
          <input
            type="text"
            value={selections.domainCustomAngle ?? ''}
            onChange={(e) => setSelections({ ...selections, domainCustomAngle: e.target.value })}
            placeholder="Ex: spécialisé en plongée technique au-delà de 40m"
            className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )
    }
    if (!selections.domain) {
      return <div className="text-sm text-muted-foreground">Choisis un domaine d&apos;abord.</div>
    }
    const config = SUB_DOMAINS[selections.domain as Exclude<DomainId, 'custom'>]
    return (
      <div>
        <h3 className="text-base font-medium mb-4">{config.question}</h3>
        <div className="grid grid-cols-1 gap-2">
          {config.options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelections({ ...selections, subDomain: opt.value, subDomainOther: '' })}
              className={`text-left px-4 py-3 rounded-md border transition-colors ${
                selections.subDomain === opt.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-accent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {selections.subDomain === 'other' && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">Précise ta spécialité</label>
            <input
              type="text"
              value={selections.subDomainOther ?? ''}
              onChange={(e) => setSelections({ ...selections, subDomainOther: e.target.value })}
              placeholder="Ex: spécialisé en compilateurs LLVM"
              className="w-full px-3 py-2 text-sm bg-transparent border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        )}
      </div>
    )
  }

  if (step === 'expertise') {
    return (
      <div>
        <h3 className="text-base font-medium mb-4">Comment l&apos;IA doit-elle calibrer ses explications ?</h3>
        <div className="grid grid-cols-1 gap-2">
          {(Object.keys(EXPERTISE_LABELS) as ExpertiseLevel[]).map((id) => (
            <button
              key={id}
              onClick={() => setSelections({ ...selections, expertise: id })}
              className={`text-left px-4 py-3 rounded-md border transition-colors ${
                selections.expertise === id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
              }`}
            >
              {EXPERTISE_LABELS[id].label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'formality') {
    return (
      <div>
        <h3 className="text-base font-medium mb-4">Quelle formalité ?</h3>
        <div className="grid grid-cols-1 gap-2">
          {(Object.keys(FORMALITY_LABELS) as Formality[]).map((id) => (
            <button
              key={id}
              onClick={() => setSelections({ ...selections, formality: id })}
              className={`text-left px-4 py-3 rounded-md border transition-colors ${
                selections.formality === id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
              }`}
            >
              {FORMALITY_LABELS[id].label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'energy') {
    return (
      <div>
        <h3 className="text-base font-medium mb-4">Quelle énergie / ton ?</h3>
        <div className="grid grid-cols-1 gap-2">
          {(Object.keys(ENERGY_LABELS) as Energy[]).map((id) => (
            <button
              key={id}
              onClick={() => setSelections({ ...selections, energy: id })}
              className={`text-left px-4 py-3 rounded-md border transition-colors ${
                selections.energy === id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
              }`}
            >
              {ENERGY_LABELS[id].label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (step === 'formatLength') {
    return (
      <div>
        <h3 className="text-base font-medium mb-4">Quel format de réponse préfères-tu ?</h3>
        <div className="grid grid-cols-1 gap-2">
          {(Object.keys(FORMAT_LABELS) as ResponseFormat[]).map((id) => (
            <button
              key={id}
              onClick={() => setSelections({ ...selections, responseFormat: id })}
              className={`text-left px-4 py-3 rounded-md border transition-colors ${
                selections.responseFormat === id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
              }`}
            >
              {FORMAT_LABELS[id].label}
            </button>
          ))}
        </div>
        <div className="mt-6">
          <h4 className="text-sm font-medium mb-2">Longueur cible</h4>
          <div className="flex gap-2">
            {(Object.keys(LENGTH_LABELS) as LengthTarget[]).map((id) => (
              <button
                key={id}
                onClick={() => setSelections({ ...selections, lengthTarget: id })}
                className={`flex-1 px-4 py-2 rounded-md border text-sm transition-colors ${
                  selections.lengthTarget === id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'
                }`}
              >
                {LENGTH_LABELS[id].label}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="text-sm text-muted-foreground">
      Étape « {step} » à implémenter.
    </div>
  )
}
