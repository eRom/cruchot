import { useState, useEffect } from 'react'
import { Plug } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import type { McpServerInfo } from '../../../../../preload/types'

export function McpSection() {
  const [servers, setServers] = useState<McpServerInfo[]>([])

  useEffect(() => {
    window.api.mcpList().then(setServers).catch(() => {})
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
    <CollapsibleSection title="MCP" icon={Plug} defaultOpen>
      {servers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun serveur MCP</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
          {servers.map((server) => (
            <div key={server.id} className="flex items-center gap-2 py-1.5">
              <span
                className={`size-2 rounded-full shrink-0 ${
                  server.status === 'connected' ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                }`}
              />
              <span className="flex-1 truncate text-sm">{server.name}</span>
              <button
                type="button"
                role="switch"
                aria-checked={server.isEnabled}
                onClick={() => handleToggle(server.id)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  server.isEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`pointer-events-none block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform ${
                    server.isEnabled ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
}
