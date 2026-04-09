---
name: cruchot-retro
description: "Rapport d'amelioration de productivite Claude Code, specifique au projet Cruchot. Analyse les sessions JSONL, croise avec MEMORY.md/CLAUDE.md/settings/skills, et produit 6 sections d'amelioration en terminal. Triggers: /cruchot-retro"
user-invocable: true
---

# /cruchot-retro — Rapport d'amelioration Cruchot

## Role

Tu es un **analyste de productivite**. Ton job : identifier les points de friction dans le workflow Claude Code sur le projet Cruchot, et proposer des ameliorations concretes (regles CLAUDE.md, skills, hooks, workflows, automatisations).

Tu ne felicites pas, tu ne resumes pas ce qui va bien. Tu cherches uniquement ce qui peut etre ameliore.

---

## Etape 1 : Extraction des donnees

Lance le script d'extraction :

```bash
python3 .claude/skills/cruchot-retro/scripts/retro-extract.py
```

Capture la sortie JSON. C'est ton **digest** — les metriques brutes de toutes les sessions.
La sortie contient :
- `meta` : nb sessions, date range, total messages
- `per_session` : detail par session (date, duree, tools, errors, friction)
- `aggregated` : top tools, erreurs, skills, friction totals, sessions high-friction

## Etape 2 : Lecture des sources de contexte

Lis ces fichiers pour croiser avec le digest :

1. `MEMORY.md` du projet Claude Code (dossier `.claude/projects/`) : parcours les sessions recentes, feedbacks, gotchas
2. `.memory/gotchas.md` dans le repo — pieges connus
3. `CLAUDE.md` du repo — regles actuelles
4. `.claude/settings.json` du repo — hooks et config actuels
5. Les settings globaux : `~/.claude/settings.json` — hooks globaux
6. Les skills existantes : `ls .claude/skills/` puis lire chaque `SKILL.md` (juste le frontmatter)

## Etape 3 : Analyse et affichage

Produis exactement **6 sections** dans le terminal. Format analytique froid : bullet points, chiffres, zero narration.

IMPORTANT : ASCII pur (pas d'emoji, pas d'unicode box-drawing). Utilise uniquement `=`, `-`, `|`, `+`, `*` pour la mise en forme.

### Format de sortie

```
=== CRUCHOT RETRO — Rapport d'amelioration ===
    {nb_sessions} sessions | {date_debut} -> {date_fin} | {total_msgs} messages user


--- [1] FRICTION ({nb_items} points identifies) ---

  ERREURS TOOLS ({total} detectees)
  - command_failed: {count} — {explication contextuelle, ex: "bash qui echoue souvent sur des commandes git ou build"}
  - write_before_read: {count} — {explication}
  - edit_failed: {count} — {explication}
  - file_not_found: {count} — {explication}
  - file_too_large: {count} — {explication}
  - user_rejected: {count} — {explication}

  RETRY LOOPS ({count} detectes)
  - Sessions concernees : {liste dates}
  - Pattern recurrent : {description du pattern si identifiable}

  PAINFUL EDITS (fichiers edites 4+ fois dans une session)
  - {filepath court} : {count}x — {contexte MEMORY.md si dispo}
  
  REVERTS ({count})
  - {description avec date}
  
  REDIRECTIONS ({count} messages < 5 chars apres longue reponse)
  - Interpretation : {ex: "l'utilisateur coupe court quand la reponse est hors-sujet ou trop longue"}

  TOP SESSIONS HIGH-FRICTION
  - {date} : score {N} — {resume du contexte via MEMORY.md}


--- [2] CLAUDE.MD GAPS ({nb_items} regles manquantes) ---

  Compare les frictions [1] avec les regles existantes dans CLAUDE.md.
  Pour chaque friction recurrente sans regle preventive :

  >> Section: ## {section suggeree}
  >> Regle: {texte exact copiable}
  >> Justification: {friction evitee, ref session}


--- [3] SKILLS A CREER ({nb_items}) ---

  Analyse les workflows manuels repetes dans l'historique.
  Pour chaque skill proposee :

  * /cruchot-{name}
    Declencheur : {quand l'utiliser}
    Ferait : {description 2-3 lignes}
    Friction evitee : {ref [1]}
    Frequence estimee : {nb de fois ou elle aurait servi}


--- [4] HOOKS A ACTIVER ({nb_items}) ---

  Analyse les verifications manuelles repetees.
  Pour chaque hook propose :

  * Event: {PreToolUse|PostToolUse|PreCommit|SessionStart|UserPromptSubmit|...}
    Matcher: {pattern si applicable}
    Command: {commande exacte}
    
    // Config copiable pour settings.json :
    {JSON exact a copier}
    
    Friction evitee : {ref [1]}


--- [5] WORKFLOWS A ESSAYER ({nb_items}) ---

  Croise les tools utilises (digest) avec les tools/features disponibles
  mais sous-utilises dans Claude Code.
  
  Pour chaque workflow :

  * {Nom du pattern}
    Actuellement : {ce que l'utilisateur fait manuellement}
    Alternative : {comment utiliser la feature CC}
    Prompt copiable : {si applicable}
    Gain estime : {economie en termes de friction evitee}


--- [6] SUR L'HORIZON ({nb_items}) ---

  Automatisations ambitieuses basees sur les patterns de friction
  les plus couteux.

  Pour chaque item :

  * {Titre}
    Probleme actuel : {friction + cout en sessions/temps}
    Solution possible : {description}
    Premiere etape : {action concrete pour demarrer}
    Pre-requis : {features CC necessaires}
```

## Regles d'analyse

### Friction -> CLAUDE.md gaps
Pour chaque pattern de friction dans le digest, demande : "une regle dans CLAUDE.md aurait-elle empeche ca ?"
- write_before_read errors -> regle "toujours lire avant d'ecrire" ?
- edit_failed -> regle "verifier l'unicite du contexte" ?
- command_failed -> regle "tester la syntaxe des commandes" ?

### Friction -> Skills
Un workflow manuel repete 3+ fois = candidat pour une skill.
Indices dans le digest : meme sequence de tools, meme pattern de skills_used.

### Friction -> Hooks
Une verification manuelle repetee = candidat pour un hook.
Indices : `tsc --noEmit` ou `npm test` dans les Bash calls, `git status` avant commit.

### Digest -> Workflows
Compare `top_tools` avec les outils CC disponibles. Si des outils puissants sont sous-utilises :
- WebSearch / WebFetch : pour la doc
- Agent en background : pour les taches longues
- EnterPlanMode : pour la planification
- TaskCreate/TaskUpdate : pour le tracking
- Hooks pre/post : pour l'automatisation

### MEMORY.md -> Horizon
Les sessions avec le plus de friction + les features les plus complexes dans MEMORY.md = candidates pour automatisation end-to-end.

## Regles de format

- ASCII pur, pas d'emoji, pas d'unicode box-drawing
- Bullet points, pas de paragraphes narratifs
- Chiffres quand possible (count, frequence, pourcentage)
- References aux sessions par date (pas par UUID)
- Croise avec MEMORY.md pour donner du contexte humain aux sessions high-friction
- Si une section n'a rien de pertinent (0 items), ne l'affiche pas
- Ne repete pas les frictions deja documentees ET resolues dans `.memory/gotchas.md`
- Les frictions documentees mais NON resolues dans gotchas meritent une mention
