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

## 6. Internationalisation (i18n)

- **i18next / react-i18next** : L'infrastructure i18n est en place avec les fichiers de traduction dans `src/renderer/src/locales/`. En pratique, l'interface est principalement en français avec un support anglais partiel. L'utilisation de `useTranslation()` dans les composants reste limitée — la majorité des textes UI sont codés en dur en français.
