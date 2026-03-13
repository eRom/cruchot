import { useCallback, useMemo, useRef, useState } from 'react'
import type { FileNode } from '../../../preload/types'

// ── Blocked patterns (mirror workspace-tools.ts) ─────────────
const BLOCKED_SEGMENTS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.cache', '.venv', 'venv', '.tox', '.mypy_cache', '.pytest_cache',
  '.DS_Store', 'Thumbs.db', '.idea', '.vscode',
  'coverage', '.nyc_output', '.turbo',
  '.terraform', '.serverless'
])

const SENSITIVE_PATTERNS = [
  /^\.env$/, /^\.env\..+$/,
  /\.pem$/i, /\.key$/i, /\.p12$/i, /\.pfx$/i, /\.jks$/i,
  /\.keystore$/i, /\.credentials$/i,
  /^id_rsa/, /^id_ed25519/, /^id_ecdsa/
]

function isBlockedNode(node: FileNode): boolean {
  if (BLOCKED_SEGMENTS.has(node.name)) return true
  if (node.type === 'file') {
    for (const p of SENSITIVE_PATTERNS) {
      if (p.test(node.name)) {
        if (node.name === '.env.example' || node.name === '.env.sample') return false
        return true
      }
    }
  }
  return false
}

// ── Types ────────────────────────────────────────────────────

export interface FileMentionResult {
  node: FileNode
  fullPath: string
  isAlreadyAttached: boolean
  isDirectory: boolean
}

export interface UseFileMentionOptions {
  content: string
  cursorPosition: number
  hasWorkspace: boolean
  tree: FileNode | null
  attachedFiles: string[]
  mentionedFiles: Set<string>
}

const MAX_RESULTS = 20

export function useFileMention({
  content,
  cursorPosition,
  hasWorkspace,
  tree,
  attachedFiles,
  mentionedFiles
}: UseFileMentionOptions) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const prevQueryRef = useRef('')

  // ── Detect @ mention ────────────────────────────────────────
  const detection = useMemo(() => {
    if (!hasWorkspace || !tree) return null

    // Scan backwards from cursor to find @
    let atPos = -1
    for (let i = cursorPosition - 1; i >= 0; i--) {
      const ch = content[i]
      if (ch === '@') {
        // Must be preceded by space, newline, or start of text (not email)
        if (i === 0 || /[\s\n]/.test(content[i - 1])) {
          atPos = i
        }
        break
      }
      // Stop scanning if we hit a newline (@ must be on same line as cursor)
      if (ch === '\n') break
    }

    if (atPos === -1) return null

    const query = content.slice(atPos + 1, cursorPosition)

    // Don't show autocomplete if this @query matches an already-resolved mention
    // (user is just reading text, not searching)
    if (mentionedFiles.has(query)) return null

    return { mentionStart: atPos, query }
  }, [content, cursorPosition, hasWorkspace, tree, mentionedFiles])

  // ── Filter tree ─────────────────────────────────────────────
  const { results, currentDir } = useMemo(() => {
    if (!detection || !tree) return { results: [], currentDir: '' }

    const { query } = detection
    const attachedSet = new Set([...attachedFiles, ...mentionedFiles])

    // Navigate into subdirectory if query contains /
    let searchRoot = tree
    let dirPath = ''
    if (query.includes('/')) {
      const parts = query.split('/')
      const dirParts = parts.slice(0, -1)
      for (const part of dirParts) {
        const child = searchRoot.children?.find(
          (c) => c.type === 'directory' && c.name.toLowerCase() === part.toLowerCase()
        )
        if (child) {
          searchRoot = child
          dirPath = dirPath ? `${dirPath}/${child.name}` : child.name
        } else {
          return { results: [], currentDir: dirPath }
        }
      }
    }

    const searchQuery = query.includes('/') ? query.split('/').pop()! : query
    const searchLower = searchQuery.toLowerCase()

    const items: FileMentionResult[] = []

    function collect(node: FileNode) {
      if (isBlockedNode(node)) return

      const children = node.children
      if (!children) return

      for (const child of children) {
        if (isBlockedNode(child)) continue
        if (items.length >= MAX_RESULTS) return

        const nameLower = child.name.toLowerCase()
        if (!searchLower || nameLower.includes(searchLower)) {
          items.push({
            node: child,
            fullPath: child.path,
            isAlreadyAttached: attachedSet.has(child.path),
            isDirectory: child.type === 'directory'
          })
        }
      }
    }

    collect(searchRoot)

    // Sort: directories first, then alphabetical, prefix match first
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      if (searchLower) {
        const aPrefix = a.node.name.toLowerCase().startsWith(searchLower)
        const bPrefix = b.node.name.toLowerCase().startsWith(searchLower)
        if (aPrefix !== bPrefix) return aPrefix ? -1 : 1
      }
      return a.node.name.localeCompare(b.node.name)
    })

    return { results: items, currentDir: dirPath }
  }, [detection, tree, attachedFiles, mentionedFiles])

  // Reset selectedIndex when query changes
  const currentQuery = detection?.query ?? ''
  if (currentQuery !== prevQueryRef.current) {
    prevQueryRef.current = currentQuery
    if (selectedIndex !== 0) setSelectedIndex(0)
  }

  const isOpen = !!detection && results.length > 0
  const mentionStart = detection?.mentionStart ?? -1

  // ── Actions ─────────────────────────────────────────────────
  const selectItem = useCallback(
    (index: number): { selectedPath: string; isDirectory: boolean; mentionStart: number; cursorPosition: number } | null => {
      const item = results[index]
      if (!item || item.isAlreadyAttached) return null
      return {
        selectedPath: item.fullPath,
        isDirectory: item.isDirectory,
        mentionStart,
        cursorPosition
      }
    },
    [results, mentionStart, cursorPosition]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!isOpen) return false

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % results.length)
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + results.length) % results.length)
        return true
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        return true // caller handles the actual selection
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        return true // caller closes
      }
      return false
    },
    [isOpen, results.length]
  )

  return {
    isOpen,
    query: currentQuery,
    results,
    selectedIndex,
    mentionStart,
    currentDir,
    selectItem,
    handleKeyDown
  }
}
