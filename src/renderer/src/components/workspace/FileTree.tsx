import { useState, useCallback, useMemo } from 'react'
import { File, Folder, FolderOpen, FileCode, FileText, FileJson, FileImage, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useGitStore } from '@/stores/git.store'
import { cn } from '@/lib/utils'
import type { FileNode } from '../../../../preload/types'
import type { GitFileStatus, GitFileStatusCode } from '../../../../preload/types'

// ── File icon by extension ──────────────────────────────
function getFileIcon(extension?: string) {
  if (!extension) return File
  switch (extension) {
    case '.ts': case '.tsx': case '.js': case '.jsx':
    case '.py': case '.go': case '.rs': case '.java':
    case '.c': case '.cpp': case '.h': case '.rb':
    case '.php': case '.swift': case '.kt':
      return FileCode
    case '.json': case '.yaml': case '.yml': case '.toml':
      return FileJson
    case '.md': case '.txt': case '.csv':
      return FileText
    case '.png': case '.jpg': case '.jpeg': case '.gif': case '.webp': case '.svg':
      return FileImage
    default:
      return File
  }
}

// ── Git status helpers ──────────────────────────────────
function gitStatusColor(code: GitFileStatusCode): string {
  switch (code) {
    case 'M': return 'text-orange-400'
    case 'A': return 'text-emerald-400'
    case 'D': return 'text-red-400'
    case 'R': return 'text-blue-400'
    case '?': return 'text-muted-foreground/50'
    default: return ''
  }
}

function gitStatusLabel(code: GitFileStatusCode): string {
  switch (code) {
    case 'M': return 'M'
    case 'A': return 'A'
    case 'D': return 'D'
    case 'R': return 'R'
    case '?': return '?'
    default: return ''
  }
}

function getEffectiveStatus(file: GitFileStatus): GitFileStatusCode {
  // Working tree status has priority for display, fallback to staging
  if (file.working !== ' ') return file.working
  if (file.staging !== ' ') return file.staging
  return ' '
}

/** Check if a directory path has any children with git status */
function dirHasGitStatus(dirPath: string, statusMap: Map<string, GitFileStatus>): GitFileStatusCode | null {
  for (const [filePath, status] of statusMap) {
    if (filePath.startsWith(dirPath + '/')) {
      const code = getEffectiveStatus(status)
      if (code !== ' ') return code
    }
  }
  return null
}

// ── FileTreeItem ─────────────────────────────────────────
function FileTreeItem({
  node,
  depth,
  filter,
  statusMap
}: {
  node: FileNode
  depth: number
  filter: string
  statusMap: Map<string, GitFileStatus>
}) {
  const [expanded, setExpanded] = useState(false)
  const selectFile = useWorkspaceStore((s) => s.selectFile)
  const selectedFilePath = useWorkspaceStore((s) => s.selectedFilePath)
  const attachFile = useWorkspaceStore((s) => s.attachFile)
  const attachedFiles = useWorkspaceStore((s) => s.attachedFiles)

  const isAttached = attachedFiles.includes(node.path)
  const isSelected = selectedFilePath === node.path

  // Git status for this node
  const fileStatus = statusMap.get(node.path)
  const effectiveCode = fileStatus ? getEffectiveStatus(fileStatus) : null
  const dirStatus = node.type === 'directory' ? dirHasGitStatus(node.path, statusMap) : null

  const matchesFilter = useMemo(() => {
    if (!filter) return true
    const lowerFilter = filter.toLowerCase()
    if (node.name.toLowerCase().includes(lowerFilter)) return true
    if (node.type === 'directory' && node.children) {
      return node.children.some((child: FileNode) => matchesFilterDeep(child, lowerFilter))
    }
    return false
  }, [node, filter])

  if (!matchesFilter) return null

  const handleClick = () => {
    if (node.type === 'directory') {
      setExpanded(!expanded)
    } else {
      selectFile(node.path)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (node.type === 'file') {
      attachFile(node.path)
    }
  }

  const Icon = node.type === 'directory'
    ? (expanded ? FolderOpen : Folder)
    : getFileIcon(node.extension)

  return (
    <>
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-[13px]',
          'hover:bg-accent/50 transition-colors',
          isSelected && 'bg-accent text-accent-foreground',
          isAttached && 'text-cyan-600 dark:text-cyan-400'
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        title={node.type === 'file' ? `Clic droit pour attacher • ${node.path}` : node.path}
      >
        <Icon className={cn(
          'size-3.5 shrink-0',
          node.type === 'directory' ? 'text-amber-500/70' : 'text-muted-foreground/60'
        )} />
        <span className="truncate flex-1">{node.name}</span>
        {isAttached && (
          <span className="shrink-0 text-[10px] text-cyan-500/70">attache</span>
        )}
        {/* Git status indicator for files */}
        {effectiveCode && effectiveCode !== ' ' && (
          <span className={cn('shrink-0 text-[10px] font-mono font-bold', gitStatusColor(effectiveCode))}>
            {gitStatusLabel(effectiveCode)}
          </span>
        )}
        {/* Git status indicator for directories */}
        {!effectiveCode && dirStatus && (
          <span className={cn('size-1.5 rounded-full shrink-0', {
            'bg-orange-400': dirStatus === 'M',
            'bg-emerald-400': dirStatus === 'A',
            'bg-red-400': dirStatus === 'D',
            'bg-muted-foreground/40': dirStatus === '?'
          })} />
        )}
      </button>
      {node.type === 'directory' && expanded && node.children?.map((child: FileNode) => (
        <FileTreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          filter={filter}
          statusMap={statusMap}
        />
      ))}
    </>
  )
}

function matchesFilterDeep(node: FileNode, filter: string): boolean {
  if (node.name.toLowerCase().includes(filter)) return true
  if (node.type === 'directory' && node.children) {
    return node.children.some((child: FileNode) => matchesFilterDeep(child, filter))
  }
  return false
}

// ── FileTree ─────────────────────────────────────────────
export function FileTree() {
  const [filter, setFilter] = useState('')
  const tree = useWorkspaceStore((s) => s.tree)
  const gitStatus = useGitStore((s) => s.status)

  // Build status map for O(1) lookup
  const statusMap = useMemo(() => {
    const map = new Map<string, GitFileStatus>()
    if (gitStatus) {
      for (const file of gitStatus) {
        map.set(file.path, file)
      }
    }
    return map
  }, [gitStatus])

  if (!tree) return null

  const children = tree.children ?? []

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="shrink-0 p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1 pb-2">
        {children.map((node: FileNode) => (
          <FileTreeItem
            key={node.path}
            node={node}
            depth={0}
            filter={filter}
            statusMap={statusMap}
          />
        ))}
        {children.length === 0 && (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground/50">
            Dossier vide
          </p>
        )}
      </div>
    </div>
  )
}
