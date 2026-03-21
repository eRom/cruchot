import { create } from 'zustand'
import type { BardaInfo, BardaImportReport } from '../../../preload/types'

interface BardaStore {
  bardas: BardaInfo[]
  isLoading: boolean

  // Computed — set de namespaces desactives pour le filtrage
  disabledNamespaces: Set<string>

  loadBardas: () => Promise<void>
  importBarda: (filePath: string) => Promise<BardaImportReport>
  toggleBarda: (id: string, isEnabled: boolean) => Promise<void>
  uninstallBarda: (id: string) => Promise<void>
}

export const useBardaStore = create<BardaStore>((set, get) => ({
  bardas: [],
  isLoading: false,
  disabledNamespaces: new Set(),

  loadBardas: async () => {
    set({ isLoading: true })
    try {
      const bardas = await window.api.bardaList()
      const disabled = new Set(bardas.filter(b => !b.isEnabled).map(b => b.namespace))
      set({ bardas, disabledNamespaces: disabled })
    } finally {
      set({ isLoading: false })
    }
  },

  importBarda: async (filePath: string) => {
    const report = await window.api.bardaImport(filePath)
    await get().loadBardas() // refresh list
    return report
  },

  toggleBarda: async (id: string, isEnabled: boolean) => {
    await window.api.bardaToggle(id, isEnabled)
    await get().loadBardas()
  },

  uninstallBarda: async (id: string) => {
    await window.api.bardaUninstall(id)
    await get().loadBardas()
  }
}))
