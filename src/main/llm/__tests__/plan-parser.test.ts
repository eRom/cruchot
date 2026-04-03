import { describe, it, expect } from 'vitest'
import { parsePlanMarkers, parseStepMarker, stripPlanMarkers } from '../plan-parser'

describe('parsePlanMarkers', () => {
  it('parses a full plan block', () => {
    const text = '[PLAN:start:full]Refactoriser le module auth[PLAN:title][STEP:1]Lire les fichiers[STEP:tools:readFile,glob][STEP:2]Creer le service[STEP:tools:writeFile][PLAN:end]'
    const result = parsePlanMarkers(text)
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Refactoriser le module auth')
    expect(result!.level).toBe('full')
    expect(result!.steps).toHaveLength(2)
    expect(result!.steps[0]).toEqual({
      id: 1,
      label: 'Lire les fichiers',
      tools: ['readFile', 'glob'],
      status: 'pending',
      enabled: true
    })
    expect(result!.steps[1]).toEqual({
      id: 2,
      label: 'Creer le service',
      tools: ['writeFile'],
      status: 'pending',
      enabled: true
    })
  })

  it('parses a light plan block', () => {
    const text = '[PLAN:start:light]Comparer 3 offres[PLAN:title][STEP:1]Chercher les prix[STEP:2]Faire le tableau[PLAN:end]'
    const result = parsePlanMarkers(text)
    expect(result!.level).toBe('light')
    expect(result!.steps[0].tools).toBeUndefined()
  })

  it('defaults to full when level is missing', () => {
    const text = '[PLAN:start]Titre[PLAN:title][STEP:1]Etape[PLAN:end]'
    const result = parsePlanMarkers(text)
    expect(result!.level).toBe('full')
  })

  it('returns null when no plan markers found', () => {
    expect(parsePlanMarkers('Hello world')).toBeNull()
  })

  it('returns null for incomplete plan (no end)', () => {
    expect(parsePlanMarkers('[PLAN:start:full]Titre[PLAN:title][STEP:1]Etape')).toBeNull()
  })

  it('handles multiline plan block', () => {
    const text = `[PLAN:start:full]Plan multiline[PLAN:title]
[STEP:1]Premiere etape[STEP:tools:bash]
[STEP:2]Deuxieme etape[STEP:tools:writeFile,fileEdit]
[PLAN:end]`
    const result = parsePlanMarkers(text)
    expect(result).not.toBeNull()
    expect(result!.steps).toHaveLength(2)
    expect(result!.steps[1].tools).toEqual(['writeFile', 'fileEdit'])
  })

  it('handles steps without tools', () => {
    const text = '[PLAN:start:light]Recherche[PLAN:title][STEP:1]Chercher sur le web[STEP:2]Analyser les resultats[PLAN:end]'
    const result = parsePlanMarkers(text)
    expect(result!.steps[0].tools).toBeUndefined()
    expect(result!.steps[1].tools).toBeUndefined()
  })

  it('handles plan with surrounding text', () => {
    const text = 'Je vais creer un plan : [PLAN:start:full]Mon plan[PLAN:title][STEP:1]Etape unique[PLAN:end] Voila !'
    const result = parsePlanMarkers(text)
    expect(result!.title).toBe('Mon plan')
  })
})

describe('parseStepMarker', () => {
  it('parses step start', () => {
    expect(parseStepMarker('[STEP:3:start]')).toEqual({ index: 3, status: 'running' })
  })

  it('parses step done', () => {
    expect(parseStepMarker('[STEP:1:done]')).toEqual({ index: 1, status: 'done' })
  })

  it('parses step failed', () => {
    expect(parseStepMarker('[STEP:2:failed]')).toEqual({ index: 2, status: 'failed' })
  })

  it('returns null for non-step text', () => {
    expect(parseStepMarker('hello world')).toBeNull()
  })

  it('returns null for out-of-range step', () => {
    expect(parseStepMarker('[STEP:0:start]')).toBeNull()
  })
})

describe('stripPlanMarkers', () => {
  it('removes all plan markers from text', () => {
    const text = 'Avant [PLAN:start:full]Titre[PLAN:title][STEP:1]Etape[PLAN:end] Apres'
    expect(stripPlanMarkers(text)).toBe('Avant  Apres')
  })

  it('removes step execution markers', () => {
    expect(stripPlanMarkers('Texte [STEP:1:start] suite [STEP:1:done] fin')).toBe('Texte  suite  fin')
  })

  it('handles text with no markers', () => {
    expect(stripPlanMarkers('Hello world')).toBe('Hello world')
  })
})
