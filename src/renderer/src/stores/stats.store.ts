import { create } from 'zustand'

export interface DailyStat {
  date: string
  cost: number
  messages: number
  tokens: number
}

export interface ProviderStat {
  provider: string
  cost: number
  messages: number
}

export interface ModelStat {
  model: string
  provider: string
  messages: number
  tokens: number
}

export type StatsPeriod = '7d' | '30d' | '90d' | 'all'

interface StatsState {
  dailyStats: DailyStat[]
  providerStats: ProviderStat[]
  modelStats: ModelStat[]
  totalCost: number
  selectedPeriod: StatsPeriod
  isLoading: boolean
  error: string | null

  setSelectedPeriod: (period: StatsPeriod) => void
  loadStats: () => Promise<void>
}

export const useStatsStore = create<StatsState>((set) => ({
  dailyStats: [],
  providerStats: [],
  modelStats: [],
  totalCost: 0,
  selectedPeriod: '30d',
  isLoading: false,
  error: null,

  setSelectedPeriod: (selectedPeriod) => set({ selectedPeriod }),

  loadStats: async () => {
    set({ isLoading: true, error: null })

    try {
      const [rawDaily, rawProviders, rawModels, rawTotal] = await Promise.all([
        window.api.getDailyStats(),
        window.api.getProviderStats(),
        window.api.getModelStats(),
        window.api.getTotalCost()
      ])

      // Map from IPC types to store types
      const dailyStats: DailyStat[] = (rawDaily ?? []).map((d) => ({
        date: d.date,
        cost: d.totalCost ?? 0,
        messages: d.messagesCount ?? 0,
        tokens: (d.tokensIn ?? 0) + (d.tokensOut ?? 0)
      }))

      const providerStats: ProviderStat[] = (rawProviders ?? []).map((p) => ({
        provider: p.providerId ?? 'unknown',
        cost: p.totalCost ?? 0,
        messages: p.messagesCount ?? 0
      }))

      const modelStats: ModelStat[] = (rawModels ?? []).map((m) => ({
        model: m.modelId ?? 'unknown',
        provider: m.providerId ?? 'unknown',
        messages: m.messagesCount ?? 0,
        tokens: (m.tokensIn ?? 0) + (m.tokensOut ?? 0)
      }))

      const totalCost = rawTotal?.totalCost ?? 0

      set({
        dailyStats,
        providerStats,
        modelStats,
        totalCost,
        isLoading: false
      })
    } catch (error) {
      console.error('[Stats] Failed to load statistics:', error)
      set({
        dailyStats: [],
        providerStats: [],
        modelStats: [],
        totalCost: 0,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load statistics'
      })
    }
  }
}))
