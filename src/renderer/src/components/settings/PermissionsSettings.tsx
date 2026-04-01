import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

interface PermissionRuleInfo {
  id: string
  toolName: string
  ruleContent?: string | null
  behavior: 'allow' | 'deny' | 'ask'
  createdAt: number
}

const TOOL_NAMES = ['bash', 'readFile', 'writeFile', 'FileEdit', 'listFiles', 'GrepTool', 'GlobTool', 'WebFetchTool'] as const
const BEHAVIOR_LABELS: Record<string, string> = { allow: 'Autoriser', deny: 'Refuser', ask: 'Demander' }
const BEHAVIOR_COLORS: Record<string, string> = {
  allow: 'text-green-400',
  deny: 'text-red-400',
  ask: 'text-yellow-400'
}

export function PermissionsSettings() {
  const [rules, setRules] = useState<PermissionRuleInfo[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newTool, setNewTool] = useState<string>('bash')
  const [newContent, setNewContent] = useState('')
  const [newBehavior, setNewBehavior] = useState<'allow' | 'deny' | 'ask'>('allow')

  const loadRules = async () => {
    const data = await window.api.permissionsList() as PermissionRuleInfo[]
    setRules(data)
  }

  useEffect(() => { loadRules() }, [])

  const handleAdd = async () => {
    await window.api.permissionsAdd({
      toolName: newTool,
      ruleContent: newContent.trim() || null,
      behavior: newBehavior
    })
    setNewContent('')
    setShowAdd(false)
    loadRules()
  }

  const handleDelete = async (id: string) => {
    await window.api.permissionsDelete({ id })
    loadRules()
  }

  const handleReset = async () => {
    await window.api.permissionsReset()
    loadRules()
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Permissions des outils</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Controlez quels outils le LLM peut utiliser et dans quelles conditions.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Regles actives</h3>
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/80">
            <Plus className="size-3" /> Ajouter
          </button>
        </div>

        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">Aucune regle configuree</p>
        )}

        {rules.map((rule) => (
          <div key={rule.id} className="flex items-center gap-3 rounded-lg border border-border/40 bg-sidebar px-3 py-2">
            <span className={`text-xs font-mono font-bold ${BEHAVIOR_COLORS[rule.behavior]}`}>
              {BEHAVIOR_LABELS[rule.behavior]}
            </span>
            <span className="text-sm font-medium">{rule.toolName}</span>
            {rule.ruleContent && (
              <span className="text-xs text-muted-foreground font-mono truncate">{rule.ruleContent}</span>
            )}
            <button onClick={() => handleDelete(rule.id)} className="ml-auto rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="space-y-3 rounded-lg border border-border/40 bg-sidebar p-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Outil</label>
              <select value={newTool} onChange={(e) => setNewTool(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                {TOOL_NAMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Pattern</label>
              <input value={newContent} onChange={(e) => setNewContent(e.target.value)} placeholder="npm *, /src/**, *.github.com" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Action</label>
              <select value={newBehavior} onChange={(e) => setNewBehavior(e.target.value as 'allow' | 'deny' | 'ask')} className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                <option value="allow">Autoriser</option>
                <option value="deny">Refuser</option>
                <option value="ask">Demander</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Ajouter</button>
            <button onClick={() => setShowAdd(false)} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium hover:bg-accent/80">Annuler</button>
          </div>
        </div>
      )}

      <button onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground underline">
        Reinitialiser les permissions par defaut
      </button>
    </div>
  )
}
