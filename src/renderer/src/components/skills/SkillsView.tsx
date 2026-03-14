import React, { useEffect, useState, useMemo } from 'react'
import { useSkillsStore } from '@/stores/skills.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Globe,
  RefreshCw,
  Sparkles,
  FileText,
  Search
} from 'lucide-react'
import type { SkillInfo } from '../../../../preload/types'

type SourceFilter = 'all' | 'global' | 'project'

export function SkillsView(): React.JSX.Element {
  const { skills, loading, loadSkills, refreshSkills } = useSkillsStore()
  const rootPath = useWorkspaceStore((s) => s.rootPath)

  const [search, setSearch] = useState('')
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set())
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const filteredSkills = useMemo(() => {
    let list = skills
    if (sourceFilter !== 'all') {
      list = list.filter((s) => s.source === sourceFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) => s.name.includes(q) || s.description.toLowerCase().includes(q)
      )
    }
    return list
  }, [skills, sourceFilter, search])

  const toggleExpand = (name: string) => {
    setExpandedSkills((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleRefresh = () => {
    refreshSkills(rootPath ?? undefined)
  }

  const globalCount = skills.filter((s) => s.source === 'global').length
  const projectCount = skills.filter((s) => s.source === 'project').length

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <Sparkles className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Skills</h1>
          {skills.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {skills.length}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          Rafraichir
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 border-b px-6 py-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un skill..."
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {([
            ['all', 'Tous', null],
            ['global', 'Global', globalCount],
            ['project', 'Projet', projectCount]
          ] as const).map(([value, label, count]) => (
            <Button
              key={value}
              variant={sourceFilter === value ? 'default' : 'ghost'}
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => setSourceFilter(value)}
            >
              {label}
              {count != null && count > 0 && (
                <span className="text-[10px] opacity-70">({count})</span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {filteredSkills.length === 0 ? (
          <EmptyState hasSkills={skills.length > 0} />
        ) : (
          <div className="divide-y">
            {filteredSkills.map((skill) => (
              <SkillRow
                key={skill.name}
                skill={skill}
                isExpanded={expandedSkills.has(skill.name)}
                onToggle={() => toggleExpand(skill.name)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── SkillRow ──────────────────────────────────────────

interface SkillRowProps {
  skill: SkillInfo
  isExpanded: boolean
  onToggle: () => void
}

function SkillRow({ skill, isExpanded, onToggle }: SkillRowProps): React.JSX.Element {
  const SourceIcon = skill.source === 'global' ? Globe : FolderOpen
  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronIcon className="size-4 shrink-0 text-muted-foreground" />
        <SourceIcon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{skill.name}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {skill.source}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{skill.description}</p>
        </div>
        {skill.companionFiles.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <FileText className="size-3" />
            {skill.companionFiles.length}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="border-t bg-muted/30 px-6 py-4">
          {/* Location */}
          <div className="mb-3">
            <span className="text-xs font-medium text-muted-foreground">Emplacement</span>
            <p className="mt-0.5 break-all font-mono text-xs text-foreground/70">{skill.location}</p>
          </div>

          {/* Companion files */}
          {skill.companionFiles.length > 0 && (
            <div className="mb-3">
              <span className="text-xs font-medium text-muted-foreground">
                Fichiers ({skill.companionFiles.length})
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {skill.companionFiles.map((f) => (
                  <span
                    key={f}
                    className="inline-flex items-center gap-1 rounded bg-background px-2 py-0.5 font-mono text-[11px] text-foreground/70"
                  >
                    <FileText className="size-3 shrink-0" />
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Content preview */}
          <div>
            <span className="text-xs font-medium text-muted-foreground">Contenu</span>
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 font-mono text-xs leading-relaxed text-foreground/80">
              {skill.content.length > 5000
                ? skill.content.slice(0, 5000) + '\n\n... (tronque)'
                : skill.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────

function EmptyState({ hasSkills }: { hasSkills: boolean }): React.JSX.Element {
  if (hasSkills) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Aucun skill ne correspond au filtre.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <Sparkles className="mx-auto mb-4 size-10 text-muted-foreground/50" />
        <h2 className="mb-2 text-base font-medium">Aucun skill installe</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Les skills sont des dossiers contenant un fichier <code className="rounded bg-muted px-1">SKILL.md</code> avec des instructions pour le LLM.
        </p>
        <div className="space-y-2 text-left text-xs text-muted-foreground">
          <p className="font-medium">Copiez un dossier skill dans :</p>
          <p className="rounded bg-muted p-2 font-mono">~/.multi-llm/skills/&lt;nom-du-skill&gt;/</p>
          <p className="text-muted-foreground/70">ou dans le workspace actif :</p>
          <p className="rounded bg-muted p-2 font-mono">&lt;workspace&gt;/.multi-llm/skills/&lt;nom-du-skill&gt;/</p>
        </div>
      </div>
    </div>
  )
}
