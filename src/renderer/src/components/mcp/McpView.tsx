import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Network } from 'lucide-react'
import { useUiStore } from '@/stores/ui.store'
import { useMcpStore } from '@/stores/mcp.store'
import { McpServerCard } from './McpServerCard'
import { McpServerForm } from './McpServerForm'
import { toast } from 'sonner'
import { useBardaStore } from '@/stores/barda.store'

type SubView = 'grid' | 'create' | 'edit'

export function McpView() {
  const setCurrentView = useUiStore((s) => s.setCurrentView)
  const servers = useMcpStore((s) => s.servers)
  const loading = useMcpStore((s) => s.loading)
  const loadServers = useMcpStore((s) => s.loadServers)
  const deleteServer = useMcpStore((s) => s.deleteServer)
  const toggleServer = useMcpStore((s) => s.toggleServer)
  const startServer = useMcpStore((s) => s.startServer)
  const stopServer = useMcpStore((s) => s.stopServer)
  const restartServer = useMcpStore((s) => s.restartServer)
  const handleStatusChange = useMcpStore((s) => s.handleStatusChange)

  const disabledNamespaces = useBardaStore((s) => s.disabledNamespaces)

  const filteredServers = useMemo(
    () => servers.filter((s) => !s.namespace || !disabledNamespaces.has(s.namespace)),
    [servers, disabledNamespaces]
  )

  const [subView, setSubView] = useState<SubView>('grid')
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    loadServers()
  }, [loadServers])

  // Listen for status changes
  useEffect(() => {
    window.api.onMcpStatusChanged(handleStatusChange)
    return () => {
      window.api.offMcpStatusChanged()
    }
  }, [handleStatusChange])

  const handleEdit = (id: string) => {
    setEditingId(id)
    setSubView('edit')
  }

  const handleBack = () => {
    setSubView('grid')
    setEditingId(null)
    loadServers()
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteServer(id)
      toast.success('Serveur MCP supprime')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  const handleToggle = async (id: string) => {
    try {
      await toggleServer(id)
    } catch {
      toast.error('Erreur lors du basculement')
    }
  }

  const handleStart = async (id: string) => {
    try {
      await startServer(id)
      toast.success('Serveur demarre')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur au demarrage')
    }
  }

  const handleStop = async (id: string) => {
    try {
      await stopServer(id)
      toast.success('Serveur arrete')
    } catch {
      toast.error('Erreur')
    }
  }

  const handleRestart = async (id: string) => {
    try {
      await restartServer(id)
      toast.success('Serveur redemarre')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
  }

  // Form views
  if (subView === 'create') {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-2xl">
            <McpServerForm onBack={handleBack} />
          </div>
        </div>
      </div>
    )
  }
  if (subView === 'edit' && editingId) {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto max-w-2xl">
            <McpServerForm serverId={editingId} onBack={handleBack} />
          </div>
        </div>
      </div>
    )
  }

  // Grid view
  const connectedCount = filteredServers.filter((s) => s.status === 'connected').length

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <button
          onClick={() => setCurrentView('chat')}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">Serveurs MCP</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Subheader */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {filteredServers.length === 0
                ? 'Connectez des serveurs MCP pour etendre les capacites du LLM'
                : `${connectedCount} connecte${connectedCount > 1 ? 's' : ''} sur ${filteredServers.length}`
              }
            </p>
            <button
              onClick={() => setSubView('create')}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-3.5" />
              Ajouter
            </button>
          </div>

          {/* Empty state */}
          {filteredServers.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 py-12">
              <Network className="size-10 text-muted-foreground/40" />
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Aucun serveur MCP configure</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Les serveurs MCP donnent au LLM acces a des outils externes (GitHub, fichiers, bases de donnees...)
                </p>
              </div>
              <button
                onClick={() => setSubView('create')}
                className="mt-2 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="size-3.5" />
                Ajouter un serveur
              </button>
            </div>
          )}

          {/* Server grid */}
          {filteredServers.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredServers.map((server) => (
                <McpServerCard
                  key={server.id}
                  server={server}
                  onEdit={handleEdit}
                  onToggle={handleToggle}
                  onRestart={handleRestart}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
