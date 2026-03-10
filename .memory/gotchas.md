# Gotchas — Multi-LLM Desktop

**Derniere mise a jour** : 2026-03-10 (session 12)

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

### Electron sandbox bloque file:// dans le renderer
**Symptome** : Les images generees s'affichaient avec une icone cassee (broken image) dans le chat ET la galerie.
**Cause** : `sandbox: true` dans BrowserWindow empeche le renderer d'acceder aux fichiers locaux via `file://`.
**Fix** : Enregistrer un custom protocol `local-image://` dans `index.ts` avec `protocol.registerSchemesAsPrivileged()` + `protocol.handle()`. Utiliser `net.fetch(pathToFileURL(path))` pour servir les fichiers.

### AI SDK v6 — `mimeType` renomme en `mediaType`
**Symptome** : `result.image.mimeType` retourne `undefined` dans `image.ts`.
**Cause** : AI SDK v6 a renomme `mimeType` en `mediaType` sur `GeneratedFile`.
**Impact** : Mineur — on fallback sur `'image/png'` donc ca marche quand meme.

### Generation d'images — messages non persistes en DB
**Symptome** : Apres generation, cliquer sur la conversation dans la sidebar affichait "Aucun message".
**Cause** : Le flux image dans InputZone ajoutait les messages au store Zustand (memoire) mais ne les sauvegardait pas en DB via IPC. Le handler `images:generate` ne creait pas de messages.
**Fix** : Ajouter `conversationId` et `providerId` au payload de `images:generate`. Le handler main sauvegarde maintenant le message user + assistant (avec `contentData`) en DB. Aussi ajoute `contentData` a `CreateMessageParams` dans `messages.ts`.

### Base64 trop gros pour le store Zustand
**Symptome** : Performance degradee apres generation d'image.
**Cause** : Le base64 d'une image (~2.4 MB en string) etait stocke dans le contentData du message Zustand.
**Fix** : Ne stocker que le `path` dans contentData, afficher via `local-image://` protocol. Le base64 n'est plus dans le store.

### AI SDK — `result.text` vs `result.consumeStream()` pour reasoning models
**Symptome** : "No output generated. Check the stream for errors." quand un modele reasoning est utilise.
**Cause** : `await result.text` lance `NoOutputGeneratedError` si le stream ne produit aucun step (erreur API silencieuse, ou modele reasoning sans text output).
**Fix** : Garder `await result.text` mais attraper `NoOutputGeneratedError` specifiquement. NE PAS utiliser `consumeStream()` car il avale toutes les erreurs (y compris AbortError — casse le bouton cancel).
**Attention** : `consumeStream()` catch en interne toutes les erreurs, rendant le cancel et la detection d'erreurs impossible.

### AI SDK — `NoOutputGeneratedError` import
L'erreur est exportee depuis `'ai'` : `import { NoOutputGeneratedError } from 'ai'`.

### AI SDK v6 — `promptTokens` renomme en `inputTokens`
**Symptome** : Le cout affiche toujours $0.00, tokens = 0 dans la DB, malgre pricing correct.
**Cause** : AI SDK v6 a renomme les proprietes usage : `promptTokens` → `inputTokens`, `completionTokens` → `outputTokens`.
**Preuve** : `result.usage` retourne `{ inputTokens: 42, outputTokens: 352, ... }` — `promptTokens` est `undefined`.
**Fix** : Dans `chat.ipc.ts`, utiliser `usage?.inputTokens` et `usage?.outputTokens`.
**Note** : `include_usage: true` est envoye automatiquement par `@ai-sdk/openai` en streaming — pas besoin de config.

### AI SDK v6 — `onFinish` vs `await result.usage`
**Piege** : Ne PAS utiliser `onFinish` pour sauvegarder les couts. Utiliser `await result.text` puis `await result.usage` apres consommation du stream. Plus fiable pour tous les providers.

### Radix ScrollArea — `display: table` casse les layouts flex
**Symptome** : Boutons hover des ConversationItem pousses hors de la zone visible quand le titre est long.
**Cause** : Radix ScrollArea Viewport enveloppe le contenu dans `<div style="display: table; min-width: 100%">`. Ce wrapper s'elargit avec le contenu au lieu de le contraindre. Les elements flex `w-full` prennent 100% du wrapper elargi.
**Fix** : Remplacer `<ScrollArea>` par un simple `<div className="overflow-y-auto overflow-x-hidden">` dans ConversationList. Positionner les boutons d'action en `absolute` avec degrade de fond.
**Regle** : Ne PAS utiliser Radix ScrollArea quand le contenu a des elements flex avec hover actions.

### DataSettings — bouton "Supprimer tout" etait un stub
**Symptome** : Le bouton "Supprimer tout" dans Parametres > Donnees ne faisait rien.
**Cause** : `handleDeleteAll` fermait juste le dialog de confirmation sans appeler d'IPC.
**Fix** : Ajoute `deleteAllConversations` IPC (conversations.ipc.ts) + `deleteAllMessages` (messages.ts) + expose dans preload. DataSettings appelle l'IPC puis `window.location.reload()`.

### Conversation modelId — jamais sauve ni restaure
**Symptome** : Le modele revenait au defaut quand on switchait de conversation ou relancait l'app.
**Cause** : `updateConversationModel()` existait dans queries/conversations.ts mais n'etait jamais appelee. ChatView ne restaurait pas le modele au switch.
**Fix** : chat.ipc.ts appelle `updateConversationModel(convId, 'providerId::modelId')`. ChatView lit `conv.modelId` et appelle `selectModel()` au switch.

### xAI — modeles Grok renommes (mars 2026)
Les anciens IDs `grok-4.1-fast` et `grok-code-fast-1` n'existent plus.
Nouveaux IDs : `grok-4-1-fast-reasoning` (supportsThinking: true) et `grok-4-1-fast-non-reasoning` (supportsThinking: false).
Les tirets remplacent les points dans les IDs.

### xAI — reasoningEffort Chat API
Le Chat API xAI (`xai(modelId)`) supporte uniquement `reasoningEffort: 'low' | 'high'`. Pas de 'none', pas de 'medium'.
Le Responses API (`xai.responses(modelId)`) supporte `'low' | 'medium' | 'high'`.
Quand thinking est "off" pour xAI, ne pas envoyer de reasoningEffort (undefined).

### Radix Select — SelectLabel exige SelectGroup (session 9)
**Symptome** : Erreur React "SelectLabel must be used within SelectGroup".
**Cause** : Les headers de section du RoleSelector utilisaient `<SelectLabel>` directement dans `<SelectContent>` sans `<SelectGroup>`.
**Fix** : Remplacer `<SelectLabel>` par de simples `<div>` pour les headers de section. Pas besoin de Radix SelectGroup.
**Regle** : Ne PAS utiliser `<SelectLabel>` sans `<SelectGroup>` dans les composants shadcn Select.

### RoleSelector — hauteur inconsistante avec les autres pills (session 9)
**Symptome** : Le RoleSelector pill etait plus haut que ModelSelector et ThinkingSelector (meme avec h-7, py-0, leading-none).
**Cause** : Utiliser un `<button>` custom au lieu du composant `<SelectTrigger>` de shadcn. Le composant shadcn gere finement la hauteur interne.
**Fix** : Rewrite complet avec `<Select>`/`<SelectTrigger>` de shadcn (meme pattern que ThinkingSelector). Copier le style exact.
**Regle** : Pour les pill selectors dans InputZone, toujours utiliser shadcn Select, jamais de button custom.

### RoleSelector popover coupe par overflow-hidden (session 9)
**Symptome** : Le dropdown du RoleSelector etait tronque/invisible.
**Cause** : Le conteneur parent de la textarea dans InputZone avait `overflow-hidden` qui clippait le popover Radix.
**Fix** : Retirer `overflow-hidden` du div conteneur textarea dans InputZone.
**Regle** : Ne pas mettre `overflow-hidden` sur un conteneur qui contient des Select/Popover Radix.

### Roles — champs description/icone/categorie masques
Romain veut que ces champs soient invisibles dans le formulaire ET les cartes. Ils sont gardes en DB (valeur vide par defaut) mais pas exposes dans l'UI.

### Chokidar — doit etre en external dans electron.vite.config (session 11)
**Cause** : Chokidar est un package ESM avec des deps natives. Si bundle par Vite, erreurs au runtime.
**Fix** : Ajouter `'chokidar'` dans le tableau `external` de `electron.vite.config.ts` (section main).
**Note** : Import dynamique `await import('chokidar')` dans `file-watcher.service.ts`.

### Workspace — import paths depuis components/workspace/ (session 11)
**Symptome** : Erreurs TS "Cannot find module" sur les imports de `preload/types`.
**Cause** : Les composants dans `components/workspace/` sont a 4 niveaux de `preload/` (comme `components/chat/`), pas 5.
**Fix** : Utiliser `../../../../preload/types` (4 `../`) depuis `components/workspace/*.tsx`, et `../../../preload/types` (3 `../`) depuis `stores/workspace.store.ts`.
**Regle** : Verifier la profondeur reelle avant d'ecrire un import relatif vers preload.

### Workspace — FileNode.children implicit any dans .map/.some (session 11)
**Symptome** : `Parameter 'child' implicitly has an 'any' type` en TypeScript strict.
**Cause** : `FileNode.children` est `FileNode[] | undefined`. Les callbacks `.map()` et `.some()` sur ce tableau necessitent des annotations de type explicites.
**Fix** : Ajouter `(child: FileNode)`, `(part: string, i: number)`, `(node: FileNode)` aux callbacks.

### Workspace — FileOperationCard TYPE_CONFIG index error (session 11)
**Symptome** : `operation.type` ne peut pas indexer un plain object.
**Fix** : Typer explicitement l'objet config : `Record<FileOperation['type'], { icon: typeof FilePlus; label: string; color: string }>`.

### WorkspacePanel — toggle vs close (session 11)
**Decision** : Romain veut un **toggle** (afficher/cacher le panneau) et PAS un bouton close (X) qui ferme le workspace.
**Implementation** : `PanelRightClose` / `PanelRightOpen` icons, `togglePanel()` du store (pas `closeWorkspace()`).
**ChatView** : condition `workspaceRootPath && <WorkspacePanel />` — le panneau est rendu des que le workspace est ouvert, il gere son propre etat collapsed.

### CSP bloque blob: URLs pour media (session 12)
**Symptome** : `<audio>` avec blob URL ne joue pas. Console : "Loading media from 'blob:...' violates Content Security Policy directive: 'default-src'".
**Cause** : La CSP dans `index.html` avait `default-src 'self'` sans `media-src`. Le `<audio>` element ne peut pas charger les blob URLs.
**Fix** : Ajouter `media-src 'self' blob:` a la meta CSP dans `src/renderer/index.html`.
**Regle** : Toute nouvelle source media (audio, video) via blob URL necessite `media-src blob:` dans la CSP.

### Google Gemini TTS retourne du PCM brut, pas du MP3 (session 12)
**Symptome** : `audio.play()` echoue silencieusement apres synthese Google.
**Cause** : Gemini TTS retourne `audio/L16;codec=pcm;rate=24000` (raw PCM 16-bit mono 24kHz). L'element `<audio>` HTML ne peut pas lire le PCM brut.
**Fix** : Fonction `pcmToWav()` dans `tts.service.ts` — ajoute un header WAV 44 bytes avant le PCM, retourne `audio/wav`.
**Detection** : Parser le sample rate depuis le mimeType : `rawMimeType.match(/rate=(\d+)/)`.

### Mistral n'a PAS de TTS (session 12)
**Symptome** : `POST api.mistral.ai/v1/audio/speech` retourne 404 ("no Route matched").
**Cause** : Mistral AI ne propose que du STT (Voxtral Transcribe/Realtime), pas de TTS.
**Fix** : Retirer Mistral des providers TTS. 2 providers cloud uniquement : OpenAI + Google.

### Preload non recharge en HMR (session 12)
**Symptome** : `window.api.ttsGetAvailableProviders is not a function` apres ajout de methodes au preload.
**Cause** : Le preload est compile au demarrage d'Electron, pas recharge par le HMR du renderer.
**Fix** : Toujours relancer l'app (`Cmd+Q` + `npm run dev`) apres modification du preload.
**Regle** : Changements dans `src/preload/` ou `src/main/` → restart app complet. Seul `src/renderer/` beneficie du HMR.

### TTS cloud — erreur IPC vs erreur playback (session 12)
**Symptome** : Toujours la voix browser meme avec un provider cloud selectionne.
**Cause** : `await audio.play()` etait dans le meme `try/catch` que l'appel IPC. Si le playback echouait (ex: CSP, format PCM), le catch declenchait le fallback browser.
**Fix** : Separer les `try/catch` — un pour l'IPC, un pour le playback. Ne pas fallback silencieusement.
**Regle** : Toujours separer les erreurs reseau/IPC des erreurs de rendu UI dans les catch.

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
Les `providerOptions` sont specifiques a chaque provider :
- Anthropic : `{ anthropic: { thinking: { type: 'enabled', budgetTokens } } }`
- OpenAI : `{ openai: { reasoningEffort: 'low' | 'medium' | 'high' } }`
- Google : `{ google: { thinkingConfig: { thinkingBudget: number } } }`
- xAI : `{ xai: { reasoningEffort: 'low' | 'high' } }` (Chat API uniquement)

### hotkeys-js — virgule comme separateur
**Piege general** : `hotkeys-js` utilise `,` comme separateur de raccourcis. Tout raccourci impliquant la touche virgule doit etre gere via un listener natif `keydown`.

### Electron protocol.registerSchemesAsPrivileged — DOIT etre avant app.whenReady()
L'appel a `protocol.registerSchemesAsPrivileged()` doit se faire au top-level du module, AVANT `app.whenReady()`. Sinon le scheme n'est pas reconnu.

### AI SDK — experimental_generateImage vs generateImage
Dans `ai@^6.0.116`, `experimental_generateImage` est un alias deprece de `generateImage`. Les deux fonctionnent. Le type de retour a `image` (premier) et `images` (tableau). `GeneratedFile` a `base64`, `uint8Array`, `mediaType` (pas `mimeType`).

## Preferences UI de Romain

- Prefere les vues inline (formulaire remplace la grille) plutot que les modals/dialogs
- Veut un CRUD complet visible (pas juste un champ nom pour creer un projet)
- Le modele par defaut est obligatoire sur un projet (pas d'option "aucun")
- Style Claude Desktop pour la vue Projets (grille de cartes avec barre de couleur, recherche, tri)
- Parametres modele (temperature, maxTokens, topP) globaux, pas par modele — dans Settings
- Type prompt "system" supprime — seulement "complet" et "complement"
- Header sidebar : "Nouvelle discussion" (pas de label app), bouton cliquable qui cree une conv
- Title bar macOS avec traffic lights natifs

## Preferences UI de Romain (complement session 5)

- Footer message assistant : actions (audio, copier) a gauche, info modele a droite — en bas de la bulle, pas dans une colonne separee
- Hover-to-reveal pour les boutons d'action (pas toujours visibles)

## Preferences UI de Romain (complement session 7)

- ModelSelector simplifie : liste plate (texte/images), pas de groupement par provider
- Cout total conversation en gras dans le compteur de tokens (bas droite)
- Blocs de code markdown : padding interne pour ne pas coller au bord

## Preferences UI de Romain (complement session 9)

- Roles : description, icone Lucide, categorie masques du formulaire ET des cartes
- RoleSelector : doit etre APRES ThinkingSelector dans InputZone (pas avant)
- Pills InputZone : toujours utiliser le meme composant shadcn Select (copier le pattern ThinkingSelector)

## Preferences UI de Romain (complement session 11)

- WorkspacePanel : toggle (PanelRightClose/PanelRightOpen) au lieu de bouton fermer (X)
- Le panneau se replie mais ne se ferme pas — le workspace reste ouvert tant que le projet en a un

### MarkdownRenderer — blocs de code sans langage collent au bord
**Symptome** : Texte colle a la bordure gauche dans les blocs de code sans langage specifie.
**Cause** : `<pre>` n'avait pas de padding. Les blocs avec langage passaient par `ShikiCodeBlock` (qui a `p-4 pt-8`), mais les blocs sans langage tombaient dans le fallback inline `<code>` sans marge.
**Fix** : Ajouter `p-4 text-[13px] leading-6` sur `<pre>` + reset des styles inline code imbrique `[&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit`.
**Attention** : Sans le reset `[&_code]`, le `<code>` inline a l'interieur du `<pre>` ajoutait un double padding (`px-1.5` + `p-4`).

### Mistral Magistral — reasoning built-in
Le modele `magistral-medium-2509` a un reasoning built-in (Test Time Computation). Pas de `providerOptions` a envoyer — le `ThinkingSelector` est purement decoratif pour ce provider. Le `default` case dans `thinking.ts` retourne `undefined`, ce qui est le bon comportement.

### Statistics — 4 bugs critiques (session 8)
**Bug 1** : `date(createdAt / 1000, 'unixepoch')` → createdAt est deja en secondes (Drizzle `mode: 'timestamp'`), diviser par 1000 donne des dates en 1970. Fix : `date(createdAt, 'unixepoch')`.
**Bug 2** : `new Date(...)` dans `sql\`\`` → better-sqlite3 ne peut pas binder un objet Date. Fix : utiliser un entier `Math.floor((Date.now() - days * 86400000) / 1000)`.
**Bug 3** : `ORDER BY ... DESC` dans `getDailyStats()` → StatsView faisait `slice(-days)` qui prenait les plus anciens. Fix : `ASC`.
**Bug 4** : `loadStats()` ne passait pas `days` aux IPC → toujours 30 jours cote serveur. Fix : passer `days` depuis `selectedPeriod` du store.
**API renommee** : `getTotalCost()` → `getGlobalStats()` (ajoute totalResponseTimeMs, totalConversations). `getProjectStats()` nouveau.

### Zustand persist — nouveaux champs
Quand on ajoute un champ au settings store (ex: `favoriteModelIds`), il sera `undefined` au premier chargement apres update (le localStorage n'a pas encore la cle). Toujours traiter avec `?? []` ou `?? defaultValue` dans les composants.

## Elements toujours non cables / manquants

- Search bar dans la sidebar (T34)
- ~~PromptPicker pour InputZone (T29)~~ — **FAIT** (session 4)
- ~~ThinkingSelector pour InputZone~~ — **FAIT** (session 5)
- ~~Bouton "Supprimer tout" DataSettings~~ — **FAIT** (session 6)
- ~~Persistance modele par conversation~~ — **FAIT** (session 6)
- ~~Cout dans footer message~~ — **FAIT** (session 6)
- ~~Systeme de favoris modeles~~ — **FAIT** (session 7)
- ~~ModelSettings sous-onglets~~ — **FAIT** (session 7)
- ~~Cout total conversation~~ — **FAIT** (session 7)
- ~~Cmd+M liste des modeles~~ — **FAIT** (session 7)
- BranchNavigation dans MessageItem (T45)
- a11y.ts utilitaires
- ~~T56 (Advanced Stats)~~ — **FAIT** (session 8) — fix bugs + stats projet + global stats + 6 cards + 4 graphiques
- ~~Roles (System Prompts)~~ — **FAIT** (session 9) — RolesView, RoleSelector, verrouillage, variables, persistance roleId
- ~~Workspace Co-Work~~ — **FAIT** (session 11) — WorkspaceService, FileWatcher, FileTree, FilePanel, FileOperationCard, context injection, toggle panel
- ~~TTS Multi-Provider~~ — **FAIT** (session 12) — Browser + OpenAI (Coral) + Google (Aoede), AudioSettings, tts_usage table, stats TTS, cache audio
- T48 (Prompt Optimizer), T52 (Export PDF), T60 (Packaging)
- i18n (T41) — configure mais `useTranslation` jamais utilise
- SSH key GitHub non configuree — push en HTTPS uniquement
