# Brainstorming : Right Panel ChatView

**Date** : 2026-03-22
**Statut** : Decide

## Idee initiale
Deplacer la majorite des controles de l'InputZone vers un panneau lateral droit compose de sections independantes, pour liberer l'InputZone et ne garder que l'essentiel (piece jointe, textarea, micro, envoyer).

## Hypotheses validees
- L'InputZone est trop chargee en controles, nuit a la lisibilite
- Le right panel et le workspace panel sont mutuellement exclusifs (jamais les deux ouverts)
- Les MCP restent globaux (on/off global, pas par conversation)
- Le calcul tokens/cout migre entierement dans le right panel (retire du bas)
- Le mode Arena n'est pas concerne
- Switch conversation existante = panel ferme. Nouvelle conversation = panel ouvert
- Raccourcis : CMD+B (left panel), OPT+CMD+B (right panel)
- Largeur identique au left panel (sidebar)

## Risques identifies
- Decouplage des selectors de l'InputZone : certains selectors (model, role, thinking) sont etroitement lies au state de l'InputZone — il faut s'assurer que les stores Zustand portent l'etat (pas des state locaux dans InputZone)
- Mutuellement exclusif workspace/right : si l'utilisateur a besoin du workspace ET des parametres, il doit toggler — friction acceptable pour un mono-user
- Section MCP avec scrollbar a 5 items : besoin d'un max-height fixe avec overflow

## Alternatives considerees
| Approche | Priorise | Sacrifie |
|----------|----------|----------|
| A — Panel monolithique `RightPanel.tsx` | Simplicite initiale, 1 seul fichier | Maintenabilite (400+ lignes), lisibilite |
| B — `SidePanel` generique refactorise | DRY, extensible | Over-engineering, workspace et parametres n'ont rien en commun |
| **C — Panel compose de sous-composants** | **Maintenabilite, isolation, lisibilite** | **Plus de fichiers (5-6), mais petits et focalises** |

## Decision retenue
**Approche C — Panel compose de sous-composants.** Le `RightPanel.tsx` est un assembleur leger (~50 lignes) qui compose 4 sections independantes dans `components/chat/right-panel/`. Chaque section est un fichier isole, coherent avec le pattern de l'app (composants focalises).

## Structure du Right Panel

### Parametres (non collapsable, icone)
- Model selector
- Thinking/Reflexion selector
- Role selector
- Web Search toggle
- Tokens/cout de la conversation (texte calcule)

### Options (collapsable, icone)
- Prompt selector (prompt picker)
- Library/Referentiel selector
- YOLO mode activation

### MCP (collapsable, icone)
- Liste des serveurs MCP avec switch on/off chacun
- Max 5 visibles, scrollbar au-dela
- Si 0 MCP configure : afficher "Aucun serveur MCP"

### Outils (collapsable, icone)
- Grille 2x2 de boutons (icone + tooltip)
  - Telegram (grise si inactif)
  - Resume
  - Ameliorer le prompt
  - Fork

## Changements sur l'InputZone
- **Conserve** : bouton piece jointe (gauche), textarea, micro, bouton envoyer (droite)
- **Retire** : model selector, thinking selector, role selector, web search toggle, prompt picker, library picker, YOLO toggle, fork button
- **Retire du bas** : ContextWindowIndicator (tokens/cout), Remote badge, Web badge

## Layout ChatView
- Right panel au meme niveau que WorkspacePanel dans le layout
- Mutuellement exclusif avec WorkspacePanel (`openPanel: 'workspace' | 'right' | null`)
- Fond transparent (couleur du fond de la view discussion)
- Toggle : bouton header + raccourci OPT+CMD+B
- Sidebar toggle : CMD+B (inchange)

## Comportement ouverture/fermeture
- Nouvelle conversation → panel ouvert automatiquement
- Switch vers conversation existante → panel ferme
- Toggle manuel via bouton ou OPT+CMD+B

## Prerequis avant implementation
1. Auditer les state locaux dans InputZone pour identifier ce qui doit migrer vers les stores Zustand
2. Verifier la largeur du left panel (sidebar) pour appliquer la meme au right panel
3. Identifier les imports/composants a extraire de InputZone vers les sous-composants du right panel
4. Definir le raccourci OPT+CMD+B (actuellement CMD+, est en listener natif keydown — meme pattern)

## Hors scope (explicitement exclu)
- Mode Arena (pas de right panel)
- Workspace panel (reste tel quel, toggle a definir plus tard)
- Fonctionnel MCP (reste global, pas de changement comportemental)
- Redesign du left panel / sidebar
- Responsive / breakpoints (mono-ecran desktop)
