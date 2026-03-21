# Team Prompt — Barda (Gestion de Brigade)

**Date** : 2026-03-20
**Agents** : 2 (backend + frontend)
**Vagues** : 3 (P0) + 1 (P1)

## Prerequis

- [ ] Branche `feature-barda` creee depuis `main`
- [ ] Spec lue : `specs/barda/architecture-technique.md` + `specs/barda/tasks.md`

## Commandes de lancement

```bash
# Creer la branche
git checkout -b feature-barda

# Lancer les 2 agents en parallele (Vague 1+2)
# Agent backend dans un worktree
# Agent frontend dans un autre worktree
```

---

## Prompt d'orchestration

Tu es l'orchestrateur du chantier **Barda (Gestion de Brigade)** pour Cruchot.

### Contexte
- Spec complete dans `specs/barda/`
- Stack : Electron 35 + React 19 + TypeScript + Tailwind 4 + shadcn/ui + Drizzle ORM + Zustand + AI SDK v6
- 24 tables Drizzle existantes, ~140 IPC handlers, 13 vues renderer
- Conventions : `.memory/patterns.md` + `.memory/gotchas.md` + `CLAUDE.md`

### Agents

| Agent | Piste | Worktree | Taches |
|-------|-------|----------|--------|
| `barda-backend` | Main process + preload | `feature-barda-backend` | T01, T02, T03, T04, T05, T06 |
| `barda-frontend` | Renderer | `feature-barda-frontend` | T07, T08, T09, T10, T11 |

### Vague 1 — Fondations (parallele)

**barda-backend** :
1. **T01 — Schema DB + migrations** : Ajouter table `bardas` dans `schema.ts`, migrations idempotentes dans `migrate.ts` (CREATE TABLE + 6 ALTER TABLE namespace + 7 CREATE INDEX). Cleanup dans `cleanup.ts`.
2. **T02 — BardaParserService** : Parseur maison (~200 lignes). Frontmatter YAML + sections `##` + ressources `###`. MCP en YAML fenced. Validation stricte, erreurs avec ligne. Sanitize XML/HTML.

**barda-frontend** :
1. **T07 — Types partages** : Ajouter dans `preload/types.ts` : BardaInfo, ParsedBarda, ParsedResource, BardaImportReport, BardaParseError.
2. **T08 — Store barda** : `barda.store.ts` — state `bardas[]`, `isLoading`, `disabledNamespaces` (computed). Actions : load, import, toggle, uninstall.

### Vague 2 — Services et UI (parallele)

**barda-backend** :
3. **T03 — Queries bardas** : `db/queries/bardas.ts`. CRUD + `deleteResourcesByNamespace` (6 tables, ordre FK).
4. **T04 — BardaImportService** : Transaction SQLite atomique, namespace propagation, MCP skip, rapport. Verification namespace unique + capacite fragments.
5. **T05 — IPC handlers** : `barda.ipc.ts`, 5 handlers Zod. Enregistrer dans `ipc/index.ts`.
6. **T06 — Preload bridge** : 5 methodes dans `preload/index.ts`.

**barda-frontend** :
3. **T09 — BrigadeView** : Vue grille, bouton import (showOpenDialog .md), etat vide. Pattern LibrariesView.
4. **T10 — BardaCard** : Card avec namespace badge, compteurs, toggle switch, bouton desinstaller.
5. **T11 — Navigation** : ViewMode `'brigade'`, App.tsx lazy, UserMenu entree (sous-menu Personnalisation), CommandPalette.

### Sync point — Merge des 2 worktrees

Apres Vague 2, merger les 2 branches dans `feature-barda`. Verifier que le typecheck passe.

### Vague 3 — Integration (sequentiel, orchestrateur)

**T12 — Filtre namespace** : Modifier 6 vues existantes (RolesView, CommandsView, PromptsView, MemoryFragmentsSection, LibrariesView, McpView) pour filtrer les ressources des bardas desactives. Utiliser `disabledNamespaces` du store barda.

### Vague 4 — P1 (sequentiel)

**T13 — BardaPreview** : Preview avant import avec sections et compteurs.
**T14 — Rapport post-import** : Dialog avec succes/skips/warnings.
**T15 — Badge namespace** : Badge colore sur les ressources de barda dans RolesView, CommandsView, PromptsView.

---

## Annexe — Detail des taches assignees

### barda-backend : T01 (Schema DB)

**Fichiers** : `src/main/db/schema.ts`, `src/main/db/migrate.ts`, `src/main/db/queries/cleanup.ts`

Table `bardas` :
```
id TEXT PK, namespace TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
description TEXT, version TEXT, author TEXT,
isEnabled INTEGER DEFAULT 1,
rolesCount INTEGER DEFAULT 0, commandsCount INTEGER DEFAULT 0,
promptsCount INTEGER DEFAULT 0, fragmentsCount INTEGER DEFAULT 0,
librariesCount INTEGER DEFAULT 0, mcpServersCount INTEGER DEFAULT 0,
createdAt INTEGER, updatedAt INTEGER
```

ALTER TABLE idempotent (try/catch) sur : roles, slash_commands, prompts, memory_fragments, libraries, mcp_servers — ajouter `namespace TEXT`.

7 index : `idx_bardas_namespace`, `idx_roles_namespace`, etc.

Cleanup : ajouter `DELETE FROM bardas` dans le bon ordre (avant les tables qui portent namespace).

### barda-backend : T02 (Parser)

**Fichier** : `src/main/services/barda-parser.service.ts`

Interface :
```typescript
interface ParseResult {
  success: true, data: ParsedBarda
} | {
  success: false, error: { line: number, message: string }
}

class BardaParserService {
  parse(content: string): ParseResult
}
```

Etapes :
1. Extraire frontmatter (entre `---`)
2. Valider frontmatter via Zod (name requis, namespace requis + regex)
3. Splitter le body par `## ` headings → sections
4. Pour chaque section reconnue, splitter par `### ` → ressources
5. Section MCP : extraire le bloc fenced YAML du body
6. Sanitize tous les contenus texte (escape `<>&`)

### barda-frontend : T09 (BrigadeView)

Pattern a suivre : `components/libraries/LibrariesView.tsx` (grille de cards)

Layout :
- Header : titre "Gestion de Brigade" + description + bouton "Importer un barda" (Upload icon)
- Grille : `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- Etat vide : icone Shield + texte explicatif
- Import : `window.api.showOpenDialog({ filters: [{ name: 'Barda', extensions: ['md'] }] })` puis `window.api.bardaImport(filePath)`

### barda-frontend : T11 (Navigation)

- `ui.store.ts` : ajouter `'brigade'` dans le type ViewMode
- `App.tsx` : `const BrigadeView = lazy(() => import('./components/brigade/BrigadeView'))` + case dans le switch
- `UserMenu.tsx` : entree dans le sous-menu Personnalisation (entre Referentiels et Commandes), icone `Shield` de lucide-react
- `CommandPalette.tsx` : ajouter `{ label: 'Brigade', value: 'brigade', icon: Shield }`
