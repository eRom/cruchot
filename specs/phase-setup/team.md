# Team Orchestration — Multi-LLM Desktop

> **Date** : 2026-03-09
> **Généré depuis** : TEAM-ANALYSIS.md
> **Modèle agents** : Claude Opus (`claude-opus-4-6`)

---

## Lancement

### Prérequis
- Warp terminal ouvert
- tmux installé (`brew install tmux` si nécessaire)
- Node.js 20+ installé
- Le répertoire `/Users/recarnot/dev/claude-desktop-multi-llm` existe

### Commandes

```bash
# 1. Créer une session tmux
tmux new -s multi-llm

# 2. Lancer Claude Code avec ce prompt
cat team.md | claude
```

---

## Instructions d'orchestration

Tu es le **leader** d'une agent team. Tu dois orchestrer jusqu'à 4 agents en parallèle pour réaliser 60 tâches du projet Multi-LLM Desktop.

### Contexte projet

Application desktop Electron + React + TypeScript — un clone de Claude Desktop avec support multi-LLM (OpenAI, Anthropic, Gemini, Mistral, xAI, Perplexity, OpenRouter, Ollama, LM Studio). Génération d'images, recherche web, voix STT/TTS, statistiques de coûts. Toutes les données restent locales (SQLite + filesystem). Aucun serveur backend.

### Stack technique

- **Desktop** : Electron 35+, electron-vite, electron-builder
- **Frontend** : React 19, TypeScript 5.7, Tailwind CSS 4, shadcn/ui (Radix), Zustand, Lucide React, Sonner
- **Markdown** : react-markdown, rehype-shiki, rehype-katex, remark-gfm, remark-math, mermaid
- **Data** : better-sqlite3 (WAL, FTS5), Drizzle ORM, drizzle-kit
- **LLM** : ai (Vercel AI SDK 5), @ai-sdk/openai, @ai-sdk/anthropic, @ai-sdk/google, @ai-sdk/mistral, @ai-sdk/xai, @ai-sdk/openrouter
- **Autres** : i18next, hotkeys-js, Recharts, jsPDF, date-fns, nanoid, ky, @deepgram/sdk
- **Tests** : Vitest, Playwright, @testing-library/react
- **UI Design** : Utiliser la skill `document-skills:frontend-design` systématiquement pour TOUS les composants UI visibles

### Conventions

- **Fichiers** : kebab-case (`credential.service.ts`, `cost-calculator.ts`)
- **Composants React** : PascalCase (`MessageItem.tsx`)
- **Stores Zustand** : `[domaine].store.ts`
- **IPC handlers** : `[domaine].ipc.ts` dans `src/main/ipc/`
- **DB queries** : `[domaine].ts` dans `src/main/db/queries/`
- **LLM** : `router.ts`, `providers.ts`, `cost-calculator.ts`, `image.ts` dans `src/main/llm/`
- **Suppression** : toujours `trash` au lieu de `rm`
- **Langue** : code en anglais, UI en français par défaut (i18n FR/EN)
- **Sécurité** : clés API jamais dans le renderer, contextIsolation: true, nodeIntegration: false

### Règles d'orchestration

1. Tu es le leader. Tu exécutes toi-même la **Vague 0 (P0)** — les 20 premières tâches.
2. À partir de la **Vague 1 (P1)**, tu crées la team, les tâches, spawnes les agents, et coordonnes.
3. Chaque agent travaille dans son périmètre de fichiers — AUCUN chevauchement.
4. Tu respectes le séquençage par vagues — ne lance pas une vague avant que la précédente soit terminée et validée.
5. Aux points de synchronisation, tu valides que tout compile et fonctionne avant de continuer.
6. Si un agent échoue, tu diagnostiques et relances — tu ne passes PAS à la vague suivante.
7. Pour chaque composant UI, utilise la skill `document-skills:frontend-design` pour garantir un design production-grade.

---

## Vague 0 — P0 MVP Core (Leader seul)

**Tu exécutes ces 20 tâches toi-même, séquentiellement.** C'est le fondement du projet.

### Sous-parallélisme autorisé dans P0

Tu peux lancer des sous-agents pour paralléliser les niveaux suivants :
- **Après T01** : T02 (Tailwind) ‖ T03 (DB) ‖ T04 (IPC) en parallèle
- **Après T06** : T08 (OpenAI) ‖ T09 (Anthropic) ‖ T10 (Gemini) en parallèle
- **Après T12** : T13 (Sidebar) ‖ T14 (Zone A) ‖ T15 (Zone B) en parallèle

### Ordre d'exécution P0

```
T01 → [T02 ‖ T03 ‖ T04] → T05 → T06 → T07 → [T08 ‖ T09 ‖ T10] → T11
→ T12 → [T13 ‖ T14 ‖ T15] → T16 → T17 → T18 → T19 → T20
```

### Validation P0 (SYNC obligatoire)

Avant de passer à la Vague 1, vérifie :

```bash
# L'app démarre
npm run dev

# TypeScript compile
npx tsc --noEmit

# Tests passent
npm run test
```

Critères de validation P0 :
- [ ] L'app démarre sans crash sur macOS
- [ ] On peut configurer au moins 1 clé API (OpenAI)
- [ ] On peut créer une conversation
- [ ] On peut envoyer un message et recevoir une réponse en streaming
- [ ] Le streaming est interruptible (bouton Stop)
- [ ] Les messages sont sauvegardés en DB et rechargés au redémarrage
- [ ] On peut switcher entre conversations
- [ ] Le thème dark/light fonctionne
- [ ] Les erreurs API sont affichées proprement (toast)
- [ ] Le markdown basique est rendu (gras, italique, code, listes)
- [ ] Les tokens et coûts sont affichés par message
- [ ] Au moins 3 providers fonctionnent (OpenAI, Anthropic, Gemini)
- [ ] Aucune clé API n'est accessible depuis le renderer

---

## Vague 1 — P1 Features (4 agents parallèles)

### Étape 1 : Créer la team

```
TeamCreate:
  team_name: "multi-llm"
  description: "Multi-LLM Desktop — Phase P1 Features"
```

### Étape 2 : Créer les tâches P1

Crée chaque tâche P1 avec TaskCreate, puis configure les dépendances avec TaskUpdate (addBlockedBy). Voir l'Annexe pour les descriptions complètes.

### Étape 3 : Spawner les agents P1

#### Agent A — `llm`

```
Agent:
  name: "llm"
  team_name: "multi-llm"
  subagent_type: "general-purpose"
  mode: "bypassPermissions"
  prompt: |
    Tu es l'agent LLM de la team multi-llm.

    TON PÉRIMÈTRE EXCLUSIF :
    - src/main/llm/ (router.ts, providers.ts, cost-calculator.ts, image.ts)
    - src/main/services/openrouter.service.ts (nouveau)
    - src/main/services/local-providers.service.ts (nouveau)
    - Tu ne modifies JAMAIS de fichiers en dehors de ce périmètre

    TES TÂCHES (dans cet ordre) :
    T21 · OpenRouter service — @ai-sdk/openrouter, model listing GET /api/v1/models, crédits GET /api/v1/key, headers HTTP-Referer/X-OpenRouter-Title
    T22 · Providers locaux — Détection Ollama (port 11434) + LM Studio, listing modèles locaux, coût 0$, service dédié

    STACK :
    Le projet utilise le Vercel AI SDK 5 (`ai` + `@ai-sdk/*`). Les providers cloud sont déjà configurés
    dans src/main/llm/providers.ts. Le routeur getModel() dans router.ts sélectionne le bon provider.

    RÈGLES :
    - Utilise les packages @ai-sdk/* — PAS les SDKs natifs des providers
    - Utilise AbortController pour l'annulation
    - Classifie les erreurs : transient (429,500,503) / fatal (401,403) / actionable (402)
    - Après chaque tâche terminée, marque-la completed avec TaskUpdate
    - Consulte TaskList pour prendre la prochaine tâche
    - Si bloqué, envoie un message au leader via SendMessage

    CONTEXTE MCP :
    - T21 : Context7 `@ai-sdk/openrouter` — config, model listing
    - T22 : Context7 `ollama` — détection, listing modèles
```

#### Agent B — `features-main`

```
Agent:
  name: "features-main"
  team_name: "multi-llm"
  subagent_type: "general-purpose"
  mode: "bypassPermissions"
  prompt: |
    Tu es l'agent FEATURES-MAIN de la team multi-llm.

    TON PÉRIMÈTRE EXCLUSIF :
    - src/main/db/queries/ (nouveaux fichiers)
    - src/main/ipc/ (nouveaux fichiers .ipc.ts + mise à jour de index.ts)
    - src/main/services/ (nouveaux fichiers)
    - src/renderer/src/stores/ (nouveaux stores)
    - src/renderer/src/components/projects/ (nouveau répertoire)
    - src/renderer/src/components/prompts/ (nouveau répertoire)
    - src/renderer/src/components/roles/ (nouveau répertoire)

    TES TÂCHES :
    T28 · Projets — CRUD projets, contexte projet (prompt système, modèle par défaut), filtrage sidebar
    T29 · Bibliothèque prompts — CRUD, catégories, tags, variables {{nom}}, insertion rapide, types (complet/complément/système)
    T30 · Rôles/personas — CRUD, prédéfinis (Dev, Rédacteur, Analyste, Traducteur, Coach), application conversation
    T34 · Full-text search — Table virtuelle FTS5 sur messages.content + conversations.title, recherche globale
    T35 · Export conversations — MD, JSON, TXT, HTML, dialog "Enregistrer sous"
    T36 · Import conversations — JSON interne, format ChatGPT, format Claude (APRÈS T35)
    T38 · Cost tracking — Calcul coût par message (tokens × pricing), table statistics pré-agrégée par jour

    STACK :
    - Drizzle ORM pour les queries DB (voir src/main/db/schema.ts pour le schema existant)
    - Zod pour la validation des payloads IPC
    - Zustand pour les stores (pattern slices, voir stores existants comme référence)
    - Pour le FTS5, créer une migration SQL raw : CREATE VIRTUAL TABLE messages_fts USING fts5(content, title)
    - Pour chaque nouveau domaine IPC, créer un fichier [domaine].ipc.ts et l'importer dans ipc/index.ts

    IMPORTANT POUR L'UI :
    - Utilise la skill `document-skills:frontend-design` pour TOUS les composants UI
    - Les composants UI utilisent shadcn/ui + Tailwind CSS 4 + Lucide React pour les icônes

    RÈGLES :
    - Après chaque tâche terminée, marque-la completed avec TaskUpdate
    - Consulte TaskList pour prendre la prochaine tâche non bloquée
    - Si bloqué, envoie un message au leader via SendMessage
    - Utilise `trash` au lieu de `rm` pour supprimer des fichiers
```

#### Agent C — `features-ui`

```
Agent:
  name: "features-ui"
  team_name: "multi-llm"
  subagent_type: "general-purpose"
  mode: "bypassPermissions"
  prompt: |
    Tu es l'agent FEATURES-UI de la team multi-llm.

    TON PÉRIMÈTRE EXCLUSIF :
    - src/renderer/src/components/chat/ (modification des fichiers existants + nouveaux)
    - src/renderer/src/hooks/ (nouveaux hooks)
    - src/renderer/src/components/common/CommandPalette.tsx (nouveau)
    - src/renderer/src/lib/markdown.ts (modification)

    ⚠️ TU ES LE PROPRIÉTAIRE EXCLUSIF de InputZone.tsx et MessageItem.tsx.
    Les autres agents ne touchent PAS ces fichiers.

    TES TÂCHES :
    T27 · Markdown avancé — Shiki (coloration syntaxique), KaTeX (LaTeX), Mermaid (diagrammes SVG), GFM tables
    T32 · Recherche web UI — Affichage sources/citations Perplexity, numéros de référence cliquables (APRÈS T23)
    T39 · Command palette — Cmd+K, recherche fuzzy (conversations, projets, prompts, rôles, commandes), navigation clavier
    T40 · Raccourcis clavier — hotkeys-js, Cmd+N/\/F/Shift+F/K/,, Escape pour annuler
    T43 · Virtualisation messages — TanStack Virtual, useVirtualizer, hauteurs variables, overscan=5, scroll to bottom
    T44 · Context window — Compteur tokens Zone B, indicateur remplissage, alerte 80%, troncature auto (APRÈS T43)
    T45 · Branching conversations — Branches alternatives depuis un message, navigation gauche/droite, parent_message_id

    STACK :
    - react-markdown + remark-gfm + remark-math + rehype-shiki + rehype-katex pour le Markdown
    - mermaid pour les diagrammes (rendu post-process dans un composant MermaidBlock)
    - @tanstack/react-virtual pour la virtualisation (useVirtualizer)
    - hotkeys-js pour les raccourcis clavier
    - shadcn/ui pour tous les composants UI

    IMPORTANT :
    - Utilise la skill `document-skills:frontend-design` pour TOUS les composants UI
    - Pour Shiki : utiliser un highlighter singleton (pas de recréation à chaque render)
    - Pour Mermaid : rendu asynchrone dans un useEffect, pas de SSR
    - Pour la virtualisation : transform: translateY() uniquement (GPU accelerated), pas top/left

    RÈGLES :
    - Après chaque tâche terminée, marque-la completed avec TaskUpdate
    - Consulte TaskList pour prendre la prochaine tâche non bloquée
    - Si bloqué, envoie un message au leader via SendMessage

    CONTEXTE MCP :
    - T27 : Context7 `shiki` — highlighter config, thèmes
    - T43 : Context7 `@tanstack/react-virtual` — useVirtualizer, variable height
```

#### Agent D — `features-rich`

```
Agent:
  name: "features-rich"
  team_name: "multi-llm"
  subagent_type: "general-purpose"
  mode: "bypassPermissions"
  prompt: |
    Tu es l'agent FEATURES-RICH de la team multi-llm.

    TON PÉRIMÈTRE EXCLUSIF :
    - src/main/services/image.service.ts (nouveau)
    - src/main/ipc/images.ipc.ts (nouveau)
    - src/main/ipc/files.ipc.ts (nouveau)
    - src/main/services/file.service.ts (nouveau)
    - src/renderer/src/components/images/ (nouveau répertoire)
    - src/renderer/src/components/statistics/ (nouveau répertoire)
    - src/renderer/src/stores/stats.store.ts (nouveau)
    - src/renderer/src/lib/i18n.ts (nouveau)
    - src/renderer/src/locales/ (nouveau répertoire)
    - src/renderer/src/components/chat/ModelParams.tsx (nouveau)
    - src/renderer/src/components/chat/AttachmentPreview.tsx (nouveau)
    - src/renderer/src/components/chat/DropZone.tsx (nouveau)
    - src/main/ipc/statistics.ipc.ts (nouveau)

    TES TÂCHES :
    T31 · Génération images — Gemini (gemini-3.1-flash-image-preview / gemini-3-pro-image-preview) via AI SDK, sélection modèle Zone B, params (taille, qualité), affichage inline, lightbox, téléchargement PNG
    T33 · Pièces jointes — Upload fichier, drag & drop, coller image clipboard, preview avant envoi, stockage ~/Library/.../attachments/
    T37 · Dashboard stats — Recharts (LineChart coûts, PieChart providers, BarChart modèles), cartes résumé, filtres période/provider/projet (APRÈS T38)
    T41 · i18n FR/EN — i18next + react-i18next, détection langue système, fichiers de traduction fr.json/en.json
    T42 · Paramètres modèle — Panneau dans Zone B, sliders (température, max tokens, top-p), presets (créatif/précis/équilibré), Extended Thinking toggle

    ⚠️ POUR T42 : tu crées le composant ModelParams.tsx mais tu ne modifies PAS InputZone.tsx.
    Fournis une interface claire (props) que l'Agent C intégrera.

    ⚠️ POUR T33 : tu crées AttachmentPreview.tsx et DropZone.tsx mais tu ne modifies PAS InputZone.tsx.
    Fournis les props/callbacks que l'Agent C intégrera.

    STACK :
    - Recharts pour les graphiques (T37)
    - i18next + react-i18next pour l'i18n (T41)
    - shadcn/ui pour tous les composants UI
    - Les images générées sont sauvées dans ~/Library/Application Support/MultiLLM/images/{uuid}.png

    IMPORTANT :
    - Utilise la skill `document-skills:frontend-design` pour TOUS les composants UI
    - Pour i18n : toutes les chaînes UI doivent être externalisées via t('key')

    RÈGLES :
    - Après chaque tâche terminée, marque-la completed avec TaskUpdate
    - Consulte TaskList pour prendre la prochaine tâche non bloquée
    - Si bloqué, envoie un message au leader via SendMessage

    CONTEXTE MCP :
    - T37 : Context7 `recharts` — LineChart, PieChart, BarChart
    - T41 : Context7 `i18next` — config React, détection langue
```

### Étape 4 : Gestion de la Vague 1

1. Spawne les 4 agents en parallèle
2. Assigne les tâches de premier niveau à chaque agent :
   - Agent A : T21, T22 (toutes indépendantes)
   - Agent B : T28, T29, T30, T34, T35, T38 (toutes indépendantes)
   - Agent C : T27, T39, T40, T43, T45 (toutes indépendantes)
   - Agent D : T33, T41, T42 (indépendantes)
3. Attends que TOUS les agents de la Vague 1 aient terminé leurs tâches indépendantes

### SYNC P1a — Merge intermédiaire

```bash
# Vérification
npx tsc --noEmit
npm run test
npm run dev  # L'app démarre et les providers AI SDK sont disponibles
```

Actions leader :
- Merge les branches worktree des 4 agents
- Résoudre les conflits sur `src/main/ipc/index.ts` (ajout d'imports)
- Résoudre les conflits sur `src/preload/index.ts` (ajout de méthodes)
- Intégrer dans InputZone.tsx les composants créés par Agent D (ModelParams, AttachmentPreview, DropZone)

---

## Vague 2 — P1 suite (dépendances résolues)

Après le SYNC P1a, les tâches avec dépendances sont débloquées :

- Agent B : T36 (Import — dépend de T35 Export)
- Agent C : T32 (Recherche web UI), T44 (Context window — dépend de T43 Virtualisation)
- Agent D : T31 (Images — génération via Gemini), T37 (Dashboard — dépend de T38 Cost tracking)

1. Assigne ces tâches aux agents restants
2. Agent A est terminé (seulement 2 tâches) — tu peux le réassigner en support ou le shutdown

### SYNC P1b — Merge final P1

```bash
npx tsc --noEmit
npm run test
npm run dev
```

Critères de validation P1 :
- [ ] Les providers LLM fonctionnent via Vercel AI SDK (cloud + locaux)
- [ ] Les projets, prompts, rôles sont opérationnels
- [ ] La recherche full-text fonctionne
- [ ] La génération d'images fonctionne
- [ ] Les sources Perplexity s'affichent
- [ ] Le dashboard stats affiche des données
- [ ] L'i18n FR/EN fonctionne
- [ ] La virtualisation gère 1000+ messages sans lag
- [ ] L'export/import de conversations fonctionne
- [ ] La command palette (Cmd+K) fonctionne
- [ ] Les raccourcis clavier fonctionnent

---

## Vague 3 — P2 Polish (3 agents parallèles)

### Spawner les agents P2

#### Agent E — `voice-a11y`

```
Agent:
  name: "voice-a11y"
  team_name: "multi-llm"
  subagent_type: "general-purpose"
  mode: "bypassPermissions"
  prompt: |
    Tu es l'agent VOICE-A11Y de la team multi-llm.

    TON PÉRIMÈTRE EXCLUSIF :
    - src/main/services/voice.service.ts (nouveau ou extension)
    - src/renderer/src/components/chat/VoiceInput.tsx (nouveau)
    - src/renderer/src/components/chat/AudioPlayer.tsx (nouveau)
    - src/renderer/src/hooks/useVoiceInput.ts (nouveau)
    - src/renderer/src/hooks/useAudioPlayer.ts (nouveau)
    - src/main/services/prompt-optimizer.service.ts (nouveau)
    - src/renderer/src/components/chat/PromptOptimizer.tsx (nouveau)
    - src/main/services/notification.service.ts (nouveau)
    - Modifications ARIA sur src/renderer/src/components/**/*.tsx

    TES TÂCHES :
    T46 · STT dictée vocale — Deepgram Nova-3 + Web Speech API fallback, bouton micro, waveform, transcription
    T47 · TTS lecture audio — OpenAI TTS / ElevenLabs + Web Speech API fallback, bouton play par message, contrôles
    T48 · Optimisation prompts — Bouton "Améliorer" Zone B, réécriture via LLM, preview diff avant/après
    T53 · Notifications système — Notification native fin de génération, erreur API, dock badge macOS
    T54 · Accessibilité — Navigation clavier complète, ARIA labels, contraste WCAG AA, focus visible, prefers-reduced-motion

    STACK :
    - @deepgram/sdk pour STT cloud
    - MediaRecorder API pour capture audio (format audio/webm;codecs=opus)
    - Web Speech API comme fallback (SpeechRecognition, SpeechSynthesis)
    - Electron Notification pour les notifications système
    - app.dock.setBadge() pour le badge dock macOS

    IMPORTANT :
    - Utilise la skill `document-skills:frontend-design` pour TOUS les composants UI
    - STT : capture audio dans le renderer, envoi buffer au main via IPC
    - TTS : main génère l'audio buffer, envoie au renderer pour playback
    - Pour T48 : ne modifie PAS InputZone.tsx, crée PromptOptimizer.tsx comme composant indépendant

    RÈGLES :
    - Après chaque tâche terminée, marque-la completed avec TaskUpdate
    - Consulte TaskList pour prendre la prochaine tâche non bloquée
    - Si bloqué, envoie un message au leader via SendMessage
```

#### Agent F — `data-infra`

```
Agent:
  name: "data-infra"
  team_name: "multi-llm"
  subagent_type: "general-purpose"
  mode: "bypassPermissions"
  prompt: |
    Tu es l'agent DATA-INFRA de la team multi-llm.

    TON PÉRIMÈTRE EXCLUSIF :
    - src/main/services/export.service.ts (extension — ajout projets, prompts, rôles)
    - src/main/services/import.service.ts (extension)
    - src/main/services/backup.service.ts (nouveau)
    - src/main/services/network.service.ts (nouveau)
    - src/renderer/src/components/statistics/ (extension — nouveaux graphiques)
    - src/renderer/src/components/settings/BackupSettings.tsx (nouveau)
    - src/renderer/src/components/common/OfflineIndicator.tsx (nouveau)
    - electron-builder.yml (nouveau)
    - .github/workflows/build.yml (nouveau)
    - resources/ (icônes)

    TES TÂCHES :
    T49 · Collaboration — Export/import projets complets, prompts, rôles, anonymisation optionnelle
    T52 · Export PDF — jsPDF + html2canvas, messages formatés, images incluses, pagination
    T55 · Backup & restore — Auto quotidien, manuel, restauration, rétention 7 derniers
    T56 · Stats avancées — Heatmap utilisation (jours × heures), tendances, top modèles, export CSV
    T57 · Offline mode — Détection réseau, indicateur UI, file d'attente messages, re-envoi reconnexion
    T60 · Packaging — electron-builder config, DMG/NSIS/AppImage, icônes, CI GitHub Actions

    STACK :
    - jsPDF + html2canvas pour l'export PDF
    - electron-builder pour le packaging (config dans electron-builder.yml)
    - GitHub Actions pour le CI multi-OS
    - Recharts pour les graphiques supplémentaires (heatmap custom)

    IMPORTANT :
    - Utilise la skill `document-skills:frontend-design` pour les composants UI (BackupSettings, OfflineIndicator, stats)
    - Pour le backup : copier le fichier main.db dans ~/Library/.../backups/YYYY-MM-DD.db
    - Pour l'offline : utiliser navigator.onLine + événements online/offline

    RÈGLES :
    - Après chaque tâche terminée, marque-la completed avec TaskUpdate
    - Consulte TaskList pour prendre la prochaine tâche non bloquée
    - Si bloqué, envoie un message au leader via SendMessage

    CONTEXTE MCP :
    - T60 : Context7 `electron-builder` — config multi-OS, code signing
```

#### Agent G — `ux-polish`

```
Agent:
  name: "ux-polish"
  team_name: "multi-llm"
  subagent_type: "general-purpose"
  mode: "bypassPermissions"
  prompt: |
    Tu es l'agent UX-POLISH de la team multi-llm.

    TON PÉRIMÈTRE EXCLUSIF :
    - src/renderer/src/components/onboarding/ (nouveau répertoire)
    - src/renderer/src/components/images/ImagesView.tsx (nouveau)
    - src/renderer/src/components/images/ImageGrid.tsx (nouveau)
    - src/renderer/src/components/images/ImageLightbox.tsx (extension)
    - src/renderer/src/components/settings/GeneralSettings.tsx (nouveau)
    - src/renderer/src/components/settings/AppearanceSettings.tsx (nouveau)
    - src/renderer/src/components/settings/KeybindingsSettings.tsx (nouveau)
    - src/renderer/src/components/settings/VoiceSettings.tsx (nouveau)
    - src/renderer/src/components/settings/DataSettings.tsx (nouveau)
    - src/renderer/src/components/settings/SettingsView.tsx (extension)
    - src/main/db/queries/images.ts (nouveau)

    TES TÂCHES :
    T50 · Onboarding — Wizard premier lancement (bienvenue, clés API, thème), skip possible, flag "first_launch"
    T58 · Galerie images — Vue grille, filtres (provider, date), lightbox navigation, téléchargement/copie, prompt affiché
    T59 · Settings complet — Sections (Général, Apparence, Raccourcis, Voix, Données), police/densité/largeur configurables

    STACK :
    - shadcn/ui pour tous les composants
    - Lucide React pour les icônes
    - Zustand settings store pour la persistence des préférences

    IMPORTANT :
    - Utilise la skill `document-skills:frontend-design` pour TOUS les composants UI
    - L'onboarding ne doit s'afficher qu'une fois (flag dans settings store)
    - Les settings doivent être organisés en tabs/sections navigables

    RÈGLES :
    - Après chaque tâche terminée, marque-la completed avec TaskUpdate
    - Consulte TaskList pour prendre la prochaine tâche non bloquée
    - Si bloqué, envoie un message au leader via SendMessage
```

### SYNC P2 — Merge final

```bash
npx tsc --noEmit
npm run test
npm run dev

# Test du packaging
npm run dist:mac
```

Critères de validation P2 :
- [ ] La dictée vocale fonctionne (au moins Web Speech API)
- [ ] La lecture audio fonctionne
- [ ] L'onboarding s'affiche au premier lancement
- [ ] La galerie images fonctionne
- [ ] Les settings sont complets et persistés
- [ ] Les backups automatiques fonctionnent
- [ ] Le mode offline est détecté
- [ ] L'accessibilité clavier fonctionne
- [ ] Le DMG macOS est généré et l'app démarre depuis le package
- [ ] Le CI GitHub Actions build sur macOS

---

## Vague 4 — Auto-update (Leader seul)

Après T60 (packaging) :

### T51 · Auto-update

Implémente electron-updater :
- Vérification périodique (GitHub Releases)
- Notification avec version + changelog
- Téléchargement arrière-plan + barre de progression
- Installation au prochain redémarrage
- Backup DB avant mise à jour

---

## Shutdown

Quand toutes les tâches sont terminées :
1. Vérifie TaskList — tout doit être "completed"
2. Envoie un shutdown_request à chaque agent actif
3. Attends les shutdown_response
4. Supprime la team avec TeamDelete
5. Affiche le résumé final :
   - Nombre de tâches complétées
   - Tâches ayant nécessité un retry
   - Temps total estimé

---

## Annexe : Détail des tâches

### T01 · Scaffolding projet
**But** : Initialiser le projet Electron + React + TypeScript avec electron-vite.
**Fichiers** : `[NEW]` package.json, electron.vite.config.ts, tsconfig*.json, src/main/index.ts, src/main/window.ts, src/preload/index.ts, src/renderer/index.html, src/renderer/src/main.tsx, src/renderer/src/App.tsx, src/renderer/env.d.ts, .gitignore
**Piste** : infra | **Dépendances** : aucune
**MCP** : Context7 `electron-vite` — template React + TS
**Critères** :
- [ ] `npm run dev` démarre l'app Electron avec HMR
- [ ] Le renderer affiche "Hello World"
- [ ] TypeScript compile sans erreur pour les 3 cibles
- [ ] Structure src/main, src/preload, src/renderer en place

### T02 · Tailwind CSS + shadcn/ui
**But** : Configurer Tailwind CSS 4 et initialiser shadcn/ui avec les composants de base.
**Fichiers** : `[NEW]` tailwind.config.ts, globals.css, components/ui/ (button, input, dialog, dropdown-menu, select, tooltip, scroll-area), lib/utils.ts | `[MODIFY]` electron.vite.config.ts
**Piste** : frontend | **Dépendances** : T01
**Critères** :
- [ ] Tailwind fonctionne avec CSS variables
- [ ] Les composants shadcn/ui sont rendus correctement
- [ ] La classe `dark` active le thème sombre
- [ ] `cn()` utility disponible

### T03 · Database + Drizzle ORM
**But** : Créer le schéma complet SQLite avec Drizzle ORM et pragmas.
**Fichiers** : `[NEW]` src/main/db/index.ts, schema.ts, relations.ts, migrate.ts, drizzle.config.ts, src/main/utils/paths.ts | `[MODIFY]` package.json
**Piste** : backend | **Dépendances** : T01
**MCP** : Context7 `drizzle-orm` — schema SQLite, better-sqlite3
**Critères** :
- [ ] 11 tables définies (providers, models, projects, conversations, messages, attachments, prompts, roles, settings, statistics, images)
- [ ] WAL mode activé, foreign_keys ON
- [ ] `npm run db:generate` et `db:migrate` fonctionnent
- [ ] DB créée dans ~/Library/Application Support/MultiLLM/db/main.db

### T04 · IPC Bridge
**But** : Preload script avec contextBridge et types partagés.
**Fichiers** : `[MODIFY]` src/preload/index.ts | `[NEW]` src/preload/types.ts, src/main/ipc/index.ts, src/renderer/src/lib/ipc.ts | `[MODIFY]` src/renderer/env.d.ts
**Piste** : fullstack | **Dépendances** : T01
**Critères** :
- [ ] `window.api` exposé via contextBridge
- [ ] Invoke (request/response) et events (streaming) fonctionnent
- [ ] Types partagés main/renderer
- [ ] contextIsolation: true, nodeIntegration: false

### T05 · Credential Service
**But** : Stockage sécurisé des clés API via safeStorage.
**Fichiers** : `[NEW]` src/main/services/credential.service.ts, src/main/ipc/providers.ipc.ts
**Piste** : backend | **Dépendances** : T03, T04
**Critères** :
- [ ] Clés chiffrées avec safeStorage.encryptString()
- [ ] Récupération via decryptString()
- [ ] Clés jamais envoyées au renderer
- [ ] Masquage sk-*****

### T06 · Provider Registry
**But** : Registre des providers avec métadonnées et liste statique des modèles.
**Fichiers** : `[NEW]` src/main/llm/types.ts, src/main/llm/registry.ts, src/main/db/queries/providers.ts | `[MODIFY]` src/main/ipc/providers.ipc.ts
**Piste** : backend | **Dépendances** : T03, T05
**Critères** :
- [ ] 9 providers définis avec métadonnées
- [ ] Liste statique des modèles principaux avec pricing
- [ ] Providers AI SDK configurés dans providers.ts
- [ ] IPC `providers:list` fonctionne

### T07 · Settings UI — API Keys
**But** : Écran de configuration des clés API par provider.
**Fichiers** : `[NEW]` src/renderer/src/components/settings/SettingsView.tsx, ApiKeysSettings.tsx, ProviderCard.tsx | `[MODIFY]` stores/providers.store.ts
**Piste** : frontend | **Dépendances** : T05, T12
**Critères** :
- [ ] Carte par provider avec champ de saisie masqué
- [ ] Bouton "Valider" appelle l'endpoint test
- [ ] Indicateur visuel valid/invalid/loading
- [ ] Navigation vers Settings depuis la sidebar

### T08 · Provider OpenAI (AI SDK)
**But** : Config provider OpenAI via Vercel AI SDK (@ai-sdk/openai).
**Fichiers** : `[MODIFY]` src/main/llm/providers.ts, src/main/llm/router.ts | `[NEW]` src/main/llm/errors.ts
**Piste** : backend | **Dépendances** : T06
**MCP** : Context7 `@ai-sdk/openai` — createOpenAI, streamText
**Critères** :
- [ ] streamText() avec AbortController
- [ ] Erreurs classifiées (transient/fatal/actionable)
- [ ] Tokens et coût calculés via cost-calculator.ts

### T09 · Provider Anthropic (AI SDK)
**But** : Config provider Anthropic via Vercel AI SDK (@ai-sdk/anthropic) avec extended thinking.
**Fichiers** : `[MODIFY]` src/main/llm/providers.ts
**Piste** : backend | **Dépendances** : T06
**MCP** : Context7 `@ai-sdk/anthropic` — createAnthropic, providerOptions
**Critères** :
- [ ] Streaming via streamText()
- [ ] Extended thinking via providerOptions anthropic
- [ ] Annulation via AbortController
- [ ] Erreurs typées mappées

### T10 · Provider Gemini (AI SDK)
**But** : Config provider Google Gemini via Vercel AI SDK (@ai-sdk/google).
**Fichiers** : `[MODIFY]` src/main/llm/providers.ts
**Piste** : backend | **Dépendances** : T06
**MCP** : Context7 `@ai-sdk/google` — createGoogleGenerativeAI
**Critères** :
- [ ] Streaming via streamText()
- [ ] Annulation via AbortController
- [ ] Erreurs classifiées
- [ ] Tokens extraits

### T11 · LLM Router + Streaming Engine
**But** : Routeur getModel() + moteur streaming IPC bidirectionnel via AI SDK.
**Fichiers** : `[NEW]` src/main/llm/router.ts, src/main/llm/cost-calculator.ts, src/main/ipc/chat.ipc.ts | `[MODIFY]` src/main/ipc/index.ts
**Piste** : backend | **Dépendances** : T08, T09, T10
**Critères** :
- [ ] Routeur getModel() sélectionne le bon provider AI SDK selon model_id
- [ ] chat:send démarre le streaming via streamText()
- [ ] Chunks forwardés via webContents.send('chat:chunk')
- [ ] chat:cancel appelle abort()
- [ ] Un seul stream actif à la fois
- [ ] Message complet sauvé en DB après done

### T12 · Zustand Stores
**But** : Stores Zustand avec pattern slices.
**Fichiers** : `[NEW]` src/renderer/src/stores/ (conversations, messages, providers, settings, ui).store.ts
**Piste** : frontend | **Dépendances** : T02, T04
**MCP** : Context7 `zustand` — slices, persist
**Critères** :
- [ ] Stores conversations, messages, providers, settings, ui créés
- [ ] Pattern slices composable
- [ ] Middleware persist sur settings uniquement

### T13 · Sidebar
**But** : Sidebar avec liste conversations, bouton nouveau, navigation.
**Fichiers** : `[NEW]` src/renderer/src/components/layout/Sidebar.tsx, AppLayout.tsx, conversations/ConversationList.tsx, ConversationItem.tsx
**Piste** : frontend | **Dépendances** : T12
**Critères** :
- [ ] Liste conversations triées par date
- [ ] Bouton "Nouvelle conversation"
- [ ] Conversation active visuellement distincte
- [ ] Sidebar rétractable
- [ ] Liens navigation (Settings, Stats)

### T14 · Zone A — Chat Display
**But** : Zone d'affichage messages avec Markdown basique et scroll auto.
**Fichiers** : `[NEW]` src/renderer/src/components/chat/ChatView.tsx, MessageList.tsx, MessageItem.tsx, MessageContent.tsx, MarkdownRenderer.tsx, src/renderer/src/lib/markdown.ts
**Piste** : frontend | **Dépendances** : T12
**Critères** :
- [ ] Messages user/assistant avec distinction visuelle
- [ ] Badge provider/modèle par message
- [ ] Markdown basique rendu (gras, italique, listes, code)
- [ ] Scroll auto pendant streaming
- [ ] Bouton copier sur messages et blocs de code
- [ ] Tokens/coût/temps affichés

### T15 · Zone B — Input
**But** : Zone de saisie avec textarea extensible et sélecteur de modèle.
**Fichiers** : `[NEW]` src/renderer/src/components/chat/InputZone.tsx, ModelSelector.tsx
**Piste** : frontend | **Dépendances** : T12
**Critères** :
- [ ] Textarea auto-grow
- [ ] Enter envoie, Shift+Enter saut de ligne
- [ ] Sélecteur modèle groupé par provider
- [ ] Bouton Envoyer désactivé si vide

### T16 · Conversation CRUD
**But** : CRUD complet conversations (IPC + DB + UI).
**Fichiers** : `[NEW]` src/main/db/queries/conversations.ts, src/main/ipc/conversations.ipc.ts | `[MODIFY]` ipc/index.ts, conversations.store.ts, ConversationItem.tsx
**Piste** : fullstack | **Dépendances** : T11, T13
**Critères** :
- [ ] Créer, renommer (double-clic), supprimer (confirmation)
- [ ] Titre auto-généré au premier message
- [ ] Liste rafraîchie après chaque opération

### T17 · Message Persistence
**But** : Persister messages en DB et recharger au changement de conversation.
**Fichiers** : `[NEW]` src/main/db/queries/messages.ts | `[MODIFY]` chat.ipc.ts, messages.store.ts
**Piste** : fullstack | **Dépendances** : T11, T14
**Critères** :
- [ ] Message user sauvé avant envoi LLM
- [ ] Message assistant sauvé après done
- [ ] Tokens/coût/temps persistés
- [ ] Messages rechargés au changement de conversation
- [ ] Restaurés au redémarrage

### T18 · Streaming UI
**But** : Tokens en temps réel, typing indicator, bouton Stop.
**Fichiers** : `[NEW]` src/renderer/src/components/chat/StreamingIndicator.tsx, src/renderer/src/hooks/useStreaming.ts | `[MODIFY]` MessageItem.tsx, InputZone.tsx
**Piste** : frontend | **Dépendances** : T17, T15
**Critères** :
- [ ] Tokens affichés un par un
- [ ] Typing indicator animé
- [ ] Stop remplace Envoyer pendant streaming
- [ ] Clic Stop → chat:cancel → contenu partiel affiché
- [ ] Textarea désactivé pendant streaming

### T19 · Theme System
**But** : Thèmes dark/light/system avec basculement instantané.
**Fichiers** : `[NEW]` src/renderer/src/components/common/ThemeProvider.tsx | `[MODIFY]` globals.css, settings.store.ts, App.tsx
**Piste** : frontend | **Dépendances** : T02
**Critères** :
- [ ] Dark/light/system sans rechargement
- [ ] CSS variables changent instantanément
- [ ] Choix persisté
- [ ] Mode system suit macOS

### T20 · Error Handling
**But** : Classification erreurs API + affichage Sonner.
**Fichiers** : `[MODIFY]` src/main/llm/errors.ts, chat.ipc.ts | `[NEW]` src/renderer/src/components/common/ErrorBoundary.tsx | `[MODIFY]` hooks/useStreaming.ts
**Piste** : fullstack | **Dépendances** : T18
**Critères** :
- [ ] Transient (429,500,503) → retry max 3
- [ ] Fatal (401,403) → toast avec suggestion
- [ ] Actionable (402) → toast avec action
- [ ] ErrorBoundary capture erreurs React
- [ ] Erreurs réseau détectées

### T21 · OpenRouter service
**But** : Service OpenRouter via @ai-sdk/openrouter — model listing, crédits, headers.
**Fichiers** : `[NEW]` src/main/services/openrouter.service.ts | `[MODIFY]` src/main/llm/router.ts
**Piste** : backend | **Dépendances** : T20
**Critères** : GET /api/v1/models, GET /api/v1/key, headers HTTP-Referer/X-OpenRouter-Title, erreurs 402/403/408

### T22 · Providers locaux (Ollama + LM Studio)
**But** : Détection et listing des modèles locaux Ollama et LM Studio.
**Fichiers** : `[NEW]` src/main/services/local-providers.service.ts | `[MODIFY]` src/main/llm/router.ts
**Piste** : backend | **Dépendances** : T20
**Critères** : Détection port 11434 (Ollama) + LM Studio, listing local, coût 0$, erreur si non démarré

### T27 · Markdown avancé
**But** : Shiki + KaTeX + Mermaid + GFM tables.
**Fichiers** : `[MODIFY]` MarkdownRenderer.tsx, lib/markdown.ts | `[NEW]` CodeBlock.tsx, MermaidBlock.tsx
**Piste** : frontend | **Dépendances** : T20
**Critères** : Coloration Shiki, LaTeX rendu, Mermaid SVG, tables GFM, bouton copier code

### T28 · Projets
**But** : CRUD projets avec contexte.
**Fichiers** : `[NEW]` db/queries/projects.ts, ipc/projects.ipc.ts, stores/projects.store.ts, components/projects/
**Piste** : fullstack | **Dépendances** : T20
**Critères** : CRUD, assigner conversation, filtrer sidebar, prompt système projet

### T29 · Bibliothèque prompts
**But** : CRUD prompts avec catégories, variables, insertion rapide.
**Fichiers** : `[NEW]` db/queries/prompts.ts, ipc/prompts.ipc.ts, stores/prompts.store.ts, components/prompts/
**Piste** : fullstack | **Dépendances** : T20
**Critères** : CRUD, catégories/tags, variables {{nom}}, types complet/complément/système, insertion /

### T30 · Rôles/personas
**But** : CRUD rôles avec prédéfinis et application conversation.
**Fichiers** : `[NEW]` db/queries/roles.ts, ipc/roles.ipc.ts, stores/roles.store.ts, components/roles/
**Piste** : fullstack | **Dépendances** : T20
**Critères** : CRUD, prédéfinis (Dev, Rédacteur, Analyste, Traducteur, Coach), indicateur rôle actif

### T31 · Génération images
**But** : Images via Gemini (gemini-3.1-flash-image-preview / gemini-3-pro-image-preview), affichage inline.
**Fichiers** : `[NEW]` services/image.service.ts, ipc/images.ipc.ts, components/images/ | `[MODIFY]` src/main/llm/image.ts
**Piste** : fullstack | **Dépendances** : T20
**Critères** : Sélection provider, params (taille, qualité), affichage inline, lightbox, téléchargement, stockage local

### T32 · Recherche web UI
**But** : Sources/citations Perplexity Sonar.
**Fichiers** : `[NEW]` components/chat/SourcesList.tsx, SourceCard.tsx | `[MODIFY]` MessageItem.tsx
**Piste** : frontend | **Dépendances** : T23
**Critères** : Sources sous le message, titre/favicon/lien, indicateur "recherche web", numéros cliquables

### T33 · Pièces jointes
**But** : Upload fichiers, drag & drop, preview.
**Fichiers** : `[NEW]` ipc/files.ipc.ts, services/file.service.ts, components/chat/AttachmentPreview.tsx, DropZone.tsx
**Piste** : fullstack | **Dépendances** : T20
**Critères** : Bouton ajout, drag & drop, coller image Cmd+V, preview, stockage attachments/, limite 30 MB

### T34 · Full-text search
**But** : FTS5 sur conversations + messages.
**Fichiers** : `[MODIFY]` db/schema.ts | `[NEW]` db/queries/search.ts, ipc/search.ipc.ts, components/common/SearchResults.tsx
**Piste** : fullstack | **Dépendances** : T20
**Critères** : Table FTS5, recherche sidebar, résultats avec highlight, Cmd+Shift+F, debounce 300ms

### T35 · Export conversations
**But** : Export MD, JSON, TXT, HTML.
**Fichiers** : `[NEW]` services/export.service.ts, ipc/export.ipc.ts
**Piste** : backend | **Dépendances** : T20
**Critères** : 4 formats, dialog natif, métadonnées incluses

### T36 · Import conversations
**But** : Import JSON interne + formats ChatGPT/Claude.
**Fichiers** : `[NEW]` services/import.service.ts | `[MODIFY]` ipc/export.ipc.ts
**Piste** : backend | **Dépendances** : T35
**Critères** : 3 formats, dialog natif, messages persistés, conversations dans sidebar

### T37 · Dashboard stats
**But** : Dashboard Recharts.
**Fichiers** : `[NEW]` components/statistics/, stores/stats.store.ts, ipc/statistics.ipc.ts
**Piste** : fullstack | **Dépendances** : T38
**Critères** : LineChart coûts, PieChart providers, BarChart modèles, filtres période/provider/projet

### T38 · Cost tracking
**But** : Calcul et agrégation coûts.
**Fichiers** : `[NEW]` services/stats.service.ts, db/queries/statistics.ts, utils/tokens.ts | `[MODIFY]` chat.ipc.ts
**Piste** : backend | **Dépendances** : T20
**Critères** : Coût par message, table statistics pré-agrégée, consolidation au démarrage

### T39 · Command palette
**But** : Cmd+K avec recherche fuzzy.
**Fichiers** : `[NEW]` components/common/CommandPalette.tsx | `[MODIFY]` App.tsx
**Piste** : frontend | **Dépendances** : T20
**Critères** : Recherche conversations/projets/prompts/rôles/commandes, navigation clavier, raccourcis affichés

### T40 · Raccourcis clavier
**But** : Raccourcis globaux hotkeys-js.
**Fichiers** : `[NEW]` hooks/useKeyboardShortcuts.ts | `[MODIFY]` App.tsx
**Piste** : frontend | **Dépendances** : T20
**Critères** : Cmd+N/\/F/Shift+F/K/,, Escape, pas de conflit natif

### T41 · i18n FR/EN
**But** : Internationalisation i18next.
**Fichiers** : `[NEW]` lib/i18n.ts, locales/fr.json, locales/en.json | `[MODIFY]` main.tsx, settings.store.ts
**Piste** : frontend | **Dépendances** : T20
**Critères** : Chaînes externalisées, FR+EN, détection système, changement immédiat, persisté

### T42 · Paramètres modèle
**But** : Temperature, max tokens, top-p, presets.
**Fichiers** : `[NEW]` components/chat/ModelParams.tsx | `[MODIFY]` chat.ipc.ts
**Piste** : fullstack | **Dépendances** : T20
**Critères** : Sliders, presets créatif/précis/équilibré, Extended Thinking toggle, envoyés avec requête

### T43 · Virtualisation messages
**But** : TanStack Virtual pour 1000+ messages.
**Fichiers** : `[MODIFY]` components/chat/MessageList.tsx
**Piste** : frontend | **Dépendances** : T20
**Critères** : Activé > 100 messages, hauteurs variables, overscan 5, scroll to bottom, 5000 messages sans lag

### T44 · Context window
**But** : Token counting et troncature.
**Fichiers** : `[NEW]` components/chat/ContextWindowIndicator.tsx | `[MODIFY]` InputZone.tsx, chat.ipc.ts, utils/tokens.ts
**Piste** : fullstack | **Dépendances** : T43
**Critères** : Compteur tokens Zone B, barre remplissage, alerte 80%, troncature auto

### T45 · Branching
**But** : Branches de conversation.
**Fichiers** : `[MODIFY]` db/schema.ts, db/queries/messages.ts, db/queries/conversations.ts | `[NEW]` components/chat/BranchNavigator.tsx | `[MODIFY]` MessageItem.tsx
**Piste** : fullstack | **Dépendances** : T20
**Critères** : Bouton "Brancher", navigation flèches, parent_message_id en DB

### T46 · STT dictée vocale
**But** : Deepgram + Web Speech API fallback.
**Fichiers** : `[NEW]` services/voice.service.ts, components/chat/VoiceInput.tsx, hooks/useVoiceInput.ts
**Piste** : fullstack | **Dépendances** : T37
**Critères** : Bouton micro, waveform, transcription, fallback Web Speech, annulation

### T47 · TTS lecture audio
**But** : OpenAI TTS / ElevenLabs + Web Speech API fallback.
**Fichiers** : `[MODIFY]` services/voice.service.ts | `[NEW]` components/chat/AudioPlayer.tsx, hooks/useAudioPlayer.ts
**Piste** : fullstack | **Dépendances** : T37
**Critères** : Bouton lecture par message, choix provider, sélection voix, contrôles (pause/stop/vitesse)

### T48 · Optimisation prompts
**But** : Bouton "Améliorer" via LLM.
**Fichiers** : `[NEW]` services/prompt-optimizer.service.ts, components/chat/PromptOptimizer.tsx
**Piste** : fullstack | **Dépendances** : T37
**Critères** : Réécriture via LLM, preview diff, 3 niveaux, annuler, LLM configurable

### T49 · Collaboration
**But** : Export/import projets, prompts, rôles.
**Fichiers** : `[MODIFY]` services/export.service.ts, services/import.service.ts
**Piste** : backend | **Dépendances** : T35
**Critères** : Export projet complet, import projet, export/import prompts/rôles, anonymisation, JSON standardisé

### T50 · Onboarding
**But** : Assistant premier lancement.
**Fichiers** : `[NEW]` components/onboarding/ (OnboardingWizard, StepApiKeys, StepTheme, StepWelcome)
**Piste** : frontend | **Dépendances** : T41
**Critères** : Détection premier lancement, wizard multi-étapes, skip possible, ne s'affiche qu'une fois

### T51 · Auto-update
**But** : electron-updater + GitHub Releases.
**Fichiers** : `[NEW]` services/updater.service.ts, components/common/UpdateNotification.tsx | `[MODIFY]` main/index.ts, electron-builder.yml
**Piste** : infra | **Dépendances** : T60
**Critères** : Vérification périodique, notification, téléchargement arrière-plan, backup DB avant update

### T52 · Export PDF
**But** : Export conversations en PDF.
**Fichiers** : `[MODIFY]` services/export.service.ts
**Piste** : backend | **Dépendances** : T35
**Critères** : jsPDF + html2canvas, messages formatés, images incluses, pagination

### T53 · Notifications système
**But** : Notifications fin de génération, erreurs, dock badge.
**Fichiers** : `[NEW]` services/notification.service.ts | `[MODIFY]` chat.ipc.ts, main/index.ts
**Piste** : backend | **Dépendances** : T37
**Critères** : Notification native (app arrière-plan), erreur critique, dock badge, son configurable

### T54 · Accessibilité
**But** : WCAG AA, navigation clavier, ARIA.
**Fichiers** : `[MODIFY]` components/**/*.tsx (multiples)
**Piste** : frontend | **Dépendances** : T37
**Critères** : Tab/Shift+Tab, ARIA labels, contraste 4.5:1, focus visible, prefers-reduced-motion

### T55 · Backup & restore
**But** : Backups automatiques et restauration.
**Fichiers** : `[NEW]` services/backup.service.ts, components/settings/BackupSettings.tsx | `[MODIFY]` main/index.ts
**Piste** : fullstack | **Dépendances** : T37
**Critères** : Auto quotidien, manuel, liste backups, restauration, rétention 7 derniers

### T56 · Stats avancées
**But** : Heatmap, tendances, export CSV.
**Fichiers** : `[NEW]` components/statistics/HeatmapChart.tsx, TrendChart.tsx | `[MODIFY]` StatsView.tsx, statistics.ipc.ts
**Piste** : fullstack | **Dépendances** : T37
**Critères** : Heatmap jours × heures, tendances hebdo, top modèles, export CSV, date picker

### T57 · Offline mode
**But** : Détection réseau et mode hors-ligne.
**Fichiers** : `[NEW]` services/network.service.ts, components/common/OfflineIndicator.tsx | `[MODIFY]` chat.ipc.ts
**Piste** : fullstack | **Dépendances** : T37
**Critères** : Détection auto, indicateur UI, file d'attente, re-envoi reconnexion, Ollama reste fonctionnel

### T58 · Galerie images
**But** : Vue grille des images générées.
**Fichiers** : `[NEW]` components/images/ImagesView.tsx, ImageGrid.tsx | `[MODIFY]` ImageLightbox.tsx | `[NEW]` db/queries/images.ts
**Piste** : fullstack | **Dépendances** : T31
**Critères** : Vue grille, filtres provider/date, lightbox navigation, téléchargement, prompt affiché

### T59 · Settings complet
**But** : Écran settings avec toutes les préférences.
**Fichiers** : `[NEW]` components/settings/ (GeneralSettings, AppearanceSettings, KeybindingsSettings, VoiceSettings, DataSettings) | `[MODIFY]` SettingsView.tsx
**Piste** : frontend | **Dépendances** : T41
**Critères** : 6 sections, police/densité/largeur, raccourcis personnalisables, provider STT/TTS, purge données

### T60 · Packaging
**But** : electron-builder pour DMG/NSIS/AppImage.
**Fichiers** : `[NEW]` electron-builder.yml, resources/icon.*, .github/workflows/build.yml | `[MODIFY]` package.json
**Piste** : infra | **Dépendances** : T37
**Critères** : DMG macOS, NSIS Windows, AppImage Linux, icônes correctes, CI GitHub Actions, code signing macOS
