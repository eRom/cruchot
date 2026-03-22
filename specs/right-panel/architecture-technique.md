# Architecture Technique — Right Panel

**Date** : 2026-03-22
**Statut** : Decide
**Contexte** : brainstorming.md, architecture-fonctionnelle.md

## Probleme architectural
L'InputZone (1336 lignes) concentre 12+ controles dans sa toolbar, nuisant a la lisibilite et a la maintenabilite. Il faut extraire ces controles vers un panneau lateral droit compose, sans casser le fonctionnel existant (les stores Zustand portent deja l'etat — les controles sont des consumers, pas des sources de verite).

## Flux principal
```
Utilisateur → Toggle Right Panel (OPT+CMD+B ou bouton)
    ↓
ui.store: openPanel = 'right' | null
    ↓ (si 'right')
ChatView: affiche RightPanel, masque WorkspacePanel
    ↓
RightPanel compose 4 sections:
  ParamsSection → lit/ecrit providers.store, settings.store, roles.store
  OptionsSection → lit/ecrit prompts, library.store, sandbox.store
  McpSection → lit/ecrit mcp.store (toggle global)
  ToolsSection → appelle IPC directement (telegram, summary, optimize, fork)
```

## Decisions architecturales

### Decision 1 : State de panel dans ui.store (pas workspace.store)
**Probleme** : Le Right Panel et le Workspace Panel sont mutuellement exclusifs. Ou gerer cet etat ?
**Options** :
  - Option A : `isPanelOpen` dans workspace.store + `isRightPanelOpen` dans ui.store → 2 booleans a synchroniser
  - Option B : `openPanel: 'workspace' | 'right' | null` dans ui.store → un seul state, mutuellement exclusif par design
**Choix** : Option B
**Raison** : Pas de synchronisation manuelle, un seul state source de verite. Le workspace.store garde `isPanelOpen` deprecated/alias pour compatibilite.

### Decision 2 : Sections collapsables — state local (pas Zustand)
**Probleme** : L'etat ouvert/ferme des sections collapsables (Options, MCP, Outils) doit-il persister ?
**Options** :
  - Option A : Zustand persist (localStorage) → survit entre sessions
  - Option B : useState local dans RightPanel → reset a chaque mount
**Choix** : Option B (P0), Option A possible en P1
**Raison** : Les sections sont toutes ouvertes par defaut. Le reset au mount n'est pas genant (le panel se ferme au switch conversation de toute facon). Evite de surcharger le settings store.

### Decision 3 : Migration des controles — extraction, pas duplication
**Probleme** : Les composants ModelSelector, RoleSelector, etc. sont importes dans InputZone. Les deplacer ou les dupliquer ?
**Options** :
  - Option A : Dupliquer les imports dans les sections du Right Panel → 2 instances potentielles
  - Option B : Extraire de InputZone, importer uniquement dans les sections du Right Panel → 1 instance
**Choix** : Option B
**Raison** : Un seul endroit ou chaque controle vit. InputZone ne rend plus ces composants du tout. Pas de risque de desynchronisation.

### Decision 4 : ContextWindowIndicator — decomposer
**Probleme** : Le ContextWindowIndicator contient tokens/cout + RemoteBadge + WebServerBadge + SummaryButton. On veut tokens/cout dans ParamsSection, les badges et summary disparaissent du bas.
**Options** :
  - Option A : Deplacer le composant entier dans ParamsSection → badges inutiles dans le panel
  - Option B : Extraire la logique tokens/cout en inline dans ParamsSection, supprimer ContextWindowIndicator de l'InputZone
**Choix** : Option B
**Raison** : Le ContextWindowIndicator melange trop de responsabilites. Les badges Remote/Web et le SummaryButton sont retires du rendu (plus affiches nulle part). La logique tokens/cout est triviale (hook `useContextWindow()` + `totalCost` useMemo).

### Decision 5 : Raccourci OPT+CMD+B — meme pattern que CMD+,
**Probleme** : hotkeys-js ne gere pas bien les modificateurs complexes.
**Options** :
  - Option A : hotkeys-js `'option+command+b'` dans useKeyboardShortcuts
  - Option B : listener natif `keydown` (meme pattern que CMD+,)
**Choix** : Option A d'abord, fallback Option B si ca ne marche pas
**Raison** : hotkeys-js gere `option+command+b` en theorie. Le tester, si ca echoue, passer en natif.

### Decision 6 : Largeur du Right Panel
**Probleme** : Quelle largeur ?
**Choix** : `w-[260px]` — identique au sidebar (SIDEBAR_WIDTH_EXPANDED = 260)
**Raison** : Coherence visuelle, decision validee en brainstorm.

## Structure du projet

```
src/renderer/src/components/chat/
  right-panel/
    RightPanel.tsx          [NEW] ~60 lignes, assembleur
    ParamsSection.tsx        [NEW] ~120 lignes (model, thinking, role, web, tokens/cout)
    OptionsSection.tsx       [NEW] ~80 lignes (prompt, library, YOLO)
    McpSection.tsx           [NEW] ~100 lignes (liste MCP + switches)
    ToolsSection.tsx         [NEW] ~80 lignes (grille 4 boutons)
    CollapsibleSection.tsx   [NEW] ~40 lignes (wrapper section collapsable)

src/renderer/src/components/chat/
  InputZone.tsx              [MODIFY] retirer 12 controles toolbar + ContextWindowIndicator
  ChatView.tsx               [MODIFY] layout mutuellement exclusif right/workspace

src/renderer/src/stores/
  ui.store.ts                [MODIFY] ajouter openPanel state

src/renderer/src/hooks/
  useKeyboardShortcuts.ts    [MODIFY] ajouter OPT+CMD+B, changer CMD+B semantique
```

## Modele de donnees technique

Aucune modification DB. Aucune nouvelle table. Les controles du Right Panel lisent/ecrivent les memes stores Zustand que ceux de l'InputZone actuelle.

**Stores impactes (lecture/ecriture) :**
- `providers.store` : selectedModelId, selectedProviderId, models
- `settings.store` : thinkingEffort, searchEnabled, temperature, maxTokens, topP
- `roles.store` : activeRoleId, activeSystemPrompt
- `ui.store` : openPanel (NOUVEAU), isStreaming
- `sandbox.store` : isActive, activate, deactivate
- `library.store` : libraries
- `workspace.store` : isPanelOpen (deprece, alias vers ui.store.openPanel)

## Securite (Security by Design)

### Validation des entrees
- Aucune nouvelle entree utilisateur — les controles delegent aux memes IPC existants (deja valides Zod)
- Le fork button appelle `window.api.forkConversation()` deja securise
- Le summary button appelle `window.api.summarizeConversation()` deja securise

### Surface d'attaque & Mitigations
| Point d'entree | Menace | Mitigation |
|-----------------|--------|------------|
| Aucun nouveau | - | Les IPC sont inchanges, les controles sont purement UI |

**Verdict securite** : Zero nouvelle surface d'attaque. Le Right Panel est un rearrangement visuel de composants existants.

## Risques architecturaux
| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| InputZone casse apres extraction des controles | Moyenne | Eleve | Tester chaque controle retire individuellement, verifier le build TypeScript |
| workspace.store.isPanelOpen desynchronise avec ui.store.openPanel | Faible | Moyen | Creer un computed/alias dans workspace.store qui lit ui.store |
| hotkeys-js ne gere pas OPT+CMD+B | Faible | Faible | Fallback listener natif keydown |
| Largeur 260px trop etroite pour certains selectors | Faible | Faible | Les selectors actuels fonctionnent deja dans des espaces etroits (toolbar InputZone) |
