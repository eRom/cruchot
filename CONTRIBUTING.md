# Contribuer a Cruchot

Merci de ton interet pour Cruchot ! Ce document decrit comment proposer des changements au projet.

## Code de conduite

Ce projet adopte le [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). En participant, tu t'engages a respecter ce code.

## Signaler une vulnerabilite de securite

**Ne pas ouvrir d'issue publique pour une vulnerabilite.** Voir [SECURITY.md](SECURITY.md) pour le processus de divulgation responsable.

## Workflow de contribution

1. **Fork** le depot sur GitHub
2. **Clone** ton fork localement :
   ```bash
   git clone https://github.com/<ton-user>/cruchot.git
   cd cruchot
   ```
3. **Installe** les dependances :
   ```bash
   npm install --legacy-peer-deps
   ./scripts/download-qdrant.sh
   ./scripts/prepare-models.sh
   ```
4. **Cree une branche** depuis `main` :
   ```bash
   git checkout -b feat/ma-fonctionnalite
   ```
5. **Implemente** tes changements en respectant les [standards](#standards-de-code)
6. **Teste** en local (voir [Tests](#tests))
7. **Commit** en suivant les [Conventional Commits](#conventional-commits)
8. **Push** sur ton fork et **ouvre une Pull Request**

Tous les detenteurs de PR sont encourages a regarder [les Good First Issues](https://github.com/eRom/cruchot/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) pour leurs premieres contributions.

## Standards de code

- **TypeScript strict** — pas de `any`, valide tous les types
- **ESLint** — respecte les regles du projet, `npm run lint` doit passer
- **Conventions de nommage** :
  - Fichiers : `kebab-case.ts`
  - Composants React : `PascalCase.tsx`
  - Stores Zustand : `[domaine].store.ts`
  - Handlers IPC : `[domaine].ipc.ts`
- **IPC** : toujours valider les payloads avec **Zod** cote main process, ne jamais exposer `ipcRenderer` au renderer
- **Cles API** : jamais dans le renderer, uniquement dans le main process via `safeStorage`
- **Base de donnees** : utiliser Drizzle ORM, les migrations via `drizzle-kit`
- **Langue** : l'UI est en francais par defaut, le code et commits en anglais
- **Suppression de fichiers** : preferer `trash` a `rm` (convention projet macOS)

## Tests

Cruchot utilise une strategie sablier en 3 couches :

```bash
npm run test                # Vitest — tests unitaires (~1.5s, 251 tests)
npm run test:e2e:security   # Playwright — E2E securite (~12s, 22 tests)
npm run test:e2e:flows      # Playwright — E2E flows (~1.4min, Ollama requis)
npm run test:all            # Les 3 couches en sequence
```

**Avant d'ouvrir une PR**, verifie que :

- [ ] `npm run typecheck` passe sans erreur
- [ ] `npm run lint` passe sans erreur
- [ ] `npm run test` passe (251 tests)
- [ ] `npm run test:e2e:security` passe (22 tests)
- [ ] Si tu touches au chat/compact/tools/memory/export : `npm run test:e2e:flows` passe (necessite Ollama + modele `qwen3.5:4b`)

## Conventional Commits

Les messages de commit suivent le format [Conventional Commits](https://www.conventionalcommits.org/) :

```
type(scope): description courte

Corps optionnel detaillant le pourquoi.

Refs #123
```

**Types utilises dans Cruchot** :

- `feat` : nouvelle fonctionnalite
- `fix` : correction de bug
- `docs` : documentation uniquement
- `refactor` : refactoring sans changement fonctionnel
- `test` : ajout ou modification de tests
- `chore` : maintenance (deps, config, tooling)
- `deps` : mise a jour de dependances
- `perf` : amelioration de performance
- `security` : correction de vulnerabilite
- `ci` : modifications CI/CD

**Exemples** :

```
feat(arena): add vote persistence with per-model stats
fix(bash-security): catch `&` background operator in check #4
docs(readme): add comparison table vs Msty/Jan/ChatBox
refactor(compact): extract CompactService from chat.ipc.ts
```

## Structure du projet

```
src/
  main/           # Electron main process (Node.js)
    ipc/          #   Handlers IPC par domaine (Zod validation)
    llm/          #   Routeur AI SDK, cost-calculator, tools, prompts
    db/           #   Schema Drizzle (31 tables), queries
    services/     #   Singletons metier (library, qdrant, git, mcp, remote...)
    live/         #   Architecture plugin voice (Gemini, OpenAI Realtime...)
  preload/        # Bridge IPC securise (contextBridge, 295 methodes)
  renderer/src/   # React 19 + Tailwind 4 + shadcn/ui
  remote-web/     # SPA standalone pour Remote Web
tests/
  e2e/            # Playwright security + flows
_internal/        # Specs et plans (gitignored)
audit/            # Rapports de securite
```

## Pull Request

Ta PR sera automatiquement soumise a :

- CI job `e2e-security` (Playwright macos-latest)
- CI job `security-gate` (npm audit, lockfile-lint, Dependabot check)
- Review manuelle

Merci d'utiliser le [PR template](.github/PULL_REQUEST_TEMPLATE.md) qui t'aide a ne rien oublier. Si ta PR est `Work in progress`, ouvre-la en Draft pour signaler qu'elle n'est pas prete a etre mergee.

## Questions ?

- **Discussions generales** : [GitHub Discussions](https://github.com/eRom/cruchot/discussions)
- **Bugs** : [GitHub Issues](https://github.com/eRom/cruchot/issues)
- **Securite** : voir [SECURITY.md](SECURITY.md)

Merci encore de contribuer a Cruchot !
