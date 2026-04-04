export const SEMANTIC_CONSOLIDATION_PROMPT = `Tu es un service de consolidation memoire. Analyse ces chunks de conversation et identifie les redondances.

<chunks>
{chunks}
</chunks>

Retourne un JSON array d'actions :
- { "action": "merge", "keepId": "pointId", "deleteIds": ["id1", "id2"], "mergedContent": "resume fusionne" }
- { "action": "delete", "pointId": "id", "reason": "..." }
- { "action": "keep", "pointId": "id" }

Regles :
- Merge les chunks qui disent la meme chose avec des mots differents
- Supprime les chunks sans contenu informationnel (salutations, "ok", "merci")
- Le mergedContent doit preserver l'information essentielle, pas juste resumer
- Conserve les chunks uniques et informatifs tels quels
- En cas de doute, conserve (action: keep)

Retourne UNIQUEMENT un JSON array valide. Pas de texte avant ou apres.`

export const EPISODIC_CONSOLIDATION_PROMPT = `Tu es un service de consolidation memoire. Analyse ces episodes comportementaux et identifie les obsoletes, doublons, et a renforcer.

<episodes>
{episodes}
</episodes>

Date actuelle : {date}

Retourne un JSON array d'actions :
- { "action": "stale", "episodeId": "id", "newConfidence": 0.2, "reason": "..." }
- { "action": "merge", "keepId": "id", "deleteIds": ["id1"], "reason": "..." }
- { "action": "delete", "episodeId": "id", "reason": "..." }
- { "action": "keep", "episodeId": "id" }

Regles :
- Stale : episode > 30 jours sans renforcement ET confiance < 0.5 → reduire confiance de 50%
- Merge : episodes qui capturent le meme fait → garder celui avec le plus d'occurrences
- Delete : episode stale avec confiance resultante < 0.1 → supprimer
- Keep : tout le reste
- JAMAIS supprimer un episode avec occurrences >= 3, meme vieux (pattern confirme)

Retourne UNIQUEMENT un JSON array valide. Pas de texte avant ou apres.`

export const CROSS_CONSOLIDATION_PROMPT = `Tu es un service de consolidation memoire. Croise les souvenirs episodiques avec les chunks de conversations recentes pour enrichir le profil utilisateur.

<episodes>
{episodes}
</episodes>

<recent-chunks>
{chunks}
</recent-chunks>

Retourne un JSON array d'actions :
- { "action": "create", "content": "...", "category": "preference|behavior|context|skill|style", "confidence": 0.7 }
- { "action": "reinforce", "episodeId": "id", "confidence": 0.9, "reason": "..." }
- { "action": "update", "episodeId": "id", "content": "nouveau contenu", "confidence": 0.8, "reason": "..." }

Regles :
- Create : pattern recurrent dans les chunks qui n'est capture par aucun episode
- Reinforce : les chunks recents confirment un episode existant → augmenter confiance
- Update : les chunks recents contredisent ou nuancent un episode → mettre a jour
- Ne pas creer de doublons d'episodes existants
- Confidence des nouveaux episodes : 0.5 minimum (deja valide par les chunks)
- Maximum 10 nouvelles creations par run

Retourne UNIQUEMENT un JSON array valide. Pas de texte avant ou apres.`

export interface SemanticAction {
  action: 'merge' | 'delete' | 'keep'
  keepId?: string
  deleteIds?: string[]
  mergedContent?: string
  pointId?: string
  reason?: string
}

export interface EpisodicAction {
  action: 'stale' | 'merge' | 'delete' | 'keep'
  episodeId?: string
  keepId?: string
  deleteIds?: string[]
  newConfidence?: number
  reason?: string
}

export interface CrossAction {
  action: 'create' | 'reinforce' | 'update'
  content?: string
  category?: string
  confidence: number
  episodeId?: string
  reason?: string
}

export function parseJsonActions<T>(text: string, label: string): T[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      console.log(`[Oneiric:${label}] No JSON array found in response`)
      return []
    }

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []

    return parsed.filter((a: unknown) => {
      if (typeof a !== 'object' || a === null) return false
      const obj = a as Record<string, unknown>
      return typeof obj.action === 'string'
    })
  } catch {
    console.error(`[Oneiric:${label}] Failed to parse JSON response`)
    return []
  }
}
