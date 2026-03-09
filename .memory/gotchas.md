# Gotchas — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-09 (session 3)

## Bugs resolus

### AI SDK v6 — `textDelta` renomme en `text`
**Symptome** : Les messages assistant s'affichaient vides (bulle vide, temps de reponse correct).
**Cause** : AI SDK v6 a renomme `chunk.textDelta` en `chunk.text` dans le callback `onChunk`.
**Fix** : `chat.ipc.ts` ligne ~94, changer `chunk.textDelta` en `chunk.text`.

### AppearanceSettings — sliders non persistes
**Symptome** : Font size, density, message width perdus au refresh.
**Cause** : Le composant utilisait `useState` local au lieu du Zustand store.
**Fix** : Ajouter `fontSizePx`, `density`, `messageWidth` au `settings.store.ts` (avec persist), rewirer le composant.

### InputZone — conversation pas ajoutee au store
**Symptome** : Messages envoyes sur une nouvelle conversation non trackee dans la sidebar.
**Cause** : `createConversation()` etait appele mais `addConversation(conv)` et `setActiveConversation(conv.id)` manquaient.
**Fix** : Ajouter les deux appels store apres la creation IPC.

### UpdateNotification — cast TypeScript
**Symptome** : `TS2352` sur `window.api as Record<string, unknown>`.
**Fix** : Utiliser directement les methodes typees de `window.api` (toutes ajoutees dans ElectronAPI).

### CommandPalette — prop `onOpenChange` inexistante
**Fix** : Remplacer par `onClose` (la prop reelle du composant).

### CommandPalette — callbacks jamais passes
**Symptome** : "Nouvelle conversation" et "Parametres" ne fonctionnaient pas dans Cmd+K.
**Cause** : Les props `onNewConversation`, `onOpenSettings`, `onSelectConversation` n'etaient jamais passees depuis App.tsx.
**Fix** : Cabler les callbacks dans App.tsx vers les handlers existants.

### CommandPalette — recherche ne trouvait pas les conversations d'autres projets
**Symptome** : Une conv dans un autre projet n'apparaissait pas dans Cmd+K.
**Cause** : Le composant utilisait `useConversationsStore` qui ne contient que les conversations du projet actif.
**Fix** : Fetch toutes les conversations via `window.api.getConversations()` (sans arg) a l'ouverture de la palette. Quand on selectionne une conv, switcher le `activeProjectId` pour que la sidebar se mette a jour.

### hotkeys-js — Cmd+, impossible
**Symptome** : Le raccourci Cmd+virgule pour ouvrir les parametres ne fonctionnait pas.
**Cause** : `hotkeys-js` utilise la virgule comme separateur de raccourcis multiples (`'command+n,ctrl+n'`). Impossible de lui passer `command+,` ou `command+comma`.
**Fix** : Utiliser un listener natif `document.addEventListener('keydown')` qui verifie `e.key === ',' && e.metaKey`.

## Composants non cables (session precedente)

Probleme majeur decouvert : de nombreux composants crees par les agents P1/P2 n'etaient jamais importes. Session de cablage massif effectuee :
- SettingsView : 6 tabs extraits en composants separes
- App.tsx : UpdateNotification, OfflineIndicator, CommandPalette, OnboardingWizard, keyboard shortcuts
- InputZone : VoiceInput, ModelParams
- MessageItem : AudioPlayer
- ImagesView : remplacement mock data par IPC
- Sidebar : ProjectSelector, Images NavButton

## Pieges connus

### Drizzle — aggregations + relational queries
Les aggregations SQL (`sum`, `count`) ne fonctionnent PAS avec les relational queries. Utiliser le core query builder avec `sql<T>()`.

### Zustand middleware order
L'ordre des middlewares compte : le plus interne s'execute en premier.

### electron-vite — chemin du preload en dev
Utiliser `path.join(__dirname, '../preload/index.js')` qui fonctionne en dev et prod.

### better-sqlite3 — WAL checkpoint
Sans checkpoint periodique, le fichier WAL grossit indefiniment. Lancer `PRAGMA wal_checkpoint(RESTART)` au demarrage.

### SQLite FTS5 — table virtuelle
Doit etre creee manuellement (pas via Drizzle schema). Migration SQL raw necessaire.

### defaultModelId — format composite
Le `defaultModelId` des projets est stocke au format `providerId::modelId`. Toujours `split('::')` avant d'appeler `selectModel()`.

### Conversations — filtre par projet
`getConversations(null)` retourne les conversations sans projet (boite de reception).
`getConversations(projectId)` retourne les conversations du projet.
`getConversations()` (sans argument) retourne TOUTES les conversations.

### AbortController — cote client seulement
L'annulation stoppe la requete cote client mais le serveur continue a consommer des tokens.

### Vercel AI SDK — providerOptions
Les `providerOptions` sont specifiques a chaque provider. Pour Anthropic Extended Thinking : `providerOptions: { anthropic: { thinking: { type: 'enabled', budgetTokens } } }`.

### hotkeys-js — virgule comme separateur
**Piege general** : `hotkeys-js` utilise `,` comme separateur de raccourcis. Tout raccourci impliquant la touche virgule doit etre gere via un listener natif `keydown`.

## Preferences UI de Romain

- Prefere les vues inline (formulaire remplace la grille) plutot que les modals/dialogs
- Veut un CRUD complet visible (pas juste un champ nom pour creer un projet)
- Le modele par defaut est obligatoire sur un projet (pas d'option "aucun")
- Style Claude Desktop pour la vue Projets (grille de cartes avec barre de couleur, recherche, tri)
- Parametres modele (temperature, maxTokens, topP) globaux, pas par modele — dans Settings
- Type prompt "system" supprime — seulement "complet" et "complement"
- Header sidebar : "Nouvelle discussion" (pas de label app), bouton cliquable qui cree une conv
- Title bar macOS avec traffic lights natifs

## Elements toujours non cables / manquants

- Search bar dans la sidebar (T34)
- PromptPicker pour InputZone (T29) — PromptsView existe maintenant, il faut le picker dans InputZone
- BranchNavigation dans MessageItem (T45)
- a11y.ts utilitaires
- T48 (Prompt Optimizer), T52 (Export PDF), T56 (Advanced Stats), T60 (Packaging)
- i18n (T41) — configure mais `useTranslation` jamais utilise
- SSH key GitHub non configuree — push en HTTPS uniquement
