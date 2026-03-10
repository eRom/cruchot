import { useState, useEffect, useCallback, useMemo } from 'react'
import { UserCircle, Lock, X, FolderOpen, Shield } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useRolesStore, type Role } from '@/stores/roles.store'
import { useProjectsStore } from '@/stores/projects.store'
import { cn } from '@/lib/utils'

const PROJECT_ROLE_ID = '__project__'
const NO_ROLE_ID = '__none__'

interface RoleSelectorProps {
  disabled?: boolean
  className?: string
}

export function RoleSelector({ disabled = false, className }: RoleSelectorProps) {
  const { roles, activeRoleId, setRoles, setActiveRole, setActiveSystemPrompt } = useRolesStore()
  const activeProjectId = useProjectsStore((s) => s.activeProjectId)
  const projects = useProjectsStore((s) => s.projects)

  // Variable form state
  const [showVariablePopover, setShowVariablePopover] = useState(false)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [pendingRoleId, setPendingRoleId] = useState<string | null>(null)

  // Load roles on mount
  useEffect(() => {
    window.api.getRoles().then(setRoles).catch(console.error)
  }, [setRoles])

  // Active project's system prompt
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId]
  )
  const hasProjectRole = !!activeProject?.systemPrompt

  const builtinRoles = useMemo(() => roles.filter((r) => r.isBuiltin), [roles])
  const customRoles = useMemo(() => roles.filter((r) => !r.isBuiltin), [roles])

  const isActive = !!activeRoleId

  // Resolve {{variables}} in system prompt
  const resolveVariables = useCallback(
    (prompt: string, values: Record<string, string>): string => {
      return prompt.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
        return values[varName] ?? match
      })
    },
    []
  )

  // Display label
  const displayLabel = useMemo(() => {
    if (activeRoleId === PROJECT_ROLE_ID) return 'Projet'
    const role = roles.find((r) => r.id === activeRoleId)
    return role?.name ?? 'Role'
  }, [activeRoleId, roles])

  // Handle selection
  const handleValueChange = useCallback(
    (value: string) => {
      if (value === NO_ROLE_ID) {
        setActiveRole(null)
        setActiveSystemPrompt(null)
        return
      }

      if (value === PROJECT_ROLE_ID) {
        setActiveRole(PROJECT_ROLE_ID)
        setActiveSystemPrompt(activeProject?.systemPrompt ?? null)
        return
      }

      const role = roles.find((r) => r.id === value)
      if (!role) return

      // Check if role has variables
      if (role.variables && role.variables.length > 0) {
        setPendingRoleId(value)
        const initial: Record<string, string> = {}
        for (const v of role.variables) {
          initial[v.name] = ''
        }
        setVariableValues(initial)
        setShowVariablePopover(true)
        // Still set the role — variables will be resolved on confirm
        setActiveRole(value)
        setActiveSystemPrompt(role.systemPrompt ?? null)
        return
      }

      setActiveRole(value)
      setActiveSystemPrompt(role.systemPrompt ?? null)
    },
    [roles, activeProject, setActiveRole, setActiveSystemPrompt]
  )

  // Confirm variables
  const handleConfirmVariables = useCallback(() => {
    if (!pendingRoleId) return
    const role = roles.find((r) => r.id === pendingRoleId)
    if (!role?.systemPrompt) return

    const resolved = resolveVariables(role.systemPrompt, variableValues)
    setActiveSystemPrompt(resolved)
    setShowVariablePopover(false)
    setPendingRoleId(null)
  }, [pendingRoleId, roles, variableValues, resolveVariables, setActiveSystemPrompt])

  // Pending role for variable form
  const pendingRole = roles.find((r) => r.id === pendingRoleId)

  // The current select value
  const selectValue = activeRoleId ?? NO_ROLE_ID

  return (
    <>
      <Select
        value={selectValue}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <SelectTrigger
              size="sm"
              className={cn(
                'h-7 w-auto max-w-[160px] gap-1.5 rounded-full border-none px-2.5',
                'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
                'transition-all duration-200 ease-out',
                'focus-visible:ring-1 focus-visible:ring-ring/30',
                'shadow-none hover:shadow-xs',
                isActive && 'bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400',
                disabled && 'opacity-50 cursor-not-allowed',
                className
              )}
            >
              {disabled ? (
                <Lock className="size-3 shrink-0 opacity-60" />
              ) : (
                <UserCircle className={cn('size-3 shrink-0', isActive ? 'opacity-80' : 'opacity-60')} />
              )}
              <SelectValue>
                <span className="truncate text-xs font-medium">
                  {displayLabel}
                </span>
              </SelectValue>
            </SelectTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {disabled ? 'Role verrouille' : 'Role (system prompt)'}
          </TooltipContent>
        </Tooltip>

        <SelectContent
          position="popper"
          side="top"
          align="start"
          sideOffset={8}
          className={cn(
            'min-w-[200px] max-w-[280px]',
            'border-border/50 bg-popover/95 backdrop-blur-xl',
            'shadow-lg shadow-black/10 dark:shadow-black/30'
          )}
        >
          <SelectItem value={NO_ROLE_ID}>
            <span className="text-muted-foreground">Aucun role</span>
          </SelectItem>

          {hasProjectRole && (
            <>
              <SelectSeparator />
              <SelectItem value={PROJECT_ROLE_ID}>
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="size-3 shrink-0 opacity-60" />
                  <span>Role projet</span>
                  {activeProject?.color && (
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{ backgroundColor: activeProject.color }}
                    />
                  )}
                </div>
              </SelectItem>
            </>
          )}

          {builtinRoles.length > 0 && (
            <>
              <SelectSeparator />
              <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Integres
              </div>
              {builtinRoles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{role.name}</span>
                    <Shield className="size-2.5 shrink-0 text-muted-foreground/40" />
                  </div>
                </SelectItem>
              ))}
            </>
          )}

          {customRoles.length > 0 && (
            <>
              <SelectSeparator />
              <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
                Personnalises
              </div>
              {customRoles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  <span className="truncate">{role.name}</span>
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>

      {/* Variable popover overlay */}
      {showVariablePopover && pendingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-background/40 backdrop-blur-sm"
            onClick={() => {
              setShowVariablePopover(false)
              setPendingRoleId(null)
            }}
          />
          <div className="relative w-80 rounded-xl border border-border/60 bg-popover p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">
                Variables — {pendingRole.name}
              </h4>
              <button
                onClick={() => {
                  setShowVariablePopover(false)
                  setPendingRoleId(null)
                }}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="space-y-2.5">
              {pendingRole.variables?.map((v) => (
                <div key={v.name}>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    {`{{${v.name}}}`}
                    {v.description && (
                      <span className="ml-1 font-normal text-muted-foreground/60">
                        — {v.description}
                      </span>
                    )}
                  </label>
                  <input
                    value={variableValues[v.name] ?? ''}
                    onChange={(e) =>
                      setVariableValues((prev) => ({
                        ...prev,
                        [v.name]: e.target.value
                      }))
                    }
                    placeholder={v.description || v.name}
                    className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleConfirmVariables}
              className="mt-3 w-full rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Appliquer
            </button>
          </div>
        </div>
      )}
    </>
  )
}
