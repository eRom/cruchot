/**
 * Build the <plan-instructions> or <plan-execution> block injected into the system prompt.
 * Guides the LLM's behavior regarding plan proposal, approval, and execution.
 * 3 levels of system prompt injection.
 */

import type { PlanData } from '../../preload/types'

const PLAN_INSTRUCTION_DEFAULT = `Pour les taches necessitant plus de 3 etapes ou impliquant des modifications de fichiers, propose d'abord un plan structure en utilisant le format suivant :

[PLAN:start:full]Titre du plan[PLAN:title]
[STEP:1]Description de l'etape[STEP:tools:tool1,tool2]
[STEP:2]Description de l'etape[STEP:tools:tool1]
[PLAN:end]

Pour un plan leger (recherche, comparaison), utilise [PLAN:start:light] au lieu de [PLAN:start:full].
Pour les taches simples (questions, redaction courte, explication), reponds directement sans plan.`

const PLAN_INSTRUCTION_FORCED = `L'utilisateur a demande un plan. Tu DOIS proposer un plan structure avant toute action.
Utilise le format :
[PLAN:start:full]Titre[PLAN:title]
[STEP:1]Description[STEP:tools:tool1,tool2]
[STEP:2]Description[STEP:tools:tool2]
[PLAN:end]
Attends la validation avant d'agir. Niveau : full (bloquant).`

export function buildPlanPromptBlock(
  mode: 'default' | 'forced' | 'execution',
  planData?: PlanData
): string | null {
  switch (mode) {
    case 'default':
      return `<plan-instructions>\n${PLAN_INSTRUCTION_DEFAULT}\n</plan-instructions>`

    case 'forced':
      return `<plan-instructions>\n${PLAN_INSTRUCTION_FORCED}\n</plan-instructions>`

    case 'execution': {
      if (!planData) return null
      const enabledSteps = planData.steps
        .filter(s => s.enabled)
        .map(s => `${s.id}. ${s.label}${s.tools ? ` (${s.tools.join(', ')})` : ''}`)
      const disabledSteps = planData.steps
        .filter(s => !s.enabled)
        .map(s => s.id)

      let prompt = `Le plan suivant a ete approuve. Execute chaque etape dans l'ordre.
Avant chaque etape, ecris [STEP:N:start]. Apres, ecris [STEP:N:done].
Si une etape echoue, ecris [STEP:N:failed] et continue avec la suivante.`

      if (disabledSteps.length > 0) {
        prompt += `\nEtapes desactivees par l'utilisateur (a ignorer) : ${disabledSteps.join(', ')}`
      }

      prompt += `\n\nPlan approuve :\n${enabledSteps.join('\n')}`

      return `<plan-execution>\n${prompt}\n</plan-execution>`
    }

    default:
      return null
  }
}
