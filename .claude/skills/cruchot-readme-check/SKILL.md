---
name: cruchot-readme-check
description: "Audit le README.md du projet contre les standards GitHub 2026 (piliers du notebook f082fb0c). Verifie la coherence cross-channels entre README, landing page, package.json, registry.ts et .memory/. Triggers: /cruchot-readme-check. Invocable seul OU automatiquement via cruchot-push-main / cruchot-release."
model: sonnet
context: fork
user-invocable: true
---

# Cruchot README Check

Audit multi-dimension du `README.md` contre les standards GitHub 2026 identifies dans le notebook `f082fb0c` (Analyse des meilleures pratiques README sur GitHub, rapport dedie `43b80b64`).

Le skill produit un verdict **PASS / WARN / FAIL** avec :
- Liste des checks structurels ratés (sections manquantes, badges absents)
- Liste des incoherences semantiques (chiffres qui drift entre README / landing / source code)
- Diff suggere pour chaque probleme (sans l'appliquer — c'est a Romain de valider)
- Exit-code-blocking si FAIL (bloque le pipeline push/release si l'appelant check le code retour)

---

## Phase 0 : Lecture des sources de verite

Charger les fichiers suivants en parallele (pas de dependance entre eux) :

1. `README.md` — cible de l'audit
2. `package.json` — version, electron, ai sdk, typescript
3. `src/main/llm/registry.ts` — liste des providers (count exact)
4. `.memory/architecture.md` — chiffres tables, preload, pipeline etages
5. `.memory/key-files.md` — pour detecter les chemins qui changent
6. `CHANGELOG.md` — derniere version published

Pour la landing, ne PAS fetch a chaque run (evite les requetes reseau inutiles). A la place, lire un cache local eventuel a `_internal/cache/landing-snapshot.json` qui stocke les 4 chiffres cles du hero stats (providers, tools, local, serveur). Si le cache a plus de 7 jours OU n'existe pas, fetcher `https://cruchot.romain-ecarnot.com` via WebFetch avec prompt cible "Extrait les 4 stats du hero banner (providers, outils, local, serveur)".

**Ne JAMAIS modifier les fichiers lus.** Ce skill est READ-ONLY.

---

## Phase 1 : Checks STRUCTURELS (hard)

Verifier la presence des elements obligatoires du notebook. Chaque check retourne `PASS` ou `FAIL`.

### 1.1 Header

- [ ] Logo en top (`<picture>` tag ou `<img>` centre)
- [ ] Tagline courte en `<p align="center">` (pas en blockquote `>`)
- [ ] **Badges hero line** : au minimum 5 badges parmi release, CI, license, electron, typescript, security, website
- [ ] Badge **Security score** present (differenciateur Cruchot)
- [ ] Badge **Website** pointant vers `cruchot.romain-ecarnot.com`

### 1.2 Navigation

- [ ] **Hero CTA** avec au moins 3 ancres (site web, telecharger, fonctionnalites/changelog)
- [ ] **Table des matieres** (`## Table des matieres`) avec au minimum 8 ancres vers les sections principales

### 1.3 Sections obligatoires

- [ ] `## Pourquoi Cruchot ?` — section motivation
- [ ] `## Quick Start` — commande d'installation visible sans scroll
- [ ] `## Stack` — tableau des technos
- [ ] `## Installation & Init` — detail dev local
- [ ] `## Architecture` — diagramme Mermaid OU ASCII (minimum)
- [ ] `## Fonctionnalites` — liste exhaustive
- [ ] `## Securite` — politique de securite (ou lien SECURITY.md)
- [ ] `## Contribuer` — lien CONTRIBUTING.md + CODE_OF_CONDUCT.md
- [ ] `## Licence` — lien LICENSE (pas juste "MIT" en texte)

### 1.4 Fichiers satellites obligatoires

- [ ] `CONTRIBUTING.md` existe a la racine
- [ ] `CODE_OF_CONDUCT.md` existe a la racine
- [ ] `SECURITY.md` existe a la racine
- [ ] `LICENSE` existe a la racine (pas `LICENSE.md`, juste `LICENSE`)
- [ ] `CHANGELOG.md` existe a la racine
- [ ] `.github/ISSUE_TEMPLATE/bug_report.yml` existe
- [ ] `.github/ISSUE_TEMPLATE/feature_request.yml` existe
- [ ] `.github/ISSUE_TEMPLATE/config.yml` existe
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` existe

---

## Phase 2 : Checks SEMANTIQUES (coherence cross-channels)

Les chiffres doivent etre coherents entre le README, le code source, la memoire, et la landing. Un drift = WARN (pas FAIL — c'est rattrapable).

### 2.1 Providers count

Sources :
- **Verite** : `src/main/llm/registry.ts` → compter les entrees de `PROVIDERS`
- README : chercher les mentions `(\d+)\s+providers` et `(\d+)\s+providers IA`
- `.memory/architecture.md` ligne 6 : pattern `(\d+) providers`
- Landing (cache ou fetch) : stats hero bar

Tous les chiffres doivent etre **egaux**. Si drift, rapporter chaque source avec son count.

### 2.2 Tables Drizzle count

Sources :
- **Verite** : `src/main/db/schema.ts` → compter les `sqliteTable(` calls
- README : chercher `(\d+)\s+tables`
- `.memory/architecture.md` : pattern `(\d+) tables`

### 2.3 Preload methods count

Sources :
- **Verite** : `tests/e2e/security/preload-allowlist.spec.ts-snapshots/window-api-keys-darwin.txt` → `wc -l`
- README : chercher `(\d+)\s+methodes`
- `.memory/architecture.md` : pattern `(\d+) methodes`

### 2.4 Versions critiques

Sources :
- **Verite** : `package.json` → `version`, `dependencies.electron`, `dependencies.ai`, `devDependencies.typescript`
- README badges : extraire les versions des badges shields.io
- `.memory/architecture.md` : premiere ligne du bloc Stack

Checks :
- Electron major version dans README == major de `package.json` (ex: README "Electron 41" == pkg "^41.1.1")
- TypeScript version dans README == pkg
- AI SDK version dans README == pkg

### 2.5 Pipeline securite etages

Sources :
- **Verite** : `.memory/architecture.md` ligne avec "Pipeline securite X etages"
- README : chercher `Pipeline securite (\d+) etages`

---

## Phase 3 : Rapport final

Format de sortie (a afficher a l'utilisateur) :

```
╭─────────────────────────────────────────────────────────╮
│  Cruchot README Check — Rapport d'audit                 │
╰─────────────────────────────────────────────────────────╯

Verdict : [PASS | WARN | FAIL]

Phase 1 — Checks structurels (X/Y)
  ✓ Header complet avec badges
  ✓ Hero CTA present
  ✓ Table des matieres (10 ancres)
  ✗ Section "Quick Start" manquante
  ...

Phase 2 — Coherence cross-channels
  ✓ Providers : 11 (registry.ts) == 11 (README) == 11 (memory) == 11 (landing)
  ⚠ Tables : 31 (schema.ts) != 28 (README ligne 90)
  ✓ Preload methods : 295 (snapshot) == 295 (README)
  ...

Diff suggere :
  README.md ligne 90 : "(28 tables)" → "(31 tables)"

Actions recommandees :
  1. Ajouter la section ## Quick Start apres "Pourquoi Cruchot ?"
  2. Fix le drift Tables dans README.md
```

**Regles de verdict** :
- **PASS** : Phase 1 complete (tous les checks structurels OK) ET Phase 2 sans drift
- **WARN** : Phase 1 complete MAIS Phase 2 avec 1-3 drifts mineurs (chiffres)
- **FAIL** : Phase 1 incomplete (au moins 1 section obligatoire manquante) OU Phase 2 avec drift majeur (version Electron qui change, provider add/remove non reporte)

**Exit code** :
- PASS → exit 0
- WARN → exit 0 (affiche warnings mais ne bloque pas)
- FAIL → exit 1 (bloque le pipeline appelant)

---

## Integration dans les autres skills

Ce skill est concu pour etre invocable **seul** par Romain (`/cruchot-readme-check`) OU **automatiquement** depuis d'autres skills :

### Depuis `cruchot-push-main`

Ajouter une etape 1.5 entre "Mettre a jour la documentation" et "Commit + Push" :

```
### Etape 1.5 : Verifier le README

Invoquer `/cruchot-readme-check` en sous-processus.
- Si FAIL → STOP avec le rapport complet. Demander a Romain de fixer avant de re-push.
- Si WARN → afficher les warnings mais continuer.
- Si PASS → continuer silencieusement.
```

### Depuis `cruchot-release`

Ajouter une etape 2.0 juste avant "Etape 2 : Pre-checks" :

```
### Etape 2.0 : README audit (bloquant)

Invoquer `/cruchot-readme-check`. Une release rend le README public sur la page Releases GitHub — il DOIT etre aux standards.
- Si FAIL → STOP avec message "README non-conforme. Fix d'abord, puis relance /cruchot-release."
- Si WARN → demander confirmation a Romain avant de continuer.
- Si PASS → continuer.
```

---

## Notes d'implementation

### Performance

L'audit doit rester rapide (~10s max). Les optimisations :
- Phase 0 : reads en parallele via `Read` multiple dans un seul message
- Phase 1 : grep patterns compiles une seule fois
- Phase 2 : compter via `grep -c` plutot que lire fichier entier quand possible
- Landing : cache 7 jours dans `_internal/cache/landing-snapshot.json`

### Extensions futures

Candidats a ajouter plus tard (ne pas inclure maintenant) :
- Check des liens morts (lien interne vers section inexistante, lien externe 404)
- Check de l'age du dernier commit sur README.md (warning si > 60 jours sans update)
- Check de la presence d'un GIF animé ou screenshot dans `resources/` / `assets/`
- Check que la description du repo (`gh repo view`) matche la tagline du README

### Gotcha : ancres GitHub

Les ancres generées par GitHub depuis les headers markdown sont :
- Lowercase
- Espaces → tirets
- Caractères speciaux → strippés (sauf `-`)
- Accents → conserves ou strippés selon le cas (tester au runtime)

Pour `## Pourquoi Cruchot ?` l'ancre est `#pourquoi-cruchot-` (le `?` disparait, le trailing space devient un `-`).

Pour valider les ancres de la TOC, les comparer avec la liste des H2/H3 trouves en grep sur le README, en appliquant la meme normalisation.
