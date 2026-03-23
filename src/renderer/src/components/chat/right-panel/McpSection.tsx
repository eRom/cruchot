import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { CollapsibleSection } from './CollapsibleSection'
import type { McpServerInfo } from '../../../../../preload/types'

export function McpSection() {
  const [servers, setServers] = useState<McpServerInfo[]>([])

  useEffect(() => {
    let cancelled = false
    window.api.mcpList()
      .then((list) => { if (!cancelled) setServers(list) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleToggle = async (id: string) => {
    try {
      const updated = await window.api.mcpToggle(id)
      if (updated) {
        setServers((prev) =>
          prev.map((s) => (s.id === id ? { ...s, isEnabled: updated.isEnabled, status: updated.status } : s))
        )
      }
    } catch {
      // ignore
    }
  }

  return (
    <CollapsibleSection title="MCP" defaultOpen={false}>
      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground/60">Aucun serveur MCP</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
          {servers.map((server) => (
            <div key={server.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5">
              <span
                className={`size-2 rounded-full shrink-0 ${
                  server.status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                }`}
              />
              <span className="flex-1 truncate text-sm text-foreground/80">{server.name}</span>
              <Switch
                checked={server.isEnabled}
                onCheckedChange={() => handleToggle(server.id)}
              />
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}
