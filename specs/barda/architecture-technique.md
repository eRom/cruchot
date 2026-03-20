# Architecture Technique — Barda (Gestion de Brigade)

**Date** : 2026-03-20
**Statut** : Decide
**Contexte** : brainstorming.md, architecture-fonctionnelle.md, stack-technique.md (existant)

## Probleme architectural

Ajouter a Cruchot un systeme d'import de fichiers Markdown structures ("bardas") qui cree des ressources en masse (roles, commands, prompts, memory fragments, libraries, MCP) sous un namespace unique, avec toggle ON/OFF global et desinstallation atomique. Le tout doit s'integrer dans l'architecture existante (24 tables, ~140 IPC handlers, 13 vues) sans casser les conventions.

## Flux principal

```
[Utilisateur]
      |
      | selectionne fichier .md
      v
[Renderer: BrigadeView] → dialog natif (showOpenDialog)
      |
      | IPC "barda:import"
      v
[Main: barda.ipc.ts]
      |
      +→ [BardaParserService.parse(content)]
      |     |
      |     +→ valide frontmatter YAML (namespace, name, version, description, author)
      |     +→ valide chaque section (## Roles, ## Commands, etc.)
      |     +→ valide chaque ressource (### heading + body)
      |     +→ retourne ParsedBarda | ParseError (ligne, message)
      |
      +→ [Verification namespace unique] (query DB)
      |
      +→ [Verification capacite memory fragments] (count actifs + nouveaux <= 50)
      |
      +→ [BardaImportService.import(parsedBarda)]
            |
            +→ Transaction SQLite atomique :
            |    1. INSERT barda dans table `bardas`
            |    2. INSERT roles avec namespace prefix
            |    3. INSERT slash_commands avec namespace prefix
            |    4. INSERT prompts avec namespace prefix
            |    5. INSERT memory_fragments avec namespace
            |    6. INSERT libraries (definition seulement, status 'empty')
            |    7. INSERT mcp_servers (skip si nom existe)
            |
            +→ Retourne BardaImportReport { succes[], skips[], warnings[] }
```

## Decisions architecturales

### Decision 1 : Namespace comme lien logique (pas de FK)

**Probleme** : Comment lier les ressources d'un barda pour le toggle/desinstallation ?

**Options** :
- Option A : FK `barda_id` sur chaque table (roles, commands, etc.) → migration lourde, 6 ALTER TABLE, queries impactees
- Option B : Colonne `namespace` TEXT nullable sur chaque table → filtre simple, pas de FK, decouplage propre

**Choix** : Option B — colonne `namespace`

**Raison** : Le namespace est deja le concept metier central (visible dans l'UI : `ecrivain:resume-chapitre`). Ajouter une colonne `namespace` est moins invasif qu'une FK. La desinstallation = `DELETE WHERE namespace = ?` sur chaque table. Le toggle ON/OFF est gere par un champ `isEnabled` sur la table `bardas` — le renderer filtre cote client via le namespace.

### Decision 2 : Parseur Markdown maison (pas de lib)

**Probleme** : Comment parser le format barda ?

**Options** :
- Option A : Lib Markdown (remark/unified) + extraction AST → overhead, 500KB+ de deps, parsing generique pas adapte
- Option B : Parseur regex/string maison → leger, specifique au format barda, pas de dep

**Choix** : Option B — parseur maison

**Raison** : Le format barda est simple et fixe (frontmatter + `##` sections + `###` items). Un parseur maison de ~200 lignes est plus robuste car il ne fait QUE ce qu'on attend. La lib remark serait overkill et introduirait des edge cases lies au Markdown generique qu'on ne veut pas gerer.

### Decision 3 : Section MCP en YAML inline

**Probleme** : Les definitions MCP sont plus structurees que du texte libre (transport, command, args...). Comment les representer ?

**Options** :
- Option A : Texte libre parse avec des conventions → fragile, ambigue
- Option B : Bloc de code YAML fenced dans le body du heading → structure, lisible, parsable

**Choix** : Option B — YAML fenced

**Raison** : Un serveur MCP a des champs structures (transportType, command, args[]). Le YAML est naturel dans un fichier Markdown (bloc fenced), lisible, et parsable avec `yaml` (deja en dep transitif via electron-vite). Coherent avec le frontmatter qui est aussi du YAML.

### Decision 4 : Import atomique en transaction SQLite

**Probleme** : Un barda contient potentiellement 20+ ressources. Si l'INSERT du 15eme echoue, on a 14 orphelins.

**Options** :
- Option A : Insert un par un, rollback manuel en cas d'erreur → complexe, race conditions
- Option B : Transaction SQLite wrappee → atomique par design

**Choix** : Option B — transaction SQLite

**Raison** : Drizzle supporte `db.transaction()`. Tout le batch d'INSERTs est dans une seule transaction. Si un INSERT echoue, tout rollback. Zero cleanup a gerer.

### Decision 5 : Vue "Gestion de Brigade" — nouvelle vue standalone

**Probleme** : Ou placer l'UI de gestion des bardas ?

**Options** :
- Option A : Tab dans Settings → enterre, pas visible
- Option B : Vue standalone (comme LibrariesView, CommandsView) → visible dans le menu, pattern existant

**Choix** : Option B — vue standalone `BrigadeView`

**Raison** : Les bardas sont une feature majeure, pas un setting. Le UserMenu a deja un sous-menu "Personnalisation" qui contient Referentiels — on y ajoute "Brigade". Pattern identique aux autres vues (lazy-loaded, grille de cards).

## Structure du projet (nouveaux fichiers)

```
src/
  main/
    services/
      barda-parser.service.ts    # [NEW] Parse Markdown → ParsedBarda, validation stricte
      barda-import.service.ts    # [NEW] Import atomique DB, namespace propagation
    ipc/
      barda.ipc.ts               # [NEW] 5 handlers IPC (import, list, toggle, uninstall, preview)
    db/
      queries/
        bardas.ts                # [NEW] CRUD table bardas + queries namespace
  preload/
    index.ts                     # [MODIFY] +5 methodes barda
    types.ts                     # [MODIFY] +types BardaInfo, ParsedBarda, BardaImportReport
  renderer/src/
    components/
      brigade/
        BrigadeView.tsx          # [NEW] Vue principale (grille cards + import + toggle + uninstall)
        BardaCard.tsx            # [NEW] Card d'un barda (nom, namespace, compteurs, toggle, actions)
        BardaPreview.tsx         # [NEW] Preview avant import (sections, compteurs)
    stores/
      barda.store.ts             # [NEW] Store Zustand
```

## Modele de donnees technique

### Nouvelle table : `bardas` (25eme table Drizzle)

```
bardas
  id            TEXT PK (nanoid)
  namespace     TEXT NOT NULL UNIQUE       -- ex: "ecrivain"
  name          TEXT NOT NULL              -- ex: "Ecrivain"
  description   TEXT                       -- description du barda
  version       TEXT                       -- ex: "1.0.0"
  author        TEXT                       -- ex: "Romain"
  isEnabled     INTEGER DEFAULT 1 (bool)   -- toggle ON/OFF
  rolesCount    INTEGER DEFAULT 0          -- stats cachees
  commandsCount INTEGER DEFAULT 0
  promptsCount  INTEGER DEFAULT 0
  fragmentsCount INTEGER DEFAULT 0
  librariesCount INTEGER DEFAULT 0
  mcpServersCount INTEGER DEFAULT 0
  createdAt     INTEGER (timestamp)
  updatedAt     INTEGER (timestamp)
```

### Colonnes ajoutees aux tables existantes

| Table | Colonne ajoutee | Type |
|-------|----------------|------|
| `roles` | `namespace` | TEXT (nullable) |
| `slash_commands` | `namespace` | TEXT (nullable) |
| `prompts` | `namespace` | TEXT (nullable) |
| `memory_fragments` | `namespace` | TEXT (nullable) |
| `libraries` | `namespace` | TEXT (nullable) |
| `mcp_servers` | `namespace` | TEXT (nullable) |

Convention : `namespace = NULL` → ressource custom (creee par l'utilisateur). `namespace = "ecrivain"` → ressource du barda ecrivain.

### Index

```sql
CREATE INDEX IF NOT EXISTS idx_bardas_namespace ON bardas(namespace);
CREATE INDEX IF NOT EXISTS idx_roles_namespace ON roles(namespace);
CREATE INDEX IF NOT EXISTS idx_slash_commands_namespace ON slash_commands(namespace);
CREATE INDEX IF NOT EXISTS idx_prompts_namespace ON prompts(namespace);
CREATE INDEX IF NOT EXISTS idx_memory_fragments_namespace ON memory_fragments(namespace);
CREATE INDEX IF NOT EXISTS idx_libraries_namespace ON libraries(namespace);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_namespace ON mcp_servers(namespace);
```

## Format du fichier Barda

```markdown
---
name: Ecrivain
namespace: ecrivain
version: 1.0.0
description: Barda complet pour l'ecriture de roman
author: Romain
---

## Roles

### Editeur litteraire
Tu es un editeur litteraire exigeant...

### Lecteur beta
Tu es un lecteur beta attentif...

## Commands

### resume-chapitre
Resume ce chapitre en 3-5 phrases. $ARGS

### fiche-perso
Cree une fiche personnage detaillee... $ARGS

## Prompts

### Brainstorm intrigue
Je travaille sur un roman de genre $1...

## Memory Fragments

### Regles typographiques francaises
Guillemets francais, tiret cadratin, espace insecable...

## Libraries

### Bible du roman
Collection de reference pour le roman en cours

## MCP

### context7
```yaml
transportType: stdio
command: npx
args: ["-y", "@upstash/context7-mcp@latest"]
```
```

### Regles de parsing

1. **Frontmatter** : obligatoire, champs `name` et `namespace` requis, `version`/`description`/`author` optionnels
2. **Sections** : `## Roles`, `## Commands`, `## Prompts`, `## Memory Fragments`, `## Libraries`, `## MCP` — toutes optionnelles, ordre libre
3. **Ressources** : `### Nom` suivi du body (tout le texte jusqu'au prochain `###` ou `##`)
4. **MCP** : le body contient un bloc fenced YAML avec les champs structures
5. **Sections inconnues** (`## Truc`) : ignorees silencieusement (forward-compatible)
6. **Validation** : frontmatter valide (Zod), namespace regex `/^[a-z][a-z0-9-]*$/`, au moins 1 section non-vide

## Securite (Security by Design)

### Validation des entrees
- **Taille fichier** : max 1 MB, verifie avant lecture du contenu
- **Frontmatter** : Zod schema strict (name: string, namespace: regex, version?: string, etc.)
- **Namespace** : regex `/^[a-z][a-z0-9-]*$/` — pas de caracteres speciaux, pas de path traversal
- **Contenu texte** : sanitization XML/HTML sur les system prompts (roles), prompts, memory fragments — meme sanitize que `buildLibraryContextBlock()` (escape `<`, `>`, `&`)
- **MCP definitions** : pas de champ `envEncrypted` (pas de secrets dans un barda partageable)

### Surface d'attaque & Mitigations

| Point d'entree | Menace | Mitigation |
|-----------------|--------|------------|
| Fichier .md fourni par un tiers | Markdown malicieux, injection | Parsing strict, rejet si invalide |
| System prompts dans les roles | Prompt injection | Sanitization, mais risque accepte (mono-user, contenu visible) |
| Namespace | Collision intentionnelle | Unicite DB, regex stricte |
| MCP command/args | Execution de binaire arbitraire | Meme risque que MCP existant — by design, mono-user |
| Taille fichier | DoS parsing | Limite 1 MB |

## Risques architecturaux

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Utilisateur edite a la main et casse le format | Eleve | Faible | Rejet strict + message precis |
| Trop de bardas → listes polluees | Moyen | Moyen | Filtre par namespace + toggle ON/OFF |
| Migration 6 ALTER TABLE simultanees | Faible | Moyen | Idempotente (try/catch), meme pattern que `is_favorite` |
| MCP skip silencieux passe inapercu | Moyen | Faible | Rapport post-import explicite |
