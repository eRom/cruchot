import React, { useState, useEffect } from 'react'
import { ArrowLeft, Plus, Trash2, Loader2, CheckCircle, XCircle, Zap } from 'lucide-react'
import { useMcpStore } from '@/stores/mcp.store'
import { useProjectsStore } from '@/stores/projects.store'
import type { McpTransportType } from '../../../../preload/types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface McpServerFormProps {
  serverId?: string | null
  onBack: () => void
}

interface EnvVar {
  key: string
  value: string
}

export function McpServerForm({ serverId, onBack }: McpServerFormProps) {
  const createServer = useMcpStore((s) => s.createServer)
  const updateServer = useMcpStore((s) => s.updateServer)
  const testConnection = useMcpStore((s) => s.testConnection)
  const projects = useProjectsStore((s) => s.projects)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [transportType, setTransportType] = useState<McpTransportType>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [cwd, setCwd] = useState('')
  const [url, setUrl] = useState('')
  const [envVars, setEnvVars] = useState<EnvVar[]>([])
  const [icon, setIcon] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [toolTimeout, setToolTimeout] = useState(30)
  const [autoConfirm, setAutoConfirm] = useState(true)

  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; toolCount: number; toolNames: string[]; error?: string } | null>(null)

  const isEdit = !!serverId

  // Load existing server data
  useEffect(() => {
    if (!serverId) return

    async function loadServer() {
      const server = await window.api.mcpGet(serverId!)
      if (!server) return

      setName(server.name)
      setDescription(server.description ?? '')
      setTransportType(server.transportType)
      setCommand(server.command ?? '')
      setArgs((server.args ?? []).join(' '))
      setCwd(server.cwd ?? '')
      setUrl(server.url ?? '')
      setIcon(server.icon ?? '')
      setProjectId(server.projectId ?? null)
      setToolTimeout((server.toolTimeout ?? 30000) / 1000)
      setAutoConfirm(server.autoConfirm)

      // Load env var keys (values hidden)
      if (server.hasEnvVars) {
        const keys = await window.api.mcpGetEnvKeys(serverId!)
        setEnvVars(keys.map((k) => ({ key: k, value: '' })))
      }
    }
    loadServer()
  }, [serverId])

  const handleAddEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }])
  }

  const handleRemoveEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
  }

  const handleEnvVarChange = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...envVars]
    updated[index] = { ...updated[index], [field]: val }
    setEnvVars(updated)
  }

  const buildEnvVarsPayload = (): Record<string, string> | undefined => {
    const filled = envVars.filter((v) => v.key.trim() && v.value.trim())
    if (filled.length === 0) return undefined
    const result: Record<string, string> = {}
    for (const v of filled) {
      result[v.key.trim()] = v.value.trim()
    }
    return result
  }

  const parseArgs = (): string[] => {
    return args.trim() ? args.trim().split(/\s+/) : []
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await testConnection({
        transportType,
        command: transportType === 'stdio' ? command : undefined,
        args: transportType === 'stdio' ? parseArgs() : undefined,
        cwd: transportType === 'stdio' && cwd ? cwd : undefined,
        url: transportType !== 'stdio' ? url : undefined,
        envVars: buildEnvVarsPayload()
      })
      setTestResult(result)
    } catch (err) {
      setTestResult({ success: false, toolCount: 0, toolNames: [], error: String(err) })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Le nom est requis')
      return
    }
    if (transportType === 'stdio' && !command.trim()) {
      toast.error('La commande est requise pour le transport stdio')
      return
    }
    if ((transportType === 'http' || transportType === 'sse') && !url.trim()) {
      toast.error("L'URL est requise pour le transport HTTP/SSE")
      return
    }

    setSaving(true)
    try {
      const envPayload = buildEnvVarsPayload()
      const data = {
        name: name.trim(),
        description: description.trim() || undefined,
        transportType,
        command: transportType === 'stdio' ? command.trim() : undefined,
        args: transportType === 'stdio' ? parseArgs() : undefined,
        cwd: transportType === 'stdio' && cwd.trim() ? cwd.trim() : undefined,
        url: transportType !== 'stdio' ? url.trim() : undefined,
        envVars: envPayload,
        icon: icon.trim() || undefined,
        projectId,
        toolTimeout: toolTimeout * 1000,
        autoConfirm
      }

      if (isEdit) {
        await updateServer(serverId!, data)
        toast.success('Serveur MCP mis a jour')
      } else {
        await createServer(data)
        toast.success('Serveur MCP cree')
      }
      onBack()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h2 className="text-base font-semibold text-foreground">
          {isEdit ? 'Modifier le serveur MCP' : 'Ajouter un serveur MCP'}
        </h2>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Nom *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          placeholder="GitHub"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          placeholder="Acces aux repos GitHub"
        />
      </div>

      {/* Transport Type */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Transport</label>
        <div className="flex gap-2">
          {(['stdio', 'http', 'sse'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTransportType(t)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                transportType === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* stdio config */}
      {transportType === 'stdio' && (
        <div className="space-y-4 rounded-lg border border-border/40 p-4">
          <h3 className="text-xs font-medium text-muted-foreground">Configuration stdio</h3>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Commande *</label>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary"
              placeholder="npx"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Arguments</label>
            <input
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary"
              placeholder="-y @modelcontextprotocol/server-github"
            />
            <p className="text-[11px] text-muted-foreground">Separes par des espaces</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Repertoire de travail</label>
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary"
              placeholder="/chemin/optionnel"
            />
          </div>
        </div>
      )}

      {/* HTTP/SSE config */}
      {(transportType === 'http' || transportType === 'sse') && (
        <div className="space-y-4 rounded-lg border border-border/40 p-4">
          <h3 className="text-xs font-medium text-muted-foreground">Configuration {transportType.toUpperCase()}</h3>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">URL *</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:border-primary"
              placeholder="https://my-mcp-server.com/mcp"
            />
          </div>
        </div>
      )}

      {/* Environment Variables */}
      <div className="space-y-3 rounded-lg border border-border/40 p-4">
        <h3 className="text-xs font-medium text-muted-foreground">Variables d'environnement</h3>
        {envVars.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={v.key}
              onChange={(e) => handleEnvVarChange(i, 'key', e.target.value)}
              className="w-1/3 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary"
              placeholder="GITHUB_TOKEN"
            />
            <input
              value={v.value}
              onChange={(e) => handleEnvVarChange(i, 'value', e.target.value)}
              type="password"
              className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary"
              placeholder={isEdit && v.key && !v.value ? '(inchange)' : 'valeur'}
            />
            <button
              onClick={() => handleRemoveEnvVar(i)}
              className="rounded-md p-1 text-muted-foreground hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={handleAddEnvVar}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3" />
          Ajouter une variable
        </button>
      </div>

      {/* Options */}
      <div className="space-y-4 rounded-lg border border-border/40 p-4">
        <h3 className="text-xs font-medium text-muted-foreground">Options</h3>

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-foreground w-32">Projet</label>
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="flex-1 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="">Tous les projets (global)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-foreground w-32">Icone</label>
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className="w-20 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm text-center outline-none focus:border-primary"
            placeholder="🐙"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-foreground w-32">Timeout outils</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={toolTimeout}
              onChange={(e) => setToolTimeout(Number(e.target.value))}
              className="w-20 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-primary"
              min={1}
              max={300}
            />
            <span className="text-xs text-muted-foreground">secondes</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-foreground w-32">Confirmation</label>
          <button
            onClick={() => setAutoConfirm(!autoConfirm)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              autoConfirm
                ? 'bg-muted text-muted-foreground'
                : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
            )}
          >
            {autoConfirm ? 'Auto (pas de confirmation)' : 'Confirmation requise'}
          </button>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={cn(
          'rounded-lg border p-3 text-xs',
          testResult.success
            ? 'border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300'
            : 'border-red-500/30 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-300'
        )}>
          <div className="flex items-center gap-2">
            {testResult.success ? <CheckCircle className="size-4" /> : <XCircle className="size-4" />}
            {testResult.success
              ? `Connexion reussie — ${testResult.toolCount} outil${testResult.toolCount > 1 ? 's' : ''} trouve${testResult.toolCount > 1 ? 's' : ''}`
              : `Echec : ${testResult.error}`
            }
          </div>
          {testResult.success && testResult.toolNames.length > 0 && (
            <div className="mt-2 font-mono text-[11px] opacity-80">
              {testResult.toolNames.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          onClick={onBack}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Annuler
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-sm text-foreground hover:bg-accent disabled:opacity-50"
        >
          {testing ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          Tester
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          {isEdit ? 'Mettre a jour' : 'Creer'}
        </button>
      </div>
    </div>
  )
}
