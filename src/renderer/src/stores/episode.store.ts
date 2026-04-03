import { create } from 'zustand'
import type { Episode, EpisodeStats } from '../../../preload/types'

interface EpisodeState {
  episodes: Episode[]
  stats: EpisodeStats | null
  isLoaded: boolean

  loadEpisodes: () => Promise<void>
  loadStats: () => Promise<void>
  toggleEpisode: (id: string) => Promise<void>
  deleteEpisode: (id: string) => Promise<void>
  deleteAllEpisodes: () => Promise<void>
  setModel: (modelId: string) => Promise<void>
  extractNow: (conversationId: string) => Promise<number>
}

export const useEpisodeStore = create<EpisodeState>((set) => ({
  episodes: [],
  stats: null,
  isLoaded: false,

  loadEpisodes: async () => {
    const episodes = await window.api.listEpisodes()
    set({ episodes, isLoaded: true })
  },

  loadStats: async () => {
    const stats = await window.api.episodeStats()
    set({ stats })
  },

  toggleEpisode: async (id) => {
    await window.api.toggleEpisode(id)
    const episodes = await window.api.listEpisodes()
    set({ episodes })
  },

  deleteEpisode: async (id) => {
    await window.api.deleteEpisode(id)
    const episodes = await window.api.listEpisodes()
    const stats = await window.api.episodeStats()
    set({ episodes, stats })
  },

  deleteAllEpisodes: async () => {
    await window.api.deleteAllEpisodes()
    set({ episodes: [], stats: { total: 0, active: 0, categories: {}, modelId: null } })
  },

  setModel: async (modelId) => {
    await window.api.setEpisodeModel({ modelId })
    const stats = await window.api.episodeStats()
    set({ stats })
  },

  extractNow: async (conversationId) => {
    const result = await window.api.extractEpisodesNow(conversationId)
    const episodes = await window.api.listEpisodes()
    const stats = await window.api.episodeStats()
    set({ episodes, stats })
    return result.extracted
  }
}))
