import { Button } from '@/components/ui/button'
import type { AllowedApp } from '../../../../preload/types'
import { AppWindow, ExternalLink, Globe, Monitor, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'

type SubView = 'list' | 'create' | 'edit'

export function ApplicationsView(): React.JSX.Element {
  const [apps, setApps] = useState<AllowedApp[]>([])
  const [subView, setSubView] = useState<SubView>('list')
  const [editingApp, setEditingApp] = useState<AllowedApp | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [type, setType] = useState<'local' | 'web'>('local')
  const [description, setDescription] = useState('')

  const loadApps = useCallback(async () => {
    try {
      const list = await window.api.applicationsList()
      setApps(list)
    } catch (err: unknown) {
      console.error('Failed to load apps:', err)
    }
  }, [])

  useEffect(() => {
    loadApps()
  }, [loadApps])

  const resetForm = () => {
    setName('')
    setPath('')
    setType('local')
    setDescription('')
    setEditingApp(null)
  }

  const handleCreate = () => {
    resetForm()
    setSubView('create')
  }

  const handleEdit = (app: AllowedApp) => {
    setName(app.name)
    setPath(app.path)
    setType(app.type)
    setDescription(app.description ?? '')
    setEditingApp(app)
    setSubView('edit')
  }

  const handleSave = async () => {
    if (!name.trim() || !path.trim()) {
      toast.error('Nom et chemin sont requis')
      return
    }

    try {
      if (subView === 'edit' && editingApp) {
        await window.api.applicationsUpdate({
          id: editingApp.id,
          name: name.trim(),
          path: path.trim(),
          type,
          description: description.trim() || null
        })
        toast.success('Application mise a jour')
      } else {
        await window.api.applicationsCreate({
          name: name.trim(),
          path: path.trim(),
          type,
          description: description.trim() || undefined
        })
        toast.success('Application ajoutee')
      }
      resetForm()
      setSubView('list')
      loadApps()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur'
      toast.error(message)
    }
  }

  const handleDelete = async (app: AllowedApp) => {
    try {
      await window.api.applicationsDelete(app.id)
      toast.success(`${app.name} supprimee`)
      loadApps()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur'
      toast.error(message)
    }
  }

  const handleToggle = async (app: AllowedApp, enabled: boolean) => {
    try {
      await window.api.applicationsToggle(app.id, enabled)
      loadApps()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur'
      toast.error(message)
    }
  }

  const handleOpen = async (app: AllowedApp) => {
    try {
      await window.api.applicationsOpen(app.id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur'
      toast.error(message)
    }
  }

  const handleBrowseLocal = async () => {
    try {
      const files = await window.api.filePick()
      if (files && files.length > 0) {
        setPath(files[0].path)
        if (!name.trim()) {
          // Auto-fill name from filename
          const filename = files[0].path.split('/').pop() ?? ''
          setName(filename.replace(/\.app$/, ''))
        }
      }
    } catch {
      // User cancelled
    }
  }

  // ── Create / Edit form ─────────────────────────────────────
  if (subView === 'create' || subView === 'edit') {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
          <div className="mx-auto max-w-4xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {subView === 'edit' ? 'Modifier l\'application' : 'Ajouter une application'}
            </h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-4xl space-y-6">
            {/* Type selector */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setType('local')}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                    type === 'local'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <Monitor className="size-4" />
                  Application locale
                </button>
                <button
                  onClick={() => setType('web')}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                    type === 'web'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <Globe className="size-4" />
                  Site web
                </button>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Nom</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type === 'local' ? 'Ex: Zed, Terminal, Slack' : 'Ex: Gmail, GitHub, Notion'}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              />
            </div>

            {/* Path */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                {type === 'local' ? 'Chemin' : 'URL'}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder={type === 'local' ? '/Applications/Zed.app' : 'https://mail.google.com'}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                />
                {type === 'local' && (
                  <Button variant="outline" size="sm" onClick={handleBrowseLocal} className="shrink-0">
                    Parcourir
                  </Button>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">
                Description <span className="text-muted-foreground">(optionnelle — aide le Live a reconnaitre l'app)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Mes emails professionnels, Editeur de code principal"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleSave} className="gap-2">
                {subView === 'edit' ? 'Enregistrer' : 'Ajouter'}
              </Button>
              <Button variant="ghost" onClick={() => { resetForm(); setSubView('list') }}>
                Annuler
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/40 px-8 pb-5 pt-8">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Applications
              </h1>
              <p className="mt-1 text-sm text-muted-foreground/70">
                Gerez les applications autorisees. Utilisez <code className="rounded bg-muted px-1 py-0.5 text-xs">/open nom</code> ou demandez au Live de les ouvrir.
              </p>
            </div>
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="size-4" />
              Ajouter
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-4xl">
          {apps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AppWindow className="mb-4 size-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Aucune application configuree</p>
              <p className="mt-1 text-xs text-muted-foreground/50">
                Ajoutez des applications locales ou des sites web
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {apps.map((app) => (
                <div
                  key={app.id}
                  className="group flex items-center gap-4 rounded-lg border border-border/40 bg-sidebar px-4 py-3 transition-colors hover:border-border"
                >
                  {/* Icon */}
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/50">
                    {app.type === 'web' ? (
                      <Globe className="size-4 text-blue-400" />
                    ) : (
                      <Monitor className="size-4 text-green-400" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{app.name}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        {app.type}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground/70">
                      {app.description || app.path}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => handleOpen(app)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Ouvrir"
                    >
                      <ExternalLink className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleEdit(app)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Modifier"
                    >
                      <AppWindow className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(app)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                      title="Supprimer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  {/* Toggle */}
                  <Switch
                    checked={app.isEnabled}
                    onCheckedChange={(checked) => handleToggle(app, checked)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
