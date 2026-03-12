# Feature Spec — Slash Commands

> Date : 2026-03-12
> Statut : Draft
> Priorite : Haute (UX structurante)

## 1. Vue d'ensemble

Permettre a l'utilisateur de taper `/nom-commande [args]` dans l'InputZone de n'importe quelle conversation (avec ou sans projet) pour executer des commandes predefinies ou personnalisees. Les commandes injectent un prompt pre-construit dans le flux de chat existant, sans creer de pipeline parallele.

**Inspirations** : Claude Code (Markdown + YAML frontmatter), Gemini CLI (TOML + `{{args}}`).

**Principe cle** : une slash command = un prompt template resolu cote renderer, envoye comme un message utilisateur normal via le flux `chat:send` existant. Zero nouveau pipeline LLM.

---

## 2. Objectifs

- Commandes accessibles depuis toute conversation (projet ou inbox)
- Autocomplete visuel quand l'utilisateur tape `/`
- Commandes integrees (builtin) + commandes personnalisees utilisateur
- Arguments positionnels (`$ARGS`, `$1`, `$2`)
- Securite : pas d'execution shell, pas d'injection prompt, validation stricte
- UX coherente avec les patterns existants (PromptPicker, RoleSelector)

---

## 3. Architecture

### 3.1 Sources de commandes

```
Priorite (haute → basse) :
1. Commandes utilisateur projet   — DB table `slash_commands` avec projectId != null
2. Commandes utilisateur globales — DB table `slash_commands` avec projectId = null
3. Commandes builtin             — Fichier statique `src/main/commands/builtin.ts`
```

**Pourquoi DB et pas fichiers Markdown ?**
- Coherent avec le pattern du projet (prompts, roles, memory fragments = tous en DB)
- CRUD via IPC existant (meme pattern que prompts/roles)
- Export/import JSON (meme pattern que prompts/roles)
- Pas de filesystem watchers supplementaires
- L'utilisateur n'a pas acces au filesystem de l'app packagee

### 3.2 Modele de donnees

#### Table `slash_commands` (18e table Drizzle)

```typescript
export const slashCommands = sqliteTable('slash_commands', {
  id: text('id').primaryKey(),                    // nanoid()
  name: text('name').notNull(),                   // kebab-case, unique par scope
  description: text('description').notNull(),     // 1 ligne, affiche dans autocomplete
  prompt: text('prompt').notNull(),               // template avec $ARGS, $1, $2...
  category: text('category'),                     // optionnel, pour grouper dans l'autocomplete
  projectId: text('project_id')                   // null = global, sinon scope projet
    .references(() => projects.id, { onDelete: 'cascade' }),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
```

**Contraintes** :
- `name` : 1-50 chars, regex `^[a-z][a-z0-9-]*$` (kebab-case, commence par lettre)
- `description` : 1-200 chars
- `prompt` : 1-10000 chars
- `category` : 0-50 chars
- Unicite : `(name, projectId)` — meme nom autorise si scopes differents (projet A vs global)
- Si conflit nom entre projet et global → projet gagne (resolution cote renderer)

#### Variables de substitution dans `prompt`

| Variable | Description |
|----------|-------------|
| `$ARGS` | Tout le texte apres le nom de la commande |
| `$1`, `$2`, `$N` | Arguments positionnels (split par espaces, guillemets pour grouper) |
| `$MODEL` | Nom du modele actif (ex: `claude-sonnet-4-6`) |
| `$PROJECT` | Nom du projet actif (ou vide) |
| `$WORKSPACE` | Chemin du workspace actif (ou vide) |
| `$DATE` | Date du jour ISO (YYYY-MM-DD) |

### 3.3 Commandes builtin

Fichier statique `src/main/commands/builtin.ts` — tableau de `SlashCommandDefinition[]` injecte au premier lancement (seed DB) et mis a jour a chaque mise a jour app.

**Commandes builtin initiales** :

| Commande | Description | Prompt (resume) |
|----------|-------------|-----------------|
| `/resume` | Resume la conversation | "Resume cette conversation en bullet points..." |
| `/explain` | Explique du code | "Explique le code suivant en detail : $ARGS" |
| `/refactor` | Propose un refactoring | "Propose un refactoring pour : $ARGS" |
| `/debug` | Aide au debug | "Aide-moi a debugger ce probleme : $ARGS" |
| `/translate` | Traduit du texte | "Traduis en $1 : $2" |
| `/commit-msg` | Genere un message de commit | "Genere un message de commit conventionnel pour ces changements : $ARGS" |
| `/review` | Code review | "Fais une code review du code suivant : $ARGS" |
| `/test` | Genere des tests | "Genere des tests unitaires pour : $ARGS" |

Les builtins sont `isBuiltin: true`, non supprimables mais editables (l'utilisateur peut modifier le prompt). Un bouton "Reinitialiser" restaure le prompt original.

---

## 4. Flux d'execution

### 4.1 Detection et autocomplete (renderer)

```
Utilisateur tape "/" dans InputZone
  → useSlashCommands() hook detecte le prefixe "/"
  → Filtre les commandes matchant le texte apres "/"
  → Affiche un popover d'autocomplete au-dessus du textarea
  → Navigation clavier (fleches + Enter + Escape + Tab)
  → Selection → insere "/command " dans le textarea
  → L'utilisateur complete les arguments
  → Enter → handleSend() intercepte le "/" en debut de contenu
```

### 4.2 Resolution (renderer — avant envoi IPC)

```typescript
// Dans handleSendText(), AVANT l'appel window.api.sendMessage()
function resolveSlashCommand(content: string): string | null {
  if (!content.startsWith('/')) return null

  const [commandName, ...argParts] = parseCommandLine(content.slice(1))
  const command = findCommand(commandName) // priorite projet > global > builtin
  if (!command) return null // pas une commande connue → envoyer tel quel

  // Substitution des variables
  return substituteVariables(command.prompt, {
    ARGS: argParts.join(' '),
    ...positionalArgs(argParts),
    MODEL: selectedModel?.name,
    PROJECT: activeProject?.name,
    WORKSPACE: workspaceRootPath,
    DATE: new Date().toISOString().split('T')[0],
  })
}
```

**Important** : la resolution se fait 100% cote renderer. Le main process recoit un message `content` normal (le prompt resolu), pas la commande brute. Cela :
- Evite un nouveau handler IPC
- Garde le flux `chat:send` inchange
- Le message affiche dans le chat est le prompt resolu (transparence)
- Zero risque d'injection cote main (le prompt est deja en DB, valide par Zod)

### 4.3 Affichage dans le chat

Le message utilisateur affiche dans le chat montre :
- **Header** : badge `/command-name` (petit tag colore, comme les badges Git)
- **Content** : le prompt resolu complet (l'utilisateur voit exactement ce qui est envoye au LLM)

Cela garantit la transparence : l'utilisateur comprend toujours ce que le LLM recoit.

---

## 5. UX detaillee

### 5.1 Autocomplete popover

**Declenchement** : quand le contenu du textarea commence par `/` et le curseur est sur la premiere ligne.

**Composant** : `SlashCommandPicker` (nouveau composant, meme pattern que `CommandPalette.tsx`)

```
┌─────────────────────────────────────────┐
│  /res                                   │  ← textarea
├─────────────────────────────────────────┤
│ ⚡ /resume     Resume la conversation   │  ← match surligne
│ 📝 /review    Code review               │
│ 🔄 /refactor  Propose un refactoring    │
│ ──── Mon projet ────                    │
│ 🎯 /deploy    Deploy en production      │  ← commande projet
└─────────────────────────────────────────┘
```

**Comportement** :
- Filtre en temps reel (fuzzy match sur `name` + `description`)
- Sections : "Commandes" (global + builtin) puis "Projet" (si projet actif)
- Icone : emoji ou icone Lucide selon categorie
- Navigation : `ArrowUp`/`ArrowDown` pour naviguer, `Enter`/`Tab` pour selectionner, `Escape` pour fermer
- Selection → remplace le texte par `/command-name ` (avec espace trailing pour les args)
- Max 8 resultats visibles, scroll si plus
- Disparait si le curseur quitte la premiere ligne ou si le texte ne commence plus par `/`

### 5.2 Vue de gestion (CRUD)

**Emplacement** : nouvelle vue `commands` dans le `ViewMode` (NavGroup "Personnalisation", apres "Memoire")

**Pattern** : identique a PromptsView/RolesView (grille de cards + subView create/edit)

```
┌─────────────────────────────────────────────────┐
│  Commandes                    [Import] [Nouveau] │
├─────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│ │ /resume │ │ /review │ │ /debug  │            │
│ │ builtin │ │ builtin │ │ builtin │            │
│ │ Resume  │ │ Code    │ │ Aide au │            │
│ │ la conv.│ │ review  │ │ debug   │            │
│ └─────────┘ └─────────┘ └─────────┘            │
│                                                  │
│ ── Mon projet ──                                │
│ ┌─────────┐                                     │
│ │ /deploy │                                     │
│ │ custom  │                                     │
│ └─────────┘                                     │
└─────────────────────────────────────────────────┘
```

**Formulaire** (meme pattern inline que PromptsView) :
- Nom (input, kebab-case auto-format)
- Description (input, 1 ligne)
- Categorie (input optionnel)
- Prompt template (textarea, avec aide variables `$ARGS`, `$1`...)
- Scope : Global / Projet [select] (si un projet est actif)
- Bouton "Tester" : preview du prompt resolu avec des args d'exemple

**Actions card** (hover) :
- Editer
- Dupliquer
- Exporter (JSON single)
- Supprimer (sauf builtin)
- Reinitialiser (builtin uniquement — restaure prompt original)

### 5.3 Export/Import JSON

Meme pattern exact que Prompts/Roles :

```json
{
  "type": "multi-llm-commands",
  "version": 1,
  "exportedAt": "2026-03-12T...",
  "items": [
    {
      "name": "deploy",
      "description": "Deploy en production",
      "prompt": "...",
      "category": "devops"
    }
  ]
}
```

- Export : all ou single
- Import : dedup par `uniqueName()` (suffixe `-1`, `-2`)
- Champs exclus de l'export : `id`, `createdAt`, `isBuiltin`, `projectId`, `sortOrder`

---

## 6. Securite

### 6.1 Validation IPC (Zod)

```typescript
const slashCommandSchema = z.object({
  name: z.string().min(1).max(50).regex(/^[a-z][a-z0-9-]*$/),
  description: z.string().min(1).max(200),
  prompt: z.string().min(1).max(10_000),
  category: z.string().max(50).optional(),
  projectId: z.string().max(100).optional(),
})
```

### 6.2 Pas d'execution shell

Contrairement a Claude Code (`!command`) et Gemini (`!{command}`), **aucune execution shell** n'est supportee dans les templates de commandes. Les variables sont purement textuelles. Raisons :
- L'app n'est pas un CLI — l'utilisateur n'est pas dans un terminal
- Le bash tool existe deja dans le workspace pour le LLM
- Risque d'injection trop eleve (commandes creees par import JSON, pas fiables)

### 6.3 Sanitization des variables

- `$ARGS` et `$N` : texte brut de l'utilisateur, injecte tel quel dans le prompt
- Pas de risque car le prompt resolu est envoye comme `content` d'un message user — il est traite par le LLM comme du texte, pas comme une instruction systeme
- Le prompt template lui-meme est valide par Zod (max 10K chars) et stocke en DB

### 6.4 Protection anti-conflit

- Les noms de commandes ne peuvent pas commencer par un underscore ou un chiffre
- Noms reserves (blacklist) : `help`, `clear`, `settings`, `quit`, `exit` — eviter les collisions avec de futures commandes systeme
- La resolution est deterministe : projet > global > builtin

### 6.5 Import JSON

- Validation Zod complete sur chaque item importe
- Limite 100 commandes max par import
- Taille fichier max 1MB (coherent avec import prompts/roles)
- Les commandes importees sont toujours `isBuiltin: false`

---

## 7. Plan d'implementation

### Phase 1 — Backend (DB + IPC + Seed)

**Fichiers a creer :**
- `src/main/db/queries/slash-commands.ts` — queries CRUD
- `src/main/ipc/slash-commands.ipc.ts` — handlers IPC (Zod)
- `src/main/commands/builtin.ts` — definitions builtin

**Fichiers a modifier :**
- `src/main/db/schema.ts` — ajouter table `slashCommands`
- `src/main/db/migrate.ts` — `CREATE TABLE IF NOT EXISTS slash_commands`
- `src/main/ipc/index.ts` — enregistrer `registerSlashCommandsIpc()`
- `src/preload/index.ts` — ajouter methodes bridge (~8 methodes)
- `src/preload/types.ts` — ajouter types `SlashCommand`, `SlashCommandInput`

**Handlers IPC** (8 methodes, meme pattern que prompts) :
1. `slash-commands:get-all` → liste toutes les commandes (+ filtre projectId optionnel)
2. `slash-commands:get` → une commande par id
3. `slash-commands:create` → creer (Zod)
4. `slash-commands:update` → modifier (Zod)
5. `slash-commands:delete` → supprimer (bloque si `isBuiltin`)
6. `slash-commands:reset` → reinitialiser un builtin au prompt original
7. `slash-commands:reorder` → maj `sortOrder`
8. `slash-commands:seed` → injecter/mettre a jour les builtins (appele au demarrage app)

**Seed builtin** : appele dans `src/main/index.ts` au demarrage (apres migration). Upsert : si le builtin existe deja et n'a pas ete modifie par l'utilisateur, mettre a jour le prompt. Si modifie, ne pas ecraser (l'utilisateur a customise).

### Phase 2 — Store + Vue CRUD (renderer)

**Fichiers a creer :**
- `src/renderer/src/stores/slash-commands.store.ts` — Zustand store
- `src/renderer/src/components/commands/CommandsView.tsx` — vue principale (grille)
- `src/renderer/src/components/commands/CommandCard.tsx` — card commande
- `src/renderer/src/components/commands/CommandForm.tsx` — formulaire create/edit

**Fichiers a modifier :**
- `src/renderer/src/App.tsx` — ajouter `ViewMode.commands` + route
- `src/renderer/src/stores/ui.store.ts` — ajouter `'commands'` au type ViewMode
- `src/renderer/src/components/layout/Sidebar.tsx` — ajouter item NavGroup "Personnalisation"
- `src/renderer/src/hooks/useInitApp.ts` — charger les commandes au demarrage
- `src/renderer/src/hooks/useKeyboardShortcuts.ts` — raccourci optionnel (ex: `Cmd+/`)

**Store pattern** : identique a `mcp.store.ts` — chargement initial via IPC, CRUD local + IPC sync.

### Phase 3 — Autocomplete + Resolution (renderer)

**Fichiers a creer :**
- `src/renderer/src/components/chat/SlashCommandPicker.tsx` — popover autocomplete
- `src/renderer/src/hooks/useSlashCommands.ts` — hook detection `/` + filtrage + resolution

**Fichiers a modifier :**
- `src/renderer/src/components/chat/InputZone.tsx` — integration du hook + affichage popover + interception `handleSendText()`

**Hook `useSlashCommands(content, cursorPosition)`** :
- Detecte si le contenu commence par `/`
- Retourne `{ isActive, matches, selectedIndex, resolve(content) }`
- `resolve(content)` : parse la commande, substitue les variables, retourne le prompt resolu ou `null`

**Modification `handleSendText()`** :
```typescript
// Avant l'appel window.api.sendMessage()
const resolved = resolveSlashCommand(content)
if (resolved !== null) {
  // Remplacer content par le prompt resolu
  // Ajouter metadata pour le badge dans le chat
  payload.content = resolved.prompt
  payload.slashCommand = resolved.commandName // pour affichage badge
}
```

Note : `slashCommand` est un champ optionnel ajoute a `SendMessagePayload`, passe au store local pour l'affichage du badge. Le main process l'ignore (il ne voit que `content`).

### Phase 4 — Affichage chat + Polish

**Fichiers a modifier :**
- `src/renderer/src/components/chat/MessageItem.tsx` — badge `/command-name` sur les messages issus de commandes
- `src/renderer/src/stores/messages.store.ts` — stocker `slashCommand` dans le message local

**Export/Import** : meme pattern que PromptsView (100% renderer, pas de nouveau IPC).

**Cleanup DB** :
- `src/main/db/queries/cleanup.ts` — ajouter `slash_commands` dans l'ordre FK de suppression (avant `projects` car FK)

---

## 8. Tests

### Tests manuels prioritaires

1. Taper `/` → l'autocomplete s'affiche avec toutes les commandes
2. Taper `/res` → filtre les commandes matchant "res"
3. Selectionner `/resume` → le textarea affiche `/resume `
4. Taper `/resume` + Enter → le message envoye est le prompt resolu, pas "/resume"
5. Taper `/inexistant` + Enter → envoye tel quel comme message normal (pas d'erreur)
6. Creer une commande projet → elle apparait dans l'autocomplete quand le projet est actif
7. Commande projet et globale avec le meme nom → la commande projet gagne
8. Editer un builtin → le prompt custom est utilise
9. Reinitialiser un builtin → le prompt original est restaure
10. Import JSON avec doublons → noms suffixes `-1`, `-2`
11. `/translate en "Hello world"` → `$1` = "en", `$2` = "Hello world"
12. Conversation sans projet → seules les commandes globales + builtin apparaissent

### Cas limites

- Contenu commencant par `/` mais pas une commande connue → envoye tel quel
- Commande sans arguments requis → le prompt contient `$ARGS` vide (acceptable)
- Textarea multi-ligne commencant par `/` → seule la premiere ligne est parsee comme commande
- Nom de commande avec des majuscules tapees → normalise en lowercase pour le match
- Commande supprimee pendant qu'un autocomplete est ouvert → refresh du filtre

---

## 9. Decisions architecturales

| Decision | Choix | Justification |
|----------|-------|---------------|
| Stockage | DB SQLite | Coherent avec prompts/roles/memory, CRUD existant |
| Resolution | Renderer | Zero nouveau IPC, flux chat:send inchange, transparence |
| Format template | `$ARGS`/`$N` | Simple, pas d'execution shell, facile a comprendre |
| Autocomplete | Popover custom | Meme pattern CommandPalette, pas de lib externe |
| Builtin | Seed DB au demarrage | Modifiables par l'utilisateur, reinitialisation possible |
| Scope | Global + Projet | Meme pattern que MCP servers |
| Export/Import | JSON renderer | Meme pattern que Prompts/Roles |
| Pas de shell exec | Delibere | Securite, pas un CLI, le bash tool existe pour le LLM |

---

## 10. Hors scope (futur)

- Commandes avec execution shell (`!command`) — trop risque pour une app desktop
- Commandes model-invoked (le LLM appelle une commande) — complexe, peu de valeur ajoutee
- Variables dynamiques avec lecture fichier (`@file`) — le workspace tools le fait deja
- Commandes avec UI custom (formulaire, selecteurs) — trop complexe pour v1
- Raccourcis clavier par commande — a evaluer apres v1
- Drag & drop pour reordonner les commandes — si demande, meme pattern que memory fragments
- Commandes chainees (`/cmd1 | /cmd2`) — over-engineering
