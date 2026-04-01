<p align="center">
  <img src="resources/logo-cruchot.png" alt="Cruchot" width="200" />
</p>

> **Cruchot** : Tous vos LLMs, une seule interface. **Open source**, **gratuit** et **App 100% locale**.

App desktop locale de chat multi-LLM construite avec Electron. 11 providers, generation d'images, RAG custom, memoire semantique, workspace co-work, integration Git, controle a distance, et bien plus. Zero serveur backend, donnees 100% locales.

<p align="center">
  <img src="resources/infographie.png" alt="Infographie Cruchot" width="800" />
</p>

## Updates

- 01/04/2026
  - **Skills** : systeme de packs autonomes installables (GitHub, dossier local, Barda) au format Markdown + frontmatter YAML (compatible Claude Code). Scan de securite Maton integre (scanner Python + analyse contextuelle LLM). Invocation via `/skill-name` dans les conversations, injection dans le system prompt, execution de blocs shell via Seatbelt. UI complete dans Personnaliser > Skills.

- 22/03/2026
  - **Mode YOLO (Sandbox)** : execution autonome sandboxee — le LLM ecrit et execute du code dans un environnement confine (Seatbelt macOS), 5 outils (bash, createFile, readFile, listFiles, openPreview), reseau complet, confinement fichiers strict

- 21/03/2026
  - **Bardas (Gestion de Brigade)** : systeme de packs thematiques importables au format Markdown (.md) — roles, commandes, prompts, fragments, referentiels, MCP regroupes sous un namespace unique

- 20/03/2026
  - **Fork conversations** : dupliquer une conversation (historique et contexte)
  - **UI fixes** : Arena mode, etc.

- 15/03/2026
  - **Conversations favorites** : pin/star pour garder les conversations importantes en haut de la sidebar
  - **Prompt Optimizer** : amelioration automatique du prompt via LLM avant envoi (one-shot)
  - **Arena** : mode comparatif cote a cote pour evaluer 2 LLMs sur le meme prompt (streaming parallele, vote, metriques comparees, design VS Street Fighter)

## Stack

| Couche | Technologies |
|--------|-------------|
| Runtime | Electron 40 + Node.js 24 |
| Frontend | React 19 + TypeScript 5.7 + Tailwind CSS 4 + shadcn/ui |
| LLM | Vercel AI SDK 6 (`ai@^6`) |
| Database | SQLite (better-sqlite3) + Drizzle ORM + Qdrant (embedded) |
| Embeddings | `@huggingface/transformers` (ONNX) + Google Gemini 2 |
| State | Zustand |
| Build | electron-vite + electron-builder |

## Installation & Init

### Pre-requis

- **Node.js** >= 22 (recommande : 24.x)
- **npm** >= 10
- **macOS** 13+ (builds Windows/Linux possibles mais non testes)
- **Qdrant** binaire local (telecharge automatiquement via script)

### Setup

```bash
# Cloner le repo
git clone https://github.com/eRom/cruchot.git
cd cruchot

# Installer les dependances
npm install --legacy-peer-deps

# Telecharger le binaire Qdrant (memoire semantique + RAG)
./scripts/download-qdrant.sh

# Preparer les modeles ONNX pour l'embedding local
./scripts/prepare-models.sh

# Lancer en mode dev (HMR)
npm run dev
```

### Commandes

```bash
npm run dev           # Dev avec HMR (renderer) + hot restart (main)
npm run build         # Build production
npm run typecheck     # Verification des types (tsc --noEmit)
npm run lint          # ESLint
npm run test          # Vitest
npm run dist:mac      # Package macOS (DMG + ZIP)
npm run dev:web       # Dev SPA Remote Web (standalone)
```

### Configuration des cles API

Au premier lancement, l'assistant de bienvenue guide la configuration. Les cles API sont chiffrees via `safeStorage` (Keychain macOS) et ne transitent jamais par le renderer.

Providers supportes : OpenAI, Anthropic, Google, Mistral, xAI, DeepSeek, Alibaba, Perplexity, OpenRouter. Providers locaux (sans cle) : Ollama, LM Studio.

## Architecture

```
Renderer (React UI)  -->  contextBridge IPC  -->  Main (Node.js)
     sandbox              ~140 methodes              DB, APIs, secrets
```

L'app suit le modele de securite Electron strict : le renderer est sandbox, n'a aucun acces Node.js, et communique exclusivement via des methodes typees exposees par le preload.

```
src/
  main/           # Electron main process
    ipc/          #   Handlers IPC par domaine (Zod validation)
    llm/          #   Routeur AI SDK, cost-calculator, tools, prompts
    db/           #   Schema Drizzle (26 tables), queries
    services/     #   Singletons metier (library, qdrant, git, mcp, remote...)
  preload/        # Bridge IPC securise (contextBridge)
  renderer/src/   # React app
    components/   #   Composants par domaine
    stores/       #   Zustand stores
    hooks/        #   Custom hooks
  remote-web/     # SPA standalone pour Remote Web
```

## Fonctionnalites

### Chat Multi-Provider
- **11 providers** : OpenAI, Anthropic, Google, Mistral, xAI, DeepSeek, Alibaba, Perplexity, Ollama, LM Studio
- Streaming temps reel, historique illimite avec recherche full-text (FTS5)
- Mode Thinking/Reasoning (Anthropic, OpenAI, Google, xAI, DeepSeek)
- Annulation de stream en cours
- **Conversations favorites** : pin/star pour garder les conversations importantes en haut de la sidebar
- **Prompt Optimizer** : amelioration automatique du prompt via LLM avant envoi (one-shot)

### Arena (LLM vs LLM)
- Comparaison cote a cote de 2 modeles sur le meme prompt
- Streaming parallele des deux reponses simultanement
- Separateur VS anime (glow pulse pendant le streaming)
- Vote (gauche/droite/egalite) persiste en DB avec statistiques par modele
- Metriques comparees : tokens, cout, temps de reponse (coloration vert/rouge)
- Multi-rounds : continuer la conversation apres chaque vote
- Conversations arena identifiees dans la sidebar (icone Swords)

### Generation d'images
- 3 modeles : Gemini Flash, Gemini Pro, GPT Image
- Modèles d'OpenRouter spécifiques pour Image
- Selection d'aspect ratio, galerie avec apercu

### Workspace Co-Work
- Arborescence de fichiers interactive avec indicateurs Git (M/A/D/?)
- 4 outils IA : bash (terminal sandbox), readFile, writeFile, listFiles
- Detection de changements en temps reel (Chokidar)
- `@mention` de fichiers inline dans le textarea (autocomplete + overlay cyan)
- **Drag & drop de fichiers** depuis le Finder directement dans la zone de saisie (texte, code, documents)
- Auto-injection des fichiers de contexte (CLAUDE.md, README.md, etc.)

### Referentiels RAG Custom (Bibliothèques de connaissances)
- Import de documents (PDF, DOCX, Markdown, code, CSV, TXT) dans des referentiels thematiques
- Dual embedding : local (all-MiniLM-L6-v2, 384d) ou Google (gemini-embedding-2-preview, 768d)
- Retrieval automatique sticky par conversation (Qdrant, cosine similarity)
- Section "Sources utilisees" deterministe sous les reponses
- Vue CRUD complete avec progress bar d'indexation

### Memoire Semantique
- Rappel automatique des conversations passees via recherche vectorielle locale
- Qdrant embedded (binaire Rust local), embeddings ONNX CPU
- Ingestion fire-and-forget, recall silencieux dans le system prompt
- Zero cloud — tout tourne en local

### MCP (Model Context Protocol)
- Connexion a des serveurs MCP externes (stdio, HTTP, SSE)
- Variables d'environnement chiffrees, scope par projet
- Outils MCP fusionnes avec les workspace tools dans le chat

### Remote access
- Telegram
  - Controle a distance depuis un smartphone via Telegram Bot API
  - Triple verrou : token chiffre + code pairing 6 chiffres + ID Telegram verifie
  - Streaming en temps reel, tool approval via inline keyboards
  - Zero serveur backend, long polling HTTPS sortant
- Web
  - SPA standalone (React + Tailwind), WebSocket sur localhost
  - Pairing par code 6 chiffres + QR code
  - Calque visuel exact du desktop

### Slash Commands
- 8 commandes builtins (`/resume`, `/explain`, `/refactor`, `/debug`, `/translate`, `/commit-msg`, `/review`, `/test`)
- Commandes personnalisees avec variables (`$ARGS`, `$MODEL`, `$PROJECT`, etc.)
- Autocomplete dans la zone de saisie, scope par projet

### Recherche Web (Perplexity)
- Mode Search activable dans la zone de saisie
- Le LLM decide quand chercher sur le web (tool call)
- Sources numerotees cliquables sous la reponse

### Export/Import securise (.mlx)
- Export chiffre AES-256-GCM de toutes les conversations et projets
- Token d'instance 32 bytes (safeStorage), import cross-machine
- Import transactionnel SQLite avec deduplication

### Bardas (Gestion de Brigade)
- Packs thematiques au format Markdown (.md) contenant roles, commandes, prompts, fragments memoire, referentiels et serveurs MCP
- Import en un clic avec preview du contenu et rapport detaille (succes, skips MCP, warnings)
- Namespace unique par barda — les ressources importees ne collisionnent jamais avec les ressources custom
- Toggle ON/OFF global : desactive toutes les ressources d'un barda sans les supprimer
- Desinstallation propre : suppression atomique de toutes les ressources du namespace
- 3 bardas exemples inclus (ecrivain, dev-react, philosophe) dans `examples/`
- Format ouvert : editable dans n'importe quel editeur texte, versionnable dans Git

### Skills
- Packs autonomes au format Markdown + frontmatter YAML (compatible Claude Code)
- Installation depuis URL GitHub (monorepo supporte), dossier local, ou section `## Skills` dans un Barda
- Scan de securite Maton : scanner Python (107 regles, 18 categories) + analyse contextuelle LLM via modele par defaut
- Toggle Maton ON/OFF a l'installation, verdicts Scanner + Contextuel avec findings detailles
- Invocation via `/skill-name args` dans les conversations (merge dans le dropdown autocomplete)
- Injection `<skill-context>` dans le system prompt, execution de blocs shell `!cmd` via Seatbelt
- Vue complete dans Personnaliser > Skills : grille, detail (tree filtre, preview, metadata), toggle ON/OFF, desinstallation
- Sync bidirectionnelle filesystem ↔ DB au demarrage

### Autres fonctionnalites
- **Projets** : organisation avec modele par defaut, workspace lie, system prompt
- **Roles** : builtin et custom, variables dynamiques `{{varName}}`
- **Prompts** : bibliotheque reutilisable (complet, complement, system)
- **Taches planifiees** : execution LLM automatique (intervalle, quotidien, hebdomadaire)
- **TTS** : 3 providers (navigateur, OpenAI, Google)
- **Statistiques** : suivi des couts par provider/modele/projet, graphiques
- **Memory Fragments** : contexte personnel persistant, drag & drop
- **Palette de commandes** : Cmd+K recherche globale

## Securite

L'architecture de securite repose sur l'isolation stricte des 3 couches Electron :

### Renderer (sandbox)
- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
- CSP stricte (`script-src 'self'`, `connect-src 'self' https://*.openai.com ...`)
- DOMPurify sur le HTML Shiki et Mermaid
- Liens Markdown : whitelist de schemas (https, http, mailto, #)

### Preload (bridge)
- ~150 methodes typees via `contextBridge`, jamais `ipcRenderer` directement
- Cleanup des listeners via `removeAllListeners`

### Main (Node.js)
- **Cles API** : chiffrees via `safeStorage` (Keychain macOS), jamais exposees au renderer
- **IPC** : validation Zod sur tous les handlers, settings proteges par whitelist (`ALLOWED_SETTING_KEYS`)
- **Bash tool** : env minimal isole (PATH restreint, HOME=workspace), blocklist ~36 patterns (dont anti-evasion shell), timeout 30s
- **Fichiers** : `isPathAllowed()` (confinement userData + workspace), `SENSITIVE_PATTERNS`, extension blocklist, `fs.realpathSync()` anti-symlink
- **Git** : env immutable `GIT_BASE_ENV` (Readonly), `GIT_CONFIG_NOSYSTEM=1`, `validateGitPaths()` sur toutes les operations
- **MCP** : env minimal stdio (PATH/HOME/TMPDIR/LANG/SHELL/USER), env vars chiffrees
- **Remote** : `crypto.timingSafeEqual` sur le pairing, `maxPayload 64KB` (WebSocket), broadcast reserve aux clients authentifies
- **Skills** : `realpathSync()` sur les chemins, regex validation des noms (`[a-zA-Z0-9_\-.:]+`), `JSON.stringify()` anti-injection dans les commandes Python, recherche SKILL.md confinee (3 niveaux max), cleanup temp dirs (`/tmp/cruchot-skill-*`), Maton scan avant installation
- **FTS5** : `sanitizeFtsQuery()` neutralise les operateurs MATCH, resultats tronques a 500 chars
- **XML injection** : contenu sanitise avant injection dans le system prompt (workspace, fichiers, library-context, semantic-memory)
- **Factory reset** : double confirmation (renderer + dialog natif main)
- **Export .mlx** : AES-256-GCM, IV unique par export, token hors whitelist renderer

### Donnees
- SQLite WAL + 26 tables Drizzle, donnees 100% locales
- Qdrant vector DB embedded (127.0.0.1 uniquement)
- Zero telemetrie, zero serveur backend

## Distribution

```bash
npm run dist:mac      # DMG + ZIP (universal)
npm run dist:win      # NSIS installer
npm run dist:linux    # AppImage + deb
```

Auto-updater integre via `electron-updater` (GitHub Releases).

## Licence

MIT
