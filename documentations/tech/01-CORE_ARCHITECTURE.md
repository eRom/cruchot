# Architecture Core (Electron, IPC & Services)

Ce document décrit l'architecture globale de Cruchot et le modèle d'exécution de la plateforme.

## 1. Frontière de Confiance (Trust Boundary)

L'architecture de Cruchot repose sur le modèle de sécurité recommandé d'Electron, qui sépare strictement le processus hôte (Main) de l'interface utilisateur (Renderer).

```mermaid
flowchart TD
    subgraph UI["Processus UI (Renderer) - React"]
        A[Interface Utilisateur]
        B[Markdown & Math Rendering]
        C[Zustand State]
    end

    subgraph Bridge["IPC (Inter-Process Communication)"]
        D((Context Bridge / Preload))
    end

    subgraph Host["Processus Hôte (Main) - Node.js"]
        E[Gestion des Secrets / Keychain]
        F[Accès Système de Fichiers]
        G[Routeur AI SDK]
        H[Base de données SQLite]
        I[Moteur MCP & Skills]
    end

    A -->|invoke('event')| D
    D -->|Handler sécurisé| Host
    Host -->|stream('chunk')| D
    D -->|Callback| A
```

### 1.1 Processus UI (Renderer)
C'est une zone **non-fiable**. Le code React ne possède **aucun** secret, aucune clé d'API, et aucun accès direct au système de fichiers ou au réseau (fetch vers les LLMs). S'il y a une faille XSS dans le rendu Markdown, l'attaquant ne peut pas voler les clés d'API. Toutes les permissions Web (caméra, micro) sont d'ailleurs désactivées par défaut.

### 1.2 Processus Hôte (Main)
C'est la zone **fiable**. Il détient les clés d'API (récupérées via `safeStorage`), gère la base de données SQLite locale, orchestre le `Vercel AI SDK` pour contacter les LLMs, gère le confinement "Seatbelt" pour l'exécution locale de code, et gère les serveurs MCP.

## 2. Cycle de vie de l'Application (`src/main/index.ts`)

Au démarrage (`app.whenReady()`), le processus Main orchestre l'initialisation de tous les services critiques de la plateforme :

1.  **Protocoles Sécurisés** : Enregistrement du protocole custom `local-image://` pour servir des images stockées localement tout en respectant des CSP strictes (bloquant la remontée de dossiers via symlinks).
2.  **Base de données** : Initialisation de Better-SQLite3 et exécution des migrations Drizzle (`initDatabase()`).
3.  **Handlers IPC** : Enregistrement de tous les écouteurs IPC (`registerAllIpcHandlers()`).
4.  **Sandbox** : Création du dossier de travail par défaut (`~/.cruchot/sandbox/`).
5.  **Synchronisation des Skills** : Découverte des fichiers de compétences sur le disque et synchronisation avec la DB (`skillService`).
6.  **Application Menu** : `app.setName('Cruchot')` force le nom de l'app (essentiel en mode dev où le binaire Electron s'appelle "Electron"), puis `Menu.setApplicationMenu(buildAppMenu())` installe le menu natif macOS (défini dans `src/main/menu.ts`) avant la création de la fenêtre.
7.  **Background Services** :
    *   `schedulerService` : Tâches planifiées.
    *   `mcpManagerService` : Démarrage des serveurs MCP activés.
    *   `telegramBotService` : Initialisation du bot Telegram (si configuré).
    *   `remoteServerService` : Lancement du serveur WebSockets distant.
    *   `qdrantMemoryService` : Démarrage de la base vectorielle locale pour le RAG.
    *   `liveEngineService` : Orchestrateur de conversation vocale temps-réel — architecture plugin (initialisé avec la BrowserWindow).

Depuis la v0.7, les services sont gérés par un `ServiceRegistry` centralisé (`service-registry.ts`). Ce registre :
- **Lazy-load** : les services lourds (Qdrant, MCP, Telegram) ne sont initialisés qu'au premier accès, pas au démarrage.
- **Shutdown coordonné** : à la fermeture (`before-quit`), `serviceRegistry.stopAll()` arrête tous les services enregistrés via `Promise.allSettled()`, suivi de Qdrant puis de la fermeture de la base de données. Plus de fire-and-forget dans `will-quit`.

## 3. Communication Client/Serveur (IPC & Streaming)

La génération de texte LLM étant asynchrone (Server-Sent Events), Cruchot utilise des flux IPC bidirectionnels :
- Le Renderer invoque une demande de génération.
- Le Main instancie le Vercel AI SDK et commence à streamer.
- Le Main émet des événements IPC `chunk` contenant les tokens (texte, thinking, tool calls).
- Le Renderer peut invoquer un `cancel-stream` à tout moment pour interrompre le LLM.

## 4. Menu Applicatif Natif (`src/main/menu.ts`)

Le menu natif macOS (Cruchot / Fichier / Édition / Affichage / Fenêtre / Aide) est construit par `buildAppMenu()` à partir d'un template `MenuItemConstructorOptions[]`.

### Canal IPC `menu:action`

Pour ne pas multiplier les méthodes preload (une par entrée de menu), toutes les actions passent par un canal unique `menu:action` avec une union de chaînes discriminantes :

```typescript
// preload/types.ts
type MenuAction = 'customize' | 'settings' | 'new-conversation' | 'backup-now' | 'import-bulk' | 'export-bulk'

// main/menu.ts — send side
win.webContents.send('menu:action', 'new-conversation')

// renderer App.tsx — receive side
window.api.onMenuAction((action) => { /* router switch */ })
```

Le renderer écoute dans un `useEffect` et route chaque action vers son handler existant (même chemin que le raccourci clavier ou le bouton équivalent). Le preload expose deux méthodes : `onMenuAction(cb)` / `offMenuAction()`.

### About Panel macOS

`app.setAboutPanelOptions()` configure le panneau "À propos de Cruchot" (nom, version, copyright). En mode dev, `iconPath` pointe sur `resources/icon-1024.png` car il n'y a pas encore de `.app` bundle — dans un build packagé, macOS lit l'icône directement depuis le bundle `.app`.

## 5. Extension : Remote Web et Serveur WebSocket

Outre l'application desktop Electron, Cruchot inclut un serveur WebSocket local (`remoteServerService`).
Cela permet à des clients distants (comme l'application Web PWA hébergée sur Vercel, ou l'application mobile) de se connecter à l'instance locale de Cruchot pour piloter les LLMs, interroger la base de données, ou utiliser les outils MCP, tout en gardant les données (DB, RAG) et les clés sur la machine hôte.
