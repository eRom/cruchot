# OpenCode — Architecture du Systeme de Skills

> Document d'architecture technique — v1.0
> Auteurs : Romain + Trinity
> Date : 2026-03-13
> Scope : `packages/opencode/src/skill/`, `src/tool/skill.ts`, systeme de permissions associe

---

## 1. Vue d'ensemble

Le systeme de Skills d'OpenCode est un mecanisme d'**injection de contexte expert** dans les conversations agent-utilisateur. Une Skill est un fichier Markdown avec frontmatter YAML (`SKILL.md`) qui fournit des instructions, workflows et references specialisees a l'agent LLM.

**Point fondamental** : une Skill ne contient jamais de code executable. C'est du texte pur injecte comme contexte conversationnel. L'execution eventuelle de scripts references est deleguee aux tools standard (Bash, Read, Edit...).

### Positionnement dans l'architecture

```
                    +------------------+
                    |   System Prompt  |
                    |  (system.ts)     |
                    +--------+---------+
                             |
                    liste <available_skills>
                             |
                    +--------v---------+
                    |   Agent LLM      |
                    |  decide d'appeler|
                    |  le skill tool   |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   Skill Tool     |
                    |  (tool/skill.ts) |
                    +--------+---------+
                             |
                   charge le SKILL.md
                   + liste les fichiers
                             |
                    +--------v---------+
                    | Contexte enrichi |
                    | injecte dans la  |
                    | conversation     |
                    +--------+---------+
                             |
              L'agent utilise ensuite les tools
              standard (bash, read, edit...) pour
              agir sur les ressources de la skill
```

---

## 2. Format d'une Skill

### 2.1 Structure fichier

```
my-skill/
  SKILL.md              <- Point d'entree obligatoire
  references/           <- Documentation supplementaire (optionnel)
    api-guide.md
    examples.md
  scripts/              <- Scripts utilitaires (optionnel)
    deploy.py
    validate.sh
  templates/            <- Templates (optionnel)
    config.yaml
```

### 2.2 Format SKILL.md

```yaml
---
name: my-skill                          # Identifiant unique (requis)
description: One-line description...    # Description courte pour le LLM (requis)
references:                             # Declarations de references (optionnel, non utilise)
  - api-guide
  - examples
---

# Instructions Markdown completes

Le contenu apres le frontmatter constitue le "prompt expert"
injecte dans la conversation quand la skill est chargee.

## Workflow
1. Lire le fichier de config...
2. Executer scripts/deploy.py...
3. Verifier le resultat...
```

### 2.3 Schema Zod

```typescript
// packages/opencode/src/skill/skill.ts
export const Info = z.object({
  name: z.string(),           // Identifiant unique
  description: z.string(),    // Description pour le LLM
  location: z.string(),       // Chemin absolu vers SKILL.md
  content: z.string(),        // Contenu markdown (body)
})
```

### 2.4 Parsing

- Utilise `gray-matter` (via `ConfigMarkdown.parse()`) pour extraire le frontmatter YAML
- Fallback sur un parser YAML permissif si le frontmatter est non-strict
- Les fichiers avec frontmatter invalide sont silencieusement ignores (log warning)
- Les noms dupliques emettent un warning mais le dernier charge gagne

---

## 3. Discovery — Sources et priorite

Le systeme scanne 5 sources de skills dans un ordre precis. Les sources chargees en dernier **ecrasent** celles chargees avant en cas de conflit de nom.

### 3.1 Ordre de chargement

```
PRIORITE BASSE ──────────────────────────────── PRIORITE HAUTE

1. Global externe     2. Projet externe     3. OpenCode natif     4. Config paths     5. URLs distantes
~/.claude/skills/     .claude/skills/       .opencode/skill/      config.skills.paths  config.skills.urls
~/.agents/skills/     .agents/skills/       .opencode/skills/
```

### 3.2 Detail par source

| # | Source | Pattern glob | Scope |
|---|--------|-------------|-------|
| 1 | `~/.claude/skills/**` / `~/.agents/skills/**` | `skills/**/SKILL.md` | Global user |
| 2 | `.claude/skills/**` / `.agents/skills/**` (walk up to worktree) | `skills/**/SKILL.md` | Projet |
| 3 | `.opencode/skill/` ou `.opencode/skills/` (config dirs) | `{skill,skills}/**/SKILL.md` | Projet OpenCode |
| 4 | Chemins custom dans `opencode.json` | `**/SKILL.md` | Custom |
| 5 | URLs distantes (fetch + cache local) | `**/SKILL.md` | Remote |

### 3.3 Compatibilite Claude Code

Les sources 1 et 2 (`.claude/skills/`) assurent la **compatibilite avec l'ecosysteme Claude Code**. Un utilisateur peut reutiliser ses skills Claude Code dans OpenCode sans modification.

Variable d'environnement `OPENCODE_DISABLE_EXTERNAL_SKILLS` pour desactiver les sources `.claude/` et `.agents/`.

### 3.4 Skills distantes (Discovery)

**Fichier** : `packages/opencode/src/skill/discovery.ts`

```
URL distante
    |
    +---> GET {url}/index.json
    |
    |     {
    |       "skills": [
    |         { "name": "...", "description": "...", "files": ["SKILL.md", ...] }
    |       ]
    |     }
    |
    +---> Pour chaque skill :
    |       GET {url}/{name}/{file} pour chaque fichier
    |       Stocke dans ~/.cache/opencode/skills/{name}/
    |
    +---> Retourne les chemins locaux des skills telechargees
```

- Cache local dans `Global.Path.cache/skills/`
- Pas de mecanisme de refresh/invalidation (si le fichier existe en cache, il n'est pas re-telecharge)
- Pas de verification d'integrite (hash, signature)

### 3.5 Cache et lifecycle

- Tout le state est memoize par Instance via `Instance.state()`
- Le scan est effectue une seule fois par lifecycle d'instance
- Pas de hot-reload : il faut redemarrer pour detecter de nouvelles skills

---

## 4. Invocation — Flow complet

### 4.1 Declenchement

Deux modes :
1. **Explicite** : l'utilisateur tape `/skill-name` ou selectionne dans le dialog TUI
2. **Implicite** : l'agent LLM decide spontanement d'appeler le tool `skill` en se basant sur la description dans le system prompt

### 4.2 System prompt

Les skills disponibles sont injectees dans le system prompt de chaque agent :

```xml
Skills provide specialized instructions and workflows for specific tasks.
Use the skill tool to load a skill when a task matches its description.

<available_skills>
  <skill>
    <name>deploy-helper</name>
    <description>Automate deployment workflows...</description>
    <location>file:///path/to/skill/SKILL.md</location>
  </skill>
</available_skills>
```

Le filtrage se fait via `Skill.available(agent)` qui evalue les permissions de l'agent.

### 4.3 Execution du tool

```typescript
// packages/opencode/src/tool/skill.ts
SkillTool.execute({ name: "deploy-helper" }, ctx)
```

**Etapes** :
1. `Skill.get(name)` — recupere la skill depuis le cache
2. `ctx.ask({ permission: "skill", patterns: [name] })` — verifie la permission
3. Scan du dossier avec Ripgrep (max 10 fichiers, exclut SKILL.md)
4. Construction de l'output XML

### 4.4 Output injecte

```xml
<skill_content name="deploy-helper">
# Skill: deploy-helper

[Contenu markdown complet du SKILL.md]

Base directory for this skill: file:///Users/.../skills/deploy-helper
Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.
Note: file list is sampled.

<skill_files>
<file>/path/to/skill/scripts/deploy.py</file>
<file>/path/to/skill/references/api.md</file>
<file>/path/to/skill/templates/config.yaml</file>
</skill_files>
</skill_content>
```

---

## 5. Execution des ressources de skill

### 5.1 Modele architectural

```
             Skill = CONTEXTE (passif)
                      |
                      v
             Agent LLM = DECISION (actif)
                      |
                      v
             Tools standard = EXECUTION
             - BashTool   (scripts)
             - ReadTool   (fichiers)
             - EditTool   (modifications)
             - WriteTool  (creation)
```

**Il n'existe aucun mecanisme d'execution propre aux skills.** L'agent LLM interprete les instructions du SKILL.md et utilise les tools standard pour agir.

### 5.2 Execution d'un script Python (exemple concret)

```
1. Skill chargee → agent voit "scripts/deploy.py" dans <skill_files>
2. Agent lit les instructions markdown
3. Agent appelle BashTool({ command: "python scripts/deploy.py", workdir: "/path/to/skill" })
4. BashTool :
   a. Parse la commande avec Tree-Sitter (AST bash)
   b. Extrait les commandes individuelles
   c. Permission check "bash" → demande/auto-allow selon config
   d. Permission check "external_directory" si hors du projet
   e. spawn("python scripts/deploy.py", { shell: true, cwd: ... })
   f. stdout/stderr captures → renvoyes a l'agent
5. Agent analyse le resultat et continue
```

### 5.3 Lecture de references

```
1. Agent voit "references/api.md" dans <skill_files>
2. Agent appelle ReadTool({ path: "/path/to/skill/references/api.md" })
3. ReadTool retourne le contenu
4. Agent integre les informations dans son raisonnement
```

---

## 6. Securite et permissions

### 6.1 Couches de protection

```
Couche 1 : Permission "skill"
  → Autoriser/refuser le chargement d'une skill par nom
  → Config : permission.skill dans opencode.json

Couche 2 : Whitelist dossier skill
  → Les dossiers de skills sont auto-ajoutes a external_directory
  → Permet la lecture sans permission supplementaire

Couche 3 : Permissions standard des tools
  → bash : chaque commande soumise au systeme de permission
  → edit/write : permission par pattern de chemin
  → external_directory : acces hors projet
```

### 6.2 Ce qui est protege

| Action | Protection |
|--------|-----------|
| Charger une skill | Permission "skill" (allow/deny/ask) |
| Lire un fichier de la skill | Auto-whitelist du dossier |
| Executer un script | Permission "bash" standard |
| Modifier un fichier hors projet | Permission "external_directory" |

### 6.3 Ce qui N'EST PAS protege

- **Aucun sandboxing** : les scripts s'executent dans le meme contexte process
- **Aucune isolation** : pas de Docker, chroot, ou namespace
- **Aucune verification d'integrite** pour les skills distantes (pas de hash/signature)
- **Aucune limite de ressources** sur les scripts executes (sauf timeout bash 2min)
- **Confiance implicite** dans le contenu du SKILL.md (injection de prompt possible)
- **Le champ `references` du frontmatter est declare mais non utilise dans le code**

### 6.4 Vecteurs de risque

1. **Skill malveillante locale** : un SKILL.md dans `.claude/skills/` pourrait instruire l'agent d'executer des commandes dangereuses
2. **Skill distante compromise** : pas de verification d'integrite sur les URLs
3. **Prompt injection** : le contenu du SKILL.md est injecte tel quel dans la conversation
4. **Directory traversal** : les chemins dans les instructions ne sont pas sanitizes

---

## 7. Configuration

### 7.1 opencode.json

```jsonc
{
  // Chemins supplementaires pour scanner des skills
  "skills": {
    "paths": ["./custom-skills", "~/shared-skills"],
    "urls": ["https://skills.example.com/"]
  },

  // Permissions par skill
  "permission": {
    "skill": {
      "deploy-*": "allow",     // Auto-allow toutes les skills deploy-*
      "dangerous-*": "deny",   // Bloquer
      "*": "ask"               // Demander pour le reste
    }
  }
}
```

### 7.2 Permissions agent

```typescript
// Dans la definition d'un agent custom
{
  name: "safe-agent",
  permission: [
    { permission: "skill", pattern: "read-only-*", action: "allow" },
    { permission: "skill", pattern: "*", action: "deny" },
    { permission: "bash", pattern: "*", action: "deny" }
  ]
}
```

---

## 8. Interface utilisateur

### 8.1 TUI Dialog

**Fichier** : `src/cli/cmd/tui/component/dialog-skill.tsx`

- Dialog searchable avec liste de skills
- Affiche : nom + premiere ligne de description
- Appel API : `GET /skill` → `Skill.Info[]`

### 8.2 API Server

| Route | Methode | Description |
|-------|---------|-------------|
| `/skill` | GET | Liste toutes les skills disponibles |

### 8.3 Debug CLI

```bash
opencode debug skill    # JSON dump de toutes les skills
```

---

## 9. Fichiers source cles

| Fichier | Responsabilite |
|---------|---------------|
| `src/skill/skill.ts` | API principale, discovery, cache, formatage |
| `src/skill/discovery.ts` | Telechargement et cache des skills distantes |
| `src/tool/skill.ts` | Tool d'invocation (charge + injecte la skill) |
| `src/session/system.ts` | Injection dans le system prompt |
| `src/agent/agent.ts` | Filtrage par permissions agent, whitelist dossiers |
| `src/permission/next.ts` | Systeme de permissions (evaluate, ask, reply) |
| `src/tool/bash.ts` | Execution des scripts references (spawn + Tree-Sitter) |
| `src/config/config.ts` | Schema config skills (paths, urls) |
| `src/config/markdown.ts` | Parsing du frontmatter YAML |
| `src/cli/cmd/tui/component/dialog-skill.tsx` | UI de selection |
| `test/skill/skill.test.ts` | Tests de discovery |
| `test/tool/skill.test.ts` | Tests du tool |

---

## 10. Limites et opportunites

### Limites actuelles

1. **Pas de hot-reload** — redemarrage necessaire pour detecter de nouvelles skills
2. **Champ `references` non utilise** — declare dans le schema mais sans effet
3. **Max 10 fichiers listes** — skills avec beaucoup de ressources sont tronquees
4. **Pas de versioning** — aucun mecanisme de version pour les skills
5. **Cache distant sans invalidation** — une fois telecharge, jamais rafraichi
6. **Aucun sandboxing** — modele "trust the LLM + trust the user"
7. **Pas de composition** — une skill ne peut pas en appeler une autre
8. **Pas de parametrage** — une skill ne prend pas d'arguments

### Opportunites d'evolution

1. **Skills parametrees** — passer des arguments au chargement
2. **Composition de skills** — chainer ou heriter entre skills
3. **Sandbox optionnel** — executer les scripts dans un conteneur
4. **Signatures** — verifier l'integrite des skills distantes
5. **Hot-reload** — watcher sur les dossiers de skills
6. **Metriques** — tracker l'usage et l'efficacite des skills
7. **Marketplace** — registry centralise de skills communautaires

---

## Annexe A : Diagramme de sequence complet

```
User              TUI/CLI           SkillTool         Skill.state()       BashTool          Permission
  |                  |                  |                  |                  |                  |
  |-- /deploy ------>|                  |                  |                  |                  |
  |                  |-- execute ------>|                  |                  |                  |
  |                  |                  |-- get("deploy")->|                  |                  |
  |                  |                  |<-- skill info ---|                  |                  |
  |                  |                  |                  |                  |                  |
  |                  |                  |-- ask(skill) ----|------------------|----------------->|
  |                  |                  |<-- allow --------|------------------|------------------|
  |                  |                  |                  |                  |                  |
  |                  |                  |-- ripgrep files->|                  |                  |
  |                  |                  |<-- file list ----|                  |                  |
  |                  |                  |                  |                  |                  |
  |                  |<-- XML output ---|                  |                  |                  |
  |                  |                  |                  |                  |                  |
  |                  |  [Agent LLM lit les instructions et decide d'executer un script]         |
  |                  |                  |                  |                  |                  |
  |                  |-- bash("python scripts/deploy.py") |---------------->|                  |
  |                  |                  |                  |                  |-- ask(bash) ---->|
  |<---------------------------------------------------------[permission prompt]---------------|
  |-- allow -------->|                  |                  |                  |                  |
  |                  |                  |                  |                  |<-- allow --------|
  |                  |                  |                  |                  |-- spawn() ------>|
  |                  |<-- output -------|------------------|------------------|                  |
  |                  |                  |                  |                  |                  |
```
