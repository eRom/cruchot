# Skills System — Phase 1 Design
> Date : 2026-04-01 (S46)

## Objectif

Ajouter un systeme de Skills a Cruchot : bibliotheque de skills installables (GitHub / local / Barda), invocables dans les conversations via slash command `/skill-name`, avec scan de securite Maton obligatoire a l'installation.

## Scope Phase 1

**Inclus :**
- Bibliotheque Skills dans Personnaliser > Skills (ajouter, supprimer, voir tree, open Finder, toggle ON/OFF)
- Installation depuis URL GitHub ou dossier local
- Scan Maton integre (Python subprocess)
- Invocation via slash command `/skill-name args`
- Injection `<skill-context>` dans le system prompt
- Execution des blocs shell (`!cmd`) via Seatbelt
- Format frontmatter compatible Claude Code
- Integration Barda (nouvelle section `## Skills`)
- Synthetic tool chunk "Skill: name" dans les outils utilises du message

**Exclus (phase 2+) :**
- Auto-invocation LLM (injection liste skills + detection automatique)
- Mode `fork` (sub-agent isole)
- Skills conditionnels (`paths:` glob activation)
- Marketplace / discovery remote

---

## 1. Format Skill

### Structure dossier

```
~/.cruchot/skills/<name>/
  ├── SKILL.md              # Fichier principal (frontmatter + prompt)
  ├── reference.md           # Fichiers annexes optionnels
  └── scripts/               # Scripts optionnels
      └── ...
```

### Frontmatter YAML (compatible Claude Code)

```yaml
---
name: my-skill
description: One-line description for the LLM
allowed-tools: [Bash, Read, Write]
argument-hint: $filePath $pattern
user-invocable: true
effort: low | medium | high | max
context: inline | fork          # Parse mais ignore en phase 1 (inline force)
agent: general-purpose          # Parse mais ignore en phase 1
paths: "**/*.ts"                # Parse mais ignore en phase 1
shell: bash | powershell
---

# Contenu du prompt Markdown

Instructions pour le LLM...
```

**Champs supportes phase 1 :**
- `name` (string, requis) — identifiant unique du skill
- `description` (string) — description pour le LLM et la vue liste
- `allowed-tools` (string | string[]) — restriction des tools disponibles
- `argument-hint` (string) — hint pour l'autocomplete
- `user-invocable` (boolean, default true) — visible dans le dropdown slash
- `effort` (string) — controle du budget thinking (providerOptions)
- `shell` (string, default 'bash') — environnement shell pour les blocs `!cmd`

**Champs parses mais ignores (forward-compat) :**
- `context`, `agent`, `paths`, `model`, `hooks`, `when_to_use`

### Parsing

- Regex extraction : `/^---\s*\n([\s\S]*?)---\s*\n?/`
- Auto-quoting des valeurs YAML problematiques (globs avec `{}`, `*`)
- Librairie : `yaml` (deja en dep via AI SDK) ou parsing manuel regex

---

## 2. Donnees

### Table `skills` (26eme table Drizzle)

```typescript
export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),                    // crypto.randomUUID()
  name: text('name').notNull().unique(),           // identifiant unique
  description: text('description'),                // extrait du frontmatter
  allowedTools: text('allowed_tools', { mode: 'json' }).$type<string[]>(),
  shell: text('shell').default('bash'),            // 'bash' | 'powershell'
  effort: text('effort'),                          // 'low' | 'medium' | 'high' | 'max'
  userInvocable: integer('user_invocable').default(1),
  enabled: integer('enabled').default(1),          // toggle ON/OFF
  source: text('source').notNull(),                // 'local' | 'git' | 'barda'
  gitUrl: text('git_url'),                         // URL GitHub d'origine
  namespace: text('namespace'),                    // namespace barda
  matonVerdict: text('maton_verdict'),             // 'OK' | 'WARNING' | 'CRITICAL' | null
  matonReport: text('maton_report', { mode: 'json' }).$type<MatonReport>(),
  installedAt: integer('installed_at').notNull(),   // timestamp secondes
})
```

### Index

```sql
CREATE INDEX idx_skills_name ON skills(name);
CREATE INDEX idx_skills_namespace ON skills(namespace);
CREATE INDEX idx_skills_enabled ON skills(enabled);
```

### Filesystem

- Storage : `~/.cruchot/skills/<name>/`
- Le dossier est cree au startup de l'app si inexistant
- La DB stocke les metadata, le filesystem stocke le contenu
- Sync au demarrage : parcourir `~/.cruchot/skills/*/SKILL.md`, parser frontmatter, mettre a jour la DB si delta

---

## 3. Installation

### Flow GitHub

```
URL GitHub collee dans SkillInstallDialog
    |
1. git clone <url> /tmp/cruchot-skill-<uuid>/
    |
2. Validation : SKILL.md existe a la racine ?
   → Non : erreur "Pas un skill valide"
    |
3. Parse frontmatter → extraire name
   → Echec : erreur "Frontmatter invalide"
    |
4. Conflit : skills table WHERE name = <name>
   → Existe : erreur "Skill '<name>' deja installe"
    |
5. Maton scan : python3 -m scanner /tmp/.../ --format json
   → CRITICAL : bouton "Installer" desactive (badge rouge)
   → WARNING : bouton "Installer quand meme" (badge orange)
   → OK : bouton "Installer" (badge vert)
   → Python absent : warning "Non scanne" (badge gris), installation possible
    |
6. User valide → copie dossier vers ~/.cruchot/skills/<name>/
    |
7. Parse complet SKILL.md → INSERT table skills
    |
8. Cleanup : trash /tmp/cruchot-skill-<uuid>/
```

### Flow local (file picker)

Memes etapes 2-7 (pas de clone, copie directe depuis le dossier selectionne).

### Flow Barda (section `## Skills`)

Format dans le fichier barda `.md` :

```markdown
## Skills

### maton
- source: https://github.com/eRom/claude-skill-maton

### my-local-skill
- source: /path/to/local/skill
```

Import barda :
1. Pour chaque skill : verifier si `name` existe deja → **skip** (meme pattern que MCP)
2. Si nouveau : `git clone` (ou copie locale) → Maton scan
3. Si CRITICAL : warning dans le rapport, skill non installe, reste du barda continue
4. Si OK/WARNING : copie + INSERT avec `namespace = barda-namespace`
5. Desinstallation barda : DELETE skills WHERE namespace + trash dossier

### Securite installation

| Aspect | Mecanisme |
|--------|-----------|
| Maton obligatoire | Pas d'installation sans scan (sauf Python absent → warning) |
| Path validation | `realpathSync()` + verifier SKILL.md dans le dossier (pas de symlink escape) |
| Git clone isole | `/tmp/cruchot-skill-<uuid>/` nonce directory |
| Cleanup | `trash` apres installation (succes ou echec) |
| Python check | `which python3` au demarrage, flag `pythonAvailable` |

---

## 4. Invocation & Execution

### Invocation slash command

```
User tape "/" dans InputZone
    |
useSlashCommands() hook → merge 2 sources :
  1. Slash commands (table slash_commands)
  2. Skills actives (table skills WHERE enabled = 1 AND user_invocable = 1)
    |
Dropdown autocomplete unifie (nom + description)
    |
User selectionne → IPC "chat:send" avec skillName + args
```

### Traitement Main process

```
chat.ipc.ts recoit { skillName, args }
    |
1. Charger ~/.cruchot/skills/<name>/SKILL.md
    |
2. Parse frontmatter → allowedTools, shell, effort
    |
3. Substitution variables dans le contenu :
   - ${SKILL_DIR} → chemin absolu du dossier du skill
   - ${WORKSPACE_PATH} → workspacePath de la conversation
    |
4. Detection et execution blocs shell :
   - Pattern block : ! ``` ... ```
   - Pattern inline : !`cmd`
   - Execution via Seatbelt (confine au workspacePath)
   - Remplacement du bloc par stdout/stderr
    |
5. Emission synthetic tool chunk (IPC chat:chunk) :
   { type: 'tool-call', toolName: 'skill', args: { name: skillName } }
   { type: 'tool-result', toolName: 'skill', result: 'ok' }
    |
6. Injection dans le system prompt :
   <skill-context name="<name>">
   [contenu SKILL.md apres expansion]

   ARGUMENTS: <args>
   </skill-context>
    |
7. streamText() avec le prompt enrichi
   - Si allowedTools → restreindre les conversation tools
   - Si effort → ajuster providerOptions thinking
```

### Ordre injection system prompt

```
1. <library-context>      (RAG sticky)
2. <semantic-memory>       (recall Qdrant)
3. <user-memory>           (memory fragments)
4. Role system prompt
5. <skill-context>         ← NOUVEAU
6. <workspace-context>     (CLAUDE.md, README.md)
```

### Feedback visuel

Le synthetic tool chunk s'affiche dans le collapsible "N outils utilises" du message :
```
✓ 🔧 Skill: maton
```

Meme pattern que "Recherche web" et "Referentiel: <name>".

---

## 5. UI — Personnaliser > Skills

### Navigation

- `CustomizeTab` etendu : `| 'skills'`
- 8eme onglet dans CustomizeView, entre Referentiels et MCP
- Raccourci : via Cmd+U → onglet Skills

### Vue liste (subView: 'grid')

Grille de cards `SkillCard` :
- **Nom** (gras) + **description** (1-2 lignes, tronquee)
- **Badge source** : `Git` (bleu) / `Local` (gris) / `Barda: <namespace>` (violet)
- **Pastille verdict Maton** : vert (OK) / orange (WARNING) / rouge (CRITICAL) / gris (NON SCANNE)
- **Toggle ON/OFF** (Switch)
- **Bouton supprimer** (Trash2 icon) → confirmation dialog → trash dossier + DELETE DB

Header :
- Titre "Skills"
- Bouton "Ajouter un skill" → ouvre `SkillInstallDialog`

### Vue detail (subView: 'detail')

Clic sur une card → vue detail :
- **Header** : nom, description, badges source + verdict
- **Metadata** : tableau cle/valeur des champs frontmatter parses
- **Tree fichiers** : arborescence du dossier, filtree
- **Bouton "Ouvrir dans Finder"** : `shell.openPath(skillDir)`
- **Preview** : contenu SKILL.md rendu en markdown read-only (sans frontmatter)
- **Rapport Maton** : si clic sur la pastille verdict, affiche les findings par severite/categorie
- **Bouton retour** → revient a la grille

### Filtrage tree fichiers

Patterns exclus :
- `__pycache__/`, `__init__.*`, `__main__.*` (tout `__*`)
- `.git/`, `node_modules/`, `.DS_Store`
- Fichiers compiles : `.pyc`, `.o`, `.so`, `.dll`

### SkillInstallDialog

Dialog modal avec 2 tabs :
- **GitHub** : champ URL + bouton "Scanner"
- **Local** : bouton "Choisir un dossier" (dialog natif)

Apres scan :
- Affiche nom + description extraits du frontmatter
- Affiche verdict Maton avec compteurs (N critical, N warning)
- Bouton "Voir le rapport" pour les details
- Bouton "Installer" (couleur selon verdict : vert/orange/desactive)

---

## 6. Fichiers impactes

### A creer (9 fichiers)

| Fichier | Role |
|---------|------|
| `src/main/db/queries/skills.ts` | CRUD skills + sync frontmatter |
| `src/main/ipc/skills.ipc.ts` | ~10 handlers IPC (Zod validation) |
| `src/main/services/skill.service.ts` | SkillService : discovery, parse, shell exec, install |
| `src/main/services/skill-maton.service.ts` | MatonService : wrapper Python subprocess |
| `src/main/llm/skill-prompt.ts` | Injection `<skill-context>`, substitution variables, exec blocs shell |
| `src/renderer/src/components/skills/SkillsView.tsx` | Vue liste + detail |
| `src/renderer/src/components/skills/SkillCard.tsx` | Card individuelle |
| `src/renderer/src/components/skills/SkillInstallDialog.tsx` | Dialog installation + rapport Maton |
| `src/renderer/src/stores/skills.store.ts` | Zustand store |

### A modifier (~15 fichiers)

| Fichier | Modification |
|---------|-------------|
| `src/main/db/schema.ts` | +table `skills` |
| `src/main/db/migrate.ts` | +CREATE TABLE + 3 index |
| `src/main/db/queries/cleanup.ts` | +DELETE skills (ordre FK) |
| `src/main/ipc/index.ts` | +register skills handlers |
| `src/main/ipc/chat.ipc.ts` | +branche skill invoke (parse, shell exec, injection, synthetic chunk) |
| `src/main/services/barda-parser.service.ts` | +parse section `## Skills` |
| `src/main/services/barda-import.service.ts` | +import skills (clone + maton + skip existant) |
| `src/main/db/queries/bardas.ts` | +cleanup skills par namespace |
| `src/preload/index.ts` | +~10 methodes skills |
| `src/preload/types.ts` | +types SkillInfo, SkillInstallResult, MatonReport |
| `src/renderer/src/stores/ui.store.ts` | +`'skills'` dans CustomizeTab |
| `src/renderer/src/components/customize/CustomizeView.tsx` | +onglet Skills + lazy import |
| `src/renderer/src/hooks/useSlashCommands.ts` | +merge skills dans dropdown |
| `src/renderer/src/components/chat/MessageItem.tsx` | +rendu synthetic chunk "Skill: name" |

### Non impacte

- `conversation-tools.ts`, `router.ts`, `registry.ts`
- `qdrant-memory`, `library.service`
- Toutes les vues existantes (sauf CustomizeView)

---

## 7. Skills de test

3 skills de reference pour valider l'installation :

| Skill | Type | URL |
|-------|------|-----|
| frontend-design | Simple (SKILL.md seul) | `https://github.com/anthropics/skills/tree/main/skills/frontend-design` |
| docx | Avec scripts | `https://github.com/anthropics/skills/tree/main/skills/docx` |
| skill-creator | Complete (multi-fichiers) | `https://github.com/anthropics/skills/tree/main/skills/skill-creator` |

---

## 8. Dependance Python

Maton necessite Python 3.8+.

- Au startup : `which python3` → flag `pythonAvailable` dans un service
- Si absent : warning dans SkillInstallDialog, verdict = "NON SCANNE" (gris)
- Installation toujours possible sans Python (a la discretion de l'utilisateur)
- Pas de bundling Python dans l'app — dependance systeme
