You are an expert performance auditor specializing in Electron and React applications. Your mission is to perform a comprehensive, iterative performance audit of the provided project, combining automated SAST scanning (Semgrep) with manual expert analysis.

You are optimizing an Electron + React + Vite application.
Build system: Vite + electron-builder.
TypeScript strict mode.

## PRE-AUDIT METRICS
  cold_start_ms: {cold:.0} (target: {t_cold:.0})
  bundle_size_kb: {bundle:.0} (target: {t_bundle:.0})
  ttfmp_ms: {ttfmp:.0} (target: {t_ttfmp:.0})
  heap_mb: {heap:.0} (target: {t_heap:.0})

## WORKFLOW

WORST OFFENDER: {worst_name} ({delta_pct:.1}% over target)

FOCUS: Optimize {worst_name} specifically.

CONSTRAINT: Do NOT regress other metrics by more than 5%.
CONSTRAINT: All changes must pass tsc --noEmit.
CONSTRAINT: Do NOT change the app's functionality.

SPECIFIC FOCUS: Reduce cold start time.
Common causes in Electron apps:
- Synchronous require/import in main process
- Heavy preload script with eager module loading
- Blocking IPC setup before window creation
- Large node_modules pulled into main bundle

Strategies to apply (in priority order):
1. Defer non-critical IPC handlers to after window.show
2. Convert sync imports to dynamic import() in main
3. Minimize preload.ts to only contextBridge essentials
4. Use app.commandLine.appendSwitch for V8 flags if useful
5. Split main process startup into critical/non-critical phases

Analyze these files first:
- src/main/index.ts (or equivalent entry)
- src/preload/index.ts
- vite.config.ts (main process config)"#.to_string(),

            MetricName::BundleSizeKb => r#"SPECIFIC FOCUS: Reduce total bundle size.
Common causes in Electron + Vite apps:
- Unused exports not tree-shaken
- Full library imports instead of cherry-picking
- Duplicate dependencies across main/renderer
- Large assets embedded in bundle

Strategies to apply:
1. Run 'npx vite-bundle-visualizer' mentally - identify big chunks
2. Convert barrel imports to direct file imports
3. Split each module into a lazy-loaded chunk
4. Replace heavy deps with lighter alternatives
5. Externalize node builtins from renderer bundle
6. Verify rollupOptions.external in vite config"#.to_string(),

            MetricName::TtfmpMs => r#"SPECIFIC FOCUS: Reduce Time to First Meaningful Paint.
Common causes:
- Heavy component tree computed before first render
- Blocking data fetches in top-level useEffect
- CSS-in-JS runtime overhead at startup
- Large initial store hydration

Strategies:
1. Lazy load non-visible components (React.lazy + Suspense)
2. Defer store initialization to after first paint
3. Use CSS modules or Tailwind instead of runtime CSS-in-JS
4. Implement a shell/skeleton that renders instantly
5. Move heavy computations to Web Workers"#.to_string(),

            MetricName::HeapMb => r#"SPECIFIC FOCUS: Reduce heap memory usage.
Common causes:
- Unbounded message/history in memory
- Multiple client instances alive simultaneously
- Event listener leaks (IPC, DOM, WebSocket)
- Large cached responses not cleaned up

Strategies:
1. Implement windowed/virtualized lists
2. Pool connections, destroy unused ones
3. Add cleanup in useEffect returns for all listeners
4. Implement LRU cache with max size for responses
5. Use WeakRef/FinalizationRegistry for large objects"#.to_string(),
      