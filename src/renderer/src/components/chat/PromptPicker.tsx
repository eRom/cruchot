import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronLeft, Search, Sparkles, Puzzle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { usePromptsStore, type Prompt } from '@/stores/prompts.store'
import { cn } from '@/lib/utils'

// ── Regex pour extraire les variables {{nom}} ──────────────────
const VARIABLE_REGEX = /\{\{(\w+)\}\}/g

function extractVariables(content: string): string[] {
  const matches = new Set<string>()
  let match: RegExpExecArray | null
  const regex = new RegExp(VARIABLE_REGEX.source, 'g')
  while ((match = regex.exec(content)) !== null) {
    matches.add(match[1])
  }
  return Array.from(matches)
}

function replaceVariables(content: string, values: Record<string, string>): string {
  return content.replace(VARIABLE_REGEX, (_, name) => values[name] || `{{${name}}}`)
}

// ── Types ─────────────────────────────────────────────────────
interface PromptPickerProps {
  /** Injecte le contenu dans le textarea */
  onInsert: (text: string, mode: 'replace' | 'append') => void
  disabled?: boolean
}

type PickerView = 'list' | 'variables'

const TYPE_ICON = {
  complet: Sparkles,
  complement: Puzzle,
} as const

const TYPE_LABEL = {
  complet: 'Complet',
  complement: 'Complement',
} as const

const TYPE_COLOR = {
  complet: 'text-blue-500',
  complement: 'text-amber-500',
} as const

// ── Composant principal ───────────────────────────────────────
export function PromptPicker({ onInsert, disabled }: PromptPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<PickerView>('list')
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const searchInputRef = useRef<HTMLInputElement>(null)

  const prompts = usePromptsStore((s) => s.prompts)

  // Charger les prompts si pas encore fait
  useEffect(() => {
    if (open && prompts.length === 0) {
      window.api.getPrompts().then((list) => {
        usePromptsStore.getState().setPrompts(list as Prompt[])
      })
    }
  }, [open, prompts.length])

  // Focus search a l'ouverture
  useEffect(() => {
    if (open && view === 'list') {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
  }, [open, view])

  // Reset a la fermeture
  useEffect(() => {
    if (!open) {
      setSearch('')
      setView('list')
      setSelectedPrompt(null)
      setVariableValues({})
    }
  }, [open])

  // Filtrage
  const filtered = useMemo(() => {
    if (!search.trim()) return prompts
    const q = search.toLowerCase()
    return prompts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.tags?.some((t) => t.toLowerCase().includes(q))
    )
  }, [prompts, search])

  // Selection d'un prompt
  const handleSelect = useCallback(
    (prompt: Prompt) => {
      const vars = extractVariables(prompt.content)
      if (vars.length > 0) {
        // Passer au formulaire de variables
        setSelectedPrompt(prompt)
        setVariableValues(Object.fromEntries(vars.map((v) => [v, ''])))
        setView('variables')
      } else {
        // Injection directe
        const mode = prompt.type === 'complement' ? 'append' : 'replace'
        onInsert(prompt.content, mode)
        setOpen(false)
      }
    },
    [onInsert]
  )

  // Validation du formulaire de variables
  const handleVariablesSubmit = useCallback(() => {
    if (!selectedPrompt) return
    const content = replaceVariables(selectedPrompt.content, variableValues)
    const mode = selectedPrompt.type === 'complement' ? 'append' : 'replace'
    onInsert(content, mode)
    setOpen(false)
  }, [selectedPrompt, variableValues, onInsert])

  // Toutes les variables sont remplies ?
  const allFilled = useMemo(
    () => Object.values(variableValues).every((v) => v.trim().length > 0),
    [variableValues]
  )

  const variables = selectedPrompt ? extractVariables(selectedPrompt.content) : []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={disabled}
              className={cn(
                'size-8 rounded-full text-muted-foreground/60',
                'hover:text-foreground hover:bg-muted/60',
                'transition-colors duration-150',
                open && 'text-foreground bg-muted/60'
              )}
            >
              <BookOpen className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Bibliotheque de prompts</TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-80 p-0"
      >
        {view === 'list' ? (
          // ── Vue liste ──────────────────────────────────
          <div className="flex flex-col">
            {/* Header + recherche */}
            <div className="border-b border-border/40 p-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un prompt..."
                  className="h-8 pl-8 text-sm"
                />
              </div>
            </div>

            {/* Liste des prompts */}
            <ScrollArea className="max-h-64">
              <div className="p-1.5">
                {filtered.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground/50">
                    {prompts.length === 0 ? 'Aucun prompt' : 'Aucun resultat'}
                  </div>
                ) : (
                  filtered.map((prompt) => {
                    const effectiveType = prompt.type === 'system' ? 'complet' : prompt.type
                    const Icon = TYPE_ICON[effectiveType] ?? Sparkles
                    const color = TYPE_COLOR[effectiveType] ?? 'text-blue-500'
                    const label = TYPE_LABEL[effectiveType] ?? 'Complet'
                    const vars = extractVariables(prompt.content)

                    return (
                      <button
                        key={prompt.id}
                        onClick={() => handleSelect(prompt)}
                        className={cn(
                          'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left',
                          'transition-colors duration-100',
                          'hover:bg-accent/60'
                        )}
                      >
                        <Icon className={cn('mt-0.5 size-4 shrink-0', color)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {prompt.title}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className={cn('text-[10px] font-medium', color)}>
                              {label}
                            </span>
                            {vars.length > 0 && (
                              <span className="text-[10px] text-muted-foreground/50">
                                {vars.length} variable{vars.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/60">
                            {prompt.content.slice(0, 80)}
                          </p>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        ) : (
          // ── Vue variables ──────────────────────────────
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2.5">
              <button
                onClick={() => setView('list')}
                className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="truncate text-sm font-medium">
                {selectedPrompt?.title}
              </span>
            </div>

            {/* Formulaire */}
            <div className="p-3 space-y-3">
              <p className="text-xs text-muted-foreground/60">
                Remplis les variables pour personnaliser le prompt :
              </p>
              {variables.map((varName) => {
                // Chercher la description dans les variables du prompt
                const varMeta = selectedPrompt?.variables?.find(
                  (v) => v.name === varName
                )
                return (
                  <div key={varName} className="space-y-1">
                    <label className="text-xs font-medium text-foreground/80">
                      {varName}
                    </label>
                    {varMeta?.description && (
                      <p className="text-[10px] text-muted-foreground/50">
                        {varMeta.description}
                      </p>
                    )}
                    <Input
                      value={variableValues[varName] ?? ''}
                      onChange={(e) =>
                        setVariableValues((prev) => ({
                          ...prev,
                          [varName]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && allFilled) {
                          e.preventDefault()
                          handleVariablesSubmit()
                        }
                      }}
                      placeholder={varMeta?.description || `Valeur pour ${varName}`}
                      className="h-8 text-sm"
                      autoFocus={variables[0] === varName}
                    />
                  </div>
                )
              })}
              <Button
                onClick={handleVariablesSubmit}
                disabled={!allFilled}
                className="w-full"
                size="sm"
              >
                Inserer le prompt
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
