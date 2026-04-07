import { describe, it, expect } from 'vitest'
import { renderMarkdown, renderXml, createEmptySelections, type WizardSelections } from './role-prompt-wizard.config'

describe('renderMarkdown', () => {
  it('renders empty selections as empty string', () => {
    const result = renderMarkdown(createEmptySelections())
    expect(result).toBe('')
  })

  it('renders only the role section when domain alone is set', () => {
    const sel: WizardSelections = {
      ...createEmptySelections(),
      domain: 'tech',
      subDomain: 'frontend'
    }
    expect(renderMarkdown(sel)).toBe(
      '# Rôle\nTu es un expert en développement logiciel et architecture, spécialisé en développement frontend.'
    )
  })

  it('renders custom domain with custom label', () => {
    const sel: WizardSelections = {
      ...createEmptySelections(),
      domain: 'custom',
      domainCustomLabel: 'un coach de plongée sous-marine',
      domainCustomAngle: 'spécialisé en plongée technique au-delà de 40m'
    }
    expect(renderMarkdown(sel)).toBe(
      '# Rôle\nTu es un coach de plongée sous-marine, spécialisé en plongée technique au-delà de 40m.'
    )
  })

  it('renders all sections with full selections', () => {
    const sel: WizardSelections = {
      domain: 'tech',
      subDomain: 'frontend',
      expertise: 'expert',
      formality: 'tu',
      energy: ['direct'],
      responseFormat: 'code-first',
      lengthTarget: 'medium',
      guardrails: ['no-disclaimers', 'flag-uncertainty'],
      personalContext: 'Je code en TypeScript dans une stack Electron.',
      outputFormat: 'markdown'
    }
    const result = renderMarkdown(sel)
    expect(result).toContain('# Rôle')
    expect(result).toContain('Tu es un expert en développement logiciel et architecture, spécialisé en développement frontend.')
    expect(result).toContain('# Public')
    expect(result).toContain('Tu t\'adresses à un pair expert')
    expect(result).toContain('Je code en TypeScript dans une stack Electron.')
    expect(result).toContain('# Style')
    expect(result).toContain('- Tutoie l\'utilisateur.')
    expect(result).toContain('- Sois direct et factuel, zéro fioritures.')
    expect(result).toContain('- Priorise le code et les exemples concrets avant les explications.')
    expect(result).toContain('- Garde une longueur équilibrée, juste ce qu\'il faut.')
    expect(result).toContain('# Règles')
    expect(result).toContain('- Ne t\'excuse jamais')
    expect(result).toContain('- Signale explicitement tes incertitudes')
  })

  it('omits Public section when expertise and personalContext are empty', () => {
    const sel: WizardSelections = {
      ...createEmptySelections(),
      domain: 'tech',
      subDomain: 'backend',
      formality: 'tu'
    }
    const result = renderMarkdown(sel)
    expect(result).not.toContain('# Public')
    expect(result).toContain('# Style')
  })

  it('omits Style section when formality, energy, format and length are all null', () => {
    const sel: WizardSelections = {
      ...createEmptySelections(),
      domain: 'tech',
      subDomain: 'backend'
    }
    expect(renderMarkdown(sel)).not.toContain('# Style')
  })

  it('omits Règles section when no guardrails selected', () => {
    const sel: WizardSelections = {
      ...createEmptySelections(),
      domain: 'tech',
      subDomain: 'backend',
      formality: 'tu'
    }
    expect(renderMarkdown(sel)).not.toContain('# Règles')
  })

  it('handles "other" subDomain with subDomainOther override', () => {
    const sel: WizardSelections = {
      ...createEmptySelections(),
      domain: 'tech',
      subDomain: 'other',
      subDomainOther: 'spécialisé en compilateurs LLVM'
    }
    expect(renderMarkdown(sel)).toBe(
      '# Rôle\nTu es un expert en développement logiciel et architecture, spécialisé en compilateurs LLVM.'
    )
  })
})

describe('renderXml', () => {
  it('renders empty selections as empty string', () => {
    expect(renderXml(createEmptySelections())).toBe('')
  })

  it('renders only role tag when domain alone is set', () => {
    const sel: WizardSelections = {
      ...createEmptySelections(),
      domain: 'tech',
      subDomain: 'frontend'
    }
    expect(renderXml(sel)).toBe(
      '<role>Tu es un expert en développement logiciel et architecture, spécialisé en développement frontend.</role>'
    )
  })

  it('renders all tags with full selections', () => {
    const sel: WizardSelections = {
      domain: 'tech',
      subDomain: 'frontend',
      expertise: 'expert',
      formality: 'tu',
      energy: ['direct'],
      responseFormat: 'code-first',
      lengthTarget: 'medium',
      guardrails: ['no-disclaimers'],
      personalContext: 'Je code en TypeScript.',
      outputFormat: 'xml'
    }
    const result = renderXml(sel)
    expect(result).toContain('<role>Tu es un expert en développement logiciel et architecture, spécialisé en développement frontend.</role>')
    expect(result).toContain('<audience>')
    expect(result).toContain('Tu t\'adresses à un pair expert')
    expect(result).toContain('Je code en TypeScript.')
    expect(result).toContain('</audience>')
    expect(result).toContain('<style>')
    expect(result).toContain('- Tutoie l\'utilisateur.')
    expect(result).toContain('</style>')
    expect(result).toContain('<rules>')
    expect(result).toContain('- Ne t\'excuse jamais')
    expect(result).toContain('</rules>')
  })

  it('omits empty tags', () => {
    const sel: WizardSelections = {
      ...createEmptySelections(),
      domain: 'tech',
      subDomain: 'backend'
    }
    const result = renderXml(sel)
    expect(result).not.toContain('<audience>')
    expect(result).not.toContain('<style>')
    expect(result).not.toContain('<rules>')
  })
})
