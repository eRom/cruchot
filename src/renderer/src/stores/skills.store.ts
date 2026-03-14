import { create } from 'zustand'
import type { SkillInfo } from '../../../preload/types'

interface SkillsState {
  skills: SkillInfo[]
  loading: boolean
  loadSkills: () => Promise<void>
  refreshSkills: (workspaceRoot?: string) => Promise<void>
}

export const useSkillsStore = create<SkillsState>((set) => ({
  skills: [],
  loading: false,

  loadSkills: async () => {
    set({ loading: true })
    try {
      const skills = await window.api.skillsList()
      set({ skills })
    } catch (err) {
      console.error('[Skills] Failed to load:', err)
    } finally {
      set({ loading: false })
    }
  },

  refreshSkills: async (workspaceRoot?: string) => {
    set({ loading: true })
    try {
      const skills = await window.api.skillsRefresh({ workspaceRoot })
      set({ skills })
    } catch (err) {
      console.error('[Skills] Failed to refresh:', err)
    } finally {
      set({ loading: false })
    }
  }
}))
