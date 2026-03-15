# Distribution — Multi-LLM Desktop

> Guide complet : packaging, signature, notarisation, releases, mises a jour automatiques.

---

## Table des matieres

1. [Vue d'ensemble du pipeline](#1-vue-densemble-du-pipeline)
2. [Pre-requis](#2-pre-requis)
3. [Icones de l'application](#3-icones-de-lapplication)
4. [Signature de code](#4-signature-de-code)
5. [Notarisation macOS](#5-notarisation-macos)
6. [Configuration electron-builder](#6-configuration-electron-builder)
7. [Scripts npm](#7-scripts-npm)
8. [Auto-updater (electron-updater)](#8-auto-updater-electron-updater)
9. [Premiere release manuelle](#9-premiere-release-manuelle)
10. [CI/CD — GitHub Actions](#10-cicd--github-actions)
11. [Workflow de release](#11-workflow-de-release)
12. [Checklist pre-release](#12-checklist-pre-release)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Vue d'ensemble du pipeline

```
Code source
  |
  v
npm run build          # electron-vite compile main + preload + renderer
  |
  v
npm run dist:mac       # electron-builder package + signe + notarise
  |                      → Multi-LLM Desktop-0.2.0.dmg
  |                      → Multi-LLM Desktop-0.2.0-mac.zip
  |                      → latest-mac.yml (manifest auto-update)
  v
GitHub Release          # gh release create + upload artifacts
  |
  v
electron-updater       # L'app detecte la nouvelle version → telecharge → installe
```

**Flux simplifie :**
- En local : `npm run dist:mac` pour tester le packaging
- En CI : le workflow GitHub Actions build + signe + publie automatiquement quand tu push un tag `v*`

---

## 2. Pre-requis

### Comptes et certificats

| Quoi | Pourquoi | Comment l'obtenir |
|------|----------|-------------------|
| **Apple Developer Account** (99$/an) | Signature + notarisation macOS | [developer.apple.com/programs](https://developer.apple.com/programs/) |
| **Certificat "Developer ID Application"** | Signer le .app pour distribution hors App Store | Xcode > Settings > Accounts > Manage Certificates |
| **App-specific password** Apple | Notarisation (API Apple) | [appleid.apple.com](https://appleid.apple.com/) > Securite > Mots de passe d'apps |
| **GitHub repo** (deja fait) | Heberger les releases + auto-update | `eRom/cruchot` |
| **GitHub Personal Access Token** | CI publie les releases | Settings > Developer settings > Tokens > `repo` scope |

### Certificat Windows (optionnel pour commencer)

Pour Windows, sans certificat EV, les utilisateurs verront "Windows a protege votre ordinateur" (SmartScreen). Ca disparait progressivement avec la reputation du binaire.

Options :
- **Gratuit** : pas de signature → warning SmartScreen (acceptable pour usage prive/beta)
- **OV certificate** (~200-400$/an) : SignTool, SmartScreen warning reduit
- **EV certificate** (~400-600$/an) : SmartScreen bypass immediat (cle USB hardware requise)

### Outils locaux

```bash
# Verifier que Xcode CLI tools sont installes
xcode-select --install

# Verifier les certificats disponibles
security find-identity -v -p codesigning

# Installer electron-builder globalement (optionnel, utile pour debug)
npm install -g electron-builder
```

---

## 3. Icones de l'application

electron-builder attend des icones dans `resources/` :

```
resources/
  icon.icns          # macOS (1024x1024, format Apple Icon)
  icon.ico           # Windows (256x256, format ICO multi-resolution)
  icon.png           # Linux + source (1024x1024 PNG)
  entitlements.mac.plist   # (deja present)
```

### Generer les icones

Partir d'un PNG 1024x1024 (idealement avec transparence) :

```bash
# macOS .icns — via iconutil (outil natif Apple)
mkdir icon.iconset
sips -z 16 16     icon-1024.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon-1024.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon-1024.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon-1024.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon-1024.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon-1024.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon-1024.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o resources/icon.icns

# Windows .ico — via ImageMagick (brew install imagemagick)
magick icon-1024.png -define icon:auto-resize=256,128,64,48,32,16 resources/icon.ico

# Linux — copier le PNG directement
cp icon-1024.png resources/icon.png
```

> **Alternative rapide** : des outils en ligne comme [iConvert Icons](https://iconverticons.com/) ou [CloudConvert](https://cloudconvert.com/) font la conversion PNG → ICNS/ICO.

---

## 4. Signature de code

### macOS — automatique via electron-builder

electron-builder detecte automatiquement le certificat dans le Keychain. Il faut juste que le certificat "Developer ID Application" soit installe.

**Variables d'environnement (optionnelles si certificat dans le Keychain) :**

```bash
# Si plusieurs certificats, forcer le bon :
export CSC_NAME="Developer ID Application: Romain (TEAMID)"

# Pour CI (certificat exporte en .p12) :
export CSC_LINK="base64-encoded-p12-file"
export CSC_KEY_PASSWORD="mot-de-passe-du-p12"
```

**Verifier que ca marche :**
```bash
# Lister les identites de signature
security find-identity -v -p codesigning

# Devrait afficher quelque chose comme :
# 1) ABC123... "Developer ID Application: Romain (TEAMID)"
```

### Windows — via SignTool

Si tu as un certificat Windows :

```yaml
# electron-builder.yml — ajouter :
win:
  certificateFile: path/to/cert.pfx
  certificatePassword: ${WIN_CSC_KEY_PASSWORD}
  # OU pour EV (hardware token) :
  # signingHashAlgorithms: [sha256]
  # sign: ./scripts/custom-sign.js
```

### Sans certificat (dev/beta)

Pour tester le packaging sans signature :

```bash
# Desactiver la signature temporairement
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run dist:mac
```

---

## 5. Notarisation macOS

Depuis macOS 10.15 (Catalina), Apple exige que les apps distribuees hors App Store soient **notarisees**. Sans notarisation, Gatekeeper bloque l'ouverture avec "impossible de verifier le developpeur".

### Configuration

La notarisation est integree a electron-builder via `@electron/notarize`. electron-builder l'appelle automatiquement si les variables sont definies.

**Variables d'environnement requises :**

```bash
# Methode recommandee : App Store Connect API Key (plus fiable que Apple ID)
export APPLE_API_KEY="path/to/AuthKey_XXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# OU methode classique (Apple ID + app-specific password) :
export APPLE_ID="ton@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID"
```

**Dans electron-builder.yml, ajouter :**

```yaml
mac:
  notarize: true     # Active la notarisation automatique
```

> **Attention** : la notarisation prend 1-5 minutes (Apple analyse le binaire cote serveur). C'est normal que le build soit plus long.

### Methode API Key (recommandee)

1. Aller sur [App Store Connect > Users and Access > Keys](https://appstoreconnect.apple.com/access/api)
2. Creer une cle API avec le role "Developer"
3. Telecharger le fichier `.p8` (une seule fois !)
4. Noter le Key ID et l'Issuer ID

### Verifier la notarisation

```bash
# Apres le build, verifier que le DMG est notarise :
spctl -a -vvv -t install dist/Multi-LLM\ Desktop-0.2.0.dmg

# Verifier le .app dans le DMG :
spctl -a -vvv dist/mac-arm64/Multi-LLM\ Desktop.app
# Doit afficher : "source=Notarized Developer ID"
```

---

## 6. Configuration electron-builder

Le fichier `electron-builder.yml` actuel est deja bien structure. Voici la version enrichie avec notarisation et auto-update :

```yaml
# electron-builder.yml
appId: com.multiLLM.desktop
productName: Multi-LLM Desktop
copyright: Copyright (c) 2026 Romain

directories:
  buildResources: resources
  output: dist

files:
  - "out/**/*"
  - "!node_modules"

# --- macOS ---
mac:
  category: public.app-category.developer-tools
  icon: resources/icon.icns
  target:
    - target: dmg
      arch: [universal]       # Intel + Apple Silicon en un seul binaire
    - target: zip
      arch: [universal]       # Le ZIP est requis pour l'auto-updater macOS
  hardenedRuntime: true
  gatekeeperAssess: false
  notarize: true              # Notarisation automatique
  entitlements: resources/entitlements.mac.plist
  entitlementsInherit: resources/entitlements.mac.plist

# --- Windows ---
win:
  target:
    - nsis
  icon: resources/icon.ico

# --- Linux ---
linux:
  target:
    - AppImage
    - deb
  category: Development
  icon: resources

# --- Installeur Windows ---
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false    # Garder les donnees utilisateur (DB, cles)

# --- DMG macOS ---
dmg:
  contents:
    - x: 130
      y: 220
    - x: 410
      y: 220
      type: link
      path: /Applications

# --- Auto-update via GitHub Releases ---
publish:
  provider: github
  owner: eRom
  repo: cruchot

# --- Fichiers supplementaires ---
extraResources:
  - from: "drizzle"
    to: "drizzle"
```

### Points importants

- **`target: universal`** (macOS) : genere un binaire compatible Intel ET Apple Silicon. Le build est plus lent (~2x) mais un seul DMG a distribuer.
- **`zip` obligatoire** pour macOS auto-update : `electron-updater` telecharge le ZIP, pas le DMG.
- **`publish: github`** : electron-builder genere automatiquement `latest-mac.yml`, `latest.yml` (Windows), `latest-linux.yml` dans le dossier `dist/`. Ces fichiers manifestes sont lus par l'auto-updater.

---

## 7. Scripts npm

Ajouter ces scripts dans `package.json` :

```json
{
  "scripts": {
    "dist": "electron-vite build && electron-builder",
    "dist:mac": "electron-vite build && electron-builder --mac",
    "dist:win": "electron-vite build && electron-builder --win",
    "dist:linux": "electron-vite build && electron-builder --linux",
    "dist:publish": "electron-vite build && electron-builder --mac --win --linux --publish always",
    "release": "npm version patch && git push && git push --tags"
  }
}
```

| Script | Usage |
|--------|-------|
| `npm run dist` | Build + package toutes les plateformes (selon l'OS courant) |
| `npm run dist:mac` | Build + package macOS uniquement (.dmg + .zip) |
| `npm run dist:win` | Build + package Windows (.exe NSIS) |
| `npm run dist:linux` | Build + package Linux (.AppImage + .deb) |
| `npm run dist:publish` | Build + package + publie sur GitHub Releases |
| `npm run release` | Bump version + push + tag (declenche le workflow CI) |

> **Note** : le cross-compilation est limitee. Pour generer un `.exe` Windows depuis macOS, il faut Wine ou un runner CI Windows. Le plus simple est de builder chaque OS dans son propre runner CI.

---

## 8. Auto-updater (electron-updater)

`electron-updater` est deja installe. Il faut l'integrer dans le main process.

### Fonctionnement

```
App demarre
  → autoUpdater.checkForUpdates()
  → Lit latest-mac.yml sur GitHub Releases
  → Compare version locale vs remote
  → Si nouvelle version :
      → Telecharge le .zip (macOS) ou .exe (Windows)
      → Notifie l'utilisateur
      → L'utilisateur choisit quand installer (quit & install)
```

### Implementation dans le main process

Creer `src/main/services/updater.service.ts` :

```typescript
import { autoUpdater } from 'electron-updater'
import { BrowserWindow, dialog } from 'electron'
import log from 'electron-log'

// electron-updater utilise electron-log par defaut
autoUpdater.logger = log

// Ne PAS telecharger automatiquement — laisser l'utilisateur choisir
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // Verifier au demarrage (apres un delai pour ne pas bloquer le lancement)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silencieux — pas de reseau, pas de release, etc.
    })
  }, 10_000) // 10 secondes apres le lancement

  // Verifier periodiquement (toutes les 4 heures)
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {})
    },
    4 * 60 * 60 * 1000
  )

  // --- Evenements ---

  autoUpdater.on('update-available', (info) => {
    // Notifier le renderer (pour afficher un badge/notification dans l'UI)
    mainWindow.webContents.send('updater:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    })

    // OU dialog natif simple :
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Mise a jour disponible',
        message: `La version ${info.version} est disponible. Telecharger maintenant ?`,
        buttons: ['Telecharger', 'Plus tard'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate()
        }
      })
  })

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Mise a jour prete',
        message: `La version ${info.version} a ete telechargee. Redemarrer pour installer ?`,
        buttons: ['Redemarrer', 'Plus tard'],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err)
    // Ne PAS afficher d'erreur a l'utilisateur — c'est normal si pas de reseau
  })
}
```

### Integrer dans index.ts

```typescript
// src/main/index.ts — dans app.whenReady()
import { initAutoUpdater } from './services/updater.service'

app.whenReady().then(() => {
  const mainWindow = createWindow()
  // ... autres inits ...

  // Auto-updater (uniquement en production)
  if (app.isPackaged) {
    initAutoUpdater(mainWindow)
  }
})
```

### Tester l'auto-updater en dev

L'auto-updater ne fonctionne PAS en mode dev (`electron-vite dev`). Pour tester :

```bash
# 1. Builder l'app
npm run dist:mac

# 2. Lancer le build
open dist/mac-arm64/Multi-LLM\ Desktop.app

# 3. L'app verifie les updates sur GitHub Releases
#    Pour tester sans publier, utiliser un serveur local :
#    autoUpdater.setFeedURL({ provider: 'generic', url: 'http://localhost:8080' })
```

---

## 9. Premiere release manuelle

Etape par etape pour ta premiere release :

### 1. Verifier la version

```bash
# Voir la version actuelle
node -p "require('./package.json').version"
# → 0.1.1

# Bumper la version
npm version 0.2.0 --no-git-tag-version
# OU pour un patch :
npm version patch --no-git-tag-version
```

### 2. Builder localement (sans signature pour tester)

```bash
# Desactiver la signature pour un premier test
export CSC_IDENTITY_AUTO_DISCOVERY=false

# Builder
npm run dist:mac

# Les artifacts sont dans dist/ :
ls dist/
# Multi-LLM Desktop-0.2.0-arm64.dmg
# Multi-LLM Desktop-0.2.0-arm64-mac.zip
# latest-mac.yml
```

### 3. Tester le DMG

```bash
# Monter le DMG
open dist/Multi-LLM\ Desktop-0.2.0-arm64.dmg

# Glisser dans Applications, lancer, verifier que tout marche
# Surtout : DB, cles API, workspace, MCP
```

### 4. Builder avec signature (quand certificat pret)

```bash
# Sans variable = detection auto du certificat dans le Keychain
# Avec notarisation :
export APPLE_API_KEY="~/AuthKey_XXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

npm run dist:mac
# → Build + signature + notarisation (2-5 min de plus)
```

### 5. Publier sur GitHub

```bash
# Creer un tag
git tag v0.2.0
git push origin v0.2.0

# Creer la release avec les artifacts
gh release create v0.2.0 \
  --title "v0.2.0" \
  --notes "Premiere release publique" \
  dist/Multi-LLM\ Desktop-0.2.0*.dmg \
  dist/Multi-LLM\ Desktop-0.2.0*-mac.zip \
  dist/latest-mac.yml
```

> **Important** : il faut uploader `latest-mac.yml` (et `latest.yml` pour Windows) — c'est le manifeste que `electron-updater` lit pour detecter les nouvelles versions.

---

## 10. CI/CD — GitHub Actions

Workflow automatise : push un tag `v*` → build sur 3 OS → publie la release.

Creer `.github/workflows/release.yml` :

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write    # Pour creer la release GitHub

jobs:
  release:
    strategy:
      matrix:
        include:
          - os: macos-latest
            platform: mac
          # - os: windows-latest     # Decommenter quand pret
          #   platform: win
          # - os: ubuntu-latest      # Decommenter quand pret
          #   platform: linux

    runs-on: ${{ matrix.os }}
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npx tsc --noEmit -p tsconfig.json

      - name: Build & Package (macOS)
        if: matrix.platform == 'mac'
        env:
          # Signature
          CSC_LINK: ${{ secrets.MAC_CERTIFICATE_P12_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTIFICATE_PASSWORD }}
          # Notarisation
          APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
          APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
          # Publication
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run dist:mac -- --publish always

      - name: Build & Package (Windows)
        if: matrix.platform == 'win'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run dist:win -- --publish always

      - name: Build & Package (Linux)
        if: matrix.platform == 'linux'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npm run dist:linux -- --publish always
```

### Secrets GitHub a configurer

Dans le repo > Settings > Secrets and variables > Actions :

| Secret | Contenu |
|--------|---------|
| `MAC_CERTIFICATE_P12_BASE64` | Certificat .p12 encode en base64 (voir ci-dessous) |
| `MAC_CERTIFICATE_PASSWORD` | Mot de passe du .p12 |
| `APPLE_API_KEY` | Contenu du fichier .p8 (pas le chemin) |
| `APPLE_API_KEY_ID` | Key ID App Store Connect |
| `APPLE_API_ISSUER` | Issuer ID App Store Connect |

### Exporter le certificat en base64 pour CI

```bash
# 1. Exporter depuis Keychain Access :
#    Keychain Access > Certificats > "Developer ID Application: ..."
#    Clic droit > Exporter > format .p12 > choisir un mot de passe

# 2. Encoder en base64 :
base64 -i certificate.p12 -o certificate-base64.txt

# 3. Copier le contenu dans le secret GitHub MAC_CERTIFICATE_P12_BASE64
cat certificate-base64.txt | pbcopy
```

---

## 11. Workflow de release

### Processus recommande

```
1. Developper sur une branche feature
2. Merger dans main
3. Bumper la version :
     npm version patch    # 0.2.0 → 0.2.1 (bugfix)
     npm version minor    # 0.2.1 → 0.3.0 (feature)
     npm version major    # 0.3.0 → 1.0.0 (breaking)
4. Pusher le tag :
     git push && git push --tags
5. Le workflow CI build + signe + notarise + publie
6. Les utilisateurs recoivent la notification de mise a jour
```

### Versioning (SemVer)

| Type | Quand | Exemple |
|------|-------|---------|
| **patch** (0.2.x) | Bugfix, correction mineure | Fix crash au lancement |
| **minor** (0.x.0) | Nouvelle feature, compatible | Ajout export PDF |
| **major** (x.0.0) | Breaking change | Migration DB, nouvelle UI |

### Releases pre-production

Pour tester avec des beta-testeurs avant la release publique :

```bash
# Creer une pre-release
npm version 0.3.0-beta.1 --no-git-tag-version
# ... build et publier comme draft sur GitHub

gh release create v0.3.0-beta.1 \
  --title "v0.3.0-beta.1" \
  --prerelease \
  --notes "Beta : nouveau systeme de export" \
  dist/*.dmg dist/*.zip dist/latest-mac.yml
```

Pour que l'auto-updater ignore les pre-releases :

```typescript
// updater.service.ts
autoUpdater.allowPrerelease = false  // defaut, seules les releases stables
```

---

## 12. Checklist pre-release

Avant chaque release, verifier :

### Code
- [ ] `npm run typecheck` passe
- [ ] `npm run lint` passe
- [ ] `npm run test` passe
- [ ] Pas de `console.log` oublies dans le code
- [ ] Version bumpee dans `package.json`

### Build
- [ ] `npm run build` reussit sans erreur
- [ ] `npm run dist:mac` genere le DMG et le ZIP
- [ ] Le DMG s'ouvre et l'app se lance
- [ ] La DB se cree correctement (premiere install)
- [ ] Les migrations fonctionnent (upgrade depuis version precedente)
- [ ] Les cles API sont conservees apres mise a jour

### Securite
- [ ] Le binaire est signe (`codesign -dv --verbose=4 dist/mac-arm64/*.app`)
- [ ] Le binaire est notarise (`spctl -a -vvv dist/mac-arm64/*.app`)
- [ ] Les entitlements sont corrects

### Release
- [ ] Release notes redigees
- [ ] Tag git cree et pushe
- [ ] Artifacts uploades sur GitHub Releases
- [ ] `latest-mac.yml` present dans la release
- [ ] L'auto-updater detecte la nouvelle version (tester depuis l'ancienne)

---

## 13. Troubleshooting

### "App endommagee" / "Impossible de verifier le developpeur"

**Cause** : l'app n'est pas signee ou pas notarisee.

```bash
# Verifier la signature
codesign -dv --verbose=4 /Applications/Multi-LLM\ Desktop.app

# Verifier la notarisation
spctl -a -vvv /Applications/Multi-LLM\ Desktop.app

# Contournement temporaire (pour l'utilisateur) :
xattr -cr /Applications/Multi-LLM\ Desktop.app
```

### electron-builder ne trouve pas le certificat

```bash
# Lister les certificats de signature
security find-identity -v -p codesigning

# Si vide, le certificat n'est pas dans le Keychain
# Reimporter le .p12 :
security import certificate.p12 -k ~/Library/Keychains/login.keychain-db -P "password" -T /usr/bin/codesign
```

### L'auto-updater ne detecte pas les mises a jour

1. Verifier que `latest-mac.yml` est dans la GitHub Release
2. Verifier que la release n'est pas en draft (doit etre publiee)
3. Verifier que la version dans `latest-mac.yml` est superieure a la version locale
4. Verifier les logs : `~/Library/Logs/Multi-LLM Desktop/main.log`

### better-sqlite3 ne se compile pas pour la bonne arch

```bash
# Rebuild les modules natifs pour l'arch cible
npx electron-rebuild -f -w better-sqlite3

# OU dans electron-builder.yml :
# electronDownload:
#   mirror: https://npmmirror.com/mirrors/electron/
```

### Le DMG est trop gros

```yaml
# electron-builder.yml — compresser davantage :
mac:
  target:
    - target: dmg
      arch: [arm64]    # Au lieu de universal (divise la taille par ~2)
```

Taille attendue : ~150-250 MB (Electron + node_modules + better-sqlite3).

### Windows SmartScreen bloque l'installeur

Sans certificat EV, c'est normal. Options :
- Signer avec un certificat OV (le warning diminue avec le temps)
- Distribuer via un site web connu (ameliore la reputation)
- Instruire les utilisateurs : "Plus d'informations" > "Executer quand meme"

---

## Annexe — Structure des artifacts

Apres `npm run dist:mac`, le dossier `dist/` contient :

```
dist/
  mac-arm64/                              # App non compressée (pour tests)
    Multi-LLM Desktop.app/
  Multi-LLM Desktop-0.2.0-arm64.dmg      # Installeur macOS
  Multi-LLM Desktop-0.2.0-arm64-mac.zip  # Pour auto-updater
  latest-mac.yml                          # Manifeste auto-update
  builder-effective-config.yaml           # Config electron-builder resolue
```

Le `latest-mac.yml` ressemble a :

```yaml
version: 0.2.0
files:
  - url: Multi-LLM Desktop-0.2.0-arm64-mac.zip
    sha512: abc123...
    size: 180000000
path: Multi-LLM Desktop-0.2.0-arm64-mac.zip
sha512: abc123...
releaseDate: '2026-03-11T12:00:00.000Z'
```
