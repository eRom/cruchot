# /ship — Publier une version (docs + commit + release + memoire)

Pipeline complet de publication en une commande. Analyse les changements, met a jour la documentation, commit, push, release, et met a jour la memoire.

## Syntaxe

```
/ship              -> analyse automatique (minor si feature, patch sinon)
/ship patch        -> force patch
/ship minor        -> force minor
```

**REGLE ABSOLUE** : ne JAMAIS bump major sauf si Romain le demande explicitement avec `/ship major`.

---

## Etape 1 : Analyse des changements

### 1.1 Identifier le dernier tag

```bash
git tag --sort=-v:refname | head -1
```

### 1.2 Lister les commits depuis le dernier tag

```bash
git log <LAST_TAG>..HEAD --oneline --no-merges
```

### 1.3 Classifier les changements

Lis chaque commit et classe-le :
- **feature** : nouveau composant, nouvelle fonctionnalite, nouvelle UI
- **fix** : correction de bug, faux positif, regression
- **improvement** : refactor, perf, securite, cleanup, DX
- **docs** : documentation seule

### 1.4 Determiner le bump type

Si argument fourni (`patch`/`minor`) : utiliser tel quel.

Sinon, detection automatique :
- Si au moins 1 commit **feature** : `minor`
- Sinon (fix, improvement, docs uniquement) : `patch`

Afficher le verdict :

```
Changements depuis vX.Y.Z :
  - N features, N fixes, N improvements
  -> Bump : minor (raison : nouvelle feature X)
```

---

## Etape 2 : Mettre a jour README.md

### 2.1 Lire le README actuel

Lire `README.md` et localiser la section `## Updates`.

### 2.2 Generer la nouvelle entree

Creer une entree datee du jour au format existant :

```markdown
- JJ/MM/AAAA
  - **Nom feature/fix** : description concise en 1 ligne
  - **Autre changement** : description concise en 1 ligne
```

Regles :
- Date au format `JJ/MM/AAAA`
- Chaque bullet commence par un **nom en gras** suivi de `:` et description
- Style telegraphique, pas de phrases completes
- Regrouper les petits fixes en une seule ligne si < 3 mots chacun
- Si la date du jour existe deja en tete des Updates, FUSIONNER (ajouter les nouveaux items)
- Maximum 8 bullets par entree (regrouper si necessaire)

### 2.3 Inserer dans le README

Inserer la nouvelle entree juste apres `## Updates\n\n` (en premiere position).

---

## Etape 3 : Mettre a jour la documentation

### 3.1 Evaluer le besoin

Pour chaque changement significatif, verifier si la documentation existante doit etre mise a jour.

Fichiers a verifier :
- `documentations/tech/` : les 8 fichiers techniques
- `documentations/user/` : les 5 guides utilisateur
- `documentations/README.md` : le sommaire (seulement si ajout/suppression de fichier)

### 3.2 Regles de mise a jour

- **Feature UI** : mettre a jour le guide utilisateur concerne
- **Feature technique** (tools, security, DB) : mettre a jour le fichier tech concerne
- **Fix/improvement mineur** : PAS de mise a jour doc (sauf si ca change un comportement documente)
- **Nouveau concept majeur** : creer un nouveau fichier si aucun existant ne couvre le sujet, et mettre a jour `documentations/README.md`

### 3.3 Style documentation

- Tech : factuel, precis, avec noms de fichiers et patterns de code
- User : accessible, orient usage, pas de jargon interne
- Garder la structure existante de chaque fichier (ne pas reorganiser)
- Ajouter du contenu, ne pas supprimer l'existant sauf s'il est devenu faux

---

## Etape 4 : Commit & Push

### 4.1 Verifier qu'on est sur main

```bash
git branch --show-current
```

Si pas `main` : STOP. "Tu n'es pas sur main."

### 4.2 Stage les fichiers modifies

```bash
git add README.md documentations/
```

Ajouter aussi tout autre fichier modifie par les etapes precedentes.

### 4.3 Commit

Message au format :

- Si minor : `docs: mise a jour documentation et README post-<resume 3 mots>`
- Si patch : `docs: mise a jour documentation post-<resume 3 mots>`

```bash
git commit -m "$(cat <<'EOF'
docs: mise a jour documentation et README post-<resume>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 4.4 Push

```bash
git push
```

---

## Etape 5 : Release

Executer la skill `/release` avec le bump type determine en etape 1 :

```
/release <patch|minor>
```

Suivre le workflow complet de la skill release (pre-checks, npm version, push tags, CI, publish draft).

---

## Etape 6 : Mettre a jour la memoire

### 6.1 Memoire projet (.memory/)

Mettre a jour les 4 fichiers `.memory/` du projet via `/session-end` si des changements structurels ont eu lieu (nouvelle table, nouveau service, nouveau composant majeur).

Si seulement des fixes/improvements mineurs, SKIP cette etape.

### 6.2 Memoire Claude (memory/)

Mettre a jour `MEMORY.md` dans la memoire Claude du projet :
- Incrementer le numero de session si nouveau jour
- Ajouter un resume de 1-2 lignes de la session
- Mettre a jour la feature wishlist si des items ont ete completes

---

## Etape 7 : Resume final

Afficher :

```
Ship complete !
  Version : X.Y.Z -> X'.Y'.Z'
  Bump : <patch|minor>
  README : N entrees ajoutees
  Docs : N fichiers mis a jour (ou "aucun changement")
  Release : https://github.com/eRom/cruchot/releases/tag/vX'.Y'.Z'
  Memoire : mise a jour (ou "inchangee")
```

---

## Gestion d'erreurs

- **Rien a shipper** (0 commits depuis le dernier tag) : "Rien a shipper. Aucun commit depuis vX.Y.Z."
- **Working tree dirty avant debut** : proposer de commiter d'abord ou d'inclure les changements
- **Pas sur main** : STOP immediat
- **Push echoue** : STOP, afficher l'erreur
- **CI echoue** : afficher le lien, la release reste en draft
