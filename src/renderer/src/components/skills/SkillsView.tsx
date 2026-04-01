import { Button } from '@/components/ui/button'
import { useSkillsStore } from '@/stores/skills.store'
import type { SkillInfo, SkillTreeNode } from '../../../../preload/types'
import {
  ArrowLeft,
  File,
  Folder,
  FolderOpen,
  Loader2,
  Plus,
  Zap
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SkillCard } from './SkillCard'
import { SkillInstallDialog } from './SkillInstallDialog'

// ── TreeView ──────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  return `${Math.round(bytes / 1024)}K`
}

function TreeView({ nodes, depth = 0 }: { nodes: SkillTreeNode[]; depth?: number }): React.JSX.Element {
  return (
    <div>
      {nodes.map((node, i) => (
        <div key={i} style={{ paddingLeft: depth * 16 }}>
          <div className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground">
            {node.type === 'directory' ? (
              <Folder className="size-3.5 shrink-0 text-blue-400" />
            ) : (
              <File className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
            {node.type === 'file' && node.size !== undefined && (
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/50">
                {formatSize(node.size)}
              </span>
            )}
          </div>
          {node.children && node.children.length > 0 && (
            <TreeView nodes={node.children} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Detail View ───────────────────────────────────────────────────────────────

interface SkillDetailViewProps {
  skill: SkillInfo
  onBack: () => void
}

function SkillDetailView({ skill, onBack }: SkillDetailViewProps): React.JSX.Element {
  const [tree, setTree] = useState<SkillTreeNode[]>([])
  const [content, setContent] = useState<string | null>(null)
  const [isLoadingTree, setIsLoadingTree] = useState(true)
  const [isLoadingContent, setIsLoadingContent] = useState(true)

  useEffect(() => {
    setIsLoadingTree(true)
    window.api.skillsGetTree(skill.name)
      .then(setTree)
      .catch(() => setTree([]))
      .finally(() => setIsLoadingTree(false))

    setIsLoadingContent(true)
    window.api.skillsGetContent(skill.name)
      .then((result) => setContent(result?.content ?? null))
      .catch(() => setContent(null))
      .finally(() => setIsLoadingContent(false))
  }, [skill.name])

  const handleOpenFinder = async () => {
    try {
      await window.api.skillsOpenFinder(skill.name)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur'
      toast.error(message)
    }
  }

  const verdictColor =
    skill.matonVerdict === 'OK'
      ? 'text-emerald-500'
      : skill.matonVerdict === 'WARNING'
        ? 'text-orange-500'
        : skill.matonVerdict === 'CRITICAL'
          ? 'text-red-500'
          : 'text-muted-foreground'

  const metaItems = [
    { label: 'Source', value: skill.source },
    { label: 'Shell', value: skill.shell ?? '—' },
    { label: 'Effort', value: skill.effort ?? '—' },
    { label: 'Outils', value: skill.allowedTools?.join(', ') ?? '—' },
    { label: 'Verdict', value: skill.matonVerdict ?? '—', colorClass: verdictColor },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Retour aux skills
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{skill.name}</h1>
              {skill.description && (
                <p className="mt-1 text-sm text-muted-foreground/70">{skill.description}</p>
              )}
            </div>
            <Button variant="outline" className="shrink-0 gap-2" onClick={handleOpenFinder}>
              <FolderOpen className="size-4" />
              Ouvrir dans Finder
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Metadata card */}
          <div className="rounded-lg border border-border/60 bg-sidebar p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Informations
            </h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
              {metaItems.map((item) => (
                <div key={item.label}>
                  <dt className="text-[11px] text-muted-foreground/60">{item.label}</dt>
                  <dd className={`text-sm font-medium ${item.colorClass ?? 'text-foreground'}`}>
                    {item.value}
                  </dd>
                </div>
              ))}
            </div>
          </div>

          {/* File tree section */}
          <div className="rounded-lg border border-border/60 bg-sidebar p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Arborescence
            </h2>
            {isLoadingTree ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Chargement...</span>
              </div>
            ) : tree.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun fichier</p>
            ) : (
              <TreeView nodes={tree} />
            )}
          </div>

          {/* SKILL.md preview */}
          {(isLoadingContent || content) && (
            <div className="rounded-lg border border-border/60 bg-sidebar p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                SKILL.md
              </h2>
              {isLoadingContent ? (
                <div className="flex items-center gap-2 py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Chargement...</span>
                </div>
              ) : (
                <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {content}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── SkillsView ────────────────────────────────────────────────────────────────

type SubView = 'grid' | 'detail'

export function SkillsView(): React.JSX.Element {
  const { skills, isLoading, loadSkills, toggleSkill, uninstallSkill } = useSkillsStore()
  const [subView, setSubView] = useState<SubView>('grid')
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null)
  const [showInstallDialog, setShowInstallDialog] = useState(false)

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleSkill(id, enabled)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors du changement'
      toast.error(message)
    }
  }

  const handleDelete = async (id: string) => {
    const skill = skills.find((s) => s.id === id)
    if (!skill) return
    if (!window.confirm(`Desinstaller le skill "${skill.name}" ?`)) return
    try {
      await uninstallSkill(id)
      toast.success(`Skill "${skill.name}" desinstalle`)
      if (selectedSkill?.id === id) {
        setSubView('grid')
        setSelectedSkill(null)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la desinstallation'
      toast.error(message)
    }
  }

  const handleClickSkill = (skill: SkillInfo) => {
    setSelectedSkill(skill)
    setSubView('detail')
  }

  const handleBack = () => {
    setSubView('grid')
    setSelectedSkill(null)
  }

  const handleInstalled = async () => {
    setShowInstallDialog(false)
    await loadSkills()
    toast.success('Skill installe avec succes')
  }

  // Detail view
  if (subView === 'detail' && selectedSkill) {
    return <SkillDetailView skill={selectedSkill} onBack={handleBack} />
  }

  // Grid view
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Skills{' '}
                {skills.length > 0 && (
                  <span className="ml-1 text-lg font-normal text-muted-foreground/60">
                    {skills.length}
                  </span>
                )}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground/70">
                Gerez les skills disponibles pour le modele.
              </p>
            </div>
            <Button onClick={() => setShowInstallDialog(true)} className="gap-2">
              <Plus className="size-4" />
              Ajouter un skill
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Zap className="size-12 text-muted-foreground/20" />
              <p className="mt-4 text-sm text-muted-foreground">
                Aucun skill installe.
              </p>
              <Button
                variant="outline"
                className="mt-4 gap-2"
                onClick={() => setShowInstallDialog(true)}
              >
                <Plus className="size-4" />
                Ajouter un skill
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {skills.map((skill) => (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onClick={handleClickSkill}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Install dialog */}
      {showInstallDialog && (
        <SkillInstallDialog
          onClose={() => setShowInstallDialog(false)}
          onInstalled={handleInstalled}
        />
      )}
    </div>
  )
}
