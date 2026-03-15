You are an expert performance auditor specializing in Electron and React applications. Your mission is to perform a comprehensive, iterative performance audit of this project, combining automated analysis with manual expert review.

## TARGET APPLICATION

Electron 35 + React 19 + TypeScript 5.7 + Vite (electron-vite) + Tailwind CSS 4 + shadcn/ui.
State: Zustand (persist localStorage). DB: better-sqlite3 + Drizzle ORM (sync).
LLM: Vercel AI SDK v6 (streamText). Vector DB: Qdrant embedded (local binary).
Embeddings: @huggingface/transformers + onnxruntime-node (CPU).
Build: electron-vite + electron-builder. macOS universal.

## CONSTRAINTS

- Do NOT regress other metrics by more than 5%.
- All changes must pass `npx tsc --noEmit` (renderer AND main).
- Do NOT change the app's functionality or behavior.
- Do NOT change security measures (CSP, sandbox, validation, blocklists).
- Prefer incremental, measurable changes over large rewrites.
- Each fix must be independently testable and revertable.

## WORKFLOW

For each audit pass:
1. **Measure** — Establish baseline metrics (or use provided ones).
2. **Analyze** — Identify top bottlenecks, rank by impact/effort ratio.
3. **Fix** — Apply the highest-impact fix first. One fix at a time.
4. **Verify** — Confirm the fix works and no regression occurred.
5. **Repeat** — Move to next bottleneck until targets are met or diminishing returns.

Report format per fix:
```
## [FIX-ID] Short description
- **File(s)**: path/to/file.ts
- **Category**: cold-start | bundle | render | memory | runtime
- **Impact**: high | medium | low
- **Before**: metric value
- **After**: metric value
- **Change**: description of what was changed and why
```

## PRE-AUDIT METRICS (measure if not available)

```
cold_start_ms:  ???  (target: < 1500)
bundle_size_kb: ???  (target: minimize — report main + renderer + preload separately)
ttfmp_ms:       ???  (target: < 800)
heap_mb:        ???  (target: < 150 after 10 conversations)
```

---

## AXIS 1 — COLD START TIME

### Context
Main process (`src/main/index.ts`) runs sequentially before window.show:
- protocol.handle, initDatabase, runMigrations, ensureInstanceToken
- registerAllIpcHandlers (loads ALL ~22 IPC modules eagerly)
- seedBuiltinCommands
- createMainWindow
- Then async: schedulerService, mcpManagerService, telegramBot, remoteServer, qdrantMemory

### Common causes in Electron apps
- Synchronous require/import of heavy modules in main process at startup
- All IPC handlers registered before window creation (even rarely-used ones)
- Database migrations running synchronously before window show
- Heavy singleton initialization (Qdrant binary spawn, embedding model load)

### Strategies (priority order)
1. **Split IPC registration into critical/deferred** — Only register chat, conversations, providers IPC before window creation. Defer others (mcp, git, library, remote, statistics, images, tasks, scheduled-tasks, tts, data, roles, prompts, commands, summary, qdrant-memory) to after `mainWindow.show` or `did-finish-load`.
2. **Lazy-load IPC handler modules** — Use `import()` instead of top-level imports in `registerAllIpcHandlers`. Each IPC domain module pulls in its service singletons at import time.
3. **Defer seedBuiltinCommands** — Not needed before first render. Run after window show.
4. **Defer ensureInstanceToken** — Not needed until export/import. Run on first use or after window show.
5. **Profile singleton constructors** — Check if service constructors do heavy work (file reads, spawns, network). Move to `.init()` if so.
6. **Use `app.commandLine.appendSwitch`** — Consider `--js-flags=--max-old-space-size=4096` or `--disable-features=CalculateNativeWinOcclusion` if relevant.

### Files to analyze
- `src/main/index.ts` — Startup sequence
- `src/main/ipc/index.ts` — IPC registration (all modules imported eagerly?)
- `src/main/db/migrate.ts` — Migration cost
- `src/main/window.ts` — Window creation timing
- Each `src/main/services/*.service.ts` constructor

---

## AXIS 2 — BUNDLE SIZE

### Context
Build config in `electron.vite.config.ts`:
- Main: externalizeDepsPlugin with `exclude` list (12 deps bundled into main). Terser in prod.
- Renderer: React + Tailwind plugin, no code splitting config, no manual chunks.
- Preload: externalizeDepsPlugin (all deps external).
- 12 view components imported eagerly in App.tsx.

### Common causes in Electron + Vite apps
- Barrel imports pulling entire modules when only one export is needed
- Full library imports instead of cherry-picking (e.g., `import { format } from 'date-fns'` vs `import format from 'date-fns/format'`)
- Duplicate dependencies across main/renderer bundles
- Large assets or fonts embedded in bundle
- No code splitting — single renderer chunk
- Icon libraries imported fully

### Strategies (priority order)
1. **Renderer code splitting** — Add `rollupOptions.output.manualChunks` to split vendor libs (react, react-dom, lucide-react, shiki, katex, mermaid, react-markdown) into separate chunks.
2. **Lazy-load view components** — `App.tsx` imports 12 views eagerly. Use `React.lazy()` + `Suspense` for non-chat views (settings, stats, images, projects, prompts, roles, tasks, mcp, memory, commands, libraries).
3. **Analyze large deps** — Run `npx vite-bundle-visualizer` on renderer build. Identify unexpected large inclusions. Candidates: shiki (syntax themes), katex, mermaid, lucide-react, sonner, react-markdown + remark/rehype plugins.
4. **Tree-shake icon imports** — If using `lucide-react`, ensure individual icon imports (`import { Send } from 'lucide-react'`) not barrel.
5. **Shiki theme/language subsetting** — Only load languages and themes actually used.
6. **Check for accidental main ↔ renderer shared code** — Types file `preload/types.ts` is fine, but verify no heavy modules leak across.
7. **CSS purge** — Tailwind 4 purges automatically, but check for unused shadcn/ui component CSS.

### Files to analyze
- `electron.vite.config.ts` — Build config
- `src/renderer/src/App.tsx` — Eager imports
- `package.json` — Dependency sizes
- `src/renderer/src/components/chat/MarkdownRenderer.tsx` — Shiki/KaTeX/Mermaid loading

---

## AXIS 3 — TIME TO FIRST MEANINGFUL PAINT (TTFMP)

### Context
Renderer entry loads App.tsx which:
- Calls `useInitApp()` (likely fetches conversations, projects, providers, settings via IPC)
- Calls `useStreaming()` (sets up IPC listener)
- Renders full AppLayout + active view immediately

### Common causes
- Blocking IPC calls in useInitApp before any UI renders
- Heavy component tree computed before first render (all 12 views imported)
- Large Zustand store hydration from localStorage
- CSS-in-JS runtime overhead (not applicable — using Tailwind)

### Strategies (priority order)
1. **Skeleton/shell first** — Render a lightweight app shell (sidebar skeleton + empty chat area) before data loads. Move data fetching to after first paint.
2. **Lazy-load non-critical views** — See Axis 2. Only ChatView needs to be in the initial bundle.
3. **Defer useInitApp data** — Load conversations list and active conversation first. Defer providers, projects, roles, prompts, commands, libraries loading to after first render.
4. **Stagger IPC calls** — Don't fire all init IPC calls simultaneously. Prioritize what's visible.
5. **Zustand persist partial hydration** — Only hydrate critical stores (settings theme, active conversation) synchronously. Defer others.
6. **Preload heavy renderer deps** — Use `<link rel="modulepreload">` for critical chunks if code-split.

### Files to analyze
- `src/renderer/src/hooks/useInitApp.ts` — Init sequence
- `src/renderer/src/App.tsx` — Component tree
- `src/renderer/src/stores/*.store.ts` — Store hydration
- `src/renderer/src/components/layout/AppLayout.tsx` — Layout structure

---

## AXIS 4 — HEAP MEMORY

### Context
Chat app with potentially long conversations (1000+ messages), multiple services running (Qdrant, MCP, Telegram, RemoteServer, FileWatcher), and rich rendering (Shiki, Mermaid, KaTeX).

### Common causes
- Unbounded message arrays in memory (all messages of active conversation loaded)
- Multiple service singletons holding state (MCP clients Map, file watchers, WebSocket connections)
- Event listener leaks (IPC `on` without cleanup, Chokidar watchers not stopped)
- Shiki/Mermaid highlighter instances cached permanently
- DOMPurify cache growth
- Qdrant embedding model kept in memory even when not used

### Strategies (priority order)
1. **Virtualized message list** — If not already using `@tanstack/react-virtual`, implement it for conversations with 100+ messages. Only render visible messages + buffer.
2. **Message pagination** — Don't load all messages at once. Load last N messages, fetch more on scroll-up.
3. **Cleanup service resources** — Ensure MCP clients are destroyed when disabled, file watchers are closed when workspace changes, WebSocket connections are cleaned.
4. **Lazy embedding model** — Don't load the ONNX model at app start. Load on first ingestion, unload after idle timeout.
5. **Shiki highlighter singleton** — Ensure only one instance, reuse across messages. Same for Mermaid.
6. **WeakRef for cached responses** — If any response caching exists, use WeakRef or LRU with max size.
7. **Monitor IPC listener count** — Add dev-mode check for listener leaks (count per channel).
8. **Conversation switch cleanup** — When switching conversations, release previous message DOM trees, cancel pending renders.

### Files to analyze
- `src/renderer/src/stores/messages.store.ts` — Message storage
- `src/renderer/src/components/chat/ChatView.tsx` — Message list rendering
- `src/renderer/src/components/chat/MessageItem.tsx` — Per-message weight
- `src/renderer/src/components/chat/MarkdownRenderer.tsx` — Highlighter lifecycle
- `src/main/services/embedding.service.ts` — Model lifecycle
- `src/main/services/mcp-manager.service.ts` — Client lifecycle

---

## AXIS 5 — RUNTIME PERFORMANCE (RENDER & IPC)

### Context
Chat streaming sends token-by-token IPC events from main → renderer. Each token triggers state update → re-render of message list.

### Common causes
- Token-by-token re-renders of entire message list during streaming
- Expensive markdown parsing on every token (Shiki + KaTeX + Mermaid)
- Zustand selector granularity too coarse (subscribing to entire store)
- IPC event flood during streaming without batching/throttling
- SQLite queries on main thread blocking IPC responses

### Strategies (priority order)
1. **Batch streaming tokens** — Buffer tokens in main process, send every 50ms instead of per-token. Reduces IPC overhead and re-render frequency.
2. **Defer markdown rendering during stream** — Render plain text while streaming, apply full markdown (Shiki, Mermaid, KaTeX) only after stream completes or on pause.
3. **React.memo on MessageItem** — Ensure non-streaming messages don't re-render when new tokens arrive for the active message.
4. **Zustand selector optimization** — Use fine-grained selectors. E.g., `useMessagesStore(s => s.messages.length)` instead of `useMessagesStore(s => s.messages)` where possible.
5. **Debounce/throttle expensive operations** — Markdown parsing, Mermaid diagram rendering, syntax highlighting.
6. **SQLite query optimization** — Check for missing indexes on frequently queried columns (conversationId, projectId, createdAt). Use EXPLAIN QUERY PLAN.
7. **requestAnimationFrame for scroll** — Ensure auto-scroll during streaming uses rAF, not every state update.

### Files to analyze
- `src/main/ipc/chat.ipc.ts` — Streaming chunk sending
- `src/renderer/src/hooks/useStreaming.ts` — Token handling
- `src/renderer/src/components/chat/MessageItem.tsx` — Render cost
- `src/renderer/src/components/chat/MarkdownRenderer.tsx` — Parse cost
- `src/main/db/schema.ts` — Index definitions

---

## AXIS 6 — BUILD & DEV EXPERIENCE

### Context
electron-vite with HMR for renderer, hot restart for main. TypeScript strict. Tailwind 4 + shadcn/ui.

### Common causes of slow builds
- No caching for TypeScript compilation
- Large number of Tailwind utility classes to scan
- Terser minification on every dev build
- No incremental TypeScript builds

### Strategies
1. **Verify HMR scope** — Ensure only renderer benefits from HMR. Main process restart should be fast.
2. **SWC instead of Terser** — `minify: 'esbuild'` is faster than Terser for prod builds (already using Vite's default esbuild for renderer).
3. **TypeScript incremental** — Enable `incremental: true` in tsconfig if not already.
4. **Parallel typecheck** — Run renderer and main typechecks in parallel in CI.
5. **Vite build cache** — Ensure `.vite` cache directory is not gitignored accidentally.

### Files to analyze
- `electron.vite.config.ts` — Minifier choice
- `tsconfig.json`, `tsconfig.web.json`, `tsconfig.node.json` — Incremental setting
- `.github/workflows/ci.yml` — Parallel steps

---

## FINAL REPORT

After all fixes, produce a summary table:

```
| Metric          | Before | After  | Target | Delta   |
|-----------------|--------|--------|--------|---------|
| Cold start (ms) |        |        | <1500  |         |
| Bundle (KB)     |        |        | min    |         |
| TTFMP (ms)      |        |        | <800   |         |
| Heap (MB)       |        |        | <150   |         |
```

List remaining opportunities ranked by estimated impact, with "quick wins" flagged.
