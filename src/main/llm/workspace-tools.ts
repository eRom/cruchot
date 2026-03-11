import { tool } from 'ai'
import { z } from 'zod'
import { execSync, spawn, type ChildProcess } from 'child_process'
import type { WorkspaceService } from '../services/workspace.service'

// ── Background process tracking ──────────────────────────────

interface TrackedProcess {
  process: ChildProcess
  stdout: string[]
  stderr: string[]
  exitCode: number | null
  command: string
  startedAt: number
}

const bgProcesses = new Map<string, TrackedProcess>()
let procCounter = 0

function cleanupOldProcesses(): void {
  const cutoff = Date.now() - 10 * 60 * 1000
  bgProcesses.forEach((p, id) => {
    if (p.exitCode !== null && p.startedAt < cutoff) bgProcesses.delete(id)
  })
}

// ── Tree helpers ─────────────────────────────────────────────

interface TreeNode {
  name: string
  path: string
  type: string
  size?: number
  extension?: string
  children?: TreeNode[]
}

function flattenTree(node: TreeNode): string[] {
  const out: string[] = []
  if (node.type === 'file') out.push(node.path)
  if (node.children) {
    for (const child of node.children) out.push(...flattenTree(child))
  }
  return out
}

function matchGlob(filePath: string, pattern: string): boolean {
  let re = ''
  for (let i = 0; i < pattern.length; ) {
    const ch = pattern[i]
    if (ch === '*' && pattern[i + 1] === '*') {
      re += pattern[i + 2] === '/' ? '(?:.+/)?' : '.*'
      i += pattern[i + 2] === '/' ? 3 : 2
    } else if (ch === '*') {
      re += '[^/]*'
      i++
    } else if (ch === '?') {
      re += '[^/]'
      i++
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      re += '\\' + ch
      i++
    } else {
      re += ch
      i++
    }
  }
  try {
    return new RegExp(`^${re}$`).test(filePath)
  } catch {
    return false
  }
}

// ── Tools builder ────────────────────────────────────────────

/**
 * Build AI SDK tools for workspace file operations.
 * Only created when a workspace is active.
 */
export function buildWorkspaceTools(workspace: WorkspaceService) {
  const rootPath = workspace.rootPath

  return {
    // ── #1 ReadFile ────────────────────────────────────────
    readFile: tool({
      description:
        'Lire le contenu d\'un fichier du workspace. Retourne le contenu texte, le langage detecte et la taille.',
      inputSchema: z.object({
        path: z.string().describe('Chemin relatif du fichier dans le workspace (ex: "src/index.ts", "README.md")')
      }),
      execute: async ({ path }) => {
        try {
          const file = workspace.readFile(path)
          return { path: file.path, content: file.content, language: file.language, size: file.size }
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Impossible de lire le fichier' }
        }
      }
    }),

    // ── #2 Write ───────────────────────────────────────────
    writeFile: tool({
      description:
        'Creer un nouveau fichier ou ecraser completement un fichier existant dans le workspace.',
      inputSchema: z.object({
        path: z.string().describe('Chemin relatif du fichier a creer/ecraser'),
        content: z.string().describe('Contenu complet du fichier')
      }),
      execute: async ({ path, content }) => {
        try {
          workspace.writeFile(path, content)
          return { success: true, path, bytes: Buffer.byteLength(content, 'utf-8') }
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Impossible d\'ecrire le fichier' }
        }
      }
    }),

    // ── #3 Edit ────────────────────────────────────────────
    editFile: tool({
      description:
        'Modifier un fichier existant en remplacant une chaine exacte par une autre. La chaine doit etre unique sauf si replaceAll est active.',
      inputSchema: z.object({
        path: z.string().describe('Chemin relatif du fichier a modifier'),
        oldString: z.string().describe('Texte exact a remplacer (doit etre unique dans le fichier)'),
        newString: z.string().describe('Nouveau texte de remplacement'),
        replaceAll: z.boolean().optional().describe('Remplacer toutes les occurrences (defaut: false)')
      }),
      execute: async ({ path, oldString, newString, replaceAll }) => {
        try {
          const file = workspace.readFile(path)
          if (!file.content.includes(oldString)) {
            return { error: `Chaine non trouvee dans ${path}` }
          }
          const count = file.content.split(oldString).length - 1
          if (!replaceAll && count > 1) {
            return {
              error: `La chaine apparait ${count} fois dans ${path}. Fournir plus de contexte ou activer replaceAll.`
            }
          }
          const updated = replaceAll
            ? file.content.split(oldString).join(newString)
            : file.content.replace(oldString, newString)
          workspace.writeFile(path, updated)
          return { success: true, path, replacements: replaceAll ? count : 1 }
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Impossible de modifier le fichier' }
        }
      }
    }),

    // ── #4 Bash ────────────────────────────────────────────
    bash: tool({
      description:
        'Executer une commande shell dans le repertoire du workspace. Peut tourner en arriere-plan avec background=true.',
      inputSchema: z.object({
        command: z.string().describe('Commande shell a executer'),
        background: z.boolean().optional().describe('Executer en arriere-plan (retourne un processId)')
      }),
      execute: async ({ command, background }) => {
        if (background) {
          cleanupOldProcesses()
          const id = `proc_${++procCounter}`
          const child = spawn('sh', ['-c', command], {
            cwd: rootPath,
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe']
          })
          const tracked: TrackedProcess = {
            process: child,
            stdout: [],
            stderr: [],
            exitCode: null,
            command,
            startedAt: Date.now()
          }
          child.stdout?.on('data', (d: Buffer) => tracked.stdout.push(d.toString()))
          child.stderr?.on('data', (d: Buffer) => tracked.stderr.push(d.toString()))
          child.on('close', (code) => {
            tracked.exitCode = code
          })
          bgProcesses.set(id, tracked)
          return { processId: id, status: 'started', command }
        }

        try {
          const stdout = execSync(command, {
            cwd: rootPath,
            timeout: 120_000,
            maxBuffer: 2 * 1024 * 1024,
            encoding: 'utf-8',
            env: { ...process.env }
          })
          return { stdout: stdout.slice(0, 20_000), exitCode: 0 }
        } catch (err: unknown) {
          const e = err as { stdout?: string; stderr?: string; status?: number }
          return {
            stdout: (e.stdout || '').slice(0, 10_000),
            stderr: (e.stderr || '').slice(0, 10_000),
            exitCode: e.status ?? 1
          }
        }
      }
    }),

    // ── #5 Glob ────────────────────────────────────────────
    glob: tool({
      description:
        'Trouver des fichiers par pattern glob dans le workspace. Supporte ** pour la recursion.',
      inputSchema: z.object({
        pattern: z.string().describe('Pattern glob (ex: "**/*.ts", "src/**/*.tsx", "*.json")')
      }),
      execute: async ({ pattern }) => {
        try {
          const tree = workspace.scanTree(15) as TreeNode
          const all = flattenTree(tree)
          const matched = all.filter(f => matchGlob(f, pattern))
          return {
            pattern,
            files: matched.slice(0, 200),
            count: matched.length,
            truncated: matched.length > 200
          }
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Erreur lors du glob' }
        }
      }
    }),

    // ── #6 Grep ────────────────────────────────────────────
    grep: tool({
      description:
        'Rechercher un pattern (texte ou regex) dans le contenu des fichiers du workspace.',
      inputSchema: z.object({
        pattern: z.string().describe('Texte ou expression reguliere a rechercher'),
        fileGlob: z.string().optional().describe('Filtrer par pattern de fichiers (ex: "*.ts", "**/*.tsx")'),
        path: z.string().optional().describe('Sous-repertoire de recherche (optionnel)')
      }),
      execute: async ({ pattern, fileGlob, path: searchDir }) => {
        try {
          let regex: RegExp
          try {
            regex = new RegExp(pattern)
          } catch {
            regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          }

          const tree = searchDir
            ? ({ children: workspace.scanDirectory(searchDir), type: 'directory', name: '', path: searchDir } as TreeNode)
            : (workspace.scanTree(10) as TreeNode)

          const allFiles = flattenTree(tree)
          const filtered = fileGlob ? allFiles.filter(f => matchGlob(f, fileGlob)) : allFiles

          const results: Array<{ file: string; matches: string[] }> = []
          const MAX_FILES = 50
          const MAX_MATCHES_PER_FILE = 5

          for (const filePath of filtered) {
            if (results.length >= MAX_FILES) break
            try {
              const file = workspace.readFile(filePath)
              const lines = file.content.split('\n')
              const matches: string[] = []
              for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_FILE; i++) {
                if (regex.test(lines[i])) {
                  matches.push(`${i + 1}: ${lines[i].trimEnd().slice(0, 200)}`)
                }
              }
              if (matches.length > 0) results.push({ file: filePath, matches })
            } catch {
              // Skip unreadable files
            }
          }

          return { pattern, resultCount: results.length, results }
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Erreur lors de la recherche' }
        }
      }
    }),

    // ── #7 BashOutput ──────────────────────────────────────
    bashOutput: tool({
      description:
        'Recuperer la sortie accumulee d\'un processus en arriere-plan lance avec bash(background=true).',
      inputSchema: z.object({
        processId: z.string().describe('ID du processus (retourne par bash)')
      }),
      execute: async ({ processId }) => {
        const p = bgProcesses.get(processId)
        if (!p) return { error: `Processus ${processId} non trouve` }

        const stdout = p.stdout.join('')
        const stderr = p.stderr.join('')
        p.stdout = []
        p.stderr = []

        return {
          processId,
          command: p.command,
          stdout: stdout.slice(0, 20_000),
          stderr: stderr.slice(0, 10_000),
          running: p.exitCode === null,
          exitCode: p.exitCode
        }
      }
    }),

    // ── #8 KillShell ───────────────────────────────────────
    killShell: tool({
      description: 'Arreter un processus en arriere-plan.',
      inputSchema: z.object({
        processId: z.string().describe('ID du processus a arreter')
      }),
      execute: async ({ processId }) => {
        const p = bgProcesses.get(processId)
        if (!p) return { error: `Processus ${processId} non trouve` }
        try {
          p.process.kill('SIGTERM')
          bgProcesses.delete(processId)
          return { success: true, processId }
        } catch (error) {
          return { error: error instanceof Error ? error.message : 'Impossible d\'arreter le processus' }
        }
      }
    }),

    // ── #9 SlashCommand ────────────────────────────────────
    slashCommand: tool({
      description:
        'Declencher une action de l\'application. Commandes : new-conversation, open-settings, open-project, open-images, open-stats, open-roles, open-tasks.',
      inputSchema: z.object({
        command: z.string().describe('Nom de la commande (ex: "new-conversation", "open-settings")'),
        args: z.record(z.string(), z.string()).optional().describe('Arguments optionnels de la commande')
      }),
      execute: async ({ command, args }) => {
        return {
          type: 'slash-command' as const,
          command,
          args: args ?? {},
          status: 'requested' as const
        }
      }
    }),

    // ── Legacy: listFiles (directory listing) ──────────────
    listFiles: tool({
      description:
        'Lister les fichiers et dossiers dans le workspace. Sans argument, liste la racine. Avec un chemin, liste ce repertoire.',
      inputSchema: z.object({
        path: z.string().optional().describe('Chemin relatif du repertoire a lister (optionnel, racine par defaut)')
      }),
      execute: async ({ path }) => {
        try {
          const entries = workspace.scanDirectory(path ?? '')
          return {
            path: path ?? '.',
            entries: entries.map(e => ({
              name: e.name,
              path: e.path,
              type: e.type,
              size: e.size,
              extension: e.extension
            }))
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : 'Impossible de lister le repertoire'
          }
        }
      }
    }),

    // ── Legacy: searchInFiles (simple text search) ─────────
    searchInFiles: tool({
      description:
        'Rechercher un texte dans les fichiers du workspace. Retourne les fichiers correspondants avec les lignes trouvees.',
      inputSchema: z.object({
        query: z.string().describe('Texte ou pattern a rechercher'),
        path: z.string().optional().describe('Restreindre la recherche a ce sous-repertoire (optionnel)')
      }),
      execute: async ({ query, path: searchPath }) => {
        try {
          const tree = searchPath
            ? { children: workspace.scanDirectory(searchPath), type: 'directory' as const, name: '', path: searchPath }
            : workspace.scanTree(3)

          const results: Array<{ path: string; matches: string[] }> = []
          const MAX_RESULTS = 20
          const queryLower = query.toLowerCase()

          function searchNode(node: TreeNode) {
            if (results.length >= MAX_RESULTS) return

            if (node.type === 'file') {
              try {
                const file = workspace.readFile(node.path)
                const lines = file.content.split('\n')
                const matchingLines: string[] = []
                for (let i = 0; i < lines.length && matchingLines.length < 5; i++) {
                  if (lines[i].toLowerCase().includes(queryLower)) {
                    matchingLines.push(`L${i + 1}: ${lines[i].trimEnd()}`)
                  }
                }
                if (matchingLines.length > 0) {
                  results.push({ path: node.path, matches: matchingLines })
                }
              } catch {
                // Skip unreadable files
              }
            } else if (node.children) {
              for (const child of node.children) {
                searchNode(child)
              }
            }
          }

          searchNode(tree as TreeNode)

          return {
            query,
            resultCount: results.length,
            results
          }
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : 'Erreur lors de la recherche'
          }
        }
      }
    })
  }
}

/** System prompt instructions injected when workspace tools are available */
export const WORKSPACE_TOOLS_PROMPT = `
Tu as acces au workspace (dossier de projet) de l'utilisateur via des outils.

Outils disponibles :
- readFile(path) — Lire le contenu d'un fichier
- writeFile(path, content) — Creer ou ecraser un fichier
- editFile(path, oldString, newString, replaceAll?) — Modifier un fichier (remplacement cible)
- bash(command, background?) — Executer une commande shell (npm, git, etc.)
- glob(pattern) — Trouver des fichiers par pattern (ex: "**/*.ts")
- grep(pattern, fileGlob?, path?) — Rechercher du texte/regex dans les fichiers
- bashOutput(processId) — Lire la sortie d'un processus en arriere-plan
- killShell(processId) — Arreter un processus en arriere-plan
- listFiles(path?) — Lister un repertoire (racine par defaut)
- searchInFiles(query, path?) — Recherche textuelle simple

Regles :
- Utilise ces outils pour lire, modifier et explorer les fichiers au lieu de demander le contenu a l'utilisateur.
- Commence par listFiles() ou glob() pour decouvrir la structure si tu ne la connais pas.
- Utilise editFile() pour des modifications ciblees, writeFile() pour creer ou reecrire entierement.
- Tu peux enchainer plusieurs appels d'outils pour explorer et modifier le projet.
- Si un fichier est trop gros ou binaire, l'outil retournera une erreur — passe au suivant.
- Utilise bash() pour les commandes systeme (npm install, npm test, git status, etc.).
- Pour les serveurs de dev (npm run dev), lance-les en arriere-plan avec bash(command, background=true), puis bashOutput() pour verifier, killShell() pour arreter.
- Quand tu proposes des modifications qui necessitent l'approbation de l'utilisateur, utilise ce format :
\`\`\`file:create:chemin/fichier.ext
contenu
\`\`\`
\`\`\`file:modify:chemin/fichier.ext
contenu complet modifie
\`\`\`
\`\`\`file:delete:chemin/fichier.ext
\`\`\`
`.trim()
