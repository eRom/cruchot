---
name: cruchot-release
description: "Release Cruchot — pre-checks securite, CHANGELOG, bump version, tag, push et suivi CI GitHub Actions avec polling allege 30s. Triggers: /cruchot-release [patch|minor|major|X.Y.Z]"
model: sonnet
context: fork
user-invocable: true
---

# Cruchot Release Pipeline

Pipeline de release pour Cruchot : pre-checks de securite (tests, npm audit high+, lockfile-lint), generation CHANGELOG, bump version, tag git, push, et suivi CI optimise (polling allege a 30s pour respecter le rate limit GitHub, filtrage par SHA pour matcher le bon run).

Specificites Cruchot vs `/release` global :
- Utilise `npm` (pas bun)
- `npm audit --audit-level=high` (pas critical) + tolere les exceptions dev-only documentees dans `audit/security/POLICY.md`
- Lance `npm run lint:lockfile` en pre-check
- Filtre le RUN_ID GitHub Actions par `headSha` (fiable) au lieu de `--limit=1` (fragile si plusieurs releases s'enchainent)
- `gh run watch --interval 60 --exit-status` (30x moins de polls qu'avec le defaut 2s, ~7 polls pour un workflow de 7 min)
- **Publie le draft via `gh release edit --draft=false`** : malgre `--publish always`, electron-builder cree TOUJOURS la release en mode draft sur GitHub. Sans cette etape, la release reste invisible aux utilisateurs et l'auto-updater ne la voit pas.

---

## Argument

L'argument peut etre :
- (vide) ou `patch` : bump patch (defaut, ex: 0.9.1 → 0.9.2)
- `minor` : bump minor (ex: 0.9.1 → 0.10.0)
- `major` : bump major (ex: 0.9.1 → 1.0.0)
- `X.Y.Z` (ex: `0.9.2`) : version explicite (utile pour hot-fix ou correction de numerotation)

## Etape 1 : Determiner la version cible

1. Lire la version actuelle dans `package.json` (`.version`)
2. Selon l'argument :
   - Vide / `patch` → incrementer le patch
   - `minor` → incrementer le minor, reset patch
   - `major` → incrementer le major, reset minor + patch
   - Match `^[0-9]+\.[0-9]+\.[0-9]+$` → utiliser cette version directement
   - Sinon → STOP avec message d'erreur

Afficher :
```
Version actuelle : 0.9.1
Bump : patch -> 0.9.2
```

## Etape 2 : Pre-checks

Executer ces verifications dans l'ordre. Si l'une echoue, STOP avec message clair.

### 2.1 Repo git
```bash
git rev-parse --show-toplevel 2>/dev/null
```
Si echec : "Pas dans un repo git."

### 2.2 Branche main
```bash
git branch --show-current
```
Si la branche n'est pas `main` : "Tu n'es pas sur main (branche actuelle : X). Switch sur main avant de release."

### 2.3 Working tree clean
```bash
git status --porcelain
```
Si sortie non vide : "Working tree dirty. Commite ou stash tes changements avant de release." Afficher les fichiers modifies.

**Exception** : `tsconfig.node.tsbuildinfo` est un artefact tsc — si c'est le seul fichier modifie, faire `git checkout -- tsconfig.node.tsbuildinfo` et continuer.

### 2.4 Synchro avec remote
```bash
git fetch origin main
git rev-list HEAD..origin/main --count
```
Si count > 0 : "Main local est en retard sur origin. Fais un `git pull` avant de release."

### 2.5 Verification gh CLI
```bash
gh auth status
```
Si echec : "gh CLI non authentifie. Lance `gh auth login` d'abord."

### 2.6 Tests : 3 layers (vitest + E2E security + E2E flows)

```bash
npm test
npm run test:e2e:security
npm run test:e2e:flows
```

Cruchot a 3 couches de tests qui doivent toutes passer avant de tagger une release :

1. **`npm test`** : 251 tests vitest (10 suites, ~1.5s)
2. **`npm run test:e2e:security`** : 22 tests Playwright Electron security + 2 skipped (~12s)
3. **`npm run test:e2e:flows`** : 6 specs Playwright Electron flows sur Ollama qwen3.5:4b (~1.4 min)

**Total : ~2 min de pre-check pour 279 tests + 2 skipped.** Si l'un des 3 layers echoue : STOP. Afficher le resume des echecs et le message :

> "Les tests pre-release ne passent pas. Corrige les regressions avant de tagger."

**Pre-requis** : Ollama doit etre running avec qwen3.5:4b installe. Si Ollama est down, le script `scripts/test-e2e-setup.sh` (invoque par `test:e2e:flows`) detecte l'erreur et fail clean. Dans ce cas, STOP avec le message :

> "Ollama n'est pas demarre. Lance `ollama serve` (et verifie que `qwen3.5:4b` est installe via `ollama list`) avant de relancer la release."

**Pourquoi local-first et pas en CI** : un job CI `e2e-flows` aurait ajoute ~20 min d'attente sur chaque release et aurait coute ~$0.05 d'API gemini par run, sans valeur ajoutee mesurable (les meme tests tournent en local en 1.4 min sur Ollama). Le pre-check local du skill `cruchot-release` est la garantie que les flows passent avant chaque tag — meme protection, beaucoup plus rapide. Voir `_internal/plans/2026-04-06-test-strategy-phase2b2-ci-release.md` pour l'historique de la decision (Phase 2b2 PIVOT 2026-04-06).

### 2.7 Audit dependances (block sur high+)
```bash
npm audit --audit-level=high --omit=dev
```
- Si vulnerabilites **critical** ou **high** en PROD deps : STOP. "Vulnerabilites critiques detectees en production. Corrige-les avant de release. Voir audit/security/POLICY.md pour les exceptions documentees."
- Si vulnerabilites **moderate** ou **low** : avertir mais continuer.

**Note** : Cruchot a 3 exceptions dev-only documentees dans `audit/security/POLICY.md` (lodash via flatpak-bundler, esbuild via drizzle-kit). `--omit=dev` les exclut, donc cette commande devrait passer clean. Si elle remonte du high+, c'est un VRAI probleme (nouvelle CVE, ou regression de l'allowlist).

### 2.8 Lockfile-lint (registry + integrity + HTTPS)
```bash
npm run lint:lockfile
```
Verifie que toutes les deps viennent du registry npm officiel, en HTTPS, avec integrity hashes. Si echec : "Lockfile compromise — une dep vient d'un mirror non-officiel ou en HTTP. Investigue avant de release."

### 2.9 (Note) Le workflow CI re-fait la securite + builde

Le workflow `release.yml` a 2 jobs sequentiels :

1. **`security-gate`** : re-execute `npm audit --audit-level=high --omit=dev`, `lockfile-lint`, et verifie les Dependabot security PRs ouvertes via `gh pr list --jq 'test("^\\[Security\\]")'`
2. **`release`** matrix 3 OS (mac/win/linux) qui depend de `security-gate`

Donc une regression en securite cote CI bloque le build. Les pre-checks locaux (`npm test` + `npm run test:e2e:security` + `npm run test:e2e:flows` a l'etape 2.6) sont une **safety net** pour ne pas pousser un tag qui sera rejete par security-gate, ET pour ne pas pousser un tag avec une regression flow non detectee (les flows ne tournent QUE en local, pas en CI — voir etape 2.6 pour la rationale).

## Etape 3 : CHANGELOG.md

### 3.1 Verifier l'existence
Cruchot a deja un `CHANGELOG.md` au format Keep a Changelog. Ne pas le recreer s'il existe.

Si absent (peu probable), creer avec :
```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).
```

### 3.2 Generer l'entree de version
Collecter les commits depuis le dernier tag :
```bash
git log $(git describe --tags --abbrev=0 2>/dev/null)..HEAD --oneline --no-decorate
```

Inserer une nouvelle section **en haut du fichier**, juste apres l'en-tete :
```markdown
## [X.Y.Z] - YYYY-MM-DD

- commit subject 1
- commit subject 2
- ...
```

Format de date : ISO 8601 (`YYYY-MM-DD`), date du jour.

**Filtrage des commits** : ignorer les commits `chore(audit):` et `docs:` purement internes (ex: reorganisation de rapports). Garder tous les `security:`, `feat:`, `fix:`, `perf:`, `ui:`, `feat(skill):`. Si un commit `chore:` apporte une vraie valeur user (ex: dependabot config qui change le comportement), l'inclure.

## Etape 4 : Bump version + Commit

### 4.1 Bump manuel
Modifier la version dans :
- `package.json` (`"version": "X.Y.Z"`)
- `package-lock.json` (en haut, et dans `"packages": { "": { "version": "X.Y.Z" } }`)

Ne PAS utiliser `npm version` (qui auto-commite uniquement package.json et ne touche pas le CHANGELOG).

### 4.2 Commit de release
```bash
git add package.json package-lock.json CHANGELOG.md
git status  # verifier que tout est stage
git commit -m "release: vX.Y.Z"
```

### 4.3 Creer le tag annote
```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
```
(`-a` cree un tag annote, plus propre qu'un tag leger pour les releases)

### 4.4 Verification post-commit
```bash
git status
```
Si des fichiers ne sont pas commites : STOP et signaler.

## Etape 5 : Push

```bash
git push origin main
git push origin "vX.Y.Z"
```

Afficher :
```
Tag vX.Y.Z pousse. Workflow release.yml declenche.
```

## Etape 6 : Suivre le workflow CI (polling allege)

### 6.1 Attendre que le run soit visible
```bash
sleep 10
```
10 secondes pour laisser GitHub Actions enregistrer le tag push et creer le run dans la queue. Avec sleep 5 (le defaut global), on peut tomber sur LE PRECEDENT run et watcher le mauvais workflow.

### 6.2 Recuperer le RUN_ID par filtrage SHA (fiable)
```bash
HEAD_SHA=$(git rev-parse HEAD)
RUN_ID=$(gh run list --workflow=release.yml \
  --json databaseId,headSha,status \
  --jq ".[] | select(.headSha == \"$HEAD_SHA\") | .databaseId" \
  | head -1)
```

Si `$RUN_ID` est vide :
```bash
echo "Run pas encore visible, retry dans 15s..."
sleep 15
RUN_ID=$(gh run list --workflow=release.yml \
  --json databaseId,headSha \
  --jq ".[] | select(.headSha == \"$HEAD_SHA\") | .databaseId" \
  | head -1)
```

Si toujours vide apres le retry : STOP avec message "Le run n'est pas apparu dans gh run list. Verifier manuellement : https://github.com/eRom/cruchot/actions"

### 6.3 Watch avec polling 60s (30x moins de requetes qu'au defaut)
```bash
echo ""
echo "Workflow release.yml en cours (RUN_ID=$RUN_ID)..."
echo "Suivre en direct : https://github.com/eRom/cruchot/actions/runs/$RUN_ID"
echo ""

gh run watch "$RUN_ID" --interval 60 --exit-status
```

**Pourquoi 60s** : `gh run watch` poll par defaut toutes les **2 secondes**. Pour un workflow Cruchot qui prend ~7 min en matrix 3 OS + security-gate (release v0.9.2 mesuree : 6m51s), c'est ~210 requetes au defaut. A 60s on tombe a ~7 polls — meme experience utilisateur (l'utilisateur ne percoit pas la difference entre 2s et 60s en regardant un spinner), ~30x moins de rate limit consume. Si la CI grossit a 15 min un jour (gros refactor + plus de tests E2E), ca donnera ~15 polls — toujours raisonnable.

**`--exit-status`** : fait que `gh run watch` retourne un exit code non-zero si la CI echoue, ce qui simplifie le branchement OK/KO de l'etape 8.

## Etape 7 : Publier le draft (CRITIQUE — ne pas oublier)

`electron-builder --publish always` publie les artefacts (DMG, ZIP, blockmaps, latest-mac.yml, etc.) sur GitHub Releases mais cree la release en **mode draft**. Sans cette etape, la release reste invisible aux utilisateurs ET l'auto-updater (`electron-updater`) ne la voit pas — donc personne ne recoit l'update, malgre une CI verte.

```bash
# Verifier d'abord que la release est bien en draft (sanity check)
gh release view "vX.Y.Z" --json isDraft,name 2>/dev/null

# Publier le draft
gh release edit "vX.Y.Z" --draft=false
```

Si `gh release view` echoue avec "release not found" : c'est que l'URL temporaire generee par electron-builder est encore `untagged-<sha>` (pas encore renommee). Attendre 5-10 sec et retry.

Si `gh release edit` echoue : ne pas blocker la release — afficher le lien GitHub et demander a l'utilisateur de cliquer "Publish release" manuellement dans l'UI.

## Etape 8 : Resume final

Verifier le exit code de l'etape 6.3 ET que la release est bien publiee :

### Si succes (`gh run watch` exit 0 + draft publie)
```
Release vX.Y.Z publiee !
  Version : X.Y.Z
  Tag : vX.Y.Z
  Release : https://github.com/eRom/cruchot/releases/tag/vX.Y.Z
  CI : OK (security-gate + Mac + Win + Linux + audit-bundle + fuses verification)
  Tests locaux : <NN>/<NN>
  Draft : publie via `gh release edit --draft=false`
```

### Si echec (`gh run watch` exit non-zero)
```
Release vX.Y.Z echouee.
  Workflow : https://github.com/eRom/cruchot/actions/runs/<RUN_ID>
  Verifie les logs CI.
  Le tag vX.Y.Z est cree mais aucun artefact n'est publie.

Pour rollback :
  git tag -d vX.Y.Z
  git push origin :refs/tags/vX.Y.Z
```

## Erreurs courantes

- **Pas sur main** : afficher la branche actuelle, suggerer `git checkout main`
- **Working tree dirty** : lister les fichiers modifies. Si seul `tsconfig.node.tsbuildinfo` est modifie, faire `git checkout -- tsconfig.node.tsbuildinfo` et continuer
- **Remote en avance** : suggerer `git pull origin main`
- **gh non installe** : suggerer `brew install gh && gh auth login`
- **Tests echec** : afficher le resume des echecs Vitest
- **npm audit high+** : afficher les advisories. Si c'est une nouvelle CVE non documentee dans POLICY.md, **STOP**. Si c'est une regression de l'allowlist (ex: une dep qui etait dev-only devient prod), STOP aussi
- **Lockfile-lint fail** : signaler la dep qui pose probleme. C'est CRITIQUE — peut indiquer un mirror compromise
- **RUN_ID introuvable apres retry** : afficher le lien GitHub Actions pour suivi manuel
- **Workflow timeout (>30 min)** : afficher le lien et arreter le watch ; le tag est cree mais le suivi manuel est requis
- **security-gate fail cote CI** : c'est une Dependabot alert open en high+. Aller sur https://github.com/eRom/cruchot/security/dependabot, soit fix soit dismiss avec raison "Risk tolerable" si c'est une exception accepted (voir POLICY.md), puis re-trigger le workflow via `gh workflow run release.yml -F tag=vX.Y.Z`

## Quand ce skill est invoque

Demarre immediatement par l'Etape 1 (parsing de l'argument). Ne demande pas de confirmation entre les etapes — execute le pipeline complet jusqu'a l'Etape 7. Seules les **erreurs de pre-checks** (etape 2) provoquent un STOP avec message clair pour que l'utilisateur puisse corriger et relancer.
