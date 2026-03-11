# Feature : Résumé de conversation

## Objectif

Permettre de générer un résumé de la conversation active en un clic, copié automatiquement dans le clipboard.

## Configuration (Paramètres > Résumé)

10ème onglet Settings :
- **Modèle LLM** : sélecteur parmi les modèles texte des providers configurés (format `providerId::modelId`)
- **Prompt système** : textarea éditable avec valeur par défaut ("Résume cette conversation de manière concise et structurée...")
- Bouton "Réinitialiser" pour revenir au prompt par défaut

## UI — Bouton Résumé

- **Position** : dans `ContextWindowIndicator`, à droite du badge Remote
- **Icône** : `FileText` (lucide-react) + label "Résumé"
- **Activation** : > 2 messages non-system dans la conversation ET modèle configuré
- **Disabled** : tooltip expliquant pourquoi (pas configuré / pas assez de messages)
- **Loading** : animation pulse pendant la génération

## Action (clic)

1. Appel IPC `summary:generate` avec `{ conversationId, modelId, prompt }`
2. Backend : `generateText()` one-shot (AI SDK v6)
   - System prompt = prompt configuré
   - Messages = historique user/assistant de la conversation
   - temperature=0.3, maxTokens=4096
3. Résultat copié dans le clipboard (`navigator.clipboard.writeText`)
4. Toast sonner : "Résumé copié dans le presse-papier"
5. En cas d'erreur : toast erreur avec description

## Non-scope

- Pas de conversation DB créée pour le résumé
- Pas de streaming UI (appel one-shot en background)
- Pas de tracking coût
- Pas de persistance du résumé en base
- Pas de truncation des conversations longues (v1)

## Architecture

```
SummaryButton (click)
  → window.api.summarizeConversation(payload)
    → IPC 'summary:generate'
      → getMessagesForConversation()
      → getModel(providerId, modelId)
      → generateText({ system + messages })
      → return { text }
  → navigator.clipboard.writeText(text)
  → toast.success()
```

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/preload/types.ts` | Types SummarizePayload, SummarizeResult |
| `src/preload/index.ts` | Méthode summarizeConversation |
| `src/main/ipc/summary.ipc.ts` | **Nouveau** — Handler backend |
| `src/main/ipc/index.ts` | Registration |
| `src/renderer/src/stores/ui.store.ts` | SettingsTab += 'summary' |
| `src/renderer/src/stores/settings.store.ts` | summaryModelId + summaryPrompt |
| `src/renderer/src/components/settings/SummaryTab.tsx` | **Nouveau** — Onglet config |
| `src/renderer/src/components/settings/SettingsView.tsx` | 10ème tab |
| `src/renderer/src/components/chat/ContextWindowIndicator.tsx` | Bouton SummaryButton |
