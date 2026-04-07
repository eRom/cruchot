# Stack Frontend (Interface Utilisateur)

L'interface de Cruchot est une Single Page Application (SPA) riche, construite avec des technologies modernes pour offrir des performances optimales (notamment lors du streaming de longs textes) et une expérience développeur fluide.

## 1. Coeur du Frontend

- **React 19** : Utilisation de la dernière version de React pour le rendu de l'interface.
- **TypeScript** : Typage strict de bout en bout, partagé via des types communs avec le processus Main (IPC).
- **Vite (via `electron-vite`)** : Outil de build et serveur de développement ultra-rapide. La configuration (`electron.vite.config.ts`) inclut un "Chunk Splitting" agressif pour séparer le code applicatif des grosses dépendances (Shiki, Mermaid, React) afin d'optimiser le chargement.

## 2. Gestion d'État (State Management)

- **Zustand (v5)** : Utilisé comme gestionnaire d'état global léger et performant. Il permet de gérer l'état des conversations, des paramètres de l'application et de la file d'attente des messages sans la lourdeur de Redux.

## 3. Style et Composants UI

L'interface est conçue pour être minimaliste, ressemblant à un terminal moderne ou à un IDE.

- **TailwindCSS (v4)** : Utilisation de la nouvelle version (basée sur `@tailwindcss/vite`) pour un styling utilitaire rapide et sans fichier de configuration lourd.
- **Radix UI** : Utilisation de primitives non-stylées (Dialog, DropdownMenu, Popover, ScrollArea, Select, Tooltip) pour garantir l'accessibilité (a11y) et le comportement natif des composants complexes.
- **Lucide React** : Bibliothèque d'icônes cohérente et légère.
- **Sonner** : Système de notifications (Toasts) non-bloquant pour les alertes (erreurs réseau, copie de code, etc.).

## 4. Rendu Riche (Rich Text Rendering)

Le cœur de la valeur de Cruchot réside dans sa capacité à afficher correctement les réponses complexes des LLMs.

- **Markdown** : `react-markdown` couplé à `remark-gfm` pour le support des tableaux et des listes de tâches (GitHub Flavored Markdown).
- **Coloration Syntaxique** : `shiki` est utilisé pour une coloration syntaxique extrêmement précise (basée sur TextMate) des blocs de code générés par l'IA.
- **Mathématiques** : Support complet de LaTeX via `remark-math` et `rehype-katex`.
- **Diagrammes** : Support natif du rendu `mermaid` pour générer des diagrammes d'architecture, des flux de données ou des mindmaps directement dans le chat.
- **Graphiques** : `recharts` est utilisé pour afficher les statistiques d'utilisation (tokens, coûts) dans le panneau de paramètres.

## 5. Plan Mode — Composants UI

Le **Plan Mode** introduit un ensemble de composants dédiés à la supervision de la planification du LLM.

- **`PlanMessage`** (`src/renderer/src/components/chat/PlanMessage.tsx`) : Affiche le plan structuré (`PlanData`) dans le fil de messages, avec 4 états visuels : `planning` (en cours), `ready` (en attente validation), `executing` (exécution) et `done` (terminé).
- **`PlanStickyIndicator`** : Bandeau collant affiché en haut de `ChatView` pendant la phase d'exécution — indique la progression (étape courante / total) et permet d'annuler.
- **`PlanErrorBanner`** : Bannière d'erreur affichée si le plan échoue ou si un outil est bloqué par la porte read-only.

Ces composants sont intégrés dans `ChatView.tsx` et `MessageItem.tsx`. L'état du plan est géré dans le store Zustand via `updateMessagePlan`. Le toggle Plan Mode se trouve dans le panneau de droite (section Options). La commande slash `/plan` permet de forcer l'activation en cours de conversation.

## 6. Vue Recherche (SearchView)

La **SearchView** est une vue dédiée à la recherche plein texte dans toutes les conversations, accessible via `Menu > Recherche` ou le raccourci `⌘F` / `Ctrl+F`.

### Architecture

- **`ViewMode 'search'`** : ajouté au type `ViewMode` dans `ui.store.ts` et routé dans `App.tsx` via un `React.lazy`.
- **Composant** : `src/renderer/src/components/search/SearchView.tsx`.
- **Raccourci clavier** : `useKeyboardShortcuts` gère `command+f,ctrl+f` via un callback `onSearch`.
- **Entrée UserMenu** : item "Recherche" placé entre Personnaliser et Paramètres.

### Fonctionnement

- **Input** avec debounce 300 ms, autofocus à l'ouverture, minimum 2 caractères.
- **Filtres** : pill `Tout / User / Assistant` (rôle) + dropdown projet.
- **Résultats** groupés par conversation, avec snippet surligné (`<mark>`).
- **Navigation** : clic sur un résultat → bascule sur `'chat'` et sélectionne la conversation.
- L'état du filtre et de la query **persiste** lors des allers-retours entre vues (state dans le composant).

## 7. VCR Recording — UI

La section **VCR** est la 7e section du Right Panel (`chat/right-panel/VcrSection.tsx`). Elle permet de démarrer/arrêter un enregistrement de session depuis l'interface.

### Composants

- **`VcrSection`** : section collapsible dans RightPanel. Affiche un bouton `Record` (rouge) à l'arrêt, ou un tableau de bord en cours d'enregistrement (durée MM:SS, compteur d'événements, compteur d'appels d'outils) + bouton `Stop Recording`.
- **`VcrBadge`** : badge `REC` rouge clignotant affiché dans `ContextWindowIndicator` quand un enregistrement est actif.
- **`vcr.store.ts`** : Zustand store exposant `isRecording`, `activeRecording` (`ActiveRecordingInfo`), `startRecording()`, `stopRecording()`, `refreshStatus()`. Polling toutes les 2s pendant l'enregistrement pour mettre à jour les compteurs.

### Comportement

- `startRecording()` extrait le `modelId` et `providerId` depuis `providersStore.getSelectedModelId()` (format `provider::modelId`).
- `stopRecording()` déclenche le handler IPC `vcr:stop` qui ouvre une `dialog.showSaveDialog()` côté main process — l'utilisateur choisit le dossier et le nom du fichier. Les exports `.ndjson` + `.html` sont écrits en parallèle.
- Le timer local (intervalle 1s) calcule la durée d'enregistrement côté renderer à partir de `activeRecording.startedAt`.

## 8. Dashboard Statistiques (`StatsView`)

Le dashboard `StatsView` (`src/renderer/src/components/statistics/StatsView.tsx`) offre une vue complète des coûts et de l'utilisation de l'application.

### Structure du dashboard

- **Filtres de période** : sélecteur 7j / 30j / 90j / 1an avec comparaison à la période précédente (variation en %).
- **Section "Coûts Chat"** : coût total des messages, tokens in/out, provenant de la table `messages`.
- **Section "Coûts Arrière-plan"** : breakdown par type (`compact`, `episode`, `summary`, `optimizer`, `image`, `skills`, `live_memory`, `oneiric`) provenant de la table `llm_costs`. Chaque type affiché avec son coût et ses tokens.
- **Coût total combiné** : somme des coûts chat + arrière-plan.
- **Graphiques** : courbes journalières (`recharts`) + barres par provider/modèle.
- **Section projets** : coûts par projet avec nombre de conversations et messages.

### IPC Statistics

| Channel | Description |
|---------|-------------|
| `statistics:daily` | Coûts journaliers (N derniers jours) |
| `statistics:providers` | Coûts groupés par provider |
| `statistics:models` | Coûts groupés par modèle |
| `statistics:total` | Stats globales (messages chat uniquement) |
| `statistics:projects` | Coûts par projet |
| `statistics:backgroundCosts` | Coûts arrière-plan groupés par type (`llm_costs`) |
| `statistics:previousPeriod` | Coût total de la période précédente (comparaison) |

### Store (`stats.store.ts`)

Le `stats.store.ts` Zustand expose `backgroundCosts`, `previousPeriodCost`, et `todayCost` en plus des stats historiques existantes. Le store charge les données en parallèle via `Promise.all` sur les 7 channels IPC.

## 9. Réception des Actions Menu Applicatif

Le renderer reçoit les actions du menu natif macOS (voir `01-CORE_ARCHITECTURE.md §4`) via un `useEffect` dans `App.tsx` :

```typescript
// App.tsx
import type { MenuAction } from '../../preload/types'

useEffect(() => {
  const handleMenuAction = async (action: MenuAction) => {
    switch (action) {
      case 'new-conversation': handleNewConversation(); break
      case 'customize': handleCustomize(); break
      case 'settings': handleSettings(); break
      case 'backup-now': /* window.api.backupCreate() + toast */ break
      case 'export-bulk': /* window.api.exportBulk() + toast */ break
      case 'import-bulk': /* window.api.importBulk() + navigation vers Settings > Data si token requis */ break
    }
  }
  window.api.onMenuAction(handleMenuAction)
  return () => { window.api.offMenuAction() }
}, [handleNewConversation, handleCustomize, handleSettings, setSettingsTab, setCurrentView])
```

Chaque action réutilise le handler existant (même chemin de code que le raccourci clavier ou le bouton équivalent). L'action `import-bulk` gère le cas `needsToken` en naviguant vers l'onglet Data des paramètres, où l'UI existante gère la saisie du token de déchiffrement.

## 10. Internationalisation (i18n)

- **i18next / react-i18next** : L'infrastructure i18n est en place avec les fichiers de traduction dans `src/renderer/src/locales/`. En pratique, l'interface est principalement en français avec un support anglais partiel. L'utilisation de `useTranslation()` dans les composants reste limitée — la majorité des textes UI sont codés en dur en français.
