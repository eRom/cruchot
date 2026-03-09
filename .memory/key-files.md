# Fichiers clés — Multi-LLM Desktop

**Dernière mise à jour** : 2026-03-09

## Documents de référence (existants)

| Fichier | Rôle |
|---------|------|
| `FEATURES.md` | Liste exhaustive des ~475 fonctionnalités V1 + ~20 backlog V2 |
| `ARCH.md` | 10 décisions architecturales, 14 contraintes stack, 9 risques |
| `STACK.md` | Stack retenue (Electron + React + TS), ~50 briques techniques |
| `CLAUDE.md` | Best practices compressées de la stack (~6.5 KB) |
| `PLAN.md` | Plan de développement : architecture, data model, 3 phases, Gantt |
| `TASKS.md` | 60 tâches d'exécution avec dépendances, fichiers, critères |
| `TEAM-ANALYSIS.md` | Analyse de parallélisation : 4 vagues, 4 agents P1, gain ~60% |
| `team.md` | Prompt d'orchestration multi-agents Opus — autonome, prêt à lancer via `cat team.md \| claude` |

## Fichiers critiques à créer (T01-T03)

### Main process
| Fichier | Rôle |
|---------|------|
| `src/main/index.ts` | Entry point Electron, app lifecycle |
| `src/main/window.ts` | Création BrowserWindow, webPreferences sécurisées |
| `src/main/ipc/index.ts` | Registre central de tous les IPC handlers |
| `src/main/llm/router.ts` | Routeur getModel() — Vercel AI SDK |
| `src/main/llm/providers.ts` | Config providers AI SDK avec clés safeStorage |
| `src/main/llm/cost-calculator.ts` | Table PRICING + calcul coût par message |
| `src/main/llm/image.ts` | generateImage() wrapper Gemini (2 modèles) |
| `src/main/db/schema.ts` | Schéma Drizzle (11 tables) |
| `src/main/db/index.ts` | Connexion SQLite + pragmas (WAL, FK) |
| `src/main/services/credential.service.ts` | Wrapper safeStorage pour clés API |

### Preload
| Fichier | Rôle |
|---------|------|
| `src/preload/index.ts` | contextBridge — expose window.api |
| `src/preload/types.ts` | Types partagés de l'API IPC |

### Renderer
| Fichier | Rôle |
|---------|------|
| `src/renderer/src/App.tsx` | Composant racine React |
| `src/renderer/src/stores/*.store.ts` | 9 Zustand stores (slices) |
| `src/renderer/src/components/chat/InputZone.tsx` | Zone de saisie — composant le plus sollicité (9 tâches) |
| `src/renderer/src/components/chat/MessageItem.tsx` | Rendu d'un message (5 tâches) |
| `src/renderer/src/components/chat/MarkdownRenderer.tsx` | Pipeline Markdown (react-markdown + rehype + remark) |
| `src/renderer/src/components/layout/Sidebar.tsx` | Sidebar navigation |
| `src/renderer/src/styles/globals.css` | Tailwind + CSS variables thème |

### Config
| Fichier | Rôle |
|---------|------|
| `electron.vite.config.ts` | Config build main + preload + renderer |
| `drizzle.config.ts` | Config drizzle-kit (schema, output, driver) |
| `electron-builder.yml` | Config packaging multi-OS |
| `package.json` | Dépendances, scripts |
