import type { LivePlugin, AvailablePlugin } from './live-plugin.interface'
import { getDatabase } from '../db'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { decryptApiKey, getCredentialKey } from '../services/credential.service'

class LivePluginRegistry {
  private plugins = new Map<string, LivePlugin>()

  register(plugin: LivePlugin): void {
    this.plugins.set(plugin.providerId, plugin)
    console.log(`[LiveRegistry] Registered plugin: ${plugin.displayName} (${plugin.providerId})`)
  }

  get(providerId: string): LivePlugin | null {
    return this.plugins.get(providerId) ?? null
  }

  getAll(): LivePlugin[] {
    return Array.from(this.plugins.values())
  }

  async getAvailablePlugins(): Promise<AvailablePlugin[]> {
    const result: AvailablePlugin[] = []
    for (const plugin of this.plugins.values()) {
      const available = this.hasApiKey(plugin.providerId)
      result.push({
        providerId: plugin.providerId,
        displayName: plugin.displayName,
        modelName: this.getModelName(plugin.providerId),
        available,
        supportsScreenShare: plugin.supportsScreenShare(),
        voices: plugin.getAvailableVoices(),
      })
    }
    return result
  }

  async resolveActivePlugin(): Promise<LivePlugin | null> {
    // Read setting for selected live model
    try {
      const db = getDatabase()
      const row = db.select().from(settings)
        .where(eq(settings.key, 'multi-llm:live-model-id')).get()
      if (row?.value) {
        const providerId = row.value.split('::')[0]
        const plugin = this.plugins.get(providerId)
        if (plugin && this.hasApiKey(providerId)) return plugin
      }
    } catch { /* fallback below */ }

    // Fallback: first available plugin
    for (const plugin of this.plugins.values()) {
      if (this.hasApiKey(plugin.providerId)) return plugin
    }

    return null
  }

  getApiKey(providerId: string): string | null {
    const providerKeyMap: Record<string, string> = {
      gemini: 'google',
      openai: 'openai',
      voxstral: 'mistral',
    }
    const credKey = providerKeyMap[providerId] ?? providerId
    try {
      const db = getDatabase()
      const row = db.select().from(settings)
        .where(eq(settings.key, getCredentialKey(credKey))).get()
      if (!row?.value) return null
      return decryptApiKey(row.value)
    } catch {
      return null
    }
  }

  private hasApiKey(providerId: string): boolean {
    return this.getApiKey(providerId) !== null
  }

  private getModelName(providerId: string): string {
    const modelNames: Record<string, string> = {
      gemini: 'Gemini 3.1 Flash Live',
      openai: 'GPT-4o Realtime',
      voxstral: 'Voxstral Realtime',
    }
    return modelNames[providerId] ?? providerId
  }
}

export const livePluginRegistry = new LivePluginRegistry()
