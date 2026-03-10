# Stack : Multi-LLM Desktop

**Date** : 2026-03-09
**Statut** : Decide
**Contexte** : [ARCH.md](./ARCH.md) — 10 decisions architecturales, 14 contraintes stack

## Resume du besoin

Application desktop locale multi-LLM (~495 fonctionnalites) avec chat streaming, generation d'images, recherche web, voix STT/TTS, et statistiques de couts. Toutes les donnees restent sur la machine, aucun serveur backend propre.

## Stacks considerees

| Stack | Priorise | Coute | Apprentissage |
|-------|----------|-------|---------------|
| **A — Electron + React + TS** | Couverture 100% des 14 contraintes, SDKs LLM natifs Node.js | Bundle ~150 MB, RAM ~200 MB | Faible |
| B — Tauri 2 + Sidecar Node | Taille 10x plus legere, perf native Rust | Sidecar = complexite, SDKs LLM pas natifs | Elevee |
| C — Electron + Svelte 5 | DX agreable, reactivity native | Ecosystem composants pauvre pour Markdown/LaTeX/Mermaid | Moyenne |

## Stack retenue

**Stack A — Electron + React + TypeScript**

Tous les SDKs LLM sont des packages npm qui tournent nativement dans le main process Electron. Le modele main/renderer correspond exactement au modele host/UI de l'ARCH.md. L'ecosystem React couvre chaque besoin UI sans compromis.

## Choix techniques concrets

### Couche Desktop (Electron)

| Brique | Choix | Alternative |
|--------|-------|-------------|
| Runtime desktop | Electron 35+ | Tauri 2 |
| Build tool | electron-vite (Vite-based) | electron-forge |
| Packaging | electron-builder | electron-forge |
| Auto-update | electron-updater (GitHub Releases) | Todesktop |
| Stockage settings | electron-store | conf |
| Logging | electron-log | winston |
| Securite cles | Electron safeStorage (Keychain/DPAPI) | node-keytar |

### Couche Frontend (Renderer)

| Brique | Choix | Alternative |
|--------|-------|-------------|
| Framework UI | React 19 | Svelte 5 |
| Langage | TypeScript 5.7+ | - |
| Styling | Tailwind CSS 4 | CSS Modules |
| Composants UI | shadcn/ui (Radix primitives) | Ant Design |
| State management | Zustand | Jotai |
| Markdown rendu | react-markdown + rehype/remark plugins | markdown-it |
| Coloration syntaxique | Shiki (via rehype-shiki) | Prism.js |
| LaTeX | KaTeX (via rehype-katex) | MathJax |
| Mermaid | mermaid (inline rendering) | - |
| Virtualisation listes | @tanstack/react-virtual | react-window |
| i18n | i18next + react-i18next | - |
| Icones | Lucide React | Heroicons |
| Theming | CSS variables + Tailwind dark: | - |
| Formulaires | React Hook Form + Zod | - |
| Raccourcis clavier | hotkeys-js | mousetrap |
| PDF export | jsPDF + html2canvas | @react-pdf/renderer |
| Graphiques stats | Recharts | Chart.js |
| Date/heure | date-fns | dayjs |
| Toast/notifications | Sonner | react-hot-toast |

### Couche Donnees (Main process)

| Brique | Choix | Alternative |
|--------|-------|-------------|
| Base de donnees | better-sqlite3 (SQLite3 + FTS5 + WAL) | sql.js |
| ORM | Drizzle ORM (SQLite driver) | Kysely |
| Migrations | drizzle-kit | custom SQL |
| Validation schemas | Zod | - |
| UUID | nanoid | uuid |

### Couche LLM & APIs (Main process)

| Brique | Choix | Alternative |
|--------|-------|-------------|
| Abstraction LLM | ai (Vercel AI SDK 5) — streamText, generateImage, generateObject | Adapters custom |
| OpenAI | @ai-sdk/openai | openai (npm) direct |
| Anthropic | @ai-sdk/anthropic (Extended Thinking natif) | @anthropic-ai/sdk direct |
| Google Gemini | @ai-sdk/google (chat + image generation) | @google/generative-ai |
| Mistral | @ai-sdk/mistral | @mistralai/mistralai direct |
| xAI (Grok) | @ai-sdk/xai | openai (npm, baseURL modifiee) |
| Perplexity | createOpenAICompatible() via AI SDK | fetch natif |
| OpenRouter | @ai-sdk/openrouter | openai (npm, baseURL) |
| Ollama (local) | Community provider AI SDK | ollama (npm) |
| LM Studio (local) | createOpenAICompatible() via AI SDK | openai (npm, baseURL localhost) |
| STT cloud | @deepgram/sdk | openai (whisper) |
| TTS cloud | openai (tts) | elevenlabs (npm) |
| STT/TTS fallback | Web Speech API (renderer) | - |
| HTTP client | ky | node-fetch |

### Couche Testing

| Brique | Choix | Alternative |
|--------|-------|-------------|
| Unit tests | Vitest | Jest |
| E2E tests | Playwright | Spectron |
| Coverage | v8 (via Vitest) | istanbul |

### Couche CI/CD

| Brique | Choix | Alternative |
|--------|-------|-------------|
| CI | GitHub Actions | - |
| Build multi-OS | electron-builder (matrix macOS/Win/Linux) | - |
| Releases | GitHub Releases (auto via electron-updater) | S3 |
| Code signing | macOS: Developer ID, Win: Authenticode | - |

## Tooling concret

```bash
# Initialisation
npm create electron-vite@latest multi-llm-desktop -- --template react-ts

# Dependances principales
npm i react react-dom zustand @tanstack/react-virtual
npm i tailwindcss @tailwindcss/vite
npm i @radix-ui/react-dialog @radix-ui/react-dropdown-menu  # shadcn primitives
npm i react-markdown rehype-highlight rehype-katex remark-gfm remark-math
npm i mermaid shiki katex
npm i react-hook-form zod @hookform/resolvers
npm i i18next react-i18next
npm i lucide-react sonner recharts date-fns hotkeys-js nanoid
npm i jspdf html2canvas

# Main process
npm i better-sqlite3 drizzle-orm electron-store electron-log
npm i ai @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google @ai-sdk/mistral
npm i @ai-sdk/xai @ai-sdk/openrouter @deepgram/sdk ky

# Dev
npm i -D typescript @types/react @types/react-dom @types/better-sqlite3
npm i -D electron-vite electron-builder electron-updater
npm i -D drizzle-kit vitest @vitest/coverage-v8 playwright
npm i -D tailwindcss @tailwindcss/vite
```

## Ce qu'on ne fait PAS avec cette stack

- Pas de Next.js / serveur — c'est une app desktop, pas du web
- Pas de Redux / MobX — Zustand suffit pour le state local
- Pas d'Axios — ky est plus leger et moderne, les SDKs LLM gerent leur propre HTTP
- Pas de MongoDB / Prisma — SQLite embarque couvre tous les besoins
- Pas de Docker — l'app est distribuee comme binaire natif
- Pas de Storybook en V1 — overhead inutile pour un dev solo/petit equipe
- Pas d'analytics externe (PostHog, Sentry) — les stats sont locales, pas de telemetrie
- Pas d'adapters LLM custom — le Vercel AI SDK fournit l'abstraction multi-provider
