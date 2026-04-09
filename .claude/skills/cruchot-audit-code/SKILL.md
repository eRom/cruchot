---
name: cruchot-audit-code
description: "Audit code complet Cruchot — typecheck, lint, tests, patterns dangereux, coherence IPC. A lancer IMPERATIVEMENT apres chaque feature, fix, ou avant un commit. Ne pas skipper. Triggers: /cruchot-audit-code"
model: sonnet
context: fork
user-invocable: true
---

# Cruchot Code Audit

Audit de qualite code pour le projet Cruchot (Electron + React + TypeScript). Detecte les erreurs de compilation, lint, tests casses, patterns dangereux, et incoherences IPC entre les 3 couches Electron.

---

## PROCEDURE

Execute les 6 etapes dans l'ordre. Ne saute AUCUNE etape. Collecte tous les findings dans un rapport final.

### Etape 1 — TypeScript typecheck

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm
npx tsc --noEmit 2>&1 | tail -100
```

Si des erreurs sortent, les lister toutes. Si plus de 20 erreurs, grouper par fichier.

### Etape 2 — ESLint

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm
npm run lint 2>&1 | tail -100
```

Lister les erreurs (pas les warnings sauf si elles indiquent un vrai probleme).

### Etape 3 — Vitest

```bash
cd /Users/recarnot/dev/claude-desktop-multi-llm
npm run test -- --bail 2>&1 | tail -80
```

`--bail` arrete au premier echec. Si un test echoue, analyser la cause racine (import casse, mock perime, schema DB change).

### Etape 4 — Patterns dangereux

Chercher dans les fichiers modifies recemment (git diff) ET dans l'ensemble du code source les patterns suivants :

#### 4a. Missing awaits
Chercher les appels async sans await qui pourraient causer des bugs silencieux :
```
grep -rn "ipcMain.handle" src/main/ | grep -v "async"
```
Verifier aussi les fonctions async appelees sans await dans les handlers IPC.

#### 4b. Broken imports
Chercher les imports qui pointent vers des fichiers inexistants :
```bash
# Verifier les imports relatifs dans les fichiers modifies
git diff --name-only HEAD~5 | grep '\.tsx\?$' | head -20
```
Pour chaque fichier modifie, verifier que ses imports resolvent correctement.

#### 4c. Dead code
Chercher les exports non utilises dans les fichiers modifies recemment :
- Fonctions exportees jamais importees ailleurs
- Variables exportees jamais referencees
- Types/interfaces exportes jamais utilises

#### 4d. Infinite re-render loops
Pattern critique : `useEffect` sans deps (ou avec deps instables) qui appelle un setter de state :
```
grep -rn "useEffect" src/renderer/src/ | grep -v node_modules
```
Pour chaque useEffect trouve, verifier :
- Pas de `setState` dans un useEffect sans tableau de dependances
- Pas de creation d'objet/array inline dans les deps (reference instable)
- Pas de listener IPC sans cleanup dans le return

#### 4e. IPC listener leaks
Chercher les `window.api.on*` ou `ipcRenderer.on` sans cleanup correspondant :
```
grep -rn "window\.api\.on" src/renderer/src/ --include="*.tsx" --include="*.ts"
```
Chaque `on` doit avoir un `off` ou `removeAllListeners` dans le cleanup du useEffect.

### Etape 5 — Coherence IPC (3 couches)

Verifier l'alignement entre les 3 couches Electron :

#### 5a. Extraire les handlers main (ipcMain.handle)
```bash
grep -rn "ipcMain.handle\|ipcMain.on" src/main/ipc/ --include="*.ts" | grep -oP "'[^']+'" | sort -u
```

#### 5b. Extraire les methodes preload exposees
```bash
grep -rn "invoke\|send\|on(" src/preload/index.ts | grep -oP "'[^']+'" | sort -u
```

#### 5c. Comparer les deux listes
- Handlers main sans methode preload correspondante = handler mort ou oubli preload
- Methodes preload sans handler main = appel qui va echouer silencieusement
- Verifier que les noms de canaux IPC matchent exactement (typo = crash silencieux)

#### 5d. Verifier les types renderer
Chercher dans `src/renderer/src/` les appels `window.api.*` et verifier qu'ils correspondent aux methodes exposees dans le preload.

### Etape 6 — Rapport final

Produire un rapport ASCII en bullet-points avec 6 sections :

```
====================================
  CRUCHOT CODE AUDIT — [date]
====================================

[1] TYPECHECK
    - OK (0 errors) | X errors found
    - Liste des erreurs critiques

[2] LINT
    - OK | X errors, Y warnings
    - Erreurs listees

[3] TESTS
    - OK (N passing) | FAIL (details)
    - Test(s) en echec + cause probable

[4] PATTERNS DANGEREUX
    - Missing awaits: ...
    - Broken imports: ...
    - Dead code: ...
    - Re-render loops: ...
    - IPC listener leaks: ...

[5] COHERENCE IPC
    - Handlers orphelins (main sans preload): ...
    - Preload orphelins (sans handler main): ...
    - Typos detectees: ...

[6] VERDICT
    - PASS | WARN (N issues mineures) | FAIL (N issues critiques)
    - Actions recommandees (classees par priorite)

====================================
```

## REGLES

- ASCII uniquement, pas d'emojis
- Ne pas modifier le code — audit READ-ONLY sauf si Romain demande explicitement de fixer
- Si une etape timeout ou echoue, la marquer comme SKIP avec la raison et continuer
- Utiliser `npm` (pas bun) pour les commandes projet (le package.json est configure pour npm)
- Grep : utiliser l'outil Grep integre, pas bash grep
- Le verdict FAIL bloque : recommander de fixer avant tout commit
- Toujours verifier les fichiers modifies recemment en priorite (git diff HEAD~5)
