---
name: cruchot-push-main
description: "Use when Romain wants to push to main. Triggers: /cruchot-push-main. Récupère tous les changements, met a jour la documentation si necessaire, et push sur main. Pipeline complete : docs → commit → pull → push."
model: sonnet
context: fork
user-invocable: true
---

# /cruchot-push-main - Cruchot Push Main

Pipeline de commit + push sur `main` avec mise a jour documentaire automatique.

---

## Etape 0 : Déplacer les documents de Superpower (git ignoré)

Liste les fichiers issus de **superpower**, commit ou pas du dossier `docs/specs`et `docs/plan`

Pour chaque fichier, les déplacer vers le dossier `_internal/specs` et `_internal/plans`

---

## Etape 1 : Mettre a jour la documentation

### 1.1 Evaluer le besoin

Analyser tous les fichiers modifies (staged + unstaged + untracked) via `git status` et `git diff`.

Pour chaque changement significatif, verifier si la documentation existante doit etre mise a jour.

Fichiers de documentation a verifier :
- `documentations/tech/` : les fichiers techniques
- `documentations/user/` : les guides utilisateur
- `documentations/README.md` : le sommaire (seulement si ajout/suppression de fichier de doc)

### 1.2 Regles de mise a jour

- **Feature UI** : mettre a jour le guide utilisateur concerne
- **Feature technique** (tools, security, DB) : mettre a jour le fichier tech concerne
- **Fix/improvement mineur** : PAS de mise a jour doc (sauf si ca change un comportement documente)
- **Nouveau concept majeur** : creer un nouveau fichier si aucun existant ne couvre le sujet, et mettre a jour `documentations/README.md`

### 1.3 Style documentation

- Tech : factuel, precis, avec noms de fichiers et patterns de code
- User : accessible, oriente usage, pas de jargon interne
- Garder la structure existante de chaque fichier (ne pas reorganiser)
- Ajouter du contenu, ne pas supprimer l'existant sauf s'il est devenu faux

---

## Etape 2 : Commit + Push

### 2.1 Commit

1. Stager TOUS les fichiers modifies : `git add -A`
2. Generer un message de commit concis (1-2 lignes) qui resume les changements
3. Committer

### 2.2 Pull + Push

1. `git pull --rebase origin main` pour recuperer les derniers changements
2. Resoudre les conflits si necessaire
3. `git push origin main`

---

## Etape 3 : Resume final

Afficher :

```
Update complete !
Docs : N fichiers mis a jour (ou "aucun changement")

+-----+-----------------------------------------------------------+---------------------------+
|  #  |                        Document                           |         Comments          |
+-----+-----------------------------------------------------------+---------------------------+
| 1   | documentations/tech/01-CORE_ARCHITECTURE.md                |                           |
+-----+-----------------------------------------------------------+---------------------------+
| 2   | documentations/tech/03-DATA_AND_VECTOR_STORAGE.md          |                           |
+-----+-----------------------------------------------------------+---------------------------+
| 3   | documentations/user/USING_SKILLS_AND_MCP.md                |                           |
+-----+-----------------------------------------------------------+---------------------------+
```

Le tableau ne contient que les fichiers effectivement modifies. Si aucun fichier doc n'a ete modifie, afficher "Aucun changement de documentation necessaire".

---

## Etape 4 : Mettre a jour la memoire

Mettre a jour les fichiers memoire du projet si les changements le justifient :
- `.memory/architecture.md` : si changement d'architecture ou nouveau module
- `.memory/key-files.md` : si nouveau fichier cle ajoute
- `.memory/patterns.md` : si nouveau pattern ou convention
- `.memory/gotchas.md` : si nouveau piege decouvert
- Memoire persistante Claude (`~/.claude/projects/.../memory/`) : si info utile pour les futures sessions
