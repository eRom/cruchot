// src/renderer/src/components/roles/role-prompt-wizard.config.ts

export type DomainId =
  | 'tech'
  | 'writing'
  | 'learning'
  | 'business'
  | 'research'
  | 'creation'
  | 'daily'
  | 'custom'

export type ExpertiseLevel = 'beginner' | 'intermediate' | 'expert'
export type Formality = 'tu' | 'vous'
export type Energy = 'direct' | 'warm' | 'humor' | 'raw'
export type ResponseFormat = 'tldr' | 'bullets' | 'prose' | 'code-first' | 'conversational'
export type LengthTarget = 'short' | 'medium' | 'long'
export type OutputFormat = 'markdown' | 'xml'

export interface WizardSelections {
  domain: DomainId | null
  domainCustomLabel?: string
  domainCustomAngle?: string
  subDomain: string | null
  subDomainOther?: string
  expertise: ExpertiseLevel | null
  formality: Formality | null
  energy: Energy | null
  responseFormat: ResponseFormat | null
  lengthTarget: LengthTarget | null
  guardrails: GuardrailId[]
  personalContext: string
  outputFormat: OutputFormat
}

export type GuardrailId =
  | 'no-disclaimers'
  | 'ask-clarification'
  | 'flag-uncertainty'
  | 'cite-sources'
  | 'propose-alternative'
  | 'pristine-french'
  | 'challenge-ideas'
  | 'no-emojis'
  | 'no-meta-comments'

export interface Guardrail {
  id: GuardrailId
  label: string
  rendered: string
}

export const GUARDRAILS: Guardrail[] = [
  {
    id: 'no-disclaimers',
    label: 'Pas d\'excuses ni de disclaimers inutiles',
    rendered: 'Ne t\'excuse jamais et n\'ajoute pas de disclaimers inutiles ("en tant qu\'IA...").'
  },
  {
    id: 'ask-clarification',
    label: 'Pose des questions de clarification si la demande est ambiguë',
    rendered: 'Si la demande est ambiguë, pose des questions de clarification avant de répondre.'
  },
  {
    id: 'flag-uncertainty',
    label: 'Signale tes incertitudes plutôt que d\'inventer',
    rendered: 'Signale explicitement tes incertitudes plutôt que d\'inventer une réponse plausible.'
  },
  {
    id: 'cite-sources',
    label: 'Cite tes sources quand pertinent',
    rendered: 'Cite tes sources quand c\'est pertinent.'
  },
  {
    id: 'propose-alternative',
    label: 'Propose toujours une alternative plus simple si elle existe',
    rendered: 'Propose toujours une alternative plus simple si elle existe.'
  },
  {
    id: 'pristine-french',
    label: 'Français impeccable, zéro anglicisme',
    rendered: 'Utilise un français irréprochable, sans anglicismes inutiles.'
  },
  {
    id: 'challenge-ideas',
    label: 'Challenge mes idées plutôt que valider systématiquement',
    rendered: 'Challenge mes idées et propositions plutôt que valider systématiquement.'
  },
  {
    id: 'no-emojis',
    label: 'Pas d\'emojis dans les réponses',
    rendered: 'N\'utilise pas d\'emojis dans tes réponses.'
  },
  {
    id: 'no-meta-comments',
    label: 'Pas de meta-commentaire ("Voici ma réponse :", "J\'espère que cela t\'aide")',
    rendered: 'Ne fais pas de meta-commentaire (pas de "Voici ma réponse :", "J\'espère que cela t\'aide", etc.).'
  }
]

export const MAX_GUARDRAILS = 5
export const MAX_PERSONAL_CONTEXT_CHARS = 500

export const DOMAIN_PERSONAS: Record<DomainId, string> = {
  tech: 'un expert en développement logiciel et architecture',
  writing: 'un écrivain et expert en communication',
  learning: 'un professeur patient, pédagogue et vulgarisateur',
  business: 'un assistant business orienté efficacité et clarté',
  research: 'un chercheur et analyste rigoureux',
  creation: 'un partenaire de création et de brainstorming',
  daily: 'un assistant personnel bienveillant et organisé',
  custom: ''
}

export interface SubDomainOption {
  value: string
  label: string
  persona: string
}

export const SUB_DOMAINS: Record<Exclude<DomainId, 'custom'>, { question: string; options: SubDomainOption[] }> = {
  tech: {
    question: 'Quelle spécialité ?',
    options: [
      { value: 'frontend', label: 'Frontend', persona: ', spécialisé en développement frontend' },
      { value: 'backend', label: 'Backend', persona: ', spécialisé en développement backend' },
      { value: 'devops', label: 'DevOps', persona: ', spécialisé en DevOps et infrastructure' },
      { value: 'data', label: 'Data', persona: ', spécialisé en data engineering et data science' },
      { value: 'mobile', label: 'Mobile', persona: ', spécialisé en développement mobile' },
      { value: 'architecture', label: 'Architecture', persona: ', spécialisé en architecture logicielle' },
      { value: 'security', label: 'Sécurité', persona: ', spécialisé en sécurité applicative' },
      { value: 'other', label: 'Autre', persona: '' }
    ]
  },
  writing: {
    question: 'Quel format dominant ?',
    options: [
      { value: 'blog', label: 'Articles de blog', persona: ', spécialisé en articles de blog' },
      { value: 'marketing', label: 'Marketing & copy', persona: ', spécialisé en marketing et copywriting' },
      { value: 'fiction', label: 'Storytelling & fiction', persona: ', spécialisé en storytelling et fiction' },
      { value: 'social', label: 'Réseaux sociaux', persona: ', spécialisé en contenus pour réseaux sociaux' },
      { value: 'doc', label: 'Documentation technique', persona: ', spécialisé en documentation technique' },
      { value: 'other', label: 'Autre', persona: '' }
    ]
  },
  learning: {
    question: 'Quel style d\'enseignement ?',
    options: [
      { value: 'step', label: 'Explications pas-à-pas', persona: ', adepte des explications pas-à-pas' },
      { value: 'analogy', label: 'Analogies & métaphores', persona: ', adepte des analogies et métaphores' },
      { value: 'quiz', label: 'Quiz & exercices', persona: ', adepte des quiz et exercices' },
      { value: 'socratic', label: 'Socratique (questions retour)', persona: ', adepte de la méthode socratique' },
      { value: 'other', label: 'Autre', persona: '' }
    ]
  },
  business: {
    question: 'Quelle tâche dominante ?',
    options: [
      { value: 'email', label: 'Emails & communication', persona: ', spécialisé en communication écrite professionnelle' },
      { value: 'meeting', label: 'Synthèse de réunions', persona: ', spécialisé en synthèses de réunions' },
      { value: 'strategy', label: 'Stratégie & décision', persona: ', spécialisé en aide à la décision stratégique' },
      { value: 'presentation', label: 'Présentations', persona: ', spécialisé en création de présentations' },
      { value: 'process', label: 'Process & ops', persona: ', spécialisé en process et opérations' },
      { value: 'other', label: 'Autre', persona: '' }
    ]
  },
  research: {
    question: 'Quelle approche dominante ?',
    options: [
      { value: 'synthesis', label: 'Synthèse multi-sources', persona: ', spécialisé en synthèses multi-sources' },
      { value: 'comparison', label: 'Comparaisons structurées', persona: ', spécialisé en comparaisons structurées' },
      { value: 'fact-check', label: 'Fact-checking & critique', persona: ', spécialisé en fact-checking et critique de sources' },
      { value: 'monitoring', label: 'Veille & monitoring', persona: ', spécialisé en veille et monitoring' },
      { value: 'other', label: 'Autre', persona: '' }
    ]
  },
  creation: {
    question: 'Quel mode de création ?',
    options: [
      { value: 'ideation', label: 'Idéation divergente', persona: ', adepte de l\'idéation divergente' },
      { value: 'devil', label: 'Critique & devil\'s advocate', persona: ', adepte du rôle de devil\'s advocate' },
      { value: 'visual', label: 'Concepts visuels', persona: ', spécialisé en concepts visuels' },
      { value: 'naming', label: 'Naming & branding', persona: ', spécialisé en naming et branding' },
      { value: 'other', label: 'Autre', persona: '' }
    ]
  },
  daily: {
    question: 'Quel domaine du quotidien ?',
    options: [
      { value: 'cooking', label: 'Cuisine', persona: ', spécialisé en cuisine' },
      { value: 'health', label: 'Santé & sport', persona: ', spécialisé en santé et sport' },
      { value: 'organization', label: 'Organisation & productivité perso', persona: ', spécialisé en organisation personnelle' },
      { value: 'travel', label: 'Voyage', persona: ', spécialisé en voyages' },
      { value: 'family', label: 'Famille & enfants', persona: ', spécialisé en parentalité et vie de famille' },
      { value: 'other', label: 'Autre', persona: '' }
    ]
  }
}

export const EXPERTISE_LABELS: Record<ExpertiseLevel, { label: string; sentence: string }> = {
  beginner: {
    label: 'Comme à un débutant total',
    sentence: 'Tu t\'adresses à un débutant total sur ce sujet. Utilise un vocabulaire simple et définis tout terme technique.'
  },
  intermediate: {
    label: 'À quelqu\'un qui connaît les bases',
    sentence: 'Tu t\'adresses à quelqu\'un qui connaît les bases du sujet. Utilise un vocabulaire courant sans définir les termes élémentaires.'
  },
  expert: {
    label: 'À un pair expert',
    sentence: 'Tu t\'adresses à un pair expert. Utilise un vocabulaire technique d\'égal à égal, sans baby-talk.'
  }
}

export const FORMALITY_LABELS: Record<Formality, { label: string; sentence: string }> = {
  tu: { label: 'Tutoiement (décontracté)', sentence: 'Tutoie l\'utilisateur.' },
  vous: { label: 'Vouvoiement (professionnel)', sentence: 'Vouvoyez l\'utilisateur et adoptez un ton professionnel.' }
}

export const ENERGY_LABELS: Record<Energy, { label: string; sentence: string }> = {
  direct: { label: 'Direct & factuel', sentence: 'Sois direct et factuel, zéro fioritures.' },
  warm: { label: 'Chaleureux & encourageant', sentence: 'Sois chaleureux et encourageant.' },
  humor: { label: 'Avec une pointe d\'humour', sentence: 'Glisse une pointe d\'humour dans tes réponses quand c\'est approprié.' },
  raw: { label: 'Sec & sans filtre', sentence: 'Sois sec et sans filtre. Ne ménage pas l\'utilisateur.' }
}

export const FORMAT_LABELS: Record<ResponseFormat, { label: string; sentence: string }> = {
  tldr: { label: 'TL;DR ultra-court puis détails', sentence: 'Commence par un TL;DR ultra-court, puis développe.' },
  bullets: { label: 'Bullet points synthétiques', sentence: 'Réponds sous forme de bullet points synthétiques.' },
  prose: { label: 'Prose structurée avec titres', sentence: 'Réponds en prose structurée avec des titres.' },
  'code-first': { label: 'Code/exemples d\'abord', sentence: 'Priorise le code et les exemples concrets avant les explications.' },
  conversational: { label: 'Conversationnel naturel', sentence: 'Réponds sur un ton conversationnel naturel.' }
}

export const LENGTH_LABELS: Record<LengthTarget, { label: string; sentence: string }> = {
  short: { label: 'Court', sentence: 'Garde tes réponses courtes et concises.' },
  medium: { label: 'Moyen', sentence: 'Garde une longueur équilibrée, juste ce qu\'il faut.' },
  long: { label: 'Long', sentence: 'N\'hésite pas à être exhaustif et détaillé.' }
}

export const DOMAIN_LABELS: Record<DomainId, string> = {
  tech: '👨‍💻 Tech & Dev',
  writing: '✍️ Écriture & Contenu',
  learning: '🎓 Apprentissage & Pédagogie',
  business: '💼 Business & Productivité',
  research: '🔬 Recherche & Analyse',
  creation: '🎨 Création & Brainstorm',
  daily: '🧘 Vie quotidienne',
  custom: '⚙️ Custom (autre)'
}

export function createEmptySelections(): WizardSelections {
  return {
    domain: null,
    subDomain: null,
    expertise: null,
    formality: null,
    energy: null,
    responseFormat: null,
    lengthTarget: null,
    guardrails: [],
    personalContext: '',
    outputFormat: 'markdown'
  }
}

function buildPersona(selections: WizardSelections): string {
  if (selections.domain === 'custom') {
    const label = selections.domainCustomLabel?.trim() ?? ''
    const angle = selections.domainCustomAngle?.trim() ?? ''
    if (!label) return ''
    return angle ? `${label}, ${angle}` : label
  }
  if (!selections.domain) return ''
  const root = DOMAIN_PERSONAS[selections.domain]
  if (selections.subDomain === 'other' && selections.subDomainOther?.trim()) {
    return `${root}, ${selections.subDomainOther.trim()}`
  }
  if (selections.subDomain) {
    const sub = SUB_DOMAINS[selections.domain as Exclude<DomainId, 'custom'>]?.options.find(o => o.value === selections.subDomain)
    return root + (sub?.persona ?? '')
  }
  return root
}

function buildStyleLines(selections: WizardSelections): string[] {
  const lines: string[] = []
  if (selections.formality) lines.push(`- ${FORMALITY_LABELS[selections.formality].sentence}`)
  if (selections.energy) lines.push(`- ${ENERGY_LABELS[selections.energy].sentence}`)
  if (selections.responseFormat) lines.push(`- ${FORMAT_LABELS[selections.responseFormat].sentence}`)
  if (selections.lengthTarget) lines.push(`- ${LENGTH_LABELS[selections.lengthTarget].sentence}`)
  return lines
}

function buildGuardrailLines(selections: WizardSelections): string[] {
  return selections.guardrails
    .map(id => GUARDRAILS.find(g => g.id === id))
    .filter((g): g is Guardrail => g !== undefined)
    .map(g => `- ${g.rendered}`)
}

export function renderMarkdown(selections: WizardSelections): string {
  const sections: string[] = []

  const persona = buildPersona(selections)
  if (persona) {
    sections.push(`# Rôle\nTu es ${persona}.`)
  }

  const publicLines: string[] = []
  if (selections.expertise) publicLines.push(EXPERTISE_LABELS[selections.expertise].sentence)
  if (selections.personalContext.trim()) publicLines.push(selections.personalContext.trim())
  if (publicLines.length > 0) {
    sections.push(`# Public\n${publicLines.join('\n')}`)
  }

  const styleLines = buildStyleLines(selections)
  if (styleLines.length > 0) {
    sections.push(`# Style\n${styleLines.join('\n')}`)
  }

  const guardrailLines = buildGuardrailLines(selections)
  if (guardrailLines.length > 0) {
    sections.push(`# Règles\n${guardrailLines.join('\n')}`)
  }

  return sections.join('\n\n')
}

export function renderXml(selections: WizardSelections): string {
  const sections: string[] = []

  const persona = buildPersona(selections)
  if (persona) {
    sections.push(`<role>Tu es ${persona}.</role>`)
  }

  const audienceLines: string[] = []
  if (selections.expertise) audienceLines.push(EXPERTISE_LABELS[selections.expertise].sentence)
  if (selections.personalContext.trim()) audienceLines.push(selections.personalContext.trim())
  if (audienceLines.length > 0) {
    sections.push(`<audience>\n${audienceLines.join('\n')}\n</audience>`)
  }

  const styleLines = buildStyleLines(selections)
  if (styleLines.length > 0) {
    sections.push(`<style>\n${styleLines.join('\n')}\n</style>`)
  }

  const guardrailLines = buildGuardrailLines(selections)
  if (guardrailLines.length > 0) {
    sections.push(`<rules>\n${guardrailLines.join('\n')}\n</rules>`)
  }

  return sections.join('\n\n')
}
