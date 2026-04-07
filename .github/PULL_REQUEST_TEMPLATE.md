<!--
Merci pour cette contribution ! Avant de soumettre la PR, verifie les points ci-dessous.
Pour les WIP, ouvre la PR en Draft plutot que de la laisser en etat incomplet.
-->

## Resume

<!-- Decris en 1-2 phrases ce que fait cette PR. Pourquoi est-elle necessaire ? -->

## Type de changement

<!-- Coche les cases qui s'appliquent -->

- [ ] `feat` — Nouvelle fonctionnalite
- [ ] `fix` — Correction de bug
- [ ] `docs` — Documentation uniquement
- [ ] `refactor` — Refactoring sans changement fonctionnel
- [ ] `test` — Ajout ou modification de tests
- [ ] `chore` / `deps` — Maintenance (deps, config, tooling)
- [ ] `perf` — Amelioration de performance
- [ ] `security` — Correction de vulnerabilite
- [ ] `ci` — Modifications CI/CD
- [ ] Breaking change (non retro-compatible)

## Issue liee

<!-- Fixes #123 / Refs #456 / Closes #789 -->

## Description detaillee

<!-- Detaille le "pourquoi" et le "comment". Qu'est-ce qui change techniquement ? -->

## Captures d'ecran / GIF (si UI)

<!-- Avant / apres si tu modifies l'UI. Enleve cette section si non-applicable. -->

## Checklist

### Tests et qualite

- [ ] `npm run typecheck` passe sans erreur
- [ ] `npm run lint` passe sans erreur
- [ ] `npm run test` passe (251 tests Vitest)
- [ ] `npm run test:e2e:security` passe (22 tests Playwright)
- [ ] Si je touche au chat/compact/tools/memory/export : `npm run test:e2e:flows` passe (Ollama requis)
- [ ] J'ai ajoute des tests pour les nouveaux comportements (si applicable)

### Documentation

- [ ] CHANGELOG.md mis a jour si user-facing change
- [ ] README.md mis a jour si architecture, features ou commandes changent
- [ ] `.memory/` (architecture, patterns, gotchas, key-files) mis a jour si changement structurel
- [ ] Commentaires de code ajoutes uniquement ou la logique n'est pas evidente

### Securite

- [ ] Aucune cle API ou secret n'est committe
- [ ] Les handlers IPC nouveaux/modifies valident les payloads avec Zod
- [ ] Si je touche aux tools LLM (bash, file, web), j'ai verifie le pipeline de securite
- [ ] Si je touche a l'IPC preload, j'ai mis a jour le snapshot Playwright `preload-allowlist.spec.ts`
- [ ] J'ai lu [SECURITY.md](../blob/main/SECURITY.md) et mon changement ne l'enfreint pas

### Conventions projet

- [ ] Mes commits suivent les [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] J'ai respecte les [standards de code](../blob/main/CONTRIBUTING.md#standards-de-code)
- [ ] J'ai utilise `trash` au lieu de `rm` pour toute suppression de fichier (convention macOS)
