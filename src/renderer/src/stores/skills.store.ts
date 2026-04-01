import { create } from 'zustand'
import type { SkillInfo } from '../../../preload/types'

interface SkillsStore {
  skills: SkillInfo[]
  isLoading: boolean

  loadSkills: () => Promise<void>
  toggleSkill: (id: string, enabled: boolean) => Promise<void>
  uninstallSkill: (id: string) => Promise<void>
}

export const useSkillsStore = create<SkillsStore>((set, get) => ({
  skills: [],
  isLoading: false,

  loadSkills: async () => {
    set({ isLoading: true })
    try {
      const skills = await window.api.skillsList()
      set({ skills })
    } finally {
      set({ isLoading: false })
    }
  },

  toggleSkill: async (id: string, enabled: boolean) => {
    await window.api.skillsToggle(id, enabled)
    await get().loadSkills()
  },

  uninstallSkill: async (id: string) => {
    await window.api.skillsUninstall(id)
    await get().loadSkills()
  }
}))
