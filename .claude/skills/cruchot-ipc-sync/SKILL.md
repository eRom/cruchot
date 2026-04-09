---
name: cruchot-ipc-sync
description: >
  Cross-reference Electron IPC 3-layer consistency (main handlers, preload bridge, renderer types).
  Trigger after modifying IPC handlers, preload methods, or adding new IPC channels.
  Also trigger when subagents have modified IPC files.
  Triggers: /cruchot-ipc-sync
user-invocable: true
---

# IPC 3-Layer Sync Audit

Scan the 3 IPC layers and report inconsistencies between them.

## Layers

| Layer | Location | Pattern |
|-------|----------|---------|
| Main handlers | `src/main/ipc/*.ipc.ts` | `ipcMain.handle('channel:action', ...)` |
| Preload bridge | `src/preload/index.ts` | `ipcRenderer.invoke('channel:action', ...)` and `ipcRenderer.on('channel:event', ...)` |
| Renderer types | `src/preload/types.ts` | `ElectronAPI` interface + exported types |

## Procedure

### Step 1 — Extract all registered channels

Scan `src/main/ipc/*.ipc.ts` for ALL `ipcMain.handle(...)` calls. Extract the channel string
(first argument). Note: some handle calls span multiple lines (e.g. `files.ipc.ts`).
Also scan for `mainWindow.webContents.send(...)` patterns — these are event channels pushed
from main to renderer.

Expected: ~230+ handle channels across ~40 IPC files.

### Step 2 — Extract all preload methods

Scan `src/preload/index.ts` for:
- `ipcRenderer.invoke('...')` calls — request/response channels
- `ipcRenderer.on('...')` calls — event listener channels
- `ipcRenderer.removeAllListeners('...')` calls — cleanup channels

Map each preload method name to its channel string.

Expected: ~297 methods in the `api` object (current baseline).

### Step 3 — Extract renderer type declarations

Read `src/preload/types.ts` for the `ElectronAPI` interface and all exported types
(`SendMessagePayload`, `StreamChunk`, `MenuAction`, etc.).

### Step 4 — Cross-reference and report

Build a report with these sections:

```
=== IPC 3-LAYER SYNC REPORT ===

[ORPHAN HANDLERS] Main handlers with no preload bridge method
  - channel 'foo:bar' in foo.ipc.ts has no invoke/on in preload

[DEAD BRIDGES] Preload methods invoking channels with no main handler
  - preload method 'doFoo' invokes 'foo:baz' but no handler exists

[CHANNEL MISMATCHES] Channel strings that differ between layers
  - preload invokes 'foo:Bar' but handler registers 'foo:bar'

[TYPE GAPS] Preload methods missing from ElectronAPI interface
  - method 'doFoo' exists in preload but not declared in types

[EVENT CHANNELS] Main-to-renderer events (webContents.send) audit
  - event 'foo:updated' sent from main, listener in preload: YES/NO

[SUMMARY]
  Main handlers:    N
  Preload methods:  N
  Type declarations: N
  Issues found:     N
```

IMPORTANT: `test-helpers.ipc.ts` handlers (`test:*`) are gated by TEST_MODE and
dynamically imported — they are expected to have conditional preload wiring.
Flag them separately under `[TEST-ONLY]` but do NOT count as issues.

### Step 5 — Offer fixes (interactive)

After showing the report, ask: "Fix these inconsistencies? [y/n]"

If confirmed:
- For orphan handlers: add the missing preload method + type declaration
- For dead bridges: flag for removal (do NOT auto-delete — ask confirmation per item)
- For type gaps: add the missing type signature to ElectronAPI
- For channel mismatches: show both sides, ask which is correct

NEVER auto-fix without showing the report first.

## Conventions

- Channel naming: `domain:action` (e.g. `chat:send`, `providers:list`)
- Preload method naming: camelCase matching the action (e.g. `sendMessage`, `getProviders`)
- Event listeners: `on{Event}` / `off{Event}` pairs (e.g. `onChunk` / `offChunk`)
- Every `ipcRenderer.on(...)` MUST have a matching `removeAllListeners(...)` cleanup
- Types live in `src/preload/types.ts`, NOT in `index.d.ts`

## Key files

- `src/main/ipc/index.ts` — registers all IPC modules, has `settings:get/set` handlers
- `src/main/ipc/chat.ipc.ts` — largest IPC file (~1500 lines), high edit frequency
- `src/preload/index.ts` — single preload entry, ~297 methods
- `src/preload/types.ts` — shared types for IPC payloads and ElectronAPI

## Notes

- The preload snapshot tests (`tests/unit/preload-api-surface.test.ts`) will catch
  additions/removals — run `npm test` after any fix to verify snapshot consistency
- Current baseline: 297 prod methods + 1 test namespace (298 in TEST_MODE)
- `ipcMain.handle` is async request/response; `webContents.send` is fire-and-forget push
- Some channels live in `src/main/ipc/index.ts` (settings), not in domain files
