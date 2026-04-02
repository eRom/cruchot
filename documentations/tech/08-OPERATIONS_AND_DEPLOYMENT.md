# Opérations, Déploiement et CI/CD

Ce document détaille comment Cruchot est packagé, mis à jour, et distribué aux utilisateurs finaux, ainsi que le déploiement de son extension Web distante.

## 1. Build et Packaging (Electron-Builder)

Le packaging de l'application desktop est géré par **`electron-builder`**, configuré via `electron-builder.yml`.

### 1.1 Cibles de Build
Cruchot est une application multi-plateformes :
- **macOS** : Cible `.dmg` et `.zip` avec compilation universelle (Universal Binary supportant `arm64` pour Apple Silicon et `x64` pour Intel).
- **Windows** : Cible `.exe` via un installeur NSIS (permettant de choisir le dossier d'installation).
- **Linux** : Cibles `.AppImage` (portable) et `.deb` (Debian/Ubuntu).

### 1.2 Ressources Embarquées (Extra Resources)
L'application dépend de binaires externes qui ne peuvent pas être bundlés par Webpack/Vite. `electron-builder` est configuré pour copier ces dossiers dans l'application finale (`extraResources`) :
- **Drizzle Migrations** (`drizzle/`) : Les schémas SQL pour initialiser la DB locale.
- **Qdrant Binaries** (`vendor/qdrant/`) : Les exécutables Qdrant natifs (macOS, Windows, Linux) filtrés par OS/Architecture.
- **Modèles Locaux** (`vendor/models/`) : Modèles d'embeddings ONNX si présents.

### 1.3 Dépendances Natives Exclues
Dans `electron.vite.config.ts`, les dépendances Node.js comportant des extensions natives (comme `better-sqlite3`, `onnxruntime-node`, `fsevents`) ou complexes à bundler (comme le Vercel AI SDK ou `@ai-sdk/mcp`) sont "externalisées" pour éviter des crashs à l'exécution.

## 2. Intégration et Déploiement Continus (CI/CD)

Le processus de release est entièrement automatisé via GitHub Actions (`.github/workflows/release.yml`).

### 2.1 Workflow de Release
1. **Déclencheur** : Pousser un tag Git commençant par `v*` (ex: `v0.6.1`).
2. **Qualité** : Exécution du typechecking (`tsc`) pour le Main et le Renderer, et d'un audit de sécurité npm (`npm audit --audit-level=critical`).
3. **Build Matrix** : Les machines GitHub Actions (macOS, Windows, Ubuntu) construisent l'application en parallèle.
4. **Publication** : Les binaires générés (`.dmg`, `.exe`, `.AppImage`) sont automatiquement uploadés en tant qu'assets de la Release GitHub correspondante.

## 3. Mises à jour Automatiques (Auto-Updater)

L'application intègre le module `electron-updater` (`src/main/services/updater.service.ts`).
- Au lancement (et périodiquement), l'application vérifie l'API GitHub Releases.
- Si une nouvelle version est trouvée, elle est téléchargée en tâche de fond.
- L'utilisateur est notifié et peut relancer l'application pour appliquer la mise à jour de manière transparente.

## 4. Déploiement du Client Remote Web (PWA)

Cruchot inclut un client Web distant (`src/remote-web/`) permettant de se connecter à l'instance Desktop locale (via WebSockets) depuis un téléphone ou un autre PC.

- **Stack** : C'est une application React autonome buildée via Vite.
- **Hébergement** : Elle est conçue pour être déployée sur **Vercel** (via `npm run deploy:web`).
- **Routage SPA** : Le fichier `vercel.json` est configuré avec un rewrite `/(.*) -> /index.html` pour supporter le routage côté client (Single Page Application fallback).
